import { hasTaskDeletionReferences, deleteTaskOwnedRows } from "../db/taskDeletionPolicy.js";
import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { writeAuditLog } from "../db/auditLog.js";
import { canModifyAssignedTask, isManagerUser, managerRoles } from "../db/taskOwnership.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole, requireSuperadmin } from "../middleware/requireRole.js";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env.js";

const requireManager = requireAnyRole(managerRoles);

type TaskAccessRow = {
  AssignedToUserId: string | null;
  AssignedToRoleName: string | null;
};

const resolveStoredFileAbs = (storageRootAbs: string, storagePath: string): string | null => {
  const root = path.resolve(storageRootAbs);
  const resolved = path.resolve(root, storagePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) return null;
  return resolved;
};

const WorkOrderCreateSchema = z
  .object({
    assetId: z.string().uuid().optional(),
    facilityId: z.string().uuid().optional(),
    templateId: z.string().uuid().optional(),
    symptom: z.string().min(1),
    impactLevel: z.enum(["normal", "high", "critical"]).optional(),
    failureCategory: z.string().max(64).optional(),
    failureCode: z.string().max(64).optional(),
    downtimeStartedAt: z.string().datetime().optional(),
    reportedChannel: z.string().max(32).optional(),
    sourceTaskId: z.string().uuid().optional(),
    sourceTemplateChecklistItemId: z.string().uuid().optional(),
  })
  .superRefine((d, ctx) => {
    if (Boolean(d.assetId) === Boolean(d.facilityId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Either assetId or facilityId is required",
        path: ["assetId"],
      });
    }
    if (Boolean(d.sourceTaskId) !== Boolean(d.sourceTemplateChecklistItemId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Source task and finding item must be provided together",
        path: ["sourceTaskId"],
      });
    }
  });

const WorkOrderListQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  status: z.string().optional(),
  assetId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  impactLevel: z.string().max(32).optional(),
  categoryId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  reportedFrom: z.string().datetime().optional(),
  reportedTo: z.string().datetime().optional(),
  completedFrom: z.string().datetime().optional(),
  completedTo: z.string().datetime().optional(),
  assigned: z.enum(["any", "unassigned", "me"]).optional().default("any"),
});

