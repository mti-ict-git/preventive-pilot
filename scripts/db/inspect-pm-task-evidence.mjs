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

const taskNumberArg = process.argv[2];
const taskNumber = taskNumberArg && taskNumberArg.trim() ? taskNumberArg.trim() : "PM-20260116-16FE2091";

const pool = await sql.connect(config);

try {
  const taskResult = await pool
    .request()
    .input("taskNumber", sql.NVarChar(64), taskNumber)
    .query(
      [
        "SELECT",
        "  TaskId,",
        "  TaskNumber,",
        "  MaintenanceType,",
        "  Status,",
        "  ApprovalStatus,",
        "  ScheduledDueAt,",
        "  TechnicianCompletedAt",
        "FROM pm.PMTasks",
        "WHERE TaskNumber = @taskNumber",
      ].join("\n"),
    );

  if (taskResult.recordset.length === 0) {
    process.stdout.write(`No PMTasks row found for TaskNumber=${taskNumber}.\n`);
  } else {
    const taskRow = taskResult.recordset[0];
    process.stdout.write("PMTasks row:\n");
    process.stdout.write(`${JSON.stringify(taskRow, null, 2)}\n`);

    const taskId = taskRow.TaskId;

    const checklistResult = await pool
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT",
          "  ChecklistEvidenceId,",
          "  TaskId,",
          "  TemplateChecklistItemId,",
          "  FileName,",
          "  StoragePath,",
          "  UploadedAt",
          "FROM pm.PMTaskChecklistEvidence",
          "WHERE TaskId = @taskId",
          "ORDER BY UploadedAt DESC",
        ].join("\n"),
      );

    process.stdout.write(`Checklist evidence count: ${checklistResult.recordset.length}\n`);
    if (checklistResult.recordset.length > 0) {
      process.stdout.write("First checklist evidence row:\n");
      process.stdout.write(`${JSON.stringify(checklistResult.recordset[0], null, 2)}\n`);
    }

    const evidenceResult = await pool
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT",
          "  EvidenceId,",
          "  TaskId,",
          "  FileName,",
          "  StoragePath,",
          "  UploadedAt",
          "FROM pm.PMTaskEvidence",
          "WHERE TaskId = @taskId",
          "ORDER BY UploadedAt DESC",
        ].join("\n"),
      );

    process.stdout.write(`Task evidence count: ${evidenceResult.recordset.length}\n`);
    if (evidenceResult.recordset.length > 0) {
      process.stdout.write("First task evidence row:\n");
      process.stdout.write(`${JSON.stringify(evidenceResult.recordset[0], null, 2)}\n`);
    }
  }
} finally {
  await pool.close();
}

