import sql from "mssql";
import { readFile } from "node:fs/promises";
import { Buffer } from "node:buffer";
import { cert, getApps, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getMessaging, type Messaging } from "firebase-admin/messaging";
import { getDb } from "../db/mssql.js";
import { writeSystemLog } from "./systemLog.js";
import { env } from "../config/env.js";

type NotificationRuleRow = {
  NotificationRuleId: string;
  RuleName: string;
  EventType: string;
  OffsetDays: number | null;
  EscalateAfterDays: number | null;
  ChannelId: string;
  ChannelType: string;
  MessageTemplate: string | null;
};

type TaskRow = {
  TaskId: string;
  TaskNumber: string;
  ScheduledDueAt: Date;
  Status: string;
  Priority: string;
  AssetId: string;
  AssetTag: string | null;
  AssetName: string;
  TemplateId: string;
  TemplateName: string;
  AssignedUserId: string | null;
  AssignedUserEmail: string | null;
  AssignedUserPhone: string | null;
};

type EffectiveMicrosoftGraphSettings = {
  tenantId: string | null;
  clientId: string | null;
  clientSecret: string | null;
  scope: string[];
  senderEmail: string | null;
  defaultToRecipients: string[];
  defaultCcRecipients: string[];
  defaultBccRecipients: string[];
  emailSubjectTemplate: string | null;
  emailBodyTemplate: string | null;
  enabled: boolean;
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

const WHATSAPP_SETTINGS_KEY = "notifications.whatsapp";

const renderTemplate = (template: string, data: Record<string, string>): string => {
  let rendered = template;
  for (const [key, value] of Object.entries(data)) {
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, "g"), value);
  }
  return rendered;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
};

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

