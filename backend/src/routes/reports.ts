import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql";
import { requireAuth } from "../middleware/requireAuth";

const OverdueQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});

const ComplianceQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get("/overdue", async (req, res) => {
  const parsed = OverdueQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const page = Math.max(1, Number(parsed.data.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(parsed.data.pageSize) || 50));
  const offset = (page - 1) * pageSize;

  const db = await getDb();

  const summary = await db
    .request()
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .query(
      [
        "SELECT",
        "  COUNT(1) AS OverdueCount",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "WHERE",
        "  t.CompletedAt IS NULL",
        "  AND t.CancelledAt IS NULL",
        "  AND t.ScheduledDueAt < sysutcdatetime()",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
      ].join("\n"),
    );

  const list = await db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .query(
      [
        "SELECT",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  a.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  a.LocationId AS LocationId,",
        "  l.Name AS LocationName,",
        "  a.CategoryId AS CategoryId,",
        "  c.Name AS CategoryName,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Locations l ON l.LocationId = a.LocationId",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "WHERE",
        "  t.CompletedAt IS NULL",
        "  AND t.CancelledAt IS NULL",
        "  AND t.ScheduledDueAt < sysutcdatetime()",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "ORDER BY t.ScheduledDueAt ASC",
        "OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY",
      ].join("\n"),
    );

  const summaryRow = summary.recordset[0] as Record<string, unknown> | undefined;
  const overdueCount = Number(summaryRow?.OverdueCount ?? 0);

  const rows = list.recordset as Array<Record<string, unknown>>;
  res.json({
    page,
    pageSize,
    overdueCount,
    items: rows.map((r) => ({
      id: r.TaskId,
      taskNumber: r.TaskNumber,
      scheduledDueAt: r.ScheduledDueAt,
      status: r.Status,
      priority: r.Priority,
      asset: {
        id: r.AssetId,
        assetTag: r.AssetTag,
        name: r.AssetName,
        location: r.LocationId ? { id: r.LocationId, name: r.LocationName ?? null } : null,
        category: r.CategoryId ? { id: r.CategoryId, name: r.CategoryName ?? null } : null,
      },
      template: {
        id: r.TemplateId,
        name: r.TemplateName,
      },
    })),
  });
});

reportsRouter.get("/compliance", async (req, res) => {
  const parsed = ComplianceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const result = await db
    .request()
    .input("from", sql.DateTime2(0), parsed.data.from)
    .input("to", sql.DateTime2(0), parsed.data.to)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .query(
      [
        "SELECT",
        "  COUNT(1) AS TotalDue,",
        "  SUM(CASE WHEN t.CompletedAt IS NOT NULL AND t.CompletedAt <= t.ScheduledDueAt THEN 1 ELSE 0 END) AS CompletedOnTime,",
        "  SUM(CASE WHEN t.CompletedAt IS NOT NULL THEN 1 ELSE 0 END) AS CompletedTotal,",
        "  SUM(CASE WHEN t.CompletedAt IS NULL AND t.CancelledAt IS NULL AND t.ScheduledDueAt < sysutcdatetime() THEN 1 ELSE 0 END) AS CurrentlyOverdue",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "WHERE",
        "  t.ScheduledDueAt >= @from",
        "  AND t.ScheduledDueAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  const totalDue = Number(row?.TotalDue ?? 0);
  const completedOnTime = Number(row?.CompletedOnTime ?? 0);
  const completedTotal = Number(row?.CompletedTotal ?? 0);
  const currentlyOverdue = Number(row?.CurrentlyOverdue ?? 0);
  const complianceRate = totalDue > 0 ? completedOnTime / totalDue : null;

  res.json({
    from: parsed.data.from,
    to: parsed.data.to,
    totalDue,
    completedOnTime,
    completedTotal,
    currentlyOverdue,
    complianceRate,
  });
});

