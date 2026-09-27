import sql from "mssql";

type SqlExecutor = {
  request(): sql.Request;
};

export type PmContextKind = "asset" | "facility";

export type PmScheduleContext = {
  kind: PmContextKind;
  contextId: string;
  templateId: string;
  intervalDays: number;
  pmEnabled: boolean;
  templateIsActive: boolean;
  isContextActive: boolean;
  nextPlannedDueAt: Date | null;
  nextDueAt: Date | null;
  lastPmCompletedAt: Date | null;
  categoryId: string | null;
  locationId: string | null;
  assetStatus: string | null;
  requiredRoleId: string | null;
};

export type PmOccurrenceTask = {
  taskId: string;
  plannedDueAt: Date;
  scheduledDueAt: Date;
  status: string | null;
  approvalStatus: string | null;
  cancelledAt: Date | null;
  completedAt: Date | null;
};

export type PmCurrentOccurrence = {
  plannedDueAt: Date;
  scheduledDueAt: Date;
  task: PmOccurrenceTask | null;
};

const sqlLikeMonthAdd = (base: Date, monthDelta: number): Date => {
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const hours = base.getUTCHours();
  const minutes = base.getUTCMinutes();
  const seconds = base.getUTCSeconds();
  const ms = base.getUTCMilliseconds();

  const targetMonthIndex = month + monthDelta;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  return new Date(Date.UTC(targetYear, normalizedMonth, targetDay, hours, minutes, seconds, ms));
};

const sqlLikeYearAdd = (base: Date, yearDelta: number): Date => {
  const year = base.getUTCFullYear() + yearDelta;
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const hours = base.getUTCHours();
  const minutes = base.getUTCMinutes();
  const seconds = base.getUTCSeconds();
  const ms = base.getUTCMilliseconds();
  const daysInTargetMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, daysInTargetMonth);
  return new Date(Date.UTC(year, month, targetDay, hours, minutes, seconds, ms));
};

export const advancePmPlannedDueAt = (base: Date, intervalDays: number): Date => {
  if (intervalDays === 30) return sqlLikeMonthAdd(base, 1);
  if (intervalDays === 90) return sqlLikeMonthAdd(base, 3);
  if (intervalDays === 180) return sqlLikeMonthAdd(base, 6);
  if (intervalDays === 365) return sqlLikeYearAdd(base, 1);
  return new Date(base.getTime() + intervalDays * 24 * 60 * 60 * 1000);
};

const toDate = (value: unknown): Date | null => {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
};

const toBoolean = (value: unknown): boolean => value === true || value === 1;

const contextWhereClause = (kind: PmContextKind): string =>
  kind === "asset" ? "AssetId = @contextId" : "FacilityId = @contextId";

export const isProtectedPmOccurrenceTask = (task: Pick<PmOccurrenceTask, "status" | "approvalStatus">): boolean => {
  const status = typeof task.status === "string" ? task.status.toLowerCase() : null;
  const approvalStatus = typeof task.approvalStatus === "string" ? task.approvalStatus : null;
  if (status === "in_progress" || status === "paused") return true;
  return approvalStatus === "PendingSupervisor" || approvalStatus === "PendingSuperadmin" || approvalStatus === "Approved";
};

export const computeInitialPmPlannedDueAt = (input: {
  nextPlannedDueAt: Date | null;
  nextDueAt: Date | null;
  lastPmCompletedAt: Date | null;
  intervalDays: number;
  now?: Date;
}): Date | null => {
  if (input.intervalDays <= 0) return null;
  if (input.nextPlannedDueAt) return input.nextPlannedDueAt;
  if (input.nextDueAt) return input.nextDueAt;
  return advancePmPlannedDueAt(input.lastPmCompletedAt ?? input.now ?? new Date(), input.intervalDays);
};

