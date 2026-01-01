import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { env } from "../config/env";
import { getDb } from "../db/mssql";
import { requireAuth } from "../middleware/requireAuth";
import { requireAnyRole } from "../middleware/requireRole";
import { runReminderEscalationJob } from "../jobs/reminders";
import { runScheduleCalculationJob } from "../jobs/scheduleCalc";
import { runSnipeSyncJob } from "../jobs/snipeSync";

const requireSystemAdmin = requireAnyRole(["Superadmin", "Admin"]);

const StatusJobSchema = z.enum(["snipe-sync", "schedule-calc", "notifications"]);

const LogsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  level: z.string().max(16).optional(),
});

type RunningJobs = {
  [K in z.infer<typeof StatusJobSchema>]: boolean;
};

const runningJobs: RunningJobs = {
  "snipe-sync": false,
  "schedule-calc": false,
  notifications: false,
};

export const systemRouter = Router();

systemRouter.use(requireAuth);

systemRouter.get("/status", async (_req, res) => {
  const db = await getDb();

  let databaseOk = false;
  try {
    const result = await db.request().query("SELECT CAST(1 AS bit) AS Ok");
    const row = result.recordset[0] as { Ok?: boolean } | undefined;
    databaseOk = row?.Ok === true;
  } catch {
    databaseOk = false;
  }

  const snipeLastRun = await db
    .request()
    .query(
      [
        "SELECT TOP (1)",
        "  SnipeSyncRunId, StartedAt, CompletedAt, Status, AssetsProcessed, ErrorMessage",
        "FROM pm.SnipeSyncRuns",
        "ORDER BY StartedAt DESC",
      ].join("\n"),
    );

  const lastRunRow = snipeLastRun.recordset[0] as Record<string, unknown> | undefined;

  res.json({
    backendTime: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      ok: databaseOk,
    },
    jobs: {
      enabled: env.JOBS_ENABLED,
      scheduleCalcIntervalMinutes: env.JOB_SCHEDULE_CALC_INTERVAL_MINUTES,
      notificationIntervalMinutes: env.JOB_NOTIFICATION_INTERVAL_MINUTES,
      snipeSyncEnabled: env.JOB_SNIPE_SYNC_ENABLED,
      snipeSyncIntervalMinutes: env.JOB_SNIPE_SYNC_INTERVAL_MINUTES,
    },
    snipeIt: {
      configured: Boolean(env.SNIPEIT_BASE_URL && env.SNIPEIT_API_TOKEN),
      baseUrl: env.SNIPEIT_BASE_URL ?? null,
      syncEnabled: env.JOB_SNIPE_SYNC_ENABLED,
      lastRun: lastRunRow
        ? {
            id: lastRunRow.SnipeSyncRunId,
            startedAt: lastRunRow.StartedAt,
            completedAt: lastRunRow.CompletedAt,
            status: lastRunRow.Status,
            assetsProcessed: lastRunRow.AssetsProcessed ?? null,
            errorMessage: lastRunRow.ErrorMessage ?? null,
          }
        : null,
    },
  });
});

systemRouter.get("/logs", async (req, res) => {
  const parsed = LogsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(parsed.data.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  const db = await getDb();
  const result = await db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("level", sql.NVarChar(16), parsed.data.level ?? null)
    .query(
      [
        "SELECT",
        "  SystemLogId, LogLevel, Message, CreatedAt, Context",
        "FROM pm.SystemLog",
        "WHERE (@level IS NULL OR LogLevel = @level)",
        "ORDER BY CreatedAt DESC",
        "OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.SystemLogId,
      level: r.LogLevel,
      message: r.Message,
      createdAt: r.CreatedAt,
      context: r.Context ?? null,
    })),
  });
});

systemRouter.get("/lookups", async (_req, res) => {
  const db = await getDb();

  const rolesResult = await db
    .request()
    .query(
      [
        "SELECT",
        "  RoleId, Name",
        "FROM pm.Roles",
        "ORDER BY Name ASC",
      ].join("\n"),
    );

  const categoriesResult = await db
    .request()
    .query(
      [
        "SELECT",
        "  CategoryId, Name, IsActive",
        "FROM pm.AssetCategories",
        "ORDER BY Name ASC",
      ].join("\n"),
    );

  const roleRows = rolesResult.recordset as Array<Record<string, unknown>>;
  const categoryRows = categoriesResult.recordset as Array<Record<string, unknown>>;

  res.json({
    roles: roleRows.map((r) => ({
      id: r.RoleId,
      name: r.Name,
    })),
    assetCategories: categoryRows.map((c) => ({
      id: c.CategoryId,
      name: c.Name,
      isActive: c.IsActive,
    })),
  });
});

systemRouter.post("/jobs/:jobName/run", requireSystemAdmin, async (req, res) => {
  const parsed = StatusJobSchema.safeParse(req.params.jobName);
  if (!parsed.success) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const jobName = parsed.data;
  if (runningJobs[jobName]) {
    res.status(409).json({ message: "Job already running" });
    return;
  }

  if (jobName === "snipe-sync" && !env.JOB_SNIPE_SYNC_ENABLED) {
    res.status(409).json({ message: "Snipe-IT sync disabled" });
    return;
  }

  runningJobs[jobName] = true;
  try {
    if (jobName === "snipe-sync") {
      await runSnipeSyncJob();
    } else if (jobName === "schedule-calc") {
      await runScheduleCalculationJob();
    } else {
      await runReminderEscalationJob();
    }

    res.json({ ok: true });
  } finally {
    runningJobs[jobName] = false;
  }
});
