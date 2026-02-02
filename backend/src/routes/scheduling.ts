import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireManager, requireSuperadmin } from "../middleware/requireRole.js";

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
  facilityId: z.string().uuid().optional(),
  force: z.boolean().optional().default(false),
});

const CalendarQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Invalid month")
    .optional(),
});

const DayQuerySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
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
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [],
    });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    let updatedCount = 0;
    const hasAssetFilter = parsed.data.assetId !== undefined;
    const hasFacilityFilter = parsed.data.facilityId !== undefined;
    const recalcAll = !hasAssetFilter && !hasFacilityFilter;

    if (hasAssetFilter || recalcAll) {
      const assetRequest = tx
        .request()
        .input("force", sql.Bit, parsed.data.force ? 1 : 0)
        .input("assetId", sql.UniqueIdentifier, parsed.data.assetId ?? null)
        .query(
          [
            "SELECT",
            "  a.AssetId AS AssetId,",
            "  s.DefaultTemplateId AS DefaultTemplateId,",
            "  COALESCE(h.LastCompletedAt, s.LastPMCompletedAt) AS LastPMCompletedAt,",
            "  due.NextDueAt AS NextPMDueAt",
            "FROM pm.Assets a",
            "INNER JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
            "INNER JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
            "LEFT JOIN pm.PMSchedules sch ON sch.AssetId = a.AssetId AND sch.TemplateId = s.DefaultTemplateId",
            "OUTER APPLY (",
            "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
            "  FROM pm.PMTasks tt",
            "  WHERE tt.AssetId = a.AssetId",
            "    AND tt.TemplateId = s.DefaultTemplateId",
            "    AND tt.Status = N'completed'",
            "    AND tt.CompletedAt IS NOT NULL",
            ") h",
            "OUTER APPLY (",
            "  SELECT pm.fn_CalculateNextDueAt(",
            "    h.LastCompletedAt,",
            "    s.LastPMCompletedAt,",
            "    t.IntervalDays,",
            "    CASE WHEN @force = 1 THEN NULL ELSE s.NextPMDueAt END",
            "  ) AS NextDueAt",
            ") due",
            "WHERE a.IsArchived = 0",
            "  AND s.PMEnabled = 1",
            "  AND t.IsActive = 1",
            "  AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
            "  AND (@assetId IS NULL OR a.AssetId = @assetId)",
          ].join("\n"),
        );

      const assetRows = (await assetRequest).recordset as Array<Record<string, unknown>>;

      for (const row of assetRows) {
        const assetId = row.AssetId as string;
        const templateId = row.DefaultTemplateId as string;
        const lastPmCompletedAt = (row.LastPMCompletedAt as Date | null) ?? null;
        const computedNextDueAt = row.NextPMDueAt as Date;

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
          .input("lastPmCompletedAt", sql.DateTime2(0), lastPmCompletedAt)
          .query(
            [
              "UPDATE pm.AssetPMSettings",
              "SET",
              "  LastPMCompletedAt = COALESCE(@lastPmCompletedAt, LastPMCompletedAt),",
              "  NextPMDueAt = @nextDueAt,",
              "  UpdatedAt = sysutcdatetime()",
              "WHERE AssetId = @assetId",
            ].join("\n"),
          );

        updatedCount += 1;
      }
    }

    if (hasFacilityFilter || recalcAll) {
      const facilityRequest = tx
        .request()
        .input("force", sql.Bit, parsed.data.force ? 1 : 0)
        .input("facilityId", sql.UniqueIdentifier, parsed.data.facilityId ?? null)
        .query(
          [
            "SELECT",
            "  f.FacilityId AS FacilityId,",
            "  s.DefaultTemplateId AS DefaultTemplateId,",
            "  COALESCE(h.LastCompletedAt, s.LastPMCompletedAt) AS LastPMCompletedAt,",
            "  due.NextDueAt AS NextPMDueAt",
            "FROM pm.Facilities f",
            "INNER JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
            "INNER JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
            "LEFT JOIN pm.FacilityPMSchedules sch ON sch.FacilityId = f.FacilityId AND sch.TemplateId = s.DefaultTemplateId",
            "OUTER APPLY (",
            "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
            "  FROM pm.PMTasks tt",
            "  WHERE tt.FacilityId = f.FacilityId",
            "    AND tt.TemplateId = s.DefaultTemplateId",
            "    AND tt.Status = N'completed'",
            "    AND tt.CompletedAt IS NOT NULL",
            ") h",
            "OUTER APPLY (",
            "  SELECT pm.fn_CalculateNextDueAt(",
            "    h.LastCompletedAt,",
            "    s.LastPMCompletedAt,",
            "    t.IntervalDays,",
            "    CASE WHEN @force = 1 THEN NULL ELSE s.NextPMDueAt END",
            "  ) AS NextDueAt",
            ") due",
            "WHERE f.IsActive = 1",
            "  AND s.PMEnabled = 1",
            "  AND t.IsActive = 1",
            "  AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
            "  AND (@facilityId IS NULL OR f.FacilityId = @facilityId)",
          ].join("\n"),
        );

      const facilityRows = (await facilityRequest).recordset as Array<Record<string, unknown>>;

      for (const row of facilityRows) {
        const facilityId = row.FacilityId as string;
        const templateId = row.DefaultTemplateId as string;
        const lastPmCompletedAt = (row.LastPMCompletedAt as Date | null) ?? null;
        const computedNextDueAt = row.NextPMDueAt as Date;

        await tx
          .request()
          .input("facilityId", sql.UniqueIdentifier, facilityId)
          .input("templateId", sql.UniqueIdentifier, templateId)
          .input("nextDueAt", sql.DateTime2(0), computedNextDueAt)
          .query(
            [
              "MERGE pm.FacilityPMSchedules WITH (HOLDLOCK) AS target",
              "USING (SELECT @facilityId AS FacilityId, @templateId AS TemplateId) AS source",
              "ON target.FacilityId = source.FacilityId AND target.TemplateId = source.TemplateId",
              "WHEN MATCHED THEN",
              "  UPDATE SET",
              "    NextDueAt = @nextDueAt,",
              "    LastCalculatedAt = sysutcdatetime(),",
              "    UpdatedAt = sysutcdatetime()",
              "WHEN NOT MATCHED THEN",
              "  INSERT (FacilityId, TemplateId, NextDueAt)",
              "  VALUES (@facilityId, @templateId, @nextDueAt);",
            ].join("\n"),
          );

        await tx
          .request()
          .input("facilityId", sql.UniqueIdentifier, facilityId)
          .input("nextDueAt", sql.DateTime2(0), computedNextDueAt)
          .input("lastPmCompletedAt", sql.DateTime2(0), lastPmCompletedAt)
          .query(
            [
              "UPDATE pm.FacilityPMSettings",
              "SET",
              "  LastPMCompletedAt = COALESCE(@lastPmCompletedAt, LastPMCompletedAt),",
              "  NextPMDueAt = @nextDueAt,",
              "  UpdatedAt = sysutcdatetime()",
              "WHERE FacilityId = @facilityId",
            ].join("\n"),
          );

        updatedCount += 1;
      }
    }

    await tx.commit();
    res.json({ updated: updatedCount });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

