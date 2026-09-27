import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { writeAuditLog } from "../db/auditLog.js";
import { resolvePmAssignment } from "../db/pmAssignment.js";
import { getDb } from "../db/mssql.js";
import {
  advancePmOccurrenceAnchor,
  applyPmBlackout,
  createPmTaskForOccurrence,
  findReusablePmTask,
  isProtectedPmOccurrenceTask,
  loadFacilityPmScheduleContext,
  recordPmSkippedOccurrence,
  reconcilePmScheduleContext,
} from "../db/pmSchedulingPolicy.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole, requireManager } from "../middleware/requireRole.js";

const requireFacilityAdmin = requireAnyRole(["Admin", "Superadmin"]);

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

const FacilityCloneSchema = z
  .object({
    name: z.string().trim().max(256).optional(),
    includePmSettings: z.boolean().optional().default(true),
  })
  .optional();

const FacilityPmSettingsSchema = z
  .object({
    pmEnabled: z.boolean().optional(),
    defaultTemplateId: z.string().uuid().nullable().optional(),
    nextPmDueAt: z.string().datetime().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: "No updates" });

const SkipNextPmSchema = z.object({
  plannedDueAt: z.string().datetime(),
  reason: z.string().trim().min(1).max(1024),
});

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
        "  COALESCE(s.NextPlannedPMDueAt, s.NextPMDueAt) AS NextPlannedPMDueAt,",
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
        nextPlannedDueAt: row.NextPlannedPMDueAt ?? null,
        nextDueAt: row.NextPMDueAt ?? null,
      },
    })),
  });
});

facilitiesRouter.post("/", requireFacilityAdmin, async (req, res) => {
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
        "  COALESCE(s.NextPlannedPMDueAt, s.NextPMDueAt) AS NextPlannedPMDueAt,",
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
      nextPlannedDueAt: row.NextPlannedPMDueAt ?? null,
      nextDueAt: row.NextPMDueAt ?? null,
    },
  });
});