const splitRecipients = (value: string): string[] => {
  return value
    .split(/[;,]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
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
          "  TenantId, ClientId, ClientSecret, ScopeJson, SenderEmail,",
          "  DefaultToRecipientsJson, DefaultCcRecipientsJson, DefaultBccRecipientsJson,",
          "  EmailSubjectTemplate, EmailBodyTemplate, Enabled",
          "FROM pm.MicrosoftGraphSettings",
          "ORDER BY UpdatedAt DESC",
        ].join("\n"),
      );
    dbRow = (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
  } catch {
    dbRow = null;
  }

  const envScope = env.MS_GRAPH_SCOPE?.trim() ?? "";
  const scopeFromEnv = envScope ? envScope.split(/[\s,]+/).filter((s) => s.length > 0) : [];
  const dbScopeJsonRaw = dbRow?.ScopeJson;
  const hasDbScope = typeof dbScopeJsonRaw === "string" && dbScopeJsonRaw.trim().length > 0;
  const dbScope = parseStringArrayJson(dbScopeJsonRaw);

  const envDefaultTo = env.MS_GRAPH_DEFAULT_TO?.trim() ?? "";
  const envDefaultCc = env.MS_GRAPH_DEFAULT_CC?.trim() ?? "";
  const envDefaultBcc = env.MS_GRAPH_DEFAULT_BCC?.trim() ?? "";

  const defaultToRecipientsJsonRaw = dbRow?.DefaultToRecipientsJson;
  const defaultCcRecipientsJsonRaw = dbRow?.DefaultCcRecipientsJson;
  const defaultBccRecipientsJsonRaw = dbRow?.DefaultBccRecipientsJson;
  const hasDbDefaultTo = typeof defaultToRecipientsJsonRaw === "string" && defaultToRecipientsJsonRaw.trim().length > 0;
  const hasDbDefaultCc = typeof defaultCcRecipientsJsonRaw === "string" && defaultCcRecipientsJsonRaw.trim().length > 0;
  const hasDbDefaultBcc = typeof defaultBccRecipientsJsonRaw === "string" && defaultBccRecipientsJsonRaw.trim().length > 0;

  const enabledRaw = dbRow?.Enabled;
  const enabled =
    typeof enabledRaw === "boolean" ? enabledRaw : typeof enabledRaw === "number" ? enabledRaw === 1 : env.MS_GRAPH_ENABLED;

  const tenantId =
    (typeof dbRow?.TenantId === "string" && dbRow.TenantId.trim() ? dbRow.TenantId.trim() : null) ??
    (env.MS_GRAPH_TENANT_ID?.trim() ? env.MS_GRAPH_TENANT_ID.trim() : null);

  const clientId =
    (typeof dbRow?.ClientId === "string" && dbRow.ClientId.trim() ? dbRow.ClientId.trim() : null) ??
    (env.MS_GRAPH_CLIENT_ID?.trim() ? env.MS_GRAPH_CLIENT_ID.trim() : null);

  const clientSecret =
    (typeof dbRow?.ClientSecret === "string" && dbRow.ClientSecret.trim() ? dbRow.ClientSecret.trim() : null) ??
    (env.MS_GRAPH_CLIENT_SECRET?.trim() ? env.MS_GRAPH_CLIENT_SECRET.trim() : null);

  const senderEmail =
    (typeof dbRow?.SenderEmail === "string" && dbRow.SenderEmail.trim() ? dbRow.SenderEmail.trim() : null) ??
    (env.MS_GRAPH_SENDER_EMAIL?.trim() ? env.MS_GRAPH_SENDER_EMAIL.trim() : null);

  const emailSubjectTemplate =
    (typeof dbRow?.EmailSubjectTemplate === "string" && dbRow.EmailSubjectTemplate.trim()
      ? dbRow.EmailSubjectTemplate.trim()
      : null) ?? (env.MS_GRAPH_EMAIL_SUBJECT_TEMPLATE?.trim() ? env.MS_GRAPH_EMAIL_SUBJECT_TEMPLATE.trim() : null);

  const emailBodyTemplate =
    (typeof dbRow?.EmailBodyTemplate === "string" && dbRow.EmailBodyTemplate.trim() ? dbRow.EmailBodyTemplate : null) ??
    (env.MS_GRAPH_EMAIL_BODY_TEMPLATE?.trim() ? env.MS_GRAPH_EMAIL_BODY_TEMPLATE : null);

  const defaultToRecipientsDb = parseStringArrayJson(defaultToRecipientsJsonRaw);
  const defaultCcRecipientsDb = parseStringArrayJson(defaultCcRecipientsJsonRaw);
  const defaultBccRecipientsDb = parseStringArrayJson(defaultBccRecipientsJsonRaw);

  return {
    tenantId,
    clientId,
    clientSecret,
    scope: hasDbScope ? dbScope : scopeFromEnv,
    senderEmail,
    defaultToRecipients: hasDbDefaultTo ? defaultToRecipientsDb : envDefaultTo ? splitRecipients(envDefaultTo) : [],
    defaultCcRecipients: hasDbDefaultCc ? defaultCcRecipientsDb : envDefaultCc ? splitRecipients(envDefaultCc) : [],
    defaultBccRecipients: hasDbDefaultBcc ? defaultBccRecipientsDb : envDefaultBcc ? splitRecipients(envDefaultBcc) : [],
    emailSubjectTemplate,
    emailBodyTemplate,
    enabled,
  };
};

const loadEffectiveWhatsAppSettings = async (): Promise<EffectiveWhatsAppSettings> => {
  const defaults: EffectiveWhatsAppSettings = {
    enabled: false,
    baseUrl: null,
    target: "group",
    defaultNumber: null,
    groupId: null,
    groupName: null,
    mentionNumbers: [],
  };

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
    if (!valueJson || !valueJson.trim()) return defaults;

    const parsed: unknown = JSON.parse(valueJson);
    if (!isRecord(parsed)) return defaults;

    const enabled = typeof parsed.enabled === "boolean" ? parsed.enabled : defaults.enabled;
    const baseUrlRaw = typeof parsed.baseUrl === "string" && parsed.baseUrl.trim() ? parsed.baseUrl.trim() : null;
    const baseUrl = baseUrlRaw ? baseUrlRaw.replace(/\/+$/, "") : null;

    const targetRaw = parsed.target;
    const target: "single" | "group" = targetRaw === "single" || targetRaw === "group" ? targetRaw : defaults.target;

    const defaultNumber =
      typeof parsed.defaultNumber === "string" && parsed.defaultNumber.trim() ? parsed.defaultNumber.trim() : null;
    const groupId = typeof parsed.groupId === "string" && parsed.groupId.trim() ? parsed.groupId.trim() : null;
    const groupName = typeof parsed.groupName === "string" && parsed.groupName.trim() ? parsed.groupName.trim() : null;

    const mentionNumbers: string[] = [];
    const mentionRaw = parsed.mentionNumbers;
    if (Array.isArray(mentionRaw)) {
      for (const m of mentionRaw) {
        if (typeof m === "string" && m.trim()) mentionNumbers.push(m.trim());
      }
    }

    return {
      enabled,
      baseUrl,
      target,
      defaultNumber,
      groupId,
      groupName,
      mentionNumbers,
    };
  } catch {
    return defaults;
  }
};