export const applyPmBlackout = async (input: {
  executor: SqlExecutor;
  plannedDueAt: Date;
}): Promise<Date> => {
  const result = await input.executor
    .request()
    .input("plannedDueAt", sql.DateTime2(0), input.plannedDueAt)
    .query(
      [
        "SELECT MAX(bw.EndsAt) AS BlackoutEnd",
        "FROM pm.BlackoutWindows bw",
        "WHERE bw.IsActive = 1",
        "  AND bw.StartsAt <= @plannedDueAt",
        "  AND bw.EndsAt >= @plannedDueAt",
      ].join("\n"),
    );
  const blackoutEnd = toDate((result.recordset[0] as Record<string, unknown> | undefined)?.BlackoutEnd);
  return blackoutEnd ?? input.plannedDueAt;
};

export const loadAssetPmScheduleContext = async (input: {
  executor: SqlExecutor;
  assetId: string;
}): Promise<PmScheduleContext | null> => {
  const result = await input.executor
    .request()
    .input("assetId", sql.UniqueIdentifier, input.assetId)
    .query(
      [
        "SELECT TOP (1)",
        "  a.AssetId AS ContextId,",
        "  s.PMEnabled AS PMEnabled,",
        "  s.DefaultTemplateId AS TemplateId,",
        "  t.IntervalDays AS IntervalDays,",
        "  t.IsActive AS TemplateIsActive,",
        "  a.IsArchived AS IsContextInactive,",
        "  s.NextPlannedPMDueAt AS NextPlannedPMDueAt,",
        "  s.NextPMDueAt AS NextPMDueAt,",
        "  s.LastPMCompletedAt AS LastPMCompletedAt,",
        "  a.CategoryId AS CategoryId,",
        "  a.LocationId AS LocationId,",
        "  a.AssetStatus AS AssetStatus,",
        "  t.RequiredRoleId AS RequiredRoleId",
        "FROM pm.Assets a",
        "LEFT JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "LEFT JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "WHERE a.AssetId = @assetId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row || typeof row.ContextId !== "string" || typeof row.TemplateId !== "string") return null;

  return {
    kind: "asset",
    contextId: row.ContextId,
    templateId: row.TemplateId,
    intervalDays: Number(row.IntervalDays) || 0,
    pmEnabled: toBoolean(row.PMEnabled),
    templateIsActive: toBoolean(row.TemplateIsActive),
    isContextActive: !toBoolean(row.IsContextInactive),
    nextPlannedDueAt: toDate(row.NextPlannedPMDueAt),
    nextDueAt: toDate(row.NextPMDueAt),
    lastPmCompletedAt: toDate(row.LastPMCompletedAt),
    categoryId: typeof row.CategoryId === "string" ? row.CategoryId : null,
    locationId: typeof row.LocationId === "string" ? row.LocationId : null,
    assetStatus: typeof row.AssetStatus === "string" ? row.AssetStatus : null,
    requiredRoleId: typeof row.RequiredRoleId === "string" ? row.RequiredRoleId : null,
  };
};

export const loadFacilityPmScheduleContext = async (input: {
  executor: SqlExecutor;
  facilityId: string;
}): Promise<PmScheduleContext | null> => {
  const result = await input.executor
    .request()
    .input("facilityId", sql.UniqueIdentifier, input.facilityId)
    .query(
      [
        "SELECT TOP (1)",
        "  f.FacilityId AS ContextId,",
        "  s.PMEnabled AS PMEnabled,",
        "  s.DefaultTemplateId AS TemplateId,",
        "  t.IntervalDays AS IntervalDays,",
        "  t.IsActive AS TemplateIsActive,",
        "  f.IsActive AS IsContextActive,",
        "  s.NextPlannedPMDueAt AS NextPlannedPMDueAt,",
        "  s.NextPMDueAt AS NextPMDueAt,",
        "  s.LastPMCompletedAt AS LastPMCompletedAt,",
        "  f.LocationId AS LocationId,",
        "  t.RequiredRoleId AS RequiredRoleId",
        "FROM pm.Facilities f",
        "LEFT JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "LEFT JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "WHERE f.FacilityId = @facilityId",
      ].join("\n"),
    );

  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row || typeof row.ContextId !== "string" || typeof row.TemplateId !== "string") return null;

  return {
    kind: "facility",
    contextId: row.ContextId,
    templateId: row.TemplateId,
    intervalDays: Number(row.IntervalDays) || 0,
    pmEnabled: toBoolean(row.PMEnabled),
    templateIsActive: toBoolean(row.TemplateIsActive),
    isContextActive: toBoolean(row.IsContextActive),
    nextPlannedDueAt: toDate(row.NextPlannedPMDueAt),
    nextDueAt: toDate(row.NextPMDueAt),
    lastPmCompletedAt: toDate(row.LastPMCompletedAt),
    categoryId: null,
    locationId: typeof row.LocationId === "string" ? row.LocationId : null,
    assetStatus: null,
    requiredRoleId: typeof row.RequiredRoleId === "string" ? row.RequiredRoleId : null,
  };
};

export const loadPmScheduleContextByTask = async (input: {
  executor: SqlExecutor;
  taskId: string;
}): Promise<PmScheduleContext | null> => {
  const result = await input.executor
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .query(
      [
        "SELECT TOP (1)",
        "  t.AssetId AS AssetId,",
        "  t.FacilityId AS FacilityId",
        "FROM pm.PMTasks t",
        "WHERE t.TaskId = @taskId",
      ].join("\n"),
    );
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row) return null;
  if (typeof row.AssetId === "string") {
    return loadAssetPmScheduleContext({ executor: input.executor, assetId: row.AssetId });
  }
  if (typeof row.FacilityId === "string") {
    return loadFacilityPmScheduleContext({ executor: input.executor, facilityId: row.FacilityId });
  }
  return null;
};

