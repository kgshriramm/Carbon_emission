const db = require("../config/db");

const DEFAULT_CALCULATION_VERSION = "v1";

function round(value, decimals = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return n;
  }
  return Number(n.toFixed(decimals));
}

function toNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return n;
}

function asPositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return n;
}

async function assertCompanyAccess(client, userId, companyId) {
  const { rows } = await client.query(
    `
    SELECT 1
    FROM company_users
    WHERE user_id = $1 AND company_id = $2
    LIMIT 1
    `,
    [userId, companyId]
  );

  if (!rows[0]) {
    const error = new Error("Forbidden: you do not have access to this company");
    error.statusCode = 403;
    throw error;
  }
}

function validatePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body is required");
  }

  const requiredIds = ["companyId", "productId", "reportingPeriodId"];
  requiredIds.forEach((field) => {
    if (!payload[field]) {
      throw new Error(`${field} is required`);
    }
  });

  if (!payload.userId) {
    throw new Error("userId is required");
  }

  const hasInlineActivities = Array.isArray(payload.activities) && payload.activities.length > 0;
  if (!hasInlineActivities && payload.useStoredActivityData !== true) {
    throw new Error("Provide activities array or set useStoredActivityData=true");
  }

  if (hasInlineActivities) {
    payload.activities.forEach((activity, index) => {
      if (!activity.activityType) {
        throw new Error(`activities[${index}].activityType is required`);
      }
      if (activity.quantity === undefined || activity.quantity === null) {
        throw new Error(`activities[${index}].quantity is required`);
      }
      if (!activity.unit) {
        throw new Error(`activities[${index}].unit is required`);
      }
    });
  }
}

async function resolveFactor(client, { activityType, unit, geographyCode, periodDate }) {
  const effectiveDate = periodDate || new Date().toISOString().slice(0, 10);
  const geo = geographyCode || "GLOBAL";

  const query = `
    SELECT id, factor_key, activity_type, geography_code, unit, factor_value, factor_unit,
           source, source_reference, version, valid_from, valid_to
    FROM emission_factors
    WHERE activity_type = $1
      AND unit = $2
      AND is_active = TRUE
      AND valid_from <= $3::date
      AND (valid_to IS NULL OR valid_to >= $3::date)
      AND geography_code IN ($4, 'GLOBAL')
    ORDER BY
      CASE WHEN geography_code = $4 THEN 0 ELSE 1 END,
      valid_from DESC,
      created_at DESC
    LIMIT 1
  `;

  const { rows } = await client.query(query, [activityType, unit, effectiveDate, geo]);
  if (!rows[0]) {
    throw new Error(`No emission factor found for activityType=${activityType}, unit=${unit}, geography=${geo}`);
  }

  return rows[0];
}

function computeActivityEmission(activity, factor) {
  const quantity = toNumber(activity.quantity, "quantity");
  if (quantity < 0) {
    throw new Error("quantity must be >= 0");
  }

  const metadata = activity.metadata || {};
  const oxidationFactor = metadata.oxidationFactor !== undefined
    ? toNumber(metadata.oxidationFactor, "oxidationFactor")
    : 1;
  const conversionFactor = metadata.conversionFactor !== undefined
    ? toNumber(metadata.conversionFactor, "conversionFactor")
    : 1;

  const factorValue = toNumber(factor.factor_value, "factor_value");
  const totalCo2eKg = round(quantity * factorValue * oxidationFactor * conversionFactor, 6);

  return {
    quantity: round(quantity, 6),
    oxidationFactor,
    conversionFactor,
    factorValue: round(factorValue, 10),
    totalCo2eKg
  };
}