const getMicrosoftGraphAccessToken = async (settings: EffectiveMicrosoftGraphSettings): Promise<string> => {
  if (!settings.tenantId || !settings.clientId || !settings.clientSecret) {
    throw new Error("Microsoft Graph not fully configured");
  }
  const scope = settings.scope.length > 0 ? settings.scope : ["https://graph.microsoft.com/.default"];
  const tokenUrl = `https://login.microsoftonline.com/${settings.tenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams();
  body.set("client_id", settings.clientId);
  body.set("client_secret", settings.clientSecret);
  body.set("scope", scope.join(" "));
  body.set("grant_type", "client_credentials");

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    throw new Error(`Token request failed (${tokenRes.status}) ${text}`.trim());
  }

  const tokenJson: unknown = await tokenRes.json();
  if (!isRecord(tokenJson)) throw new Error("Token response invalid");
  const accessToken = tokenJson.access_token;
  if (typeof accessToken !== "string" || !accessToken.trim()) throw new Error("Token response missing access_token");
  return accessToken;
};

type QueuedNotificationRow = {
  NotificationLogId: string;
  ChannelId: string;
  ChannelType: string;
  ChannelConfig: string | null;
  Payload: string | null;
};

const claimQueuedNotifications = async (limit: number): Promise<QueuedNotificationRow[]> => {
  const db = await getDb();
  const result = await db
    .request()
    .input("limit", sql.Int, limit)
    .query(
      [
        ";WITH candidates AS (",
        "  SELECT TOP (@limit)",
        "    nl.NotificationLogId",
        "  FROM pm.NotificationLog nl WITH (UPDLOCK, READPAST, ROWLOCK)",
        "  WHERE nl.Status IN (N'queued', N'failed')",
        "  ORDER BY nl.SentAt ASC",
        ")",
        "UPDATE nl",
        "SET",
        "  Status = N'processing',",
        "  ErrorMessage = NULL",
        "OUTPUT inserted.NotificationLogId AS NotificationLogId,",
        "  c.ChannelId AS ChannelId,",
        "  c.ChannelType AS ChannelType,",
        "  c.Config AS ChannelConfig,",
        "  inserted.Payload AS Payload",
        "FROM pm.NotificationLog nl",
        "INNER JOIN candidates ON candidates.NotificationLogId = nl.NotificationLogId",
        "INNER JOIN pm.NotificationChannels c ON c.ChannelId = nl.ChannelId;",
      ].join("\n"),
    );

  return result.recordset as QueuedNotificationRow[];
};

const updateNotificationStatus = async (id: string, status: "sent" | "failed", errorMessage: string | null) => {
  const db = await getDb();
  await db
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .input("status", sql.NVarChar(32), status)
    .input("errorMessage", sql.NVarChar(1024), errorMessage)
    .query(
      [
        "UPDATE pm.NotificationLog",
        "SET",
        "  Status = @status,",
        "  ErrorMessage = @errorMessage,",
        "  SentAt = sysutcdatetime()",
        "WHERE NotificationLogId = @id",
      ].join("\n"),
    );
};

const sendMicrosoftGraphEmail = async (
  settings: EffectiveMicrosoftGraphSettings,
  payload: unknown,
): Promise<void> => {
  if (!settings.enabled) {
    throw new Error("Microsoft Graph notifications disabled");
  }

  if (!settings.senderEmail) {
    throw new Error("Sender email not configured");
  }

  const toRecipients = settings.defaultToRecipients;
  const ccRecipients = settings.defaultCcRecipients;
  const bccRecipients = settings.defaultBccRecipients;
  if (toRecipients.length === 0 && ccRecipients.length === 0 && bccRecipients.length === 0) {
    throw new Error("No recipients configured (default to/cc/bcc)");
  }

  const message = isRecord(payload) ? payload.message : undefined;
  const task = isRecord(payload) ? payload.task : undefined;
  const asset = isRecord(payload) ? payload.asset : undefined;
  const template = isRecord(payload) ? payload.template : undefined;
  const user = isRecord(payload) ? payload.user : undefined;

  const taskNumber = isRecord(task) && typeof task.taskNumber === "string" ? task.taskNumber : "";
  const dueAt = isRecord(task) && typeof task.scheduledDueAt === "string" ? task.scheduledDueAt : "";
  const assetName = isRecord(asset) && typeof asset.name === "string" ? asset.name : "";
  const templateName = isRecord(template) && typeof template.name === "string" ? template.name : "";
  const messageText = typeof message === "string" ? message : "";

  const userEmail = isRecord(user) && typeof user.email === "string" ? user.email.trim() : "";

  const dynamicTo: string[] = [];
  if (userEmail) {
    dynamicTo.push(userEmail);
  }

  const combinedTo = [...dynamicTo, ...toRecipients];
  const seenRecipients = new Set<string>();
  const finalToRecipients: string[] = [];
  for (const address of combinedTo) {
    const trimmed = address.trim();
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seenRecipients.has(key)) {
      continue;
    }
    seenRecipients.add(key);
    finalToRecipients.push(trimmed);
  }

  const templateData: Record<string, string> = {
    taskNumber,
    dueAt,
    assetName,
    templateName,
    message: messageText,
  };

  const subject = settings.emailSubjectTemplate
    ? renderTemplate(settings.emailSubjectTemplate, templateData)
    : messageText
      ? messageText.slice(0, 120)
      : "PM Notification";

  const bodyContent = settings.emailBodyTemplate
    ? renderTemplate(settings.emailBodyTemplate, templateData)
    : messageText || "(no message)";

  const accessToken = await getMicrosoftGraphAccessToken(settings);
  const sendUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(settings.senderEmail)}/sendMail`;

  const graphBody = {
    message: {
      subject,
      body: { contentType: "Text", content: bodyContent },
      toRecipients: finalToRecipients.map((address) => ({ emailAddress: { address } })),
      ccRecipients: ccRecipients.map((address) => ({ emailAddress: { address } })),
      bccRecipients: bccRecipients.map((address) => ({ emailAddress: { address } })),
    },
    saveToSentItems: false,
  };

  const sendRes = await fetch(sendUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(graphBody),
  });

  if (!sendRes.ok) {
    const text = await sendRes.text().catch(() => "");
    throw new Error(`Graph sendMail failed (${sendRes.status}) ${text}`.trim());
  }
};

