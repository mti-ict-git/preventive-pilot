import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRole.js";

const managerRoles = ["Superadmin", "Admin", "Supervisor"] as const;
const requireManager = requireAnyRole(managerRoles);

type TaskAccessRow = {
  AssignedToUserId: string | null;
  AssignedToRoleName: string | null;
};

const canModifyTask = (userId: string, userRoles: readonly string[], task: TaskAccessRow): boolean => {
  if (userRoles.some((r) => (managerRoles as readonly string[]).includes(r))) return true;
  if (task.AssignedToUserId && task.AssignedToUserId === userId) return true;
  if (task.AssignedToRoleName && userRoles.includes(task.AssignedToRoleName)) return true;
  return false;
};

const writeAuditLog = async (input: {
  actorUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<void> => {
  const db = await getDb();
  const metadata = JSON.stringify(input.metadata);
  await db
    .request()
    .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
    .input("action", sql.NVarChar(128), input.action)
    .input("entityType", sql.NVarChar(128), input.entityType)
    .input("entityId", sql.UniqueIdentifier, input.entityId)
    .input("metadata", sql.NVarChar(sql.MAX), metadata)
    .input("ipAddress", sql.NVarChar(64), input.ipAddress)
    .input("userAgent", sql.NVarChar(512), input.userAgent)
    .query(
      [
        "INSERT INTO pm.AuditLog (",
        "  ActorUserId, Action, EntityType, EntityId, Metadata, IpAddress, UserAgent",
        ")",
        "VALUES (",
        "  @actorUserId, @action, @entityType, @entityId, @metadata, @ipAddress, @userAgent",
        ")",
      ].join("\n"),
    );
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
  })
  .refine((d) => Boolean(d.assetId) !== Boolean(d.facilityId), {
    message: "Either assetId or facilityId is required",
    path: ["assetId"],
  });

const WorkOrderListQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  status: z.string().optional(),
  assetId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  impactLevel: z.string().max(32).optional(),
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
        "  ReportedByUserId, ReportedAt, ReportedChannel",
        ")",
        "OUTPUT inserted.TaskId AS TaskId",
        "VALUES (",
        "  @taskNumber, @assetId, @facilityId, @templateId, @now, N'open', N'CM',",
        "  @symptom, @impactLevel, @failureCategory, @failureCode, @downtimeStartedAt,",
        "  @reportedByUserId, @now, @reportedChannel",
        ");",
      ].join("\n"),
    );

  const insertedRow = insertResult.recordset[0] as Record<string, unknown> | undefined;
  const taskId = typeof insertedRow?.TaskId === "string" ? insertedRow.TaskId : null;
  if (!taskId) {
    res.status(500).json({ message: "Failed to create work order" });
    return;
  }

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
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.status(201).json({ id: taskId });
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
    .input("assetId", sql.UniqueIdentifier, parsed.data.assetId ?? null)
    .input("facilityId", sql.UniqueIdentifier, parsed.data.facilityId ?? null)
    .input("impactLevel", sql.NVarChar(32), parsed.data.impactLevel ?? null)
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
        "  t.FacilityId AS FacilityId,",
        "  fac.Name AS FacilityName,",
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
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
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
        "          t.AssignedToRoleId IS NOT NULL",
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
        "  t.CompletedAt AS CompletedAt,",
        "  t.CompletedByUserId AS CompletedByUserId,",
        "  cu.Username AS CompletedByUsername,",
        "  cu.DisplayName AS CompletedByDisplayName,",
        "  t.CancelledAt AS CancelledAt,",
        "  t.CancelledByUserId AS CancelledByUserId,",
        "  xu.Username AS CancelledByUsername,",
        "  xu.DisplayName AS CancelledByDisplayName,",
        "  t.Symptom AS Symptom,",
        "  t.ImpactLevel AS ImpactLevel,",
        "  t.FailureCategory AS FailureCategory,",
        "  t.FailureCode AS FailureCode,",
        "  t.ReportedAt AS ReportedAt",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users au ON au.UserId = t.AssignedToUserId",
        "LEFT JOIN pm.Roles ar ON ar.RoleId = t.AssignedToRoleId",
        "LEFT JOIN pm.Users cu ON cu.UserId = t.CompletedByUserId",
        "LEFT JOIN pm.Users xu ON xu.UserId = t.CancelledByUserId",
        "WHERE t.TaskId = @taskId AND t.MaintenanceType = N'CM'",
      ].join("\n"),
    );

  const row = taskResult.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({
    id: row.TaskId,
    taskNumber: row.TaskNumber,
    status: row.Status,
    priority: row.Priority,
    scheduledDueAt: row.ScheduledDueAt,
    createdAt: row.CreatedAt,
    startedAt: row.StartedAt,
    completedAt: row.CompletedAt,
    cancelledAt: row.CancelledAt,
    symptom: row.Symptom,
    impactLevel: row.ImpactLevel,
    failureCategory: row.FailureCategory,
    failureCode: row.FailureCode,
    reportedAt: row.ReportedAt,
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
    cancelledBy: row.CancelledByUserId
      ? { userId: row.CancelledByUserId, username: row.CancelledByUsername, displayName: row.CancelledByDisplayName }
      : null,
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
  if (!canModifyTask(req.user.sub, req.user.roles, accessRow)) {
    res.status(403).json({ message: "Forbidden" });
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
  if (!canModifyTask(req.user.sub, req.user.roles, accessRow)) {
    res.status(403).json({ message: "Forbidden" });
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
  if (!canModifyTask(req.user.sub, req.user.roles, accessRow)) {
    res.status(403).json({ message: "Forbidden" });
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
    if (!canModifyTask(req.user.sub, req.user.roles, accessRow)) {
      res.status(403).json({ message: "Forbidden" });
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
      const isManagerUser = req.user.roles.some((role) => (managerRoles as readonly string[]).includes(role));
      if (!isManagerUser) {
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
          "  Status = N'completed',",
          "  StartedAt = COALESCE(StartedAt, @completedAt),",
          "  CompletedAt = @completedAt,",
          "  CompletedByUserId = @completedByUserId,",
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
  if (!canModifyTask(req.user.sub, req.user.roles, accessRow)) {
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
  if (!canModifyTask(req.user.sub, req.user.roles, accessRow)) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }
  await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  DowntimeEndedAt = COALESCE(DowntimeEndedAt, sysutcdatetime())",
        "WHERE TaskId = @taskId AND MaintenanceType = N'CM'",
      ].join("\n"),
    );
  res.json({ ok: true });
});

