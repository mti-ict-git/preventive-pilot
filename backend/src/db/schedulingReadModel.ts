export type SchedulingBucket = "scheduled" | "due" | "overdue" | "pending" | "completed" | "completed-late";
export const schedulingBuckets: readonly string[] = ["scheduled", "due", "overdue", "pending", "completed", "completed-late"];
// Persisted execution and projected work share one predicate for both read surfaces.
export const schedulingReadSql = (mode: "day" | "calendar"): string => {
  const projections = (["asset", "facility"] as const).map(kind => {
    const asset = kind === "asset";
    const master = asset ? "Assets" : "Facilities";
    const key = asset ? "AssetId" : "FacilityId";
    const settings = asset ? "AssetPMSettings" : "FacilityPMSettings";
    const schedules = asset ? "PMSchedules" : "FacilityPMSchedules";
    return `SELECT CONCAT(N'projected-', CONVERT(nvarchar(36), a.${key})) TaskId, N'Projected PM' TaskNumber,
      COALESCE(s.NextPMDueAt, s.NextPlannedPMDueAt) ScheduledDueAt, N'scheduled' Status, N'normal' Priority,
      a.${key} AssetId, ${asset ? "COALESCE(a.AssetTag,N'')" : "N''"} AssetTag, a.Name AssetName,
      tpl.TemplateId, tpl.Name TemplateName, ${asset ? "a.AssetOperationalStatus" : "CAST(NULL AS nvarchar(32))"} AssetOperationalStatus,
      COALESCE(sch.Frozen,0) ScheduleFrozen, COALESCE(tpl.EstimatedDurationMinutes,60) EstimatedMinutes,
      CAST(NULL AS datetime2) CompletedAt, CAST(NULL AS nvarchar(32)) ReplacedTaskNumber, N'None' ApprovalStatus
    FROM pm.${master} a JOIN pm.${settings} s ON s.${key}=a.${key}
    JOIN pm.PMTemplates tpl ON tpl.TemplateId=s.DefaultTemplateId
    LEFT JOIN pm.${schedules} sch ON sch.${key}=a.${key} AND sch.TemplateId=tpl.TemplateId
    WHERE ${asset ? "a.IsArchived=0 AND (a.AssetOperationalStatus IS NULL OR a.AssetOperationalStatus NOT IN (N'broken',N'archived'))" : "a.IsActive=1"}
      AND a.LocationId IS NOT NULL AND s.PMEnabled=1 AND tpl.IsActive=1 AND COALESCE(sch.Frozen,0)=0
      ${asset ? "AND (tpl.ApplicableCategoryId IS NULL OR tpl.ApplicableCategoryId=a.CategoryId)" : ""}
      AND COALESCE(s.NextPMDueAt,s.NextPlannedPMDueAt)>=@from AND COALESCE(s.NextPMDueAt,s.NextPlannedPMDueAt)<@to
      AND NOT EXISTS (SELECT 1 FROM pm.PMTasks t2 LEFT JOIN pm.PMOccurrenceResolutions r2 ON r2.FulfilledByTaskId=t2.TaskId
        WHERE t2.${key}=a.${key} AND t2.TemplateId=tpl.TemplateId AND t2.MaintenanceType=N'PM'
          AND (COALESCE(r2.EffectiveDueAt,t2.ScheduledDueAt)=COALESCE(s.NextPMDueAt,s.NextPlannedPMDueAt)
            AND t2.Status<>N'cancelled' OR t2.Status NOT IN(N'cancelled',N'completed')
            AND t2.CompletedAt IS NULL AND t2.CancelledAt IS NULL AND ISNULL(t2.ApprovalStatus,N'None')<>N'Rejected'))`;
  });
  const base = `DECLARE @todayStart datetime2(0)=dateadd(day,datediff(day,0,sysutcdatetime()),0);
  DECLARE @todayEnd datetime2(0)=dateadd(day,1,@todayStart);
  WITH occurrences AS (
    SELECT CONVERT(nvarchar(64),t.TaskId) TaskId,t.TaskNumber,COALESCE(r.EffectiveDueAt,covered.ScheduledDueAt,t.ScheduledDueAt) ScheduledDueAt,
      t.Status,t.Priority,COALESCE(t.AssetId,t.FacilityId) AssetId,COALESCE(a.AssetTag,N'') AssetTag,COALESCE(a.Name,f.Name) AssetName,
      tpl.TemplateId,tpl.Name TemplateName,a.AssetOperationalStatus,COALESCE(sch.Frozen,fsch.Frozen,0) ScheduleFrozen,
      CASE WHEN t.Status=N'completed' OR t.ApprovalStatus IN(N'PendingSupervisor',N'PendingSuperadmin') THEN 0 ELSE COALESCE(tpl.EstimatedDurationMinutes,60) END EstimatedMinutes,
      t.CompletedAt,COALESCE(original.TaskNumber,covered.TaskNumber) ReplacedTaskNumber,t.ApprovalStatus
    FROM pm.PMTasks t JOIN pm.PMTemplates tpl ON tpl.TemplateId=t.TemplateId
    LEFT JOIN pm.Assets a ON a.AssetId=t.AssetId LEFT JOIN pm.Facilities f ON f.FacilityId=t.FacilityId
    LEFT JOIN pm.PMSchedules sch ON sch.AssetId=t.AssetId AND sch.TemplateId=t.TemplateId
    LEFT JOIN pm.FacilityPMSchedules fsch ON fsch.FacilityId=t.FacilityId AND fsch.TemplateId=t.TemplateId
    LEFT JOIN pm.PMOccurrenceResolutions r ON r.FulfilledByTaskId=t.TaskId
    LEFT JOIN pm.PMTasks original ON original.TaskId=r.OriginalTaskId
    LEFT JOIN pm.PMTasks covered ON covered.CancelledReason=CONCAT(N'PM_AUTO_SUPERSEDED:',CONVERT(nvarchar(36),t.TaskId))
      AND covered.PlannedDueAt=t.FulfilledPlannedDueAt AND covered.TemplateId=t.TemplateId
      AND (covered.AssetId=t.AssetId OR covered.FacilityId=t.FacilityId)
    WHERE t.MaintenanceType=N'PM' AND t.Status<>N'cancelled'
      AND COALESCE(r.EffectiveDueAt,covered.ScheduledDueAt,t.ScheduledDueAt)>=@from AND COALESCE(r.EffectiveDueAt,covered.ScheduledDueAt,t.ScheduledDueAt)<@to
    UNION ALL ${projections.join(" UNION ALL ")}
  ), labelled AS (
    SELECT *,CASE WHEN ApprovalStatus IN(N'PendingSupervisor',N'PendingSuperadmin') THEN N'pending'
      WHEN Status=N'completed' AND CAST(CompletedAt AS date)>CAST(ScheduledDueAt AS date) THEN N'completed-late'
      WHEN Status=N'completed' THEN N'completed'
      WHEN ScheduledDueAt<@todayStart THEN N'overdue' WHEN ScheduledDueAt<@todayEnd THEN N'due' ELSE N'scheduled' END Bucket
    FROM occurrences
  )`;
  return base + (mode === "day" ? " SELECT * FROM labelled ORDER BY ScheduledDueAt,TaskNumber" : `
    SELECT CAST(ScheduledDueAt AS date) DueDate,Bucket,COUNT(*) Cnt,
      SUM(SUM(EstimatedMinutes)) OVER(PARTITION BY CAST(ScheduledDueAt AS date)) CapacityMinutes
    FROM labelled GROUP BY CAST(ScheduledDueAt AS date),Bucket ORDER BY DueDate,Bucket`);
};
