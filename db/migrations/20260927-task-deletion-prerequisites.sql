-- Additive EX-01/CM-01 prerequisites for manual deletion.
-- Copied from schema.sql; no operational-data backfill or deletion.
-- Execute inside a transaction with XACT_ABORT ON and a bounded LOCK_TIMEOUT.
IF COL_LENGTH(N'pm.PMTasks', N'SourceTaskId') IS NULL
BEGIN
  ALTER TABLE pm.PMTasks ADD SourceTaskId uniqueidentifier NULL;

  ALTER TABLE pm.PMTasks
    ADD CONSTRAINT FK_pm_PMTasks_SourceTask FOREIGN KEY (SourceTaskId) REFERENCES pm.PMTasks(TaskId);
END;

IF COL_LENGTH(N'pm.PMTasks', N'SourceTemplateChecklistItemId') IS NULL
BEGIN
  ALTER TABLE pm.PMTasks ADD SourceTemplateChecklistItemId uniqueidentifier NULL;

  ALTER TABLE pm.PMTasks
    ADD CONSTRAINT FK_pm_PMTasks_SourceTemplateChecklistItem FOREIGN KEY (SourceTemplateChecklistItemId)
      REFERENCES pm.PMTemplateChecklistItems(TemplateChecklistItemId);
END;

