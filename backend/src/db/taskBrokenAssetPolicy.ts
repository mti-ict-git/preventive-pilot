import sql from "mssql";

type SqlExecutor = {
  request(): sql.Request;
};

export const BROKEN_ASSET_AUTO_CANCELLATION_REASON =
  "Automatically cancelled because the asset operational status changed to broken.";

export type BrokenAssetTaskState = {
  taskId: string;
  maintenanceType: string | null;
  assetId: string | null;
  status: string | null;
  approvalStatus: string | null;
  assetOperationalStatus: string | null;
};

export const loadBrokenAssetTaskState = async (input: {
  executor: SqlExecutor;
  taskId: string;
}): Promise<BrokenAssetTaskState | null> => {
  const result = await input.executor
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.TaskId AS TaskId,",
        "  t.MaintenanceType AS MaintenanceType,",
        "  t.AssetId AS AssetId,",
        "  t.Status AS Status,",
        "  t.ApprovalStatus AS ApprovalStatus,",
        "  a.AssetOperationalStatus AS AssetOperationalStatus",
        "FROM pm.PMTasks t",
        "LEFT JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  return {
    taskId: typeof row.TaskId === "string" ? row.TaskId : input.taskId,
    maintenanceType: typeof row.MaintenanceType === "string" ? row.MaintenanceType : null,
    assetId: typeof row.AssetId === "string" ? row.AssetId : null,
    status: typeof row.Status === "string" ? row.Status : null,
    approvalStatus: typeof row.ApprovalStatus === "string" ? row.ApprovalStatus : null,
    assetOperationalStatus: typeof row.AssetOperationalStatus === "string" ? row.AssetOperationalStatus : null,
  };
};

export const isBrokenAssetTaskState = (state: BrokenAssetTaskState | null): boolean => {
  if (!state) return false;
  if (state.maintenanceType !== "PM") return false;
  if (!state.assetId) return false;
  return state.assetOperationalStatus === "broken";
};

export const cancelPmTasksForBrokenAsset = async (input: {
  executor: SqlExecutor;
  assetId: string;
  reason?: string;
}): Promise<string[]> => {
  const result = await input.executor
    .request()
    .input("assetId", sql.UniqueIdentifier, input.assetId)
    .input("reason", sql.NVarChar(1024), input.reason ?? BROKEN_ASSET_AUTO_CANCELLATION_REASON)
    .query(
      [
        "DECLARE @cancelledAt datetime2(0) = sysutcdatetime();",
        "UPDATE t",
        "SET",
        "  Status = N'cancelled',",
        "  CancelledAt = @cancelledAt,",
        "  CancelledByUserId = NULL,",
        "  CancelledReason = @reason",
        "OUTPUT inserted.TaskId AS TaskId",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "WHERE t.AssetId = @assetId",
        "  AND t.MaintenanceType = N'PM'",
        "  AND t.CompletedAt IS NULL",
        "  AND t.CancelledAt IS NULL",
        "  AND (t.Status IS NULL OR t.Status NOT IN (N'completed', N'cancelled'))",
        "  AND a.AssetOperationalStatus = N'broken';",
      ].join("\n"),
    );

  return (result.recordset as Array<Record<string, unknown>>)
    .map((row) => (typeof row.TaskId === "string" ? row.TaskId : null))
    .filter((taskId): taskId is string => taskId !== null);
};