export const savePmScheduleAnchor = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  nextPlannedDueAt: Date;
  nextDueAt: Date;
  lastPmCompletedAt?: Date | null;
}): Promise<void> => {
  const request = input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("nextPlannedDueAt", sql.DateTime2(0), input.nextPlannedDueAt)
    .input("nextDueAt", sql.DateTime2(0), input.nextDueAt)
    .input("lastPmCompletedAt", sql.DateTime2(0), input.lastPmCompletedAt ?? null);

  if (input.context.kind === "asset") {
    await request.query(
      [
        "UPDATE pm.AssetPMSettings",
        "SET",
        "  NextPlannedPMDueAt = @nextPlannedDueAt,",
        "  NextPMDueAt = @nextDueAt,",
        "  LastPMCompletedAt = COALESCE(@lastPmCompletedAt, LastPMCompletedAt),",
        "  UpdatedAt = sysutcdatetime()",
        "WHERE AssetId = @contextId",
      ].join("\n"),
    );
    await input.executor
      .request()
      .input("contextId", sql.UniqueIdentifier, input.context.contextId)
      .input("templateId", sql.UniqueIdentifier, input.context.templateId)
      .input("nextDueAt", sql.DateTime2(0), input.nextDueAt)
      .query(
        [
          "MERGE pm.PMSchedules WITH (HOLDLOCK) AS target",
          "USING (SELECT @contextId AS AssetId, @templateId AS TemplateId) AS source",
          "ON target.AssetId = source.AssetId AND target.TemplateId = source.TemplateId",
          "WHEN MATCHED THEN",
          "  UPDATE SET",
          "    NextDueAt = @nextDueAt,",
          "    LastCalculatedAt = sysutcdatetime(),",
          "    UpdatedAt = sysutcdatetime()",
          "WHEN NOT MATCHED THEN",
          "  INSERT (AssetId, TemplateId, NextDueAt, LastCalculatedAt, Source)",
          "  VALUES (@contextId, @templateId, @nextDueAt, sysutcdatetime(), N'policy');",
        ].join("\n"),
      );
    return;
  }

  await request.query(
    [
      "UPDATE pm.FacilityPMSettings",
      "SET",
      "  NextPlannedPMDueAt = @nextPlannedDueAt,",
      "  NextPMDueAt = @nextDueAt,",
      "  LastPMCompletedAt = COALESCE(@lastPmCompletedAt, LastPMCompletedAt),",
      "  UpdatedAt = sysutcdatetime()",
      "WHERE FacilityId = @contextId",
    ].join("\n"),
  );
  await input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("templateId", sql.UniqueIdentifier, input.context.templateId)
    .input("nextDueAt", sql.DateTime2(0), input.nextDueAt)
    .query(
      [
        "MERGE pm.FacilityPMSchedules WITH (HOLDLOCK) AS target",
        "USING (SELECT @contextId AS FacilityId, @templateId AS TemplateId) AS source",
        "ON target.FacilityId = source.FacilityId AND target.TemplateId = source.TemplateId",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    NextDueAt = @nextDueAt,",
        "    LastCalculatedAt = sysutcdatetime(),",
        "    UpdatedAt = sysutcdatetime()",
        "WHEN NOT MATCHED THEN",
        "  INSERT (FacilityId, TemplateId, NextDueAt, LastCalculatedAt, Source)",
        "  VALUES (@contextId, @templateId, @nextDueAt, sysutcdatetime(), N'policy');",
      ].join("\n"),
    );
};

