const db = require("../config/db");

function asPositiveInt(value, fieldName) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return n;
}

function round(value, decimals = 6) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return n;
  }
  return Number(n.toFixed(decimals));
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

async function getReportMonthlyLimit(client, companyId) {
  const { rows } = await client.query(
    `
    SELECT p.features_json
    FROM subscriptions s
    JOIN plans p ON p.id = s.plan_id
    WHERE s.company_id = $1
      AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1
    `,
    [companyId]
  );

  if (!rows[0] || !rows[0].features_json) {
    return null;
  }

  const features = rows[0].features_json;
  const limit = Number(features.reports_per_month);
  return Number.isFinite(limit) ? limit : null;
}

async function enforceReportMonthlyEntitlement(client, companyId) {
  const monthlyLimit = await getReportMonthlyLimit(client, companyId);
  if (monthlyLimit === null) {
    return;
  }

  const usageResult = await client.query(
    `
    SELECT COUNT(*)::int AS count
    FROM reports
    WHERE company_id = $1
      AND created_at >= date_trunc('month', NOW())
      AND created_at < date_trunc('month', NOW()) + interval '1 month'
    `,
    [companyId]
  );

  const used = Number(usageResult.rows[0].count || 0);
  if (used >= monthlyLimit) {
    const error = new Error(`Monthly report limit reached (${used}/${monthlyLimit})`);
    error.statusCode = 402;
    throw error;
  }
}

