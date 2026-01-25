import sql from "mssql";
import { env } from "../config/env.js";
import { getDb } from "../db/mssql.js";
import { writeSystemLog } from "./systemLog.js";

type CandidateRow = {
  AssetId: string;
  TemplateId: string;
  NextDueAt: Date;
  CategoryId: string | null;
  LocationId: string | null;
  AssetStatus: string | null;
};

type FacilityCandidateRow = {
  FacilityId: string;
  TemplateId: string;
  NextDueAt: Date;
  LocationId: string | null;
};

type AssignmentContext = {
  TemplateId: string;
  CategoryId: string | null;
  LocationId: string | null;
  AssetStatus: string | null;
};

const resolveAssignment = async (context: AssignmentContext): Promise<{
  assignToUserId: string | null;
  assignToRoleId: string | null;
}> => {
  const db = await getDb();
  const result = await db
    .request()
    .input("categoryId", sql.UniqueIdentifier, context.CategoryId)
    .input("locationId", sql.UniqueIdentifier, context.LocationId)
    .input("assetStatus", sql.NVarChar(64), context.AssetStatus)
    .query(
      [
        "SELECT TOP (1)",
        "  AssignToUserId,",
        "  AssignToRoleId",
        "FROM pm.AssignmentRules",
        "WHERE",
        "  IsActive = 1",
        "  AND (CategoryId IS NULL OR CategoryId = @categoryId)",
        "  AND (LocationId IS NULL OR LocationId = @locationId)",
        "  AND (AssetStatus IS NULL OR AssetStatus = @assetStatus)",
        "  AND (EffectiveFrom IS NULL OR EffectiveFrom <= sysutcdatetime())",
        "  AND (EffectiveTo IS NULL OR EffectiveTo >= sysutcdatetime())",
        "ORDER BY Priority ASC, UpdatedAt DESC",
      ].join("\n"),
    );

  const row = result.recordset[0] as { AssignToUserId?: string; AssignToRoleId?: string } | undefined;
  let assignToUserId: string | null = row?.AssignToUserId ?? null;
  let assignToRoleId: string | null = row?.AssignToRoleId ?? null;

  if (!assignToUserId && !assignToRoleId) {
    const templateResult = await db
      .request()
      .input("templateId", sql.UniqueIdentifier, context.TemplateId)
      .query(
        [
          "SELECT TOP (1)",
          "  RequiredRoleId",
          "FROM pm.PMTemplates",
          "WHERE TemplateId = @templateId",
        ].join("\n"),
      );

    const templateRow = templateResult.recordset[0] as { RequiredRoleId?: string | null } | undefined;
    const requiredRoleId = templateRow?.RequiredRoleId ?? null;
    assignToRoleId = requiredRoleId;
  }

  return {
    assignToUserId,
    assignToRoleId,
  };
};

const ensureTask = async (candidate: CandidateRow, dueAt: Date): Promise<boolean> => {
  const assignment = await resolveAssignment({
    TemplateId: candidate.TemplateId,
    CategoryId: candidate.CategoryId,
    LocationId: candidate.LocationId,
    AssetStatus: candidate.AssetStatus,
  });
  const db = await getDb();
  const inserted = await db
    .request()
    .input("assetId", sql.UniqueIdentifier, candidate.AssetId)
    .input("templateId", sql.UniqueIdentifier, candidate.TemplateId)
    .input("scheduledDueAt", sql.DateTime2(0), dueAt)
    .input("assignedToUserId", sql.UniqueIdentifier, assignment.assignToUserId)
    .input("assignedToRoleId", sql.UniqueIdentifier, assignment.assignToRoleId)
    .query(
      [
        "IF NOT EXISTS (",
        "  SELECT 1",
        "  FROM pm.PMTasks",
        "  WHERE AssetId = @assetId",
        "    AND TemplateId = @templateId",
        "    AND ScheduledDueAt = @scheduledDueAt",
        ")",
        "BEGIN",
        "  DECLARE @taskNumber nvarchar(32) = CONCAT(",
        "    N'PM-',",
        "    FORMAT(sysutcdatetime(), 'yyyyMMdd'),",
        "    N'-',",
        "    RIGHT(CONVERT(varchar(36), NEWID()), 8)",
        "  );",
        "  INSERT INTO pm.PMTasks (",
        "    TaskNumber, AssetId, TemplateId, ScheduledDueAt, AssignedToUserId, AssignedToRoleId, Status",
        "  )",
        "  VALUES (",
        "    @taskNumber, @assetId, @templateId, @scheduledDueAt, @assignedToUserId, @assignedToRoleId, N'open'",
        "  );",
        "  SELECT CAST(1 AS bit) AS Inserted;",
        "END",
        "ELSE",
        "BEGIN",
        "  SELECT CAST(0 AS bit) AS Inserted;",
        "END",
      ].join("\n"),
    );

  const row = inserted.recordset[0] as { Inserted?: boolean } | undefined;
  return row?.Inserted === true;
};