const sendWhatsAppMessage = async (settings: EffectiveWhatsAppSettings, payload: unknown): Promise<void> => {
  if (!settings.enabled) {
    throw new Error("WhatsApp notifications disabled");
  }
  if (!settings.baseUrl) {
    throw new Error("WhatsApp base URL not configured");
  }

  const message = isRecord(payload) && typeof payload.message === "string" ? payload.message : "";
  const user = isRecord(payload) && isRecord(payload.user) ? (payload.user as Record<string, unknown>) : null;
  const userPhoneRaw = user && typeof user.phone === "string" ? user.phone : "";
  const userPhone = userPhoneRaw.trim();
  const messageText = message.trim() ? message.trim() : "PM notification";
  const baseUrl = settings.baseUrl.replace(/\/+$/, "");

  if (settings.target === "single") {
    const effectiveNumber = userPhone || (settings.defaultNumber ? settings.defaultNumber.trim() : "");
    if (!effectiveNumber) {
      throw new Error("WhatsApp number not configured (no assigned user phone or default number)");
    }

    const form = new FormData();
    form.set("number", effectiveNumber);
    form.set("message", messageText);

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
  form.set("message", messageText);
  const mentionNumbers: string[] = [];
  for (const value of settings.mentionNumbers) {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      continue;
    }
    if (!mentionNumbers.includes(trimmed)) {
      mentionNumbers.push(trimmed);
    }
  }
  if (userPhone && !mentionNumbers.includes(userPhone)) {
    mentionNumbers.push(userPhone);
  }
  if (mentionNumbers.length > 0) {
    form.set("mention", JSON.stringify(mentionNumbers));
  }

  const res = await fetch(`${baseUrl}/send-group-message`, { method: "POST", body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WhatsApp send-group-message failed (${res.status}) ${text}`.trim());
  }
};

const processQueuedNotifications = async (): Promise<{ attempted: number; sent: number; failed: number }> => {
  const settings = await loadEffectiveMicrosoftGraphSettings();
  const whatsAppSettings = await loadEffectiveWhatsAppSettings();

  const rows = await claimQueuedNotifications(100);
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const channelType = row.ChannelType.toLowerCase();
    const isEmailChannel = channelType.includes("mail") || channelType.includes("email") || channelType.includes("graph");
    const isWhatsAppChannel = channelType.includes("whatsapp");
    const isPushChannel = channelType.includes("push");
    if (!isEmailChannel && !isWhatsAppChannel && !isPushChannel) {
      await updateNotificationStatus(row.NotificationLogId, "failed", `Unsupported channel type: ${row.ChannelType}`);
      failed += 1;
      continue;
    }

    let parsedPayload: unknown = null;
    if (typeof row.Payload === "string" && row.Payload.trim()) {
      try {
        parsedPayload = JSON.parse(row.Payload);
      } catch {
        parsedPayload = row.Payload;
      }
    }

    const cfgRaw = typeof row.ChannelConfig === "string" ? row.ChannelConfig : null;
    const emailSettings = isEmailChannel ? applyMailChannelOverrides(settings, cfgRaw) : null;
    const waSettings = isWhatsAppChannel ? applyWhatsAppChannelOverrides(whatsAppSettings, cfgRaw) : null;
    try {
      if (isWhatsAppChannel && waSettings) {
        await sendWhatsAppMessage(waSettings, parsedPayload);
      } else if (isPushChannel) {
        await sendPushNotification(parsedPayload);
      } else if (isEmailChannel && emailSettings) {
        await sendMicrosoftGraphEmail(emailSettings, parsedPayload);
      }
      await updateNotificationStatus(row.NotificationLogId, "sent", null);
      sent += 1;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await updateNotificationStatus(row.NotificationLogId, "failed", message.slice(0, 1024));
      failed += 1;
    }
  }

  return { attempted: rows.length, sent, failed };
};

type MailChannelConfig = {
  to: string[];
  cc: string[];
  bcc: string[];
  senderEmail: string | null;
  subjectTemplate: string | null;
  bodyTemplate: string | null;
  mergeMode: "override" | "append";
};

type WhatsAppChannelConfig = {
  baseUrlOverride: string | null;
  target: "single" | "group" | null;
  number: string | null;
  groupId: string | null;
  groupName: string | null;
  mentionNumbers: string[];
};

const parseMailChannelConfig = (value: string | null): MailChannelConfig => {
  if (!value || !value.trim()) {
    return { to: [], cc: [], bcc: [], senderEmail: null, subjectTemplate: null, bodyTemplate: null, mergeMode: "override" };
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }
  const obj = isRecord(parsed) ? (parsed as Record<string, unknown>) : {};
  const toRaw = Array.isArray(obj.to) ? (obj.to as unknown[]) : [];
  const ccRaw = Array.isArray(obj.cc) ? (obj.cc as unknown[]) : [];
  const bccRaw = Array.isArray(obj.bcc) ? (obj.bcc as unknown[]) : [];
  const to: string[] = [];
  for (const v of toRaw) if (typeof v === "string" && v.trim()) to.push(v.trim());
  const cc: string[] = [];
  for (const v of ccRaw) if (typeof v === "string" && v.trim()) cc.push(v.trim());
  const bcc: string[] = [];
  for (const v of bccRaw) if (typeof v === "string" && v.trim()) bcc.push(v.trim());
  const senderEmail = typeof obj.senderEmail === "string" && obj.senderEmail.trim() ? obj.senderEmail.trim() : null;
  const subjectTemplate = typeof obj.subjectTemplate === "string" && obj.subjectTemplate.trim() ? obj.subjectTemplate.trim() : null;
  const bodyTemplate = typeof obj.bodyTemplate === "string" && obj.bodyTemplate.trim() ? obj.bodyTemplate : null;
  const mergeModeRaw = obj.mergeMode;
  const mergeMode: "override" | "append" = mergeModeRaw === "append" ? "append" : "override";
  return { to, cc, bcc, senderEmail, subjectTemplate, bodyTemplate, mergeMode };
};

const parseWhatsAppChannelConfig = (value: string | null): WhatsAppChannelConfig => {
  if (!value || !value.trim()) {
    return { baseUrlOverride: null, target: null, number: null, groupId: null, groupName: null, mentionNumbers: [] };
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = null;
  }
  const obj = isRecord(parsed) ? (parsed as Record<string, unknown>) : {};
  const baseUrlOverride = typeof obj.baseUrlOverride === "string" && obj.baseUrlOverride.trim() ? obj.baseUrlOverride.trim() : null;
  const targetRaw = obj.target;
  const target: "single" | "group" | null = targetRaw === "single" || targetRaw === "group" ? (targetRaw as "single" | "group") : null;
  const number = typeof obj.number === "string" && obj.number.trim() ? obj.number.trim() : null;
  const groupId = typeof obj.groupId === "string" && obj.groupId.trim() ? obj.groupId.trim() : null;
  const groupName = typeof obj.groupName === "string" && obj.groupName.trim() ? obj.groupName.trim() : null;
  const mentionNumbers: string[] = [];
  const mentionRaw = Array.isArray(obj.mentionNumbers) ? (obj.mentionNumbers as unknown[]) : [];
  for (const v of mentionRaw) if (typeof v === "string" && v.trim()) mentionNumbers.push(v.trim());
  return { baseUrlOverride, target, number, groupId, groupName, mentionNumbers };
};

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    result.push(t);
  }
  return result;
};

const applyMailChannelOverrides = (
  global: EffectiveMicrosoftGraphSettings,
  channelConfigJson: string | null,
): EffectiveMicrosoftGraphSettings => {
  const cfg = parseMailChannelConfig(channelConfigJson);
  const mergeMode = cfg.mergeMode;
  const to = mergeMode === "override" ? cfg.to : dedupe([...global.defaultToRecipients, ...cfg.to]);
  const cc = mergeMode === "override" ? cfg.cc : dedupe([...global.defaultCcRecipients, ...cfg.cc]);
  const bcc = mergeMode === "override" ? cfg.bcc : dedupe([...global.defaultBccRecipients, ...cfg.bcc]);
  return {
    tenantId: global.tenantId,
    clientId: global.clientId,
    clientSecret: global.clientSecret,
    scope: global.scope,
    senderEmail: cfg.senderEmail ?? global.senderEmail,
    defaultToRecipients: to,
    defaultCcRecipients: cc,
    defaultBccRecipients: bcc,
    emailSubjectTemplate: cfg.subjectTemplate ?? global.emailSubjectTemplate,
    emailBodyTemplate: cfg.bodyTemplate ?? global.emailBodyTemplate,
    enabled: global.enabled,
  };
};

const applyWhatsAppChannelOverrides = (
  global: EffectiveWhatsAppSettings,
  channelConfigJson: string | null,
): EffectiveWhatsAppSettings => {
  const cfg = parseWhatsAppChannelConfig(channelConfigJson);
  const target = cfg.target ?? global.target;
  const baseUrl = cfg.baseUrlOverride ? cfg.baseUrlOverride.replace(/\/+$/, "") : global.baseUrl;
  const defaultNumber = cfg.number ?? global.defaultNumber;
  const groupId = cfg.groupId ?? global.groupId;
  const groupName = cfg.groupName ?? global.groupName;
  const mentionNumbers = dedupe([...global.mentionNumbers, ...cfg.mentionNumbers]);
  return {
    enabled: global.enabled,
    baseUrl,
    target,
    defaultNumber,
    groupId,
    groupName,
    mentionNumbers,
  };
};

type PushPayload = {
  rule: { id: string; name: string; eventType: string };
  channel: { id: string; type: string };
  task: { id: string; taskNumber: string; scheduledDueAt: string | Date; status: string; priority: string };
  asset: { id: string; assetTag: string | null; name: string };
  template: { id: string; name: string };
  user: { id: string | null; email: string | null; phone: string | null } | null;
  message: string;
};

const loadUserDeviceTokens = async (userId: string): Promise<Array<{ token: string; platform: string }>> => {
  const db = await getDb();
  const result = await db
    .request()
    .input("userId", sql.UniqueIdentifier, userId)
    .query(
      [
        "SELECT Token AS Token, Platform AS Platform",
        "FROM pm.Devices",
        "WHERE UserId = @userId",
        "  AND IsActive = 1",
      ].join("\n"),
    );
  const rows = result.recordset as Array<{ Token: string; Platform: string }>;
  return rows.map((r) => ({ token: r.Token, platform: r.Platform }));
};

let messagingPromise: Promise<Messaging | null> | null = null;

const getFirebaseMessaging = async (): Promise<Messaging | null> => {
  if (messagingPromise) return messagingPromise;

  messagingPromise = (async () => {
    try {
      const jsonBase64 = (env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64 ?? "").trim();
      const path = (env.FIREBASE_SERVICE_ACCOUNT_PATH ?? "").trim();

      let rawJson = "";
      if (jsonBase64) {
        rawJson = Buffer.from(jsonBase64, "base64").toString("utf8");
      } else if (path) {
        rawJson = await readFile(path, "utf8");
      } else {
        return null;
      }

      const serviceAccount = JSON.parse(rawJson) as ServiceAccount;
      if (getApps().length === 0) {
        initializeApp({ credential: cert(serviceAccount) });
      }
      return getMessaging();
    } catch {
      messagingPromise = null;
      return null;
    }
  })();

  return messagingPromise;
};

const sendPush = async (token: string, title: string, body: string, data: Record<string, string>): Promise<void> => {
  const messaging = await getFirebaseMessaging();
  if (messaging) {
    await messaging.send({ token, notification: { title, body }, data });
    return;
  }

  const key = env.FCM_SERVER_KEY?.trim();
  if (!key) throw new Error("FCM not configured");

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: "key=" + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      notification: { title, body },
      data,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FCM send failed (${res.status}): ${text.slice(0, 200)}`);
  }
};