facilitiesRouter.put("/:facilityId", requireFacilityAdmin, async (req, res) => {
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
  const nextPlannedDueAt = parsed.data.nextPmDueAt ? new Date(parsed.data.nextPmDueAt) : null;
  const nextDueAt = nextPlannedDueAt
    ? await applyPmBlackout({
        executor: db,
        plannedDueAt: nextPlannedDueAt,
      })
    : null;
  const resetDueDates = parsed.data.defaultTemplateId !== undefined && parsed.data.nextPmDueAt === undefined;
  const result = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .input("pmEnabled", sql.Bit, pmEnabledBit)
    .input("defaultTemplateId", sql.UniqueIdentifier, parsed.data.defaultTemplateId ?? null)
    .input("nextPlannedPmDueAt", sql.DateTime2(0), resetDueDates ? null : nextPlannedDueAt)
    .input("nextPmDueAt", sql.DateTime2(0), resetDueDates ? null : nextDueAt)
    .query(
      [
        "MERGE pm.FacilityPMSettings WITH (HOLDLOCK) AS target",
        "USING (SELECT @facilityId AS FacilityId) AS source",
        "ON target.FacilityId = source.FacilityId",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    PMEnabled = COALESCE(@pmEnabled, PMEnabled),",
        "    DefaultTemplateId = @defaultTemplateId,",
        "    NextPlannedPMDueAt = @nextPlannedPmDueAt,",
        "    NextPMDueAt = @nextPmDueAt,",
        "    UpdatedAt = sysutcdatetime()",
        "WHEN NOT MATCHED THEN",
        "  INSERT (FacilityId, PMEnabled, DefaultTemplateId, NextPlannedPMDueAt, NextPMDueAt)",
        "  VALUES (@facilityId, COALESCE(@pmEnabled, 1), @defaultTemplateId, @nextPlannedPmDueAt, @nextPmDueAt);",
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
  const context = await loadFacilityPmScheduleContext({
    executor: db,
    facilityId,
  });
  if (!context) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const occurrence = await reconcilePmScheduleContext({
    executor: db,
    context,
  });
  if (!occurrence) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const reusableTask = await findReusablePmTask({
    executor: db,
    context,
    currentPlannedDueAt: occurrence.plannedDueAt,
  });
  if (reusableTask) {
    res.status(200).json({ id: reusableTask.taskId, reused: true });
    return;
  }

  const assignment = await resolvePmAssignment({
    executor: db,
    templateId,
    categoryId: null,
    locationId: context.locationId,
    assetStatus: null,
    requiredRoleId: context.requiredRoleId,
  });
  const taskId = await createPmTaskForOccurrence({
    executor: db,
    context,
    occurrence,
    assignedToUserId: assignment.assignToUserId,
    assignedToRoleId: assignment.assignToRoleId,
  });
  if (!taskId) {
    res.status(500).json({ message: "Failed to create facility PM Now task" });
    return;
  }

  res.status(201).json({ id: taskId, reused: false });
});

facilitiesRouter.post(
  "/:facilityId/skip-next-pm",
  requireAnyRole(["Supervisor", "Admin", "Superadmin"]),
  async (req, res) => {
    const facilityId = req.params.facilityId;
    if (!z.string().uuid().safeParse(facilityId).success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }

    const parsed = SkipNextPmSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }

    const requestedPlannedDueAt = new Date(parsed.data.plannedDueAt);
    const db = await getDb();
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      const context = await loadFacilityPmScheduleContext({
        executor: tx,
        facilityId,
      });
      if (!context) {
        res.status(404).json({ message: "Not found" });
        await tx.rollback();
        return;
      }

      const occurrence = await reconcilePmScheduleContext({
        executor: tx,
        context,
      });
      if (!occurrence) {
        res.status(400).json({ message: "Invalid state" });
        await tx.rollback();
        return;
      }

      if (occurrence.plannedDueAt.getTime() !== requestedPlannedDueAt.getTime()) {
        res.status(409).json({ message: "Occurrence changed" });
        await tx.rollback();
        return;
      }

      if (occurrence.task && isProtectedPmOccurrenceTask(occurrence.task)) {
        res.status(409).json({ message: "Invalid state" });
        await tx.rollback();
        return;
      }

      if (occurrence.task && occurrence.task.cancelledAt === null && occurrence.task.completedAt === null) {
        await tx
          .request()
          .input("taskId", sql.UniqueIdentifier, occurrence.task.taskId)
          .input("userId", sql.UniqueIdentifier, req.user.sub)
          .input("reason", sql.NVarChar(1024), parsed.data.reason)
          .query(
            [
              "UPDATE pm.PMTasks",
              "SET",
              "  Status = N'cancelled',",
              "  CancelledAt = sysutcdatetime(),",
              "  CancelledByUserId = @userId,",
              "  CancelledReason = @reason",
              "WHERE TaskId = @taskId",
              "  AND CompletedAt IS NULL",
              "  AND CancelledAt IS NULL",
            ].join("\n"),
          );
      }

      await recordPmSkippedOccurrence({
        executor: tx,
        context,
        plannedDueAt: occurrence.plannedDueAt,
        effectiveDueAt: occurrence.scheduledDueAt,
        taskId: occurrence.task?.taskId ?? null,
        skippedByUserId: req.user.sub,
        skipReason: parsed.data.reason,
      });
      await advancePmOccurrenceAnchor({
        executor: tx,
        context,
        fulfilledPlannedDueAt: occurrence.plannedDueAt,
      });

      await writeAuditLog({
        executor: tx,
        actorUserId: req.user.sub,
        action: "pm.skip-next",
        entityType: "facility",
        entityId: facilityId,
        metadata: {
          templateId: context.templateId,
          plannedDueAt: occurrence.plannedDueAt.toISOString(),
          taskId: occurrence.task?.taskId ?? null,
          reason: parsed.data.reason,
        },
        ipAddress: typeof req.ip === "string" ? req.ip : null,
        userAgent: req.get("user-agent") ?? null,
      });

      await tx.commit();
      res.json({ ok: true });
    } catch (err) {
      await tx.rollback().catch(() => undefined);
      throw err;
    }
  },
);