const ensureFacilityTask = async (candidate: FacilityCandidateRow, dueAt: Date): Promise<boolean> => {
  const assignment = await resolveAssignment({
    TemplateId: candidate.TemplateId,
    CategoryId: null,
    LocationId: candidate.LocationId,
    AssetStatus: null,
  });

  const db = await getDb();
  const inserted = await db
    .request()
    .input("facilityId", sql.UniqueIdentifier, candidate.FacilityId)
    .input("templateId", sql.UniqueIdentifier, candidate.TemplateId)
    .input("scheduledDueAt", sql.DateTime2(0), dueAt)
    .input("assignedToUserId", sql.UniqueIdentifier, assignment.assignToUserId)
    .input("assignedToRoleId", sql.UniqueIdentifier, assignment.assignToRoleId)
    .query(
      [
        "IF NOT EXISTS (",
        "  SELECT 1",
        "  FROM pm.PMTasks",
        "  WHERE FacilityId = @facilityId",
        "    AND TemplateId = @templateId",
        "    AND ScheduledDueAt = @scheduledDueAt",
        ")",
        "BEGIN",
        "  DECLARE @taskNumber nvarchar(32) = CONCAT(",
        "    N'PM-FAC-',",
        "    FORMAT(sysutcdatetime(), 'yyyyMMdd'),",
        "    N'-',",
        "    RIGHT(CONVERT(varchar(36), NEWID()), 8)",
        "  );",
        "  INSERT INTO pm.PMTasks (",
        "    TaskNumber, AssetId, FacilityId, TemplateId, ScheduledDueAt, AssignedToUserId, AssignedToRoleId, Status",
        "  )",
        "  VALUES (",
        "    @taskNumber, NULL, @facilityId, @templateId, @scheduledDueAt, @assignedToUserId, @assignedToRoleId, N'open'",
        "  );",
        "  SELECT CAST(1 AS bit) AS Inserted;",
        "END",
        "ELSE",
        "BEGIN",
        "  SELECT CAST(0 AS bit) AS Inserted;",
        "END",
      ].join("\n"),
    );

  const row = inserted.recordset[0] as { Inserted?: boolean } | undefined;
  return row?.Inserted === true;
};

const updateScheduleAndSettings = async (candidate: CandidateRow, dueAt: Date): Promise<void> => {
  const db = await getDb();
  await db
    .request()
    .input("assetId", sql.UniqueIdentifier, candidate.AssetId)
    .input("templateId", sql.UniqueIdentifier, candidate.TemplateId)
    .input("nextDueAt", sql.DateTime2(0), dueAt)
    .query(
      [
        "MERGE pm.PMSchedules WITH (HOLDLOCK) AS target",
        "USING (SELECT @assetId AS AssetId, @templateId AS TemplateId) AS source",
        "ON target.AssetId = source.AssetId AND target.TemplateId = source.TemplateId",
        "WHEN MATCHED THEN",
        "  UPDATE SET",
        "    NextDueAt = @nextDueAt,",
        "    LastCalculatedAt = sysutcdatetime(),",
        "    Source = N'job',",
        "    UpdatedAt = sysutcdatetime()",
        "WHEN NOT MATCHED THEN",
        "  INSERT (AssetId, TemplateId, NextDueAt, LastCalculatedAt, Source)",
        "  VALUES (@assetId, @templateId, @nextDueAt, sysutcdatetime(), N'job');",
      ].join("\n"),
    );

  await db
    .request()
    .input("assetId", sql.UniqueIdentifier, candidate.AssetId)
    .input("nextPmDueAt", sql.DateTime2(0), dueAt)
    .query(
      [
        "UPDATE pm.AssetPMSettings",
        "SET",
        "  NextPMDueAt = @nextPmDueAt,",
        "  UpdatedAt = sysutcdatetime()",
        "WHERE AssetId = @assetId",
      ].join("\n"),
    );
};

