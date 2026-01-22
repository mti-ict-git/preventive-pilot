import sql from "mssql";
import { env } from "../config/env.js";
import { getDb } from "../db/mssql.js";
import { writeSystemLog } from "./systemLog.js";

type SnipeListResponse<T> = {
  total?: number;
  rows?: T[];
};

type SnipeCategory = {
  id: number;
  name: string;
};

type SnipeLocation = {
  id: number;
  name: string;
};

type SnipeHardware = {
  id: number;
  asset_tag?: string | null;
  name: string;
  serial?: string | null;
  status_label?: { name?: string | null } | null;
  manufacturer?: { name?: string | null } | null;
  model?: { name?: string | null } | null;
  category?: { id?: number | null; name?: string | null } | null;
  location?: { id?: number | null; name?: string | null } | null;
  assigned_to?: { name?: string | null } | null;
};

type AssetOperationalStatus = "operational" | "broken" | "archived";

const toOperationalStatus = (statusLabelName: string | null): AssetOperationalStatus => {
  const normalized = (statusLabelName ?? "").trim().toLowerCase();
  if (/^archived\b/.test(normalized)) return "archived";
  if (/^broken\b/.test(normalized)) return "broken";
  return "operational";
};

const safeWriteSystemLog = async (args: Parameters<typeof writeSystemLog>[0]): Promise<void> => {
  try {
    await writeSystemLog(args);
  } catch {
    return;
  }
};

export type SnipeSyncRunOptions = {
  force?: boolean;
};

type SnipeItSettings = {
  baseUrl: string | null;
  apiToken: string | null;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
};

type SnipeItRequestConfig = {
  apiBaseUrl: string;
  apiToken: string;
};

const normalizeInstanceUrl = (value: string): string => {
  const trimmed = value.replace(/\/+$/, "");
  return trimmed.replace(/\/api\/v1\/?$/i, "");
};

const toApiBaseUrl = (instanceUrl: string): string => {
  return `${normalizeInstanceUrl(instanceUrl)}/api/v1`;
};

const authHeaders = (token: string): HeadersInit => {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
};

