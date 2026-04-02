const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

dotenv.config({ path: path.resolve(__dirname, "../.env") });

(async () => {
  const sql = fs.readFileSync(path.resolve(__dirname, "../database/schema.sql"), "utf8");
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  await client.query(sql);
  await client.end();
  console.log("Schema applied successfully.");
})().catch((err) => {
  console.error("Schema apply failed:", err.message);
  process.exit(1);
});