facilitiesRouter.post("/:facilityId/clone", requireFacilityAdmin, async (req, res) => {
  const facilityId = req.params.facilityId;
  if (!z.string().uuid().safeParse(facilityId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = FacilityCloneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const sourceResult = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .query(
      [
        "SELECT TOP (1)",
        "  f.Name AS Name,",
        "  f.LocationId AS LocationId,",
        "  f.Description AS Description,",
        "  f.IsActive AS IsActive",
        "FROM pm.Facilities f",
        "WHERE f.FacilityId = @facilityId",
      ].join("\n"),
    );

  const sourceRow = sourceResult.recordset[0] as Record<string, unknown> | undefined;
  if (!sourceRow) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const sourceName = typeof sourceRow.Name === "string" ? sourceRow.Name : "Facility";
  const locationId = typeof sourceRow.LocationId === "string" ? sourceRow.LocationId : null;
  const description = typeof sourceRow.Description === "string" ? sourceRow.Description : null;
  const isActiveValue = sourceRow.IsActive;
  const isActive = typeof isActiveValue === "boolean" ? isActiveValue : typeof isActiveValue === "number" ? isActiveValue === 1 : true;

  let targetName = parsed.data?.name?.trim();
  if (!targetName) {
    let base = `${sourceName} (Copy)`;
    let suffix = 1;
    // ensure unique name
    while (true) {
      const candidate = suffix === 1 ? base : `${sourceName} (Copy ${suffix})`;
      const existsResult = await db
        .request()
        .input("name", sql.NVarChar(256), candidate)
        .query(
          [
            "SELECT TOP (1) 1 AS One",
            "FROM pm.Facilities",
            "WHERE Name = @name",
          ].join("\n"),
        );
      const exists = Boolean(existsResult.recordset[0]);
      if (!exists) {
        targetName = candidate;
        break;
      }
      suffix++;
      if (suffix > 50) {
        targetName = `${sourceName} (Copy ${Date.now()})`;
        break;
      }
    }
  }

  const insertResult = await db
    .request()
    .input("name", sql.NVarChar(256), targetName)
    .input("locationId", sql.UniqueIdentifier, locationId)
    .input("description", sql.NVarChar(1024), description)
    .input("isActive", sql.Bit, isActive ? 1 : 0)
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

  const insertedRow = insertResult.recordset[0] as { FacilityId?: string } | undefined;
  const newFacilityId = insertedRow?.FacilityId;
  if (!newFacilityId) {
    res.status(500).json({ message: "Failed to create facility" });
    return;
  }

  const includePm = parsed.data?.includePmSettings ?? true;
  if (includePm) {
    const pmResult = await db
      .request()
      .input("facilityId", sql.UniqueIdentifier, facilityId)
      .query(
        [
          "SELECT TOP (1)",
          "  PMEnabled,",
          "  DefaultTemplateId",
          "FROM pm.FacilityPMSettings",
          "WHERE FacilityId = @facilityId",
        ].join("\n"),
      );
    const pmRow = pmResult.recordset[0] as Record<string, unknown> | undefined;
    const pmEnabledValue = pmRow?.PMEnabled;
    const pmEnabled = typeof pmEnabledValue === "boolean" ? pmEnabledValue : typeof pmEnabledValue === "number" ? pmEnabledValue === 1 : false;
    const defaultTemplateIdValue = pmRow?.DefaultTemplateId;
    const defaultTemplateId = typeof defaultTemplateIdValue === "string" ? defaultTemplateIdValue : null;

    await db
      .request()
      .input("facilityId", sql.UniqueIdentifier, newFacilityId)
      .input("pmEnabled", sql.Bit, pmEnabled ? 1 : 0)
      .input("defaultTemplateId", sql.UniqueIdentifier, defaultTemplateId)
      .query(
        [
          "INSERT INTO pm.FacilityPMSettings (",
          "  FacilityId, PMEnabled, DefaultTemplateId, LastPMCompletedAt, NextPMDueAt",
          ")",
          "VALUES (",
          "  @facilityId, @pmEnabled, @defaultTemplateId, NULL, NULL",
          ")",
        ].join("\n"),
      );
  }

  res.status(201).json({ id: newFacilityId });
});
