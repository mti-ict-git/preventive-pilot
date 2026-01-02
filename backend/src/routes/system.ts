import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { env } from "../config/env";
import { getDb } from "../db/mssql";
import { requireAuth } from "../middleware/requireAuth";
import { requireAnyRole, requireSuperadmin } from "../middleware/requireRole";
import { runJobNow, type JobName } from "../jobs";

const requireSystemAdmin = requireAnyRole(["Superadmin", "Admin"]);

const StatusJobSchema = z.enum(["snipe-sync", "schedule-calc", "notifications"]);

const LogsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  level: z.string().max(16).optional(),
});

const nullIfBlank = (value: unknown): unknown => {
  return typeof value === "string" && value.trim() === "" ? null : value;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const getSqlErrorNumber = (err: unknown): number | null => {
  if (!isRecord(err)) return null;

  const directNumber = err.number;
  if (typeof directNumber === "number") return directNumber;

  const originalError = err.originalError;
  if (isRecord(originalError) && typeof originalError.number === "number") return originalError.number;

  const precedingErrors = err.precedingErrors;
  if (Array.isArray(precedingErrors)) {
    const first = precedingErrors[0];
    if (isRecord(first) && typeof first.number === "number") return first.number;
  }

  return null;
};

const isInvalidObjectNameError = (err: unknown): boolean => {
  return getSqlErrorNumber(err) === 208;
};

const normalizeInstanceUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.replace(/\/api\/v1\/?$/i, "");
};

const toApiBaseUrl = (instanceUrl: string): string => {
  return `${normalizeInstanceUrl(instanceUrl)}/api/v1`;
};

type EffectiveSnipeItSettings = {
  baseUrl: string | null;
  apiToken: string | null;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
};

