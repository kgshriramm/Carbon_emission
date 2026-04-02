const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

const FACTORS = [
  {
    factorKey: "electricity_grid",
    activityType: "electricity_kwh",
    geographyCode: "GLOBAL",
    unit: "kwh",
    factorValue: 0.475,
    factorUnit: "kg_co2e_per_unit",
    source: "Default grid factor",
    sourceReference: "Starter seed for MVP",
    version: "2026.1",
    validFrom: "2026-01-01",
    validTo: null
  },
  {
    factorKey: "diesel_combustion",
    activityType: "fuel_liters",
    geographyCode: "GLOBAL",
    unit: "liter",
    factorValue: 2.68,
    factorUnit: "kg_co2e_per_unit",
    source: "Default diesel factor",
    sourceReference: "Starter seed for MVP",
    version: "2026.1",
    validFrom: "2026-01-01",
    validTo: null
  },
  {
    factorKey: "road_transport",
    activityType: "transport_tkm",
    geographyCode: "GLOBAL",
    unit: "tkm",
    factorValue: 0.11,
    factorUnit: "kg_co2e_per_unit",
    source: "Default road freight factor",
    sourceReference: "Starter seed for MVP",
    version: "2026.1",
    validFrom: "2026-01-01",
    validTo: null
  },
  {
    factorKey: "natural_gas_combustion",
    activityType: "fuel_m3",
    geographyCode: "GLOBAL",
    unit: "m3",
    factorValue: 1.95,
    factorUnit: "kg_co2e_per_unit",
    source: "Default natural gas factor",
    sourceReference: "Starter seed for MVP",
    version: "2026.1",
    validFrom: "2026-01-01",
    validTo: null
  }
];

function buildClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing in .env");
  }

  const useSsl = process.env.DB_SSL === "true" || process.env.DATABASE_URL.includes("supabase");

  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined
  });
}

async function upsertFactor(client, factor) {
  const sql = `
    INSERT INTO emission_factors (
      factor_key,
      activity_type,
      geography_code,
      unit,
      factor_value,
      factor_unit,
      source,
      source_reference,
      version,
      valid_from,
      valid_to,
      is_active
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,TRUE)
    ON CONFLICT (factor_key, geography_code, version, valid_from)
    DO UPDATE SET
      activity_type = EXCLUDED.activity_type,
      unit = EXCLUDED.unit,
      factor_value = EXCLUDED.factor_value,
      factor_unit = EXCLUDED.factor_unit,
      source = EXCLUDED.source,
      source_reference = EXCLUDED.source_reference,
      valid_to = EXCLUDED.valid_to,
      is_active = TRUE
    RETURNING id
  `;

  const values = [
    factor.factorKey,
    factor.activityType,
    factor.geographyCode,
    factor.unit,
    factor.factorValue,
    factor.factorUnit,
    factor.source,
    factor.sourceReference,
    factor.version,
    factor.validFrom,
    factor.validTo
  ];

  const { rows } = await client.query(sql, values);
  return rows[0].id;
}

async function run() {
  const client = buildClient();
  try {
    await client.connect();
    await client.query("BEGIN");

    const inserted = [];
    for (const factor of FACTORS) {
      const id = await upsertFactor(client, factor);
      inserted.push({ id, key: factor.factorKey, activity: factor.activityType, unit: factor.unit });
    }

    await client.query("COMMIT");

    console.log("Emission factors seeded successfully.");
    inserted.forEach((f) => {
      console.log(`- id=${f.id} key=${f.key} activity=${f.activity} unit=${f.unit}`);
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Emission factor seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

run();
