-- Additive history resolution. One physical execution fulfils one scheduled occurrence.
IF OBJECT_ID(N'pm.PMOccurrenceResolutions', N'U') IS NULL
BEGIN
  CREATE TABLE pm.PMOccurrenceResolutions (
    OriginalTaskId uniqueidentifier NOT NULL CONSTRAINT PK_pm_PMOccurrenceResolutions PRIMARY KEY,
    FulfilledByTaskId uniqueidentifier NOT NULL CONSTRAINT UQ_pm_PMOccurrenceResolutions_Execution UNIQUE,
    PlannedDueAt datetime2(0) NOT NULL,
    EffectiveDueAt datetime2(0) NOT NULL,
    Reason nvarchar(1024) NOT NULL,
    RecordedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMOccurrenceResolutions_Recorded DEFAULT sysutcdatetime(),
    CONSTRAINT FK_pm_PMOccurrenceResolutions_Original FOREIGN KEY (OriginalTaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT FK_pm_PMOccurrenceResolutions_Execution FOREIGN KEY (FulfilledByTaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT CK_pm_PMOccurrenceResolutions_Different CHECK(OriginalTaskId<>FulfilledByTaskId)
  );
END;