const loadEffectiveSnipeItSettings = async (): Promise<EffectiveSnipeItSettings> => {
  let dbRow: Record<string, unknown> | null = null;
  try {
    const db = await getDb();
    const result = await db
      .request()
      .query(
        [
          "SELECT TOP (1)",
          "  BaseUrl, ApiToken, AutoSyncEnabled, SyncIntervalMinutes",
          "FROM pm.SnipeItSettings",
          "ORDER BY UpdatedAt DESC",
        ].join("\n"),
      );
    dbRow = (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
  } catch {
    dbRow = null;
  }

  const baseUrl =
    (typeof dbRow?.BaseUrl === "string" && dbRow.BaseUrl.trim() ? dbRow.BaseUrl.trim() : null) ??
    (env.SNIPEIT_BASE_URL?.trim() ? env.SNIPEIT_BASE_URL.trim() : null);

  const apiToken =
    (typeof dbRow?.ApiToken === "string" && dbRow.ApiToken.trim() ? dbRow.ApiToken.trim() : null) ??
    (env.SNIPEIT_API_TOKEN?.trim() ? env.SNIPEIT_API_TOKEN.trim() : null);

  const autoSyncEnabled =
    typeof dbRow?.AutoSyncEnabled === "boolean"
      ? dbRow.AutoSyncEnabled
      : typeof dbRow?.AutoSyncEnabled === "number"
        ? dbRow.AutoSyncEnabled === 1
        : env.JOB_SNIPE_SYNC_ENABLED;

  const syncIntervalMinutes =
    typeof dbRow?.SyncIntervalMinutes === "number" && Number.isFinite(dbRow.SyncIntervalMinutes)
      ? dbRow.SyncIntervalMinutes
      : env.JOB_SNIPE_SYNC_INTERVAL_MINUTES;

  return {
    baseUrl,
    apiToken,
    autoSyncEnabled,
    syncIntervalMinutes,
  };
};

const SnipeItSettingsUpdateSchema = z.object({
  baseUrl: z.preprocess(nullIfBlank, z.string().trim().max(512).nullable()),
  apiToken: z.preprocess(nullIfBlank, z.string().trim().max(2048).nullable()).optional(),
  autoSyncEnabled: z.boolean(),
  syncIntervalMinutes: z.number().int().min(1).max(1440),
});

const SnipeItSettingsTestSchema = SnipeItSettingsUpdateSchema.partial().optional();

const AssetsUiSettingsSchema = z.object({
  visibleCategoryIds: z.array(z.string().uuid()).min(1).nullable(),
});

const ASSETS_VISIBLE_CATEGORY_IDS_SETTING_KEY = "ui.assets.visibleCategoryIds";

const parseVisibleCategoryIds = (valueJson: string | null): string[] | null => {
  if (!valueJson || !valueJson.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(valueJson);
    const validated = z.array(z.string().uuid()).min(1).safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
};

const loadAssetsUiSettings = async (): Promise<z.infer<typeof AssetsUiSettingsSchema>> => {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("settingKey", sql.NVarChar(128), ASSETS_VISIBLE_CATEGORY_IDS_SETTING_KEY)
      .query(
        [
          "SELECT TOP (1)",
          "  SettingValueJson",
          "FROM pm.SystemSettings",
          "WHERE SettingKey = @settingKey",
        ].join("\n"),
      );

    const row = result.recordset[0] as Record<string, unknown> | undefined;
    const valueJson = typeof row?.SettingValueJson === "string" ? row.SettingValueJson : null;
    return { visibleCategoryIds: parseVisibleCategoryIds(valueJson) };
  } catch (err: unknown) {
    if (isInvalidObjectNameError(err)) {
      return { visibleCategoryIds: null };
    }
    throw err;
  }
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

  let lastRunRow: Record<string, unknown> | null = null;
  try {
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

    lastRunRow = (snipeLastRun.recordset[0] as Record<string, unknown> | undefined) ?? null;
  } catch {
    lastRunRow = null;
  }

  const snipeItSettings = await loadEffectiveSnipeItSettings();

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
      snipeSyncEnabled: snipeItSettings.autoSyncEnabled,
      snipeSyncIntervalMinutes: snipeItSettings.syncIntervalMinutes,
    },
    snipeIt: {
      configured: Boolean(snipeItSettings.baseUrl && snipeItSettings.apiToken),
      baseUrl: snipeItSettings.baseUrl,
      autoSyncEnabled: snipeItSettings.autoSyncEnabled,
      syncIntervalMinutes: snipeItSettings.syncIntervalMinutes,
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

systemRouter.get("/snipeit-settings", async (_req, res) => {
  const settings = await loadEffectiveSnipeItSettings();
  res.json({
    baseUrl: settings.baseUrl,
    apiTokenConfigured: Boolean(settings.apiToken),
    autoSyncEnabled: settings.autoSyncEnabled,
    syncIntervalMinutes: settings.syncIntervalMinutes,
  });
});

systemRouter.get("/ui-settings/assets", async (_req, res) => {
  try {
    const settings = await loadAssetsUiSettings();
    res.json(settings);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
  }
});

systemRouter.put("/ui-settings/assets", requireSuperadmin, async (req, res) => {
  const parsed = AssetsUiSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const valueJson = parsed.data.visibleCategoryIds === null ? null : JSON.stringify(parsed.data.visibleCategoryIds);

  try {
    const db = await getDb();
    await db
      .request()
      .input("settingKey", sql.NVarChar(128), ASSETS_VISIBLE_CATEGORY_IDS_SETTING_KEY)
      .input("settingValueJson", sql.NVarChar(sql.MAX), valueJson)
      .input("updatedByUserId", sql.UniqueIdentifier, req.user.sub)
      .query(
        [
          "MERGE pm.SystemSettings WITH (HOLDLOCK) AS target",
          "USING (SELECT @settingKey AS SettingKey) AS source",
          "ON target.SettingKey = source.SettingKey",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    SettingValueJson = @settingValueJson,",
          "    UpdatedAt = sysutcdatetime(),",
          "    UpdatedByUserId = @updatedByUserId",
          "WHEN NOT MATCHED THEN",
          "  INSERT (SettingKey, SettingValueJson, UpdatedByUserId)",
          "  VALUES (@settingKey, @settingValueJson, @updatedByUserId);",
        ].join("\n"),
      );
  } catch (err: unknown) {
    if (isInvalidObjectNameError(err)) {
      res
        .status(503)
        .json({ message: "Database schema missing pm.SystemSettings. Run npm run db:apply-schema." });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
    return;
  }

  const updated = await loadAssetsUiSettings();
  res.json(updated);
});

systemRouter.put("/snipeit-settings", requireSystemAdmin, async (req, res) => {
  const parsed = SnipeItSettingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const current = await loadEffectiveSnipeItSettings();
  const baseUrl = parsed.data.baseUrl;
  const apiToken = parsed.data.apiToken === undefined ? current.apiToken : parsed.data.apiToken;

  try {
    const db = await getDb();
    await db
      .request()
      .input("baseUrl", sql.NVarChar(512), baseUrl)
      .input("apiToken", sql.NVarChar(2048), apiToken)
      .input("autoSyncEnabled", sql.Bit, parsed.data.autoSyncEnabled)
      .input("syncIntervalMinutes", sql.Int, parsed.data.syncIntervalMinutes)
      .query(
        [
          "INSERT INTO pm.SnipeItSettings (BaseUrl, ApiToken, AutoSyncEnabled, SyncIntervalMinutes)",
          "VALUES (@baseUrl, @apiToken, @autoSyncEnabled, @syncIntervalMinutes)",
        ].join("\n"),
      );
  } catch (err: unknown) {
    if (isInvalidObjectNameError(err)) {
      res.status(503).json({ message: "Database schema missing pm.SnipeItSettings. Run npm run db:apply-schema." });
      return;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
    return;
  }

  const updated = await loadEffectiveSnipeItSettings();
  res.json({
    baseUrl: updated.baseUrl,
    apiTokenConfigured: Boolean(updated.apiToken),
    autoSyncEnabled: updated.autoSyncEnabled,
    syncIntervalMinutes: updated.syncIntervalMinutes,
  });
});

systemRouter.post("/snipeit-settings/test", requireSystemAdmin, async (req, res) => {
  const parsed = SnipeItSettingsTestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const current = await loadEffectiveSnipeItSettings();
  const override = parsed.data;
  const baseUrl = override?.baseUrl ?? current.baseUrl;
  const apiToken = override?.apiToken ?? current.apiToken;

  if (!baseUrl || !apiToken) {
    res.status(400).json({ message: "Snipe-IT not configured" });
    return;
  }

  const apiBaseUrl = toApiBaseUrl(baseUrl);
  const url = `${apiBaseUrl}/hardware?limit=1&offset=0`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      res.status(400).json({ message: `Snipe-IT test failed (${response.status}) ${body}`.trim() });
      return;
    }

    res.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ message });
  }
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

  const jobName = parsed.data as JobName;

  if (jobName === "snipe-sync") {
    const settings = await loadEffectiveSnipeItSettings();
    if (!settings.baseUrl || !settings.apiToken) {
      res.status(400).json({ message: "Snipe-IT not configured" });
      return;
    }
  }

  const started = await runJobNow(jobName, jobName === "snipe-sync" ? { force: true } : undefined);
  if (!started) {
    res.status(409).json({ message: "Job already running" });
    return;
  }

  res.json({ ok: true });
});
