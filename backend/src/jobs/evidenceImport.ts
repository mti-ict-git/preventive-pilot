import fs from "node:fs";
import path from "node:path";
import sql from "mssql";
import { env } from "../config/env.js";
import { getDb } from "../db/mssql.js";
import { writeSystemLog } from "./systemLog.js";

type DuplicateAction = "skip" | "replace";

export type EvidenceImportRunResult = {
  examined: number;
  importedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  createdTasks: number;
  replacedTasks: number;
};

export type EvidenceImportRunOptions = {
  templateId?: string | null;
  duplicateAction?: DuplicateAction;
  maxFiles?: number;
  dryRun?: boolean;
};

type ResolvedAsset = {
  assetId: string;
  name: string;
  assetTag: string | null;
  categoryName: string | null;
  defaultTemplateId: string | null;
};

const pad2 = (n: number): string => String(n).padStart(2, "0");

const toIsoDate = (d: Date): string => {
  const year = d.getUTCFullYear();
  const month = pad2(d.getUTCMonth() + 1);
  const day = pad2(d.getUTCDate());
  return `${year}-${month}-${day}`;
};

const sanitizeSegment = (value: string): string => {
  return value
    .replace(/[\\/]/g, "-")
    .replace(/[<>:"|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
};

const splitExt = (fileName: string): { base: string; ext: string } => {
  const ext = path.extname(fileName);
  return { base: ext ? fileName.slice(0, -ext.length) : fileName, ext };
};

const tryExtractDate = (fileName: string): { date: Date; matchIndex: number } | null => {
  const base = path.basename(fileName);
  const patterns: RegExp[] = [
    /(20\d{2})[-_\s]?([01]\d)[-_\s]?([0-3]\d)/,
    /(20\d{2})([01]\d)([0-3]\d)/,
  ];

  for (const re of patterns) {
    const m = re.exec(base);
    if (!m) continue;
    const year = Number(m[1]);
    const month = Number(m[2]);
    const day = Number(m[3]);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) continue;
    if (month < 1 || month > 12) continue;
    if (day < 1 || day > 31) continue;
    const date = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    if (Number.isNaN(date.getTime())) continue;
    return { date, matchIndex: m.index };
  }

  return null;
};

const extractAssetKey = (fileName: string, dateMatchIndex: number): string | null => {
  const { base } = splitExt(path.basename(fileName));
  const prefix = base.slice(0, Math.max(0, dateMatchIndex));
  const cleaned = prefix.replace(/[_-]+$/g, "").trim();
  const token = cleaned.split(/\s+/).filter(Boolean)[0] ?? "";
  const candidate = token.trim();
  return candidate.length > 0 ? candidate : null;
};

const computeQuarterFolder = (completedAtUtc: Date): { folder: string; year: number; quarter: 1 | 2 | 3 | 4 } => {
  const year = completedAtUtc.getUTCFullYear();
  const month = completedAtUtc.getUTCMonth() + 1;
  const quarter = (month <= 3 ? 1 : month <= 6 ? 2 : month <= 9 ? 3 : 4) as 1 | 2 | 3 | 4;
  return { folder: `Q${quarter} ${year}`, year, quarter };
};

const normalizeName = (value: string): string => value.replace(/[^a-zA-Z0-9]+/g, "").toUpperCase();

const scoreSimilarity = (needle: string, haystack: string): number => {
  const n = normalizeName(needle);
  const h = normalizeName(haystack);
  if (!n || !h) return 0;
  if (n === h) return 1;
  if (h.includes(n)) return Math.min(0.99, n.length / h.length + 0.2);
  const maxPrefix = Math.min(n.length, h.length);
  let prefix = 0;
  for (let i = 0; i < maxPrefix; i += 1) {
    if (n[i] !== h[i]) break;
    prefix += 1;
  }
  return prefix / Math.max(n.length, h.length);
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

const moveFile = async (srcAbs: string, destAbs: string): Promise<void> => {
  await fs.promises.mkdir(path.dirname(destAbs), { recursive: true });
  try {
    await fs.promises.rename(srcAbs, destAbs);
  } catch (err: unknown) {
    const isExdev =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      typeof (err as { code?: unknown }).code === "string" &&
      (err as { code: string }).code === "EXDEV";
    if (!isExdev) throw err;
    await fs.promises.copyFile(srcAbs, destAbs);
    await fs.promises.unlink(srcAbs);
  }
};

const listFilesRecursively = async (rootAbs: string, limit: number): Promise<string[]> => {
  const out: string[] = [];
  const stack: string[] = [rootAbs];

  while (stack.length > 0 && out.length < limit) {
    const current = stack.pop();
    if (!current) break;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (out.length >= limit) break;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }

  return out;
};

const resolveAsset = async (assetNameFromFile: string): Promise<ResolvedAsset | null> => {
  const db = await getDb();

  const exactResult = await db
    .request()
    .input("name", sql.NVarChar(256), assetNameFromFile)
    .query(
      [
        "SELECT TOP (1)",
        "  a.AssetId AS AssetId,",
        "  a.Name AS Name,",
        "  a.AssetTag AS AssetTag,",
        "  c.Name AS CategoryName,",
        "  s.DefaultTemplateId AS DefaultTemplateId",
        "FROM pm.Assets a",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "WHERE a.IsArchived = 0",
        "  AND a.Name = @name",
      ].join("\n"),
    );

  const exactRow = exactResult.recordset[0] as Record<string, unknown> | undefined;
  if (exactRow && typeof exactRow.Name === "string" && exactRow.Name === assetNameFromFile) {
    return {
      assetId: String(exactRow.AssetId),
      name: String(exactRow.Name),
      assetTag: typeof exactRow.AssetTag === "string" ? exactRow.AssetTag : null,
      categoryName: typeof exactRow.CategoryName === "string" ? exactRow.CategoryName : null,
      defaultTemplateId: typeof exactRow.DefaultTemplateId === "string" ? exactRow.DefaultTemplateId : null,
    };
  }

  const like = `%${assetNameFromFile}%`;
  const fuzzyResult = await db
    .request()
    .input("like", sql.NVarChar(256), like)
    .input("tag", sql.NVarChar(64), assetNameFromFile)
    .query(
      [
        "SELECT TOP (50)",
        "  a.AssetId AS AssetId,",
        "  a.Name AS Name,",
        "  a.AssetTag AS AssetTag,",
        "  c.Name AS CategoryName,",
        "  s.DefaultTemplateId AS DefaultTemplateId",
        "FROM pm.Assets a",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "WHERE a.IsArchived = 0",
        "  AND (a.Name LIKE @like OR a.AssetTag = @tag)",
        "ORDER BY a.Name ASC",
      ].join("\n"),
    );

  const candidates = fuzzyResult.recordset as Array<Record<string, unknown>>;
  let best: { asset: ResolvedAsset; score: number } | null = null;
  for (const c of candidates) {
    const name = typeof c.Name === "string" ? c.Name : null;
    const assetId = typeof c.AssetId === "string" ? c.AssetId : null;
    if (!name || !assetId) continue;
    const score = scoreSimilarity(assetNameFromFile, name);
    if (!best || score > best.score) {
      best = {
        score,
        asset: {
          assetId,
          name,
          assetTag: typeof c.AssetTag === "string" ? c.AssetTag : null,
          categoryName: typeof c.CategoryName === "string" ? c.CategoryName : null,
          defaultTemplateId: typeof c.DefaultTemplateId === "string" ? c.DefaultTemplateId : null,
        },
      };
    }
  }

  if (!best || best.score < 0.75) return null;
  return best.asset;
};

const deleteTaskCascade = async (tx: sql.Transaction, taskId: string): Promise<void> => {
  await tx
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "DELETE FROM pm.PMTaskEvidence WHERE TaskId = @taskId;",
        "DELETE FROM pm.PMTaskChecklistResults WHERE TaskId = @taskId;",
        "DELETE FROM pm.PMTasks WHERE TaskId = @taskId;",
      ].join("\n"),
    );
};

