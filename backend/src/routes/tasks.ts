import express, { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db/mssql.js";
import { env } from "../config/env.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireAnyRole } from "../middleware/requireRole.js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const parseBoolean = (value: unknown): boolean | null => {
  if (value === undefined || value === null) return null;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  return null;
};

const preprocessDateStart = (value: unknown): Date | undefined => {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T00:00:00Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const preprocessDateEnd = (value: unknown): Date | undefined => {
  if (typeof value !== "string") return undefined;
  const s = value.trim();
  if (!s) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return new Date(`${s}T23:59:59Z`);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

const TaskListQuerySchema = z.object({
  status: z.string().max(32).optional(),
  assigned: z.enum(["me", "unassigned", "any"]).optional().default("any"),
  overdue: z.string().optional(),
  maintenanceType: z.enum(["PM", "CM", "all"]).optional(),
  assetId: z.string().uuid().optional(),
  facilityId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  dueFrom: z.preprocess(preprocessDateStart, z.date()).optional(),
  dueTo: z.preprocess(preprocessDateEnd, z.date()).optional(),
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

const BulkAssignUnassignedSchema = z
  .object({
    assignedToUserId: z.string().uuid().optional(),
    assignedToRoleId: z.string().uuid().optional(),
    dueFrom: z.preprocess(preprocessDateStart, z.date()).optional(),
    dueTo: z.preprocess(preprocessDateEnd, z.date()).optional(),
  })
  .refine(
    (v) => {
      const hasUser = typeof v.assignedToUserId === "string" && v.assignedToUserId.length > 0;
      const hasRole = typeof v.assignedToRoleId === "string" && v.assignedToRoleId.length > 0;
      return (hasUser || hasRole) && hasUser !== hasRole;
    },
    { message: "Choose exactly one assignment target" },
  );

const OutcomeSchema = z.number().int().min(0).max(2);

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

const EvidenceSchema = z.object({
  uri: z.string().min(1).max(1024),
  fileName: z.string().max(256).nullable().optional(),
  contentType: z.string().max(128).nullable().optional(),
  sizeBytes: z.number().int().nonnegative().nullable().optional(),
});

const PmNowSchema = z.object({
  assetId: z.string().uuid(),
});

const managerRoles = ["Superadmin", "Admin", "Supervisor"] as const;
const requireManager = requireAnyRole(managerRoles);

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

type InspectionChecklistRow = {
  itemText: string;
  outcomeLabel: "skip" | "pass" | "fail" | "done";
  notes: string | null;
};

const A4_POINTS = { width: 595.28, height: 841.89 } as const;

const wrapText = (input: {
  text: string;
  maxWidth: number;
  font: { widthOfTextAtSize(text: string, size: number): number };
  fontSize: number;
}): string[] => {
  const normalized = input.text.replace(/\s+/g, " ").trim();
  if (!normalized) return [""];
  const words = normalized.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (input.font.widthOfTextAtSize(next, input.fontSize) <= input.maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    current = w;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
};

const formatDateDmy = (value: Date | null): string => {
  if (!value) return "";
  const d = String(value.getUTCDate()).padStart(2, "0");
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const y = String(value.getUTCFullYear());
  return `${d}/${m}/${y}`;
};

const toDateOrNull = (value: unknown): Date | null => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  }
  return null;
};

const buildPmHistoryPdf = async (input: {
  title: string;
  name: string;
  username: string;
  date: Date | null;
  assetName: string;
  rows: InspectionChecklistRow[];
  evidenceFileNames: string[];
}): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 32;
  const headerHeight = 150;
  const footerHeight = 80;

  const colItem = 210;
  const colBaik = 35;
  const colTidak = 35;
  const colLokasi = 70;
  const colKeterangan = 120;
  const colTindak = 70;
  const tableWidth = colItem + colBaik + colTidak + colLokasi + colKeterangan + colTindak;

  const ensurePage = (): { page: ReturnType<typeof doc.addPage>; yStart: number } => {
    const page = doc.addPage([A4_POINTS.width, A4_POINTS.height]);
    return { page, yStart: A4_POINTS.height - margin };
  };

  const drawHeader = (page: ReturnType<typeof doc.addPage>) => {
    const top = A4_POINTS.height - margin;
    const left = margin;
    page.drawLine({
      start: { x: left, y: top - 40 },
      end: { x: A4_POINTS.width - margin, y: top - 40 },
      thickness: 1,
      color: rgb(0, 0, 0),
    });
    const titleSize = 14;
    const titleWidth = fontBold.widthOfTextAtSize(input.title, titleSize);
    page.drawText(input.title, {
      x: Math.max(left, (A4_POINTS.width - titleWidth) / 2),
      y: top - 65,
      size: titleSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    const fieldStartY = top - 92;
    const labelSize = 10;
    const valueSize = 10;
    const gapY = 16;
    const labelX = left;
    const colonX = left + 62;
    const valueX = left + 76;
    const lineX1 = valueX;
    const lineX2 = left + tableWidth;

    const fields: Array<{ label: string; value: string }> = [
      { label: "Nama", value: input.name },
      { label: "Tanggal", value: formatDateDmy(input.date) },
      { label: "Username", value: input.username },
      { label: "Assetname", value: input.assetName },
    ];

    fields.forEach((f, idx) => {
      const y = fieldStartY - idx * gapY;
      page.drawText(f.label, { x: labelX, y, size: labelSize, font, color: rgb(0, 0, 0) });
      page.drawText(":", { x: colonX, y, size: labelSize, font, color: rgb(0, 0, 0) });
      page.drawText(f.value, { x: valueX, y, size: valueSize, font, color: rgb(0, 0, 0) });
      page.drawLine({
        start: { x: lineX1, y: y - 2 },
        end: { x: lineX2, y: y - 2 },
        thickness: 0.75,
        color: rgb(0, 0, 0),
      });
    });
  };

  const drawTableHeader = (page: ReturnType<typeof doc.addPage>, y: number) => {
    const left = margin;
    const headerH1 = 18;
    const headerH2 = 18;
    page.drawRectangle({ x: left, y: y - headerH1, width: tableWidth, height: headerH1, color: rgb(0.15, 0.15, 0.15) });
    page.drawRectangle({ x: left, y: y - headerH1 - headerH2, width: tableWidth, height: headerH2, color: rgb(0.94, 0.94, 0.94) });

    const textY1 = y - 13;
    const textY2 = y - headerH1 - 13;
    const white = rgb(1, 1, 1);
    const black = rgb(0, 0, 0);
    const size1 = 10;
    const size2 = 9;

    page.drawText("ITEM", { x: left + 6, y: textY1, size: size1, font: fontBold, color: white });
    page.drawText("Kondisi", { x: left + colItem + 6, y: textY1, size: size1, font: fontBold, color: white });
    page.drawText("Lokasi", { x: left + colItem + colBaik + colTidak + 6, y: textY1, size: size1, font: fontBold, color: white });
    page.drawText("Keterangan", { x: left + colItem + colBaik + colTidak + colLokasi + 6, y: textY1, size: size1, font: fontBold, color: white });
    page.drawText("Tindak\nLanjut", { x: left + colItem + colBaik + colTidak + colLokasi + colKeterangan + 6, y: textY1 - 4, size: 9, font: fontBold, color: white, lineHeight: 10 });

    page.drawText("Baik", { x: left + colItem + 6, y: textY2, size: size2, font: fontBold, color: black });
    page.drawText("Tidak", { x: left + colItem + colBaik + 6, y: textY2, size: size2, font: fontBold, color: black });

    const yTop = y;
    const yBottom = y - headerH1 - headerH2;
    const xs = [
      left,
      left + colItem,
      left + colItem + colBaik,
      left + colItem + colBaik + colTidak,
      left + colItem + colBaik + colTidak + colLokasi,
      left + colItem + colBaik + colTidak + colLokasi + colKeterangan,
      left + tableWidth,
    ];
    for (const x of xs) {
      page.drawLine({ start: { x, y: yTop }, end: { x, y: yBottom }, thickness: 0.75, color: rgb(0, 0, 0) });
    }
    page.drawLine({ start: { x: left, y: yTop }, end: { x: left + tableWidth, y: yTop }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: left, y: y - headerH1 }, end: { x: left + tableWidth, y: y - headerH1 }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: left, y: yBottom }, end: { x: left + tableWidth, y: yBottom }, thickness: 0.75, color: rgb(0, 0, 0) });
    return yBottom;
  };

  const drawFooter = (page: ReturnType<typeof doc.addPage>, pageIndex: number, pageCount: number) => {
    const left = margin;
    const bottom = margin;
    const y = bottom + 24;
    page.drawLine({ start: { x: left, y: y + 40 }, end: { x: left + tableWidth, y: y + 40 }, thickness: 0.75, color: rgb(0, 0, 0) });

    const labelSize = 8;
    const valueSize = 8;
    const colW = tableWidth / 3;

    page.drawText("Document Description", { x: left + 2, y: y + 26, size: labelSize, font: fontBold });
    page.drawText("Document No.", { x: left + colW + 2, y: y + 26, size: labelSize, font: fontBold });
    page.drawText("Version", { x: left + colW * 2 + 2, y: y + 26, size: labelSize, font: fontBold });
    page.drawText("Issue Date", { x: left + colW * 2 + 60, y: y + 26, size: labelSize, font: fontBold });

    page.drawText("Form End Device PC Laptop inspection\nChecklist", { x: left + 2, y: y + 10, size: valueSize, font, lineHeight: 10 });
    page.drawText("MTI-HRM-ICT-FRM-013", { x: left + colW + 2, y: y + 10, size: valueSize, font });
    page.drawText("Rev.000", { x: left + colW * 2 + 2, y: y + 10, size: valueSize, font });
    page.drawText("13 Dec 2024", { x: left + colW * 2 + 60, y: y + 10, size: valueSize, font });
    page.drawText(`${pageIndex}/${pageCount}`, { x: left + tableWidth - 22, y: y + 10, size: valueSize, font });
  };

  const drawSignatures = (page: ReturnType<typeof doc.addPage>, yTop: number) => {
    const left = margin;
    const y = yTop;
    const blockW = tableWidth / 3;
    const labelSize = 9;
    const lineY1 = y - 40;
    const lineY2 = y - 75;
    const nameLineY = y - 98;
    const dateLineY = y - 120;

    const labels = ["Reported By:", "Reviewed By:", "Acknowledge By:"];
    labels.forEach((t, i) => {
      page.drawText(t, { x: left + blockW * i + 2, y: y - 14, size: labelSize, font: fontBold });
      page.drawLine({ start: { x: left + blockW * i + 2, y: lineY1 }, end: { x: left + blockW * (i + 1) - 2, y: lineY1 }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawText("Nama :", { x: left + blockW * i + 2, y: lineY2, size: labelSize, font });
      page.drawLine({ start: { x: left + blockW * i + 42, y: nameLineY }, end: { x: left + blockW * (i + 1) - 2, y: nameLineY }, thickness: 0.75, color: rgb(0, 0, 0) });
      page.drawText("Tgl  :", { x: left + blockW * i + 2, y: lineY2 - 22, size: labelSize, font });
      page.drawLine({ start: { x: left + blockW * i + 42, y: dateLineY }, end: { x: left + blockW * (i + 1) - 2, y: dateLineY }, thickness: 0.75, color: rgb(0, 0, 0) });
    });
    return y - 130;
  };

  const pages: Array<ReturnType<typeof doc.addPage>> = [];
  const newPage = () => {
    const { page } = ensurePage();
    pages.push(page);
    drawHeader(page);
    return page;
  };

  let page = newPage();
  let y = A4_POINTS.height - margin - headerHeight;

  y = drawTableHeader(page, y);

  const rowFontSize = 9;
  const cellPadX = 6;
  const cellPadY = 4;

  const usableBottomY = margin + footerHeight + 170;

  const drawRow = (r: InspectionChecklistRow) => {
    const left = margin;
    const itemLines = wrapText({ text: r.itemText, maxWidth: colItem - cellPadX * 2, font, fontSize: rowFontSize });
    const notesLines = wrapText({ text: r.notes ?? "", maxWidth: colKeterangan - cellPadX * 2, font, fontSize: rowFontSize });
    const neededLines = Math.max(itemLines.length, notesLines.length, 1);
    const rowH = cellPadY * 2 + neededLines * 12;

    if (y - rowH < usableBottomY) {
      page = newPage();
      y = A4_POINTS.height - margin - headerHeight;
      y = drawTableHeader(page, y);
    }

    const top = y;
    const bottom = y - rowH;
    const xs = [
      left,
      left + colItem,
      left + colItem + colBaik,
      left + colItem + colBaik + colTidak,
      left + colItem + colBaik + colTidak + colLokasi,
      left + colItem + colBaik + colTidak + colLokasi + colKeterangan,
      left + tableWidth,
    ];

    page.drawLine({ start: { x: left, y: top }, end: { x: left + tableWidth, y: top }, thickness: 0.75, color: rgb(0, 0, 0) });
    page.drawLine({ start: { x: left, y: bottom }, end: { x: left + tableWidth, y: bottom }, thickness: 0.75, color: rgb(0, 0, 0) });
    for (const x of xs) {
      page.drawLine({ start: { x, y: top }, end: { x, y: bottom }, thickness: 0.75, color: rgb(0, 0, 0) });
    }

    const textStartY = top - cellPadY - 10;
    itemLines.forEach((t, idx) => {
      page.drawText(t, { x: left + cellPadX, y: textStartY - idx * 12, size: rowFontSize, font });
    });
    notesLines.forEach((t, idx) => {
      page.drawText(t, { x: left + colItem + colBaik + colTidak + colLokasi + cellPadX, y: textStartY - idx * 12, size: rowFontSize, font });
    });

    const checkboxSize = 10;
    const checkY = top - cellPadY - 12;
    const boxY = checkY - 2;
    const baikBoxX = left + colItem + 12;
    const tidakBoxX = left + colItem + colBaik + 12;

    const drawCheck = (x: number, checked: boolean) => {
      page.drawRectangle({ x, y: boxY, width: checkboxSize, height: checkboxSize, borderColor: rgb(0, 0, 0), borderWidth: 0.75 });
      if (checked) {
        page.drawText("✓", { x: x + 2, y: boxY + 1, size: 12, font: fontBold });
      }
    };

    const isBaik = r.outcomeLabel === "pass" || r.outcomeLabel === "done";
    const isTidak = r.outcomeLabel === "fail";
    drawCheck(baikBoxX, isBaik);
    drawCheck(tidakBoxX, isTidak);

    y = bottom;
  };

  for (const r of input.rows) drawRow(r);

  if (input.evidenceFileNames.length > 0) {
    const left = margin;
    const sectionTitle = "Evidence Files";
    const titleSize = 10;
    const lineH = 12;
    const items = input.evidenceFileNames;
    const maxWidth = tableWidth;

    const lines: string[] = [];
    for (const f of items) {
      const w = wrapText({ text: f, maxWidth: maxWidth - 14, font, fontSize: 9 });
      for (const l of w) lines.push(l);
    }

    const neededH = 20 + lines.length * lineH;
    if (y - neededH < usableBottomY) {
      page = newPage();
      y = A4_POINTS.height - margin - headerHeight;
    }

    page.drawText(sectionTitle, { x: left, y: y - 14, size: titleSize, font: fontBold });
    y = y - 30;
    for (const l of lines) {
      page.drawText(l, { x: left + 12, y, size: 9, font });
      y -= lineH;
    }
  }

  if (y - 170 < margin + footerHeight) {
    page = newPage();
    y = A4_POINTS.height - margin - headerHeight;
  }
  const yAfterSign = drawSignatures(page, y);
  y = yAfterSign;

  pages.forEach((p, idx) => drawFooter(p, idx + 1, pages.length));

  return doc.save();
};

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
        "  fac.Name AS FacilityName,",
        "  a.AssetTag AS AssetTag,",
        "  c.Name AS CategoryName,",
        "  t.AssignedToUserId AS AssignedToUserId,",
        "  r.Name AS AssignedToRoleName",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  const taskNumber = typeof row?.TaskNumber === "string" ? row.TaskNumber : null;
  const templateId = typeof row?.TemplateId === "string" ? row.TemplateId : null;
  const assetName =
    typeof row?.AssetName === "string"
      ? row.AssetName
      : typeof row?.FacilityName === "string"
        ? row.FacilityName
        : null;
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

type NotificationRuleForAssignment = {
  NotificationRuleId: string;
  RuleName: string;
  EventType: string;
  ChannelId: string;
  ChannelType: string;
  MessageTemplate: string | null;
};

type TaskRowForAssignment = {
  TaskId: string;
  TaskNumber: string;
  ScheduledDueAt: Date;
  Status: string;
  Priority: string;
  AssetId: string;
  AssetTag: string | null;
  AssetName: string;
  TemplateId: string;
  TemplateName: string;
  AssignedUserId: string | null;
  AssignedUserEmail: string | null;
  AssignedUserPhone: string | null;
};

const renderNotificationTemplate = (template: string, data: Record<string, string>): string => {
  let rendered = template;
  for (const [key, value] of Object.entries(data)) {
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, "g"), value);
  }
  return rendered;
};

const enqueueTaskAssignedNotifications = async (taskId: string): Promise<void> => {
  const db = await getDb();

  const rulesResult = await db
    .request()
    .query(
      [
        "SELECT",
        "  r.NotificationRuleId AS NotificationRuleId,",
        "  r.RuleName AS RuleName,",
        "  r.EventType AS EventType,",
        "  r.ChannelId AS ChannelId,",
        "  c.ChannelType AS ChannelType,",
        "  r.MessageTemplate AS MessageTemplate",
        "FROM pm.NotificationRules r",
        "INNER JOIN pm.NotificationChannels c ON c.ChannelId = r.ChannelId",
        "WHERE r.IsActive = 1",
        "  AND c.IsActive = 1",
        "  AND r.EventType = N'task_assigned'",
      ].join("\n"),
    );

  const rules = rulesResult.recordset as NotificationRuleForAssignment[];
  if (rules.length === 0) {
    return;
  }

  const taskResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  a.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName,",
        "  u.UserId AS AssignedUserId,",
        "  u.Email AS AssignedUserEmail,",
        "  u.Phone AS AssignedUserPhone",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users u ON u.UserId = t.AssignedToUserId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const taskRow = taskResult.recordset[0] as TaskRowForAssignment | undefined;
  if (!taskRow) {
    return;
  }

  const taskNumber = taskRow.TaskNumber;
  const dueAtIso = taskRow.ScheduledDueAt.toISOString();
  const assetName = taskRow.AssetName;
  const assetTag = taskRow.AssetTag ?? "";
  const templateName = taskRow.TemplateName;
  const technicianNumber = (taskRow.AssignedUserPhone ?? "").trim();

  for (const rule of rules) {
    const template =
      rule.MessageTemplate ??
      "You have been assigned PM task {{taskNumber}} for {{assetName}} ({{templateName}}), due at {{dueAt}}.";

    const message = renderNotificationTemplate(template, {
      taskNumber,
      assetTag,
      assetName,
      templateName,
      dueAt: dueAtIso,
      technicianNumber,
    });

    const payload = JSON.stringify({
      rule: { id: rule.NotificationRuleId, name: rule.RuleName, eventType: rule.EventType },
      channel: { id: rule.ChannelId, type: rule.ChannelType },
      task: {
        id: taskRow.TaskId,
        taskNumber: taskRow.TaskNumber,
        scheduledDueAt: taskRow.ScheduledDueAt,
        status: taskRow.Status,
        priority: taskRow.Priority,
      },
      asset: { id: taskRow.AssetId, assetTag: taskRow.AssetTag, name: taskRow.AssetName },
      template: { id: taskRow.TemplateId, name: taskRow.TemplateName },
      user:
        taskRow.AssignedUserId || taskRow.AssignedUserEmail || taskRow.AssignedUserPhone
          ? {
              id: taskRow.AssignedUserId,
              email: taskRow.AssignedUserEmail,
              phone: taskRow.AssignedUserPhone,
            }
          : null,
      message,
    });

    await db
      .request()
      .input("taskId", sql.UniqueIdentifier, taskRow.TaskId)
      .input("ruleId", sql.UniqueIdentifier, rule.NotificationRuleId)
      .input("channelId", sql.UniqueIdentifier, rule.ChannelId)
      .input("status", sql.NVarChar(32), "queued")
      .input("payload", sql.NVarChar(sql.MAX), payload)
      .query(
        [
          "INSERT INTO pm.NotificationLog (TaskId, NotificationRuleId, ChannelId, Status, Payload)",
          "VALUES (@taskId, @ruleId, @channelId, @status, @payload)",
        ].join("\n"),
      );
  }
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
    .input("maintenanceType", sql.NVarChar(8), parsed.data.maintenanceType === "all" ? null : parsed.data.maintenanceType ?? null)
    .input("assetId", sql.UniqueIdentifier, parsed.data.assetId ?? null)
    .input("facilityId", sql.UniqueIdentifier, parsed.data.facilityId ?? null)
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
        "  t.FacilityId AS FacilityId,",
        "  fac.Name AS FacilityName,",
        "  loc.Name AS LocationName,",
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
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "LEFT JOIN pm.Locations loc ON loc.LocationId = COALESCE(a.LocationId, fac.LocationId)",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users au ON au.UserId = t.AssignedToUserId",
        "LEFT JOIN pm.Roles ar ON ar.RoleId = t.AssignedToRoleId",
        "WHERE",
        "  (@status IS NULL OR t.Status = @status)",
      "  AND (@maintenanceType IS NULL OR t.MaintenanceType = @maintenanceType)",
        "  AND (@assetId IS NULL OR t.AssetId = @assetId)",
        "  AND (@facilityId IS NULL OR t.FacilityId = @facilityId)",
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
      facility: r.FacilityId
        ? {
            id: r.FacilityId,
            name: r.FacilityName,
            locationName: r.LocationName ?? null,
          }
        : null,
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

tasksRouter.post("/pm-now", requireManager, async (req, res) => {
  const parsed = PmNowSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      message: "Invalid request",
      code: "VALIDATION_ERROR",
      details: [],
    });
    return;
  }

  const db = await getDb();
  const assetResult = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, parsed.data.assetId)
    .query(
      [
        "SELECT TOP (1)",
        "  a.AssetId AS AssetId,",
        "  a.AssetStatus AS AssetStatus,",
        "  a.CategoryId AS CategoryId,",
        "  a.LocationId AS LocationId,",
        "  s.PMEnabled AS PMEnabled,",
        "  s.DefaultTemplateId AS DefaultTemplateId,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.IsActive AS TemplateIsActive,",
        "  tpl.RequiredRoleId AS RequiredRoleId",
        "FROM pm.Assets a",
        "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "LEFT JOIN pm.PMTemplates tpl ON tpl.TemplateId = s.DefaultTemplateId",
        "WHERE a.AssetId = @assetId AND a.IsArchived = 0",
      ].join("\n"),
    );

  const assetRow = assetResult.recordset[0] as Record<string, unknown> | undefined;
  if (!assetRow) {
    res.status(404).json({
      message: "Not found",
      code: "NOT_FOUND",
      details: [
        {
          field: "assetId",
          issue: "Asset not found",
        },
      ],
    });
    return;
  }

  const pmEnabledValue = assetRow.PMEnabled;
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
          field: "assetId",
          issue: "PM is not enabled for this asset",
        },
      ],
    });
    return;
  }

  const templateIdValue = assetRow.DefaultTemplateId ?? assetRow.TemplateId;
  const templateId = typeof templateIdValue === "string" ? templateIdValue : null;
  const templateIsActiveValue = assetRow.TemplateIsActive;
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
          field: "assetId",
          issue: "PM template is not configured or inactive for this asset",
        },
      ],
    });
    return;
  }

  const idempotencyWindowMinutes = await loadPmNowIdempotencyWindowMinutes();
  const existingResult = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, parsed.data.assetId)
    .input("templateId", sql.UniqueIdentifier, templateId)
    .input("windowMinutes", sql.Int, idempotencyWindowMinutes)
    .query(
      [
        "DECLARE @now datetime2(0) = sysutcdatetime();",
        "SELECT TOP (1)",
        "  TaskId",
        "FROM pm.PMTasks",
        "WHERE AssetId = @assetId",
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
          field: "assetId",
          issue: "PM Now already created recently",
        },
      ],
      id: existingTaskId,
    });
    return;
  }

  const categoryIdValue = assetRow.CategoryId;
  const locationIdValue = assetRow.LocationId;
  const assetStatusValue = assetRow.AssetStatus;

  const assignmentResult = await db
    .request()
    .input("categoryId", sql.UniqueIdentifier, typeof categoryIdValue === "string" ? categoryIdValue : null)
    .input("locationId", sql.UniqueIdentifier, typeof locationIdValue === "string" ? locationIdValue : null)
    .input("assetStatus", sql.NVarChar(64), typeof assetStatusValue === "string" ? assetStatusValue : null)
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
    const requiredRoleIdValue = (assetRow as Record<string, unknown>).RequiredRoleId;
    const requiredRoleId =
      typeof requiredRoleIdValue === "string" ? requiredRoleIdValue : null;
    assignedToRoleId = requiredRoleId;
  }

  const insertResult = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, parsed.data.assetId)
    .input("templateId", sql.UniqueIdentifier, templateId)
    .input("assignedToUserId", sql.UniqueIdentifier, assignedToUserId)
    .input("assignedToRoleId", sql.UniqueIdentifier, assignedToRoleId)
    .query(
      [
        "DECLARE @now datetime2(0) = sysutcdatetime();",
        "DECLARE @taskNumber nvarchar(32) = CONCAT(",
        "  N'PM-NOW-',",
        "  FORMAT(@now, 'yyyyMMdd'),",
        "  N'-',",
        "  RIGHT(CONVERT(varchar(36), NEWID()), 8)",
        ");",
        "INSERT INTO pm.PMTasks (",
        "  TaskNumber, AssetId, TemplateId, ScheduledDueAt, AssignedToUserId, AssignedToRoleId, Status",
        ")",
        "OUTPUT inserted.TaskId AS TaskId",
        "VALUES (",
        "  @taskNumber, @assetId, @templateId, @now, @assignedToUserId, @assignedToRoleId, N'open'",
        ");",
      ].join("\n"),
    );

  const insertedRow = insertResult.recordset[0] as Record<string, unknown> | undefined;
  const taskId = typeof insertedRow?.TaskId === "string" ? insertedRow.TaskId : null;
  if (!taskId) {
    res.status(500).json({ message: "Failed to create PM Now task" });
    return;
  }

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "task.create.pm-now",
    entityType: "task",
    entityId: taskId,
    metadata: {
      assetId: parsed.data.assetId,
      templateId,
      source: "pm-now",
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.status(201).json({ id: taskId });
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
        "  t.MaintenanceType AS MaintenanceType,",
        "  t.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  t.FacilityId AS FacilityId,",
        "  fac.Name AS FacilityName,",
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
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
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
          "  i.EnableAttachment AS EnableAttachment,",
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

  const assetIdValue = (taskRow.AssetId as string | null) ?? null;
  const facilityIdValue = (taskRow.FacilityId as string | null) ?? null;
  const assetId = assetIdValue ?? facilityIdValue ?? "";
  const assetTagValue = (taskRow.AssetTag as string | null) ?? null;
  const facilityNameValue = (taskRow.FacilityName as string | null) ?? null;
  const assetNameValue = (taskRow.AssetName as string | null) ?? null;
  const assetTag = assetTagValue ?? (facilityNameValue ?? "");
  const assetName = assetNameValue ?? (facilityNameValue ?? "");

  res.json({
    id: taskRow.TaskId,
    taskNumber: taskRow.TaskNumber,
    maintenanceType: taskRow.MaintenanceType,
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
      id: assetId,
      assetTag,
      name: assetName,
    },
    facility:
      taskRow.FacilityId
        ? {
            id: taskRow.FacilityId as string,
            name: taskRow.FacilityName as string | null,
          }
        : null,
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
        enableAttachment: r.EnableAttachment,
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

tasksRouter.get("/:taskId/export.pdf", async (req, res) => {
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
        "  t.TemplateId AS TemplateId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  tpl.Name AS TemplateName,",
        "  t.CompletedAt AS CompletedAt,",
        "  t.CompletedByUserId AS CompletedByUserId,",
        "  cu.Username AS CompletedByUsername,",
        "  cu.DisplayName AS CompletedByDisplayName",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "LEFT JOIN pm.Users cu ON cu.UserId = t.CompletedByUserId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const taskRow = taskResult.recordset[0] as Record<string, unknown> | undefined;
  if (!taskRow) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const taskNumber = typeof taskRow.TaskNumber === "string" ? taskRow.TaskNumber : "";
  const assetNameRaw = typeof taskRow.AssetName === "string" ? taskRow.AssetName : "";
  const assetTag = typeof taskRow.AssetTag === "string" ? taskRow.AssetTag : null;
  const assetName = assetTag ? `${assetTag} - ${assetNameRaw}` : assetNameRaw;
  const completedAt = toDateOrNull(taskRow.CompletedAt);
  const name =
    typeof taskRow.CompletedByDisplayName === "string" && taskRow.CompletedByDisplayName.trim()
      ? taskRow.CompletedByDisplayName
      : typeof taskRow.CompletedByUsername === "string" && taskRow.CompletedByUsername.trim()
        ? taskRow.CompletedByUsername
        : "";
  const username = typeof taskRow.CompletedByUsername === "string" ? taskRow.CompletedByUsername : "";

  const checklistResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .input("templateId", sql.UniqueIdentifier, taskRow.TemplateId as string)
    .query(
      [
        "SELECT",
        "  i.SortOrder AS SortOrder,",
        "  i.ItemText AS ItemText,",
        "  i.RequiresPassFail AS RequiresPassFail,",
        "  i.IsMandatory AS IsMandatory,",
        "  r.Outcome AS Outcome,",
        "  r.Notes AS Notes",
        "FROM pm.PMTemplateChecklistItems i",
        "LEFT JOIN pm.PMTaskChecklistResults r",
        "  ON r.TemplateChecklistItemId = i.TemplateChecklistItemId",
        "  AND r.TaskId = @taskId",
        "WHERE i.TemplateId = @templateId",
        "  AND i.IsActive = 1",
        "ORDER BY i.SortOrder ASC",
      ].join("\n"),
    );

  const checklistRows = checklistResult.recordset as Array<Record<string, unknown>>;
  const rows: InspectionChecklistRow[] = checklistRows.map((r) => {
    const itemText = typeof r.ItemText === "string" ? r.ItemText : "";
    const requiresPassFail = bitToBoolean(r.RequiresPassFail);
    const rawOutcome = typeof r.Outcome === "number" ? r.Outcome : r.Outcome ? Number(r.Outcome) : 0;
    const normalizedOutcome: 0 | 1 | 2 = requiresPassFail
      ? rawOutcome === 1
        ? 1
        : rawOutcome === 2
          ? 2
          : 0
      : rawOutcome === 1 || rawOutcome === 2
        ? 1
        : 0;
    const outcomeLabel = outcomeLabelFor(requiresPassFail, normalizedOutcome);
    const notes = typeof r.Notes === "string" ? r.Notes : null;
    return { itemText, outcomeLabel, notes };
  });

  const evidenceResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT",
        "  e.FileName AS FileName",
        "FROM pm.PMTaskEvidence e",
        "WHERE e.TaskId = @taskId",
        "UNION ALL",
        "SELECT",
        "  e.FileName AS FileName",
        "FROM pm.PMTaskChecklistEvidence e",
        "WHERE e.TaskId = @taskId",
      ].join("\n"),
    );

  const evidenceRows = evidenceResult.recordset as Array<Record<string, unknown>>;
  const evidenceFileNames = Array.from(
    new Set(
      evidenceRows
        .map((r) => (typeof r.FileName === "string" ? r.FileName.trim() : ""))
        .filter((v) => v.length > 0),
    ),
  );

  const bytes = await buildPmHistoryPdf({
    title: "Form End Device PC Laptop Inspection Checklist",
    name,
    username,
    date: completedAt,
    assetName,
    rows,
    evidenceFileNames,
  });

  const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${sanitizeSegment(taskNumber || "pm-task")}_inspection_${nowIso}.pdf`;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "task.export",
    entityType: "task",
    entityId: taskId,
    metadata: {
      format: "pdf",
      taskNumber: taskNumber || null,
      checklistItemCount: rows.length,
      evidenceFileCount: evidenceFileNames.length,
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename.replace(/"/g, "")}"`);
  res.send(Buffer.from(bytes));
});