async function generateReport(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Request body is required");
  }

  const companyId = asPositiveInt(payload.companyId, "companyId");
  const reportingPeriodId = asPositiveInt(payload.reportingPeriodId, "reportingPeriodId");
  const userId = asPositiveInt(payload.userId, "userId");
  const reportType = (payload.reportType || "cbam_transitional").trim();

  const client = await db.getClient();
  try {
    await client.query("BEGIN");
    await assertCompanyAccess(client, userId, companyId);
    await enforceReportMonthlyEntitlement(client, companyId);

    const calcFilters = [companyId, reportingPeriodId];
    let productFilterSql = "";
    let productId = null;

    if (payload.productId !== undefined && payload.productId !== null) {
      productId = asPositiveInt(payload.productId, "productId");
      calcFilters.push(productId);
      productFilterSql = ` AND ec.product_id = $${calcFilters.length}`;
    }

    const calcResult = await client.query(
      `
      SELECT ec.id, ec.product_id, ec.total_co2e_kg
      FROM emission_calculations ec
      WHERE ec.company_id = $1
        AND ec.reporting_period_id = $2
        ${productFilterSql}
      ORDER BY ec.id ASC
      `,
      calcFilters
    );

    if (calcResult.rows.length === 0) {
      throw new Error("No emission calculations found for the provided filters");
    }

    const totalEmissionsKg = round(
      calcResult.rows.reduce((sum, row) => sum + Number(row.total_co2e_kg), 0),
      6
    );

    let productionQuantity = null;
    if (payload.productionQuantity !== undefined && payload.productionQuantity !== null) {
      productionQuantity = Number(payload.productionQuantity);
      if (!Number.isFinite(productionQuantity) || productionQuantity <= 0) {
        throw new Error("productionQuantity must be a positive number when provided");
      }
      productionQuantity = round(productionQuantity, 6);
    }

    const emissionPerUnit = productionQuantity
      ? round(totalEmissionsKg / productionQuantity, 10)
      : null;

    const reportVersionResult = await client.query(
      `
      SELECT COALESCE(MAX(report_version), 0) + 1 AS next_version
      FROM reports
      WHERE company_id = $1
        AND reporting_period_id = $2
        AND report_type = $3
      `,
      [companyId, reportingPeriodId, reportType]
    );

    const reportVersion = Number(reportVersionResult.rows[0].next_version);

    const reportInsert = await client.query(
      `
      INSERT INTO reports (
        company_id, reporting_period_id, report_type, report_version,
        status, total_emissions_kg, emission_per_unit,
        production_quantity, production_unit,
        generated_at, generated_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10)
      RETURNING id, company_id, reporting_period_id, report_type, report_version,
                status, total_emissions_kg, emission_per_unit,
                production_quantity, production_unit, generated_at, generated_by
      `,
      [
        companyId,
        reportingPeriodId,
        reportType,
        reportVersion,
        payload.status || "draft",
        totalEmissionsKg,
        emissionPerUnit,
        productionQuantity,
        payload.productionUnit || null,
        userId
      ]
    );

    const report = reportInsert.rows[0];

    for (const row of calcResult.rows) {
      await client.query(
        `
        INSERT INTO report_calculations (report_id, emission_calculation_id)
        VALUES ($1, $2)
        ON CONFLICT (report_id, emission_calculation_id) DO NOTHING
        `,
        [report.id, row.id]
      );
    }

    await client.query(
      `
      INSERT INTO usage_events (company_id, user_id, event_type, quantity, period_key, metadata)
      VALUES ($1, $2, 'report_generated', 1, to_char(NOW(), 'YYYY-MM'), $3::jsonb)
      `,
      [
        companyId,
        userId,
        JSON.stringify({ reportId: Number(report.id), reportType })
      ]
    );

    await client.query("COMMIT");

    return {
      reportId: Number(report.id),
      companyId: Number(report.company_id),
      reportingPeriodId: Number(report.reporting_period_id),
      reportType: report.report_type,
      reportVersion: Number(report.report_version),
      status: report.status,
      productId,
      calculationCount: calcResult.rows.length,
      totalEmissionsKg: Number(report.total_emissions_kg),
      emissionPerUnit: report.emission_per_unit === null ? null : Number(report.emission_per_unit),
      productionQuantity: report.production_quantity === null ? null : Number(report.production_quantity),
      productionUnit: report.production_unit,
      generatedAt: report.generated_at
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function getReportById(id, userId) {
  const reportId = asPositiveInt(id, "id");
  const uid = asPositiveInt(userId, "userId");

  const reportResult = await db.query(
    `
      SELECT r.id, r.company_id, r.reporting_period_id, r.report_type, r.report_version,
             r.status, r.total_emissions_kg, r.emission_per_unit,
             r.production_quantity, r.production_unit,
             r.generated_at, r.submitted_at, r.submitted_reference,
             r.created_at, r.updated_at
      FROM reports r
      JOIN company_users cu ON cu.company_id = r.company_id
      WHERE r.id = $1 AND cu.user_id = $2
      LIMIT 1
    `,
    [reportId, uid]
  );

  if (!reportResult.rows[0]) {
    return null;
  }

  const linksResult = await db.query(
    `
      SELECT rc.emission_calculation_id
      FROM report_calculations rc
      WHERE rc.report_id = $1
      ORDER BY rc.emission_calculation_id ASC
    `,
    [reportId]
  );

  return {
    ...reportResult.rows[0],
    calculationIds: linksResult.rows.map((r) => Number(r.emission_calculation_id))
  };
}

function normalizeStatus(status) {
  if (!status || typeof status !== "string") {
    throw new Error("status is required");
  }
  return status.trim().toLowerCase();
}

function isValidTransition(fromStatus, toStatus) {
  const allowed = {
    draft: ["ready_for_verification"],
    ready_for_verification: ["verified"],
    verified: ["submitted"],
    submitted: []
  };

  return (allowed[fromStatus] || []).includes(toStatus);
}

async function updateReportStatus(reportId, userId, payload) {
  const rid = asPositiveInt(reportId, "reportId");
  const uid = asPositiveInt(userId, "userId");
  const newStatus = normalizeStatus(payload?.status);

  const client = await db.getClient();
  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `
      SELECT id, company_id, status, submitted_at, submitted_reference
      FROM reports
      WHERE id = $1
      FOR UPDATE
      `,
      [rid]
    );

    const current = currentResult.rows[0];
    if (!current) {
      await client.query("ROLLBACK");
      return null;
    }

    const companyId = Number(current.company_id);
    await assertCompanyAccess(client, uid, companyId);

    const fromStatus = normalizeStatus(current.status);

    if (fromStatus === newStatus) {
      await client.query("COMMIT");
      return {
        reportId: rid,
        companyId,
        status: fromStatus,
        submittedAt: current.submitted_at,
        submittedReference: current.submitted_reference
      };
    }

    if (!isValidTransition(fromStatus, newStatus)) {
      const error = new Error(`Invalid status transition: ${fromStatus} -> ${newStatus}`);
      error.statusCode = 400;
      throw error;
    }

    const submittedReference = payload?.submittedReference || null;
    const shouldMarkSubmitted = newStatus === "submitted";

    const updateResult = await client.query(
      `
      UPDATE reports
      SET status = $1,
          submitted_at = CASE WHEN $2::boolean THEN NOW() ELSE submitted_at END,
          submitted_reference = CASE WHEN $2::boolean THEN COALESCE($3, submitted_reference) ELSE submitted_reference END,
          updated_at = NOW()
      WHERE id = $4
      RETURNING id, company_id, status, submitted_at, submitted_reference
      `,
      [newStatus, shouldMarkSubmitted, submittedReference, rid]
    );

    const updated = updateResult.rows[0];

    await client.query(
      `
      INSERT INTO audit_logs (company_id, user_id, entity_type, entity_id, action, before_data, after_data)
      VALUES ($1, $2, 'report', $3, 'status_update', $4::jsonb, $5::jsonb)
      `,
      [
        companyId,
        uid,
        rid,
        JSON.stringify({ status: fromStatus }),
        JSON.stringify({ status: newStatus, submittedReference: updated.submitted_reference })
      ]
    );

    await client.query("COMMIT");

    return {
      reportId: Number(updated.id),
      companyId: Number(updated.company_id),
      status: updated.status,
      submittedAt: updated.submitted_at,
      submittedReference: updated.submitted_reference
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  generateReport,
  getReportById,
  updateReportStatus
};

