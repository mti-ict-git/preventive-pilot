import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRole.js";

const requireNotificationAdmin = requireAnyRole(["Superadmin", "Admin"]);

const ChannelCreateSchema = z.object({
  channelType: z.string().min(1).max(32),
  config: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const ChannelUpdateSchema = ChannelCreateSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "No updates",
});

const RuleCreateSchema = z.object({
  ruleName: z.string().min(1).max(256),
  eventType: z.string().min(1).max(64),
  offsetDays: z.number().int().nullable().optional(),
  escalateAfterDays: z.number().int().nullable().optional(),
  channelId: z.string().uuid(),
  messageTemplate: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
});

const RuleUpdateSchema = RuleCreateSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "No updates",
});

const LogQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  taskId: z.string().uuid().optional(),
  ruleId: z.string().uuid().optional(),
  status: z.string().max(32).optional(),
});

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get("/channels", async (_req, res) => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT",
        "  ChannelId, ChannelType, Config, IsActive, CreatedAt, UpdatedAt",
        "FROM pm.NotificationChannels",
        "ORDER BY UpdatedAt DESC",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    items: rows.map((r) => ({
      id: r.ChannelId,
      channelType: r.ChannelType,
      config: r.Config,
      isActive: r.IsActive,
      createdAt: r.CreatedAt,
      updatedAt: r.UpdatedAt,
    })),
  });
});

notificationsRouter.post("/channels", requireNotificationAdmin, async (req, res) => {
  const parsed = ChannelCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const inserted = await db
    .request()
    .input("channelType", sql.NVarChar(32), parsed.data.channelType)
    .input("config", sql.NVarChar(sql.MAX), parsed.data.config ?? null)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .query(
      [
        "INSERT INTO pm.NotificationChannels (ChannelType, Config, IsActive)",
        "OUTPUT inserted.ChannelId AS ChannelId",
        "VALUES (@channelType, @config, @isActive)",
      ].join("\n"),
    );

  const channelId = inserted.recordset[0]?.ChannelId as string | undefined;
  if (!channelId) {
    res.status(500).json({ message: "Failed to create channel" });
    return;
  }

  res.status(201).json({ id: channelId });
});

