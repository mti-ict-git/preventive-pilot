import sql from "mssql";

type Executor = { request(): sql.Request };

// Keep independent history and recurrence links intact instead of cascading them.
export const hasTaskDeletionReferences = async (executor: Executor, taskId: string): Promise<boolean> => {
  const result = await executor.request().input("taskId", sql.UniqueIdentifier, taskId).query([
    "/* task-deletion: references */",
    "SELECT CASE WHEN",
    "EXISTS (SELECT 1 FROM pm.PMTasks WITH (UPDLOCK, HOLDLOCK) WHERE SourceTaskId = @taskId OR RecurringFromTaskId = @taskId)",
    "OR EXISTS (SELECT 1 FROM pm.PMMissedOccurrences WITH (UPDLOCK, HOLDLOCK) WHERE SourceTaskId = @taskId)",
    "OR EXISTS (SELECT 1 FROM pm.PMSkippedOccurrences WITH (UPDLOCK, HOLDLOCK) WHERE TaskId = @taskId)",
    "OR EXISTS (SELECT 1 FROM pm.NotificationLog WITH (UPDLOCK, HOLDLOCK) WHERE TaskId = @taskId)",
    "OR EXISTS (SELECT 1 FROM pm.PMOccurrenceResolutions WITH (UPDLOCK, HOLDLOCK) WHERE OriginalTaskId = @taskId OR FulfilledByTaskId = @taskId)",
    "OR EXISTS (SELECT 1 FROM pm.PMTasks WITH (UPDLOCK,HOLDLOCK) WHERE (TaskId=@taskId AND CancelledReason LIKE N'PM[_]AUTO[_]%') OR CancelledReason=CONCAT(N'PM_AUTO_SUPERSEDED:',CONVERT(nvarchar(36),@taskId)))",
    "THEN 1 ELSE 0 END AS HasReferences",
  ].join("\n"));
  return Boolean(result.recordset[0]?.HasReferences);
};

export const deleteTaskOwnedRows = async (executor: Executor, taskId: string): Promise<void> => {
  await executor.request().input("taskId", sql.UniqueIdentifier, taskId).query([
    "/* task-deletion: owned rows */",
    "DELETE FROM pm.CMTaskEvents WHERE TaskId = @taskId;",
    "DELETE FROM pm.CMDowntimeIntervals WHERE TaskId = @taskId;",
    "DELETE FROM pm.PMTaskEvidence WHERE TaskId = @taskId;",
    "DELETE FROM pm.PMTaskChecklistEvidence WHERE TaskId = @taskId;",
    "DELETE FROM pm.PMTaskChecklistResults WHERE TaskId = @taskId;",
    "DELETE FROM pm.PMTaskChecklistSnapshots WHERE TaskId = @taskId;",
    "DELETE FROM pm.TaskDrafts WHERE TaskId = @taskId;",
    "DELETE FROM pm.TaskWorkSessions WHERE TaskId = @taskId;",
    "DELETE FROM pm.PMTasks WHERE TaskId = @taskId;",
  ].join("\n"));
};
