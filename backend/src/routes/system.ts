import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { env } from "../config/env.js";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole, requireSuperadmin } from "../middleware/requireRole.js";
import { runJobNow, type JobName } from "../jobs/index.js";
import { runEvidenceImportJob } from "../jobs/evidenceImport.js";
import bcrypt from "bcryptjs";
import { lookupLdapUser, searchLdapUsers } from "../auth/ldap.js";
import { upsertLdapUser } from "../db/users.js";

const requireSystemAdmin = requireAnyRole(["Superadmin", "Admin"]);

const StatusJobSchema = z.enum(["snipe-sync", "schedule-calc", "notifications"]);

const EvidenceImportRunSchema = z.object({
  templateId: z.string().uuid().nullable().optional(),
  duplicateAction: z.enum(["skip", "replace"]).optional().default("skip"),
  maxFiles: z.number().int().min(1).max(20000).optional(),
  dryRun: z.boolean().optional(),
});

const LogsQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  level: z.string().max(16).optional(),
});

const UsersQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  search: z.string().optional(),
  isActive: z.enum(["true", "false"]).optional(),
});

const UpdateUserRolesSchema = z.object({
  roles: z.array(z.string().min(1).max(64)).length(1),
  isActive: z.boolean().optional(),
});

const CreateLocalUserSchema = z.object({
  username: z.string().min(1).max(128),
  displayName: z.string().trim().max(256).nullable().optional(),
  email: z.string().email().trim().max(256).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  password: z.string().min(6).max(128),
  roleName: z.string().min(1).max(64),
  isActive: z.boolean().optional().default(true),
});

const AssignLdapUserSchema = z.object({
  identifier: z.string().min(1).max(256),
  roleName: z.string().min(1).max(64),
  isActive: z.boolean().optional().default(true),
});

const LdapSearchQuerySchema = z.object({
  q: z.string().min(1).max(256).optional(),
  query: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const nullIfBlank = (value: unknown): unknown => {
  return typeof value === "string" && value.trim() === "" ? null : value;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

const bitToBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "1" || v === "true") return true;
    if (v === "0" || v === "false") return false;
  }
  if (value instanceof Uint8Array) {
    return value.length > 0 && value[0] === 1;
  }
  return false;
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

type EffectiveMicrosoftGraphSettings = {
  tenantId: string | null;
  clientId: string | null;
  clientSecretConfigured: boolean;
  scope: string[];
  senderEmail: string | null;
  useLoggedInUserAsSender: boolean;
  defaultToRecipients: string[];
  defaultCcRecipients: string[];
  defaultBccRecipients: string[];
  emailSubjectTemplate: string | null;
  emailBodyTemplate: string | null;
  enabled: boolean;
  lastConnectionTestAt: string | null;
};

type EffectiveWhatsAppSettings = {
  enabled: boolean;
  baseUrl: string | null;
  target: "single" | "group";
  defaultNumber: string | null;
  groupId: string | null;
  groupName: string | null;
  mentionNumbers: string[];
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

const loadEffectiveMicrosoftGraphSettings = async (): Promise<EffectiveMicrosoftGraphSettings> => {
  let dbRow: Record<string, unknown> | null = null;
  try {
    const db = await getDb();
    const result = await db
      .request()
      .query(
        [
          "SELECT TOP (1)",
          "  TenantId, ClientId, ClientSecret, ScopeJson, SenderEmail, UseLoggedInUserAsSender,",
          "  DefaultToRecipientsJson, DefaultCcRecipientsJson, DefaultBccRecipientsJson,",
          "  EmailSubjectTemplate, EmailBodyTemplate, Enabled, LastConnectionTestAt",
          "FROM pm.MicrosoftGraphSettings",
          "ORDER BY UpdatedAt DESC",
        ].join("\n"),
      );
    dbRow = (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
  } catch {
    dbRow = null;
  }

  const parseStringArrayJson = (value: unknown): string[] => {
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const parsed: unknown = JSON.parse(value);
      if (!Array.isArray(parsed)) return [];
      const result: string[] = [];
      for (const item of parsed) {
        if (typeof item === "string" && item.trim()) result.push(item.trim());
      }
      return result;
    } catch {
      return [];
    }
  };

  const envScope = env.MS_GRAPH_SCOPE?.trim() ?? "";
  const scopeFromEnv = envScope ? envScope.split(/[\s,]+/).filter((s) => s.length > 0) : [];
  const dbScopeJsonRaw = dbRow?.ScopeJson;
  const hasDbScope = typeof dbScopeJsonRaw === "string" && dbScopeJsonRaw.trim().length > 0;
  const dbScope = parseStringArrayJson(dbScopeJsonRaw);

  const envDefaultTo = env.MS_GRAPH_DEFAULT_TO?.trim() ?? "";
  const envDefaultCc = env.MS_GRAPH_DEFAULT_CC?.trim() ?? "";
  const envDefaultBcc = env.MS_GRAPH_DEFAULT_BCC?.trim() ?? "";

  const tenantId =
    (typeof dbRow?.TenantId === "string" && dbRow.TenantId.trim() ? dbRow.TenantId.trim() : null) ??
    (env.MS_GRAPH_TENANT_ID?.trim() ? env.MS_GRAPH_TENANT_ID.trim() : null);

  const clientId =
    (typeof dbRow?.ClientId === "string" && dbRow.ClientId.trim() ? dbRow.ClientId.trim() : null) ??
    (env.MS_GRAPH_CLIENT_ID?.trim() ? env.MS_GRAPH_CLIENT_ID.trim() : null);

  const clientSecretConfigured =
    (typeof dbRow?.ClientSecret === "string" && dbRow.ClientSecret.trim().length > 0) ||
    Boolean(env.MS_GRAPH_CLIENT_SECRET && env.MS_GRAPH_CLIENT_SECRET.trim().length > 0);

  const senderEmail =
    (typeof dbRow?.SenderEmail === "string" && dbRow.SenderEmail.trim() ? dbRow.SenderEmail.trim() : null) ??
    (env.MS_GRAPH_SENDER_EMAIL?.trim() ? env.MS_GRAPH_SENDER_EMAIL.trim() : null);

  const useLoggedInUserAsSenderRaw = dbRow?.UseLoggedInUserAsSender;
  const useLoggedInUserAsSender =
    typeof useLoggedInUserAsSenderRaw === "boolean"
      ? useLoggedInUserAsSenderRaw
      : typeof useLoggedInUserAsSenderRaw === "number"
        ? useLoggedInUserAsSenderRaw === 1
        : env.MS_GRAPH_USE_LOGGED_IN_USER_AS_SENDER;

  const defaultToRecipientsJsonRaw = dbRow?.DefaultToRecipientsJson;
  const defaultCcRecipientsJsonRaw = dbRow?.DefaultCcRecipientsJson;
  const defaultBccRecipientsJsonRaw = dbRow?.DefaultBccRecipientsJson;
  const hasDbDefaultTo = typeof defaultToRecipientsJsonRaw === "string" && defaultToRecipientsJsonRaw.trim().length > 0;
  const hasDbDefaultCc = typeof defaultCcRecipientsJsonRaw === "string" && defaultCcRecipientsJsonRaw.trim().length > 0;
  const hasDbDefaultBcc = typeof defaultBccRecipientsJsonRaw === "string" && defaultBccRecipientsJsonRaw.trim().length > 0;
  const defaultToRecipientsDb = parseStringArrayJson(defaultToRecipientsJsonRaw);
  const defaultCcRecipientsDb = parseStringArrayJson(defaultCcRecipientsJsonRaw);
  const defaultBccRecipientsDb = parseStringArrayJson(defaultBccRecipientsJsonRaw);

  const defaultToRecipientsEnv = envDefaultTo
    ? envDefaultTo.split(/[;,]+/).map((v) => v.trim()).filter((v) => v.length > 0)
    : [];
  const defaultCcRecipientsEnv = envDefaultCc
    ? envDefaultCc.split(/[;,]+/).map((v) => v.trim()).filter((v) => v.length > 0)
    : [];
  const defaultBccRecipientsEnv = envDefaultBcc
    ? envDefaultBcc.split(/[;,]+/).map((v) => v.trim()).filter((v) => v.length > 0)
    : [];

  const emailSubjectTemplate =
    (typeof dbRow?.EmailSubjectTemplate === "string" && dbRow.EmailSubjectTemplate.trim()
      ? dbRow.EmailSubjectTemplate.trim()
      : null) ?? (env.MS_GRAPH_EMAIL_SUBJECT_TEMPLATE?.trim() ? env.MS_GRAPH_EMAIL_SUBJECT_TEMPLATE.trim() : null);

  const emailBodyTemplate =
    (typeof dbRow?.EmailBodyTemplate === "string" && dbRow.EmailBodyTemplate.trim()
      ? dbRow.EmailBodyTemplate.trim()
      : null) ?? (env.MS_GRAPH_EMAIL_BODY_TEMPLATE?.trim() ? env.MS_GRAPH_EMAIL_BODY_TEMPLATE.trim() : null);

  const enabledRaw = dbRow?.Enabled;
  const enabled =
    typeof enabledRaw === "boolean"
      ? enabledRaw
      : typeof enabledRaw === "number"
        ? enabledRaw === 1
        : env.MS_GRAPH_ENABLED;

  const lastConnectionTestAtValue = dbRow?.LastConnectionTestAt;
  const lastConnectionTestAt =
    lastConnectionTestAtValue instanceof Date
      ? lastConnectionTestAtValue.toISOString()
      : typeof lastConnectionTestAtValue === "string"
        ? lastConnectionTestAtValue
        : null;

  return {
    tenantId,
    clientId,
    clientSecretConfigured,
    scope: hasDbScope ? dbScope : scopeFromEnv,
    senderEmail,
    useLoggedInUserAsSender,
    defaultToRecipients: hasDbDefaultTo ? defaultToRecipientsDb : defaultToRecipientsEnv,
    defaultCcRecipients: hasDbDefaultCc ? defaultCcRecipientsDb : defaultCcRecipientsEnv,
    defaultBccRecipients: hasDbDefaultBcc ? defaultBccRecipientsDb : defaultBccRecipientsEnv,
    emailSubjectTemplate,
    emailBodyTemplate,
    enabled,
    lastConnectionTestAt,
  };
};

const loadMicrosoftGraphSecretFromSources = async (): Promise<string | null> => {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .query(
        [
          "SELECT TOP (1)",
          "  ClientSecret",
          "FROM pm.MicrosoftGraphSettings",
          "ORDER BY UpdatedAt DESC",
        ].join("\n"),
      );
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    const value = typeof row?.ClientSecret === "string" ? row.ClientSecret.trim() : "";
    if (value) return value;
  } catch (err) {
    void err;
  }
  const envSecret = env.MS_GRAPH_CLIENT_SECRET?.trim() ?? "";
  return envSecret ? envSecret : null;
};

const loadMicrosoftGraphLastConnectionTestAt = async (): Promise<Date | null> => {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .query(
        [
          "SELECT TOP (1)",
          "  LastConnectionTestAt",
          "FROM pm.MicrosoftGraphSettings",
          "ORDER BY UpdatedAt DESC",
        ].join("\n"),
      );
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    const value = row?.LastConnectionTestAt;
    return value instanceof Date ? value : null;
  } catch {
    return null;
  }
};

