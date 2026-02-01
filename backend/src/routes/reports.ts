import { Router } from "express";
import { z } from "zod";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";

const MaintenanceTypeSchema = z.enum(["PM", "CM", "all"]).optional().default("PM");

const OverdueQuerySchema = z.object({
  page: z.string().optional().default("1"),
  pageSize: z.string().optional().default("50"),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  maintenanceType: MaintenanceTypeSchema,
});

const ComplianceQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  maintenanceType: MaintenanceTypeSchema,
  approvedOnly: z.string().optional(),
});

const OverdueExportQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  maintenanceType: MaintenanceTypeSchema,
});

const ComplianceExportQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  maintenanceType: MaintenanceTypeSchema,
  approvedOnly: z.string().optional(),
});

const SystemLogsExportQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  level: z.string().max(16).optional(),
  maxRows: z.string().optional(),
});

const AssetsWithoutPmExportQuerySchema = z.object({
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});

const CmMetricsQuerySchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  locationId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});

const csvEscape = (value: string): string => {
  if (value.includes("\"") || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const csvCell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return csvEscape(value.toISOString());
  if (typeof value === "number") return csvEscape(String(value));
  if (typeof value === "boolean") return csvEscape(value ? "true" : "false");
  return csvEscape(String(value));
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

type CmMetricsParams = {
  from: string;
  to: string;
  locationId: string | null;
  categoryId: string | null;
};

type CmBreakdownRow = {
  name: string;
  count: number;
};

type CmMttrRow = {
  name: string;
  seconds: number;
};

type CmMonthlyIncidentRow = {
  monthStart: string;
  incidentCount: number;
};

type CmMetricsResult = {
  from: string;
  to: string;
  breakdownByCategory: CmBreakdownRow[];
  breakdownByLocation: CmBreakdownRow[];
  breakdownByFailureCategory: CmBreakdownRow[];
  breakdownByImpactLevel: CmBreakdownRow[];
  monthlyIncidents: CmMonthlyIncidentRow[];
  mttrByCategory: CmMttrRow[];
  mttrByLocation: CmMttrRow[];
};

const loadCmMetrics = async (params: CmMetricsParams): Promise<CmMetricsResult> => {
  const db = await getDb();

  const breakdownByCategoryResult = await db
    .request()
    .input("from", sql.DateTime2(0), params.from)
    .input("to", sql.DateTime2(0), params.to)
    .input("locationId", sql.UniqueIdentifier, params.locationId)
    .input("categoryId", sql.UniqueIdentifier, params.categoryId)
    .query(
      [
        "SELECT",
        "  ISNULL(c.Name, N'Uncategorized') AS Name,",
        "  COUNT(1) AS Cnt",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND t.ReportedAt IS NOT NULL",
        "  AND t.ReportedAt >= @from",
        "  AND t.ReportedAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "GROUP BY ISNULL(c.Name, N'Uncategorized')",
        "ORDER BY ISNULL(c.Name, N'Uncategorized') ASC",
      ].join("\n"),
    );

  const breakdownByLocationResult = await db
    .request()
    .input("from", sql.DateTime2(0), params.from)
    .input("to", sql.DateTime2(0), params.to)
    .input("locationId", sql.UniqueIdentifier, params.locationId)
    .input("categoryId", sql.UniqueIdentifier, params.categoryId)
    .query(
      [
        "SELECT",
        "  ISNULL(loc.Name, N'Unassigned') AS Name,",
        "  COUNT(1) AS Cnt",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "LEFT JOIN pm.Locations loc ON loc.LocationId = COALESCE(a.LocationId, fac.LocationId)",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND t.ReportedAt IS NOT NULL",
        "  AND t.ReportedAt >= @from",
        "  AND t.ReportedAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "GROUP BY ISNULL(loc.Name, N'Unassigned')",
        "ORDER BY ISNULL(loc.Name, N'Unassigned') ASC",
      ].join("\n"),
    );

  const breakdownByFailureCategoryResult = await db
    .request()
    .input("from", sql.DateTime2(0), params.from)
    .input("to", sql.DateTime2(0), params.to)
    .input("locationId", sql.UniqueIdentifier, params.locationId)
    .input("categoryId", sql.UniqueIdentifier, params.categoryId)
    .query(
      [
        "SELECT",
        "  ISNULL(NULLIF(t.FailureCategory, N''), N'Unspecified') AS Name,",
        "  COUNT(1) AS Cnt",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND t.ReportedAt IS NOT NULL",
        "  AND t.ReportedAt >= @from",
        "  AND t.ReportedAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "GROUP BY ISNULL(NULLIF(t.FailureCategory, N''), N'Unspecified')",
        "ORDER BY ISNULL(NULLIF(t.FailureCategory, N''), N'Unspecified') ASC",
      ].join("\n"),
    );

  const breakdownByImpactLevelResult = await db
    .request()
    .input("from", sql.DateTime2(0), params.from)
    .input("to", sql.DateTime2(0), params.to)
    .input("locationId", sql.UniqueIdentifier, params.locationId)
    .input("categoryId", sql.UniqueIdentifier, params.categoryId)
    .query(
      [
        "SELECT",
        "  ISNULL(NULLIF(t.ImpactLevel, N''), N'Unspecified') AS Name,",
        "  COUNT(1) AS Cnt",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND t.ReportedAt IS NOT NULL",
        "  AND t.ReportedAt >= @from",
        "  AND t.ReportedAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "GROUP BY ISNULL(NULLIF(t.ImpactLevel, N''), N'Unspecified')",
        "ORDER BY ISNULL(NULLIF(t.ImpactLevel, N''), N'Unspecified') ASC",
      ].join("\n"),
    );

  const monthlyIncidentsResult = await db
    .request()
    .input("from", sql.DateTime2(0), params.from)
    .input("to", sql.DateTime2(0), params.to)
    .input("locationId", sql.UniqueIdentifier, params.locationId)
    .input("categoryId", sql.UniqueIdentifier, params.categoryId)
    .query(
      [
        "SELECT",
        "  DATEFROMPARTS(YEAR(t.ReportedAt), MONTH(t.ReportedAt), 1) AS MonthStart,",
        "  COUNT(1) AS IncidentCount",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND t.ReportedAt IS NOT NULL",
        "  AND t.ReportedAt >= @from",
        "  AND t.ReportedAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "GROUP BY DATEFROMPARTS(YEAR(t.ReportedAt), MONTH(t.ReportedAt), 1)",
        "ORDER BY DATEFROMPARTS(YEAR(t.ReportedAt), MONTH(t.ReportedAt), 1) ASC",
      ].join("\n"),
    );

  const mttrByCategoryResult = await db
    .request()
    .input("from", sql.DateTime2(0), params.from)
    .input("to", sql.DateTime2(0), params.to)
    .input("locationId", sql.UniqueIdentifier, params.locationId)
    .input("categoryId", sql.UniqueIdentifier, params.categoryId)
    .query(
      [
        "SELECT",
        "  ISNULL(c.Name, N'Uncategorized') AS Name,",
        "  AVG(DATEDIFF(SECOND, t.ReportedAt, t.CompletedAt)) AS AvgSeconds",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND t.ReportedAt IS NOT NULL",
        "  AND t.CompletedAt IS NOT NULL",
        "  AND t.ReportedAt >= @from",
        "  AND t.ReportedAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "GROUP BY ISNULL(c.Name, N'Uncategorized')",
        "ORDER BY ISNULL(c.Name, N'Uncategorized') ASC",
      ].join("\n"),
    );

  const mttrByLocationResult = await db
    .request()
    .input("from", sql.DateTime2(0), params.from)
    .input("to", sql.DateTime2(0), params.to)
    .input("locationId", sql.UniqueIdentifier, params.locationId)
    .input("categoryId", sql.UniqueIdentifier, params.categoryId)
    .query(
      [
        "SELECT",
        "  ISNULL(loc.Name, N'Unassigned') AS Name,",
        "  AVG(DATEDIFF(SECOND, t.ReportedAt, t.CompletedAt)) AS AvgSeconds",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "LEFT JOIN pm.Facilities fac ON fac.FacilityId = t.FacilityId",
        "LEFT JOIN pm.Locations loc ON loc.LocationId = COALESCE(a.LocationId, fac.LocationId)",
        "WHERE",
        "  t.MaintenanceType = N'CM'",
        "  AND t.ReportedAt IS NOT NULL",
        "  AND t.CompletedAt IS NOT NULL",
        "  AND t.ReportedAt >= @from",
        "  AND t.ReportedAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId OR fac.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "GROUP BY ISNULL(loc.Name, N'Unassigned')",
        "ORDER BY ISNULL(loc.Name, N'Unassigned') ASC",
      ].join("\n"),
    );

  const breakdownByCategoryRows = breakdownByCategoryResult.recordset as Array<Record<string, unknown>>;
  const breakdownByLocationRows = breakdownByLocationResult.recordset as Array<Record<string, unknown>>;
  const breakdownByFailureCategoryRows = breakdownByFailureCategoryResult.recordset as Array<Record<string, unknown>>;
  const breakdownByImpactLevelRows = breakdownByImpactLevelResult.recordset as Array<Record<string, unknown>>;
  const monthlyIncidentRows = monthlyIncidentsResult.recordset as Array<Record<string, unknown>>;
  const mttrByCategoryRows = mttrByCategoryResult.recordset as Array<Record<string, unknown>>;
  const mttrByLocationRows = mttrByLocationResult.recordset as Array<Record<string, unknown>>;

  const toBreakdownRows = (rows: Array<Record<string, unknown>>): CmBreakdownRow[] => {
    return rows.map((r) => ({
      name: String(r.Name ?? ""),
      count: Number(r.Cnt ?? 0),
    }));
  };

  const toMttrRows = (rows: Array<Record<string, unknown>>): CmMttrRow[] => {
    return rows
      .map((r) => {
        const secondsRaw = r.AvgSeconds;
        const secondsValue =
          typeof secondsRaw === "number" && Number.isFinite(secondsRaw)
            ? secondsRaw
            : secondsRaw instanceof Date
            ? 0
            : Number(secondsRaw ?? 0);
        return {
          name: String(r.Name ?? ""),
          seconds: secondsValue,
        };
      })
      .filter((row) => row.seconds > 0);
  };

  const breakdownByCategory = toBreakdownRows(breakdownByCategoryRows);
  const breakdownByLocation = toBreakdownRows(breakdownByLocationRows);
  const breakdownByFailureCategory = toBreakdownRows(breakdownByFailureCategoryRows);
  const breakdownByImpactLevel = toBreakdownRows(breakdownByImpactLevelRows);

  const monthlyIncidents: CmMonthlyIncidentRow[] = monthlyIncidentRows.map((r) => {
    const monthStartRaw = r.MonthStart;
    const monthStartValue =
      monthStartRaw instanceof Date
        ? monthStartRaw.toISOString()
        : typeof monthStartRaw === "string"
        ? monthStartRaw
        : null;
    return {
      monthStart: monthStartValue ?? "",
      incidentCount: Number(r.IncidentCount ?? 0),
    };
  });

  const mttrByCategory = toMttrRows(mttrByCategoryRows);
  const mttrByLocation = toMttrRows(mttrByLocationRows);

  return {
    from: params.from,
    to: params.to,
    breakdownByCategory,
    breakdownByLocation,
    breakdownByFailureCategory,
    breakdownByImpactLevel,
    monthlyIncidents,
    mttrByCategory,
    mttrByLocation,
  };
};

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
    .input("maintenanceType", sql.NVarChar(8), parsed.data.maintenanceType === "all" ? null : parsed.data.maintenanceType)
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
        "  AND (@maintenanceType IS NULL OR t.MaintenanceType = @maintenanceType)",
      ].join("\n"),
    );

  const list = await db
    .request()
    .input("offset", sql.Int, offset)
    .input("limit", sql.Int, pageSize)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("maintenanceType", sql.NVarChar(8), parsed.data.maintenanceType === "all" ? null : parsed.data.maintenanceType)
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
        "  AND (@maintenanceType IS NULL OR t.MaintenanceType = @maintenanceType)",
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

