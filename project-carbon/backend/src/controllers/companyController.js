const db = require("../config/db");

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const s = String(value).trim();
  return s === "" ? null : s;
}

function optionalNumber(value, field) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${field} must be a valid number`);
  }
  return n;
}

function asId(value, field) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
  return n;
}

async function assertCompanyAccess(userId, companyId) {
  const { rows } = await db.query(
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

async function createCompany(req, res, next) {
  const client = await db.getClient();
  try {
    const body = req.body || {};
    const companyName = requiredString(body.companyName, "companyName");
    const countryCode = requiredString(body.countryCode, "countryCode").toUpperCase();

    await client.query("BEGIN");

    const { rows } = await client.query(
      `
      INSERT INTO companies (
        company_name, country_code, sector, registration_number,
        annual_production, annual_production_unit, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, company_name, country_code, sector, registration_number,
                annual_production, annual_production_unit, created_by, created_at
      `,
      [
        companyName,
        countryCode,
        optionalString(body.sector),
        optionalString(body.registrationNumber),
        optionalNumber(body.annualProduction, "annualProduction"),
        optionalString(body.annualProductionUnit),
        req.user.id
      ]
    );

    const company = rows[0];

    await client.query(
      `
      INSERT INTO company_users (company_id, user_id, membership_role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (company_id, user_id) DO NOTHING
      `,
      [Number(company.id), req.user.id]
    );

    await client.query("COMMIT");

    return res.status(201).json({ success: true, data: company });
  } catch (error) {
    await client.query("ROLLBACK");
    return next(error);
  } finally {
    client.release();
  }
}

async function createFactory(req, res, next) {
  try {
    const body = req.body || {};
    const companyId = asId(body.companyId, "companyId");
    await assertCompanyAccess(req.user.id, companyId);

    const { rows } = await db.query(
      `
      INSERT INTO factories (
        company_id, factory_name, country_code, state_region,
        city, address_line, latitude, longitude
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, company_id, factory_name, country_code, state_region,
                city, address_line, latitude, longitude, created_at
      `,
      [
        companyId,
        requiredString(body.factoryName, "factoryName"),
        requiredString(body.countryCode, "countryCode").toUpperCase(),
        optionalString(body.stateRegion),
        optionalString(body.city),
        optionalString(body.addressLine),
        optionalNumber(body.latitude, "latitude"),
        optionalNumber(body.longitude, "longitude")
      ]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function createProduct(req, res, next) {
  try {
    const body = req.body || {};
    const companyId = asId(body.companyId, "companyId");
    await assertCompanyAccess(req.user.id, companyId);

    const { rows } = await db.query(
      `
      INSERT INTO products (
        company_id, factory_id, product_name, cbam_category,
        hs_code, export_destination_country, default_production_unit
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, company_id, factory_id, product_name, cbam_category,
                hs_code, export_destination_country, default_production_unit,
                is_active, created_at
      `,
      [
        companyId,
        body.factoryId ? asId(body.factoryId, "factoryId") : null,
        requiredString(body.productName, "productName"),
        optionalString(body.cbamCategory),
        optionalString(body.hsCode),
        optionalString(body.exportDestinationCountry)?.toUpperCase() || null,
        optionalString(body.defaultProductionUnit)
      ]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    return next(error);
  }
}

async function createReportingPeriod(req, res, next) {
  try {
    const body = req.body || {};
    const companyId = asId(body.companyId, "companyId");
    await assertCompanyAccess(req.user.id, companyId);

    const { rows } = await db.query(
      `
      INSERT INTO reporting_periods (
        company_id, period_label, period_start, period_end, period_type, status
      )
      VALUES ($1, $2, $3::date, $4::date, $5, $6)
      RETURNING id, company_id, period_label, period_start, period_end,
                period_type, status, created_at
      `,
      [
        companyId,
        requiredString(body.periodLabel, "periodLabel"),
        requiredString(body.periodStart, "periodStart"),
        requiredString(body.periodEnd, "periodEnd"),
        optionalString(body.periodType) || "monthly",
        optionalString(body.status) || "open"
      ]
    );

    return res.status(201).json({ success: true, data: rows[0] });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createCompany,
  createFactory,
  createProduct,
  createReportingPeriod
};