const WorkOrderAssignSchema = z
  .object({
    assignedToUserId: z.string().uuid().nullable().optional(),
    assignedToRoleId: z.string().uuid().nullable().optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine((d) => (d.assignedToUserId ?? d.assignedToRoleId ?? null) !== null, {
    message: "assignedToUserId or assignedToRoleId is required",
    path: ["assignedToUserId"],
  });

const WorkOrderUpdateImpactSchema = z.object({
  impactLevel: z.enum(["normal", "high", "critical"]),
});

const WorkOrderReturnForCorrectionSchema = z.object({
  reason: z.string().trim().min(1).max(1024),
});

const WorkOrderRestorationSchema = z.object({
  restoredAt: z.string().datetime().optional(),
  reason: z.string().trim().max(1024).optional(),
});

const WorkOrderReopenDowntimeSchema = z.object({
  downtimeStartedAt: z.string().datetime().optional(),
  reason: z.string().trim().max(1024).optional(),
});

const WorkOrderRepeatFaultSchema = z.object({
  downtimeStartedAt: z.string().datetime().optional(),
  reportedChannel: z.string().trim().max(32).optional(),
  reason: z.string().trim().max(1024).optional(),
});

type CmAccessRow = {
  TaskId: string;
  Status: string;
  AssignedToUserId: string | null;
  AssignedToRoleName: string | null;
  TechnicianCompletedByUserId: string | null;
  MaintenanceType: string;
};

const loadCmAccessRow = async (
  executor: { request(): sql.Request },
  taskId: string,
): Promise<CmAccessRow | null> => {
  const result = await executor
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TaskId AS TaskId,",
        "  t.Status AS Status,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName,",
        "  t.TechnicianCompletedByUserId AS TechnicianCompletedByUserId,",
        "  t.MaintenanceType AS MaintenanceType",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    TaskId: String(row.TaskId),
    Status: typeof row.Status === "string" ? row.Status : "open",
    AssignedToUserId: typeof row.AssignedToUserId === "string" ? row.AssignedToUserId : null,
    AssignedToRoleName: typeof row.AssignedToRoleName === "string" ? row.AssignedToRoleName : null,
    TechnicianCompletedByUserId:
      typeof row.TechnicianCompletedByUserId === "string" ? row.TechnicianCompletedByUserId : null,
    MaintenanceType: typeof row.MaintenanceType === "string" ? row.MaintenanceType : "",
  };
};

const isTerminalCmStatus = (status: string | null | undefined): boolean =>
  status === "completed" || status === "cancelled";

const appendCmEvent = async (input: {
  executor: { request(): sql.Request };
  taskId: string;
  eventType: "reported" | "repair_submitted" | "returned_for_correction" | "verified_closed" | "restoration_recorded" | "downtime_reopened" | "repeat_fault_linked";
  occurredAt: Date;
  actorUserId: string | null;
  reason?: string | null;
  notes?: string | null;
  metadataJson?: string | null;
}) => {
  await input.executor
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .input("eventType", sql.NVarChar(32), input.eventType)
    .input("occurredAt", sql.DateTime2(0), input.occurredAt)
    .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
    .input("reason", sql.NVarChar(1024), input.reason ?? null)
    .input("notes", sql.NVarChar(2048), input.notes ?? null)
    .input("metadataJson", sql.NVarChar(sql.MAX), input.metadataJson ?? null)
    .query(
      [
        "INSERT INTO pm.CMTaskEvents (",
        "  TaskId, EventType, OccurredAt, ActorUserId, Reason, Notes, MetadataJson",
        ") VALUES (",
        "  @taskId, @eventType, @occurredAt, @actorUserId, @reason, @notes, @metadataJson",
        ");",
      ].join("\n"),
    );
};

export const workOrdersRouter = Router();
workOrdersRouter.use(requireAuth);

workOrdersRouter.post("/", async (req, res) => {
  const parsed = WorkOrderCreateSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();

  const assetId = parsed.data.assetId ?? null;
  const facilityId = parsed.data.facilityId ?? null;
  let templateId = parsed.data.templateId ?? null;

  if (!templateId) {
    if (assetId) {
      const assetResult = await db
        .request()
        .input("assetId", sql.UniqueIdentifier, assetId)
        .query(
          [
            "SELECT TOP (1)",
            "  s.DefaultTemplateId AS DefaultTemplateId",
            "FROM pm.AssetPMSettings s",
            "INNER JOIN pm.Assets a ON a.AssetId = s.AssetId",
            "WHERE s.AssetId = @assetId AND a.IsArchived = 0",
          ].join("\n"),
        );
      const row = assetResult.recordset[0] as Record<string, unknown> | undefined;
      const tid = typeof row?.DefaultTemplateId === "string" ? row?.DefaultTemplateId : null;
      if (!tid) {
        res.status(400).json({ message: "Asset has no default template" });
        return;
      }
      templateId = tid;
    } else if (facilityId) {
      const facResult = await db
        .request()
        .input("facilityId", sql.UniqueIdentifier, facilityId)
        .query(
          [
            "SELECT TOP (1)",
            "  s.DefaultTemplateId AS DefaultTemplateId",
            "FROM pm.FacilityPMSettings s",
            "INNER JOIN pm.Facilities f ON f.FacilityId = s.FacilityId",
            "WHERE s.FacilityId = @facilityId AND f.IsActive = 1",
          ].join("\n"),
        );
      const row = facResult.recordset[0] as Record<string, unknown> | undefined;
      const tid = typeof row?.DefaultTemplateId === "string" ? row?.DefaultTemplateId : null;
      if (!tid) {
        res.status(400).json({ message: "Facility has no default template" });
        return;
      }
      templateId = tid;
    }
  }

  const tplResult = await db
    .request()
    .input("templateId", sql.UniqueIdentifier, templateId)
    .query(
      [
        "SELECT TOP (1)",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.IsActive AS IsActive",
        "FROM pm.PMTemplates tpl",
        "WHERE tpl.TemplateId = @templateId",
      ].join("\n"),
    );
  const tplRow = tplResult.recordset[0] as Record<string, unknown> | undefined;
  const templateIsActive = tplRow ? (tplRow.IsActive === true || tplRow.IsActive === 1) : false;
  if (!tplRow || !templateIsActive) {
    res.status(400).json({ message: "Invalid template" });
    return;
  }

  const downtimeStartedAt = parsed.data.downtimeStartedAt ?? null;
  const impactLevel = parsed.data.impactLevel ?? null;
  const failureCategory = parsed.data.failureCategory ?? null;
  const failureCode = parsed.data.failureCode ?? null;
  const reportedChannel = parsed.data.reportedChannel ?? "web";
  const sourceTaskId = parsed.data.sourceTaskId ?? null;
  const sourceTemplateChecklistItemId = parsed.data.sourceTemplateChecklistItemId ?? null;

  if (sourceTaskId && sourceTemplateChecklistItemId) {
    const sourceFindingResult = await db
      .request()
      .input("sourceTaskId", sql.UniqueIdentifier, sourceTaskId)
      .input("sourceTemplateChecklistItemId", sql.UniqueIdentifier, sourceTemplateChecklistItemId)
      .input("userId", sql.UniqueIdentifier, req.user.sub)
      .query(
        [
          "SELECT TOP (1)",
          "  t.AssetId AS SourceAssetId,",
          "  t.FacilityId AS SourceFacilityId,",
          "  t.TemplateId AS SourceTemplateId,",
          "  COALESCE(s.ItemText, i.ItemText) AS SourceItemText,",
          "  r.Outcome AS ResultOutcome,",
          "  d.Outcome AS DraftOutcome",
          "FROM pm.PMTasks t",
          "LEFT JOIN pm.PMTaskChecklistResults r",
          "  ON r.TaskId = t.TaskId AND r.TemplateChecklistItemId = @sourceTemplateChecklistItemId",
          "LEFT JOIN pm.TaskDrafts d",
          "  ON d.TaskId = t.TaskId",
          " AND d.TemplateChecklistItemId = @sourceTemplateChecklistItemId",
          " AND d.SavedByUserId = @userId",
          "LEFT JOIN pm.PMTaskChecklistSnapshots s",
          "  ON s.TaskId = t.TaskId AND s.TemplateChecklistItemId = @sourceTemplateChecklistItemId",
          "LEFT JOIN pm.PMTemplateChecklistItems i",
          "  ON i.TemplateChecklistItemId = @sourceTemplateChecklistItemId",
          "WHERE t.TaskId = @sourceTaskId",
          "  AND t.MaintenanceType = N'PM'",
        ].join("\n"),
      );

    const sourceRow = sourceFindingResult.recordset[0] as Record<string, unknown> | undefined;
    if (!sourceRow) {
      res.status(400).json({ message: "Invalid source finding" });
      return;
    }

    const sameAsset =
      (sourceRow.SourceAssetId as string | null) === assetId &&
      (sourceRow.SourceFacilityId as string | null) === facilityId;
    if (!sameAsset) {
      res.status(400).json({ message: "Source finding does not match the selected asset or facility" });
      return;
    }

    const resultOutcome = Number(sourceRow.ResultOutcome ?? -1);
    const draftOutcome = Number(sourceRow.DraftOutcome ?? -1);
    if (resultOutcome !== 2 && draftOutcome !== 2) {
      res.status(400).json({ message: "Only failed PM findings can create a work order" });
      return;
    }

    const existingResult = await db
      .request()
      .input("sourceTaskId", sql.UniqueIdentifier, sourceTaskId)
      .input("sourceTemplateChecklistItemId", sql.UniqueIdentifier, sourceTemplateChecklistItemId)
      .query(
        [
          "SELECT TOP (1)",
          "  TaskId AS TaskId",
          "FROM pm.PMTasks",
          "WHERE MaintenanceType = N'CM'",
          "  AND SourceTaskId = @sourceTaskId",
          "  AND SourceTemplateChecklistItemId = @sourceTemplateChecklistItemId",
          "ORDER BY CreatedAt DESC",
        ].join("\n"),
      );
    const existingRow = existingResult.recordset[0] as Record<string, unknown> | undefined;
    if (existingRow && typeof existingRow.TaskId === "string") {
      res.json({ id: existingRow.TaskId, created: false });
      return;
    }
  }

  const insertResult = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, assetId)
    .input("facilityId", sql.UniqueIdentifier, facilityId)
    .input("templateId", sql.UniqueIdentifier, templateId)
    .input("symptom", sql.NVarChar(1024), parsed.data.symptom)
    .input("impactLevel", sql.NVarChar(32), impactLevel)
    .input("failureCategory", sql.NVarChar(64), failureCategory)
    .input("failureCode", sql.NVarChar(64), failureCode)
    .input("downtimeStartedAt", sql.DateTime2(0), downtimeStartedAt)
    .input("reportedByUserId", sql.UniqueIdentifier, req.user.sub)
    .input("reportedChannel", sql.NVarChar(32), reportedChannel)
    .input("sourceTaskId", sql.UniqueIdentifier, sourceTaskId)
    .input("sourceTemplateChecklistItemId", sql.UniqueIdentifier, sourceTemplateChecklistItemId)
    .query(
      [
        "DECLARE @now datetime2(0) = sysutcdatetime();",
        "DECLARE @taskNumber nvarchar(32) = CONCAT(",
        "  N'WO-',",
        "  FORMAT(@now, 'yyyyMMdd'),",
        "  N'-',",
        "  RIGHT(CONVERT(varchar(36), NEWID()), 8)",
        ");",
        "INSERT INTO pm.PMTasks (",
        "  TaskNumber, AssetId, FacilityId, TemplateId, ScheduledDueAt, Status, MaintenanceType,",
        "  Symptom, ImpactLevel, FailureCategory, FailureCode, DowntimeStartedAt,",
        "  ReportedByUserId, ReportedAt, ReportedChannel, SourceTaskId, SourceTemplateChecklistItemId",
        ")",
        "OUTPUT inserted.TaskId AS TaskId",
        "VALUES (",
        "  @taskNumber, @assetId, @facilityId, @templateId, @now, N'open', N'CM',",
        "  @symptom, @impactLevel, @failureCategory, @failureCode, @downtimeStartedAt,",
        "  @reportedByUserId, @now, @reportedChannel, @sourceTaskId, @sourceTemplateChecklistItemId",
        ");",
      ].join("\n"),
    );

  const insertedRow = insertResult.recordset[0] as Record<string, unknown> | undefined;
  const taskId = typeof insertedRow?.TaskId === "string" ? insertedRow.TaskId : null;
  if (!taskId) {
    res.status(500).json({ message: "Failed to create work order" });
    return;
  }

  if (downtimeStartedAt) {
    await db
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("startedAt", sql.DateTime2(0), downtimeStartedAt)
      .input("startedByUserId", sql.UniqueIdentifier, req.user.sub)
      .query(
        [
          "INSERT INTO pm.CMDowntimeIntervals (TaskId, StartedAt, StartedByUserId)",
          "VALUES (@taskId, @startedAt, @startedByUserId);",
        ].join("\n"),
      );
  }

  await appendCmEvent({
    executor: db,
    taskId,
    eventType: "reported",
    occurredAt: new Date(),
    actorUserId: req.user.sub,
    notes: parsed.data.symptom,
    metadataJson:
      sourceTaskId || sourceTemplateChecklistItemId
        ? JSON.stringify({ sourceTaskId, sourceTemplateChecklistItemId })
        : null,
  });

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "work_order.create",
    entityType: "task",
    entityId: taskId,
    metadata: {
      assetId,
      facilityId,
      templateId,
      symptom: parsed.data.symptom,
      impactLevel,
      failureCategory,
      failureCode,
      downtimeStartedAt,
      reportedChannel,
      sourceTaskId,
      sourceTemplateChecklistItemId,
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.status(201).json({ id: taskId, created: true });
});

workOrdersRouter.get("/", async (req, res) => {
  const parsed = WorkOrderListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(parsed.data.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const rolesCsv = req.user.roles.join(",");

  const db = await getDb();
  const result = await db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("status", sql.NVarChar(32), parsed.data.status ?? null)
    .input("assigned", sql.NVarChar(16), parsed.data.assigned)
    .input("assetId", sql.UniqueIdentifier, parsed.data.assetId ?? null)
    .input("facilityId", sql.UniqueIdentifier, parsed.data.facilityId ?? null)
    .input("impactLevel", sql.NVarChar(32), parsed.data.impactLevel ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("reportedFrom", sql.DateTime2(0), parsed.data.reportedFrom ?? null)
    .input("reportedTo", sql.DateTime2(0), parsed.data.reportedTo ?? null)
    .input("completedFrom", sql.DateTime2(0), parsed.data.completedFrom ?? null)
    .input("completedTo", sql.DateTime2(0), parsed.data.completedTo ?? null)
    .input("userId", sql.UniqueIdentifier, req.user.sub)
    .input("rolesCsv", sql.NVarChar(1024), rolesCsv)
    .query(
      [
        "SELECT",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  a.CategoryId AS AssetCategoryId,",
        "  ac.Name AS AssetCategoryName,",
        "  a.LocationId AS AssetLocationId,",
        "  al.Name AS AssetLocationName,",
        "  t.FacilityId AS FacilityId,",
        "  fac.Name AS FacilityName,",
        "  fac.LocationId AS FacilityLocationId,",
        "  fl.Name AS FacilityLocationName,",
        "  tpl.Name AS TemplateName,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  au.Username AS AssignedToUsername,",
        "  au.DisplayName AS AssignedToDisplayName,",
        "  t.AssignedToRoleId AS AssignedToRoleId,",
        "  ar.Name AS AssignedToRoleName,",
        "  t.CreatedAt AS CreatedAt,",
        "  t.StartedAt AS StartedAt,",
        "  t.CompletedAt AS CompletedAt,",
        "  t.Symptom AS Symptom,",
        "  t.ImpactLevel AS ImpactLevel,",
        "  t.FailureCategory AS FailureCategory,",
        "  t.FailureCode AS FailureCode,",
        "  t.ReportedAt AS ReportedAt,",
        "  rby.Username AS ReportedByUsername",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.AssetCategories ac ON ac.CategoryId = a.CategoryId",
        "LEFT JOIN pm.Locations al ON al.LocationId = a.LocationId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "LEFT JOIN pm.Locations fl ON fl.LocationId = fac.LocationId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users au ON au.UserId = t.AssignedToUserId",
        "LEFT JOIN pm.Roles ar ON ar.RoleId = t.AssignedToRoleId",
        "LEFT JOIN pm.Users rby ON rby.UserId = t.ReportedByUserId",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND (@status IS NULL OR t.Status = @status)",
        "  AND (@assetId IS NULL OR t.AssetId = @assetId)",
        "  AND (@facilityId IS NULL OR t.FacilityId = @facilityId)",
        "  AND (@impactLevel IS NULL OR t.ImpactLevel = @impactLevel)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@reportedFrom IS NULL OR t.ReportedAt >= @reportedFrom)",
        "  AND (@reportedTo IS NULL OR t.ReportedAt <= @reportedTo)",
        "  AND (@completedFrom IS NULL OR t.CompletedAt >= @completedFrom)",
        "  AND (@completedTo IS NULL OR t.CompletedAt <= @completedTo)",
        "  AND (",
        "    @assigned = N'any'",
        "    OR (",
        "      @assigned = N'unassigned'",
        "      AND t.AssignedToUserId IS NULL",
        "      AND t.AssignedToRoleId IS NULL",
        "    )",
        "    OR (",
        "      @assigned = N'me'",
        "      AND (",
        "        t.AssignedToUserId = @userId",
        "        OR (",
        "          t.AssignedToUserId IS NULL",
        "          AND t.AssignedToRoleId IS NOT NULL",
        "          AND EXISTS (",
        "            SELECT 1",
        "            FROM pm.Roles r",
        "            WHERE r.RoleId = t.AssignedToRoleId",
        "              AND r.Name IN (SELECT value FROM string_split(@rolesCsv, ','))",
        "          )",
        "        )",
        "      )",
        "    )",
        "  )",
        "ORDER BY t.ReportedAt DESC, t.CreatedAt DESC",
        "OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  res.json({
    page,
    pageSize,
    items: rows.map((r) => ({
      id: r.TaskId,
      taskNumber: r.TaskNumber,
      status: r.Status,
      priority: r.Priority,
      scheduledDueAt: r.ScheduledDueAt,
      createdAt: r.CreatedAt,
      startedAt: r.StartedAt,
      completedAt: r.CompletedAt,
      symptom: r.Symptom,
      impactLevel: r.ImpactLevel,
      failureCategory: r.FailureCategory,
      failureCode: r.FailureCode,
      reportedAt: r.ReportedAt,
      reportedByUsername: r.ReportedByUsername,
      asset: r.AssetId
        ? {
            id: r.AssetId,
            assetTag: r.AssetTag,
            name: r.AssetName,
          }
        : null,
      facility: r.FacilityId
        ? {
            id: r.FacilityId,
            name: r.FacilityName,
          }
        : null,
      category: r.AssetCategoryId
        ? {
            id: r.AssetCategoryId,
            name: r.AssetCategoryName ?? null,
          }
        : null,
      location:
        r.AssetLocationId || r.FacilityLocationId
          ? {
              id: r.AssetLocationId ?? r.FacilityLocationId,
              name: (r.AssetLocationName ?? r.FacilityLocationName) ?? null,
            }
          : null,
      templateName: r.TemplateName,
      assignedTo: {
        userId: r.AssignedToUserId,
        username: r.AssignedToUsername,
        displayName: r.AssignedToDisplayName,
        roleId: r.AssignedToRoleId,
        roleName: r.AssignedToRoleName,
      },
    })),
  });
});

workOrdersRouter.get("/:taskId", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const taskResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.MaintenanceType AS MaintenanceType,",
        "  t.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  t.FacilityId AS FacilityId,",
        "  fac.Name AS FacilityName,",
        "  t.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  au.Username AS AssignedToUsername,",
        "  au.DisplayName AS AssignedToDisplayName,",
        "  t.AssignedToRoleId AS AssignedToRoleId,",
        "  ar.Name AS AssignedToRoleName,",
        "  t.CreatedAt AS CreatedAt,",
        "  t.StartedAt AS StartedAt,",
        "  t.TechnicianCompletedAt AS RepairSubmittedAt,",
        "  t.TechnicianCompletedByUserId AS RepairSubmittedByUserId,",
        "  su.Username AS RepairSubmittedByUsername,",
        "  su.DisplayName AS RepairSubmittedByDisplayName,",
        "  t.CompletedAt AS CompletedAt,",
        "  t.CompletedByUserId AS CompletedByUserId,",
        "  cu.Username AS CompletedByUsername,",
        "  cu.DisplayName AS CompletedByDisplayName,",
        "  t.RejectedAt AS ReturnedAt,",
        "  t.RejectedByUserId AS ReturnedByUserId,",
        "  ru.Username AS ReturnedByUsername,",
        "  ru.DisplayName AS ReturnedByDisplayName,",
        "  t.RejectionReason AS ReturnReason,",
        "  t.CancelledAt AS CancelledAt,",
        "  t.CancelledByUserId AS CancelledByUserId,",
        "  xu.Username AS CancelledByUsername,",
        "  xu.DisplayName AS CancelledByDisplayName,",
        "  t.Symptom AS Symptom,",
        "  t.ImpactLevel AS ImpactLevel,",
        "  t.FailureCategory AS FailureCategory,",
        "  t.FailureCode AS FailureCode,",
        "  t.DowntimeStartedAt AS DowntimeStartedAt,",
        "  t.DowntimeEndedAt AS DowntimeEndedAt,",
        "  t.ReportedAt AS ReportedAt,",
        "  t.ReportedChannel AS ReportedChannel,",
        "  t.ReportedByUserId AS ReportedByUserId,",
        "  rby.Username AS ReportedByUsername,",
        "  rby.DisplayName AS ReportedByDisplayName,",
        "  t.RecurringFromTaskId AS RecurringFromTaskId,",
        "  t.ResolutionNotes AS ResolutionNotes",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users au ON au.UserId = t.AssignedToUserId",
        "LEFT JOIN pm.Roles ar ON ar.RoleId = t.AssignedToRoleId",
        "LEFT JOIN pm.Users su ON su.UserId = t.TechnicianCompletedByUserId",
        "LEFT JOIN pm.Users cu ON cu.UserId = t.CompletedByUserId",
        "LEFT JOIN pm.Users ru ON ru.UserId = t.RejectedByUserId",
        "LEFT JOIN pm.Users xu ON xu.UserId = t.CancelledByUserId",
        "LEFT JOIN pm.Users rby ON rby.UserId = t.ReportedByUserId",
        "WHERE t.TaskId = @taskId AND t.MaintenanceType = N'CM'",
      ].join("\n"),
    );

  const row = taskResult.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const intervalsResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT",
        "  i.CMDowntimeIntervalId AS CMDowntimeIntervalId,",
        "  i.StartedAt AS StartedAt,",
        "  i.StartedReason AS StartedReason,",
        "  i.EndedAt AS EndedAt,",
        "  i.EndReason AS EndReason,",
        "  i.StartedByUserId AS StartedByUserId,",
        "  su.Username AS StartedByUsername,",
        "  su.DisplayName AS StartedByDisplayName,",
        "  i.EndedByUserId AS EndedByUserId,",
        "  eu.Username AS EndedByUsername,",
        "  eu.DisplayName AS EndedByDisplayName",
        "FROM pm.CMDowntimeIntervals i",
        "LEFT JOIN pm.Users su ON su.UserId = i.StartedByUserId",
        "LEFT JOIN pm.Users eu ON eu.UserId = i.EndedByUserId",
        "WHERE i.TaskId = @taskId",
        "ORDER BY i.StartedAt ASC, i.CreatedAt ASC",
      ].join("\n"),
    );
  const intervalRows = intervalsResult.recordset as Array<Record<string, unknown>>;
  const downtimeIntervals = intervalRows.map((intervalRow) => ({
    id: intervalRow.CMDowntimeIntervalId,
    startedAt: intervalRow.StartedAt,
    startedReason: intervalRow.StartedReason ?? null,
    startedBy: intervalRow.StartedByUserId
      ? {
          userId: intervalRow.StartedByUserId,
          username: intervalRow.StartedByUsername,
          displayName: intervalRow.StartedByDisplayName,
        }
      : null,
    endedAt: intervalRow.EndedAt ?? null,
    endReason: intervalRow.EndReason ?? null,
    endedBy: intervalRow.EndedByUserId
      ? {
          userId: intervalRow.EndedByUserId,
          username: intervalRow.EndedByUsername,
          displayName: intervalRow.EndedByDisplayName,
        }
      : null,
  }));
  const nowMs = Date.now();
  const downtimeTotalSeconds = Math.floor(
    downtimeIntervals.reduce((sum, interval) => {
      const startedMs = interval.startedAt ? new Date(String(interval.startedAt)).getTime() : Number.NaN;
      const endedMs = interval.endedAt ? new Date(String(interval.endedAt)).getTime() : nowMs;
      if (Number.isNaN(startedMs) || Number.isNaN(endedMs) || endedMs < startedMs) return sum;
      return sum + Math.floor((endedMs - startedMs) / 1000);
    }, 0),
  );

  const historyResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT",
        "  e.CMTaskEventId AS CMTaskEventId,",
        "  e.EventType AS EventType,",
        "  e.OccurredAt AS OccurredAt,",
        "  e.Reason AS Reason,",
        "  e.Notes AS Notes,",
        "  e.MetadataJson AS MetadataJson,",
        "  e.ActorUserId AS ActorUserId,",
        "  u.Username AS ActorUsername,",
        "  u.DisplayName AS ActorDisplayName",
        "FROM pm.CMTaskEvents e",
        "LEFT JOIN pm.Users u ON u.UserId = e.ActorUserId",
        "WHERE e.TaskId = @taskId",
        "ORDER BY e.OccurredAt DESC, e.CreatedAt DESC",
      ].join("\n"),
    );
  const historyRows = historyResult.recordset as Array<Record<string, unknown>>;

  res.json({
    id: row.TaskId,
    taskNumber: row.TaskNumber,
    status: row.Status,
    priority: row.Priority,
    scheduledDueAt: row.ScheduledDueAt,
    createdAt: row.CreatedAt,
    startedAt: row.StartedAt,
    repairSubmittedAt: row.RepairSubmittedAt ?? null,
    repairSubmittedBy: row.RepairSubmittedByUserId
      ? {
          userId: row.RepairSubmittedByUserId,
          username: row.RepairSubmittedByUsername,
          displayName: row.RepairSubmittedByDisplayName,
        }
      : null,
    completedAt: row.CompletedAt,
    cancelledAt: row.CancelledAt,
    symptom: row.Symptom,
    impactLevel: row.ImpactLevel,
    failureCategory: row.FailureCategory,
    failureCode: row.FailureCode,
    downtimeStartedAt: row.DowntimeStartedAt,
    downtimeEndedAt: row.DowntimeEndedAt,
    downtimeTotalSeconds,
    downtimeIntervals,
    reportedAt: row.ReportedAt,
    reportedChannel: row.ReportedChannel,
    reportedBy: row.ReportedByUserId
      ? { userId: row.ReportedByUserId, username: row.ReportedByUsername, displayName: row.ReportedByDisplayName }
      : null,
    asset: row.AssetId
      ? {
          id: row.AssetId,
          assetTag: row.AssetTag,
          name: row.AssetName,
        }
      : null,
    facility: row.FacilityId
      ? {
          id: row.FacilityId,
          name: row.FacilityName,
        }
      : null,
    template: { id: row.TemplateId, name: row.TemplateName },
    assignedTo: {
      userId: row.AssignedToUserId,
      username: row.AssignedToUsername,
      displayName: row.AssignedToDisplayName,
      roleId: row.AssignedToRoleId,
      roleName: row.AssignedToRoleName,
    },
    completedBy: row.CompletedByUserId
      ? { userId: row.CompletedByUserId, username: row.CompletedByUsername, displayName: row.CompletedByDisplayName }
      : null,
    returnedAt: row.ReturnedAt ?? null,
    returnedBy: row.ReturnedByUserId
      ? { userId: row.ReturnedByUserId, username: row.ReturnedByUsername, displayName: row.ReturnedByDisplayName }
      : null,
    returnReason: row.ReturnReason ?? null,
    cancelledBy: row.CancelledByUserId
      ? { userId: row.CancelledByUserId, username: row.CancelledByUsername, displayName: row.CancelledByDisplayName }
      : null,
    recurringFromTaskId: row.RecurringFromTaskId ?? null,
    history: historyRows.map((historyRow) => ({
      id: historyRow.CMTaskEventId,
      type: historyRow.EventType,
      occurredAt: historyRow.OccurredAt,
      reason: historyRow.Reason ?? null,
      notes: historyRow.Notes ?? null,
      metadataJson: historyRow.MetadataJson ?? null,
      actor: historyRow.ActorUserId
        ? {
            userId: historyRow.ActorUserId,
            username: historyRow.ActorUsername,
            displayName: historyRow.ActorDisplayName,
          }
        : null,
    })),
    resolutionNotes: row.ResolutionNotes ?? null,
  });
});

