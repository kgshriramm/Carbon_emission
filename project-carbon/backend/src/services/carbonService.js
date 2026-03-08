const db = require("../config/db");

const DEFAULT_CALCULATION_VERSION = "v1";

function toNumber(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${fieldName} must be a valid number`);
  }
  return n;
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

  if (!Array.isArray(payload.activities) || payload.activities.length === 0) {
    throw new Error("activities must be a non-empty array");
  }

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
  const totalCo2eKg = quantity * factorValue * oxidationFactor * conversionFactor;

  return {
    quantity,
    oxidationFactor,
    conversionFactor,
    factorValue,
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
    quantity: activity.quantity,
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
    payload.userId || null
  ];

  const { rows } = await client.query(insertQuery, values);
  return rows[0];
}

function buildSummary(lineItems, productionQuantity) {
  const totalCo2eKg = lineItems.reduce((sum, item) => sum + item.totalCo2eKg, 0);
  const directCo2eKg = lineItems
    .filter((item) => item.activityType !== "electricity_kwh")
    .reduce((sum, item) => sum + item.totalCo2eKg, 0);
  const indirectCo2eKg = lineItems
    .filter((item) => item.activityType === "electricity_kwh")
    .reduce((sum, item) => sum + item.totalCo2eKg, 0);

  const emissionPerUnit = productionQuantity > 0
    ? totalCo2eKg / productionQuantity
    : null;

  return {
    totalCo2eKg,
    directCo2eKg,
    indirectCo2eKg,
    emissionPerUnit
  };
}

async function calculateAndStoreEmissions(payload) {
  validatePayload(payload);

  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const productionQuantity = payload.productionQuantity !== undefined
      ? toNumber(payload.productionQuantity, "productionQuantity")
      : 0;

    const lineItems = [];

    for (const activity of payload.activities) {
      const factor = await resolveFactor(client, {
        activityType: activity.activityType,
        unit: activity.unit,
        geographyCode: activity.geographyCode,
        periodDate: payload.periodDate
      });

      const result = computeActivityEmission(activity, factor);
      const inserted = await insertCalculation(client, payload, activity, factor, result);

      lineItems.push({
        calculationId: inserted.id,
        createdAt: inserted.created_at,
        activityType: activity.activityType,
        quantity: result.quantity,
        unit: activity.unit,
        factorId: factor.id,
        factorVersion: factor.version,
        factorSource: factor.source,
        geographyCode: factor.geography_code,
        totalCo2eKg: result.totalCo2eKg
      });
    }

    const summary = buildSummary(lineItems, productionQuantity);

    await client.query("COMMIT");

    return {
      companyId: payload.companyId,
      productId: payload.productId,
      reportingPeriodId: payload.reportingPeriodId,
      productionQuantity,
      productionUnit: payload.productionUnit || null,
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

async function getCalculationById(id) {
  const { rows } = await db.query(
    `
      SELECT id, company_id, product_id, reporting_period_id,
             activity_type, quantity, quantity_unit,
             factor_value, factor_unit, total_co2e_kg,
             calculation_method, formula, calculation_version,
             factor_snapshot, input_snapshot, created_at
      FROM emission_calculations
      WHERE id = $1
    `,
    [id]
  );

  return rows[0] || null;
}

module.exports = {
  calculateAndStoreEmissions,
  getCalculationById
};
