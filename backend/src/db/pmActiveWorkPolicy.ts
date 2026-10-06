import sql from "mssql";

type Executor = { request(): sql.Request };

// Both job and interactive execution use the same transaction-owned context lock.
export const lockPmContext = async (executor: Executor, contextId: string): Promise<void> => {
  await executor.request().input("contextId", sql.UniqueIdentifier, contextId).query(`
    DECLARE @resource nvarchar(255)=CONCAT(N'pm-context:',CONVERT(nvarchar(36),@contextId)), @result int;
    EXEC @result=sys.sp_getapplock @Resource=@resource,@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=15000;
    IF @result<0 THROW 51000,'PM context lock unavailable',1;`);
};

export const untouchedPmSql = (alias: string): string => `
  ${alias}.Status=N'open' AND ${alias}.StartedAt IS NULL AND ${alias}.TechnicianCompletedAt IS NULL
  AND ${alias}.CompletedAt IS NULL AND ${alias}.CancelledAt IS NULL
  AND ISNULL(${alias}.ApprovalStatus,N'None') IN(N'None',N'RevisionRequested')
  AND NOT EXISTS(SELECT 1 FROM pm.PMTaskChecklistResults WHERE TaskId=${alias}.TaskId)
  AND NOT EXISTS(SELECT 1 FROM pm.PMTaskEvidence WHERE TaskId=${alias}.TaskId)
  AND NOT EXISTS(SELECT 1 FROM pm.PMTaskChecklistEvidence WHERE TaskId=${alias}.TaskId)
  AND NOT EXISTS(SELECT 1 FROM pm.TaskWorkSessions WHERE TaskId=${alias}.TaskId)
  AND NOT EXISTS(SELECT 1 FROM pm.TaskDrafts WHERE TaskId=${alias}.TaskId)`;

export const protectedPmSql = (alias: string): string => `
  ${alias}.MaintenanceType=N'PM' AND ${alias}.Status NOT IN(N'completed',N'cancelled')
  AND ${alias}.CompletedAt IS NULL AND ${alias}.CancelledAt IS NULL
  AND ISNULL(${alias}.ApprovalStatus,N'None')<>N'Rejected'
  AND (${alias}.Status IN(N'in_progress',N'paused') OR ${alias}.StartedAt IS NOT NULL
    OR ${alias}.ApprovalStatus IN(N'PendingSupervisor',N'PendingSuperadmin')
    OR EXISTS(SELECT 1 FROM pm.PMTaskChecklistResults WHERE TaskId=${alias}.TaskId)
    OR EXISTS(SELECT 1 FROM pm.PMTaskEvidence WHERE TaskId=${alias}.TaskId)
    OR EXISTS(SELECT 1 FROM pm.PMTaskChecklistEvidence WHERE TaskId=${alias}.TaskId)
    OR EXISTS(SELECT 1 FROM pm.TaskDrafts WHERE TaskId=${alias}.TaskId)
    OR EXISTS(SELECT 1 FROM pm.TaskWorkSessions WHERE TaskId=${alias}.TaskId))`;

// Called inside the execution transaction BEFORE changing status or opening a session.
// The lock serializes competing starts and the generator; actual work is never cancelled.
export const preparePmExecution = async (executor: Executor, taskId: string): Promise<boolean> => {
  const r=await executor.request().input("taskId",sql.UniqueIdentifier,taskId).query(`
    SELECT MaintenanceType,COALESCE(AssetId,FacilityId) ContextId FROM pm.PMTasks WHERE TaskId=@taskId;`);
  const task=r.recordset[0];
  if (!task || task.MaintenanceType!=="PM") return true;
  await lockPmContext(executor,task.ContextId as string);
  const conflict=await executor.request().input("taskId",sql.UniqueIdentifier,taskId).query(`
    SELECT TOP(1) other.TaskId FROM pm.PMTasks target JOIN pm.PMTasks other
      ON (other.AssetId=target.AssetId OR other.FacilityId=target.FacilityId)
      AND other.TemplateId=target.TemplateId AND other.TaskId<>target.TaskId
    WHERE target.TaskId=@taskId AND ${protectedPmSql("other")};`);
  return !conflict.recordset[0];
};