workOrdersRouter.post("/:taskId/assign", requireManager, async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = WorkOrderAssignSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const assignedToUserId = parsed.data.assignedToUserId ?? null;
  const assignedToRoleId = parsed.data.assignedToRoleId ?? null;
  const priority = parsed.data.priority ?? null;

  const db = await getDb();
  const beforeResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TaskId AS TaskId,",
        "  t.MaintenanceType AS MaintenanceType,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  t.AssignedToRoleId AS AssignedToRoleId,",
        "  t.Priority AS Priority,",
        "  t.Status AS Status",
        "FROM pm.PMTasks t",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );
  const beforeRow = beforeResult.recordset[0] as Record<string, unknown> | undefined;
  if (!beforeRow || String(beforeRow.MaintenanceType) !== "CM") {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const updateResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .input("assignedToUserId", sql.UniqueIdentifier, assignedToUserId)
    .input("assignedToRoleId", sql.UniqueIdentifier, assignedToRoleId)
    .input("priority", sql.NVarChar(16), priority)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  AssignedToUserId = @assignedToUserId,",
        "  AssignedToRoleId = @assignedToRoleId,",
        "  Priority = COALESCE(@priority, Priority)",
        "WHERE TaskId = @taskId AND MaintenanceType = N'CM';",
        "SELECT",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  t.AssignedToRoleId AS AssignedToRoleId,",
        "  t.Priority AS Priority,",
        "  t.Status AS Status",
        "FROM pm.PMTasks t",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );
  const afterRow = updateResult.recordset[0] as Record<string, unknown> | undefined;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "work_order.assign",
    entityType: "task",
    entityId: taskId,
    metadata: {
      updates: parsed.data,
      before: {
        assignedToUserId: beforeRow.AssignedToUserId ?? null,
        assignedToRoleId: beforeRow.AssignedToRoleId ?? null,
        priority: beforeRow.Priority ?? null,
        status: beforeRow.Status ?? null,
      },
      after: {
        assignedToUserId: afterRow?.AssignedToUserId ?? null,
        assignedToRoleId: afterRow?.AssignedToRoleId ?? null,
        priority: afterRow?.Priority ?? null,
        status: afterRow?.Status ?? null,
      },
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.json({ ok: true });
});

