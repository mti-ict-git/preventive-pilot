import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { env } from "../config/env.js";
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

const PM_NOW_IDEMPOTENCY_WINDOW_SETTING_KEY = "pm.now.idempotencyWindowMinutes";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null;
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

const parsePmNowIdempotencyWindowMinutes = (valueJson: string | null): number | null => {
  if (!valueJson || !valueJson.trim()) return null;
  try {
    const parsed: unknown = JSON.parse(valueJson);
    const validated = z.number().int().min(1).max(1440).safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch {
    return null;
  }
};

const loadPmNowIdempotencyWindowMinutes = async (): Promise<number> => {
  try {
    const db = await getDb();
    const result = await db
      .request()
      .input("settingKey", sql.NVarChar(128), PM_NOW_IDEMPOTENCY_WINDOW_SETTING_KEY)
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
    return parsePmNowIdempotencyWindowMinutes(valueJson) ?? env.PM_NOW_IDEMPOTENCY_WINDOW_MINUTES;
  } catch (err: unknown) {
    if (isInvalidObjectNameError(err)) {
      return env.PM_NOW_IDEMPOTENCY_WINDOW_MINUTES;
    }
    throw err;
  }
};

export const facilitiesRouter = Router();

facilitiesRouter.use(requireAuth);

facilitiesRouter.get("/", async (req, res) => {
  const parsed = FacilityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(parsed.data.pageSize) || 50));
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
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "facilityId",
          issue: "Invalid UUID",
        },
      ],
    });
    return;
  }

  const parsed = FacilityPmSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [],
    });
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
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "facilityId",
          issue: "Invalid UUID",
        },
      ],
    });
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
        "  tpl.IsActive AS TemplateIsActive,",
        "  tpl.RequiredRoleId AS RequiredRoleId",
        "FROM pm.Facilities f",
        "LEFT JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "LEFT JOIN pm.PMTemplates tpl ON tpl.TemplateId = s.DefaultTemplateId",
        "WHERE f.FacilityId = @facilityId",
      ].join("\n"),
    );

  const facilityRow = facilityResult.recordset[0] as Record<string, unknown> | undefined;
  if (!facilityRow) {
    res.status(404).json({
      message: "Not found",
      code: "NOT_FOUND",
      details: [
        {
          field: "facilityId",
          issue: "Facility not found",
        },
      ],
    });
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
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "facilityId",
          issue: "Facility is inactive",
        },
      ],
    });
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
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "facilityId",
          issue: "PM is not enabled for this facility",
        },
      ],
    });
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
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [
        {
          field: "facilityId",
          issue: "PM template is not configured or inactive for this facility",
        },
      ],
    });
    return;
  }

  const idempotencyWindowMinutes = await loadPmNowIdempotencyWindowMinutes();
  const existingResult = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .input("templateId", sql.UniqueIdentifier, templateId)
    .input("windowMinutes", sql.Int, idempotencyWindowMinutes)
    .query(
      [
        "DECLARE @now datetime2(0) = sysutcdatetime();",
        "SELECT TOP (1)",
        "  TaskId",
        "FROM pm.PMTasks",
        "WHERE FacilityId = @facilityId",
        "  AND TemplateId = @templateId",
        "  AND MaintenanceType = N'PM'",
        "  AND CompletedAt IS NULL",
        "  AND CancelledAt IS NULL",
        "  AND ScheduledDueAt >= dateadd(minute, -@windowMinutes, @now)",
        "  AND ScheduledDueAt <= @now",
        "ORDER BY ScheduledDueAt DESC",
      ].join("\n"),
    );
  const existingRow = existingResult.recordset[0] as Record<string, unknown> | undefined;
  const existingTaskId = typeof existingRow?.TaskId === "string" ? existingRow.TaskId : null;
  if (existingTaskId) {
    res.status(409).json({
      message: "PM Now already created recently",
      code: "PM_NOW_DUPLICATE",
      details: [
        {
          field: "facilityId",
          issue: "PM Now already created recently",
        },
      ],
      id: existingTaskId,
    });
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

  let assignedToUserId: string | null =
    typeof assignToUserIdValue === "string" ? assignToUserIdValue : null;
  let assignedToRoleId: string | null =
    typeof assignToRoleIdValue === "string" ? assignToRoleIdValue : null;

  if (!assignedToUserId && !assignedToRoleId) {
    const requiredRoleIdValue = (facilityRow as Record<string, unknown>).RequiredRoleId;
    const requiredRoleId =
      typeof requiredRoleIdValue === "string" ? requiredRoleIdValue : null;
    assignedToRoleId = requiredRoleId;
  }

  const insertResult = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .input("templateId", sql.UniqueIdentifier, templateId)
    .input("assignedToUserId", sql.UniqueIdentifier, assignedToUserId)
    .input("assignedToRoleId", sql.UniqueIdentifier, assignedToRoleId)
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