const loadOccurrenceTask = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  plannedDueAt: Date;
}): Promise<PmOccurrenceTask | null> => {
  const result = await input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("templateId", sql.UniqueIdentifier, input.context.templateId)
    .input("plannedDueAt", sql.DateTime2(0), input.plannedDueAt)
    .query(
      [
        "SELECT TOP (1)",
        "  TaskId AS TaskId,",
        "  PlannedDueAt AS PlannedDueAt,",
        "  ScheduledDueAt AS ScheduledDueAt,",
        "  Status AS Status,",
        "  ApprovalStatus AS ApprovalStatus,",
        "  CancelledAt AS CancelledAt,",
        "  CompletedAt AS CompletedAt",
        "FROM pm.PMTasks",
        "WHERE MaintenanceType = N'PM'",
        `  AND ${contextWhereClause(input.context.kind)}`,
        "  AND TemplateId = @templateId",
        "  AND PlannedDueAt = @plannedDueAt",
        "ORDER BY CreatedAt ASC",
      ].join("\n"),
    );
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row || typeof row.TaskId !== "string") return null;
  const plannedDueAt = toDate(row.PlannedDueAt);
  const scheduledDueAt = toDate(row.ScheduledDueAt);
  if (!plannedDueAt || !scheduledDueAt) return null;
  return {
    taskId: row.TaskId,
    plannedDueAt,
    scheduledDueAt,
    status: typeof row.Status === "string" ? row.Status : null,
    approvalStatus: typeof row.ApprovalStatus === "string" ? row.ApprovalStatus : null,
    cancelledAt: toDate(row.CancelledAt),
    completedAt: toDate(row.CompletedAt),
  };
};

const occurrenceExists = async (input: {
  executor: SqlExecutor;
  tableName: "pm.PMMissedOccurrences" | "pm.PMSkippedOccurrences";
  context: PmScheduleContext;
  plannedDueAt: Date;
}): Promise<boolean> => {
  const result = await input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("templateId", sql.UniqueIdentifier, input.context.templateId)
    .input("plannedDueAt", sql.DateTime2(0), input.plannedDueAt)
    .query(
      [
        "SELECT TOP (1) 1 AS One",
        `FROM ${input.tableName}`,
        "WHERE TemplateId = @templateId",
        `  AND ${contextWhereClause(input.context.kind)}`,
        "  AND PlannedDueAt = @plannedDueAt",
      ].join("\n"),
    );
  return Boolean(result.recordset[0]);
};