workOrdersRouter.post("/:taskId/start", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const db = await getDb();
  const accessRow = await loadCmAccessRow(db, taskId);
  if (!accessRow || accessRow.MaintenanceType !== "CM") {
    res.status(404).json({ message: "Not found" });
    return;
  }
  if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
    assignedToUserId: accessRow.AssignedToUserId,
    assignedToRoleName: accessRow.AssignedToRoleName,
  })) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  if (accessRow.Status !== "open") {
    res.status(409).json({ message: "Invalid state" });
    return;
  }
  await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  StartedAt = COALESCE(StartedAt, sysutcdatetime()),",
        "  Status = CASE WHEN Status IN (N'completed', N'cancelled') THEN Status ELSE N'in_progress' END",
        "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
      ].join("\n"),
    );
  res.json({ ok: true });
});

workOrdersRouter.post("/:taskId/pause", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const db = await getDb();
  const accessRow = await loadCmAccessRow(db, taskId);
  if (!accessRow || accessRow.MaintenanceType !== "CM") {
    res.status(404).json({ message: "Not found" });
    return;
  }
  if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
    assignedToUserId: accessRow.AssignedToUserId,
    assignedToRoleName: accessRow.AssignedToRoleName,
  })) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  if (accessRow.Status !== "in_progress") {
    res.status(409).json({ message: "Invalid state" });
    return;
  }
  await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  StartedAt = COALESCE(StartedAt, sysutcdatetime()),",
        "  Status = CASE WHEN Status IN (N'completed', N'cancelled') THEN Status ELSE N'paused' END",
        "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
      ].join("\n"),
    );
  res.json({ ok: true });
});

