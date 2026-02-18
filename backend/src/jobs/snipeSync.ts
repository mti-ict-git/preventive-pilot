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

type SnipeCustomFieldValue = {
  value?: string | null;
  field?: string | null;
  name?: string | null;
  label?: string | null;
  db_column_name?: string | null;
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
  custom_fields?: Record<string, SnipeCustomFieldValue | null> | null;
  assigned_to?: {
    name?: string | null;
    username?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null;
  notes?: string | null;
  image?: string | null;
};

type AssetOperationalStatus = "operational" | "broken" | "archived";

const toOperationalStatus = (statusLabelName: string | null): AssetOperationalStatus => {
  const normalized = (statusLabelName ?? "").trim().toLowerCase();
  if (/^archived\b/.test(normalized)) return "archived";
  if (/^broken\b/.test(normalized)) return "broken";
  return "operational";
};

const normalizeCustomFieldText = (value?: string | null): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getCustomFieldValue = (
  customFields: SnipeHardware["custom_fields"],
  lookup: { exact: string[]; contains?: string[] },
): string | null => {
  if (!customFields) return null;
  const normalizedCandidates = new Set(lookup.exact.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const normalizedContains = (lookup.contains ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  for (const [key, field] of Object.entries(customFields)) {
    const keyText = key.trim().toLowerCase();
    const keyMatch = normalizedCandidates.has(keyText);
    const dbColumn = normalizeCustomFieldText(field?.db_column_name);
    const fieldName = normalizeCustomFieldText(field?.field);
    const name = normalizeCustomFieldText(field?.name);
    const label = normalizeCustomFieldText(field?.label);
    const exactMatch =
      keyMatch ||
      (dbColumn ? normalizedCandidates.has(dbColumn.toLowerCase()) : false) ||
      (fieldName ? normalizedCandidates.has(fieldName.toLowerCase()) : false) ||
      (name ? normalizedCandidates.has(name.toLowerCase()) : false) ||
      (label ? normalizedCandidates.has(label.toLowerCase()) : false);
    const containsMatch =
      normalizedContains.length === 0
        ? false
        : normalizedContains.some((term) =>
            [
              keyText,
              dbColumn?.toLowerCase() ?? "",
              fieldName?.toLowerCase() ?? "",
              name?.toLowerCase() ?? "",
              label?.toLowerCase() ?? "",
            ].some((value) => value.includes(term)),
          );
    if (!exactMatch && !containsMatch) continue;
    const value = normalizeCustomFieldText(field?.value);
    if (value) return value;
  }
  return null;
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

type DownloadedImage = {
  data: Buffer | null;
  contentType: string | null;
  fileName: string | null;
};

const downloadAssetImage = async (imageBaseUrl: string | null, imagePath: string | null): Promise<DownloadedImage> => {
  if (!imageBaseUrl || !imagePath) {
    return { data: null, contentType: null, fileName: null };
  }

  const trimmedPath = imagePath.trim();
  if (!trimmedPath) {
    return { data: null, contentType: null, fileName: null };
  }

  const isAbsolute = /^https?:\/\//i.test(trimmedPath);
  const base = imageBaseUrl.replace(/\/+$/, "");
  const pathPart = trimmedPath.replace(/^\/+/, "");
  const fullUrl = isAbsolute ? trimmedPath : `${base}/${pathPart}`;

  try {
    const response = await fetch(fullUrl);
    if (!response.ok) {
      return { data: null, contentType: null, fileName: null };
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength === 0) {
      return { data: null, contentType: null, fileName: null };
    }

    const buffer = Buffer.from(arrayBuffer);
    const headerContentType = response.headers.get("content-type");
    const contentType = headerContentType && headerContentType.trim().length > 0 ? headerContentType : null;
    const fileName = pathPart.split("/").pop() ?? null;

    return { data: buffer, contentType, fileName };
  } catch {
    return { data: null, contentType: null, fileName: null };
  }
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
  imageBaseUrl: string | null,
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
    const responsibilityValue = getCustomFieldValue(a.custom_fields, {
      exact: ["_snipeit_asset_responsibility_6", "asset responsibility", "asset_responsibility", "responsibility"],
      contains: ["responsibility", "penanggung jawab", "penanggungjawab"],
    });
    const assignedToName =
      typeof a.assigned_to?.name === "string" && a.assigned_to.name.trim() ? a.assigned_to.name.trim() : null;
    const assignedToUsername =
      typeof a.assigned_to?.username === "string" && a.assigned_to.username.trim()
        ? a.assigned_to.username.trim()
        : null;
    const assignedToFirst =
      typeof a.assigned_to?.first_name === "string" && a.assigned_to.first_name.trim()
        ? a.assigned_to.first_name.trim()
        : null;
    const assignedToLast =
      typeof a.assigned_to?.last_name === "string" && a.assigned_to.last_name.trim()
        ? a.assigned_to.last_name.trim()
        : null;
    const assignedToFullName = [assignedToFirst, assignedToLast].filter(Boolean).join(" ").trim();
    const assignedToBase = assignedToName ?? (assignedToFullName ? assignedToFullName : null) ?? assignedToUsername;
    const assignedToSuffix =
      assignedToUsername && assignedToUsername !== assignedToBase ? `(${assignedToUsername})` : null;
    const assetResponsibility = responsibilityValue;
    const assignedToText = assignedToBase ? [assignedToBase, assignedToSuffix].filter(Boolean).join(" ") : null;
    const notes = a.notes ?? null;
    const assetTag = a.asset_tag ?? null;
    const imagePath = typeof a.image === "string" && a.image.trim() ? a.image.trim() : null;
    const downloadedImage = await downloadAssetImage(imageBaseUrl, imagePath);

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
      .input("assetResponsibility", sql.NVarChar(256), assetResponsibility)
      .input("notes", sql.NVarChar(sql.MAX), notes)
      .input("imageUrl", sql.NVarChar(512), imagePath)
      .input("imageData", sql.VarBinary(sql.MAX), downloadedImage.data)
      .input("imageContentType", sql.NVarChar(128), downloadedImage.contentType)
      .input("imageFileName", sql.NVarChar(256), downloadedImage.fileName)
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
          "    AssetResponsibility = @assetResponsibility,",
          "    Notes = @notes,",
          "    ImageUrl = @imageUrl,",
          "    ImageData = @imageData,",
          "    ImageContentType = @imageContentType,",
          "    ImageFileName = @imageFileName,",
          "    IsArchived = 0,",
          "    LastSyncedAt = sysutcdatetime(),",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (",
          "    SnipeAssetId, AssetTag, Name, Manufacturer, Model, SerialNumber, CategoryId, LocationId, AssetStatus, AssignedToText, AssetResponsibility, AssetOperationalStatus, Notes, ImageUrl, ImageData, ImageContentType, ImageFileName, IsArchived, LastSyncedAt",
          "  )",
          "  VALUES (",
          "    @snipeAssetId, @assetTag, @name, @manufacturer, @model, @serialNumber, @categoryId, @locationId, @assetStatus, @assignedToText, @assetResponsibility, @assetOperationalStatus, @notes, @imageUrl, @imageData, @imageContentType, @imageFileName, 0, sysutcdatetime()",
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
    const imageBaseUrl = normalizeInstanceUrl(settings.baseUrl);
    const assetsProcessed = await upsertAssets(assets, categoryIdBySnipeCategoryId, locationIdBySnipeLocationId, imageBaseUrl, runId);
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