const sendPushNotification = async (payload: unknown): Promise<void> => {
  if (!isRecord(payload)) throw new Error("Invalid payload");
  const p = payload as PushPayload;
  const userId = p.user && typeof p.user.id === "string" ? p.user.id : null;
  if (!userId) throw new Error("No user to notify");
  const tokens = await loadUserDeviceTokens(userId);
  if (tokens.length === 0) throw new Error("No device tokens");
  const title = p.rule?.eventType === "task_assigned" ? "Task Assigned" : "Notification";
  const body = p.message;
  const data: Record<string, string> = {
    taskId: p.task?.id ?? "",
    taskNumber: p.task?.taskNumber ?? "",
  };
  for (const t of tokens) {
    await sendPush(t.token, title, body, data);
  }
};

const loadActiveRules = async (): Promise<NotificationRuleRow[]> => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT",
        "  r.NotificationRuleId AS NotificationRuleId,",
        "  r.RuleName AS RuleName,",
        "  r.EventType AS EventType,",
        "  r.OffsetDays AS OffsetDays,",
        "  r.EscalateAfterDays AS EscalateAfterDays,",
        "  r.ChannelId AS ChannelId,",
        "  c.ChannelType AS ChannelType,",
        "  r.MessageTemplate AS MessageTemplate",
        "FROM pm.NotificationRules r",
        "INNER JOIN pm.NotificationChannels c ON c.ChannelId = r.ChannelId",
        "WHERE r.IsActive = 1",
        "  AND c.IsActive = 1",
        "  AND r.EventType <> N'task_assigned'",
        "ORDER BY r.UpdatedAt DESC",
      ].join("\n"),
    );
  return result.recordset as NotificationRuleRow[];
};