async function insertCalculation(client, payload, activity, factor, result) {
  const factorSnapshot = {
    id: factor.id,
    factorKey: factor.factor_key,
    activityType: factor.activity_type,
    geographyCode: factor.geography_code,
    unit: factor.unit,
    factorValue: factor.factor_value,
    factorUnit: factor.factor_unit,
    source: factor.source,
    sourceReference: factor.source_reference,
    version: factor.version,
    validFrom: factor.valid_from,
    validTo: factor.valid_to
  };

  const inputSnapshot = {
    activityType: activity.activityType,
    quantity: result.quantity,
    unit: activity.unit,
    geographyCode: activity.geographyCode || "GLOBAL",
    metadata: activity.metadata || {},
    periodDate: payload.periodDate || null
  };

  const insertQuery = `
    INSERT INTO emission_calculations (
      company_id, factory_id, product_id, reporting_period_id, activity_data_id,
      emission_factor_id, activity_type, quantity, quantity_unit,
      factor_value, factor_unit, total_co2e_kg,
      calculation_method, formula, calculation_version,
      factor_snapshot, input_snapshot, created_by
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15,
      $16::jsonb, $17::jsonb, $18
    )
    RETURNING id, created_at
  `;

  const values = [
    payload.companyId,
    payload.factoryId || null,
    payload.productId,
    payload.reportingPeriodId,
    activity.activityDataId || null,
    factor.id,
    activity.activityType,
    result.quantity,
    activity.unit,
    result.factorValue,
    factor.factor_unit,
    result.totalCo2eKg,
    "activity_x_factor",
    "CO2e = activity_data * emission_factor * oxidation_factor * conversion_factor",
    payload.calculationVersion || DEFAULT_CALCULATION_VERSION,
    JSON.stringify(factorSnapshot),
    JSON.stringify(inputSnapshot),
    payload.userId
  ];

  const { rows } = await client.query(insertQuery, values);
  return rows[0];
}

function buildSummary(lineItems, productionQuantity) {
  const totalCo2eKg = round(lineItems.reduce((sum, item) => sum + item.totalCo2eKg, 0), 6);
  const directCo2eKg = round(
    lineItems
      .filter((item) => item.activityType !== "electricity_kwh")
      .reduce((sum, item) => sum + item.totalCo2eKg, 0),
    6
  );
  const indirectCo2eKg = round(
    lineItems
      .filter((item) => item.activityType === "electricity_kwh")
      .reduce((sum, item) => sum + item.totalCo2eKg, 0),
    6
  );

  const emissionPerUnit = productionQuantity > 0
    ? round(totalCo2eKg / productionQuantity, 10)
    : null;

  return {
    totalCo2eKg,
    directCo2eKg,
    indirectCo2eKg,
    emissionPerUnit
  };
}

async function getActivitiesForCalculation(client, payload) {
  const hasInlineActivities = Array.isArray(payload.activities) && payload.activities.length > 0;
  if (hasInlineActivities) {
    return payload.activities;
  }

  const filters = [
    asPositiveInt(payload.companyId, "companyId"),
    asPositiveInt(payload.productId, "productId"),
    asPositiveInt(payload.reportingPeriodId, "reportingPeriodId")
  ];

  let factoryClause = "";
  if (payload.factoryId) {
    filters.push(asPositiveInt(payload.factoryId, "factoryId"));
    factoryClause = ` AND factory_id = $${filters.length}`;
  }

  const { rows } = await client.query(
    `
      SELECT id, activity_type, quantity, unit, metadata
      FROM activity_data
      WHERE company_id = $1
        AND product_id = $2
        AND reporting_period_id = $3
        ${factoryClause}
      ORDER BY created_at ASC
    `,
    filters
  );

  if (rows.length === 0) {
    throw new Error("No stored activity_data found for the provided company/product/period");
  }

  return rows.map((row) => {
    const metadata = row.metadata || {};
    return {
      activityDataId: Number(row.id),
      activityType: row.activity_type,
      quantity: toNumber(row.quantity, "quantity"),
      unit: row.unit,
      geographyCode: metadata.geographyCode || payload.geographyCode || "GLOBAL",
      metadata
    };
  });
}