notificationsRouter.put("/channels/:channelId", requireNotificationAdmin, async (req, res) => {
  const channelId = req.params.channelId;
  if (!z.string().uuid().safeParse(channelId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = ChannelUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const hasChannelType = Object.prototype.hasOwnProperty.call(parsed.data, "channelType");
  const hasConfig = Object.prototype.hasOwnProperty.call(parsed.data, "config");
  const hasIsActive = Object.prototype.hasOwnProperty.call(parsed.data, "isActive");

  const db = await getDb();
  const updated = await db
    .request()
    .input("channelId", sql.UniqueIdentifier, channelId)
    .input("hasChannelType", sql.Bit, hasChannelType ? 1 : 0)
    .input("channelType", sql.NVarChar(32), parsed.data.channelType ?? null)
    .input("hasConfig", sql.Bit, hasConfig ? 1 : 0)
    .input("config", sql.NVarChar(sql.MAX), parsed.data.config ?? null)
    .input("hasIsActive", sql.Bit, hasIsActive ? 1 : 0)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .query(
      [
        "UPDATE pm.NotificationChannels",
        "SET",
        "  ChannelType = CASE WHEN @hasChannelType = 1 THEN @channelType ELSE ChannelType END,",
        "  Config = CASE WHEN @hasConfig = 1 THEN @config ELSE Config END,",
        "  IsActive = CASE WHEN @hasIsActive = 1 THEN @isActive ELSE IsActive END,",
        "  UpdatedAt = sysutcdatetime()",
        "WHERE ChannelId = @channelId",
      ].join("\n"),
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});

notificationsRouter.get("/rules", async (_req, res) => {
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
        "  r.MessageTemplate AS MessageTemplate,",
        "  r.IsActive AS IsActive,",
        "  r.CreatedAt AS CreatedAt,",
        "  r.UpdatedAt AS UpdatedAt",
        "FROM pm.NotificationRules r",
        "INNER JOIN pm.NotificationChannels c ON c.ChannelId = r.ChannelId",
        "ORDER BY r.UpdatedAt DESC",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    items: rows.map((r) => ({
      id: r.NotificationRuleId,
      ruleName: r.RuleName,
      eventType: r.EventType,
      offsetDays: r.OffsetDays,
      escalateAfterDays: r.EscalateAfterDays,
      channel: { id: r.ChannelId, channelType: r.ChannelType },
      messageTemplate: r.MessageTemplate,
      isActive: r.IsActive,
      createdAt: r.CreatedAt,
      updatedAt: r.UpdatedAt,
    })),
  });
});

notificationsRouter.post("/rules", requireNotificationAdmin, async (req, res) => {
  const parsed = RuleCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const inserted = await db
    .request()
    .input("ruleName", sql.NVarChar(256), parsed.data.ruleName)
    .input("eventType", sql.NVarChar(64), parsed.data.eventType)
    .input("offsetDays", sql.Int, parsed.data.offsetDays ?? null)
    .input("escalateAfterDays", sql.Int, parsed.data.escalateAfterDays ?? null)
    .input("channelId", sql.UniqueIdentifier, parsed.data.channelId)
    .input("messageTemplate", sql.NVarChar(sql.MAX), parsed.data.messageTemplate ?? null)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .query(
      [
        "INSERT INTO pm.NotificationRules (",
        "  RuleName, EventType, OffsetDays, EscalateAfterDays, ChannelId, MessageTemplate, IsActive",
        ")",
        "OUTPUT inserted.NotificationRuleId AS NotificationRuleId",
        "VALUES (",
        "  @ruleName, @eventType, @offsetDays, @escalateAfterDays, @channelId, @messageTemplate, @isActive",
        ")",
      ].join("\n"),
    );

  const ruleId = inserted.recordset[0]?.NotificationRuleId as string | undefined;
  if (!ruleId) {
    res.status(500).json({ message: "Failed to create rule" });
    return;
  }

  res.status(201).json({ id: ruleId });
});

notificationsRouter.put("/rules/:ruleId", requireNotificationAdmin, async (req, res) => {
  const ruleId = req.params.ruleId;
  if (!z.string().uuid().safeParse(ruleId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = RuleUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const hasRuleName = Object.prototype.hasOwnProperty.call(parsed.data, "ruleName");
  const hasEventType = Object.prototype.hasOwnProperty.call(parsed.data, "eventType");
  const hasOffsetDays = Object.prototype.hasOwnProperty.call(parsed.data, "offsetDays");
  const hasEscalateAfterDays = Object.prototype.hasOwnProperty.call(parsed.data, "escalateAfterDays");
  const hasChannelId = Object.prototype.hasOwnProperty.call(parsed.data, "channelId");
  const hasMessageTemplate = Object.prototype.hasOwnProperty.call(parsed.data, "messageTemplate");
  const hasIsActive = Object.prototype.hasOwnProperty.call(parsed.data, "isActive");

  const db = await getDb();
  const updated = await db
    .request()
    .input("ruleId", sql.UniqueIdentifier, ruleId)
    .input("hasRuleName", sql.Bit, hasRuleName ? 1 : 0)
    .input("ruleName", sql.NVarChar(256), parsed.data.ruleName ?? null)
    .input("hasEventType", sql.Bit, hasEventType ? 1 : 0)
    .input("eventType", sql.NVarChar(64), parsed.data.eventType ?? null)
    .input("hasOffsetDays", sql.Bit, hasOffsetDays ? 1 : 0)
    .input("offsetDays", sql.Int, parsed.data.offsetDays ?? null)
    .input("hasEscalateAfterDays", sql.Bit, hasEscalateAfterDays ? 1 : 0)
    .input("escalateAfterDays", sql.Int, parsed.data.escalateAfterDays ?? null)
    .input("hasChannelId", sql.Bit, hasChannelId ? 1 : 0)
    .input("channelId", sql.UniqueIdentifier, parsed.data.channelId ?? null)
    .input("hasMessageTemplate", sql.Bit, hasMessageTemplate ? 1 : 0)
    .input("messageTemplate", sql.NVarChar(sql.MAX), parsed.data.messageTemplate ?? null)
    .input("hasIsActive", sql.Bit, hasIsActive ? 1 : 0)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .query(
      [
        "UPDATE pm.NotificationRules",
        "SET",
        "  RuleName = CASE WHEN @hasRuleName = 1 THEN @ruleName ELSE RuleName END,",
        "  EventType = CASE WHEN @hasEventType = 1 THEN @eventType ELSE EventType END,",
        "  OffsetDays = CASE WHEN @hasOffsetDays = 1 THEN @offsetDays ELSE OffsetDays END,",
        "  EscalateAfterDays = CASE WHEN @hasEscalateAfterDays = 1 THEN @escalateAfterDays ELSE EscalateAfterDays END,",
        "  ChannelId = CASE WHEN @hasChannelId = 1 THEN @channelId ELSE ChannelId END,",
        "  MessageTemplate = CASE WHEN @hasMessageTemplate = 1 THEN @messageTemplate ELSE MessageTemplate END,",
        "  IsActive = CASE WHEN @hasIsActive = 1 THEN @isActive ELSE IsActive END,",
        "  UpdatedAt = sysutcdatetime()",
        "WHERE NotificationRuleId = @ruleId",
      ].join("\n"),
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});

notificationsRouter.get("/log", requireNotificationAdmin, async (req, res) => {
  const parsed = LogQuerySchema.safeParse(req.query);
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
    .input("taskId", sql.UniqueIdentifier, parsed.data.taskId ?? null)
    .input("ruleId", sql.UniqueIdentifier, parsed.data.ruleId ?? null)
    .input("status", sql.NVarChar(32), parsed.data.status ?? null)
    .query(
      [
        "SELECT",
        "  nl.NotificationLogId AS NotificationLogId,",
        "  nl.TaskId AS TaskId,",
        "  nl.NotificationRuleId AS NotificationRuleId,",
        "  nl.ChannelId AS ChannelId,",
        "  c.ChannelType AS ChannelType,",
        "  nl.SentAt AS SentAt,",
        "  nl.Status AS Status,",
        "  nl.ErrorMessage AS ErrorMessage,",
        "  nl.Payload AS Payload",
        "FROM pm.NotificationLog nl",
        "INNER JOIN pm.NotificationChannels c ON c.ChannelId = nl.ChannelId",
        "WHERE",
        "  (@taskId IS NULL OR nl.TaskId = @taskId)",
        "  AND (@ruleId IS NULL OR nl.NotificationRuleId = @ruleId)",
        "  AND (@status IS NULL OR nl.Status = @status)",
        "ORDER BY nl.SentAt DESC",
        "OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.NotificationLogId,
      taskId: r.TaskId,
      ruleId: r.NotificationRuleId,
      channel: { id: r.ChannelId, channelType: r.ChannelType },
      sentAt: r.SentAt,
      status: r.Status,
      errorMessage: r.ErrorMessage,
      payload: r.Payload,
    })),
  });
});
