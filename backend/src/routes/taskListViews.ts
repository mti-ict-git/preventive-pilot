// Task-list facets share predicates so badges and paginated rows cannot drift.
export const taskViews = ["all", "due_today", "overdue", "in_progress", "upcoming", "paused", "completed", "cancelled", "pending_supervisor", "pending_superadmin"] as const;
export const actionableTaskSql = "t.Status NOT IN (N'completed', N'cancelled') AND COALESCE(t.ApprovalStatus, N'None') NOT IN (N'PendingSupervisor', N'PendingSuperadmin', N'Approved')";
export const taskViewPredicates: Record<(typeof taskViews)[number], string> = {
  all: "1=1",
  due_today: `(${actionableTaskSql}) AND t.ScheduledDueAt >= @todayStart AND t.ScheduledDueAt < @todayEnd`,
  overdue: `(${actionableTaskSql}) AND t.ScheduledDueAt < @now`,
  in_progress: `(${actionableTaskSql}) AND t.Status = N'in_progress'`,
  upcoming: `(${actionableTaskSql}) AND t.ScheduledDueAt >= @todayEnd`,
  paused: `(${actionableTaskSql}) AND t.Status = N'paused'`,
  completed: "t.Status = N'completed' AND COALESCE(t.ApprovalStatus, N'None') NOT IN (N'PendingSupervisor', N'PendingSuperadmin')",
  cancelled: "t.Status = N'cancelled'",
  pending_supervisor: "t.Status <> N'cancelled' AND t.ApprovalStatus = N'PendingSupervisor'",
  pending_superadmin: "t.Status <> N'cancelled' AND t.ApprovalStatus = N'PendingSuperadmin'",
};
export const taskViewFilterSql = (parameter: string): string => `(${taskViews.map(view => `(${parameter} = N'${view}' AND (${taskViewPredicates[view]}))`).join(" OR ")})`;
export const taskDisplayStatusSql = `CASE
 WHEN t.Status = N'cancelled' THEN N'cancelled'
 WHEN t.ApprovalStatus = N'PendingSupervisor' THEN N'pending_supervisor'
 WHEN t.ApprovalStatus = N'PendingSuperadmin' THEN N'pending_superadmin'
 WHEN t.Status IN (N'completed', N'in_progress', N'paused') THEN t.Status
 WHEN t.ScheduledDueAt >= @todayStart AND t.ScheduledDueAt < @todayEnd THEN N'due_today'
 WHEN t.ScheduledDueAt < @now THEN N'overdue'
 ELSE N'upcoming' END`;
