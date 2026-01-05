import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql";
import { requireAuth } from "../middleware/requireAuth";
import { requireManager, requireSuperadmin } from "../middleware/requireRole";

const AssignmentRuleSchema = z.object({
  priority: z.number().int().min(0),
  categoryId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  assetStatus: z.string().max(64).nullable().optional(),
  assignToUserId: z.string().uuid().nullable().optional(),
  assignToRoleId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().default(true),
  effectiveFrom: z.string().datetime().nullable().optional(),
  effectiveTo: z.string().datetime().nullable().optional(),
});

const BlackoutWindowSchema = z.object({
  name: z.string().min(1).max(256),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isActive: z.boolean().default(true),
});

const RecalcSchema = z.object({
  assetId: z.string().uuid().optional(),
});

export const schedulingRouter = Router();

schedulingRouter.use(requireAuth);

schedulingRouter.get("/assignment-rules", async (_req, res) => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT",
        "  RuleId, Priority, CategoryId, LocationId, AssetStatus, AssignToUserId, AssignToRoleId, IsActive, EffectiveFrom, EffectiveTo, CreatedAt, UpdatedAt",
        "FROM pm.AssignmentRules",
        "ORDER BY Priority ASC, UpdatedAt DESC",
      ].join("\n"),
    );

  res.json({ items: result.recordset });
});

schedulingRouter.post("/assignment-rules", requireSuperadmin, async (req, res) => {
  const parsed = AssignmentRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const inserted = await db
    .request()
    .input("priority", sql.Int, parsed.data.priority)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("assetStatus", sql.NVarChar(64), parsed.data.assetStatus ?? null)
    .input("assignToUserId", sql.UniqueIdentifier, parsed.data.assignToUserId ?? null)
    .input("assignToRoleId", sql.UniqueIdentifier, parsed.data.assignToRoleId ?? null)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .input("effectiveFrom", sql.DateTime2(0), parsed.data.effectiveFrom ?? null)
    .input("effectiveTo", sql.DateTime2(0), parsed.data.effectiveTo ?? null)
    .query(
      [
        "INSERT INTO pm.AssignmentRules (",
        "  Priority, CategoryId, LocationId, AssetStatus, AssignToUserId, AssignToRoleId, IsActive, EffectiveFrom, EffectiveTo",
        ")",
        "OUTPUT inserted.RuleId AS RuleId",
        "VALUES (",
        "  @priority, @categoryId, @locationId, @assetStatus, @assignToUserId, @assignToRoleId, @isActive, @effectiveFrom, @effectiveTo",
        ")",
      ].join("\n"),
    );

  const ruleId = inserted.recordset[0]?.RuleId as string | undefined;
  if (!ruleId) {
    res.status(500).json({ message: "Failed" });
    return;
  }

  res.status(201).json({ id: ruleId });
});

