import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireManager } from "../middleware/requireRole.js";

const parseBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
};

const FacilityQuerySchema = z.object({
  search: z.string().optional(),
  locationId: z.string().uuid().optional(),
  pmEnabled: z.string().optional(),
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
});

const FacilityCreateSchema = z.object({
  name: z.string().min(1).max(256),
  locationId: z.string().uuid().nullable().optional(),
  description: z.string().max(1024).nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

const FacilityUpdateSchema = FacilityCreateSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "No updates" },
);

const FacilityPmSettingsSchema = z
  .object({
    pmEnabled: z.boolean().optional(),
    defaultTemplateId: z.string().uuid().nullable().optional(),
    nextPmDueAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No updates" });

export const facilitiesRouter = Router();

facilitiesRouter.use(requireAuth);

facilitiesRouter.get("/", async (req, res) => {
  const parsed = FacilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(parsed.data.page) || 50));
  const offset = (page - 1) * pageSize;
  const pmEnabled = parseBoolean(parsed.data.pmEnabled);

  const db = await getDb();
  const result = await db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("search", sql.NVarChar(256), parsed.data.search ? `%${parsed.data.search}%` : null)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("pmEnabled", sql.Bit, pmEnabled)
    .query(
      [
        "SELECT",
        "  f.FacilityId AS FacilityId,",
        "  f.Name AS Name,",
        "  f.LocationId AS LocationId,",
        "  l.Name AS LocationName,",
        "  f.Description AS Description,",
        "  f.IsActive AS IsActive,",
        "  s.PMEnabled AS PMEnabled,",
        "  s.DefaultTemplateId AS DefaultTemplateId,",
        "  COALESCE(h.LastCompletedAt, s.LastPMCompletedAt) AS LastPMCompletedAt,",
        "  s.NextPMDueAt AS NextPMDueAt",
        "FROM pm.Facilities f",
        "LEFT JOIN pm.Locations l ON l.LocationId = f.LocationId",
        "LEFT JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "OUTER APPLY (",
        "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "  FROM pm.PMTasks tt",
        "  WHERE tt.FacilityId = f.FacilityId",
        "    AND tt.TemplateId = s.DefaultTemplateId",
        "    AND tt.Status = N'completed'",
        "    AND tt.CompletedAt IS NOT NULL",
        ") h",
        "WHERE f.IsActive = 1",
        "  AND (@locationId IS NULL OR f.LocationId = @locationId)",
        "  AND (@pmEnabled IS NULL OR ISNULL(s.PMEnabled, 0) = @pmEnabled)",
        "  AND (",
        "    @search IS NULL",
        "    OR f.Name LIKE @search",
        "    OR f.Description LIKE @search",
        "  )",
        "ORDER BY f.UpdatedAt DESC",
        "OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    page,
    pageSize,
    items: rows.map((row) => ({
      id: row.FacilityId,
      name: row.Name,
      description: row.Description ?? null,
      isActive: row.IsActive === true || row.IsActive === 1,
      location: row.LocationId
        ? { id: row.LocationId, name: row.LocationName ?? null }
        : { id: null, name: null },
      pm: {
        enabled: row.PMEnabled ?? null,
        defaultTemplateId: row.DefaultTemplateId ?? null,
        lastCompletedAt: row.LastPMCompletedAt ?? null,
        nextDueAt: row.NextPMDueAt ?? null,
      },
    })),
  });
});

facilitiesRouter.post("/", requireManager, async (req, res) => {
  const parsed = FacilityCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const result = await db
    .request()
    .input("name", sql.NVarChar(256), parsed.data.name)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("description", sql.NVarChar(1024), parsed.data.description ?? null)
    .input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0)
    .query(
      [
        "INSERT INTO pm.Facilities (",
        "  Name, LocationId, Description, IsActive",
        ")",
        "OUTPUT inserted.FacilityId AS FacilityId",
        "VALUES (",
        "  @name, @locationId, @description, @isActive",
        ")",
      ].join("\n"),
    );

  const row = result.recordset[0] as { FacilityId?: string } | undefined;
  const id = row?.FacilityId;
  if (!id) {
    res.status(500).json({ message: "Failed to create facility" });
    return;
  }

  res.status(201).json({ id });
});