const SnipeItSettingsUpdateSchema = z.object({
  baseUrl: z.preprocess(nullIfBlank, z.string().trim().max(512).nullable()),
  apiToken: z.preprocess(nullIfBlank, z.string().trim().max(2048).nullable()).optional(),
  autoSyncEnabled: z.boolean(),
  syncIntervalMinutes: z.number().int().min(1).max(1440),
});

const SnipeItSettingsTestSchema = SnipeItSettingsUpdateSchema.partial().optional();

const MicrosoftGraphSettingsUpdateSchema = z.object({
  tenantId: z.preprocess(nullIfBlank, z.string().trim().max(64).nullable()),
  clientId: z.preprocess(nullIfBlank, z.string().trim().max(64).nullable()),
  clientSecret: z.preprocess(nullIfBlank, z.string().trim().max(2048).nullable()).optional(),
  scope: z.array(z.string().trim().min(1).max(256)).max(20).optional().default([]),
  senderEmail: z.preprocess(nullIfBlank, z.string().trim().max(256).nullable()),
  useLoggedInUserAsSender: z.boolean(),
  defaultToRecipients: z.array(z.string().trim().min(1).max(256)).max(50).optional().default([]),
  defaultCcRecipients: z.array(z.string().trim().min(1).max(256)).max(50).optional().default([]),
  defaultBccRecipients: z.array(z.string().trim().min(1).max(256)).max(50).optional().default([]),
  emailSubjectTemplate: z.preprocess(nullIfBlank, z.string().trim().max(512).nullable()),
  emailBodyTemplate: z.preprocess(nullIfBlank, z.string().trim().max(20000).nullable()),
  enabled: z.boolean(),
});

const MicrosoftGraphSettingsTestSchema = MicrosoftGraphSettingsUpdateSchema.partial()
  .extend({
    sendTestEmail: z.boolean().optional(),
  })
  .optional();

const toGraphRecipients = (addresses: string[]) => {
  return addresses.map((address) => ({ emailAddress: { address } }));
};

const AssetsUiSettingsSchema = z.object({
  visibleCategoryIds: z.array(z.string().uuid()).min(1).nullable(),
});

const LabelDesignerUiSettingsSchema = z.object({
  qrPayloadMode: z.enum(["assetId", "assetTag", "snipeItUrl"]),
  gridColumns: z.number().int().min(1).max(6),
  config: z.object({
    width: z.number().int().min(10).max(200),
    height: z.number().int().min(10).max(200),
    qrSize: z.number().int().min(5).max(200),
    showAssetTag: z.boolean(),
    showAssetName: z.boolean(),
    showCategory: z.boolean(),
    showLocation: z.boolean(),
    showCustomText: z.boolean(),
    customText: z.string().max(256),
    fontSize: z.number().int().min(5).max(24),
    padding: z.number().int().min(0).max(20),
    borderRadius: z.number().int().min(0).max(20),
    showBorder: z.boolean(),
    showLogo: z.boolean(),
    orientation: z.enum(["portrait", "landscape"]),
  }),
});

const WhatsAppSettingsSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.preprocess(nullIfBlank, z.string().trim().max(512).nullable()),
  target: z.enum(["single", "group"]),
  defaultNumber: z.preprocess(nullIfBlank, z.string().trim().max(64).nullable()),
  groupId: z.preprocess(nullIfBlank, z.string().trim().max(128).nullable()),
  groupName: z.preprocess(nullIfBlank, z.string().trim().max(256).nullable()),
  mentionNumbers: z.array(z.string().trim().min(1).max(64)).max(50).optional().default([]),
});

const WhatsAppSettingsTestSchema = WhatsAppSettingsSchema.partial()
  .extend({
    sendTestMessage: z.boolean().optional(),
  })
  .optional();

const ASSETS_VISIBLE_CATEGORY_IDS_SETTING_KEY = "ui.assets.visibleCategoryIds";

const LABEL_DESIGNER_UI_SETTINGS_KEY = "ui.labelDesigner";

const WHATSAPP_SETTINGS_KEY = "notifications.whatsapp";

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

const parseLabelDesignerUiSettings = (
  valueJson: string | null,
): z.infer<typeof LabelDesignerUiSettingsSchema> => {
  const defaults: z.infer<typeof LabelDesignerUiSettingsSchema> = {
    qrPayloadMode: "assetId",
    gridColumns: 3,
    config: {
      width: 50,
      height: 30,
      qrSize: 20,
      showAssetTag: true,
      showAssetName: true,
      showCategory: false,
      showLocation: false,
      showCustomText: false,
      customText: "Property of IT Dept",
      fontSize: 8,
      padding: 4,
      borderRadius: 2,
      showBorder: true,
      showLogo: false,
      orientation: "landscape",
    },
  };

  if (!valueJson || !valueJson.trim()) return defaults;
  try {
    const parsed: unknown = JSON.parse(valueJson);
    const validated = LabelDesignerUiSettingsSchema.safeParse(parsed);
    if (!validated.success) return defaults;
    return validated.data;
  } catch {
    return defaults;
  }
};

const loadLabelDesignerUiSettings = async (): Promise<z.infer<typeof LabelDesignerUiSettingsSchema>> => {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("settingKey", sql.NVarChar(128), LABEL_DESIGNER_UI_SETTINGS_KEY)
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
    return parseLabelDesignerUiSettings(valueJson);
  } catch (err: unknown) {
    if (isInvalidObjectNameError(err)) {
      return parseLabelDesignerUiSettings(null);
    }
    throw err;
  }
};

const parseWhatsAppSettings = (valueJson: string | null): EffectiveWhatsAppSettings => {
  const defaults: EffectiveWhatsAppSettings = {
    enabled: false,
    baseUrl: null,
    target: "group",
    defaultNumber: null,
    groupId: null,
    groupName: null,
    mentionNumbers: [],
  };

  if (!valueJson || !valueJson.trim()) return defaults;
  try {
    const parsed: unknown = JSON.parse(valueJson);
    const validated = WhatsAppSettingsSchema.safeParse(parsed);
    if (!validated.success) return defaults;

    const data = validated.data;
    const baseUrl = data.baseUrl ? data.baseUrl.replace(/\/+$/, "") : null;
    return {
      enabled: data.enabled,
      baseUrl,
      target: data.target,
      defaultNumber: data.defaultNumber,
      groupId: data.groupId,
      groupName: data.groupName,
      mentionNumbers: data.mentionNumbers ?? [],
    };
  } catch {
    return defaults;
  }
};

const loadEffectiveWhatsAppSettings = async (): Promise<EffectiveWhatsAppSettings> => {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("settingKey", sql.NVarChar(128), WHATSAPP_SETTINGS_KEY)
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
    return parseWhatsAppSettings(valueJson);
  } catch (err: unknown) {
    if (isInvalidObjectNameError(err)) {
      return parseWhatsAppSettings(null);
    }
    throw err;
  }
};