workOrdersRouter.post("/:taskId/resume", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const db = await getDb();
  const accessRow = await loadCmAccessRow(db, taskId);
  if (!accessRow || accessRow.MaintenanceType !== "CM") {
    res.status(404).json({ message: "Not found" });
    return;
  }
  if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
    assignedToUserId: accessRow.AssignedToUserId,
    assignedToRoleName: accessRow.AssignedToRoleName,
  })) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  if (accessRow.Status !== "paused") {
    res.status(409).json({ message: "Invalid state" });
    return;
  }
  await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  StartedAt = COALESCE(StartedAt, sysutcdatetime()),",
        "  Status = CASE WHEN Status IN (N'completed', N'cancelled') THEN Status ELSE N'in_progress' END",
        "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
      ].join("\n"),
    );
  res.json({ ok: true });
});

workOrdersRouter.delete("/:taskId", requireSuperadmin, async (req, res, next) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();

  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const taskInfoResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT TOP (1)",
          "  t.TaskId AS TaskId,",
          "  t.AssetId AS AssetId,",
          "  t.TaskNumber AS TaskNumber",
          "FROM pm.PMTasks t WITH (XLOCK, HOLDLOCK)",
          "WHERE t.TaskId = @taskId AND t.MaintenanceType = N'CM'",
        ].join("\n"),
      );

    const taskRow = taskInfoResult.recordset[0] as Record<string, unknown> | undefined;
    if (!taskRow) {
      await tx.rollback();
      res.status(404).json({ message: "Not found" });
      return;
    }

    if (await hasTaskDeletionReferences(tx, taskId)) {
      await tx.rollback();
      res.status(409).json({ message: "Task is referenced by scheduling, notification history or another task.", code: "TASK_REFERENCED" });
      return;
    }

    const storagePathsResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT StoragePath",
          "FROM pm.PMTaskEvidence",
          "WHERE TaskId = @taskId AND StoragePath IS NOT NULL",
          "UNION ALL",
          "SELECT StoragePath",
          "FROM pm.PMTaskChecklistEvidence",
          "WHERE TaskId = @taskId AND StoragePath IS NOT NULL",
        ].join("\n"),
      );

    const storagePathRows = storagePathsResult.recordset as Array<Record<string, unknown>>;
    const storagePaths: string[] = storagePathRows
      .map((r) => (typeof r.StoragePath === "string" ? r.StoragePath : null))
      .filter((v): v is string => v !== null);

    await deleteTaskOwnedRows(tx, taskId);

    const assetId = typeof taskRow.AssetId === "string" ? (taskRow.AssetId as string) : null;
    const taskNumber = typeof taskRow.TaskNumber === "string" ? (taskRow.TaskNumber as string) : null;

    await writeAuditLog({
      executor: tx,
      actorUserId: req.user.sub,
      action: "work_order.delete",
      entityType: "task",
      entityId: taskId,
      metadata: {
        assetId,
        taskNumber,
        reason: "manual-delete",
      },
      ipAddress: typeof req.ip === "string" ? req.ip : null,
      userAgent: req.get("user-agent") ?? null,
    });

    await tx.commit();

    if (env.EVIDENCE_STORAGE_ROOT && storagePaths.length > 0) {
      for (const storagePath of storagePaths) {
        const resolved = resolveStoredFileAbs(env.EVIDENCE_STORAGE_ROOT, storagePath);
        if (!resolved) continue;
        await fs.promises.unlink(resolved).catch(() => undefined);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    next(err);
  }
});

const OutcomeSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
const ChecklistResultSchema = z.object({
  templateChecklistItemId: z.string().uuid(),
  outcome: OutcomeSchema,
  notes: z.string().max(1024).nullable().optional(),
});
const CompleteSchema = z.object({
  checklistResults: z.array(ChecklistResultSchema).default([]),
  forceCompleted: z.boolean().optional(),
  completedAt: z.string().datetime().optional(),
  backdateReason: z.string().max(1024).optional(),
  technicianName: z.string().max(256).optional(),
});

const WorkOrderResolutionSchema = z.object({
  resolutionNotes: z.string().max(2048).optional(),
});

const bitToBoolean = (value: unknown): boolean => value === true || value === 1;