tasksRouter.delete("/:taskId", requireManager, async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();

  const storagePathsResult = await db
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
          "  t.TaskNumber AS TaskNumber,",
          "  t.AssignedToUserId AS AssignedToUserId,",
          "  r.Name AS AssignedToRoleName",
          "FROM pm.PMTasks t",
          "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
          "WHERE t.TaskId = @taskId",
        ].join("\n"),
      );

    const taskRow = taskInfoResult.recordset[0] as Record<string, unknown> | undefined;
    if (!taskRow) {
      await tx.rollback();
      res.status(404).json({ message: "Not found" });
      return;
    }

    const accessRow: TaskAccessRow = {
      AssignedToUserId: (taskRow.AssignedToUserId as string | null) ?? null,
      AssignedToRoleName: (taskRow.AssignedToRoleName as string | null) ?? null,
    };
    if (!canModifyTask(req.user.sub, req.user.roles, accessRow)) {
      await tx.rollback();
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    await tx
      .request()
      .input("taskId", sql.UniqueIdentifier, taskId)
      .query(
        [
          "DELETE FROM pm.PMTaskEvidence WHERE TaskId = @taskId;",
          "DELETE FROM pm.PMTaskChecklistEvidence WHERE TaskId = @taskId;",
          "DELETE FROM pm.PMTaskChecklistResults WHERE TaskId = @taskId;",
          "DELETE FROM pm.PMTasks WHERE TaskId = @taskId;",
        ].join("\n"),
      );

    await tx.commit();

    const assetId = typeof taskRow.AssetId === "string" ? (taskRow.AssetId as string) : null;
    const taskNumber = typeof taskRow.TaskNumber === "string" ? (taskRow.TaskNumber as string) : null;

    await writeAuditLog({
      actorUserId: req.user.sub,
      action: "task.delete",
      entityType: "task",
      entityId: taskId,
      metadata: {
        assetId,
        taskNumber,
        reason: "manual-history-delete",
      },
      ipAddress: typeof req.ip === "string" ? req.ip : null,
      userAgent: req.get("user-agent") ?? null,
    });

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
    throw err;
  }
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

  const beforeResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  AssignedToUserId,",
        "  AssignedToRoleId,",
        "  Priority,",
        "  Status",
        "FROM pm.PMTasks",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

  const beforeRow = beforeResult.recordset[0] as
    | {
        AssignedToUserId?: string | null;
        AssignedToRoleId?: string | null;
        Priority?: string | null;
        Status?: string | null;
      }
    | undefined;
  if (!beforeRow) {
    res.status(404).json({ message: "Not found" });
    return;
  }

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

  const afterResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  AssignedToUserId,",
        "  AssignedToRoleId,",
        "  Priority,",
        "  Status",
        "FROM pm.PMTasks",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

  const afterRow = afterResult.recordset[0] as
    | {
        AssignedToUserId?: string | null;
        AssignedToRoleId?: string | null;
        Priority?: string | null;
        Status?: string | null;
      }
    | undefined;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "task.assign",
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

  const assignedUserBefore = beforeRow.AssignedToUserId ?? null;
  const assignedUserAfter = afterRow?.AssignedToUserId ?? null;
  if (assignedUserAfter && assignedUserAfter !== assignedUserBefore) {
    await enqueueTaskAssignedNotifications(taskId);
  }

  res.json({ ok: true });
});