export const recordPmMissedOccurrence = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  plannedDueAt: Date;
  effectiveDueAt: Date;
  sourceTaskId?: string | null;
}): Promise<void> => {
  const contextColumn = input.context.kind === "asset" ? "AssetId" : "FacilityId";
  await input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("templateId", sql.UniqueIdentifier, input.context.templateId)
    .input("plannedDueAt", sql.DateTime2(0), input.plannedDueAt)
    .input("effectiveDueAt", sql.DateTime2(0), input.effectiveDueAt)
    .input("sourceTaskId", sql.UniqueIdentifier, input.sourceTaskId ?? null)
    .query(
      [
        "MERGE pm.PMMissedOccurrences WITH (HOLDLOCK) AS target",
        `USING (SELECT @contextId AS ${contextColumn}, @templateId AS TemplateId, @plannedDueAt AS PlannedDueAt) AS source`,
        `ON target.${contextColumn} = source.${contextColumn}`,
        "  AND target.TemplateId = source.TemplateId",
        "  AND target.PlannedDueAt = source.PlannedDueAt",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    EffectiveDueAt = @effectiveDueAt,",
        "    SourceTaskId = COALESCE(target.SourceTaskId, @sourceTaskId)",
        "WHEN NOT MATCHED THEN",
        `  INSERT (${contextColumn}, TemplateId, PlannedDueAt, EffectiveDueAt, SourceTaskId)`,
        `  VALUES (@contextId, @templateId, @plannedDueAt, @effectiveDueAt, @sourceTaskId);`,
      ].join("\n"),
    );
};

export const recordPmSkippedOccurrence = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  plannedDueAt: Date;
  effectiveDueAt: Date;
  taskId?: string | null;
  skippedByUserId: string;
  skipReason: string;
}): Promise<void> => {
  const contextColumn = input.context.kind === "asset" ? "AssetId" : "FacilityId";
  await input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("templateId", sql.UniqueIdentifier, input.context.templateId)
    .input("plannedDueAt", sql.DateTime2(0), input.plannedDueAt)
    .input("effectiveDueAt", sql.DateTime2(0), input.effectiveDueAt)
    .input("taskId", sql.UniqueIdentifier, input.taskId ?? null)
    .input("skippedByUserId", sql.UniqueIdentifier, input.skippedByUserId)
    .input("skipReason", sql.NVarChar(1024), input.skipReason)
    .query(
      [
        "MERGE pm.PMSkippedOccurrences WITH (HOLDLOCK) AS target",
        `USING (SELECT @contextId AS ${contextColumn}, @templateId AS TemplateId, @plannedDueAt AS PlannedDueAt) AS source`,
        `ON target.${contextColumn} = source.${contextColumn}`,
        "  AND target.TemplateId = source.TemplateId",
        "  AND target.PlannedDueAt = source.PlannedDueAt",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    EffectiveDueAt = @effectiveDueAt,",
        "    TaskId = COALESCE(target.TaskId, @taskId),",
        "    SkipReason = @skipReason,",
        "    SkippedByUserId = @skippedByUserId,",
        "    SkippedAt = sysutcdatetime()",
        "WHEN NOT MATCHED THEN",
        `  INSERT (${contextColumn}, TemplateId, PlannedDueAt, EffectiveDueAt, TaskId, SkipReason, SkippedByUserId)`,
        `  VALUES (@contextId, @templateId, @plannedDueAt, @effectiveDueAt, @taskId, @skipReason, @skippedByUserId);`,
      ].join("\n"),
    );
};