IF COL_LENGTH(N'pm.PMTasks', N'RecurringFromTaskId') IS NULL
BEGIN
  ALTER TABLE pm.PMTasks ADD RecurringFromTaskId uniqueidentifier NULL;

  ALTER TABLE pm.PMTasks
    ADD CONSTRAINT FK_pm_PMTasks_RecurringFromTask FOREIGN KEY (RecurringFromTaskId) REFERENCES pm.PMTasks(TaskId);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.PMTasks')
    AND i.name = N'UQ_pm_PMTasks_PMReplacementSourceTask'
)
BEGIN
  EXEC(N'
    CREATE UNIQUE INDEX UQ_pm_PMTasks_PMReplacementSourceTask
    ON pm.PMTasks (SourceTaskId)
    WHERE MaintenanceType = N''PM'' AND SourceTaskId IS NOT NULL;
  ');
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.PMTasks')
    AND i.name = N'UQ_pm_PMTasks_CMSourceFinding'
)
BEGIN
  EXEC(N'
    CREATE UNIQUE INDEX UQ_pm_PMTasks_CMSourceFinding
    ON pm.PMTasks (SourceTaskId, SourceTemplateChecklistItemId)
    WHERE MaintenanceType = N''CM'' AND SourceTaskId IS NOT NULL AND SourceTemplateChecklistItemId IS NOT NULL;
  ');
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.PMTasks')
    AND i.name = N'IX_pm_PMTasks_CMRecurringFromTask'
)
BEGIN
  EXEC(N'
    CREATE INDEX IX_pm_PMTasks_CMRecurringFromTask
    ON pm.PMTasks (RecurringFromTaskId, CreatedAt)
    WHERE MaintenanceType = N''CM'' AND RecurringFromTaskId IS NOT NULL;
  ');
END;


IF OBJECT_ID(N'pm.TaskWorkSessions', N'U') IS NULL
BEGIN
  CREATE TABLE pm.TaskWorkSessions (
    TaskWorkSessionId uniqueidentifier NOT NULL CONSTRAINT DF_pm_TaskWorkSessions_Id DEFAULT (newsequentialid()),
    TaskId uniqueidentifier NOT NULL,
    StartedAt datetime2(0) NOT NULL,
    StartedByUserId uniqueidentifier NOT NULL,
    EndedAt datetime2(0) NULL,
    EndedByUserId uniqueidentifier NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_TaskWorkSessions_CreatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_TaskWorkSessions PRIMARY KEY CLUSTERED (TaskWorkSessionId),
    CONSTRAINT FK_pm_TaskWorkSessions_Task FOREIGN KEY (TaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT FK_pm_TaskWorkSessions_StartedByUser FOREIGN KEY (StartedByUserId) REFERENCES pm.Users(UserId),
    CONSTRAINT FK_pm_TaskWorkSessions_EndedByUser FOREIGN KEY (EndedByUserId) REFERENCES pm.Users(UserId)
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.TaskWorkSessions')
    AND i.name = N'IX_pm_TaskWorkSessions_TaskStartedAt'
)
BEGIN
  CREATE INDEX IX_pm_TaskWorkSessions_TaskStartedAt
  ON pm.TaskWorkSessions (TaskId, StartedAt DESC);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.TaskWorkSessions')
    AND i.name = N'UQ_pm_TaskWorkSessions_OpenSessionPerTask'
)
BEGIN
  CREATE UNIQUE INDEX UQ_pm_TaskWorkSessions_OpenSessionPerTask
  ON pm.TaskWorkSessions (TaskId)
  WHERE EndedAt IS NULL;
END;

IF OBJECT_ID(N'pm.CMDowntimeIntervals', N'U') IS NULL
BEGIN
  CREATE TABLE pm.CMDowntimeIntervals (
    CMDowntimeIntervalId uniqueidentifier NOT NULL CONSTRAINT DF_pm_CMDowntimeIntervals_Id DEFAULT (newsequentialid()),
    TaskId uniqueidentifier NOT NULL,
    StartedAt datetime2(0) NOT NULL,
    StartedByUserId uniqueidentifier NULL,
    StartedReason nvarchar(1024) NULL,
    EndedAt datetime2(0) NULL,
    EndedByUserId uniqueidentifier NULL,
    EndReason nvarchar(1024) NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_CMDowntimeIntervals_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_CMDowntimeIntervals_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_CMDowntimeIntervals PRIMARY KEY CLUSTERED (CMDowntimeIntervalId),
    CONSTRAINT FK_pm_CMDowntimeIntervals_Task FOREIGN KEY (TaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT FK_pm_CMDowntimeIntervals_StartedByUser FOREIGN KEY (StartedByUserId) REFERENCES pm.Users(UserId),
    CONSTRAINT FK_pm_CMDowntimeIntervals_EndedByUser FOREIGN KEY (EndedByUserId) REFERENCES pm.Users(UserId)
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.CMDowntimeIntervals')
    AND i.name = N'IX_pm_CMDowntimeIntervals_TaskStartedAt'
)
BEGIN
  CREATE INDEX IX_pm_CMDowntimeIntervals_TaskStartedAt
  ON pm.CMDowntimeIntervals (TaskId, StartedAt DESC);
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.CMDowntimeIntervals')
    AND i.name = N'UQ_pm_CMDowntimeIntervals_OpenIntervalPerTask'
)
BEGIN
  CREATE UNIQUE INDEX UQ_pm_CMDowntimeIntervals_OpenIntervalPerTask
  ON pm.CMDowntimeIntervals (TaskId)
  WHERE EndedAt IS NULL;
END;

IF OBJECT_ID(N'pm.CMTaskEvents', N'U') IS NULL
BEGIN
  CREATE TABLE pm.CMTaskEvents (
    CMTaskEventId uniqueidentifier NOT NULL CONSTRAINT DF_pm_CMTaskEvents_Id DEFAULT (newsequentialid()),
    TaskId uniqueidentifier NOT NULL,
    EventType nvarchar(32) NOT NULL,
    OccurredAt datetime2(0) NOT NULL,
    ActorUserId uniqueidentifier NULL,
    Reason nvarchar(1024) NULL,
    Notes nvarchar(2048) NULL,
    MetadataJson nvarchar(max) NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_CMTaskEvents_CreatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_CMTaskEvents PRIMARY KEY CLUSTERED (CMTaskEventId),
    CONSTRAINT FK_pm_CMTaskEvents_Task FOREIGN KEY (TaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT FK_pm_CMTaskEvents_ActorUser FOREIGN KEY (ActorUserId) REFERENCES pm.Users(UserId),
    CONSTRAINT CK_pm_CMTaskEvents_EventType CHECK (
      EventType IN (
        N'reported',
        N'repair_submitted',
        N'returned_for_correction',
        N'verified_closed',
        N'restoration_recorded',
        N'downtime_reopened',
        N'repeat_fault_linked'
      )
    )
  );
END;

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes i
  WHERE i.object_id = OBJECT_ID(N'pm.CMTaskEvents')
    AND i.name = N'IX_pm_CMTaskEvents_TaskOccurredAt'
)
BEGIN
  CREATE INDEX IX_pm_CMTaskEvents_TaskOccurredAt
  ON pm.CMTaskEvents (TaskId, OccurredAt DESC, CreatedAt DESC);
END;

