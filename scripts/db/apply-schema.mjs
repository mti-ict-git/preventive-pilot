import "dotenv/config";
import sql from "mssql";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const toBoolean = (value, defaultValue) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return defaultValue;
};

const toNumber = (value, defaultValue) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

const required = (value, name) => {
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, "../../db/schema.sql");
const schemaSql = await readFile(schemaPath, "utf8");

const config = {
  server: required(process.env.DB_SERVER, "DB_SERVER"),
  database: required(process.env.DB_DATABASE, "DB_DATABASE"),
  user: required(process.env.DB_USER, "DB_USER"),
  password: required(process.env.DB_PASSWORD, "DB_PASSWORD"),
  port: toNumber(process.env.DB_PORT, 1433),
  options: {
    encrypt: toBoolean(process.env.DB_ENCRYPT, false),
    trustServerCertificate: toBoolean(process.env.DB_TRUST_SERVER_CERTIFICATE, true),
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

const pool = await sql.connect(config);
try {
  await pool.request().query(schemaSql);
  process.stdout.write("Database schema applied successfully.\n");
} finally {
  await pool.close();
}