tasksRouter.post("/bulk-assign-unassigned", requireManager, async (req, res) => {
  const parsed = BulkAssignUnassignedSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const assignedToUserId = parsed.data.assignedToUserId ?? null;
  const assignedToRoleId = parsed.data.assignedToRoleId ?? null;
  const dueFrom = parsed.data.dueFrom ?? null;
  const dueTo = parsed.data.dueTo ?? null;

  const db = await getDb();
  const result = await db
    .request()
    .input("assignedToUserId", sql.UniqueIdentifier, assignedToUserId)
    .input("assignedToRoleId", sql.UniqueIdentifier, assignedToRoleId)
    .input("dueFrom", sql.DateTime2(0), dueFrom)
    .input("dueTo", sql.DateTime2(0), dueTo)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  AssignedToUserId = @assignedToUserId,",
        "  AssignedToRoleId = @assignedToRoleId",
        "WHERE",
        "  AssignedToUserId IS NULL",
        "  AND AssignedToRoleId IS NULL",
        "  AND CompletedAt IS NULL",
        "  AND CancelledAt IS NULL",
        "  AND (@dueFrom IS NULL OR ScheduledDueAt >= @dueFrom)",
        "  AND (@dueTo IS NULL OR ScheduledDueAt <= @dueTo);",
        "SELECT @@ROWCOUNT AS UpdatedCount;",
      ].join("\n"),
    );

  const row = result.recordset[0] as { UpdatedCount?: number } | undefined;
  const updatedCount = Number(row?.UpdatedCount ?? 0);

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "task.assign.bulk",
    entityType: "task",
    entityId: null,
    metadata: {
      updatedCount,
      assignedToUserId,
      assignedToRoleId,
      dueFrom,
      dueTo,
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.json({ ok: true, updatedCount });
});

