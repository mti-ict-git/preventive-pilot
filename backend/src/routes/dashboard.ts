import { Router } from "express";
import sql from "mssql";
import { getDb } from "../db/mssql.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/overview", async (_req, res) => {
  const db = await getDb();

  const statsResult = await db.request().query(
    [
      "SELECT",
      "  (",
      "    SELECT COUNT(1)",
      "    FROM pm.Assets a",
      "    INNER JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
      "    WHERE a.IsArchived = 0 AND s.PMEnabled = 1",
      "  ) AS TotalAssetsInPm,",
      "  (",
      "    SELECT COUNT(1)",
      "    FROM pm.PMTasks t",
      "    WHERE t.CompletedAt IS NULL",
      "      AND t.CancelledAt IS NULL",
      "      AND t.ScheduledDueAt >= dateadd(day, datediff(day, 0, sysutcdatetime()), 0)",
      "      AND t.ScheduledDueAt < dateadd(day, 1, dateadd(day, datediff(day, 0, sysutcdatetime()), 0))",
      "  ) AS DueTodayCount,",
      "  (",
      "    SELECT COUNT(1)",
      "    FROM pm.PMTasks t",
      "    WHERE t.CompletedAt IS NULL",
      "      AND t.CancelledAt IS NULL",
      "      AND t.ScheduledDueAt < sysutcdatetime()",
      "  ) AS OverdueCount,",
      "  (",
      "    SELECT COUNT(1)",
      "    FROM pm.PMTasks t",
      "    WHERE t.CompletedAt IS NULL",
      "      AND t.CancelledAt IS NULL",
      "      AND t.ScheduledDueAt >= sysutcdatetime()",
      "      AND t.ScheduledDueAt < dateadd(day, 7, sysutcdatetime())",
      "  ) AS Upcoming7DaysCount",
    ].join("\n"),
  );

  const statsRow = statsResult.recordset[0] as Record<string, unknown> | undefined;
  const totalAssetsInPm = Number(statsRow?.TotalAssetsInPm ?? 0);
  const dueTodayCount = Number(statsRow?.DueTodayCount ?? 0);
  const overdueCount = Number(statsRow?.OverdueCount ?? 0);
  const upcoming7DaysCount = Number(statsRow?.Upcoming7DaysCount ?? 0);

  const complianceTrendResult = await db.request().query(
    [
      "WITH n AS (",
      "  SELECT TOP (12) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) - 1 AS n",
      "  FROM sys.all_objects",
      "),",
      "months AS (	",
      "  SELECT",
      "    dateadd(month, datediff(month, 0, sysutcdatetime()) - n.n, 0) AS MonthStart,",
      "    dateadd(month, datediff(month, 0, sysutcdatetime()) - n.n + 1, 0) AS MonthEnd",
      "  FROM n",
      ")",
      "SELECT",
      "  m.MonthStart AS MonthStart,",
      "  m.MonthEnd AS MonthEnd,",
      "  COUNT(t.TaskId) AS TotalDue,",
      "  SUM(CASE WHEN t.CompletedAt IS NOT NULL AND t.CompletedAt <= t.ScheduledDueAt THEN 1 ELSE 0 END) AS CompletedOnTime",
      "FROM months m",
      "LEFT JOIN pm.PMTasks t",
      "  ON t.ScheduledDueAt >= m.MonthStart",
      "  AND t.ScheduledDueAt < m.MonthEnd",
      "GROUP BY m.MonthStart, m.MonthEnd",
      "ORDER BY m.MonthStart ASC",
    ].join("\n"),
  );

  const complianceTrendRows = complianceTrendResult.recordset as Array<Record<string, unknown>>;
  const complianceTrend = complianceTrendRows.map((r) => {
    const totalDue = Number(r.TotalDue ?? 0);
    const completedOnTime = Number(r.CompletedOnTime ?? 0);
    const complianceRate = totalDue > 0 ? completedOnTime / totalDue : null;
    return {
      monthStart: r.MonthStart,
      monthEnd: r.MonthEnd,
      totalDue,
      completedOnTime,
      complianceRate,
    };
  });

  const overdueByCategoryResult = await db.request().query(
    [
      "SELECT TOP (8)",
      "  ISNULL(c.Name, N'Uncategorized') AS CategoryName,",
      "  COUNT(1) AS OverdueCount",
      "FROM pm.PMTasks t",
      "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
      "LEFT JOIN pm.AssetCategories c ON c.CategoryId = a.CategoryId",
      "WHERE t.CompletedAt IS NULL",
      "  AND t.CancelledAt IS NULL",
      "  AND t.ScheduledDueAt < sysutcdatetime()",
      "GROUP BY ISNULL(c.Name, N'Uncategorized')",
      "ORDER BY COUNT(1) DESC, ISNULL(c.Name, N'Uncategorized') ASC",
    ].join("\n"),
  );

  const overdueByCategoryRows = overdueByCategoryResult.recordset as Array<Record<string, unknown>>;
  const overdueByCategory = overdueByCategoryRows.map((r) => ({
    name: String(r.CategoryName ?? "Uncategorized"),
    count: Number(r.OverdueCount ?? 0),
  }));

  const recentTasksResult = await db.request().query(
    [
      "SELECT TOP (8)",
      "  t.TaskId AS TaskId,",
      "  t.TaskNumber AS TaskNumber,",
      "  t.Status AS Status,",
      "  a.AssetTag AS AssetTag,",
      "  a.Name AS AssetName,",
      "  tpl.Name AS TemplateName,",
      "  u.DisplayName AS AssignedToDisplayName,",
      "  r.Name AS AssignedToRoleName,",
      "  t.ScheduledDueAt AS ScheduledDueAt",
      "FROM pm.PMTasks t",
      "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
      "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
      "LEFT JOIN pm.Users u ON u.UserId = t.AssignedToUserId",
      "LEFT JOIN pm.Roles r ON r.RoleId = t.AssignedToRoleId",
      "WHERE t.CancelledAt IS NULL",
      "ORDER BY t.CreatedAt DESC",
    ].join("\n"),
  );

  const recentTaskRows = recentTasksResult.recordset as Array<Record<string, unknown>>;
  const recentTasks = recentTaskRows.map((r) => ({
    id: r.TaskId,
    taskNumber: r.TaskNumber,
    status: r.Status,
    scheduledDueAt: r.ScheduledDueAt,
    asset: { assetTag: r.AssetTag, name: r.AssetName },
    template: { name: r.TemplateName },
    assignedTo: {
      displayName: (r.AssignedToDisplayName as string | null) ?? null,
      roleName: (r.AssignedToRoleName as string | null) ?? null,
    },
  }));

  res.json({
    stats: {
      totalAssetsInPm,
      upcoming7DaysCount,
      dueTodayCount,
      overdueCount,
    },
    complianceTrend,
    overdueByCategory,
    recentTasks,
  });
});
