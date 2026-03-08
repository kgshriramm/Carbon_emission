const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const sslEnabled =
  process.env.DB_SSL === "true" ||
  process.env.DB_SSL === "1" ||
  (hasDatabaseUrl && process.env.DATABASE_URL.includes("supabase.co"));

const poolConfig = hasDatabaseUrl
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
    }
  : {
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || "postgres",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "project_carbon",
      ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
    };

const pool = new Pool(poolConfig);

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