export const reconcilePmScheduleContext = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  now?: Date;
}): Promise<PmCurrentOccurrence | null> => {
  const now = input.now ?? new Date();
  const context = input.context;
  if (!context.pmEnabled || !context.templateIsActive || !context.isContextActive || context.intervalDays <= 0) {
    return null;
  }

  let currentPlannedDueAt = computeInitialPmPlannedDueAt({
    nextPlannedDueAt: context.nextPlannedDueAt,
    nextDueAt: context.nextDueAt,
    lastPmCompletedAt: context.lastPmCompletedAt,
    intervalDays: context.intervalDays,
    now,
  });
  if (!currentPlannedDueAt) return null;

  let guard = 0;
  while (guard < 120) {
    guard += 1;
    const currentDueAt = await applyPmBlackout({
      executor: input.executor,
      plannedDueAt: currentPlannedDueAt,
    });

    if (
      !context.nextPlannedDueAt ||
      !context.nextDueAt ||
      context.nextPlannedDueAt.getTime() !== currentPlannedDueAt.getTime() ||
      context.nextDueAt.getTime() !== currentDueAt.getTime()
    ) {
      await savePmScheduleAnchor({
        executor: input.executor,
        context,
        nextPlannedDueAt: currentPlannedDueAt,
        nextDueAt: currentDueAt,
      });
      context.nextPlannedDueAt = currentPlannedDueAt;
      context.nextDueAt = currentDueAt;
    }

    const hasSkipped = await occurrenceExists({
      executor: input.executor,
      tableName: "pm.PMSkippedOccurrences",
      context,
      plannedDueAt: currentPlannedDueAt,
    });
    const hasMissed = await occurrenceExists({
      executor: input.executor,
      tableName: "pm.PMMissedOccurrences",
      context,
      plannedDueAt: currentPlannedDueAt,
    });
    const task = await loadOccurrenceTask({
      executor: input.executor,
      context,
      plannedDueAt: currentPlannedDueAt,
    });

    const nextPlannedDueAt = advancePmPlannedDueAt(currentPlannedDueAt, context.intervalDays);
    const occurrenceIsBehindCurrentNeed = nextPlannedDueAt.getTime() <= now.getTime();

    if (hasSkipped || hasMissed || (task && task.completedAt)) {
      currentPlannedDueAt = nextPlannedDueAt;
      continue;
    }

    if (task && isProtectedPmOccurrenceTask(task)) {
      return { plannedDueAt: currentPlannedDueAt, scheduledDueAt: currentDueAt, task };
    }

    if (occurrenceIsBehindCurrentNeed) {
      await recordPmMissedOccurrence({
        executor: input.executor,
        context,
        plannedDueAt: currentPlannedDueAt,
        effectiveDueAt: currentDueAt,
        sourceTaskId: task?.taskId ?? null,
      });
      currentPlannedDueAt = nextPlannedDueAt;
      continue;
    }

    return {
      plannedDueAt: currentPlannedDueAt,
      scheduledDueAt: currentDueAt,
      task,
    };
  }

  throw new Error("PM schedule reconciliation exceeded guard limit");
};

export const finalizePmOccurrenceCompletion = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  fulfilledPlannedDueAt: Date;
  completedAt: Date;
}): Promise<{ nextPlannedDueAt: Date; nextDueAt: Date }> => {
  const nextPlannedDueAt = advancePmPlannedDueAt(input.fulfilledPlannedDueAt, input.context.intervalDays);
  const nextDueAt = await applyPmBlackout({
    executor: input.executor,
    plannedDueAt: nextPlannedDueAt,
  });
  await savePmScheduleAnchor({
    executor: input.executor,
    context: input.context,
    nextPlannedDueAt,
    nextDueAt,
    lastPmCompletedAt: input.completedAt,
  });
  return { nextPlannedDueAt, nextDueAt };
};

export const advancePmOccurrenceAnchor = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  fulfilledPlannedDueAt: Date;
}): Promise<{ nextPlannedDueAt: Date; nextDueAt: Date }> => {
  const nextPlannedDueAt = advancePmPlannedDueAt(input.fulfilledPlannedDueAt, input.context.intervalDays);
  const nextDueAt = await applyPmBlackout({
    executor: input.executor,
    plannedDueAt: nextPlannedDueAt,
  });
  await savePmScheduleAnchor({
    executor: input.executor,
    context: input.context,
    nextPlannedDueAt,
    nextDueAt,
  });
  return { nextPlannedDueAt, nextDueAt };
};

