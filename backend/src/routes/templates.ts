import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireSuperadmin } from "../middleware/requireRole.js";

const ChecklistItemSchema = z.object({
  id: z.string().uuid().optional(),
  sortOrder: z.number().int().min(0),
  itemText: z.string().min(1).max(512),
  isMandatory: z.boolean().default(true),
  requiresNotes: z.boolean().default(false),
  requiresPassFail: z.boolean().default(true),
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
      isActive: r.IsActive,
    })),
  });
});

templatesRouter.post("/", requireSuperadmin, async (req, res) => {
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
        .input("isActive", sql.Bit, item.isActive ? 1 : 0)
        .query(
          [
            "INSERT INTO pm.PMTemplateChecklistItems (",
            "  TemplateId, SortOrder, ItemText, IsMandatory, RequiresNotes, RequiresPassFail, IsActive",
            ")",
            "VALUES (",
            "  @templateId, @sortOrder, @itemText, @isMandatory, @requiresNotes, @requiresPassFail, @isActive",
            ")",
          ].join("\n"),
        );
    }

    await tx.commit();
    res.status(201).json({ id: templateId });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

templatesRouter.put("/:templateId", requireSuperadmin, async (req, res) => {
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
      await tx
        .request()
        .input("templateId", sql.UniqueIdentifier, templateId)
        .query("DELETE FROM pm.PMTemplateChecklistItems WHERE TemplateId = @templateId");

      for (const item of parsed.data.checklistItems) {
        await tx
          .request()
          .input("templateId", sql.UniqueIdentifier, templateId)
          .input("sortOrder", sql.Int, item.sortOrder)
          .input("itemText", sql.NVarChar(512), item.itemText)
          .input("isMandatory", sql.Bit, item.isMandatory ? 1 : 0)
          .input("requiresNotes", sql.Bit, item.requiresNotes ? 1 : 0)
          .input("requiresPassFail", sql.Bit, item.requiresPassFail ? 1 : 0)
          .input("isActive", sql.Bit, item.isActive ? 1 : 0)
          .query(
            [
              "INSERT INTO pm.PMTemplateChecklistItems (",
              "  TemplateId, SortOrder, ItemText, IsMandatory, RequiresNotes, RequiresPassFail, IsActive",
              ")",
              "VALUES (",
              "  @templateId, @sortOrder, @itemText, @isMandatory, @requiresNotes, @requiresPassFail, @isActive",
              ")",
            ].join("\n"),
          );
      }
    }

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

templatesRouter.delete("/:templateId", requireSuperadmin, async (req, res) => {
  const templateId = req.params.templateId;
  if (!z.string().uuid().safeParse(templateId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const updated = await db
    .request()
    .input("templateId", sql.UniqueIdentifier, templateId)
    .query(
      [
        "UPDATE pm.PMTemplates",
        "SET",
        "  IsActive = 0,",
        "  Version = Version + 1,",
        "  UpdatedAt = sysutcdatetime()",
        "WHERE TemplateId = @templateId",
      ].join("\n"),
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});