const loadTasksForOffsetRule = async (rule: NotificationRuleRow): Promise<TaskRow[]> => {
  if (rule.OffsetDays === null) return [];
  const db = await getDb();
  const result = await db
    .request()
    .input("offsetDays", sql.Int, rule.OffsetDays)
    .query(
      [
        "SELECT",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  a.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName,",
        "  u.Email AS AssignedUserEmail,",
        "  u.Phone AS AssignedUserPhone",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users u ON u.UserId = t.AssignedToUserId",
        "WHERE",
        "  t.CompletedAt IS NULL",
        "  AND t.CancelledAt IS NULL",
        "  AND t.ScheduledDueAt >= DATEADD(day, @offsetDays, CAST(sysutcdatetime() AS date))",
        "  AND t.ScheduledDueAt < DATEADD(day, @offsetDays + 1, CAST(sysutcdatetime() AS date))",
      ].join("\n"),
    );
  return result.recordset as TaskRow[];
};

const loadTasksForEscalationRule = async (rule: NotificationRuleRow): Promise<TaskRow[]> => {
  if (rule.EscalateAfterDays === null) return [];
  const db = await getDb();
  const result = await db
    .request()
    .input("escalateAfterDays", sql.Int, rule.EscalateAfterDays)
    .query(
      [
        "SELECT",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  a.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName,",
        "  u.Email AS AssignedUserEmail,",
        "  u.Phone AS AssignedUserPhone",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users u ON u.UserId = t.AssignedToUserId",
        "WHERE",
        "  t.CompletedAt IS NULL",
        "  AND t.CancelledAt IS NULL",
        "  AND t.ScheduledDueAt < DATEADD(day, -@escalateAfterDays, sysutcdatetime())",
      ].join("\n"),
    );
  return result.recordset as TaskRow[];
};