export const supersedeUntouchedPmTasks = async (executor: Executor, taskId: string): Promise<number> => {
  const r=await executor.request().input("taskId",sql.UniqueIdentifier,taskId).query(`
    BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @lockedContext uniqueidentifier=(SELECT COALESCE(AssetId,FacilityId) FROM pm.PMTasks WHERE TaskId=@taskId);
    DECLARE @resource nvarchar(255)=CONCAT(N'pm-context:',CONVERT(nvarchar(36),@lockedContext)),@lockResult int;
    EXEC @lockResult=sys.sp_getapplock @Resource=@resource,@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=15000;
    IF @lockResult<0 THROW 51000,'PM context lock unavailable',1;
    DECLARE @changed TABLE(TaskId uniqueidentifier);
    UPDATE other SET Status=N'cancelled',CancelledAt=sysutcdatetime(),CancelledByUserId=NULL,
      CancelledReason=CONCAT(N'PM_AUTO_SUPERSEDED:',CONVERT(nvarchar(36),target.TaskId))
    OUTPUT inserted.TaskId INTO @changed
    FROM pm.PMTasks other WITH(UPDLOCK,HOLDLOCK) JOIN pm.PMTasks target WITH(HOLDLOCK)
      ON (other.AssetId=target.AssetId OR other.FacilityId=target.FacilityId)
      AND other.TemplateId=target.TemplateId AND other.TaskId<>target.TaskId
    WHERE target.TaskId=@taskId AND (${protectedPmSql("target")} OR (target.MaintenanceType=N'PM' AND ${untouchedPmSql("target")}))
      AND other.MaintenanceType=N'PM' AND ${untouchedPmSql("other")};
    INSERT pm.AuditLog(ActorUserId,Action,EntityType,EntityId,Metadata)
      SELECT NULL,N'task.cancel.auto-superseded',N'task',TaskId,
        CONCAT(N'{"supersededByTaskId":"',CONVERT(nvarchar(36),@taskId),N'","policy":"single-active-pm"}') FROM @changed;
    SELECT COUNT(*) Changed FROM @changed;
    COMMIT TRANSACTION;
    END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK TRANSACTION; THROW; END CATCH;`);
  return Number(r.recordset[0]?.Changed ?? 0);
};

export const retireMissedPmTasks = async (executor: Executor, contextId: string, templateId: string, kind: "asset" | "facility"): Promise<number> => {
  const r=await executor.request().input("contextId",sql.UniqueIdentifier,contextId)
    .input("templateId",sql.UniqueIdentifier,templateId).query(`
    BEGIN TRY
    BEGIN TRANSACTION;
    DECLARE @lockedContext uniqueidentifier=@contextId;
    DECLARE @resource nvarchar(255)=CONCAT(N'pm-context:',CONVERT(nvarchar(36),@lockedContext)),@lockResult int;
    EXEC @lockResult=sys.sp_getapplock @Resource=@resource,@LockMode=N'Exclusive',@LockOwner=N'Transaction',@LockTimeout=15000;
    IF @lockResult<0 THROW 51000,'PM context lock unavailable',1;
    DECLARE @changed TABLE(TaskId uniqueidentifier);
    UPDATE t SET Status=N'cancelled',CancelledAt=sysutcdatetime(),CancelledByUserId=NULL,
      CancelledReason=N'PM_AUTO_MISSED: unperformed occurrence retained in missed history'
    OUTPUT inserted.TaskId INTO @changed
    FROM pm.PMTasks t WITH(UPDLOCK,HOLDLOCK) WHERE t.MaintenanceType=N'PM' AND t.${kind === "asset" ? "AssetId" : "FacilityId"}=@contextId
      AND t.TemplateId=@templateId AND ${untouchedPmSql("t")}
      AND EXISTS(SELECT 1 FROM pm.PMMissedOccurrences m WHERE m.TemplateId=t.TemplateId
        AND m.${kind === "asset" ? "AssetId" : "FacilityId"}=@contextId AND m.PlannedDueAt=t.PlannedDueAt);
    INSERT pm.AuditLog(ActorUserId,Action,EntityType,EntityId,Metadata)
      SELECT NULL,N'task.cancel.auto-missed',N'task',TaskId,N'{"policy":"missed-not-completed"}' FROM @changed;
    SELECT COUNT(*) Changed FROM @changed;
    COMMIT TRANSACTION;
    END TRY BEGIN CATCH IF @@TRANCOUNT>0 ROLLBACK TRANSACTION; THROW; END CATCH;`);
  return Number(r.recordset[0]?.Changed ?? 0);
};