async function calculateAndStoreEmissions(payload) {
  validatePayload(payload);

  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const companyId = asPositiveInt(payload.companyId, "companyId");
    const userId = asPositiveInt(payload.userId, "userId");
    await assertCompanyAccess(client, userId, companyId);

    const productionQuantity = payload.productionQuantity !== undefined
      ? toNumber(payload.productionQuantity, "productionQuantity")
      : 0;

    const activities = await getActivitiesForCalculation(client, payload);
    const lineItems = [];

    for (const activity of activities) {
      const factor = await resolveFactor(client, {
        activityType: activity.activityType,
        unit: activity.unit,
        geographyCode: activity.geographyCode,
        periodDate: payload.periodDate
      });

      const result = computeActivityEmission(activity, factor);
      const inserted = await insertCalculation(client, payload, activity, factor, result);

      lineItems.push({
        calculationId: Number(inserted.id),
        activityDataId: activity.activityDataId || null,
        createdAt: inserted.created_at,
        activityType: activity.activityType,
        quantity: result.quantity,
        unit: activity.unit,
        factorId: Number(factor.id),
        factorVersion: factor.version,
        factorSource: factor.source,
        geographyCode: factor.geography_code,
        totalCo2eKg: result.totalCo2eKg
      });
    }

    const summary = buildSummary(lineItems, productionQuantity);

    await client.query("COMMIT");

    return {
      companyId,
      productId: Number(payload.productId),
      reportingPeriodId: Number(payload.reportingPeriodId),
      productionQuantity: round(productionQuantity, 6),
      productionUnit: payload.productionUnit || null,
      usedStoredActivityData: !Array.isArray(payload.activities) || payload.activities.length === 0,
      ...summary,
      lineItems
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createActivityData(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body is required");
  }

  const companyId = asPositiveInt(payload.companyId, "companyId");
  const productId = asPositiveInt(payload.productId, "productId");
  const reportingPeriodId = asPositiveInt(payload.reportingPeriodId, "reportingPeriodId");
  const userId = asPositiveInt(payload.userId, "userId");

  if (!payload.activityType) {
    throw new Error("activityType is required");
  }
  if (payload.quantity === undefined || payload.quantity === null) {
    throw new Error("quantity is required");
  }
  if (!payload.unit) {
    throw new Error("unit is required");
  }

  const quantity = toNumber(payload.quantity, "quantity");
  if (quantity < 0) {
    throw new Error("quantity must be >= 0");
  }

  const client = await db.getClient();
  try {
    await assertCompanyAccess(client, userId, companyId);

    const metadata = payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {};

    const { rows } = await client.query(
      `
      INSERT INTO activity_data (
        company_id, factory_id, product_id, reporting_period_id,
        activity_type, quantity, unit, metadata, source_note, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      RETURNING id, company_id, factory_id, product_id, reporting_period_id,
                activity_type, quantity, unit, metadata, source_note, created_by, created_at
    `,
      [
        companyId,
        payload.factoryId ? asPositiveInt(payload.factoryId, "factoryId") : null,
        productId,
        reportingPeriodId,
        payload.activityType,
        round(quantity, 6),
        payload.unit,
        JSON.stringify(metadata),
        payload.sourceNote || null,
        userId
      ]
    );

    return rows[0];
  } finally {
    client.release();
  }
}

async function getCalculationById(id, userId) {
  const calcId = asPositiveInt(id, "id");
  const uid = asPositiveInt(userId, "userId");

  const { rows } = await db.query(
    `
      SELECT ec.id, ec.company_id, ec.product_id, ec.reporting_period_id,
             ec.activity_type, ec.quantity, ec.quantity_unit,
             ec.factor_value, ec.factor_unit, ec.total_co2e_kg,
             ec.calculation_method, ec.formula, ec.calculation_version,
             ec.factor_snapshot, ec.input_snapshot, ec.created_at
      FROM emission_calculations ec
      JOIN company_users cu ON cu.company_id = ec.company_id
      WHERE ec.id = $1 AND cu.user_id = $2
      LIMIT 1
    `,
    [calcId, uid]
  );

  return rows[0] || null;
}

module.exports = {
  calculateAndStoreEmissions,
  createActivityData,
  getCalculationById
};