facilitiesRouter.get("/:facilityId", async (req, res) => {
  const facilityId = req.params.facilityId;
  if (!z.string().uuid().safeParse(facilityId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const result = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .query(
      [
        "SELECT TOP (1)",
        "  f.FacilityId AS FacilityId,",
        "  f.Name AS Name,",
        "  f.LocationId AS LocationId,",
        "  l.Name AS LocationName,",
        "  f.Description AS Description,",
        "  f.IsActive AS IsActive,",
        "  s.PMEnabled AS PMEnabled,",
        "  s.DefaultTemplateId AS DefaultTemplateId,",
        "  COALESCE(h.LastCompletedAt, s.LastPMCompletedAt) AS LastPMCompletedAt,",
        "  s.NextPMDueAt AS NextPMDueAt",
        "FROM pm.Facilities f",
        "LEFT JOIN pm.Locations l ON l.LocationId = f.LocationId",
        "LEFT JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "OUTER APPLY (",
        "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "  FROM pm.PMTasks tt",
        "  WHERE tt.FacilityId = f.FacilityId",
        "    AND tt.Status = N'completed'",
        "    AND tt.CompletedAt IS NOT NULL",
        ") h",
        "WHERE f.FacilityId = @facilityId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({
    id: row.FacilityId,
    name: row.Name,
    description: row.Description ?? null,
    isActive: row.IsActive === true || row.IsActive === 1,
    location: row.LocationId ? { id: row.LocationId, name: row.LocationName ?? null } : null,
    pm: {
      enabled: row.PMEnabled ?? null,
      defaultTemplateId: row.DefaultTemplateId ?? null,
      lastCompletedAt: row.LastPMCompletedAt ?? null,
      nextDueAt: row.NextPMDueAt ?? null,
    },
  });
});

facilitiesRouter.put("/:facilityId", requireManager, async (req, res) => {
  const facilityId = req.params.facilityId;
  if (!z.string().uuid().safeParse(facilityId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = FacilityUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const request = db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .input("name", sql.NVarChar(256), parsed.data.name ?? null)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("description", sql.NVarChar(1024), parsed.data.description ?? null)
    .input("hasName", sql.Bit, parsed.data.name !== undefined ? 1 : 0)
    .input("hasLocation", sql.Bit, parsed.data.locationId !== undefined ? 1 : 0)
    .input("hasDescription", sql.Bit, parsed.data.description !== undefined ? 1 : 0);

  if (parsed.data.isActive !== undefined) {
    request.input("isActive", sql.Bit, parsed.data.isActive ? 1 : 0);
    request.input("hasIsActive", sql.Bit, 1);
  } else {
    request.input("isActive", sql.Bit, 0);
    request.input("hasIsActive", sql.Bit, 0);
  }

  const result = await request.query(
    [
      "UPDATE pm.Facilities",
      "SET",
      "  Name = CASE WHEN @hasName = 1 THEN @name ELSE Name END,",
      "  LocationId = CASE WHEN @hasLocation = 1 THEN @locationId ELSE LocationId END,",
      "  Description = CASE WHEN @hasDescription = 1 THEN @description ELSE Description END,",
      "  IsActive = CASE WHEN @hasIsActive = 1 THEN @isActive ELSE IsActive END,",
      "  UpdatedAt = sysutcdatetime()",
      "WHERE FacilityId = @facilityId",
    ].join("\n"),
  );

  if (result.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});

facilitiesRouter.put("/:facilityId/pm-settings", requireManager, async (req, res) => {
  const facilityId = req.params.facilityId;
  if (!z.string().uuid().safeParse(facilityId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = FacilityPmSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const pmEnabledValue = parsed.data.pmEnabled;
  const pmEnabledBit = pmEnabledValue === undefined ? null : pmEnabledValue ? 1 : 0;

  const db = await getDb();
  const result = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .input("pmEnabled", sql.Bit, pmEnabledBit)
    .input("defaultTemplateId", sql.UniqueIdentifier, parsed.data.defaultTemplateId ?? null)
    .input("nextPmDueAt", sql.DateTime2(0), parsed.data.nextPmDueAt ?? null)
    .query(
      [
        "MERGE pm.FacilityPMSettings WITH (HOLDLOCK) AS target",
        "USING (SELECT @facilityId AS FacilityId) AS source",
        "ON target.FacilityId = source.FacilityId",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    PMEnabled = COALESCE(@pmEnabled, PMEnabled),",
        "    DefaultTemplateId = @defaultTemplateId,",
        "    NextPMDueAt = @nextPmDueAt,",
        "    UpdatedAt = sysutcdatetime()",
        "WHEN NOT MATCHED THEN",
        "  INSERT (FacilityId, PMEnabled, DefaultTemplateId, NextPMDueAt)",
        "  VALUES (@facilityId, COALESCE(@pmEnabled, 1), @defaultTemplateId, @nextPmDueAt);",
      ].join("\n"),
    );

  if (result.rowsAffected.length === 0) {
    res.status(500).json({ message: "Failed to update PM settings" });
    return;
  }

  res.json({ ok: true });
});

facilitiesRouter.post("/:facilityId/pm-now", requireManager, async (req, res) => {
  const facilityId = req.params.facilityId;
  if (!z.string().uuid().safeParse(facilityId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const facilityResult = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .query(
      [
        "SELECT TOP (1)",
        "  f.FacilityId AS FacilityId,",
        "  f.LocationId AS LocationId,",
        "  f.IsActive AS IsActive,",
        "  s.PMEnabled AS PMEnabled,",
        "  s.DefaultTemplateId AS DefaultTemplateId,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.IsActive AS TemplateIsActive",
        "FROM pm.Facilities f",
        "LEFT JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "LEFT JOIN pm.PMTemplates tpl ON tpl.TemplateId = s.DefaultTemplateId",
        "WHERE f.FacilityId = @facilityId",
      ].join("\n"),
    );

  const facilityRow = facilityResult.recordset[0] as Record<string, unknown> | undefined;
  if (!facilityRow) {
    res.status(404).json({ message: "Facility not found" });
    return;
  }

  const facilityIsActiveValue = facilityRow.IsActive;
  const facilityIsActive =
    typeof facilityIsActiveValue === "boolean"
      ? facilityIsActiveValue
      : typeof facilityIsActiveValue === "number"
        ? facilityIsActiveValue === 1
        : false;
  if (!facilityIsActive) {
    res.status(400).json({ message: "Facility is inactive" });
    return;
  }

  const pmEnabledValue = facilityRow.PMEnabled;
  const pmEnabled =
    typeof pmEnabledValue === "boolean"
      ? pmEnabledValue
      : typeof pmEnabledValue === "number"
        ? pmEnabledValue === 1
        : false;
  if (!pmEnabled) {
    res.status(400).json({ message: "PM is not enabled for this facility" });
    return;
  }

  const templateIdValue = facilityRow.DefaultTemplateId ?? facilityRow.TemplateId;
  const templateId = typeof templateIdValue === "string" ? templateIdValue : null;
  const templateIsActiveValue = facilityRow.TemplateIsActive;
  const templateIsActive =
    typeof templateIsActiveValue === "boolean"
      ? templateIsActiveValue
      : typeof templateIsActiveValue === "number"
        ? templateIsActiveValue === 1
        : false;

  if (!templateId || !templateIsActive) {
    res
      .status(400)
      .json({ message: "PM template is not configured or inactive for this facility" });
    return;
  }

  const locationIdValue = facilityRow.LocationId;

  const assignmentResult = await db
    .request()
    .input(
      "categoryId",
      sql.UniqueIdentifier,
      null,
    )
    .input(
      "locationId",
      sql.UniqueIdentifier,
      typeof locationIdValue === "string" ? locationIdValue : null,
    )
    .input("assetStatus", sql.NVarChar(64), null)
    .query(
      [
        "SELECT TOP (1)",
        "  AssignToUserId,",
        "  AssignToRoleId",
        "FROM pm.AssignmentRules",
        "WHERE",
        "  IsActive = 1",
        "  AND (CategoryId IS NULL OR CategoryId = @categoryId)",
        "  AND (LocationId IS NULL OR LocationId = @locationId)",
        "  AND (AssetStatus IS NULL OR AssetStatus = @assetStatus)",
        "  AND (EffectiveFrom IS NULL OR EffectiveFrom <= sysutcdatetime())",
        "  AND (EffectiveTo IS NULL OR EffectiveTo >= sysutcdatetime())",
        "ORDER BY Priority ASC, UpdatedAt DESC",
      ].join("\n"),
    );

  const assignmentRow = assignmentResult.recordset[0] as Record<string, unknown> | undefined;
  const assignToUserIdValue = assignmentRow?.AssignToUserId ?? null;
  const assignToRoleIdValue = assignmentRow?.AssignToRoleId ?? null;

  const insertResult = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .input("templateId", sql.UniqueIdentifier, templateId)
    .input(
      "assignedToUserId",
      sql.UniqueIdentifier,
      typeof assignToUserIdValue === "string" ? assignToUserIdValue : null,
    )
    .input(
      "assignedToRoleId",
      sql.UniqueIdentifier,
      typeof assignToRoleIdValue === "string" ? assignToRoleIdValue : null,
    )
    .query(
      [
        "DECLARE @now datetime2(0) = sysutcdatetime();",
        "DECLARE @taskNumber nvarchar(32) = CONCAT(",
        "  N'PM-FAC-',",
        "  FORMAT(@now, 'yyyyMMdd'),",
        "  N'-',",
        "  RIGHT(CONVERT(varchar(36), NEWID()), 8)",
        ");",
        "INSERT INTO pm.PMTasks (",
        "  TaskNumber, AssetId, FacilityId, TemplateId, ScheduledDueAt, AssignedToUserId, AssignedToRoleId, Status",
        ")",
        "OUTPUT inserted.TaskId AS TaskId",
        "VALUES (",
        "  @taskNumber, NULL, @facilityId, @templateId, @now, @assignedToUserId, @assignedToRoleId, N'open'",
        ");",
      ].join("\n"),
    );

  const insertedRow = insertResult.recordset[0] as Record<string, unknown> | undefined;
  const taskId = typeof insertedRow?.TaskId === "string" ? insertedRow.TaskId : null;
  if (!taskId) {
    res.status(500).json({ message: "Failed to create facility PM Now task" });
    return;
  }

  res.status(201).json({ id: taskId });
});