workOrdersRouter.post("/:taskId/complete", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = CompleteSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const taskInfo = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT TOP (1)",
          "  t.TaskId AS TaskId,",
          "  t.TemplateId AS TemplateId,",
          "  t.Status AS Status,",
          "  t.AssignedToUserId AS AssignedToUserId,",
          "  r.Name AS AssignedToRoleName",
          "FROM pm.PMTasks t",
          "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
          "WHERE t.TaskId = @taskId AND t.MaintenanceType = N'CM'",
        ].join("\n"),
      );

    const row = taskInfo.recordset[0] as Record<string, unknown> | undefined;
    if (!row) {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }

    const accessRow: TaskAccessRow = {
      AssignedToUserId: (row.AssignedToUserId as string | null) ?? null,
      AssignedToRoleName: (row.AssignedToRoleName as string | null) ?? null,
    };
    if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
      assignedToUserId: accessRow.AssignedToUserId,
      assignedToRoleName: accessRow.AssignedToRoleName,
    })) {
      res.status(403).json({ message: "Forbidden" });
      await tx.rollback();
      return;
    }

    const currentStatus = typeof row.Status === "string" ? row.Status : null;
    if (currentStatus === "pending_review") {
      res.status(409).json({ message: "Repair is already pending review" });
      await tx.rollback();
      return;
    }
    if (isTerminalCmStatus(currentStatus)) {
      res.status(409).json({ message: "Invalid state" });
      await tx.rollback();
      return;
    }

    const templateItemsResult = await tx
      .request()
      .input("templateId", sql.UniqueIdentifier, row.TemplateId as string)
      .query(
        [
          "SELECT",
          "  i.TemplateChecklistItemId AS TemplateChecklistItemId,",
          "  i.IsMandatory AS IsMandatory,",
          "  i.RequiresNotes AS RequiresNotes,",
          "  i.RequiresPassFail AS RequiresPassFail,",
          "  i.RequiresAttachment AS RequiresAttachment,",
          "  i.IsActive AS IsActive",
          "FROM pm.PMTemplateChecklistItems i",
          "WHERE i.TemplateId = @templateId",
        ].join("\n"),
      );

    const templateItems = templateItemsResult.recordset as Array<Record<string, unknown>>;
    const templateItemById = new Map<string, Record<string, unknown>>(
      templateItems.map((i) => [String(i.TemplateChecklistItemId), i]),
    );

    const checklistEvidenceResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT",
          "  e.TemplateChecklistItemId AS TemplateChecklistItemId",
          "FROM pm.PMTaskChecklistEvidence e",
          "WHERE e.TaskId = @taskId",
        ].join("\n"),
      );
    const checklistEvidenceRows = checklistEvidenceResult.recordset as Array<Record<string, unknown>>;
    const checklistEvidenceItemIdSet = new Set<string>(
      checklistEvidenceRows
        .map((r) => (typeof r.TemplateChecklistItemId === "string" ? r.TemplateChecklistItemId : null))
        .filter((v): v is string => v !== null),
    );

    for (const result of parsed.data.checklistResults) {
      const templateItem = templateItemById.get(result.templateChecklistItemId);
      if (!templateItem) {
        res.status(400).json({ message: "Invalid request" });
        await tx.rollback();
        return;
      }

      if (!bitToBoolean(templateItem.IsActive)) {
        res.status(400).json({ message: "Invalid request" });
        await tx.rollback();
        return;
      }

      const requiresPassFail = bitToBoolean(templateItem.RequiresPassFail);
      if (!requiresPassFail && result.outcome === 2) {
        res.status(400).json({ message: "Invalid request" });
        await tx.rollback();
        return;
      }

      if (bitToBoolean(templateItem.IsMandatory) && result.outcome === 0) {
        res.status(400).json({ message: "Invalid request" });
        await tx.rollback();
        return;
      }

      const notes = result.notes ?? null;
      if (bitToBoolean(templateItem.RequiresNotes) && result.outcome !== 0) {
        if (!notes || notes.trim().length === 0) {
          res.status(400).json({ message: "Invalid request" });
          await tx.rollback();
          return;
        }
      }

      if (
        bitToBoolean(templateItem.RequiresAttachment) &&
        bitToBoolean(templateItem.IsMandatory) &&
        result.outcome !== 0
      ) {
        if (!checklistEvidenceItemIdSet.has(result.templateChecklistItemId)) {
          res.status(400).json({ message: "Invalid request" });
          await tx.rollback();
          return;
        }
      }
    }

    const parsedCompletedAt = parsed.data.completedAt;
    const hasCustomCompletedAt = typeof parsedCompletedAt === "string" && parsedCompletedAt.length > 0;
    let effectiveCompletedAt: Date | null = null;
    let useBackdated = false;

    if (hasCustomCompletedAt) {
      const actingManager = isManagerUser(req.user.roles);
      if (!actingManager) {
        res.status(403).json({ message: "Forbidden" });
        await tx.rollback();
        return;
      }
      try {
        const parsedDate = new Date(parsedCompletedAt);
        if (Number.isNaN(parsedDate.getTime())) {
          res.status(400).json({ message: "Invalid completion date" });
          await tx.rollback();
          return;
        }
        const now = new Date();
        if (parsedDate.getTime() > now.getTime()) {
          res.status(400).json({ message: "Completion date cannot be in the future" });
          await tx.rollback();
          return;
        }
        const reason = parsed.data.backdateReason?.trim() ?? "";
        if (reason.length === 0) {
          res.status(400).json({ message: "Backdate reason is required when setting completion date" });
          await tx.rollback();
          return;
        }
        effectiveCompletedAt = parsedDate;
        useBackdated = true;
      } catch {
        res.status(400).json({ message: "Invalid completion date" });
        await tx.rollback();
        return;
      }
    }

    const completedAtDate = effectiveCompletedAt ?? new Date();

    await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("completedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("forceCompleted", sql.Bit, parsed.data.forceCompleted ? 1 : 0)
      .input("completedAt", sql.DateTime2(0), completedAtDate)
      .input("isBackdated", sql.Bit, useBackdated ? 1 : 0)
      .input("backdateReason", sql.NVarChar(1024), useBackdated ? parsed.data.backdateReason ?? null : null)
      .input("technicianName", sql.NVarChar(256), parsed.data.technicianName ?? null)
      .query(
        [
          "UPDATE pm.PMTasks",
          "SET",
          "  Status = N'pending_review',",
          "  StartedAt = COALESCE(StartedAt, @completedAt),",
          "  TechnicianCompletedAt = @completedAt,",
          "  TechnicianCompletedByUserId = @completedByUserId,",
          "  CompletedAt = NULL,",
          "  CompletedByUserId = NULL,",
          "  RejectedAt = NULL,",
          "  RejectedByUserId = NULL,",
          "  RejectionReason = NULL,",
          "  ForceCompleted = @forceCompleted,",
          "  IsBackdated = @isBackdated,",
          "  BackdateReason = @backdateReason,",
          "  TechnicianName = @technicianName,",
          "  DataEntryAt = COALESCE(DataEntryAt, sysutcdatetime())",
          "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
        ].join("\n"),
      );

    for (const item of parsed.data.checklistResults) {
      await tx
        .request()
        .input("taskId", sql.UniqueIdentifier, taskId)
        .input("templateChecklistItemId", sql.UniqueIdentifier, item.templateChecklistItemId)
        .input("outcome", sql.TinyInt, item.outcome)
        .input("notes", sql.NVarChar(1024), item.notes ?? null)
        .input("completedByUserId", sql.UniqueIdentifier, req.user.sub)
        .input("completedAt", sql.DateTime2(0), completedAtDate)
        .query(
          [
            "MERGE pm.PMTaskChecklistResults WITH (HOLDLOCK) AS target",
            "USING (SELECT @taskId AS TaskId, @templateChecklistItemId AS TemplateChecklistItemId) AS source",
            "ON target.TaskId = source.TaskId AND target.TemplateChecklistItemId = source.TemplateChecklistItemId",
            "WHEN MATCHED THEN",
            "  UPDATE SET",
            "    Outcome = @outcome,",
            "    Notes = @notes,",
            "    CompletedAt = @completedAt,",
            "    CompletedByUserId = @completedByUserId",
            "WHEN NOT MATCHED THEN",
            "  INSERT (TaskId, TemplateChecklistItemId, Outcome, Notes, CompletedAt, CompletedByUserId)",
            "  VALUES (@taskId, @templateChecklistItemId, @outcome, @notes, @completedAt, @completedByUserId);",
          ].join("\n"),
        );
    }

    await appendCmEvent({
      executor: tx,
      taskId,
      eventType: "repair_submitted",
      occurredAt: completedAtDate,
      actorUserId: req.user.sub,
      reason: useBackdated ? parsed.data.backdateReason ?? null : null,
      notes: parsed.data.technicianName ?? null,
      metadataJson: JSON.stringify({
        checklistResultsCount: parsed.data.checklistResults.length,
        forceCompleted: parsed.data.forceCompleted === true,
        isBackdated: useBackdated,
      }),
    });

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

workOrdersRouter.post("/:taskId/verify-close", requireManager, async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const accessRow = await loadCmAccessRow(tx, taskId);
    if (!accessRow || accessRow.MaintenanceType !== "CM") {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }
    if (accessRow.Status !== "pending_review") {
      res.status(409).json({ message: "Work order is not pending review" });
      await tx.rollback();
      return;
    }
    if (accessRow.TechnicianCompletedByUserId && accessRow.TechnicianCompletedByUserId === req.user.sub) {
      res.status(403).json({ message: "Repair performers cannot verify their own work order" });
      await tx.rollback();
      return;
    }

    const openIntervalResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT TOP (1) CMDowntimeIntervalId",
          "FROM pm.CMDowntimeIntervals",
          "WHERE TaskId = @taskId AND EndedAt IS NULL",
        ].join("\n"),
      );
    if ((openIntervalResult.recordset?.length ?? 0) > 0) {
      res.status(409).json({ message: "Record restoration before closing the work order" });
      await tx.rollback();
      return;
    }

    const verifiedAt = new Date();
    const updated = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("completedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("completedAt", sql.DateTime2(0), verifiedAt)
      .query(
        [
          "UPDATE pm.PMTasks",
          "SET",
          "  Status = N'completed',",
          "  CompletedAt = @completedAt,",
          "  CompletedByUserId = @completedByUserId,",
          "  DataEntryAt = COALESCE(DataEntryAt, sysutcdatetime())",
          "WHERE TaskId = @taskId",
          "  AND MaintenanceType = N'CM'",
          "  AND Status = N'pending_review'",
        ].join("\n"),
      );
    if ((updated.rowsAffected?.[0] ?? 0) === 0) {
      res.status(409).json({ message: "Invalid state" });
      await tx.rollback();
      return;
    }

    await appendCmEvent({
      executor: tx,
      taskId,
      eventType: "verified_closed",
      occurredAt: verifiedAt,
      actorUserId: req.user.sub,
    });

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

workOrdersRouter.post("/:taskId/return-for-correction", requireManager, async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = WorkOrderReturnForCorrectionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const accessRow = await loadCmAccessRow(tx, taskId);
    if (!accessRow || accessRow.MaintenanceType !== "CM") {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }
    if (accessRow.Status !== "pending_review") {
      res.status(409).json({ message: "Work order is not pending review" });
      await tx.rollback();
      return;
    }

    const returnedAt = new Date();
    const reason = parsed.data.reason.trim();
    const updated = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("rejectedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("rejectedAt", sql.DateTime2(0), returnedAt)
      .input("reason", sql.NVarChar(1024), reason)
      .query(
        [
          "UPDATE pm.PMTasks",
          "SET",
          "  Status = N'open',",
          "  RejectedAt = @rejectedAt,",
          "  RejectedByUserId = @rejectedByUserId,",
          "  RejectionReason = @reason,",
          "  CompletedAt = NULL,",
          "  CompletedByUserId = NULL,",
          "  DataEntryAt = COALESCE(DataEntryAt, sysutcdatetime())",
          "WHERE TaskId = @taskId",
          "  AND MaintenanceType = N'CM'",
          "  AND Status = N'pending_review'",
        ].join("\n"),
      );
    if ((updated.rowsAffected?.[0] ?? 0) === 0) {
      res.status(409).json({ message: "Invalid state" });
      await tx.rollback();
      return;
    }

    await appendCmEvent({
      executor: tx,
      taskId,
      eventType: "returned_for_correction",
      occurredAt: returnedAt,
      actorUserId: req.user.sub,
      reason,
    });

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

workOrdersRouter.post("/:taskId/cancel", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const db = await getDb();
  const access = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE t.TaskId = @taskId AND t.MaintenanceType = N'CM'",
      ].join("\n"),
    );
  const row = access.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }
  const accessRow: TaskAccessRow = {
    AssignedToUserId: (row.AssignedToUserId as string | null) ?? null,
    AssignedToRoleName: (row.AssignedToRoleName as string | null) ?? null,
  };
  if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
    assignedToUserId: accessRow.AssignedToUserId,
    assignedToRoleName: accessRow.AssignedToRoleName,
  })) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .input("cancelledByUserId", sql.UniqueIdentifier, req.user.sub)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  Status = N'cancelled',",
        "  CancelledAt = sysutcdatetime(),",
        "  CancelledByUserId = @cancelledByUserId",
        "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
      ].join("\n"),
    );
  res.json({ ok: true });
});