schedulingRouter.get("/day", async (req, res) => {
  const parsed = DayQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [],
    });
    return;
  }

  const [yearPart, monthPart, dayPart] = parsed.data.date.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  const day = Number(dayPart);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(monthIndex) ||
    !Number.isFinite(day) ||
    monthIndex < 0 ||
    monthIndex > 11 ||
    day < 1 ||
    day > 31
  ) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "date",
          issue: "Invalid date",
        },
      ],
    });
    return;
  }

  const from = new Date(Date.UTC(year, monthIndex, day, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthIndex, day + 1, 0, 0, 0));

  const db = await getDb();
  const result = await db
    .request()
    .input("from", sql.DateTime2(0), from)
    .input("to", sql.DateTime2(0), to)
    .query(
      [
        "DECLARE @todayStart datetime2(0) = dateadd(day, datediff(day, 0, sysutcdatetime()), 0);",
        "DECLARE @todayEnd datetime2(0) = dateadd(day, 1, @todayStart);",
        "WITH items AS (",
        "  SELECT",
        "    CAST(t.TaskId AS nvarchar(64)) AS TaskId,",
        "    t.TaskNumber AS TaskNumber,",
        "    t.ScheduledDueAt AS ScheduledDueAt,",
        "    t.Status AS Status,",
        "    t.Priority AS Priority,",
        "    a.AssetId AS AssetId,",
        "    a.AssetTag AS AssetTag,",
        "    a.Name AS AssetName,",
        "    tpl.TemplateId AS TemplateId,",
        "    tpl.Name AS TemplateName,",
        "    a.AssetOperationalStatus AS AssetOperationalStatus,",
        "    sch.Frozen AS ScheduleFrozen,",
        "    COALESCE(tpl.EstimatedDurationMinutes, 60) AS EstimatedMinutes",
        "  FROM pm.PMTasks t",
        "  INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "  INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "  LEFT JOIN pm.PMSchedules sch ON sch.AssetId = t.AssetId AND sch.TemplateId = t.TemplateId",
        "  WHERE t.ScheduledDueAt >= @from",
        "    AND t.ScheduledDueAt < @to",
        "    AND t.Status NOT IN (N'completed', N'cancelled')",
        "  UNION ALL",
        "  SELECT",
        "    CAST(t.TaskId AS nvarchar(64)) AS TaskId,",
        "    t.TaskNumber AS TaskNumber,",
        "    t.ScheduledDueAt AS ScheduledDueAt,",
        "    t.Status AS Status,",
        "    t.Priority AS Priority,",
        "    f.FacilityId AS AssetId,",
        "    CAST(N'' AS nvarchar(64)) AS AssetTag,",
        "    f.Name AS AssetName,",
        "    tpl.TemplateId AS TemplateId,",
        "    tpl.Name AS TemplateName,",
        "    CAST(NULL AS nvarchar(64)) AS AssetOperationalStatus,",
        "    sch.Frozen AS ScheduleFrozen,",
        "    COALESCE(tpl.EstimatedDurationMinutes, 60) AS EstimatedMinutes",
        "  FROM pm.PMTasks t",
        "  INNER JOIN pm.Facilities f ON f.FacilityId = t.FacilityId",
        "  INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "  LEFT JOIN pm.FacilityPMSchedules sch ON sch.FacilityId = t.FacilityId AND sch.TemplateId = t.TemplateId",
        "  WHERE t.ScheduledDueAt >= @from",
        "    AND t.ScheduledDueAt < @to",
        "    AND t.Status NOT IN (N'completed', N'cancelled')",
        "    AND t.AssetId IS NULL",
        "    AND t.FacilityId IS NOT NULL",
        "  UNION ALL",
        "  SELECT",
        "    CONCAT(N'projected:', a.AssetId, N':', s.DefaultTemplateId, N':', CONVERT(varchar(19), due.DueAt, 126)) AS TaskId,",
        "    N'Projected' AS TaskNumber,",
        "    due.DueAt AS ScheduledDueAt,",
        "    N'projected' AS Status,",
        "    N'normal' AS Priority,",
        "    a.AssetId AS AssetId,",
        "    a.AssetTag AS AssetTag,",
        "    a.Name AS AssetName,",
        "    tpl.TemplateId AS TemplateId,",
        "    tpl.Name AS TemplateName,",
        "    a.AssetOperationalStatus AS AssetOperationalStatus,",
        "    sch.Frozen AS ScheduleFrozen,",
        "    COALESCE(tpl.EstimatedDurationMinutes, 60) AS EstimatedMinutes",
        "  FROM pm.Assets a",
        "  INNER JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "  INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = s.DefaultTemplateId",
        "  LEFT JOIN pm.PMSchedules sch ON sch.AssetId = a.AssetId AND sch.TemplateId = s.DefaultTemplateId",
        "  OUTER APPLY (",
        "    SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "    FROM pm.PMTasks tt",
        "    WHERE tt.AssetId = a.AssetId",
        "      AND tt.TemplateId = s.DefaultTemplateId",
        "      AND tt.Status = N'completed'",
        "      AND tt.CompletedAt IS NOT NULL",
        "  ) h",
        "  OUTER APPLY (",
        "    SELECT pm.fn_CalculateNextDueAt(",
        "      h.LastCompletedAt,",
        "      s.LastPMCompletedAt,",
        "      tpl.IntervalDays,",
        "      s.NextPMDueAt",
        "    ) AS DueAt",
        "  ) due",
        "  WHERE a.IsArchived = 0",
        "    AND (a.AssetOperationalStatus IS NULL OR a.AssetOperationalStatus NOT IN (N'broken', N'archived'))",
        "    AND s.PMEnabled = 1",
        "    AND s.DefaultTemplateId IS NOT NULL",
        "    AND tpl.IsActive = 1",
        "    AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
        "    AND due.DueAt >= @from",
        "    AND due.DueAt < @to",
        "    AND NOT EXISTS (",
        "      SELECT 1",
        "      FROM pm.PMTasks t2",
        "      WHERE t2.AssetId = a.AssetId",
        "        AND t2.TemplateId = s.DefaultTemplateId",
        "        AND t2.ScheduledDueAt = due.DueAt",
        "        AND t2.Status NOT IN (N'completed', N'cancelled')",
        "    )",
        "  UNION ALL",
        "  SELECT",
        "    CONCAT(N'projected-facility:', f.FacilityId, N':', s.DefaultTemplateId, N':', CONVERT(varchar(19), due.DueAt, 126)) AS TaskId,",
        "    N'Projected' AS TaskNumber,",
        "    due.DueAt AS ScheduledDueAt,",
        "    N'projected' AS Status,",
        "    N'normal' AS Priority,",
        "    f.FacilityId AS AssetId,",
        "    CAST(N'' AS nvarchar(64)) AS AssetTag,",
        "    f.Name AS AssetName,",
        "    tpl.TemplateId AS TemplateId,",
        "    tpl.Name AS TemplateName,",
        "    CAST(NULL AS nvarchar(64)) AS AssetOperationalStatus,",
        "    sch.Frozen AS ScheduleFrozen,",
        "    COALESCE(tpl.EstimatedDurationMinutes, 60) AS EstimatedMinutes",
        "  FROM pm.Facilities f",
        "  INNER JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "  INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = s.DefaultTemplateId",
        "  LEFT JOIN pm.FacilityPMSchedules sch ON sch.FacilityId = f.FacilityId AND sch.TemplateId = s.DefaultTemplateId",
        "  OUTER APPLY (",
        "    SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "    FROM pm.PMTasks tt",
        "    WHERE tt.FacilityId = f.FacilityId",
        "      AND tt.TemplateId = s.DefaultTemplateId",
        "      AND tt.Status = N'completed'",
        "      AND tt.CompletedAt IS NOT NULL",
        "  ) h",
        "  OUTER APPLY (",
        "    SELECT pm.fn_CalculateNextDueAt(",
        "      h.LastCompletedAt,",
        "      s.LastPMCompletedAt,",
        "      tpl.IntervalDays,",
        "      s.NextPMDueAt",
        "    ) AS DueAt",
        "  ) due",
        "  WHERE f.IsActive = 1",
        "    AND s.PMEnabled = 1",
        "    AND s.DefaultTemplateId IS NOT NULL",
        "    AND tpl.IsActive = 1",
        "    AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
        "    AND due.DueAt >= @from",
        "    AND due.DueAt < @to",
        "    AND NOT EXISTS (",
        "      SELECT 1",
        "      FROM pm.PMTasks t2",
        "      WHERE t2.FacilityId = f.FacilityId",
        "        AND t2.TemplateId = s.DefaultTemplateId",
        "        AND t2.ScheduledDueAt = due.DueAt",
        "        AND t2.Status NOT IN (N'completed', N'cancelled')",
        "    )",
        ")",
        "SELECT",
        "  i.TaskId AS TaskId,",
        "  i.TaskNumber AS TaskNumber,",
        "  i.ScheduledDueAt AS ScheduledDueAt,",
        "  i.Status AS Status,",
        "  i.Priority AS Priority,",
        "  i.AssetId AS AssetId,",
        "  i.AssetTag AS AssetTag,",
        "  i.AssetName AS AssetName,",
        "  i.TemplateId AS TemplateId,",
        "  i.TemplateName AS TemplateName,",
        "  i.AssetOperationalStatus AS AssetOperationalStatus,",
        "  i.ScheduleFrozen AS ScheduleFrozen,",
        "  i.EstimatedMinutes AS EstimatedMinutes,",
        "  CASE",
        "    WHEN i.ScheduledDueAt < @todayStart THEN N'overdue'",
        "    WHEN i.ScheduledDueAt < @todayEnd THEN N'due'",
        "    ELSE N'scheduled'",
        "  END AS Bucket",
        "FROM items i",
        "ORDER BY i.ScheduledDueAt ASC, i.TaskNumber ASC",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    items: rows
      .map((r) => {
        const id = typeof r.TaskId === "string" ? r.TaskId : null;
        const taskNumber = typeof r.TaskNumber === "string" ? r.TaskNumber : null;
        const scheduledDueAt = r.ScheduledDueAt instanceof Date ? r.ScheduledDueAt.toISOString() : null;
        const status = typeof r.Status === "string" ? r.Status : null;
        const priority = typeof r.Priority === "string" ? r.Priority : null;
        const assetId = typeof r.AssetId === "string" ? r.AssetId : null;
        const assetTag = typeof r.AssetTag === "string" ? r.AssetTag : null;
        const assetName = typeof r.AssetName === "string" ? r.AssetName : null;
        const templateId = typeof r.TemplateId === "string" ? r.TemplateId : null;
        const templateName = typeof r.TemplateName === "string" ? r.TemplateName : null;
        const assetOperationalStatus = typeof (r as { AssetOperationalStatus?: unknown }).AssetOperationalStatus === "string"
          ? ((r as { AssetOperationalStatus: string }).AssetOperationalStatus as string)
          : null;
        const scheduleFrozenRaw = (r as { ScheduleFrozen?: unknown }).ScheduleFrozen;
        const scheduleFrozen = scheduleFrozenRaw === 1 || scheduleFrozenRaw === true ? true : false;
        const bucket = typeof r.Bucket === "string" ? r.Bucket : null;
        const estimatedMinutesRaw =
          typeof (r as { EstimatedMinutes?: unknown }).EstimatedMinutes === "number" &&
          Number.isFinite((r as { EstimatedMinutes?: unknown }).EstimatedMinutes as number)
            ? ((r as { EstimatedMinutes: number }).EstimatedMinutes as number)
            : null;

        if (
          !id ||
          !taskNumber ||
          !scheduledDueAt ||
          !status ||
          !priority ||
          !assetId ||
          !assetTag ||
          !assetName ||
          !templateId ||
          !templateName
        ) {
          return null;
        }

        if (bucket !== "scheduled" && bucket !== "due" && bucket !== "overdue") return null;

        const estimatedMinutes = estimatedMinutesRaw ?? 0;

        return {
          id,
          taskNumber,
          scheduledDueAt,
          status,
          priority,
          estimatedMinutes,
          bucket: bucket as "scheduled" | "due" | "overdue",
          asset: { id: assetId, assetTag, name: assetName },
          template: { id: templateId, name: templateName },
          assetOperationalStatus,
          scheduleFrozen,
        };
      })
      .filter(
        (v): v is {
          id: string;
          taskNumber: string;
          scheduledDueAt: string;
          status: string;
          priority: string;
          estimatedMinutes: number;
          bucket: "scheduled" | "due" | "overdue";
          asset: { id: string; assetTag: string; name: string };
          template: { id: string; name: string };
          assetOperationalStatus: string | null;
          scheduleFrozen: boolean;
        } => v !== null,
      ),
  });
});