export const runScheduleCalculationJob = async (): Promise<void> => {
  const db = await getDb();
  const horizonDays = env.JOB_TASK_HORIZON_DAYS;

  const startedAt = Date.now();
  await writeSystemLog({ level: "info", message: "Schedule calculation started", context: { job: "schedule-calc" } });

  const candidatesResult = await db
    .request()
    .input("horizonDays", sql.Int, horizonDays)
    .query(
      [
        "SELECT",
        "  a.AssetId AS AssetId,",
        "  s.DefaultTemplateId AS TemplateId,",
        "  due.NextDueAt AS NextDueAt,",
        "  a.CategoryId AS CategoryId,",
        "  a.LocationId AS LocationId,",
        "  a.AssetStatus AS AssetStatus",
        "FROM pm.Assets a",
        "INNER JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "INNER JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "OUTER APPLY (",
        "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "  FROM pm.PMTasks tt",
        "  WHERE tt.AssetId = a.AssetId",
        "    AND tt.TemplateId = s.DefaultTemplateId",
        "    AND tt.Status = N'completed'",
        "    AND tt.CompletedAt IS NOT NULL",
        ") h",
        "OUTER APPLY (",
        "  SELECT pm.fn_CalculateNextDueAt(",
        "    h.LastCompletedAt,",
        "    s.LastPMCompletedAt,",
        "    t.IntervalDays,",
        "    s.NextPMDueAt",
        "  ) AS NextDueAt",
        ") due",
        "WHERE",
        "  a.IsArchived = 0",
        "  AND s.PMEnabled = 1",
        "  AND s.DefaultTemplateId IS NOT NULL",
        "  AND t.IsActive = 1",
        "  AND due.NextDueAt <= dateadd(day, @horizonDays, sysutcdatetime())",
      ].join("\n"),
    );

  const candidates = candidatesResult.recordset as CandidateRow[];

  const facilityCandidatesResult = await db
    .request()
    .input("horizonDays", sql.Int, horizonDays)
    .query(
      [
        "SELECT",
        "  f.FacilityId AS FacilityId,",
        "  s.DefaultTemplateId AS TemplateId,",
        "  due.NextDueAt AS NextDueAt,",
        "  f.LocationId AS LocationId",
        "FROM pm.Facilities f",
        "INNER JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "INNER JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "OUTER APPLY (",
        "  SELECT MAX(tt.CompletedAt) AS LastCompletedAt",
        "  FROM pm.PMTasks tt",
        "  WHERE tt.FacilityId = f.FacilityId",
        "    AND tt.TemplateId = s.DefaultTemplateId",
        "    AND tt.Status = N'completed'",
        "    AND tt.CompletedAt IS NOT NULL",
        ") h",
        "OUTER APPLY (",
        "  SELECT pm.fn_CalculateNextDueAt(",
        "    h.LastCompletedAt,",
        "    s.LastPMCompletedAt,",
        "    t.IntervalDays,",
        "    s.NextPMDueAt",
        "  ) AS NextDueAt",
        ") due",
        "WHERE",
        "  f.IsActive = 1",
        "  AND s.PMEnabled = 1",
        "  AND s.DefaultTemplateId IS NOT NULL",
        "  AND t.IsActive = 1",
        "  AND due.NextDueAt <= dateadd(day, @horizonDays, sysutcdatetime())",
      ].join("\n"),
    );

  const facilityCandidates = facilityCandidatesResult.recordset as FacilityCandidateRow[];

  let created = 0;
  let facilityCreated = 0;
  for (const candidate of candidates) {
    const dueAt = candidate.NextDueAt;
    const inserted = await ensureTask(candidate, dueAt);
    if (inserted) created += 1;
    await updateScheduleAndSettings(candidate, dueAt);
  }

  for (const candidate of facilityCandidates) {
    const dueAt = candidate.NextDueAt;
    const inserted = await ensureFacilityTask(candidate, dueAt);
    if (inserted) facilityCreated += 1;
  }

  const durationMs = Date.now() - startedAt;
  await writeSystemLog({
    level: "info",
    message: "Schedule calculation completed",
    context: {
      job: "schedule-calc",
      candidates: candidates.length,
      facilityCandidates: facilityCandidates.length,
      created,
      facilityCreated,
      durationMs,
    },
  });
};