const sendWhatsAppTestMessage = async (settings: EffectiveWhatsAppSettings, message: string): Promise<void> => {
  if (!settings.baseUrl) {
    throw new Error("WhatsApp base URL not configured");
  }

  const baseUrl = settings.baseUrl.replace(/\/+$/, "");
  const target = settings.target;

  if (target === "single") {
    if (!settings.defaultNumber) {
      throw new Error("WhatsApp number not configured");
    }

    const form = new FormData();
    form.set("number", settings.defaultNumber);
    form.set("message", message);

    const res = await fetch(`${baseUrl}/send-message`, { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`WhatsApp send-message failed (${res.status}) ${text}`.trim());
    }
    return;
  }

  if (!settings.groupId && !settings.groupName) {
    throw new Error("WhatsApp group id/name not configured");
  }

  const form = new FormData();
  if (settings.groupId) form.set("id", settings.groupId);
  if (!settings.groupId && settings.groupName) form.set("name", settings.groupName);
  form.set("message", message);
  if (settings.mentionNumbers.length > 0) {
    form.set("mention", JSON.stringify(settings.mentionNumbers));
  }

  const res = await fetch(`${baseUrl}/send-group-message`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WhatsApp send-group-message failed (${res.status}) ${text}`.trim());
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
  const msGraphSettings = await loadEffectiveMicrosoftGraphSettings();
  const whatsAppSettings = await loadEffectiveWhatsAppSettings();

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
    notifications: {
      msGraph: {
        enabled: msGraphSettings.enabled,
        senderEmail: msGraphSettings.senderEmail,
        useLoggedInUserAsSender: msGraphSettings.useLoggedInUserAsSender,
        scope: msGraphSettings.scope,
        defaultToRecipients: msGraphSettings.defaultToRecipients,
        defaultCcRecipients: msGraphSettings.defaultCcRecipients,
        defaultBccRecipients: msGraphSettings.defaultBccRecipients,
        emailSubjectTemplate: msGraphSettings.emailSubjectTemplate,
        emailBodyTemplate: msGraphSettings.emailBodyTemplate,
        lastConnectionTestAt: msGraphSettings.lastConnectionTestAt,
        tenantId: msGraphSettings.tenantId,
        clientId: msGraphSettings.clientId,
        clientSecretConfigured: msGraphSettings.clientSecretConfigured,
      },
      whatsApp: {
        enabled: whatsAppSettings.enabled,
        target: whatsAppSettings.target,
        baseUrl: whatsAppSettings.baseUrl,
        defaultNumber: whatsAppSettings.defaultNumber,
        groupId: whatsAppSettings.groupId,
        groupName: whatsAppSettings.groupName,
        mentionNumbers: whatsAppSettings.mentionNumbers,
      },
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

systemRouter.get("/microsoft-graph-settings", async (_req, res) => {
  const settings = await loadEffectiveMicrosoftGraphSettings();
  res.json(settings);
});

systemRouter.get("/whatsapp-settings", async (_req, res) => {
  const settings = await loadEffectiveWhatsAppSettings();
  res.json(settings);
});

systemRouter.post("/microsoft-graph-settings/test", requireSystemAdmin, async (req, res) => {
  const parsed = MicrosoftGraphSettingsTestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const effective = await loadEffectiveMicrosoftGraphSettings();
  const tenantId = parsed.data?.tenantId ?? effective.tenantId;
  const clientId = parsed.data?.clientId ?? effective.clientId;
  const senderEmail = parsed.data?.senderEmail ?? effective.senderEmail;
  const useLoggedInUserAsSender = parsed.data?.useLoggedInUserAsSender ?? effective.useLoggedInUserAsSender;
  const scope = parsed.data?.scope ?? effective.scope;
  const defaultToRecipients = parsed.data?.defaultToRecipients ?? effective.defaultToRecipients;
  const defaultCcRecipients = parsed.data?.defaultCcRecipients ?? effective.defaultCcRecipients;
  const defaultBccRecipients = parsed.data?.defaultBccRecipients ?? effective.defaultBccRecipients;
  const emailSubjectTemplate = parsed.data?.emailSubjectTemplate ?? effective.emailSubjectTemplate;
  const emailBodyTemplate = parsed.data?.emailBodyTemplate ?? effective.emailBodyTemplate;
  const enabled = parsed.data?.enabled ?? effective.enabled;
  const clientSecretOverride = parsed.data?.clientSecret ?? null;
  const sendTestEmail = parsed.data?.sendTestEmail ?? false;

  if (!tenantId || !clientId || !senderEmail || scope.length === 0) {
    res.status(400).json({ message: "Microsoft Graph not fully configured" });
    return;
  }

  if (sendTestEmail && !enabled) {
    res.status(400).json({ message: "Microsoft Graph notifications disabled" });
    return;
  }

  const clientSecret = clientSecretOverride ?? (await loadMicrosoftGraphSecretFromSources());
  if (!clientSecret) {
    res.status(400).json({ message: "Client secret not configured" });
    return;
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", clientId);
  body.set("client_secret", clientSecret);
  body.set("scope", scope.join(" "));
  body.set("grant_type", "client_credentials");

  try {
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      res.status(400).json({ message: `Token request failed (${tokenRes.status}) ${text}`.trim() });
      return;
    }

    const tokenJson = (await tokenRes.json()) as unknown;
    const accessToken =
      typeof tokenJson === "object" && tokenJson !== null && "access_token" in tokenJson &&
      typeof (tokenJson as { access_token?: unknown }).access_token === "string"
        ? (tokenJson as { access_token: string }).access_token
        : "";

    if (!accessToken) {
      res.status(400).json({ message: "Token response missing access_token" });
      return;
    }

    if (sendTestEmail) {
      if (defaultToRecipients.length === 0 && defaultCcRecipients.length === 0 && defaultBccRecipients.length === 0) {
        res.status(400).json({ message: "No recipients configured (default to/cc/bcc)" });
        return;
      }

      const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(senderEmail)}/sendMail`;
      const subject = emailSubjectTemplate?.trim() ? emailSubjectTemplate.trim() : "Microsoft Graph Test Email";
      const bodyContent = emailBodyTemplate?.trim()
        ? emailBodyTemplate.trim()
        : `Test email sent at ${new Date().toISOString()}`;

      const sendRes = await fetch(sendUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            subject,
            body: { contentType: "Text", content: bodyContent },
            toRecipients: toGraphRecipients(defaultToRecipients),
            ccRecipients: toGraphRecipients(defaultCcRecipients),
            bccRecipients: toGraphRecipients(defaultBccRecipients),
          },
          saveToSentItems: false,
        }),
      });

      if (!sendRes.ok) {
        const text = await sendRes.text().catch(() => "");
        res.status(400).json({ message: `Graph sendMail failed (${sendRes.status}) ${text}`.trim() });
        return;
      }
    }

    const now = new Date();
    try {
      const db = await getDb();
      await db
        .request()
        .input("tenantId", sql.NVarChar(64), tenantId)
        .input("clientId", sql.NVarChar(64), clientId)
        .input("clientSecret", sql.NVarChar(2048), clientSecret)
        .input("scopeJson", sql.NVarChar(sql.MAX), JSON.stringify(scope))
        .input("senderEmail", sql.NVarChar(256), senderEmail)
        .input("useLoggedInUserAsSender", sql.Bit, useLoggedInUserAsSender ? 1 : 0)
        .input("defaultToRecipientsJson", sql.NVarChar(sql.MAX), JSON.stringify(defaultToRecipients))
        .input("defaultCcRecipientsJson", sql.NVarChar(sql.MAX), JSON.stringify(defaultCcRecipients))
        .input("defaultBccRecipientsJson", sql.NVarChar(sql.MAX), JSON.stringify(defaultBccRecipients))
        .input("emailSubjectTemplate", sql.NVarChar(512), emailSubjectTemplate)
        .input("emailBodyTemplate", sql.NVarChar(sql.MAX), emailBodyTemplate)
        .input("enabled", sql.Bit, enabled ? 1 : 0)
        .input("lastConnectionTestAt", sql.DateTime2(0), now)
        .query(
          [
            "INSERT INTO pm.MicrosoftGraphSettings (",
            "  TenantId, ClientId, ClientSecret, ScopeJson, SenderEmail, UseLoggedInUserAsSender,",
            "  DefaultToRecipientsJson, DefaultCcRecipientsJson, DefaultBccRecipientsJson,",
            "  EmailSubjectTemplate, EmailBodyTemplate, Enabled, LastConnectionTestAt",
            ")",
            "VALUES (",
            "  @tenantId, @clientId, @clientSecret, @scopeJson, @senderEmail, @useLoggedInUserAsSender,",
            "  @defaultToRecipientsJson, @defaultCcRecipientsJson, @defaultBccRecipientsJson,",
            "  @emailSubjectTemplate, @emailBodyTemplate, @enabled, @lastConnectionTestAt",
            ");",
          ].join("\n"),
        );
    } catch (err: unknown) {
      if (isInvalidObjectNameError(err)) {
        res
          .status(503)
          .json({ message: "Database schema missing pm.MicrosoftGraphSettings. Run npm run db:apply-schema." });
        return;
      }
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ message });
      return;
    }

    res.json({
      ok: true,
      accessTokenPresent: Boolean(accessToken),
      lastConnectionTestAt: now.toISOString(),
      testEmailSent: sendTestEmail,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ message });
  }
});