schedulingRouter.get("/calendar", async (req, res) => {
  const parsed = CalendarQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [],
    });
    return;
  }

  const now = new Date();
  const defaultMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const month = parsed.data.month ?? defaultMonth;

  const [yearPart, monthPart] = month.split("-");
  const year = Number(yearPart);
  const monthIndex = Number(monthPart) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "month",
          issue: "Invalid month",
        },
      ],
    });
    return;
  }

  const from = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0));

  const db = await getDb();
  const result = await db
    .request()
    .input("from", sql.DateTime2(0), from)
    .input("to", sql.DateTime2(0), to)
    .query(
      [
        "DECLARE @todayStart datetime2(0) = dateadd(day, datediff(day, 0, sysutcdatetime()), 0);",
        "DECLARE @todayEnd datetime2(0) = dateadd(day, 1, @todayStart);",
        "WITH occurrences AS (",
        "  SELECT",
        "    t.ScheduledDueAt AS ScheduledDueAt,",
        "    COALESCE(tpl.EstimatedDurationMinutes, 60) AS EstimatedMinutes",
        "  FROM pm.PMTasks t",
        "  INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "  WHERE t.ScheduledDueAt >= @from",
        "    AND t.ScheduledDueAt < @to",
        "    AND t.Status NOT IN (N'completed', N'cancelled')",
        "  UNION ALL",
        "  SELECT",
        "    due.DueAt AS ScheduledDueAt,",
        "    COALESCE(tpl.EstimatedDurationMinutes, 60) AS EstimatedMinutes",
        "  FROM pm.Assets a",
        "  INNER JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "  INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = s.DefaultTemplateId",
        "  LEFT JOIN pm.PMSchedules sch ON sch.AssetId = a.AssetId AND sch.TemplateId = s.DefaultTemplateId",
        "  OUTER APPLY (",
        "    SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "    FROM pm.PMTasks tt",
        "    WHERE tt.AssetId = a.AssetId",
        "      AND tt.TemplateId = s.DefaultTemplateId",
        "      AND tt.Status = N'completed'",
        "      AND tt.CompletedAt IS NOT NULL",
        "  ) h",
        "  OUTER APPLY (",
        "    SELECT pm.fn_CalculateNextDueAt(",
        "      h.LastCompletedAt,",
        "      s.LastPMCompletedAt,",
        "      tpl.IntervalDays,",
        "      s.NextPMDueAt",
        "    ) AS DueAt",
        "  ) due",
        "  WHERE a.IsArchived = 0",
        "    AND (a.AssetOperationalStatus IS NULL OR a.AssetOperationalStatus NOT IN (N'broken', N'archived'))",
        "    AND s.PMEnabled = 1",
        "    AND s.DefaultTemplateId IS NOT NULL",
        "    AND tpl.IsActive = 1",
        "    AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
        "    AND due.DueAt >= @from",
        "    AND due.DueAt < @to",
        "    AND NOT EXISTS (",
        "      SELECT 1",
        "      FROM pm.PMTasks t2",
        "      WHERE t2.AssetId = a.AssetId",
        "        AND t2.TemplateId = s.DefaultTemplateId",
        "        AND t2.ScheduledDueAt = due.DueAt",
        "        AND t2.Status NOT IN (N'completed', N'cancelled')",
        "    )",
        "  UNION ALL",
        "  SELECT",
        "    due.DueAt AS ScheduledDueAt,",
        "    COALESCE(tpl.EstimatedDurationMinutes, 60) AS EstimatedMinutes",
        "  FROM pm.Facilities f",
        "  INNER JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "  INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = s.DefaultTemplateId",
        "  LEFT JOIN pm.FacilityPMSchedules sch ON sch.FacilityId = f.FacilityId AND sch.TemplateId = s.DefaultTemplateId",
        "  OUTER APPLY (",
        "    SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "    FROM pm.PMTasks tt",
        "    WHERE tt.FacilityId = f.FacilityId",
        "      AND tt.TemplateId = s.DefaultTemplateId",
        "      AND tt.Status = N'completed'",
        "      AND tt.CompletedAt IS NOT NULL",
        "  ) h",
        "  OUTER APPLY (",
        "    SELECT pm.fn_CalculateNextDueAt(",
        "      h.LastCompletedAt,",
        "      s.LastPMCompletedAt,",
        "      tpl.IntervalDays,",
        "      s.NextPMDueAt",
        "    ) AS DueAt",
        "  ) due",
        "  WHERE f.IsActive = 1",
        "    AND s.PMEnabled = 1",
        "    AND s.DefaultTemplateId IS NOT NULL",
        "    AND tpl.IsActive = 1",
        "    AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
        "    AND due.DueAt >= @from",
        "    AND due.DueAt < @to",
        "    AND NOT EXISTS (",
        "      SELECT 1",
        "      FROM pm.PMTasks t2",
        "      WHERE t2.FacilityId = f.FacilityId",
        "        AND t2.TemplateId = s.DefaultTemplateId",
        "        AND t2.ScheduledDueAt = due.DueAt",
        "        AND t2.Status NOT IN (N'completed', N'cancelled')",
        "    )",
        "),",
        "date_capacity AS (",
        "  SELECT",
        "    CAST(ScheduledDueAt AS date) AS DueDate,",
        "    SUM(EstimatedMinutes) AS CapacityMinutes",
        "  FROM occurrences",
        "  GROUP BY CAST(ScheduledDueAt AS date)",
        ")",
        "SELECT",
        "  CAST(o.ScheduledDueAt AS date) AS DueDate,",
        "  CASE",
        "    WHEN o.ScheduledDueAt < @todayStart THEN N'overdue'",
        "    WHEN o.ScheduledDueAt < @todayEnd THEN N'due'",
        "    ELSE N'scheduled'",
        "  END AS Bucket,",
        "  COUNT(1) AS Cnt,",
        "  dc.CapacityMinutes AS CapacityMinutes",
        "FROM occurrences o",
        "INNER JOIN date_capacity dc ON dc.DueDate = CAST(o.ScheduledDueAt AS date)",
        "GROUP BY CAST(o.ScheduledDueAt AS date),",
        "  CASE",
        "    WHEN o.ScheduledDueAt < @todayStart THEN N'overdue'",
        "    WHEN o.ScheduledDueAt < @todayEnd THEN N'due'",
        "    ELSE N'scheduled'",
        "  END,",
        "  dc.CapacityMinutes",
        "ORDER BY DueDate ASC",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    items: rows
      .map((r) => {
        const dueDate = r.DueDate instanceof Date ? r.DueDate : null;
        const bucket = typeof r.Bucket === "string" ? r.Bucket : null;
        const count = typeof r.Cnt === "number" ? r.Cnt : null;
        const capacityMinutesRaw = r.CapacityMinutes;
        const capacityMinutes = typeof capacityMinutesRaw === "number" ? capacityMinutesRaw : 0;
        if (!dueDate || !bucket || count === null) return null;

        const date = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()))
          .toISOString()
          .slice(0, 10);

        if (bucket !== "scheduled" && bucket !== "due" && bucket !== "overdue") return null;
        return { date, type: bucket as "scheduled" | "due" | "overdue", count, capacityMinutes };
      })
      .filter(
        (v): v is { date: string; type: "scheduled" | "due" | "overdue"; count: number; capacityMinutes: number } =>
          v !== null,
      ),
  });
});