tasksRouter.post("/:taskId/pause", async (req, res) => {
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
        "  Status = CASE WHEN Status IN (N'completed', N'cancelled') THEN Status ELSE N'paused' END",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

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

tasksRouter.post("/:taskId/cancel", async (req, res) => {
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
    .input("cancelledByUserId", sql.UniqueIdentifier, req.user.sub)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  Status = N'cancelled',",
        "  CancelledAt = sysutcdatetime(),",
        "  CancelledByUserId = @cancelledByUserId",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

  res.json({ ok: true });
});

tasksRouter.post("/:taskId/reopen", requireManager, async (req, res) => {
  const taskId = req.params.taskId;
  if (!z.string().uuid().safeParse(taskId).success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const statusResult = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  Status",
        "FROM pm.PMTasks",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

  const row = statusResult.recordset[0] as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "Not found" });
    return;
  }

  const status = typeof row.Status === "string" ? row.Status.toLowerCase() : null;
  if (status !== "cancelled") {
    res.status(400).json({ message: "Only cancelled tasks can be reopened" });
    return;
  }

  await db
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  Status = N'open',",
        "  CancelledAt = NULL,",
        "  CancelledByUserId = NULL",
        "WHERE TaskId = @taskId",
      ].join("\n"),
    );

  res.json({ ok: true });
});

