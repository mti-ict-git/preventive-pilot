import express, { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/mssql.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRole.js";

const parseBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
};

const TaskListQuerySchema = z.object({
  status: z.string().max(32).optional(),
  assigned: z.enum(["me", "unassigned", "any"]).optional().default("any"),
  overdue: z.string().optional(),
  assetId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  dueFrom: z.string().datetime().optional(),
  dueTo: z.string().datetime().optional(),
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
});

const AssignSchema = z
  .object({
    assignedToUserId: z.string().uuid().nullable().optional(),
    assignedToRoleId: z.string().uuid().nullable().optional(),
    priority: z.string().max(16).optional(),
    status: z.string().max(32).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No updates" });

const OutcomeSchema = z.number().int().min(0).max(2);

const ChecklistResultSchema = z.object({
  templateChecklistItemId: z.string().uuid(),
  outcome: OutcomeSchema,
  notes: z.string().max(1024).nullable().optional(),
});

const CompleteSchema = z.object({
  checklistResults: z.array(ChecklistResultSchema).default([]),
  forceCompleted: z.boolean().optional(),
});

const EvidenceSchema = z.object({
  uri: z.string().min(1).max(1024),
  fileName: z.string().max(256).nullable().optional(),
  contentType: z.string().max(128).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
});

const managerRoles = ["Superadmin", "Admin", "Supervisor"] as const;
const requireManager = requireAnyRole(managerRoles);

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".zip": "application/zip",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const inferMimeTypeFromFileName = (fileName: string | null): string | null => {
  if (!fileName) return null;
  const ext = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[ext] ?? null;
};

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const sanitizeSegment = (value: string): string => {
  return value
    .replace(/[\\/]/g, "-")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
};

const truncate = (value: string, maxLen: number): string => {
  if (value.length <= maxLen) return value;
  return value.slice(0, maxLen).trim();
};

const computeQuarterFolder = (whenUtc: Date): { folder: string; year: number; quarter: 1 | 2 | 3 | 4 } => {
  const year = whenUtc.getUTCFullYear();
  const month = whenUtc.getUTCMonth() + 1;
  const quarter = (month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4) as 1 | 2 | 3 | 4;
  return { folder: `Q${quarter} ${year}`, year, quarter };
};

const splitExt = (fileName: string): { base: string; ext: string } => {
  const ext = path.extname(fileName);
  return { base: ext ? fileName.slice(0, -ext.length) : fileName, ext };
};

const resolveUniqueDestPath = async (destAbs: string): Promise<string> => {
  try {
    await fs.promises.access(destAbs, fs.constants.F_OK);
  } catch {
    return destAbs;
  }

  const dir = path.dirname(destAbs);
  const baseName = path.basename(destAbs);
  const { base, ext } = splitExt(baseName);
  for (let i = 1; i <= 999; i += 1) {
    const next = path.join(dir, `${base} (${i})${ext}`);
    try {
      await fs.promises.access(next, fs.constants.F_OK);
    } catch {
      return next;
    }
  }
  return destAbs;
};

const resolveStoredFileAbs = (storageRootAbs: string, storagePath: string): string | null => {
  const root = path.resolve(storageRootAbs);
  const resolved = path.resolve(root, storagePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) return null;
  return resolved;
};

type TaskStorageContext = {
  taskId: string;
  taskNumber: string;
  templateId: string;
  assetName: string;
  assetTag: string | null;
  categoryName: string | null;
  access: TaskAccessRow;
};

const getTaskStorageContext = async (taskId: string): Promise<TaskStorageContext | null> => {
  const db = await getDb();
  const result = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.TemplateId AS TemplateId,",
        "  a.Name AS AssetName,",
        "  a.AssetTag AS AssetTag,",
        "  c.Name AS CategoryName,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  const taskNumber = typeof row?.TaskNumber === "string" ? row.TaskNumber : null;
  const templateId = typeof row?.TemplateId === "string" ? row.TemplateId : null;
  const assetName = typeof row?.AssetName === "string" ? row.AssetName : null;
  const taskIdRow = typeof row?.TaskId === "string" ? row.TaskId : null;
  if (!taskIdRow || !taskNumber || !templateId || !assetName) return null;

  return {
    taskId: taskIdRow,
    taskNumber,
    templateId,
    assetName,
    assetTag: typeof row?.AssetTag === "string" ? row.AssetTag : null,
    categoryName: typeof row?.CategoryName === "string" ? row.CategoryName : null,
    access: {
      AssignedToUserId: (row?.AssignedToUserId as string | null) ?? null,
      AssignedToRoleName: (row?.AssignedToRoleName as string | null) ?? null,
    },
  };
};

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

const bitToBoolean = (value: unknown): boolean => value === true || value === 1;

type ChecklistOutcomeLabel = "skip" | "pass" | "fail" | "done";

const outcomeLabelFor = (requiresPassFail: boolean, outcome: number): ChecklistOutcomeLabel => {
  if (requiresPassFail) {
    if (outcome === 1) return "pass";
    if (outcome === 2) return "fail";
    return "skip";
  }
  if (outcome === 0) return "skip";
  return "done";
};

export const tasksRouter = Router();

tasksRouter.use(requireAuth);

tasksRouter.get("/", async (req, res) => {
  const parsed = TaskListQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(parsed.data.pageSize) || 50));
  const offset = (page - 1) * pageSize;
  const overdue = parseBoolean(parsed.data.overdue);
  const rolesCsv = req.user.roles.join(",");

  const db = await getDb();
  const result = await db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("status", sql.NVarChar(32), parsed.data.status ?? null)
    .input("assigned", sql.NVarChar(16), parsed.data.assigned)
    .input("overdue", sql.Bit, overdue)
    .input("assetId", sql.UniqueIdentifier, parsed.data.assetId ?? null)
    .input("templateId", sql.UniqueIdentifier, parsed.data.templateId ?? null)
    .input("dueFrom", sql.DateTime2(0), parsed.data.dueFrom ?? null)
    .input("dueTo", sql.DateTime2(0), parsed.data.dueTo ?? null)
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
        "  (",
        "    SELECT COUNT(1)",
        "    FROM pm.PMTemplateChecklistItems i",
        "    WHERE i.TemplateId = t.TemplateId",
        "      AND i.IsActive = 1",
        "  ) AS ChecklistTotal,",
        "  (",
        "    SELECT COUNT(1)",
        "    FROM pm.PMTaskChecklistResults r",
        "    INNER JOIN pm.PMTemplateChecklistItems i ON i.TemplateChecklistItemId = r.TemplateChecklistItemId",
        "    WHERE r.TaskId = t.TaskId",
        "      AND r.CompletedAt IS NOT NULL",
        "      AND i.IsActive = 1",
        "  ) AS ChecklistCompleted",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users au ON au.UserId = t.AssignedToUserId",
        "LEFT JOIN pm.Roles ar ON ar.RoleId = t.AssignedToRoleId",
        "WHERE",
        "  (@status IS NULL OR t.Status = @status)",
        "  AND (@assetId IS NULL OR t.AssetId = @assetId)",
        "  AND (@templateId IS NULL OR t.TemplateId = @templateId)",
        "  AND (@dueFrom IS NULL OR t.ScheduledDueAt >= @dueFrom)",
        "  AND (@dueTo IS NULL OR t.ScheduledDueAt <= @dueTo)",
        "  AND (",
        "    @overdue IS NULL",
        "    OR (",
        "      @overdue = 1",
        "      AND t.CompletedAt IS NULL",
        "      AND t.CancelledAt IS NULL",
        "      AND t.ScheduledDueAt < sysutcdatetime()",
        "    )",
        "    OR (",
        "      @overdue = 0",
        "      AND (",
        "        t.CompletedAt IS NOT NULL",
        "        OR t.CancelledAt IS NOT NULL",
        "        OR t.ScheduledDueAt >= sysutcdatetime()",
        "      )",
        "    )",
        "  )",
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
        "ORDER BY t.ScheduledDueAt ASC, t.CreatedAt DESC",
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
      checklistTotal: Number(r.ChecklistTotal ?? 0),
      checklistCompleted: Number(r.ChecklistCompleted ?? 0),
      asset: {
        id: r.AssetId,
        assetTag: r.AssetTag,
        name: r.AssetName,
      },
      template: {
        id: r.TemplateId,
        name: r.TemplateName,
      },
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

tasksRouter.get("/evidence/:evidenceId", async (req, res) => {
  const evidenceId = req.params.evidenceId;
  if (!z.string().uuid().safeParse(evidenceId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  if (!env.EVIDENCE_STORAGE_ROOT) {
    res.status(500).json({ message: "Evidence storage not configured" });
    return;
  }

  const download = req.query.download === "1" || req.query.download === "true";

  const db = await getDb();
  const result = await db
    .request()
    .input("evidenceId", sql.UniqueIdentifier, evidenceId)
    .query(
      [
        "SELECT TOP (1)",
        "  e.EvidenceId AS EvidenceId,",
        "  e.FileName AS FileName,",
        "  e.ContentType AS ContentType,",
        "  e.SizeBytes AS SizeBytes,",
        "  e.StoragePath AS StoragePath",
        "FROM pm.PMTaskEvidence e",
        "WHERE e.EvidenceId = @evidenceId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const storagePath = typeof row.StoragePath === "string" ? row.StoragePath : null;
  if (!storagePath) {
    res.status(404).json({ message: "Evidence file not available" });
    return;
  }

  const root = path.resolve(env.EVIDENCE_STORAGE_ROOT);
  const resolved = path.resolve(root, storagePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  let st: fs.Stats;
  try {
    st = await fs.promises.stat(resolved);
  } catch {
    res.status(404).json({ message: "Evidence file not found" });
    return;
  }

  if (!st.isFile()) {
    res.status(404).json({ message: "Evidence file not found" });
    return;
  }

  const contentTypeFromDb = typeof row.ContentType === "string" && row.ContentType.trim() ? row.ContentType : null;
  const fileName = typeof row.FileName === "string" && row.FileName.trim() ? row.FileName : null;
  const contentType = contentTypeFromDb ?? inferMimeTypeFromFileName(fileName);

  if (contentType) res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(st.size));
  res.setHeader("Content-Disposition", `${download ? "attachment" : "inline"}${fileName ? `; filename="${fileName.replace(/"/g, "")}"` : ""}`);

  const stream = fs.createReadStream(resolved);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to read evidence" });
      return;
    }
    res.end();
  });
  stream.pipe(res);
});

tasksRouter.get("/checklist-evidence/:checklistEvidenceId", async (req, res) => {
  const checklistEvidenceId = req.params.checklistEvidenceId;
  if (!z.string().uuid().safeParse(checklistEvidenceId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  if (!env.EVIDENCE_STORAGE_ROOT) {
    res.status(500).json({ message: "Evidence storage not configured" });
    return;
  }

  const download = req.query.download === "1" || req.query.download === "true";

  const db = await getDb();
  const result = await db
    .request()
    .input("checklistEvidenceId", sql.UniqueIdentifier, checklistEvidenceId)
    .query(
      [
        "SELECT TOP (1)",
        "  e.ChecklistEvidenceId AS ChecklistEvidenceId,",
        "  e.FileName AS FileName,",
        "  e.ContentType AS ContentType,",
        "  e.SizeBytes AS SizeBytes,",
        "  e.StoragePath AS StoragePath",
        "FROM pm.PMTaskChecklistEvidence e",
        "WHERE e.ChecklistEvidenceId = @checklistEvidenceId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const storagePath = typeof row.StoragePath === "string" ? row.StoragePath : null;
  if (!storagePath) {
    res.status(404).json({ message: "Evidence file not available" });
    return;
  }

  const root = path.resolve(env.EVIDENCE_STORAGE_ROOT);
  const resolved = path.resolve(root, storagePath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(prefix)) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  let st: fs.Stats;
  try {
    st = await fs.promises.stat(resolved);
  } catch {
    res.status(404).json({ message: "Evidence file not found" });
    return;
  }

  if (!st.isFile()) {
    res.status(404).json({ message: "Evidence file not found" });
    return;
  }

  const contentTypeFromDb = typeof row.ContentType === "string" && row.ContentType.trim() ? row.ContentType : null;
  const fileName = typeof row.FileName === "string" && row.FileName.trim() ? row.FileName : null;
  const contentType = contentTypeFromDb ?? inferMimeTypeFromFileName(fileName);

  if (contentType) res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Length", String(st.size));
  res.setHeader(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}${fileName ? `; filename="${fileName.replace(/"/g, "")}"` : ""}`,
  );

  const stream = fs.createReadStream(resolved);
  stream.on("error", () => {
    if (!res.headersSent) {
      res.status(500).json({ message: "Failed to read evidence" });
      return;
    }
    res.end();
  });
  stream.pipe(res);
});

tasksRouter.delete("/evidence/:evidenceId", async (req, res) => {
  const evidenceId = req.params.evidenceId;
  if (!z.string().uuid().safeParse(evidenceId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const result = await db
    .request()
    .input("evidenceId", sql.UniqueIdentifier, evidenceId)
    .query(
      [
        "SELECT TOP (1)",
        "  e.EvidenceId AS EvidenceId,",
        "  e.TaskId AS TaskId,",
        "  e.StoragePath AS StoragePath,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTaskEvidence e",
        "INNER JOIN pm.PMTasks t ON t.TaskId = e.TaskId",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE e.EvidenceId = @evidenceId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
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

  const storagePath = typeof row.StoragePath === "string" ? row.StoragePath : null;
  await db
    .request()
    .input("evidenceId", sql.UniqueIdentifier, evidenceId)
    .query(["DELETE FROM pm.PMTaskEvidence WHERE EvidenceId = @evidenceId"].join("\n"));

  if (storagePath && env.EVIDENCE_STORAGE_ROOT) {
    const resolved = resolveStoredFileAbs(env.EVIDENCE_STORAGE_ROOT, storagePath);
    if (resolved) {
      await fs.promises.unlink(resolved).catch(() => undefined);
    }
  }

  res.json({ ok: true });
});

tasksRouter.delete("/checklist-evidence/:checklistEvidenceId", async (req, res) => {
  const checklistEvidenceId = req.params.checklistEvidenceId;
  if (!z.string().uuid().safeParse(checklistEvidenceId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const result = await db
    .request()
    .input("checklistEvidenceId", sql.UniqueIdentifier, checklistEvidenceId)
    .query(
      [
        "SELECT TOP (1)",
        "  e.ChecklistEvidenceId AS ChecklistEvidenceId,",
        "  e.TaskId AS TaskId,",
        "  e.StoragePath AS StoragePath,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTaskChecklistEvidence e",
        "INNER JOIN pm.PMTasks t ON t.TaskId = e.TaskId",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE e.ChecklistEvidenceId = @checklistEvidenceId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
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

  const storagePath = typeof row.StoragePath === "string" ? row.StoragePath : null;
  await db
    .request()
    .input("checklistEvidenceId", sql.UniqueIdentifier, checklistEvidenceId)
    .query(["DELETE FROM pm.PMTaskChecklistEvidence WHERE ChecklistEvidenceId = @checklistEvidenceId"].join("\n"));

  if (storagePath && env.EVIDENCE_STORAGE_ROOT) {
    const resolved = resolveStoredFileAbs(env.EVIDENCE_STORAGE_ROOT, storagePath);
    if (resolved) {
      await fs.promises.unlink(resolved).catch(() => undefined);
    }
  }

  res.json({ ok: true });
});

tasksRouter.post(
  "/:taskId/evidence/upload",
  express.raw({ type: "*/*", limit: "50mb" }),
  async (req, res) => {
    const taskId = req.params.taskId;
    if (!z.string().uuid().safeParse(taskId).success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }

    if (!env.EVIDENCE_STORAGE_ROOT) {
      res.status(500).json({ message: "Evidence storage not configured" });
      return;
    }

    const fileNameHeader = req.header("x-filename");
    if (!fileNameHeader) {
      res.status(400).json({ message: "Missing x-filename" });
      return;
    }

    const buf = req.body;
    if (!Buffer.isBuffer(buf)) {
      res.status(400).json({ message: "Invalid file body" });
      return;
    }

    if (buf.length <= 0) {
      res.status(400).json({ message: "Empty file" });
      return;
    }

    if (buf.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ message: "File too large" });
      return;
    }

    const ctx = await getTaskStorageContext(taskId);
    if (!ctx) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    if (!canModifyTask(req.user.sub, req.user.roles, ctx.access)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const originalName = path.basename(fileNameHeader);
    const safeName = sanitizeSegment(truncate(originalName, 200));
    if (!safeName) {
      res.status(400).json({ message: "Invalid filename" });
      return;
    }

    const headerContentType = req.header("content-type");
    const contentType =
      headerContentType && headerContentType.trim() ? headerContentType.trim() : inferMimeTypeFromFileName(safeName);

    const now = new Date();
    const { folder } = computeQuarterFolder(now);
    const categoryFolder = sanitizeSegment(truncate(ctx.categoryName ?? "Uncategorized", 80));
    const tag = sanitizeSegment(truncate(ctx.assetTag ?? "no-tag", 80));
    const assetFolder = sanitizeSegment(truncate(`${ctx.assetName} (${tag})`, 180));
    const taskFolder = sanitizeSegment(truncate(`Task ${ctx.taskNumber}`, 100));

    const storageRoot = path.resolve(env.EVIDENCE_STORAGE_ROOT);
    const destAbsInitial = path.join(storageRoot, folder, categoryFolder, assetFolder, "Uploads", taskFolder, safeName);
    const destAbs = await resolveUniqueDestPath(destAbsInitial);
    const storageRel = path.relative(storageRoot, destAbs);
    if (storageRel.startsWith("..")) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }

    await fs.promises.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.promises.writeFile(destAbs, buf);

    const db = await getDb();
    const inserted = await db
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("fileName", sql.NVarChar(256), safeName)
      .input("contentType", sql.NVarChar(128), contentType ?? null)
      .input("sizeBytes", sql.BigInt, buf.length)
      .input("uri", sql.NVarChar(1024), "stored")
      .input("storagePath", sql.NVarChar(1024), storageRel)
      .input("uploadedByUserId", sql.UniqueIdentifier, req.user.sub)
      .query(
        [
          "INSERT INTO pm.PMTaskEvidence (",
          "  TaskId, FileName, ContentType, SizeBytes, Uri, StoragePath, UploadedByUserId",
          ")",
          "OUTPUT inserted.EvidenceId AS EvidenceId",
          "VALUES (",
          "  @taskId, @fileName, @contentType, @sizeBytes, @uri, @storagePath, @uploadedByUserId",
          ")",
        ].join("\n"),
      );

    const evidenceId = inserted.recordset[0]?.EvidenceId as string | undefined;
    if (!evidenceId) {
      res.status(500).json({ message: "Failed to create evidence" });
      return;
    }

    res.status(201).json({ id: evidenceId });
  },
);

tasksRouter.post(
  "/:taskId/checklist-items/:templateChecklistItemId/evidence/upload",
  express.raw({ type: "*/*", limit: "50mb" }),
  async (req, res) => {
    const taskId = req.params.taskId;
    const templateChecklistItemId = req.params.templateChecklistItemId;
    if (!z.string().uuid().safeParse(taskId).success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }
    if (!z.string().uuid().safeParse(templateChecklistItemId).success) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }

    if (!env.EVIDENCE_STORAGE_ROOT) {
      res.status(500).json({ message: "Evidence storage not configured" });
      return;
    }

    const fileNameHeader = req.header("x-filename");
    if (!fileNameHeader) {
      res.status(400).json({ message: "Missing x-filename" });
      return;
    }

    const buf = req.body;
    if (!Buffer.isBuffer(buf)) {
      res.status(400).json({ message: "Invalid file body" });
      return;
    }

    if (buf.length <= 0) {
      res.status(400).json({ message: "Empty file" });
      return;
    }

    if (buf.length > MAX_UPLOAD_BYTES) {
      res.status(413).json({ message: "File too large" });
      return;
    }

    const ctx = await getTaskStorageContext(taskId);
    if (!ctx) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    if (!canModifyTask(req.user.sub, req.user.roles, ctx.access)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    const db = await getDb();
    const itemResult = await db
      .request()
      .input("templateChecklistItemId", sql.UniqueIdentifier, templateChecklistItemId)
      .input("templateId", sql.UniqueIdentifier, ctx.templateId)
      .query(
        [
          "SELECT TOP (1)",
          "  i.TemplateChecklistItemId AS TemplateChecklistItemId,",
          "  i.SortOrder AS SortOrder,",
          "  i.ItemText AS ItemText",
          "FROM pm.PMTemplateChecklistItems i",
          "WHERE i.TemplateChecklistItemId = @templateChecklistItemId",
          "  AND i.TemplateId = @templateId",
        ].join("\n"),
      );

    const itemRow = itemResult.recordset[0] as Record<string, unknown> | undefined;
    const sortOrder = typeof itemRow?.SortOrder === "number" ? itemRow.SortOrder : Number(itemRow?.SortOrder);
    const itemText = typeof itemRow?.ItemText === "string" ? itemRow.ItemText : null;
    if (!Number.isFinite(sortOrder) || itemText === null) {
      res.status(404).json({ message: "Not found" });
      return;
    }

    const originalName = path.basename(fileNameHeader);
    const safeName = sanitizeSegment(truncate(originalName, 200));
    if (!safeName) {
      res.status(400).json({ message: "Invalid filename" });
      return;
    }

    const headerContentType = req.header("content-type");
    const contentType =
      headerContentType && headerContentType.trim() ? headerContentType.trim() : inferMimeTypeFromFileName(safeName);

    const now = new Date();
    const { folder } = computeQuarterFolder(now);
    const categoryFolder = sanitizeSegment(truncate(ctx.categoryName ?? "Uncategorized", 80));
    const tag = sanitizeSegment(truncate(ctx.assetTag ?? "no-tag", 80));
    const assetFolder = sanitizeSegment(truncate(`${ctx.assetName} (${tag})`, 180));
    const taskFolder = sanitizeSegment(truncate(`Task ${ctx.taskNumber}`, 100));
    const itemFolder = sanitizeSegment(truncate(`Checklist ${sortOrder + 1} ${itemText}`, 120));

    const storageRoot = path.resolve(env.EVIDENCE_STORAGE_ROOT);
    const destAbsInitial = path.join(
      storageRoot,
      folder,
      categoryFolder,
      assetFolder,
      "Uploads",
      taskFolder,
      "Checklist",
      itemFolder,
      safeName,
    );
    const destAbs = await resolveUniqueDestPath(destAbsInitial);
    const storageRel = path.relative(storageRoot, destAbs);
    if (storageRel.startsWith("..")) {
      res.status(400).json({ message: "Invalid request" });
      return;
    }

    await fs.promises.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.promises.writeFile(destAbs, buf);

    const inserted = await db
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("templateChecklistItemId", sql.UniqueIdentifier, templateChecklistItemId)
      .input("fileName", sql.NVarChar(256), safeName)
      .input("contentType", sql.NVarChar(128), contentType ?? null)
      .input("sizeBytes", sql.BigInt, buf.length)
      .input("uri", sql.NVarChar(1024), "stored")
      .input("storagePath", sql.NVarChar(1024), storageRel)
      .input("uploadedByUserId", sql.UniqueIdentifier, req.user.sub)
      .query(
        [
          "INSERT INTO pm.PMTaskChecklistEvidence (",
          "  TaskId, TemplateChecklistItemId, FileName, ContentType, SizeBytes, Uri, StoragePath, UploadedByUserId",
          ")",
          "OUTPUT inserted.ChecklistEvidenceId AS ChecklistEvidenceId",
          "VALUES (",
          "  @taskId, @templateChecklistItemId, @fileName, @contentType, @sizeBytes, @uri, @storagePath, @uploadedByUserId",
          ")",
        ].join("\n"),
      );

    const checklistEvidenceId = inserted.recordset[0]?.ChecklistEvidenceId as string | undefined;
    if (!checklistEvidenceId) {
      res.status(500).json({ message: "Failed to create evidence" });
      return;
    }

    res.status(201).json({ id: checklistEvidenceId });
  },
);

tasksRouter.get( "/:taskId", async (req, res) => {
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
        "  t.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  t.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  au.Username AS AssignedToUsername,",
        "  au.DisplayName AS AssignedToDisplayName,",
        "  t.AssignedToRoleId AS AssignedToRoleId,",
        "  ar.Name AS AssignedToRoleName,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
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
        "  t.ForceCompleted AS ForceCompleted",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users au ON au.UserId = t.AssignedToUserId",
        "LEFT JOIN pm.Roles ar ON ar.RoleId = t.AssignedToRoleId",
        "LEFT JOIN pm.Users cu ON cu.UserId = t.CompletedByUserId",
        "LEFT JOIN pm.Users xu ON xu.UserId = t.CancelledByUserId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const taskRow = taskResult.recordset[0] as Record<string, unknown> | undefined;
  if (!taskRow) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const checklistResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .input("templateId", sql.UniqueIdentifier, taskRow.TemplateId as string)
      .query(
        [
          "SELECT",
          "  i.TemplateChecklistItemId AS TemplateChecklistItemId,",
          "  i.SortOrder AS SortOrder,",
          "  i.ItemText AS ItemText,",
          "  i.IsMandatory AS IsMandatory,",
          "  i.RequiresNotes AS RequiresNotes,",
          "  i.RequiresPassFail AS RequiresPassFail,",
          "  i.RequiresAttachment AS RequiresAttachment,",
          "  i.IsActive AS IsActive,",
        "  r.TaskChecklistResultId AS TaskChecklistResultId,",
        "  r.Outcome AS Outcome,",
        "  r.Notes AS Notes,",
        "  r.CompletedAt AS ResultCompletedAt,",
        "  r.CompletedByUserId AS ResultCompletedByUserId,",
        "  u.Username AS ResultCompletedByUsername,",
        "  u.DisplayName AS ResultCompletedByDisplayName",
        "FROM pm.PMTemplateChecklistItems i",
        "LEFT JOIN pm.PMTaskChecklistResults r",
        "  ON r.TemplateChecklistItemId = i.TemplateChecklistItemId",
        "  AND r.TaskId = @taskId",
        "LEFT JOIN pm.Users u ON u.UserId = r.CompletedByUserId",
        "WHERE i.TemplateId = @templateId",
        "ORDER BY i.SortOrder ASC",
      ].join("\n"),
    );

  const evidenceResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT",
        "  e.EvidenceId AS EvidenceId,",
        "  e.FileName AS FileName,",
        "  e.ContentType AS ContentType,",
        "  e.SizeBytes AS SizeBytes,",
        "  e.Uri AS Uri,",
        "  e.UploadedAt AS UploadedAt,",
        "  e.UploadedByUserId AS UploadedByUserId,",
        "  u.Username AS UploadedByUsername,",
        "  u.DisplayName AS UploadedByDisplayName",
        "FROM pm.PMTaskEvidence e",
        "LEFT JOIN pm.Users u ON u.UserId = e.UploadedByUserId",
        "WHERE e.TaskId = @taskId",
        "ORDER BY e.UploadedAt DESC",
      ].join("\n"),
    );

  const checklistEvidenceResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT",
        "  e.ChecklistEvidenceId AS ChecklistEvidenceId,",
        "  e.TemplateChecklistItemId AS TemplateChecklistItemId,",
        "  e.FileName AS FileName,",
        "  e.ContentType AS ContentType,",
        "  e.SizeBytes AS SizeBytes,",
        "  e.Uri AS Uri,",
        "  e.UploadedAt AS UploadedAt,",
        "  e.UploadedByUserId AS UploadedByUserId,",
        "  u.Username AS UploadedByUsername,",
        "  u.DisplayName AS UploadedByDisplayName",
        "FROM pm.PMTaskChecklistEvidence e",
        "LEFT JOIN pm.Users u ON u.UserId = e.UploadedByUserId",
        "WHERE e.TaskId = @taskId",
        "ORDER BY e.UploadedAt DESC",
      ].join("\n"),
    );

  const checklistRows = checklistResult.recordset as Array<Record<string, unknown>>;
  const evidenceRows = evidenceResult.recordset as Array<Record<string, unknown>>;
  const checklistEvidenceRows = checklistEvidenceResult.recordset as Array<Record<string, unknown>>;

  const checklistEvidenceByItemId = new Map<
    string,
    Array<{
      id: string;
      templateChecklistItemId: string;
      fileName: string | null;
      contentType: string | null;
      sizeBytes: number | null;
      uri: string;
      uploadedAt: unknown;
      uploadedBy: { userId: string; username: string | null; displayName: string | null } | null;
    }>
  >();

  for (const r of checklistEvidenceRows) {
    const id = typeof r.ChecklistEvidenceId === "string" ? r.ChecklistEvidenceId : null;
    const itemId = typeof r.TemplateChecklistItemId === "string" ? r.TemplateChecklistItemId : null;
    const uri = typeof r.Uri === "string" ? r.Uri : null;
    if (!id || !itemId || !uri) continue;
    const next = {
      id,
      templateChecklistItemId: itemId,
      fileName: typeof r.FileName === "string" ? r.FileName : null,
      contentType: typeof r.ContentType === "string" ? r.ContentType : null,
      sizeBytes: typeof r.SizeBytes === "number" ? r.SizeBytes : r.SizeBytes ? Number(r.SizeBytes) : null,
      uri,
      uploadedAt: r.UploadedAt,
      uploadedBy:
        typeof r.UploadedByUserId === "string"
          ? {
              userId: r.UploadedByUserId,
              username: typeof r.UploadedByUsername === "string" ? r.UploadedByUsername : null,
              displayName: typeof r.UploadedByDisplayName === "string" ? r.UploadedByDisplayName : null,
            }
          : null,
    };
    const list = checklistEvidenceByItemId.get(itemId);
    if (list) list.push(next);
    else checklistEvidenceByItemId.set(itemId, [next]);
  }

  res.json({
    id: taskRow.TaskId,
    taskNumber: taskRow.TaskNumber,
    status: taskRow.Status,
    priority: taskRow.Priority,
    scheduledDueAt: taskRow.ScheduledDueAt,
    createdAt: taskRow.CreatedAt,
    startedAt: taskRow.StartedAt,
    completedAt: taskRow.CompletedAt,
    completedBy: taskRow.CompletedByUserId
      ? {
          userId: taskRow.CompletedByUserId,
          username: taskRow.CompletedByUsername,
          displayName: taskRow.CompletedByDisplayName,
        }
      : null,
    cancelledAt: taskRow.CancelledAt,
    cancelledBy: taskRow.CancelledByUserId
      ? {
          userId: taskRow.CancelledByUserId,
          username: taskRow.CancelledByUsername,
          displayName: taskRow.CancelledByDisplayName,
        }
      : null,
    forceCompleted: taskRow.ForceCompleted,
    asset: {
      id: taskRow.AssetId,
      assetTag: taskRow.AssetTag,
      name: taskRow.AssetName,
    },
    template: {
      id: taskRow.TemplateId,
      name: taskRow.TemplateName,
    },
    assignedTo: {
      userId: taskRow.AssignedToUserId,
      username: taskRow.AssignedToUsername,
      displayName: taskRow.AssignedToDisplayName,
      roleId: taskRow.AssignedToRoleId,
      roleName: taskRow.AssignedToRoleName,
    },
    checklistItems: checklistRows.map((r) => {
      const requiresPassFail = bitToBoolean(r.RequiresPassFail);
      const rawOutcome = Number(r.Outcome);
      const normalizedOutcome: 0 | 1 | 2 = requiresPassFail
        ? rawOutcome === 1
          ? 1
          : rawOutcome === 2
            ? 2
            : 0
        : rawOutcome === 1 || rawOutcome === 2
          ? 1
          : 0;

      return {
        id: r.TemplateChecklistItemId,
        sortOrder: r.SortOrder,
        itemText: r.ItemText,
        isMandatory: r.IsMandatory,
        requiresNotes: r.RequiresNotes,
        requiresPassFail: r.RequiresPassFail,
        requiresAttachment: r.RequiresAttachment,
        isActive: r.IsActive,
        evidence: checklistEvidenceByItemId.get(String(r.TemplateChecklistItemId)) ?? [],
        result: r.TaskChecklistResultId
          ? {
              id: r.TaskChecklistResultId,
              outcome: normalizedOutcome,
              outcomeLabel: outcomeLabelFor(requiresPassFail, normalizedOutcome),
              notes: r.Notes,
              completedAt: r.ResultCompletedAt,
              completedBy: r.ResultCompletedByUserId
                ? {
                    userId: r.ResultCompletedByUserId,
                    username: r.ResultCompletedByUsername,
                    displayName: r.ResultCompletedByDisplayName,
                  }
                : null,
            }
          : null,
      };
    }),
    evidence: evidenceRows.map((r) => ({
      id: r.EvidenceId,
      fileName: r.FileName,
      contentType: r.ContentType,
      sizeBytes: r.SizeBytes,
      uri: r.Uri,
      uploadedAt: r.UploadedAt,
      uploadedBy: r.UploadedByUserId
        ? {
            userId: r.UploadedByUserId,
            username: r.UploadedByUsername,
            displayName: r.UploadedByDisplayName,
          }
        : null,
    })),
  });
});

tasksRouter.post("/:taskId/assign", requireManager, async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = AssignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const hasAssignedToUserId = Object.prototype.hasOwnProperty.call(parsed.data, "assignedToUserId");
  const hasAssignedToRoleId = Object.prototype.hasOwnProperty.call(parsed.data, "assignedToRoleId");
  const hasPriority = Object.prototype.hasOwnProperty.call(parsed.data, "priority");
  const hasStatus = Object.prototype.hasOwnProperty.call(parsed.data, "status");

  const db = await getDb();
  const updated = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .input("hasAssignedToUserId", sql.Bit, hasAssignedToUserId ? 1 : 0)
    .input("assignedToUserId", sql.UniqueIdentifier, parsed.data.assignedToUserId ?? null)
    .input("hasAssignedToRoleId", sql.Bit, hasAssignedToRoleId ? 1 : 0)
    .input("assignedToRoleId", sql.UniqueIdentifier, parsed.data.assignedToRoleId ?? null)
    .input("hasPriority", sql.Bit, hasPriority ? 1 : 0)
    .input("priority", sql.NVarChar(16), parsed.data.priority ?? null)
    .input("hasStatus", sql.Bit, hasStatus ? 1 : 0)
    .input("status", sql.NVarChar(32), parsed.data.status ?? null)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  AssignedToUserId = CASE WHEN @hasAssignedToUserId = 1 THEN @assignedToUserId ELSE AssignedToUserId END,",
        "  AssignedToRoleId = CASE WHEN @hasAssignedToRoleId = 1 THEN @assignedToRoleId ELSE AssignedToRoleId END,",
        "  Priority = CASE WHEN @hasPriority = 1 THEN @priority ELSE Priority END,",
        "  Status = CASE WHEN @hasStatus = 1 THEN @status ELSE Status END",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

  if (updated.rowsAffected[0] === 0) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  res.json({ ok: true });
});

tasksRouter.post("/:taskId/start", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const taskAccess = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const row = taskAccess.recordset[0] as Record<string, unknown> | undefined;
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
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

  res.json({ ok: true });
});

tasksRouter.post("/:taskId/complete", async (req, res) => {
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
          "  t.AssetId AS AssetId,",
          "  t.TemplateId AS TemplateId,",
          "  t.AssignedToUserId AS AssignedToUserId,",
          "  r.Name AS AssignedToRoleName,",
          "  tpl.IntervalDays AS IntervalDays",
          "FROM pm.PMTasks t",
          "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
          "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
          "WHERE t.TaskId = @taskId",
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

      if (bitToBoolean(templateItem.RequiresAttachment) && result.outcome !== 0) {
        if (!checklistEvidenceItemIdSet.has(result.templateChecklistItemId)) {
          res.status(400).json({ message: "Invalid request" });
          await tx.rollback();
          return;
        }
      }
    }

    await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .input("completedByUserId", sql.UniqueIdentifier, req.user.sub)
      .input("forceCompleted", sql.Bit, parsed.data.forceCompleted ? 1 : 0)
      .query(
        [
          "UPDATE pm.PMTasks",
          "SET",
          "  Status = N'completed',",
          "  StartedAt = COALESCE(StartedAt, sysutcdatetime()),",
          "  CompletedAt = sysutcdatetime(),",
          "  CompletedByUserId = @completedByUserId,",
          "  ForceCompleted = @forceCompleted",
          "WHERE TaskId = @taskId",
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
        .query(
          [
            "MERGE pm.PMTaskChecklistResults WITH (HOLDLOCK) AS target",
            "USING (SELECT @taskId AS TaskId, @templateChecklistItemId AS TemplateChecklistItemId) AS source",
            "ON target.TaskId = source.TaskId AND target.TemplateChecklistItemId = source.TemplateChecklistItemId",
            "WHEN MATCHED THEN",
            "  UPDATE SET",
            "    Outcome = @outcome,",
            "    Notes = @notes,",
            "    CompletedAt = sysutcdatetime(),",
            "    CompletedByUserId = @completedByUserId",
            "WHEN NOT MATCHED THEN",
            "  INSERT (TaskId, TemplateChecklistItemId, Outcome, Notes, CompletedAt, CompletedByUserId)",
            "  VALUES (@taskId, @templateChecklistItemId, @outcome, @notes, sysutcdatetime(), @completedByUserId);",
          ].join("\n"),
        );
    }

    const intervalDays = Number(row.IntervalDays);
    await tx
      .request()
      .input("assetId", sql.UniqueIdentifier, row.AssetId as string)
      .input("intervalDays", sql.Int, Number.isFinite(intervalDays) ? intervalDays : 0)
      .query(
        [
          "UPDATE pm.AssetPMSettings",
          "SET",
          "  LastPMCompletedAt = sysutcdatetime(),",
          "  NextPMDueAt = CASE WHEN @intervalDays > 0 THEN dateadd(day, @intervalDays, sysutcdatetime()) ELSE NextPMDueAt END,",
          "  UpdatedAt = sysutcdatetime()",
          "WHERE AssetId = @assetId",
        ].join("\n"),
      );

    await tx.commit();
    res.json({ ok: true });
  } catch (err) {
    await tx.rollback().catch(() => undefined);
    throw err;
  }
});

tasksRouter.post("/:taskId/evidence", async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const parsed = EvidenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const accessResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TaskId AS TaskId,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const row = accessResult.recordset[0] as Record<string, unknown> | undefined;
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

  const inserted = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .input("fileName", sql.NVarChar(256), parsed.data.fileName ?? null)
    .input("contentType", sql.NVarChar(128), parsed.data.contentType ?? null)
    .input("sizeBytes", sql.BigInt, parsed.data.sizeBytes ?? null)
    .input("uri", sql.NVarChar(1024), parsed.data.uri)
    .input("uploadedByUserId", sql.UniqueIdentifier, req.user.sub)
    .query(
      [
        "INSERT INTO pm.PMTaskEvidence (TaskId, FileName, ContentType, SizeBytes, Uri, UploadedByUserId)",
        "OUTPUT inserted.EvidenceId AS EvidenceId",
        "VALUES (@taskId, @fileName, @contentType, @sizeBytes, @uri, @uploadedByUserId)",
      ].join("\n"),
    );

  const evidenceId = inserted.recordset[0]?.EvidenceId as string | undefined;
  if (!evidenceId) {
    res.status(500).json({ message: "Failed to create evidence" });
    return;
  }

  res.status(201).json({ id: evidenceId });
});
