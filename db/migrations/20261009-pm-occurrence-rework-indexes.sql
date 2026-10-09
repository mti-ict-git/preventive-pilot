-- Preserve historical cancellation/rejection and linked rework without blocking a normal occurrence.
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_AssetTemplateDue' AND (filter_definition NOT LIKE N'%SourceTaskId%' OR filter_definition NOT LIKE N'%cancelled%' OR filter_definition NOT LIKE N'%Rejected%')) DROP INDEX UQ_pm_PMTasks_AssetTemplateDue ON pm.PMTasks;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_AssetTemplateDue')
EXEC(N'CREATE UNIQUE INDEX UQ_pm_PMTasks_AssetTemplateDue ON pm.PMTasks (AssetId,TemplateId,ScheduledDueAt) WHERE AssetId IS NOT NULL AND SourceTaskId IS NULL AND Status <> N''cancelled'' AND ApprovalStatus <> N''Rejected'';');
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_AssetTemplatePlannedDue' AND (filter_definition NOT LIKE N'%SourceTaskId%' OR filter_definition NOT LIKE N'%cancelled%' OR filter_definition NOT LIKE N'%Rejected%')) DROP INDEX UQ_pm_PMTasks_AssetTemplatePlannedDue ON pm.PMTasks;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_AssetTemplatePlannedDue')
EXEC(N'CREATE UNIQUE INDEX UQ_pm_PMTasks_AssetTemplatePlannedDue ON pm.PMTasks (AssetId,TemplateId,PlannedDueAt) WHERE AssetId IS NOT NULL AND SourceTaskId IS NULL AND Status <> N''cancelled'' AND ApprovalStatus <> N''Rejected'' AND MaintenanceType = N''PM'';');
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_FacilityTemplateDue' AND (filter_definition NOT LIKE N'%SourceTaskId%' OR filter_definition NOT LIKE N'%cancelled%' OR filter_definition NOT LIKE N'%Rejected%')) DROP INDEX UQ_pm_PMTasks_FacilityTemplateDue ON pm.PMTasks;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_FacilityTemplateDue')
EXEC(N'CREATE UNIQUE INDEX UQ_pm_PMTasks_FacilityTemplateDue ON pm.PMTasks (FacilityId,TemplateId,ScheduledDueAt) WHERE FacilityId IS NOT NULL AND SourceTaskId IS NULL AND Status <> N''cancelled'' AND ApprovalStatus <> N''Rejected'';');
IF EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_FacilityTemplatePlannedDue' AND (filter_definition NOT LIKE N'%SourceTaskId%' OR filter_definition NOT LIKE N'%cancelled%' OR filter_definition NOT LIKE N'%Rejected%')) DROP INDEX UQ_pm_PMTasks_FacilityTemplatePlannedDue ON pm.PMTasks;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id=OBJECT_ID(N'pm.PMTasks') AND name=N'UQ_pm_PMTasks_FacilityTemplatePlannedDue')
EXEC(N'CREATE UNIQUE INDEX UQ_pm_PMTasks_FacilityTemplatePlannedDue ON pm.PMTasks (FacilityId,TemplateId,PlannedDueAt) WHERE FacilityId IS NOT NULL AND SourceTaskId IS NULL AND Status <> N''cancelled'' AND ApprovalStatus <> N''Rejected'' AND MaintenanceType = N''PM'';');
COMMIT TRANSACTION;