reportsRouter.get("/overdue/export.csv", async (req, res) => {
  const parsed = OverdueExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const list = await db
    .request()
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("maintenanceType", sql.NVarChar(8), parsed.data.maintenanceType === "all" ? null : parsed.data.maintenanceType)
    .query(
      [
        "SELECT",
        "  t.TaskNumber AS TaskNumber,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  l.Name AS LocationName,",
        "  c.Name AS CategoryName,",
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
        "  AND (@maintenanceType IS NULL OR t.MaintenanceType = @maintenanceType)",
        "ORDER BY t.ScheduledDueAt ASC",
      ].join("\n"),
    );

  const rows = list.recordset as Array<Record<string, unknown>>;
  const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `overdue-tasks_${nowIso}.csv`;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "report.export",
    entityType: "report",
    entityId: null,
    metadata: {
      report: "overdue",
      format: "csv",
      filters: parsed.data,
      rowCount: rows.length,
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const lines: string[] = [];
  lines.push("\ufeff" + [
    "Task Number",
    "Scheduled Due At",
    "Status",
    "Priority",
    "Asset Tag",
    "Asset Name",
    "Location",
    "Category",
    "Template",
  ].map(csvEscape).join(","));

  for (const r of rows) {
    lines.push(
      [
        csvCell(r.TaskNumber),
        csvCell(r.ScheduledDueAt),
        csvCell(r.Status),
        csvCell(r.Priority),
        csvCell(r.AssetTag),
        csvCell(r.AssetName),
        csvCell(r.LocationName),
        csvCell(r.CategoryName),
        csvCell(r.TemplateName),
      ].join(","),
    );
  }

  res.send(lines.join("\n"));
});

reportsRouter.get("/compliance", async (req, res) => {
  const parsed = ComplianceQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const approvedOnlyBit = parsed.data.approvedOnly === "true" ? 1 : 0;
  const result = await db
    .request()
    .input("from", sql.DateTime2(0), parsed.data.from)
    .input("to", sql.DateTime2(0), parsed.data.to)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("maintenanceType", sql.NVarChar(8), parsed.data.maintenanceType === "all" ? null : parsed.data.maintenanceType)
    .input("approvedOnly", sql.Bit, approvedOnlyBit)
    .query(
      [
        "SELECT",
        "  COUNT(1) AS TotalDue,",
        "  SUM(CASE WHEN t.CompletedAt IS NOT NULL AND t.CompletedAt <= t.ScheduledDueAt AND (@approvedOnly = 0 OR t.ApprovalStatus = N'Approved') THEN 1 ELSE 0 END) AS CompletedOnTime,",
        "  SUM(CASE WHEN t.CompletedAt IS NOT NULL AND (@approvedOnly = 0 OR t.ApprovalStatus = N'Approved') THEN 1 ELSE 0 END) AS CompletedTotal,",
        "  SUM(CASE WHEN t.CompletedAt IS NULL AND t.CancelledAt IS NULL AND t.ScheduledDueAt < sysutcdatetime() THEN 1 ELSE 0 END) AS CurrentlyOverdue",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "WHERE",
        "  t.ScheduledDueAt >= @from",
        "  AND t.ScheduledDueAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "  AND (@maintenanceType IS NULL OR t.MaintenanceType = @maintenanceType)",
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

reportsRouter.get("/compliance/export.csv", async (req, res) => {
  const parsed = ComplianceExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const approvedOnlyBit = parsed.data.approvedOnly === "true" ? 1 : 0;
  const result = await db
    .request()
    .input("from", sql.DateTime2(0), parsed.data.from)
    .input("to", sql.DateTime2(0), parsed.data.to)
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .input("maintenanceType", sql.NVarChar(8), parsed.data.maintenanceType === "all" ? null : parsed.data.maintenanceType)
    .input("approvedOnly", sql.Bit, approvedOnlyBit)
    .query(
      [
        "SELECT",
        "  COUNT(1) AS TotalDue,",
        "  SUM(CASE WHEN t.CompletedAt IS NOT NULL AND t.CompletedAt <= t.ScheduledDueAt AND (@approvedOnly = 0 OR t.ApprovalStatus = N'Approved') THEN 1 ELSE 0 END) AS CompletedOnTime,",
        "  SUM(CASE WHEN t.CompletedAt IS NOT NULL AND (@approvedOnly = 0 OR t.ApprovalStatus = N'Approved') THEN 1 ELSE 0 END) AS CompletedTotal,",
        "  SUM(CASE WHEN t.CompletedAt IS NULL AND t.CancelledAt IS NULL AND t.ScheduledDueAt < sysutcdatetime() THEN 1 ELSE 0 END) AS CurrentlyOverdue",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "WHERE",
        "  t.ScheduledDueAt >= @from",
        "  AND t.ScheduledDueAt <= @to",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "  AND (@maintenanceType IS NULL OR t.MaintenanceType = @maintenanceType)",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  const totalDue = Number(row?.TotalDue ?? 0);
  const completedOnTime = Number(row?.CompletedOnTime ?? 0);
  const completedTotal = Number(row?.CompletedTotal ?? 0);
  const currentlyOverdue = Number(row?.CurrentlyOverdue ?? 0);
  const complianceRate = totalDue > 0 ? completedOnTime / totalDue : null;

  const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `compliance-summary_${nowIso}.csv`;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "report.export",
    entityType: "report",
    entityId: null,
    metadata: {
      report: "compliance",
      format: "csv",
      filters: parsed.data,
      totals: { totalDue, completedOnTime, completedTotal, currentlyOverdue, complianceRate },
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const lines: string[] = [];
  lines.push("\ufeff" + [
    "From",
    "To",
    "Total Due",
    "Completed On Time",
    "Completed Total",
    "Currently Overdue",
    "Compliance Rate",
  ].map(csvEscape).join(","));

  lines.push(
    [
      csvCell(parsed.data.from),
      csvCell(parsed.data.to),
      csvCell(totalDue),
      csvCell(completedOnTime),
      csvCell(completedTotal),
      csvCell(currentlyOverdue),
      csvCell(complianceRate),
    ].join(","),
  );

  res.send(lines.join("\n"));
});

reportsRouter.get("/system-logs/export.csv", async (req, res) => {
  const parsed = SystemLogsExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const maxRowsRaw = parsed.data.maxRows ? Number(parsed.data.maxRows) : 5_000;
  const maxRows = Math.min(20_000, Math.max(1, Number.isFinite(maxRowsRaw) ? maxRowsRaw : 5_000));

  const db = await getDb();
  const list = await db
    .request()
    .input("from", sql.DateTime2(0), parsed.data.from)
    .input("to", sql.DateTime2(0), parsed.data.to)
    .input("level", sql.NVarChar(16), parsed.data.level ?? null)
    .input("limit", sql.Int, maxRows)
    .query(
      [
        "SELECT TOP (@limit)",
        "  SystemLogId, LogLevel, Message, Context, CreatedAt",
        "FROM pm.SystemLog",
        "WHERE",
        "  CreatedAt >= @from",
        "  AND CreatedAt <= @to",
        "  AND (@level IS NULL OR LogLevel = @level)",
        "ORDER BY CreatedAt DESC",
      ].join("\n"),
    );

  const rows = list.recordset as Array<Record<string, unknown>>;
  const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `system-logs_${nowIso}.csv`;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "report.export",
    entityType: "report",
    entityId: null,
    metadata: {
      report: "system-logs",
      format: "csv",
      filters: { from: parsed.data.from, to: parsed.data.to, level: parsed.data.level ?? null },
      rowCount: rows.length,
      maxRows,
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const lines: string[] = [];
  lines.push(
    "\ufeff" + ["Created At", "Level", "Message", "Context", "System Log Id"].map(csvEscape).join(","),
  );
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.CreatedAt),
        csvCell(r.LogLevel),
        csvCell(r.Message),
        csvCell(r.Context),
        csvCell(r.SystemLogId),
      ].join(","),
    );
  }

  res.send(lines.join("\n"));
});

reportsRouter.get("/assets-without-pm/export.csv", async (req, res) => {
  const parsed = AssetsWithoutPmExportQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const db = await getDb();
  const list = await db
    .request()
    .input("locationId", sql.UniqueIdentifier, parsed.data.locationId ?? null)
    .input("categoryId", sql.UniqueIdentifier, parsed.data.categoryId ?? null)
    .query(
      [
        "SELECT",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  a.AssetStatus AS AssetStatus,",
        "  l.Name AS LocationName,",
        "  c.Name AS CategoryName,",
        "  s.PMEnabled AS PMEnabled,",
        "  t.TemplateId AS TemplateId,",
        "  t.Name AS TemplateName",
        "FROM pm.Assets a",
        "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "LEFT JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "LEFT JOIN pm.Locations l ON l.LocationId = a.LocationId",
        "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
        "WHERE",
        "  a.IsArchived = 0",
        "  AND (@locationId IS NULL OR a.LocationId = @locationId)",
        "  AND (@categoryId IS NULL OR a.CategoryId = @categoryId)",
        "  AND (",
        "    s.AssetId IS NULL",
        "    OR s.PMEnabled = 0",
        "    OR s.DefaultTemplateId IS NULL",
        "  )",
        "ORDER BY ISNULL(l.Name, N''), a.AssetTag ASC",
      ].join("\n"),
    );

  const rows = list.recordset as Array<Record<string, unknown>>;
  const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `assets-without-pm_${nowIso}.csv`;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "report.export",
    entityType: "report",
    entityId: null,
    metadata: {
      report: "assets-without-pm",
      format: "csv",
      filters: parsed.data,
      rowCount: rows.length,
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const lines: string[] = [];
  lines.push(
    "\ufeff" + ["Asset Tag", "Asset Name", "Status", "Location", "Category", "PM Enabled", "Template"].map(csvEscape).join(","),
  );
  for (const r of rows) {
    lines.push(
      [
        csvCell(r.AssetTag),
        csvCell(r.AssetName),
        csvCell(r.AssetStatus),
        csvCell(r.LocationName),
        csvCell(r.CategoryName),
        csvCell(r.PMEnabled),
        csvCell(r.TemplateName),
      ].join(","),
    );
  }

  res.send(lines.join("\n"));
});

reportsRouter.get("/cm/metrics", async (req, res) => {
  const parsed = CmMetricsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const metrics = await loadCmMetrics({
    from: parsed.data.from,
    to: parsed.data.to,
    locationId: parsed.data.locationId ?? null,
    categoryId: parsed.data.categoryId ?? null,
  });

  res.json(metrics);
});

reportsRouter.get("/cm/metrics/export.csv", async (req, res) => {
  const parsed = CmMetricsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request" });
    return;
  }

  const metrics = await loadCmMetrics({
    from: parsed.data.from,
    to: parsed.data.to,
    locationId: parsed.data.locationId ?? null,
    categoryId: parsed.data.categoryId ?? null,
  });

  const nowIso = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `cm-metrics_${nowIso}.csv`;

  await writeAuditLog({
    actorUserId: req.user.sub,
    action: "report.export",
    entityType: "report",
    entityId: null,
    metadata: {
      report: "cm-metrics",
      format: "csv",
      filters: parsed.data,
    },
    ipAddress: typeof req.ip === "string" ? req.ip : null,
    userAgent: req.get("user-agent") ?? null,
  });

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const lines: string[] = [];
  lines.push(
    "\ufeff" +
      ["Section", "Name", "Count", "MttrSeconds", "MonthStart", "MonthlyIncidentCount"].map(csvEscape).join(","),
  );

  for (const row of metrics.breakdownByCategory) {
    lines.push([
      csvCell("breakdown-category"),
      csvCell(row.name),
      csvCell(row.count),
      csvCell(null),
      csvCell(null),
      csvCell(null),
    ].join(","));
  }

  for (const row of metrics.breakdownByLocation) {
    lines.push([
      csvCell("breakdown-location"),
      csvCell(row.name),
      csvCell(row.count),
      csvCell(null),
      csvCell(null),
      csvCell(null),
    ].join(","));
  }

  for (const row of metrics.breakdownByFailureCategory) {
    lines.push([
      csvCell("breakdown-failure-category"),
      csvCell(row.name),
      csvCell(row.count),
      csvCell(null),
      csvCell(null),
      csvCell(null),
    ].join(","));
  }

  for (const row of metrics.breakdownByImpactLevel) {
    lines.push([
      csvCell("breakdown-impact-level"),
      csvCell(row.name),
      csvCell(row.count),
      csvCell(null),
      csvCell(null),
      csvCell(null),
    ].join(","));
  }

  for (const row of metrics.mttrByCategory) {
    lines.push([
      csvCell("mttr-category"),
      csvCell(row.name),
      csvCell(null),
      csvCell(row.seconds),
      csvCell(null),
      csvCell(null),
    ].join(","));
  }

  for (const row of metrics.mttrByLocation) {
    lines.push([
      csvCell("mttr-location"),
      csvCell(row.name),
      csvCell(null),
      csvCell(row.seconds),
      csvCell(null),
      csvCell(null),
    ].join(","));
  }

  for (const row of metrics.monthlyIncidents) {
    lines.push([
      csvCell("monthly-incidents"),
      csvCell(""),
      csvCell(null),
      csvCell(null),
      csvCell(row.monthStart),
      csvCell(row.incidentCount),
    ].join(","));
  }

  res.send(lines.join("\n"));
});