const enqueueNotification = async (rule: NotificationRuleRow, task: TaskRow, message: string): Promise<boolean> => {
  const payload = JSON.stringify({
    rule: { id: rule.NotificationRuleId, name: rule.RuleName, eventType: rule.EventType },
    channel: { id: rule.ChannelId, type: rule.ChannelType },
    task: {
      id: task.TaskId,
      taskNumber: task.TaskNumber,
      scheduledDueAt: task.ScheduledDueAt,
      status: task.Status,
      priority: task.Priority,
    },
    asset: { id: task.AssetId, assetTag: task.AssetTag, name: task.AssetName },
    template: { id: task.TemplateId, name: task.TemplateName },
    user:
      task.AssignedUserId || task.AssignedUserEmail || task.AssignedUserPhone
        ? {
            id: task.AssignedUserId,
            email: task.AssignedUserEmail,
            phone: task.AssignedUserPhone,
          }
        : null,
    message,
  });

  const db = await getDb();
  const inserted = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, task.TaskId)
    .input("ruleId", sql.UniqueIdentifier, rule.NotificationRuleId)
    .input("channelId", sql.UniqueIdentifier, rule.ChannelId)
    .input("status", sql.NVarChar(32), "queued")
    .input("payload", sql.NVarChar(sql.MAX), payload)
    .query(
      [
        "IF NOT EXISTS (",
        "  SELECT 1",
        "  FROM pm.NotificationLog",
        "  WHERE TaskId = @taskId",
        "    AND NotificationRuleId = @ruleId",
        "    AND CAST(SentAt AS date) = CAST(sysutcdatetime() AS date)",
        ")",
        "BEGIN",
        "  INSERT INTO pm.NotificationLog (TaskId, NotificationRuleId, ChannelId, Status, Payload)",
        "  VALUES (@taskId, @ruleId, @channelId, @status, @payload)",
        "  SELECT CAST(1 AS bit) AS Inserted",
        "END",
        "ELSE",
        "BEGIN",
        "  UPDATE pm.NotificationLog",
        "  SET Status = N'queued', Payload = @payload, ErrorMessage = NULL",
        "  WHERE TaskId = @taskId",
        "    AND NotificationRuleId = @ruleId",
        "    AND CAST(SentAt AS date) = CAST(sysutcdatetime() AS date)",
        "    AND Status = N'failed'",
        "  SELECT CAST(CASE WHEN @@ROWCOUNT > 0 THEN 1 ELSE 0 END AS bit) AS Inserted",
        "END",
      ].join("\n"),
    );

  const row = inserted.recordset[0] as { Inserted?: boolean } | undefined;
  return row?.Inserted === true;
};