schedulingRouter.put("/assignment-rules/:ruleId", requireSuperadmin, async (req, res) => {
  const ruleId = req.params.ruleId;
  if (!z.string().uuid().safeParse(ruleId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = AssignmentRuleSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const hasPriority = parsed.data.priority !== undefined;
  const hasCategoryId = parsed.data.categoryId !== undefined;
  const hasLocationId = parsed.data.locationId !== undefined;
  const hasAssetStatus = parsed.data.assetStatus !== undefined;
  const hasAssignToUserId = parsed.data.assignToUserId !== undefined;
  const hasAssignToRoleId = parsed.data.assignToRoleId !== undefined;
  const hasIsActive = parsed.data.isActive !== undefined;
  const hasEffectiveFrom = parsed.data.effectiveFrom !== undefined;
  const hasEffectiveTo = parsed.data.effectiveTo !== undefined;

  const db = await getDb();
  const updated = await db
    .request()
    .input("ruleId", sql.UniqueIdentifier, ruleId)
    .input("hasPriority", sql.Bit, hasPriority ? 1 : 0)
    .input("priority", sql.Int, parsed.data.priority ?? null)
    .input("hasCategoryId", sql.Bit, hasCategoryId ? 1 : 0)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("hasLocationId", sql.Bit, hasLocationId ? 1 : 0)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("hasAssetStatus", sql.Bit, hasAssetStatus ? 1 : 0)
    .input("assetStatus", sql.NVarChar(64), parsed.data.assetStatus ?? null)
    .input("hasAssignToUserId", sql.Bit, hasAssignToUserId ? 1 : 0)
    .input("assignToUserId", sql.UniqueIdentifier, parsed.data.assignToUserId ?? null)
    .input("hasAssignToRoleId", sql.Bit, hasAssignToRoleId ? 1 : 0)
    .input("assignToRoleId", sql.UniqueIdentifier, parsed.data.assignToRoleId ?? null)
    .input("hasIsActive", sql.Bit, hasIsActive ? 1 : 0)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .input("hasEffectiveFrom", sql.Bit, hasEffectiveFrom ? 1 : 0)
    .input("effectiveFrom", sql.DateTime2(0), parsed.data.effectiveFrom ?? null)
    .input("hasEffectiveTo", sql.Bit, hasEffectiveTo ? 1 : 0)
    .input("effectiveTo", sql.DateTime2(0), parsed.data.effectiveTo ?? null)
    .query(
      [
        "UPDATE pm.AssignmentRules",
        "SET",
        "  Priority = CASE WHEN @hasPriority = 1 THEN @priority ELSE Priority END,",
        "  CategoryId = CASE WHEN @hasCategoryId = 1 THEN @categoryId ELSE CategoryId END,",
        "  LocationId = CASE WHEN @hasLocationId = 1 THEN @locationId ELSE LocationId END,",
        "  AssetStatus = CASE WHEN @hasAssetStatus = 1 THEN @assetStatus ELSE AssetStatus END,",
        "  AssignToUserId = CASE WHEN @hasAssignToUserId = 1 THEN @assignToUserId ELSE AssignToUserId END,",
        "  AssignToRoleId = CASE WHEN @hasAssignToRoleId = 1 THEN @assignToRoleId ELSE AssignToRoleId END,",
        "  IsActive = CASE WHEN @hasIsActive = 1 THEN @isActive ELSE IsActive END,",
        "  EffectiveFrom = CASE WHEN @hasEffectiveFrom = 1 THEN @effectiveFrom ELSE EffectiveFrom END,",
        "  EffectiveTo = CASE WHEN @hasEffectiveTo = 1 THEN @effectiveTo ELSE EffectiveTo END,",
        "  UpdatedAt = sysutcdatetime()",
        "WHERE RuleId = @ruleId",
      ].join("\n"),
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});

schedulingRouter.delete("/assignment-rules/:ruleId", requireSuperadmin, async (req, res) => {
  const ruleId = req.params.ruleId;
  if (!z.string().uuid().safeParse(ruleId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const updated = await db
    .request()
    .input("ruleId", sql.UniqueIdentifier, ruleId)
    .query(
      "UPDATE pm.AssignmentRules SET IsActive = 0, UpdatedAt = sysutcdatetime() WHERE RuleId = @ruleId",
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});

schedulingRouter.get("/blackout-windows", async (_req, res) => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT",
        "  BlackoutWindowId, Name, StartsAt, EndsAt, IsActive, CreatedAt, UpdatedAt",
        "FROM pm.BlackoutWindows",
        "ORDER BY StartsAt DESC",
      ].join("\n"),
    );

  res.json({ items: result.recordset });
});

schedulingRouter.post("/blackout-windows", requireSuperadmin, async (req, res) => {
  const parsed = BlackoutWindowSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const inserted = await db
    .request()
    .input("name", sql.NVarChar(256), parsed.data.name)
    .input("startsAt", sql.DateTime2(0), parsed.data.startsAt)
    .input("endsAt", sql.DateTime2(0), parsed.data.endsAt)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .query(
      [
        "INSERT INTO pm.BlackoutWindows (Name, StartsAt, EndsAt, IsActive)",
        "OUTPUT inserted.BlackoutWindowId AS BlackoutWindowId",
        "VALUES (@name, @startsAt, @endsAt, @isActive)",
      ].join("\n"),
    );

  const blackoutWindowId = inserted.recordset[0]?.BlackoutWindowId as string | undefined;
  if (!blackoutWindowId) {
    res.status(500).json({ message: "Failed" });
    return;
  }

  res.status(201).json({ id: blackoutWindowId });
});

schedulingRouter.put("/blackout-windows/:blackoutWindowId", requireSuperadmin, async (req, res) => {
  const blackoutWindowId = req.params.blackoutWindowId;
  if (!z.string().uuid().safeParse(blackoutWindowId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = BlackoutWindowSchema.partial().safeParse(req.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const hasName = parsed.data.name !== undefined;
  const hasStartsAt = parsed.data.startsAt !== undefined;
  const hasEndsAt = parsed.data.endsAt !== undefined;
  const hasIsActive = parsed.data.isActive !== undefined;

  const db = await getDb();
  const updated = await db
    .request()
    .input("blackoutWindowId", sql.UniqueIdentifier, blackoutWindowId)
    .input("hasName", sql.Bit, hasName ? 1 : 0)
    .input("name", sql.NVarChar(256), parsed.data.name ?? null)
    .input("hasStartsAt", sql.Bit, hasStartsAt ? 1 : 0)
    .input("startsAt", sql.DateTime2(0), parsed.data.startsAt ?? null)
    .input("hasEndsAt", sql.Bit, hasEndsAt ? 1 : 0)
    .input("endsAt", sql.DateTime2(0), parsed.data.endsAt ?? null)
    .input("hasIsActive", sql.Bit, hasIsActive ? 1 : 0)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .query(
      [
        "UPDATE pm.BlackoutWindows",
        "SET",
        "  Name = CASE WHEN @hasName = 1 THEN @name ELSE Name END,",
        "  StartsAt = CASE WHEN @hasStartsAt = 1 THEN @startsAt ELSE StartsAt END,",
        "  EndsAt = CASE WHEN @hasEndsAt = 1 THEN @endsAt ELSE EndsAt END,",
        "  IsActive = CASE WHEN @hasIsActive = 1 THEN @isActive ELSE IsActive END,",
        "  UpdatedAt = sysutcdatetime()",
        "WHERE BlackoutWindowId = @blackoutWindowId",
      ].join("\n"),
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});

schedulingRouter.delete(
  "/blackout-windows/:blackoutWindowId",
  requireSuperadmin,
  async (req, res) => {
    const blackoutWindowId = req.params.blackoutWindowId;
    if (!z.string().uuid().safeParse(blackoutWindowId).success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }

    const db = await getDb();
    const updated = await db
      .request()
      .input("blackoutWindowId", sql.UniqueIdentifier, blackoutWindowId)
      .query(
        "UPDATE pm.BlackoutWindows SET IsActive = 0, UpdatedAt = sysutcdatetime() WHERE BlackoutWindowId = @blackoutWindowId",
      );

    if (updated.rowsAffected[0] === 0) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    res.json({ ok: true });
  },
);

schedulingRouter.post("/recalculate", requireManager, async (req, res) => {
  const parsed = RecalcSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const request = tx
      .request()
      .input("assetId", sql.UniqueIdentifier, parsed.data.assetId ?? null)
      .query(
        [
          "SELECT",
          "  a.AssetId AS AssetId,",
          "  s.DefaultTemplateId AS DefaultTemplateId,",
          "  s.NextPMDueAt AS NextPMDueAt,",
          "  t.IntervalDays AS IntervalDays",
          "FROM pm.Assets a",
          "INNER JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
          "INNER JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
          "WHERE a.IsArchived = 0",
          "  AND s.PMEnabled = 1",
          "  AND t.IsActive = 1",
          "  AND (@assetId IS NULL OR a.AssetId = @assetId)",
        ].join("\n"),
      );

    const rows = (await request).recordset as Array<Record<string, unknown>>;
    let updatedCount = 0;

    for (const row of rows) {
      const assetId = row.AssetId as string;
      const templateId = row.DefaultTemplateId as string;
      const intervalDays = Number(row.IntervalDays);
      const nextDueAt = row.NextPMDueAt as Date | null;
      const computedNextDueAt = nextDueAt ?? new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);

      await tx
        .request()
        .input("assetId", sql.UniqueIdentifier, assetId)
        .input("templateId", sql.UniqueIdentifier, templateId)
        .input("nextDueAt", sql.DateTime2(0), computedNextDueAt)
        .query(
          [
            "MERGE pm.PMSchedules WITH (HOLDLOCK) AS target",
            "USING (SELECT @assetId AS AssetId, @templateId AS TemplateId) AS source",
            "ON target.AssetId = source.AssetId AND target.TemplateId = source.TemplateId",
            "WHEN MATCHED THEN",
            "  UPDATE SET",
            "    NextDueAt = @nextDueAt,",
            "    LastCalculatedAt = sysutcdatetime(),",
            "    UpdatedAt = sysutcdatetime()",
            "WHEN NOT MATCHED THEN",
            "  INSERT (AssetId, TemplateId, NextDueAt)",
            "  VALUES (@assetId, @templateId, @nextDueAt);",
          ].join("\n"),
        );

      await tx
        .request()
        .input("assetId", sql.UniqueIdentifier, assetId)
        .input("nextDueAt", sql.DateTime2(0), computedNextDueAt)
        .query(
          "UPDATE pm.AssetPMSettings SET NextPMDueAt = @nextDueAt, UpdatedAt = sysutcdatetime() WHERE AssetId = @assetId",
        );

      updatedCount += 1;
    }

    await tx.commit();
    res.json({ updated: updatedCount });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});