const fetchJson = async <T>(config: SnipeItRequestConfig, url: string): Promise<T> => {
  const response = await fetch(url, { headers: authHeaders(config.apiToken) });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Snipe-IT request failed (${response.status}) ${body}`.trim());
  }
  return (await response.json()) as T;
};

const listAll = async <T>(config: SnipeItRequestConfig, endpoint: string): Promise<T[]> => {
  const limit = 200;
  let offset = 0;
  const items: T[] = [];

  for (;;) {
    const url = `${config.apiBaseUrl}${endpoint}${endpoint.includes("?") ? "&" : "?"}limit=${limit}&offset=${offset}`;
    const page = await fetchJson<SnipeListResponse<T>>(config, url);
    const rows = page.rows ?? [];
    items.push(...rows);

    const total = typeof page.total === "number" ? page.total : items.length;
    if (items.length >= total || rows.length === 0) break;
    offset += rows.length;
  }

  return items;
};

const loadSnipeItSettings = async (): Promise<SnipeItSettings> => {
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

const upsertCategories = async (categories: SnipeCategory[]): Promise<void> => {
  const db = await getDb();
  for (const c of categories) {
    await db
      .request()
      .input("snipeCategoryId", sql.Int, c.id)
      .input("name", sql.NVarChar(128), c.name)
      .query(
        [
          "MERGE pm.AssetCategories WITH (HOLDLOCK) AS target",
          "USING (SELECT @snipeCategoryId AS SnipeCategoryId, @name AS Name) AS source",
          "ON target.SnipeCategoryId = source.SnipeCategoryId OR target.Name = source.Name",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    SnipeCategoryId = source.SnipeCategoryId,",
          "    Name = @name,",
          "    IsActive = 1,",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (SnipeCategoryId, Name, IsActive)",
          "  VALUES (@snipeCategoryId, @name, 1);",
        ].join("\n"),
      );
  }
};

const upsertLocations = async (locations: SnipeLocation[]): Promise<void> => {
  const db = await getDb();
  for (const l of locations) {
    await db
      .request()
      .input("snipeLocationId", sql.Int, l.id)
      .input("name", sql.NVarChar(256), l.name)
      .query(
        [
          "MERGE pm.Locations WITH (HOLDLOCK) AS target",
          "USING (SELECT @snipeLocationId AS SnipeLocationId, @name AS Name) AS source",
          "ON target.SnipeLocationId = source.SnipeLocationId OR target.Name = source.Name",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    SnipeLocationId = source.SnipeLocationId,",
          "    Name = @name,",
          "    IsActive = 1,",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (SnipeLocationId, Name, IsActive)",
          "  VALUES (@snipeLocationId, @name, 1);",
        ].join("\n"),
      );
  }
};

const deactivateMissingCategories = async (snipeCategoryIds: number[]): Promise<number> => {
  if (snipeCategoryIds.length === 0) return 0;
  const idsCsv = snipeCategoryIds.join(",");
  const db = await getDb();
  const result = await db
    .request()
    .input("idsCsv", sql.NVarChar(sql.MAX), idsCsv)
    .query(
      [
        "UPDATE c",
        "SET",
        "  IsActive = 0,",
        "  UpdatedAt = sysutcdatetime()",
        "FROM pm.AssetCategories c",
        "LEFT JOIN (",
        "  SELECT DISTINCT TRY_CONVERT(int, value) AS SnipeCategoryId",
        "  FROM string_split(@idsCsv, ',')",
        "  WHERE TRY_CONVERT(int, value) IS NOT NULL",
        ") ids ON ids.SnipeCategoryId = c.SnipeCategoryId",
        "WHERE c.SnipeCategoryId IS NOT NULL",
        "  AND c.IsActive = 1",
        "  AND ids.SnipeCategoryId IS NULL;",
        "SELECT @@ROWCOUNT AS DeactivatedCount;",
      ].join("\n"),
    );

  const row = result.recordset[0] as { DeactivatedCount?: number } | undefined;
  return typeof row?.DeactivatedCount === "number" ? row.DeactivatedCount : 0;
};

const loadCategoryIdMap = async (): Promise<Map<number, string>> => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT CategoryId, SnipeCategoryId",
        "FROM pm.AssetCategories",
        "WHERE SnipeCategoryId IS NOT NULL AND IsActive = 1",
      ].join("\n"),
    );

  const map = new Map<number, string>();
  for (const r of result.recordset as Array<{ CategoryId?: string; SnipeCategoryId?: number }>) {
    if (typeof r.SnipeCategoryId === "number" && typeof r.CategoryId === "string") {
      map.set(r.SnipeCategoryId, r.CategoryId);
    }
  }
  return map;
};

const loadLocationIdMap = async (): Promise<Map<number, string>> => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT LocationId, SnipeLocationId",
        "FROM pm.Locations",
        "WHERE SnipeLocationId IS NOT NULL AND IsActive = 1",
      ].join("\n"),
    );

  const map = new Map<number, string>();
  for (const r of result.recordset as Array<{ LocationId?: string; SnipeLocationId?: number }>) {
    if (typeof r.SnipeLocationId === "number" && typeof r.LocationId === "string") {
      map.set(r.SnipeLocationId, r.LocationId);
    }
  }
  return map;
};

const updateRunProgress = async (runId: string, assetsProcessed: number): Promise<void> => {
  const db = await getDb();
  await db
    .request()
    .input("runId", sql.UniqueIdentifier, runId)
    .input("assetsProcessed", sql.Int, assetsProcessed)
    .query(
      [
        "UPDATE pm.SnipeSyncRuns",
        "SET AssetsProcessed = @assetsProcessed",
        "WHERE SnipeSyncRunId = @runId",
      ].join("\n"),
    );
};

const upsertAssets = async (
  assets: SnipeHardware[],
  categoryIdBySnipeCategoryId: Map<number, string>,
  locationIdBySnipeLocationId: Map<number, string>,
  runId?: string,
): Promise<number> => {
  let processed = 0;
  const db = await getDb();
  for (const a of assets) {
    const snipeCategoryId = typeof a.category?.id === "number" ? a.category.id : null;
    const categoryId = snipeCategoryId ? categoryIdBySnipeCategoryId.get(snipeCategoryId) ?? null : null;

    const snipeLocationId = typeof a.location?.id === "number" ? a.location.id : null;
    const locationId = snipeLocationId ? locationIdBySnipeLocationId.get(snipeLocationId) ?? null : null;

    const manufacturer = a.manufacturer?.name ?? null;
    const model = a.model?.name ?? null;
    const serial = a.serial ?? null;
    const status = a.status_label?.name ?? null;
    const operationalStatus = toOperationalStatus(status);
    const assignedToText = a.assigned_to?.name ?? null;
    const assetTag = a.asset_tag ?? null;

    await db
      .request()
      .input("snipeAssetId", sql.Int, a.id)
      .input("assetTag", sql.NVarChar(64), assetTag)
      .input("name", sql.NVarChar(256), a.name)
      .input("manufacturer", sql.NVarChar(128), manufacturer)
      .input("model", sql.NVarChar(128), model)
      .input("serialNumber", sql.NVarChar(128), serial)
      .input("categoryId", sql.UniqueIdentifier, categoryId)
      .input("locationId", sql.UniqueIdentifier, locationId)
      .input("assetStatus", sql.NVarChar(64), status)
      .input("assetOperationalStatus", sql.NVarChar(16), operationalStatus)
      .input("assignedToText", sql.NVarChar(256), assignedToText)
      .query(
        [
          "MERGE pm.Assets WITH (HOLDLOCK) AS target",
          "USING (SELECT @snipeAssetId AS SnipeAssetId) AS source",
          "ON target.SnipeAssetId = source.SnipeAssetId",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    AssetTag = @assetTag,",
          "    Name = @name,",
          "    Manufacturer = @manufacturer,",
          "    Model = @model,",
          "    SerialNumber = @serialNumber,",
          "    CategoryId = @categoryId,",
          "    LocationId = @locationId,",
          "    AssetStatus = @assetStatus,",
          "    AssetOperationalStatus = @assetOperationalStatus,",
          "    AssignedToText = @assignedToText,",
          "    IsArchived = 0,",
          "    LastSyncedAt = sysutcdatetime(),",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (",
          "    SnipeAssetId, AssetTag, Name, Manufacturer, Model, SerialNumber, CategoryId, LocationId, AssetStatus, AssignedToText, AssetOperationalStatus, IsArchived, LastSyncedAt",
          "  )",
          "  VALUES (",
          "    @snipeAssetId, @assetTag, @name, @manufacturer, @model, @serialNumber, @categoryId, @locationId, @assetStatus, @assignedToText, @assetOperationalStatus, 0, sysutcdatetime()",
          "  );",
        ].join("\n"),
      );
    processed += 1;

    if (runId && processed % 200 === 0) {
      await updateRunProgress(runId, processed);
    }
  }

  return processed;
};

const archiveMissingAssets = async (syncStartedAt: Date, snipeAssetIds: number[]): Promise<number> => {
  if (snipeAssetIds.length === 0) return 0;
  const idsCsv = snipeAssetIds.join(",");
  const db = await getDb();
  const result = await db
    .request()
    .input("syncStartedAt", sql.DateTime2(0), syncStartedAt)
    .input("snipeAssetIdsCsv", sql.NVarChar(sql.MAX), idsCsv)
    .query(
      [
        "UPDATE a",
        "SET",
        "  IsArchived = 1,",
        "  AssetOperationalStatus = N'archived',",
        "  UpdatedAt = sysutcdatetime()",
        "FROM pm.Assets a",
        "LEFT JOIN (",
        "  SELECT DISTINCT TRY_CONVERT(int, value) AS SnipeAssetId",
        "  FROM string_split(@snipeAssetIdsCsv, ',')",
        "  WHERE TRY_CONVERT(int, value) IS NOT NULL",
        ") ids ON ids.SnipeAssetId = a.SnipeAssetId",
        "WHERE a.IsArchived = 0",
        "  AND a.SnipeAssetId IS NOT NULL",
        "  AND ids.SnipeAssetId IS NULL",
        "  AND (a.LastSyncedAt IS NULL OR a.LastSyncedAt < @syncStartedAt);",
        "SELECT @@ROWCOUNT AS ArchivedCount;",
      ].join("\n"),
    );

  const row = result.recordset[0] as { ArchivedCount?: number } | undefined;
  return typeof row?.ArchivedCount === "number" ? row.ArchivedCount : 0;
};

export const runSnipeSyncJob = async (options?: SnipeSyncRunOptions): Promise<void> => {
  const syncStartedAt = new Date();
  const settings = await loadSnipeItSettings();
  if (!options?.force && !settings.autoSyncEnabled) return;

  if (!settings.baseUrl || !settings.apiToken) {
    await writeSystemLog({
      level: "warn",
      message: "Snipe-IT sync skipped: missing SNIPEIT_BASE_URL or SNIPEIT_API_TOKEN",
    });
    return;
  }

  if (!options?.force && settings.syncIntervalMinutes > 0) {
    const db = await getDb();
    const lastRun = await db
      .request()
      .query(
        [
          "SELECT TOP (1)",
          "  StartedAt",
          "FROM pm.SnipeSyncRuns",
          "ORDER BY StartedAt DESC",
        ].join("\n"),
      );
    const lastRow = lastRun.recordset[0] as { StartedAt?: Date } | undefined;
    if (lastRow?.StartedAt instanceof Date) {
      const diffMs = Date.now() - lastRow.StartedAt.getTime();
      const diffMinutes = diffMs / (60 * 1000);
      if (diffMinutes >= 0 && diffMinutes < settings.syncIntervalMinutes) {
        return;
      }
    }
  }

  const requestConfig: SnipeItRequestConfig = {
    apiBaseUrl: toApiBaseUrl(settings.baseUrl),
    apiToken: settings.apiToken,
  };

  const db = await getDb();
  const started = await db
    .request()
    .input("status", sql.NVarChar(32), "running")
    .query(
      [
        "INSERT INTO pm.SnipeSyncRuns (Status)",
        "OUTPUT inserted.SnipeSyncRunId AS SnipeSyncRunId",
        "VALUES (@status)",
      ].join("\n"),
    );
  const runId = started.recordset[0]?.SnipeSyncRunId as string | undefined;

  const jobContext = { job: "snipe-sync", runId };
  await safeWriteSystemLog({ level: "info", message: "Snipe-IT sync started", context: jobContext });

  let finalAssetsProcessed = 0;
  let finalErrorMessage: string | null = null;
  let finalStatus: "success" | "error" = "success";

  try {
    const categories = await listAll<SnipeCategory>(requestConfig, "/categories");
    const locations = await listAll<SnipeLocation>(requestConfig, "/locations");
    const assets = await listAll<SnipeHardware>(requestConfig, "/hardware");

    await upsertCategories(categories);
    const deactivatedCategoriesCount = await deactivateMissingCategories(categories.map((c) => c.id));
    await upsertLocations(locations);
    const categoryIdBySnipeCategoryId = await loadCategoryIdMap();
    const locationIdBySnipeLocationId = await loadLocationIdMap();
    const assetsProcessed = await upsertAssets(assets, categoryIdBySnipeCategoryId, locationIdBySnipeLocationId, runId);
    const archivedMissingCount = await archiveMissingAssets(syncStartedAt, assets.map((a) => a.id));

    finalAssetsProcessed = assetsProcessed;

    await safeWriteSystemLog({
      level: "info",
      message: "Snipe-IT sync completed",
      context: {
        ...jobContext,
        categories: categories.length,
        locations: locations.length,
        assets: assetsProcessed,
        archivedMissing: archivedMissingCount,
          deactivatedCategories: deactivatedCategoriesCount,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    finalStatus = "error";
    finalErrorMessage = message;
    await safeWriteSystemLog({ level: "error", message: "Snipe-IT sync failed", context: { ...jobContext, error: message } });
    throw err;
  } finally {
    if (runId) {
      try {
        await db
          .request()
          .input("runId", sql.UniqueIdentifier, runId)
          .input("status", sql.NVarChar(32), finalStatus)
          .input("assetsProcessed", sql.Int, finalAssetsProcessed)
          .input("errorMessage", sql.NVarChar(2048), finalErrorMessage)
          .query(
            [
              "UPDATE pm.SnipeSyncRuns",
              "SET",
              "  CompletedAt = sysutcdatetime(),",
              "  Status = @status,",
              "  AssetsProcessed = @assetsProcessed,",
              "  ErrorMessage = @errorMessage",
              "WHERE SnipeSyncRunId = @runId",
            ].join("\n"),
          );
      } catch {
        await safeWriteSystemLog({
          level: "error",
          message: "Failed to update SnipeSyncRuns status",
          context: { ...jobContext, status: finalStatus, assetsProcessed: finalAssetsProcessed },
        });
      }
    }
  }
};