export const runReminderEscalationJob = async (): Promise<void> => {
  const startedAt = Date.now();
  await writeSystemLog({ level: "info", message: "Notification job started", context: { job: "notifications" } });

  const rules = await loadActiveRules();
  let queued = 0;
  let examined = 0;

  for (const rule of rules) {
    const template =
      rule.MessageTemplate ??
      "Task {{taskNumber}} for {{assetName}} is due at {{dueAt}} ({{templateName}}).";

    const tasksForOffset = await loadTasksForOffsetRule(rule);
    const tasksForEscalation = await loadTasksForEscalationRule(rule);
    const tasks = [...tasksForOffset, ...tasksForEscalation];

  for (const task of tasks) {
    examined += 1;
    const message = renderTemplate(template, {
      taskNumber: task.TaskNumber,
      assetTag: task.AssetTag ?? "",
      assetName: task.AssetName,
      templateName: task.TemplateName,
      dueAt: task.ScheduledDueAt.toISOString(),
      technicianNumber: (task.AssignedUserPhone ?? "").trim(),
    });
      const didQueue = await enqueueNotification(rule, task, message);
      if (didQueue) queued += 1;
    }
  }

  const durationMs = Date.now() - startedAt;

  const delivery = await processQueuedNotifications();

  await writeSystemLog({
    level: "info",
    message: "Notification job completed",
    context: {
      job: "notifications",
      rules: rules.length,
      examined,
      queued,
      deliveryAttempted: delivery.attempted,
      deliverySent: delivery.sent,
      deliveryFailed: delivery.failed,
      durationMs,
    },
  });
};
