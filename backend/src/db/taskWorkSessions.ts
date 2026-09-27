import sql from "mssql";

type SqlExecutor = {
  request(): sql.Request;
};

const toDateOrNull = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

export type TaskWorkSessionSummary = {
  totalSeconds: number;
  sessionCount: number;
  activeSessionStartedAt: Date | null;
};

export const getTaskWorkSessionSummary = async (input: {
  executor: SqlExecutor;
  taskId: string;
  now?: Date;
}): Promise<TaskWorkSessionSummary> => {
  const result = await input.executor
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .query(
      [
        "SELECT",
        "  TaskWorkSessionId,",
        "  StartedAt,",
        "  EndedAt",
        "FROM pm.TaskWorkSessions",
        "WHERE TaskId = @taskId",
        "ORDER BY StartedAt ASC",
      ].join("\n"),
    );

  const rows = result.recordset as Array<Record<string, unknown>>;
  const now = input.now ?? new Date();
  let totalSeconds = 0;
  let activeSessionStartedAt: Date | null = null;

  for (const row of rows) {
    const startedAt = toDateOrNull(row.StartedAt);
    if (!startedAt) continue;
    const endedAt = toDateOrNull(row.EndedAt);
    const effectiveEnd = endedAt ?? now;
    if (!endedAt && activeSessionStartedAt === null) {
      activeSessionStartedAt = startedAt;
    }
    const durationMs = effectiveEnd.getTime() - startedAt.getTime();
    if (durationMs > 0) {
      totalSeconds += Math.floor(durationMs / 1000);
    }
  }

  return {
    totalSeconds,
    sessionCount: rows.length,
    activeSessionStartedAt,
  };
};

export const ensureTaskWorkSessionStarted = async (input: {
  executor: SqlExecutor;
  taskId: string;
  userId: string;
  startedAt?: Date;
}): Promise<{ created: boolean }> => {
  const startedAt = input.startedAt ?? new Date();
  const result = await input.executor
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .input("startedAt", sql.DateTime2(0), startedAt)
    .input("userId", sql.UniqueIdentifier, input.userId)
    .query(
      [
        "IF EXISTS (SELECT 1 FROM pm.TaskWorkSessions WHERE TaskId = @taskId AND EndedAt IS NULL)",
        "BEGIN",
        "  SELECT CAST(0 AS bit) AS Created;",
        "END",
        "ELSE",
        "BEGIN",
        "  INSERT INTO pm.TaskWorkSessions (TaskId, StartedAt, StartedByUserId)",
        "  VALUES (@taskId, @startedAt, @userId);",
        "  SELECT CAST(1 AS bit) AS Created;",
        "END",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  return { created: row?.Created === true || row?.Created === 1 };
};

export const closeOpenTaskWorkSession = async (input: {
  executor: SqlExecutor;
  taskId: string;
  userId: string;
  endedAt?: Date;
}): Promise<{ closed: boolean }> => {
  const endedAt = input.endedAt ?? new Date();
  const result = await input.executor
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .input("endedAt", sql.DateTime2(0), endedAt)
    .input("userId", sql.UniqueIdentifier, input.userId)
    .query(
      [
        "UPDATE pm.TaskWorkSessions",
        "SET",
        "  EndedAt = CASE WHEN EndedAt IS NULL OR EndedAt < @endedAt THEN @endedAt ELSE EndedAt END,",
        "  EndedByUserId = CASE WHEN EndedAt IS NULL THEN @userId ELSE EndedByUserId END",
        "WHERE TaskId = @taskId",
        "  AND EndedAt IS NULL;",
        "SELECT @@ROWCOUNT AS ClosedCount;",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  return { closed: Number(row?.ClosedCount ?? 0) > 0 };
};