workOrdersRouter.post("/:taskId/close-downtime", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }
  const parsed = WorkOrderRestorationSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const accessRow = await loadCmAccessRow(tx, taskId);
    if (!accessRow || accessRow.MaintenanceType !== "CM") {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }
    if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
      assignedToUserId: accessRow.AssignedToUserId,
      assignedToRoleName: accessRow.AssignedToRoleName,
    })) {
      res.status(403).json({ message: "Forbidden" });
      await tx.rollback();
      return;
    }
    if (isTerminalCmStatus(accessRow.Status)) {
      res.status(409).json({ message: "Invalid state" });
      await tx.rollback();
      return;
    }

    const intervalResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT TOP (1)",
          "  CMDowntimeIntervalId AS CMDowntimeIntervalId,",
          "  StartedAt AS StartedAt",
          "FROM pm.CMDowntimeIntervals",
          "WHERE TaskId = @taskId AND EndedAt IS NULL",
          "ORDER BY StartedAt DESC, CreatedAt DESC",
        ].join("\n"),
      );
    const intervalRow = intervalResult.recordset[0] as Record<string, unknown> | undefined;
    if (!intervalRow) {
      res.status(409).json({ message: "There is no active downtime interval to restore" });
      await tx.rollback();
      return;
    }

    const restoredAtRaw = parsed.data.restoredAt?.trim() ?? "";
    const hasCustomRestoredAt = restoredAtRaw.length > 0;
    const restoredAt = hasCustomRestoredAt ? new Date(restoredAtRaw) : new Date();
    if (Number.isNaN(restoredAt.getTime())) {
      res.status(400).json({ message: "Invalid restoration date" });
      await tx.rollback();
      return;
    }
    if (restoredAt.getTime() > Date.now()) {
      res.status(400).json({ message: "Restoration date cannot be in the future" });
      await tx.rollback();
      return;
    }
    const startedAtValue = intervalRow.StartedAt instanceof Date ? intervalRow.StartedAt : new Date(String(intervalRow.StartedAt));
    if (Number.isNaN(startedAtValue.getTime()) || restoredAt.getTime() < startedAtValue.getTime()) {
      res.status(400).json({ message: "Restoration date cannot be earlier than downtime start" });
      await tx.rollback();
      return;
    }
    const reason = parsed.data.reason?.trim() ?? "";
    if (hasCustomRestoredAt && reason.length === 0) {
      res.status(400).json({ message: "Reason is required when setting a restoration date" });
      await tx.rollback();
      return;
    }

    await tx
      .request()
      .input("intervalId", sql.UniqueIdentifier, String(intervalRow.CMDowntimeIntervalId))
      .input("endedAt", sql.DateTime2(0), restoredAt)
      .input("endedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("endReason", sql.NVarChar(1024), reason.length > 0 ? reason : null)
      .query(
        [
          "UPDATE pm.CMDowntimeIntervals",
          "SET",
          "  EndedAt = @endedAt,",
          "  EndedByUserId = @endedByUserId,",
          "  EndReason = @endReason,",
          "  UpdatedAt = sysutcdatetime()",
          "WHERE CMDowntimeIntervalId = @intervalId",
          "  AND EndedAt IS NULL",
        ].join("\n"),
      );

    await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("endedAt", sql.DateTime2(0), restoredAt)
      .query(
        [
          "UPDATE pm.PMTasks",
          "SET DowntimeEndedAt = @endedAt",
          "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
        ].join("\n"),
      );

    await appendCmEvent({
      executor: tx,
      taskId,
      eventType: "restoration_recorded",
      occurredAt: restoredAt,
      actorUserId: req.user.sub,
      reason: reason.length > 0 ? reason : null,
    });

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

workOrdersRouter.post("/:taskId/reopen-downtime", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = WorkOrderReopenDowntimeSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const accessRow = await loadCmAccessRow(tx, taskId);
    if (!accessRow || accessRow.MaintenanceType !== "CM") {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }
    if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
      assignedToUserId: accessRow.AssignedToUserId,
      assignedToRoleName: accessRow.AssignedToRoleName,
    })) {
      res.status(403).json({ message: "Forbidden" });
      await tx.rollback();
      return;
    }
    if (isTerminalCmStatus(accessRow.Status)) {
      res.status(409).json({ message: "Create a new linked work order after closure or cancellation" });
      await tx.rollback();
      return;
    }

    const openIntervalResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT TOP (1) CMDowntimeIntervalId",
          "FROM pm.CMDowntimeIntervals",
          "WHERE TaskId = @taskId AND EndedAt IS NULL",
        ].join("\n"),
      );
    if ((openIntervalResult.recordset?.length ?? 0) > 0) {
      res.status(409).json({ message: "Downtime is already active" });
      await tx.rollback();
      return;
    }

    const startedAtRaw = parsed.data.downtimeStartedAt?.trim() ?? "";
    const hasCustomStartedAt = startedAtRaw.length > 0;
    const startedAt = hasCustomStartedAt ? new Date(startedAtRaw) : new Date();
    if (Number.isNaN(startedAt.getTime())) {
      res.status(400).json({ message: "Invalid downtime start date" });
      await tx.rollback();
      return;
    }
    if (startedAt.getTime() > Date.now()) {
      res.status(400).json({ message: "Downtime start date cannot be in the future" });
      await tx.rollback();
      return;
    }
    const reason = parsed.data.reason?.trim() ?? "";
    if (hasCustomStartedAt && reason.length === 0) {
      res.status(400).json({ message: "Reason is required when setting a downtime start date" });
      await tx.rollback();
      return;
    }

    const latestEndedResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT TOP (1) EndedAt AS EndedAt",
          "FROM pm.CMDowntimeIntervals",
          "WHERE TaskId = @taskId AND EndedAt IS NOT NULL",
          "ORDER BY EndedAt DESC, UpdatedAt DESC",
        ].join("\n"),
      );
    const latestEndedAtValue = latestEndedResult.recordset[0]?.EndedAt as Date | string | null | undefined;
    const latestEndedAt =
      latestEndedAtValue instanceof Date
        ? latestEndedAtValue
        : typeof latestEndedAtValue === "string"
          ? new Date(latestEndedAtValue)
          : null;
    if (latestEndedAt && !Number.isNaN(latestEndedAt.getTime()) && startedAt.getTime() < latestEndedAt.getTime()) {
      res.status(400).json({ message: "Downtime cannot restart before the last restoration time" });
      await tx.rollback();
      return;
    }

    await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("startedAt", sql.DateTime2(0), startedAt)
      .input("startedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("startedReason", sql.NVarChar(1024), reason.length > 0 ? reason : null)
      .query(
        [
          "INSERT INTO pm.CMDowntimeIntervals (TaskId, StartedAt, StartedByUserId, StartedReason)",
          "VALUES (@taskId, @startedAt, @startedByUserId, @startedReason);",
        ].join("\n"),
      );

    await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("startedAt", sql.DateTime2(0), startedAt)
      .query(
        [
          "UPDATE pm.PMTasks",
          "SET",
          "  DowntimeStartedAt = COALESCE(DowntimeStartedAt, @startedAt),",
          "  DowntimeEndedAt = NULL,",
          "  Status = CASE WHEN Status IN (N'pending_review', N'paused') THEN N'open' ELSE Status END",
          "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
        ].join("\n"),
      );

    await appendCmEvent({
      executor: tx,
      taskId,
      eventType: "downtime_reopened",
      occurredAt: startedAt,
      actorUserId: req.user.sub,
      reason: reason.length > 0 ? reason : null,
    });

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

workOrdersRouter.post("/:taskId/report-recurrence", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = WorkOrderRepeatFaultSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const tx = new sql.Transaction(db);
  await tx.begin();
  try {
    const sourceResult = await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "SELECT TOP (1)",
          "  TaskId, AssetId, FacilityId, TemplateId, Symptom, ImpactLevel, FailureCategory, FailureCode, Status",
          "FROM pm.PMTasks",
          "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
        ].join("\n"),
      );
    const sourceRow = sourceResult.recordset[0] as Record<string, unknown> | undefined;
    if (!sourceRow) {
      res.status(404).json({ message: "Not found" });
      await tx.rollback();
      return;
    }
    if (sourceRow.Status !== "completed") {
      res.status(409).json({ message: "Use the same work order until it is closed" });
      await tx.rollback();
      return;
    }

    const downtimeStartedAtRaw = parsed.data.downtimeStartedAt?.trim() ?? "";
    const downtimeStartedAt = downtimeStartedAtRaw ? new Date(downtimeStartedAtRaw) : new Date();
    if (Number.isNaN(downtimeStartedAt.getTime())) {
      res.status(400).json({ message: "Invalid downtime start date" });
      await tx.rollback();
      return;
    }
    if (downtimeStartedAt.getTime() > Date.now()) {
      res.status(400).json({ message: "Downtime start date cannot be in the future" });
      await tx.rollback();
      return;
    }

    const insertResult = await tx
      .request()
      .input("assetId", sql.UniqueIdentifier, (sourceRow.AssetId as string | null) ?? null)
      .input("facilityId", sql.UniqueIdentifier, (sourceRow.FacilityId as string | null) ?? null)
      .input("templateId", sql.UniqueIdentifier, String(sourceRow.TemplateId))
      .input("symptom", sql.NVarChar(1024), (sourceRow.Symptom as string | null) ?? null)
      .input("impactLevel", sql.NVarChar(32), (sourceRow.ImpactLevel as string | null) ?? null)
      .input("failureCategory", sql.NVarChar(64), (sourceRow.FailureCategory as string | null) ?? null)
      .input("failureCode", sql.NVarChar(64), (sourceRow.FailureCode as string | null) ?? null)
      .input("downtimeStartedAt", sql.DateTime2(0), downtimeStartedAt)
      .input("reportedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("reportedChannel", sql.NVarChar(32), parsed.data.reportedChannel?.trim() || "web")
      .input("recurringFromTaskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "DECLARE @now datetime2(0) = sysutcdatetime();",
          "DECLARE @taskNumber nvarchar(32) = CONCAT(",
          "  N'WO-',",
          "  FORMAT(@now, 'yyyyMMdd'),",
          "  N'-',",
          "  RIGHT(CONVERT(varchar(36), NEWID()), 8)",
          ");",
          "INSERT INTO pm.PMTasks (",
          "  TaskNumber, AssetId, FacilityId, TemplateId, ScheduledDueAt, Status, MaintenanceType,",
          "  Symptom, ImpactLevel, FailureCategory, FailureCode, DowntimeStartedAt,",
          "  ReportedByUserId, ReportedAt, ReportedChannel, RecurringFromTaskId",
          ")",
          "OUTPUT inserted.TaskId AS TaskId",
          "VALUES (",
          "  @taskNumber, @assetId, @facilityId, @templateId, @now, N'open', N'CM',",
          "  @symptom, @impactLevel, @failureCategory, @failureCode, @downtimeStartedAt,",
          "  @reportedByUserId, @now, @reportedChannel, @recurringFromTaskId",
          ");",
        ].join("\n"),
      );
    const insertedTaskId = insertResult.recordset[0]?.TaskId as string | undefined;
    if (!insertedTaskId) {
      res.status(500).json({ message: "Failed to create work order" });
      await tx.rollback();
      return;
    }

    const reason = parsed.data.reason?.trim() ?? "";
    await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, insertedTaskId)
      .input("startedAt", sql.DateTime2(0), downtimeStartedAt)
      .input("startedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("startedReason", sql.NVarChar(1024), reason.length > 0 ? reason : null)
      .query(
        [
          "INSERT INTO pm.CMDowntimeIntervals (TaskId, StartedAt, StartedByUserId, StartedReason)",
          "VALUES (@taskId, @startedAt, @startedByUserId, @startedReason);",
        ].join("\n"),
      );

    await appendCmEvent({
      executor: tx,
      taskId: insertedTaskId,
      eventType: "reported",
      occurredAt: downtimeStartedAt,
      actorUserId: req.user.sub,
      notes: (sourceRow.Symptom as string | null) ?? null,
    });
    await appendCmEvent({
      executor: tx,
      taskId,
      eventType: "repeat_fault_linked",
      occurredAt: downtimeStartedAt,
      actorUserId: req.user.sub,
      reason: reason.length > 0 ? reason : null,
      metadataJson: JSON.stringify({ linkedTaskId: insertedTaskId }),
    });

    await tx.commit();
    res.status(201).json({ id: insertedTaskId, created: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

workOrdersRouter.post("/:taskId/resolution", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = WorkOrderResolutionSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const access = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE t.TaskId = @taskId AND t.MaintenanceType = N'CM'",
      ].join("\n"),
    );
  const row = access.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }
  const accessRow: TaskAccessRow = {
    AssignedToUserId: (row.AssignedToUserId as string | null) ?? null,
    AssignedToRoleName: (row.AssignedToRoleName as string | null) ?? null,
  };
  if (!canModifyAssignedTask(req.user.sub, req.user.roles, {
    assignedToUserId: accessRow.AssignedToUserId,
    assignedToRoleName: accessRow.AssignedToRoleName,
  })) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const beforeResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  ResolutionNotes",
        "FROM pm.PMTasks",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );
  const beforeRow = beforeResult.recordset[0] as { ResolutionNotes?: string | null } | undefined;

  const trimmed = (parsed.data.resolutionNotes ?? "").trim();
  const notesValue = trimmed.length > 0 ? trimmed : null;

  const updated = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .input("notes", sql.NVarChar(2048), notesValue)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  ResolutionNotes = @notes,",
        "  DataEntryAt = COALESCE(DataEntryAt, sysutcdatetime())",
        "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
      ].join("\n"),
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "work_order.update_resolution",
    entityType: "task",
    entityId: taskId,
    metadata: {
      before: { resolutionNotes: beforeRow?.ResolutionNotes ?? null },
      after: { resolutionNotes: notesValue },
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.json({ ok: true });
});