systemRouter.post("/whatsapp-settings/test", requireSystemAdmin, async (req, res) => {
  const parsed = WhatsAppSettingsTestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const effective = await loadEffectiveWhatsAppSettings();
  const enabled = parsed.data?.enabled ?? effective.enabled;
  const baseUrl = parsed.data?.baseUrl ?? effective.baseUrl;
  const target = parsed.data?.target ?? effective.target;
  const defaultNumber = parsed.data?.defaultNumber ?? effective.defaultNumber;
  const groupId = parsed.data?.groupId ?? effective.groupId;
  const groupName = parsed.data?.groupName ?? effective.groupName;
  const mentionNumbers = parsed.data?.mentionNumbers ?? effective.mentionNumbers;
  const sendTestMessage = parsed.data?.sendTestMessage ?? false;

  if (sendTestMessage && !enabled) {
    res.status(400).json({ message: "WhatsApp notifications disabled" });
    return;
  }

  const resolved: EffectiveWhatsAppSettings = {
    enabled,
    baseUrl,
    target,
    defaultNumber,
    groupId,
    groupName,
    mentionNumbers,
  };

  if (!sendTestMessage) {
    if (!resolved.baseUrl) {
      res.status(400).json({ message: "WhatsApp base URL not configured" });
      return;
    }
    res.json({ ok: true });
    return;
  }

  try {
    const message = `Preventive Pilot WhatsApp test at ${new Date().toISOString()}`;
    await sendWhatsAppTestMessage(resolved, message);
    res.json({ ok: true, testMessageSent: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ message });
  }
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

systemRouter.get("/ui-settings/label-designer", async (_req, res) => {
  try {
    const settings = await loadLabelDesignerUiSettings();
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

systemRouter.put("/ui-settings/label-designer", requireSystemAdmin, async (req, res) => {
  const parsed = LabelDesignerUiSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const valueJson = JSON.stringify(parsed.data);

  try {
    const db = await getDb();
    await db
      .request()
      .input("settingKey", sql.NVarChar(128), LABEL_DESIGNER_UI_SETTINGS_KEY)
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
      res.status(503).json({ message: "Database schema missing pm.SystemSettings. Run npm run db:apply-schema." });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
    return;
  }

  const updated = await loadLabelDesignerUiSettings();
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

systemRouter.put("/microsoft-graph-settings", requireSystemAdmin, async (req, res) => {
  const parsed = MicrosoftGraphSettingsUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const currentSecret = await loadMicrosoftGraphSecretFromSources();
  const clientSecret = parsed.data.clientSecret === undefined ? currentSecret : parsed.data.clientSecret;
  const lastTestAt = await loadMicrosoftGraphLastConnectionTestAt();

  try {
    const db = await getDb();
    await db
      .request()
      .input("tenantId", sql.NVarChar(64), parsed.data.tenantId)
      .input("clientId", sql.NVarChar(64), parsed.data.clientId)
      .input("clientSecret", sql.NVarChar(2048), clientSecret)
      .input("scopeJson", sql.NVarChar(sql.MAX), JSON.stringify(parsed.data.scope ?? []))
      .input("senderEmail", sql.NVarChar(256), parsed.data.senderEmail)
      .input("useLoggedInUserAsSender", sql.Bit, parsed.data.useLoggedInUserAsSender ? 1 : 0)
      .input("defaultToRecipientsJson", sql.NVarChar(sql.MAX), JSON.stringify(parsed.data.defaultToRecipients ?? []))
      .input("defaultCcRecipientsJson", sql.NVarChar(sql.MAX), JSON.stringify(parsed.data.defaultCcRecipients ?? []))
      .input("defaultBccRecipientsJson", sql.NVarChar(sql.MAX), JSON.stringify(parsed.data.defaultBccRecipients ?? []))
      .input("emailSubjectTemplate", sql.NVarChar(512), parsed.data.emailSubjectTemplate)
      .input("emailBodyTemplate", sql.NVarChar(sql.MAX), parsed.data.emailBodyTemplate)
      .input("enabled", sql.Bit, parsed.data.enabled ? 1 : 0)
      .input("lastConnectionTestAt", sql.DateTime2(0), lastTestAt)
      .query(
        [
          "INSERT INTO pm.MicrosoftGraphSettings (",
          "  TenantId, ClientId, ClientSecret, ScopeJson, SenderEmail, UseLoggedInUserAsSender,",
          "  DefaultToRecipientsJson, DefaultCcRecipientsJson, DefaultBccRecipientsJson,",
          "  EmailSubjectTemplate, EmailBodyTemplate, Enabled, LastConnectionTestAt",
          ")",
          "VALUES (",
          "  @tenantId, @clientId, @clientSecret, @scopeJson, @senderEmail, @useLoggedInUserAsSender,",
          "  @defaultToRecipientsJson, @defaultCcRecipientsJson, @defaultBccRecipientsJson,",
          "  @emailSubjectTemplate, @emailBodyTemplate, @enabled, @lastConnectionTestAt",
          ");",
        ].join("\n"),
      );
  } catch (err: unknown) {
    if (isInvalidObjectNameError(err)) {
      res
        .status(503)
        .json({ message: "Database schema missing pm.MicrosoftGraphSettings. Run npm run db:apply-schema." });
      return;
    }

    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
    return;
  }

  const updated = await loadEffectiveMicrosoftGraphSettings();
  res.json(updated);
});

systemRouter.put("/whatsapp-settings", requireSystemAdmin, async (req, res) => {
  const parsed = WhatsAppSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const baseUrl = parsed.data.baseUrl ? parsed.data.baseUrl.replace(/\/+$/, "") : null;
  const stored: EffectiveWhatsAppSettings = {
    enabled: parsed.data.enabled,
    baseUrl,
    target: parsed.data.target,
    defaultNumber: parsed.data.defaultNumber,
    groupId: parsed.data.groupId,
    groupName: parsed.data.groupName,
    mentionNumbers: parsed.data.mentionNumbers ?? [],
  };

  try {
    const db = await getDb();
    await db
      .request()
      .input("settingKey", sql.NVarChar(128), WHATSAPP_SETTINGS_KEY)
      .input("settingValueJson", sql.NVarChar(sql.MAX), JSON.stringify(stored))
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
      res.status(503).json({ message: "Database schema missing pm.SystemSettings. Run npm run db:apply-schema." });
      return;
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message });
    return;
  }

  const updated = await loadEffectiveWhatsAppSettings();
  res.json(updated);
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

  const locationsResult = await db
    .request()
    .query(
      [
        "SELECT",
        "  LocationId, Name, IsActive",
        "FROM pm.Locations",
        "ORDER BY Name ASC",
      ].join("\n"),
    );

  const roleRows = rolesResult.recordset as Array<Record<string, unknown>>;
  const categoryRows = categoriesResult.recordset as Array<Record<string, unknown>>;
  const locationRows = locationsResult.recordset as Array<Record<string, unknown>>;

  res.json({
    roles: roleRows.map((r) => ({
      id: r.RoleId,
      name: r.Name,
    })),
    assetCategories: categoryRows.map((c) => ({
      id: c.CategoryId,
      name: c.Name,
      isActive: bitToBoolean(c.IsActive),
    })),
    locations: locationRows.map((l) => ({
      id: l.LocationId,
      name: l.Name,
      isActive: bitToBoolean(l.IsActive),
    })),
  });
});

systemRouter.get("/users", requireSystemAdmin, async (req, res) => {
  const parsed = UsersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(parsed.data.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const search = parsed.data.search?.trim() ? `%${parsed.data.search.trim()}%` : null;
  const isActive = parsed.data.isActive ? (parsed.data.isActive === "true" ? 1 : 0) : null;

  const db = await getDb();

  const totalResult = await db
    .request()
    .input("search", sql.NVarChar(256), search)
    .input("isActive", sql.Bit, isActive)
    .query(
      [
        "SELECT COUNT(1) AS Total",
        "FROM pm.Users",
        "WHERE (@isActive IS NULL OR IsActive = @isActive)",
        "  AND (",
        "    @search IS NULL",
        "    OR Username LIKE @search",
        "    OR COALESCE(DisplayName, N'') LIKE @search",
        "    OR COALESCE(Email, N'') LIKE @search",
        "  )",
      ].join("\n"),
    );

  const totalRow = totalResult.recordset[0] as Record<string, unknown> | undefined;
  const total = totalRow && typeof totalRow.Total === "number" ? totalRow.Total : 0;

  const usersResult = await db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("search", sql.NVarChar(256), search)
    .input("isActive", sql.Bit, isActive)
    .query(
      [
        "SELECT",
        "  UserId, Username, DisplayName, Email, Phone, ExternalProvider, IsActive",
        "FROM pm.Users",
        "WHERE (@isActive IS NULL OR IsActive = @isActive)",
        "  AND (",
        "    @search IS NULL",
        "    OR Username LIKE @search",
        "    OR COALESCE(DisplayName, N'') LIKE @search",
        "    OR COALESCE(Email, N'') LIKE @search",
        "  )",
        "ORDER BY Username ASC",
        "OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY",
      ].join("\n"),
    );

  const userRows = usersResult.recordset as Array<Record<string, unknown>>;
  const userIds = userRows
    .map((r) => (typeof r.UserId === "string" ? r.UserId : null))
    .filter((v): v is string => Boolean(v));

  const rolesByUserId = new Map<string, string[]>();
  const completedByUserId = new Map<string, number>();

  if (userIds.length > 0) {
    const userIdsCsv = userIds.join(",");

    const rolesResult = await db
      .request()
      .input("userIdsCsv", sql.NVarChar(8192), userIdsCsv)
      .query(
        [
          "SELECT",
          "  ur.UserId AS UserId,",
          "  r.Name AS RoleName",
          "FROM pm.UserRoles ur",
          "INNER JOIN pm.Roles r ON r.RoleId = ur.RoleId",
          "WHERE ur.UserId IN (",
          "  SELECT TRY_CONVERT(uniqueidentifier, value)",
          "  FROM string_split(@userIdsCsv, ',')",
          ")",
        ].join("\n"),
      );

    const roleRows = rolesResult.recordset as Array<Record<string, unknown>>;
    for (const row of roleRows) {
      const userId = typeof row.UserId === "string" ? row.UserId : null;
      const roleName = typeof row.RoleName === "string" ? row.RoleName : null;
      if (!userId || !roleName) continue;
      const existing = rolesByUserId.get(userId) ?? [];
      existing.push(roleName);
      rolesByUserId.set(userId, existing);
    }

    const completedResult = await db
      .request()
      .input("userIdsCsv", sql.NVarChar(8192), userIdsCsv)
      .query(
        [
          "SELECT",
          "  CompletedByUserId AS UserId,",
          "  COUNT(1) AS CompletedCount",
          "FROM pm.PMTasks",
          "WHERE CompletedAt IS NOT NULL",
          "  AND CompletedByUserId IS NOT NULL",
          "  AND CompletedByUserId IN (",
          "    SELECT TRY_CONVERT(uniqueidentifier, value)",
          "    FROM string_split(@userIdsCsv, ',')",
          "  )",
          "GROUP BY CompletedByUserId",
        ].join("\n"),
      );

    const completedRows = completedResult.recordset as Array<Record<string, unknown>>;
    for (const row of completedRows) {
      const userId = typeof row.UserId === "string" ? row.UserId : null;
      const completedCount = typeof row.CompletedCount === "number" ? row.CompletedCount : null;
      if (!userId || completedCount === null) continue;
      completedByUserId.set(userId, completedCount);
    }
  }

  res.json({
    page,
    pageSize,
    total,
    items: userRows.map((r) => {
      const id = typeof r.UserId === "string" ? r.UserId : "";
      return {
        id,
        username: typeof r.Username === "string" ? r.Username : "",
        displayName: typeof r.DisplayName === "string" ? r.DisplayName : null,
        email: typeof r.Email === "string" ? r.Email : null,
        phone: typeof r.Phone === "string" ? r.Phone : null,
        externalProvider: typeof r.ExternalProvider === "string" ? r.ExternalProvider : null,
        isActive: bitToBoolean(r.IsActive),
        roles: rolesByUserId.get(id) ?? [],
        tasksCompleted: completedByUserId.get(id) ?? 0,
      };
    }),
  });
});

systemRouter.post("/users/:userId/refresh-ldap", requireSystemAdmin, async (req, res) => {
  const userId = req.params.userId;
  if (!z.string().uuid().safeParse(userId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const userResult = await db
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query(
      [
        "SELECT TOP (1)",
        "  Username,",
        "  ExternalProvider",
        "FROM pm.Users",
        "WHERE UserId = @userId",
      ].join("\n"),
    );

  const row = userResult.recordset[0] as { Username?: unknown; ExternalProvider?: unknown } | undefined;
  const username = typeof row?.Username === "string" ? row.Username : null;
  const externalProvider = typeof row?.ExternalProvider === "string" ? row.ExternalProvider : null;
  if (!username) {
    res.status(404).json({ message: "Not found" });
    return;
  }
  if (externalProvider !== "ldap") {
    res.status(400).json({ message: "Only LDAP users can be refreshed" });
    return;
  }

  try {
    const profile = await lookupLdapUser(username);
    await db
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("displayName", sql.NVarChar(256), profile.displayName)
      .input("email", sql.NVarChar(256), profile.email)
      .input("phone", sql.NVarChar(32), profile.phone)
      .query(
        [
          "UPDATE pm.Users",
          "SET DisplayName = @displayName,",
          "    Email = @email,",
          "    Phone = @phone,",
          "    UpdatedAt = sysutcdatetime()",
          "WHERE UserId = @userId",
        ].join("\n"),
      );

    res.json({ ok: true });
  } catch {
    res.status(400).json({ message: "Failed to refresh LDAP profile" });
  }
});

systemRouter.delete("/users/:userId", requireSuperadmin, async (req, res) => {
  const userId = req.params.userId;
  if (!z.string().uuid().safeParse(userId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  if (userId === req.user.sub) {
    res.status(400).json({ message: "Cannot delete your own user" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const userResult = await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(
        [
          "SELECT TOP (1)",
          "  UserId,",
          "  ExternalProvider",
          "FROM pm.Users",
          "WHERE UserId = @userId",
        ].join("\n"),
      );

    const userRow = userResult.recordset[0] as Record<string, unknown> | undefined;
    if (!userRow) {
      await tx.rollback();
      res.status(404).json({ message: "Not found" });
      return;
    }

    const externalProvider = typeof userRow.ExternalProvider === "string" ? userRow.ExternalProvider : null;
    if (externalProvider !== "local") {
      await tx.rollback();
      res.status(400).json({ message: "Only local users can be deleted" });
      return;
    }

    await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(
        [
          "UPDATE pm.AssignmentRules SET AssignToUserId = NULL WHERE AssignToUserId = @userId;",
          "UPDATE pm.PMTasks SET AssignedToUserId = NULL WHERE AssignedToUserId = @userId;",
          "UPDATE pm.PMTasks SET CompletedByUserId = NULL WHERE CompletedByUserId = @userId;",
          "UPDATE pm.PMTasks SET CancelledByUserId = NULL WHERE CancelledByUserId = @userId;",
          "UPDATE pm.PMTaskChecklistResults SET CompletedByUserId = NULL WHERE CompletedByUserId = @userId;",
          "UPDATE pm.PMTaskEvidence SET UploadedByUserId = NULL WHERE UploadedByUserId = @userId;",
          "UPDATE pm.PMTaskChecklistEvidence SET UploadedByUserId = NULL WHERE UploadedByUserId = @userId;",
          "UPDATE pm.AuditLog SET ActorUserId = NULL WHERE ActorUserId = @userId;",
          "UPDATE pm.SystemSettings SET UpdatedByUserId = NULL WHERE UpdatedByUserId = @userId;",
          "DELETE FROM pm.UserRoles WHERE UserId = @userId;",
          "DELETE FROM pm.UserCredentials WHERE UserId = @userId;",
          "DELETE FROM pm.Users WHERE UserId = @userId;",
        ].join("\n"),
      );

    await tx.commit();
    res.json({ ok: true });
  } catch {
    await tx.rollback().catch(() => undefined);
    res.status(500).json({ message: "Internal server error" });
  }
});

systemRouter.put("/users/:userId/roles", requireSystemAdmin, async (req, res) => {
  const userId = req.params.userId;
  if (!z.string().uuid().safeParse(userId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = UpdateUserRolesSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const roles = parsed.data.roles.map((r) => r.trim()).filter((r) => r.length > 0);
  const uniqueRoles = Array.from(new Set(roles));

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const userExists = await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query("SELECT TOP (1) 1 AS One FROM pm.Users WHERE UserId = @userId");
    if (!userExists.recordset[0]) {
      await tx.rollback();
      res.status(404).json({ message: "Not found" });
      return;
    }

    const roleIdByName = new Map<string, string>();
    for (const roleName of uniqueRoles) {
      const existing = await tx
        .request()
        .input("name", sql.NVarChar(64), roleName)
        .query("SELECT TOP (1) RoleId FROM pm.Roles WHERE Name = @name");
      let roleId = existing.recordset[0]?.RoleId as string | undefined;
      if (!roleId) {
        const inserted = await tx
          .request()
          .input("name", sql.NVarChar(64), roleName)
          .query("INSERT INTO pm.Roles (Name) OUTPUT inserted.RoleId AS RoleId VALUES (@name)");
        roleId = inserted.recordset[0]?.RoleId as string | undefined;
      }
      if (!roleId) {
        await tx.rollback();
        res.status(500).json({ message: "Failed to create role" });
        return;
      }
      roleIdByName.set(roleName, roleId);
    }

    const currentRolesResult = await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(
        [
          "SELECT ur.RoleId AS RoleId, r.Name AS RoleName",
          "FROM pm.UserRoles ur",
          "INNER JOIN pm.Roles r ON r.RoleId = ur.RoleId",
          "WHERE ur.UserId = @userId",
        ].join("\n"),
      );
    const currentRoleRows = currentRolesResult.recordset as Array<Record<string, unknown>>;
    const currentRoleNames = new Set<string>(
      currentRoleRows
        .map((r) => (typeof r.RoleName === "string" ? r.RoleName : null))
        .filter((v): v is string => v !== null),
    );

    for (const name of currentRoleNames) {
      if (!uniqueRoles.includes(name)) {
        const roleId = currentRoleRows.find((r) => r.RoleName === name)?.RoleId as string | undefined;
        if (roleId) {
          await tx
            .request()
            .input("userId", sql.UniqueIdentifier, userId)
            .input("roleId", sql.UniqueIdentifier, roleId)
            .query("DELETE FROM pm.UserRoles WHERE UserId = @userId AND RoleId = @roleId");
        }
      }
    }

    for (const name of uniqueRoles) {
      if (!currentRoleNames.has(name)) {
        const roleId = roleIdByName.get(name);
        if (roleId) {
          await tx
            .request()
            .input("userId", sql.UniqueIdentifier, userId)
            .input("roleId", sql.UniqueIdentifier, roleId)
            .query(
              [
                "IF NOT EXISTS (SELECT 1 FROM pm.UserRoles WHERE UserId = @userId AND RoleId = @roleId)",
                "BEGIN",
                "  INSERT INTO pm.UserRoles (UserId, RoleId) VALUES (@userId, @roleId)",
                "END",
              ].join("\n"),
            );
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(parsed.data, "isActive")) {
      await tx
        .request()
        .input("userId", sql.UniqueIdentifier, userId)
        .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
        .query("UPDATE pm.Users SET IsActive = @isActive, UpdatedAt = sysutcdatetime() WHERE UserId = @userId");
    }

    await tx.commit();

    const finalRolesResult = await db
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(
        [
          "SELECT r.Name AS RoleName",
          "FROM pm.UserRoles ur",
          "INNER JOIN pm.Roles r ON r.RoleId = ur.RoleId",
          "WHERE ur.UserId = @userId",
        ].join("\n"),
      );
    const finalRoleRows = finalRolesResult.recordset as Array<Record<string, unknown>>;
    const finalRoleNames = finalRoleRows
      .map((r) => (typeof r.RoleName === "string" ? r.RoleName : null))
      .filter((v): v is string => v !== null);

    res.json({ ok: true, roles: finalRoleNames });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    res.status(500).json({ message: "Internal server error" });
  }
});

systemRouter.post("/users/local", requireSystemAdmin, async (req, res) => {
  const parsed = CreateLocalUserSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const roleExisting = await tx
      .request()
      .input("name", sql.NVarChar(64), parsed.data.roleName)
      .query("SELECT TOP (1) RoleId FROM pm.Roles WHERE Name = @name");
    let roleId = roleExisting.recordset[0]?.RoleId as string | undefined;
    if (!roleId) {
      const insertedRole = await tx
        .request()
        .input("name", sql.NVarChar(64), parsed.data.roleName)
        .query("INSERT INTO pm.Roles (Name) OUTPUT inserted.RoleId AS RoleId VALUES (@name)");
      roleId = insertedRole.recordset[0]?.RoleId as string | undefined;
      if (!roleId) {
        await tx.rollback();
        res.status(500).json({ message: "Failed to create role" });
        return;
      }
    }

    const upserted = await tx
      .request()
      .input("username", sql.NVarChar(128), parsed.data.username.trim())
      .input("displayName", sql.NVarChar(256), parsed.data.displayName ?? null)
      .input("email", sql.NVarChar(256), parsed.data.email ?? null)
      .input("phone", sql.NVarChar(32), parsed.data.phone ?? null)
      .input("externalProvider", sql.NVarChar(64), "local")
      .input("externalId", sql.NVarChar(128), `local:${parsed.data.username.trim()}`)
      .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
      .query(
        [
          "MERGE pm.Users WITH (HOLDLOCK) AS target",
          "USING (SELECT @username AS Username) AS source",
          "ON target.Username = source.Username",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    DisplayName = @displayName,",
          "    Email = @email,",
          "    Phone = @phone,",
          "    ExternalProvider = @externalProvider,",
          "    ExternalId = @externalId,",
          "    IsActive = @isActive,",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (Username, DisplayName, Email, Phone, ExternalProvider, ExternalId, IsActive)",
          "  VALUES (@username, @displayName, @email, @phone, @externalProvider, @externalId, @isActive)",
          "OUTPUT inserted.UserId AS UserId;",
        ].join("\n"),
      );

    const userId = upserted.recordset[0]?.UserId as string | undefined;
    if (!userId) {
      await tx.rollback();
      res.status(500).json({ message: "Failed to upsert user" });
      return;
    }

    const hashed = await bcrypt.hash(parsed.data.password, 12);
    await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("passwordHash", sql.NVarChar(255), hashed)
      .query(
        [
          "MERGE pm.UserCredentials WITH (HOLDLOCK) AS target",
          "USING (SELECT @userId AS UserId) AS source",
          "ON target.UserId = source.UserId",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    PasswordHash = @passwordHash,",
          "    PasswordUpdatedAt = sysutcdatetime(),",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (UserId, PasswordHash)",
          "  VALUES (@userId, @passwordHash);",
        ].join("\n"),
      );

    await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .query(
        [
          "DELETE ur FROM pm.UserRoles ur WHERE ur.UserId = @userId",
        ].join("\n"),
      );

    await tx
      .request()
      .input("userId", sql.UniqueIdentifier, userId)
      .input("roleId", sql.UniqueIdentifier, roleId)
      .query("INSERT INTO pm.UserRoles (UserId, RoleId) VALUES (@userId, @roleId)");

    await tx.commit();
    res.json({ id: userId });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    res.status(500).json({ message: "Internal server error" });
  }
});

systemRouter.post("/users/assign-ldap", requireSystemAdmin, async (req, res) => {
  const parsed = AssignLdapUserSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  try {
    const profile = await lookupLdapUser(parsed.data.identifier);
    const roles = [parsed.data.roleName];
    const user = await upsertLdapUser({
      username: profile.username,
      displayName: profile.displayName,
      email: profile.email,
      phone: profile.phone,
      externalId: profile.dn,
      roles,
    });

    const db = await getDb();
    await db
      .request()
      .input("userId", sql.UniqueIdentifier, user.userId)
      .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
      .query("UPDATE pm.Users SET IsActive = @isActive, UpdatedAt = sysutcdatetime() WHERE UserId = @userId");

    const currentRolesResult = await db
      .request()
      .input("userId", sql.UniqueIdentifier, user.userId)
      .query(
        [
          "SELECT ur.RoleId AS RoleId, r.Name AS RoleName",
          "FROM pm.UserRoles ur",
          "INNER JOIN pm.Roles r ON r.RoleId = ur.RoleId",
          "WHERE ur.UserId = @userId",
        ].join("\n"),
      );
    const currentRoleRows = currentRolesResult.recordset as Array<Record<string, unknown>>;
    const keepName = roles[0];
    for (const row of currentRoleRows) {
      const roleName = typeof row.RoleName === "string" ? row.RoleName : null;
      if (roleName && roleName !== keepName) {
        const roleId = row.RoleId as string | undefined;
        if (roleId) {
          await db
            .request()
            .input("userId", sql.UniqueIdentifier, user.userId)
            .input("roleId", sql.UniqueIdentifier, roleId)
            .query("DELETE FROM pm.UserRoles WHERE UserId = @userId AND RoleId = @roleId");
        }
      }
    }

    const targetRoleExisting = await db
      .request()
      .input("name", sql.NVarChar(64), keepName)
      .query("SELECT TOP (1) RoleId FROM pm.Roles WHERE Name = @name");
    let targetRoleId = targetRoleExisting.recordset[0]?.RoleId as string | undefined;
    if (!targetRoleId) {
      const insertedRole = await db
        .request()
        .input("name", sql.NVarChar(64), keepName)
        .query("INSERT INTO pm.Roles (Name) OUTPUT inserted.RoleId AS RoleId VALUES (@name)");
      targetRoleId = insertedRole.recordset[0]?.RoleId as string | undefined;
    }
    if (targetRoleId) {
      await db
        .request()
        .input("userId", sql.UniqueIdentifier, user.userId)
        .input("roleId", sql.UniqueIdentifier, targetRoleId)
        .query(
          [
            "IF NOT EXISTS (SELECT 1 FROM pm.UserRoles WHERE UserId = @userId AND RoleId = @roleId)",
            "BEGIN",
            "  INSERT INTO pm.UserRoles (UserId, RoleId) VALUES (@userId, @roleId)",
            "END",
          ].join("\n"),
        );
    }

    res.json({ id: user.userId });
  } catch (err) {
    res.status(400).json({ message: "Failed to assign LDAP user" });
  }
});

systemRouter.get("/ldap/search", requireSystemAdmin, async (req, res) => {
  const rawQ = typeof req.query.q === "string" ? req.query.q : undefined;
  const rawQuery = typeof req.query.query === "string" ? req.query.query : undefined;
  const parsed = LdapSearchQuerySchema.safeParse({
    q: rawQ && rawQ.trim() !== "" ? rawQ : undefined,
    query: rawQuery && rawQuery.trim() !== "" ? rawQuery : undefined,
    limit: typeof req.query.limit === "string" ? Number(req.query.limit) : undefined,
  });
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const term = (parsed.data.query ?? parsed.data.q ?? "").trim();
  if (!term) {
    res.json({ items: [] });
    return;
  }

  try {
    const items = await searchLdapUsers(term, parsed.data.limit ?? 10);
    const response = items.map((u) => {
      const identifier = u.upn ?? u.username ?? u.email ?? u.dn;
      return {
        username: u.username,
        displayName: u.displayName,
        email: u.email,
        upn: u.upn,
        dn: u.dn,
        identifier,
      };
    });
    res.json({ items: response });
  } catch {
    res.status(500).json({ message: "Search failed" });
  }
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

systemRouter.post("/evidence-import/run", requireSystemAdmin, async (req, res) => {
  const parsed = EvidenceImportRunSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  if (!env.EVIDENCE_IMPORT_ROOT || !env.EVIDENCE_STORAGE_ROOT) {
    res.status(400).json({ message: "Evidence import not configured" });
    return;
  }

  const result = await runEvidenceImportJob({
    templateId: parsed.data.templateId ?? null,
    duplicateAction: parsed.data.duplicateAction,
    maxFiles: parsed.data.maxFiles,
    dryRun: parsed.data.dryRun,
  });

  res.json(result);
});