const ensureTaskForKey = async (input: {
  assetId: string;
  templateId: string;
  completedDate: Date;
  duplicateAction: DuplicateAction;
  tx: sql.Transaction;
  cache: Map<string, { taskId: string; skip: boolean; created: boolean; replaced: boolean }>;
}): Promise<{ taskId: string; created: boolean; replaced: boolean } | { skip: true } | { error: string }> => {
  const key = `${input.assetId}|${input.templateId}|${toIsoDate(input.completedDate)}`;
  const cached = input.cache.get(key);
  if (cached) {
    if (cached.skip) return { skip: true };
    return { taskId: cached.taskId, created: false, replaced: false };
  }

  const existingResult = await input.tx
    .request()
    .input("assetId", sql.UniqueIdentifier, input.assetId)
    .input("templateId", sql.UniqueIdentifier, input.templateId)
    .input("completedDate", sql.Date, toIsoDate(input.completedDate))
    .query(
      [
        "SELECT TOP (1) TaskId",
        "FROM pm.PMTasks",
        "WHERE AssetId = @assetId",
        "  AND TemplateId = @templateId",
        "  AND Status = N'completed'",
        "  AND CAST(CompletedAt AS date) = @completedDate",
        "ORDER BY CompletedAt DESC, CreatedAt DESC",
      ].join("\n"),
    );

  const existing = existingResult.recordset[0] as Record<string, unknown> | undefined;
  const existingTaskId = typeof existing?.TaskId === "string" ? existing.TaskId : null;

  if (existingTaskId && input.duplicateAction === "skip") {
    input.cache.set(key, { taskId: existingTaskId, skip: true, created: false, replaced: false });
    return { skip: true };
  }

  const replaced = existingTaskId !== null && input.duplicateAction === "replace";

  if (replaced) {
    await deleteTaskCascade(input.tx, existingTaskId);
  }

  const taskNumber = `PM-BACKDATE-${toIsoDate(input.completedDate).replace(/-/g, "")}-${Math.random().toString(16).slice(2, 10)}`;

  const insertResult = await input.tx
    .request()
    .input("taskNumber", sql.NVarChar(32), taskNumber.slice(0, 32))
    .input("assetId", sql.UniqueIdentifier, input.assetId)
    .input("templateId", sql.UniqueIdentifier, input.templateId)
    .input("completedAt", sql.DateTime2(0), input.completedDate)
    .query(
      [
        "INSERT INTO pm.PMTasks (",
        "  TaskNumber, AssetId, TemplateId, ScheduledDueAt, Status,",
        "  StartedAt, CompletedAt, CompletedByUserId, ForceCompleted",
        ")",
        "OUTPUT inserted.TaskId AS TaskId",
        "VALUES (",
        "  @taskNumber, @assetId, @templateId, @completedAt, N'completed',",
        "  @completedAt, @completedAt, NULL, CAST(1 AS bit)",
        ")",
      ].join("\n"),
    );

  const row = insertResult.recordset[0] as Record<string, unknown> | undefined;
  const taskId = typeof row?.TaskId === "string" ? row.TaskId : null;
  if (!taskId) return { error: "Failed to create task" };

  input.cache.set(key, { taskId, skip: false, created: true, replaced });
  return { taskId, created: true, replaced };
};