tasksRouter.post("/:taskId/resume", async (req, res) => {
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
          "  i.EnableAttachment AS EnableAttachment,",
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
      const requiresNotes =
        bitToBoolean(templateItem.RequiresNotes) || bitToBoolean(templateItem.IsMandatory);
      if (requiresNotes && result.outcome !== 0) {
        if (!notes || notes.trim().length === 0) {
          res.status(400).json({ message: "Invalid request" });
          await tx.rollback();
          return;
        }
      }

      if (
        bitToBoolean(templateItem.EnableAttachment) &&
        bitToBoolean(templateItem.RequiresAttachment) &&
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

    const intervalDays = Number(row.IntervalDays);
    await tx
      .request()
      .input("assetId", sql.UniqueIdentifier, row.AssetId as string)
      .input("intervalDays", sql.Int, Number.isFinite(intervalDays) ? intervalDays : 0)
      .input("completedAt", sql.DateTime2(0), completedAtDate)
      .query(
        [
          "UPDATE pm.AssetPMSettings",
          "SET",
          "  LastPMCompletedAt = @completedAt,",
          "  NextPMDueAt = CASE",
          "    WHEN @intervalDays <= 0 THEN NextPMDueAt",
          "    WHEN @intervalDays = 30 THEN dateadd(month, 1, @completedAt)",
          "    WHEN @intervalDays = 90 THEN dateadd(month, 3, @completedAt)",
          "    WHEN @intervalDays = 180 THEN dateadd(month, 6, @completedAt)",
          "    WHEN @intervalDays = 365 THEN dateadd(year, 1, @completedAt)",
          "    ELSE dateadd(day, @intervalDays, @completedAt)",
          "  END,",
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
