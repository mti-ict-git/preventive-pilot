import "dotenv/config";
import sql from "mssql";

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

const expectedTables = [
  "SchemaInfo",
  "Roles",
  "Users",
  "UserRoles",
  "UserCredentials",
  "AssetCategories",
  "Locations",
  "Assets",
  "AssetPMSettings",
  "PMTemplates",
  "PMTemplateChecklistItems",
  "AssignmentRules",
  "BlackoutWindows",
  "PMSchedules",
  "PMTasks",
  "PMTaskChecklistResults",
  "PMTaskEvidence",
  "NotificationChannels",
  "NotificationRules",
  "NotificationLog",
  "AuditLog",
  "SystemLog",
  "SnipeSyncRuns",
];

const pool = await sql.connect(config);
try {
  const schemaResult = await pool
    .request()
    .input("schemaName", sql.NVarChar(128), "pm")
    .query("SELECT schema_id FROM sys.schemas WHERE name = @schemaName");

  if (schemaResult.recordset.length === 0) {
    throw new Error("Schema 'pm' does not exist");
  }

  const tablesResult = await pool.request().query(
    [
      "SELECT t.name AS TableName",
      "FROM sys.tables t",
      "INNER JOIN sys.schemas s ON s.schema_id = t.schema_id",
      "WHERE s.name = N'pm'",
      "ORDER BY t.name",
    ].join("\n"),
  );

  const tableNames = tablesResult.recordset.map((row) => row.TableName);

  const missingTables = expectedTables.filter((t) => !tableNames.includes(t));
  const extraTables = tableNames.filter((t) => !expectedTables.includes(t));

  const schemaInfoResult = await pool.request().query(
    "SELECT TOP (1) Version, AppliedAt FROM pm.SchemaInfo ORDER BY AppliedAt DESC",
  );

  const fkCountResult = await pool.request().query(
    [
      "SELECT COUNT(1) AS ForeignKeyCount",
      "FROM sys.foreign_keys fk",
      "INNER JOIN sys.objects o ON o.object_id = fk.parent_object_id",
      "INNER JOIN sys.schemas s ON s.schema_id = o.schema_id",
      "WHERE s.name = N'pm'",
    ].join("\n"),
  );

  const indexCountResult = await pool.request().query(
    [
      "SELECT COUNT(1) AS IndexCount",
      "FROM sys.indexes i",
      "INNER JOIN sys.objects o ON o.object_id = i.object_id",
      "INNER JOIN sys.schemas s ON s.schema_id = o.schema_id",
      "WHERE s.name = N'pm' AND i.name IS NOT NULL",
    ].join("\n"),
  );

  const schemaInfo = schemaInfoResult.recordset[0];
  const foreignKeyCount = fkCountResult.recordset[0]?.ForeignKeyCount ?? 0;
  const indexCount = indexCountResult.recordset[0]?.IndexCount ?? 0;

  process.stdout.write("PM schema verification\n");
  process.stdout.write(`- Schema: pm\n`);
  process.stdout.write(`- Tables: ${tableNames.length}\n`);
  process.stdout.write(`- Foreign keys: ${foreignKeyCount}\n`);
  process.stdout.write(`- Indexes: ${indexCount}\n`);
  if (schemaInfo) {
    process.stdout.write(`- SchemaInfo: version=${schemaInfo.Version} appliedAt=${schemaInfo.AppliedAt.toISOString?.() ?? String(schemaInfo.AppliedAt)}\n`);
  }

  if (missingTables.length > 0) {
    process.stdout.write(`Missing tables: ${missingTables.join(", ")}\n`);
    process.exitCode = 2;
  }

  if (extraTables.length > 0) {
    process.stdout.write(`Extra tables (not in expected list): ${extraTables.join(", ")}\n`);
  }

  if (missingTables.length === 0) {
    process.stdout.write("Verification OK\n");
  }
} finally {
  await pool.close();
}