export const runEvidenceImportJob = async (options?: EvidenceImportRunOptions): Promise<EvidenceImportRunResult> => {
  const startedAt = Date.now();
  await writeSystemLog({ level: "info", message: "Evidence import started", context: { job: "evidence-import" } });

  if (!env.EVIDENCE_IMPORT_ROOT || !env.EVIDENCE_STORAGE_ROOT) {
    const result: EvidenceImportRunResult = {
      examined: 0,
      importedFiles: 0,
      skippedFiles: 0,
      errorFiles: 0,
      createdTasks: 0,
      replacedTasks: 0,
    };
    await writeSystemLog({
      level: "warn",
      message: "Evidence import skipped (not configured)",
      context: { job: "evidence-import", hasImportRoot: Boolean(env.EVIDENCE_IMPORT_ROOT), hasStorageRoot: Boolean(env.EVIDENCE_STORAGE_ROOT) },
    });
    return result;
  }

  const duplicateAction: DuplicateAction = options?.duplicateAction ?? "skip";
  const requestedMaxFiles = options?.maxFiles;
  const maxFiles =
    typeof requestedMaxFiles === "number" && Number.isFinite(requestedMaxFiles)
      ? Math.max(1, Math.min(20000, Math.floor(requestedMaxFiles)))
      : env.EVIDENCE_IMPORT_MAX_FILES;
  const dryRun = options?.dryRun === true;
  const importRoot = path.resolve(env.EVIDENCE_IMPORT_ROOT);
  const storageRoot = path.resolve(env.EVIDENCE_STORAGE_ROOT);
  const requestedTemplateId = options?.templateId ?? null;

  const files = await listFilesRecursively(importRoot, maxFiles);
  const db = await getDb();

  let examined = 0;
  let importedFiles = 0;
  let skippedFiles = 0;
  let errorFiles = 0;
  let createdTasks = 0;
  let replacedTasks = 0;

  const taskCache = new Map<string, { taskId: string; skip: boolean; created: boolean; replaced: boolean }>();

  for (const fileAbs of files) {
    examined += 1;

    const dateInfo = tryExtractDate(path.basename(fileAbs));
    if (!dateInfo) {
      skippedFiles += 1;
      continue;
    }

    const assetKey = extractAssetKey(path.basename(fileAbs), dateInfo.matchIndex);
    if (!assetKey) {
      skippedFiles += 1;
      continue;
    }

    const asset = await resolveAsset(assetKey);
    if (!asset) {
      skippedFiles += 1;
      continue;
    }

    const templateId = requestedTemplateId ?? asset.defaultTemplateId;
    if (!templateId) {
      skippedFiles += 1;
      continue;
    }

    const { folder } = computeQuarterFolder(dateInfo.date);
    const categoryFolder = sanitizeSegment(asset.categoryName ?? "Uncategorized");
    const tag = sanitizeSegment(asset.assetTag ?? "no-tag");
    const assetFolder = sanitizeSegment(`${asset.name} (${tag})`);
    const fileName = sanitizeSegment(path.basename(fileAbs));

    const destAbsInitial = path.join(storageRoot, folder, categoryFolder, assetFolder, fileName);
    const destAbs = await resolveUniqueDestPath(destAbsInitial);
    const storageRel = path.relative(storageRoot, destAbs);
    if (storageRel.startsWith("..")) {
      errorFiles += 1;
      continue;
    }

    if (dryRun) {
      importedFiles += 1;
      continue;
    }

    let st: fs.Stats;
    try {
      st = await fs.promises.stat(fileAbs);
    } catch {
      errorFiles += 1;
      continue;
    }

    if (!st.isFile()) {
      skippedFiles += 1;
      continue;
    }

    try {
      await moveFile(fileAbs, destAbs);
    } catch {
      errorFiles += 1;
      continue;
    }

    const key = `${asset.assetId}|${templateId}|${toIsoDate(dateInfo.date)}`;
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      const ensured = await ensureTaskForKey({
        assetId: asset.assetId,
        templateId,
        completedDate: dateInfo.date,
        duplicateAction,
        tx,
        cache: taskCache,
      });

      if ("skip" in ensured) {
        await tx.rollback();
        skippedFiles += 1;
        try {
          await moveFile(destAbs, fileAbs);
        } catch {
          await writeSystemLog({
            level: "error",
            message: "Failed to revert file move after skip",
            context: { job: "evidence-import", file: destAbs },
          });
        }
        continue;
      }

      if ("error" in ensured) {
        await tx.rollback();
        errorFiles += 1;
        try {
          await moveFile(destAbs, fileAbs);
        } catch {
          await writeSystemLog({
            level: "error",
            message: "Failed to revert file move after error",
            context: { job: "evidence-import", file: destAbs, error: ensured.error },
          });
        }
        continue;
      }

      const taskId = ensured.taskId;

      if (ensured.created) createdTasks += 1;
      if (ensured.replaced) replacedTasks += 1;

      await tx
        .request()
        .input("taskId", sql.UniqueIdentifier, taskId)
        .input("fileName", sql.NVarChar(256), path.basename(destAbs))
        .input("sizeBytes", sql.BigInt, st.size)
        .input("uri", sql.NVarChar(1024), "imported")
        .input("storagePath", sql.NVarChar(1024), storageRel)
        .input("uploadedAt", sql.DateTime2(0), dateInfo.date)
        .query(
          [
            "INSERT INTO pm.PMTaskEvidence (",
            "  TaskId, FileName, ContentType, SizeBytes, Uri, StoragePath, UploadedAt, UploadedByUserId",
            ")",
            "VALUES (",
            "  @taskId, @fileName, NULL, @sizeBytes, @uri, @storagePath, @uploadedAt, NULL",
            ")",
          ].join("\n"),
        );

      await tx.commit();
      importedFiles += 1;
    } catch (err: unknown) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      errorFiles += 1;
      const message = err instanceof Error ? err.message : "Unknown error";
      await writeSystemLog({
        level: "error",
        message: "Evidence import failed for file",
        context: { job: "evidence-import", file: destAbs, error: message },
      });
      try {
        await moveFile(destAbs, fileAbs);
      } catch {
        await writeSystemLog({
          level: "error",
          message: "Failed to revert file move after exception",
          context: { job: "evidence-import", file: destAbs },
        });
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  await writeSystemLog({
    level: "info",
    message: "Evidence import completed",
    context: {
      job: "evidence-import",
      examined,
      importedFiles,
      skippedFiles,
      errorFiles,
      createdTasks,
      replacedTasks,
      durationMs,
    },
  });

  return {
    examined,
    importedFiles,
    skippedFiles,
    errorFiles,
    createdTasks,
    replacedTasks,
  };
};