export const findReusablePmTask = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  currentPlannedDueAt: Date;
}): Promise<{ taskId: string; plannedDueAt: Date } | null> => {
  const result = await input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("templateId", sql.UniqueIdentifier, input.context.templateId)
    .input("currentPlannedDueAt", sql.DateTime2(0), input.currentPlannedDueAt)
    .query(
      [
        "SELECT TOP (1)",
        "  TaskId AS TaskId,",
        "  PlannedDueAt AS PlannedDueAt",
        "FROM pm.PMTasks",
        "WHERE MaintenanceType = N'PM'",
        `  AND ${contextWhereClause(input.context.kind)}`,
        "  AND TemplateId = @templateId",
        "  AND CompletedAt IS NULL",
        "  AND CancelledAt IS NULL",
        "ORDER BY",
        "  CASE WHEN PlannedDueAt <= @currentPlannedDueAt THEN 0 ELSE 1 END ASC,",
        "  PlannedDueAt ASC,",
        "  CreatedAt ASC",
      ].join("\n"),
    );
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  const plannedDueAt = toDate(row?.PlannedDueAt);
  if (!row || typeof row.TaskId !== "string" || !plannedDueAt) return null;
  return { taskId: row.TaskId, plannedDueAt };
};

export const createPmTaskForOccurrence = async (input: {
  executor: SqlExecutor;
  context: PmScheduleContext;
  occurrence: PmCurrentOccurrence;
  assignedToUserId: string | null;
  assignedToRoleId: string | null;
}): Promise<string | null> => {
  const result = await input.executor
    .request()
    .input("contextId", sql.UniqueIdentifier, input.context.contextId)
    .input("templateId", sql.UniqueIdentifier, input.context.templateId)
    .input("plannedDueAt", sql.DateTime2(0), input.occurrence.plannedDueAt)
    .input("scheduledDueAt", sql.DateTime2(0), input.occurrence.scheduledDueAt)
    .input("assignedToUserId", sql.UniqueIdentifier, input.assignedToUserId)
    .input("assignedToRoleId", sql.UniqueIdentifier, input.assignedToRoleId)
    .query(
      [
        "DECLARE @existingTaskId uniqueidentifier;",
        "SELECT TOP (1) @existingTaskId = TaskId",
        "FROM pm.PMTasks",
        "WHERE MaintenanceType = N'PM'",
        `  AND ${contextWhereClause(input.context.kind)}`,
        "  AND TemplateId = @templateId",
        "  AND PlannedDueAt = @plannedDueAt;",
        "IF @existingTaskId IS NOT NULL",
        "BEGIN",
        "  SELECT @existingTaskId AS TaskId;",
        "END",
        "ELSE",
        "BEGIN",
        "  DECLARE @taskNumber nvarchar(32) = CONCAT(",
        input.context.kind === "asset"
          ? "    N'PM-',"
          : "    N'PM-FAC-',",
        "    FORMAT(sysutcdatetime(), 'yyyyMMdd'),",
        "    N'-',",
        "    RIGHT(CONVERT(varchar(36), NEWID()), 8)",
        "  );",
        "  INSERT INTO pm.PMTasks (",
        input.context.kind === "asset"
          ? "    TaskNumber, AssetId, TemplateId, PlannedDueAt, ScheduledDueAt, AssignedToUserId, AssignedToRoleId, Status"
          : "    TaskNumber, AssetId, FacilityId, TemplateId, PlannedDueAt, ScheduledDueAt, AssignedToUserId, AssignedToRoleId, Status",
        "  )",
        "  OUTPUT inserted.TaskId AS TaskId",
        "  VALUES (",
        input.context.kind === "asset"
          ? "    @taskNumber, @contextId, @templateId, @plannedDueAt, @scheduledDueAt, @assignedToUserId, @assignedToRoleId, N'open'"
          : "    @taskNumber, NULL, @contextId, @templateId, @plannedDueAt, @scheduledDueAt, @assignedToUserId, @assignedToRoleId, N'open'",
        "  );",
        "END",
      ].join("\n"),
    );
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  return typeof row?.TaskId === "string" ? row.TaskId : null;
};
