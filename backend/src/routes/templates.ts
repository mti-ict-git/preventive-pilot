import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireManager } from "../middleware/requireRole.js";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const getSqlErrorNumber = (err: unknown): number | null => {
  if (!isRecord(err)) return null;
  const num = err.number;
  if (typeof num === "number") return num;

  const originalError = err.originalError;
  if (!isRecord(originalError)) return null;
  const info = originalError.info;
  if (!isRecord(info)) return null;
  const infoNum = info.number;
  return typeof infoNum === "number" ? infoNum : null;
};

const isDuplicateTemplateNameError = (err: unknown): boolean => {
  const num = getSqlErrorNumber(err);
  if (num !== 2627) return false;
  const message = err instanceof Error ? err.message : isRecord(err) && typeof err.message === "string" ? err.message : "";
  return message.includes("UQ_pm_PMTemplates_Name");
};

const ChecklistItemSchema = z.object({
  id: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0),
  itemText: z.string().min(1).max(512),
  isMandatory: z.boolean().default(true),
  requiresNotes: z.boolean().default(false),
  requiresPassFail: z.boolean().default(true),
  enableAttachment: z.boolean().default(false),
  requiresAttachment: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const TemplateCreateSchema = z.object({
  name: z.string().min(1).max(256),
  description: z.string().max(1024).nullable().optional(),
  intervalDays: z.number().int().min(1),
  applicableCategoryId: z.string().uuid().nullable().optional(),
  estimatedDurationMinutes: z.number().int().min(1).nullable().optional(),
  requiredRoleId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  checklistItems: z.array(ChecklistItemSchema).default([]),
});

const TemplateUpdateSchema = TemplateCreateSchema.partial().extend({
  checklistItems: z.array(ChecklistItemSchema).optional(),
});

export const templatesRouter = Router();

templatesRouter.use(requireAuth);

templatesRouter.get("/", async (req, res) => {
  const activeOnly = req.query.active === "true";
  const db = await getDb();
  const result = await db
    .request()
    .input("activeOnly", sql.Bit, activeOnly ? 1 : 0)
    .query(
      [
        "SELECT",
        "  t.TemplateId AS TemplateId,",
        "  t.Name AS Name,",
        "  t.Description AS Description,",
        "  t.IntervalDays AS IntervalDays,",
        "  t.ApplicableCategoryId AS ApplicableCategoryId,",
        "  c.Name AS ApplicableCategoryName,",
        "  t.EstimatedDurationMinutes AS EstimatedDurationMinutes,",
        "  t.RequiredRoleId AS RequiredRoleId,",
        "  r.Name AS RequiredRoleName,",
        "  t.IsActive AS IsActive,",
        "  t.Version AS Version,",
        "  t.UpdatedAt AS UpdatedAt",
        "FROM pm.PMTemplates t",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = t.ApplicableCategoryId",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.RequiredRoleId",
        "WHERE (@activeOnly = 0 OR t.IsActive = 1)",
        "ORDER BY t.UpdatedAt DESC",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    items: rows.map((r) => ({
      id: r.TemplateId,
      name: r.Name,
      description: r.Description,
      intervalDays: r.IntervalDays,
      applicableCategory: r.ApplicableCategoryId
        ? { id: r.ApplicableCategoryId, name: r.ApplicableCategoryName ?? null }
        : null,
      estimatedDurationMinutes: r.EstimatedDurationMinutes,
      requiredRole: r.RequiredRoleId ? { id: r.RequiredRoleId, name: r.RequiredRoleName ?? null } : null,
      isActive: r.IsActive,
      version: r.Version,
      updatedAt: r.UpdatedAt,
    })),
  });
});

templatesRouter.get("/:templateId", async (req, res) => {
  const templateId = req.params.templateId;
  if (!z.string().uuid().safeParse(templateId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const templateResult = await db
    .request()
    .input("templateId", sql.UniqueIdentifier, templateId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TemplateId AS TemplateId,",
        "  t.Name AS Name,",
        "  t.Description AS Description,",
        "  t.IntervalDays AS IntervalDays,",
        "  t.ApplicableCategoryId AS ApplicableCategoryId,",
        "  c.Name AS ApplicableCategoryName,",
        "  t.EstimatedDurationMinutes AS EstimatedDurationMinutes,",
        "  t.RequiredRoleId AS RequiredRoleId,",
        "  r.Name AS RequiredRoleName,",
        "  t.IsActive AS IsActive,",
        "  t.Version AS Version,",
        "  t.UpdatedAt AS UpdatedAt",
        "FROM pm.PMTemplates t",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = t.ApplicableCategoryId",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.RequiredRoleId",
        "WHERE t.TemplateId = @templateId",
      ].join("\n"),
    );

  const templateRow = templateResult.recordset[0] as Record<string, unknown> | undefined;
  if (!templateRow) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const itemsResult = await db
    .request()
    .input("templateId", sql.UniqueIdentifier, templateId)
    .query(
      [
        "SELECT",
        "  i.TemplateChecklistItemId AS TemplateChecklistItemId,",
        "  i.SortOrder AS SortOrder,",
        "  i.ItemText AS ItemText,",
        "  i.IsMandatory AS IsMandatory,",
        "  i.RequiresNotes AS RequiresNotes,",
        "  i.RequiresPassFail AS RequiresPassFail,",
        "  i.EnableAttachment AS EnableAttachment,",
        "  i.RequiresAttachment AS RequiresAttachment,",
        "  i.IsActive AS IsActive",
        "FROM pm.PMTemplateChecklistItems i",
        "WHERE i.TemplateId = @templateId",
        "ORDER BY i.SortOrder ASC",
      ].join("\n"),
    );

  const itemRows = itemsResult.recordset as Array<Record<string, unknown>>;
  res.json({
    id: templateRow.TemplateId,
    name: templateRow.Name,
    description: templateRow.Description,
    intervalDays: templateRow.IntervalDays,
    applicableCategory: templateRow.ApplicableCategoryId
      ? { id: templateRow.ApplicableCategoryId, name: templateRow.ApplicableCategoryName ?? null }
      : null,
    estimatedDurationMinutes: templateRow.EstimatedDurationMinutes,
    requiredRole: templateRow.RequiredRoleId
      ? { id: templateRow.RequiredRoleId, name: templateRow.RequiredRoleName ?? null }
      : null,
    isActive: templateRow.IsActive,
    version: templateRow.Version,
    updatedAt: templateRow.UpdatedAt,
    checklistItems: itemRows.map((r) => ({
      id: r.TemplateChecklistItemId,
      sortOrder: r.SortOrder,
      itemText: r.ItemText,
      isMandatory: r.IsMandatory,
      requiresNotes: r.RequiresNotes,
      requiresPassFail: r.RequiresPassFail,
      enableAttachment: r.EnableAttachment,
      requiresAttachment: r.RequiresAttachment,
      isActive: r.IsActive,
    })),
  });
});

templatesRouter.post("/", requireManager, async (req, res) => {
  const parsed = TemplateCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const inserted = await tx
      .request()
      .input("name", sql.NVarChar(256), parsed.data.name)
      .input("description", sql.NVarChar(1024), parsed.data.description ?? null)
      .input("intervalDays", sql.Int, parsed.data.intervalDays)
      .input("applicableCategoryId", sql.UniqueIdentifier, parsed.data.applicableCategoryId ?? null)
      .input(
        "estimatedDurationMinutes",
        sql.Int,
        parsed.data.estimatedDurationMinutes ?? null,
      )
      .input("requiredRoleId", sql.UniqueIdentifier, parsed.data.requiredRoleId ?? null)
      .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
      .query(
        [
          "INSERT INTO pm.PMTemplates (",
          "  Name, Description, IntervalDays, ApplicableCategoryId, EstimatedDurationMinutes, RequiredRoleId, IsActive",
          ")",
          "OUTPUT inserted.TemplateId AS TemplateId",
          "VALUES (",
          "  @name, @description, @intervalDays, @applicableCategoryId, @estimatedDurationMinutes, @requiredRoleId, @isActive",
          ")",
        ].join("\n"),
      );

    const templateId = inserted.recordset[0]?.TemplateId as string | undefined;
    if (!templateId) throw new Error("Failed to create template");

    for (const item of parsed.data.checklistItems) {
      await tx
        .request()
        .input("templateId", sql.UniqueIdentifier, templateId)
        .input("sortOrder", sql.Int, item.sortOrder)
        .input("itemText", sql.NVarChar(512), item.itemText)
        .input("isMandatory", sql.Bit, item.isMandatory ? 1 : 0)
        .input("requiresNotes", sql.Bit, item.requiresNotes ? 1 : 0)
        .input("requiresPassFail", sql.Bit, item.requiresPassFail ? 1 : 0)
        .input("enableAttachment", sql.Bit, item.enableAttachment ? 1 : 0)
        .input("requiresAttachment", sql.Bit, item.requiresAttachment ? 1 : 0)
        .input("isActive", sql.Bit, item.isActive ? 1 : 0)
        .query(
          [
            "INSERT INTO pm.PMTemplateChecklistItems (",
            "  TemplateId, SortOrder, ItemText, IsMandatory, RequiresNotes, RequiresPassFail, EnableAttachment, RequiresAttachment, IsActive",
            ")",
            "VALUES (",
            "  @templateId, @sortOrder, @itemText, @isMandatory, @requiresNotes, @requiresPassFail, @enableAttachment, @requiresAttachment, @isActive",
            ")",
          ].join("\n"),
        );
    }

    await tx.commit();
    res.status(201).json({ id: templateId });
  } catch (err: unknown) {
    await tx.rollback().catch(() => undefined);
    if (isDuplicateTemplateNameError(err)) {
      res.status(409).json({ message: "Template name already exists" });
      return;
    }
    throw err;
  }
});

templatesRouter.put("/:templateId", requireManager, async (req, res) => {
  const templateId = req.params.templateId;
  if (!z.string().uuid().safeParse(templateId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = TemplateUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const exists = await tx
      .request()
      .input("templateId", sql.UniqueIdentifier, templateId)
      .query("SELECT TOP (1) TemplateId FROM pm.PMTemplates WHERE TemplateId = @templateId");

    if (!exists.recordset[0]) {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }

    const hasName = parsed.data.name !== undefined;
    const hasDescription = parsed.data.description !== undefined;
    const hasInterval = parsed.data.intervalDays !== undefined;
    const hasCategory = parsed.data.applicableCategoryId !== undefined;
    const hasDuration = parsed.data.estimatedDurationMinutes !== undefined;
    const hasRole = parsed.data.requiredRoleId !== undefined;
    const hasActive = parsed.data.isActive !== undefined;

    await tx
      .request()
      .input("templateId", sql.UniqueIdentifier, templateId)
      .input("hasName", sql.Bit, hasName ? 1 : 0)
      .input("name", sql.NVarChar(256), parsed.data.name ?? null)
      .input("hasDescription", sql.Bit, hasDescription ? 1 : 0)
      .input("description", sql.NVarChar(1024), parsed.data.description ?? null)
      .input("hasInterval", sql.Bit, hasInterval ? 1 : 0)
      .input("intervalDays", sql.Int, parsed.data.intervalDays ?? null)
      .input("hasCategory", sql.Bit, hasCategory ? 1 : 0)
      .input("applicableCategoryId", sql.UniqueIdentifier, parsed.data.applicableCategoryId ?? null)
      .input("hasDuration", sql.Bit, hasDuration ? 1 : 0)
      .input("estimatedDurationMinutes", sql.Int, parsed.data.estimatedDurationMinutes ?? null)
      .input("hasRole", sql.Bit, hasRole ? 1 : 0)
      .input("requiredRoleId", sql.UniqueIdentifier, parsed.data.requiredRoleId ?? null)
      .input("hasActive", sql.Bit, hasActive ? 1 : 0)
      .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
      .query(
        [
          "UPDATE pm.PMTemplates",
          "SET",
          "  Name = CASE WHEN @hasName = 1 THEN @name ELSE Name END,",
          "  Description = CASE WHEN @hasDescription = 1 THEN @description ELSE Description END,",
          "  IntervalDays = CASE WHEN @hasInterval = 1 THEN @intervalDays ELSE IntervalDays END,",
          "  ApplicableCategoryId = CASE WHEN @hasCategory = 1 THEN @applicableCategoryId ELSE ApplicableCategoryId END,",
          "  EstimatedDurationMinutes = CASE WHEN @hasDuration = 1 THEN @estimatedDurationMinutes ELSE EstimatedDurationMinutes END,",
          "  RequiredRoleId = CASE WHEN @hasRole = 1 THEN @requiredRoleId ELSE RequiredRoleId END,",
          "  IsActive = CASE WHEN @hasActive = 1 THEN @isActive ELSE IsActive END,",
          "  Version = Version + 1,",
          "  UpdatedAt = sysutcdatetime()",
          "WHERE TemplateId = @templateId",
        ].join("\n"),
      );

    if (parsed.data.checklistItems) {
      const existing = await tx
        .request()
        .input("templateId", sql.UniqueIdentifier, templateId)
        .query(
          [
            "SELECT",
            "  TemplateChecklistItemId",
            "FROM pm.PMTemplateChecklistItems",
            "WHERE TemplateId = @templateId",
          ].join("\n"),
        );

      const existingIds = new Set<string>(
        (existing.recordset as Array<{ TemplateChecklistItemId: string }>).map((r) => String(r.TemplateChecklistItemId)),
      );

      const incomingIds = new Set<string>();

      for (const item of parsed.data.checklistItems) {
        const hasId = typeof item.id === "string" && item.id.trim().length > 0;
        if (hasId) incomingIds.add(item.id as string);

        if (hasId) {
          await tx
            .request()
            .input("templateId", sql.UniqueIdentifier, templateId)
            .input("itemId", sql.UniqueIdentifier, item.id)
            .input("sortOrder", sql.Int, item.sortOrder)
            .input("itemText", sql.NVarChar(512), item.itemText)
            .input("isMandatory", sql.Bit, item.isMandatory ? 1 : 0)
            .input("requiresNotes", sql.Bit, item.requiresNotes ? 1 : 0)
            .input("requiresPassFail", sql.Bit, item.requiresPassFail ? 1 : 0)
            .input("enableAttachment", sql.Bit, item.enableAttachment ? 1 : 0)
            .input("requiresAttachment", sql.Bit, item.requiresAttachment ? 1 : 0)
            .input("isActive", sql.Bit, item.isActive ? 1 : 0)
            .query(
              [
                "UPDATE pm.PMTemplateChecklistItems",
                "SET",
                "  SortOrder = @sortOrder,",
                "  ItemText = @itemText,",
                "  IsMandatory = @isMandatory,",
                "  RequiresNotes = @requiresNotes,",
                "  RequiresPassFail = @requiresPassFail,",
                "  EnableAttachment = @enableAttachment,",
                "  RequiresAttachment = @requiresAttachment,",
                "  IsActive = @isActive,",
                "  UpdatedAt = sysutcdatetime()",
                "WHERE TemplateChecklistItemId = @itemId",
                "  AND TemplateId = @templateId",
              ].join("\n"),
            );
        } else {
          await tx
            .request()
            .input("templateId", sql.UniqueIdentifier, templateId)
            .input("sortOrder", sql.Int, item.sortOrder)
            .input("itemText", sql.NVarChar(512), item.itemText)
            .input("isMandatory", sql.Bit, item.isMandatory ? 1 : 0)
            .input("requiresNotes", sql.Bit, item.requiresNotes ? 1 : 0)
            .input("requiresPassFail", sql.Bit, item.requiresPassFail ? 1 : 0)
            .input("enableAttachment", sql.Bit, item.enableAttachment ? 1 : 0)
            .input("requiresAttachment", sql.Bit, item.requiresAttachment ? 1 : 0)
            .input("isActive", sql.Bit, item.isActive ? 1 : 0)
            .query(
              [
                "INSERT INTO pm.PMTemplateChecklistItems (",
                "  TemplateId, SortOrder, ItemText, IsMandatory, RequiresNotes, RequiresPassFail, EnableAttachment, RequiresAttachment, IsActive",
                ")",
                "VALUES (",
                "  @templateId, @sortOrder, @itemText, @isMandatory, @requiresNotes, @requiresPassFail, @enableAttachment, @requiresAttachment, @isActive",
                ")",
              ].join("\n"),
            );
        }
      }

      for (const id of existingIds) {
        if (!incomingIds.has(id)) {
          await tx
            .request()
            .input("templateId", sql.UniqueIdentifier, templateId)
            .input("itemId", sql.UniqueIdentifier, id)
            .query(
              [
                "UPDATE pm.PMTemplateChecklistItems",
                "SET",
                "  IsActive = 0,",
                "  UpdatedAt = sysutcdatetime()",
                "WHERE TemplateId = @templateId",
                "  AND TemplateChecklistItemId = @itemId",
              ].join("\n"),
            );
        }
      }
    }

    await tx.commit();
    res.json({ ok: true });
  } catch (err: unknown) {
    await tx.rollback().catch(() => undefined);
    if (isDuplicateTemplateNameError(err)) {
      res.status(409).json({ message: "Template name already exists" });
      return;
    }
    throw err;
  }
});

templatesRouter.delete("/:templateId", requireManager, async (req, res) => {
  const templateId = req.params.templateId;
  if (!z.string().uuid().safeParse(templateId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const exists = await tx
      .request()
      .input("templateId", sql.UniqueIdentifier, templateId)
      .query("SELECT TOP (1) TemplateId FROM pm.PMTemplates WHERE TemplateId = @templateId");

    if (!exists.recordset[0]) {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }

    const usage = await tx
      .request()
      .input("templateId", sql.UniqueIdentifier, templateId)
      .query(
        [
          "SELECT",
          "  (SELECT COUNT(1) FROM pm.AssetPMSettings WHERE DefaultTemplateId = @templateId AND PMEnabled = 1) AS AssetCount,",
          "  (SELECT COUNT(1) FROM pm.FacilityPMSettings WHERE DefaultTemplateId = @templateId AND PMEnabled = 1) AS FacilityCount,",
          "  (SELECT COUNT(1) FROM pm.PMSchedules WHERE TemplateId = @templateId) AS ScheduleCount,",
          "  (SELECT COUNT(1) FROM pm.FacilityPMSchedules WHERE TemplateId = @templateId) AS FacilityScheduleCount,",
          "  (SELECT COUNT(1) FROM pm.PMTasks WHERE TemplateId = @templateId) AS TaskCount",
        ].join("\n"),
      );

    const usageRow = usage.recordset[0] as
      | {
          AssetCount: number;
          FacilityCount: number;
          ScheduleCount: number;
          FacilityScheduleCount: number;
          TaskCount: number;
        }
      | undefined;

    const assetCount = usageRow?.AssetCount ?? 0;
    const facilityCount = usageRow?.FacilityCount ?? 0;
    const scheduleCount = usageRow?.ScheduleCount ?? 0;
    const facilityScheduleCount = usageRow?.FacilityScheduleCount ?? 0;
    const taskCount = usageRow?.TaskCount ?? 0;

    const totalUsage = assetCount + facilityCount + scheduleCount + facilityScheduleCount + taskCount;
    if (totalUsage > 0) {
      res.status(409).json({
        message:
          "Template is still in use and cannot be deleted (" +
          `assets: ${assetCount}, facilities: ${facilityCount}, schedules: ${scheduleCount}, facility schedules: ${facilityScheduleCount}, tasks: ${taskCount}` +
          ")",
      });
      await tx.rollback();
      return;
    }

    await tx
      .request()
      .input("templateId", sql.UniqueIdentifier, templateId)
      .query("DELETE FROM pm.PMTemplateChecklistItems WHERE TemplateId = @templateId");

    const deleted = await tx
      .request()
      .input("templateId", sql.UniqueIdentifier, templateId)
      .query("DELETE FROM pm.PMTemplates WHERE TemplateId = @templateId");

    if (deleted.rowsAffected[0] === 0) {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }

    await tx.commit();
    res.json({ ok: true });
  } catch (err: unknown) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});
