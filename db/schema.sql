IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'pm')
BEGIN
  EXEC(N'CREATE SCHEMA pm');
END;

IF OBJECT_ID(N'pm.SchemaInfo', N'U') IS NULL
BEGIN
  CREATE TABLE pm.SchemaInfo (
    SchemaInfoId int IDENTITY(1,1) NOT NULL,
    Version int NOT NULL,
    AppliedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_SchemaInfo_AppliedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_SchemaInfo PRIMARY KEY CLUSTERED (SchemaInfoId)
  );
END;

IF NOT EXISTS (SELECT 1 FROM pm.SchemaInfo)
BEGIN
  INSERT INTO pm.SchemaInfo (Version) VALUES (1);
END;

IF (SELECT ISNULL(MAX(Version), 0) FROM pm.SchemaInfo) < 2
BEGIN
  INSERT INTO pm.SchemaInfo (Version) VALUES (2);
END;

IF OBJECT_ID(N'pm.Roles', N'U') IS NULL
BEGIN
  CREATE TABLE pm.Roles (
    RoleId uniqueidentifier NOT NULL CONSTRAINT DF_pm_Roles_RoleId DEFAULT (newsequentialid()),
    Name nvarchar(64) NOT NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Roles_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Roles_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_Roles PRIMARY KEY CLUSTERED (RoleId),
    CONSTRAINT UQ_pm_Roles_Name UNIQUE (Name)
  );
END;

IF OBJECT_ID(N'pm.Users', N'U') IS NULL
BEGIN
  CREATE TABLE pm.Users (
    UserId uniqueidentifier NOT NULL CONSTRAINT DF_pm_Users_UserId DEFAULT (newsequentialid()),
    Username nvarchar(128) NOT NULL,
    DisplayName nvarchar(256) NULL,
    Email nvarchar(256) NULL,
    Phone nvarchar(32) NULL,
    ExternalProvider nvarchar(64) NULL,
    ExternalId nvarchar(128) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_Users_IsActive DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Users_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Users_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_Users PRIMARY KEY CLUSTERED (UserId),
    CONSTRAINT UQ_pm_Users_Username UNIQUE (Username)
  );
END;

IF OBJECT_ID(N'pm.UserRoles', N'U') IS NULL
BEGIN
  CREATE TABLE pm.UserRoles (
    UserId uniqueidentifier NOT NULL,
    RoleId uniqueidentifier NOT NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_UserRoles_CreatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_UserRoles PRIMARY KEY CLUSTERED (UserId, RoleId),
    CONSTRAINT FK_pm_UserRoles_Users FOREIGN KEY (UserId) REFERENCES pm.Users(UserId),
    CONSTRAINT FK_pm_UserRoles_Roles FOREIGN KEY (RoleId) REFERENCES pm.Roles(RoleId)
  );
END;

IF OBJECT_ID(N'pm.UserCredentials', N'U') IS NULL
BEGIN
  CREATE TABLE pm.UserCredentials (
    UserId uniqueidentifier NOT NULL,
    PasswordHash nvarchar(255) NOT NULL,
    PasswordUpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_UserCredentials_PasswordUpdatedAt DEFAULT (sysutcdatetime()),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_UserCredentials_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_UserCredentials_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_UserCredentials PRIMARY KEY CLUSTERED (UserId),
    CONSTRAINT FK_pm_UserCredentials_Users FOREIGN KEY (UserId) REFERENCES pm.Users(UserId)
  );
END;

IF OBJECT_ID(N'pm.AssetCategories', N'U') IS NULL
BEGIN
  CREATE TABLE pm.AssetCategories (
    CategoryId uniqueidentifier NOT NULL CONSTRAINT DF_pm_AssetCategories_CategoryId DEFAULT (newsequentialid()),
    SnipeCategoryId int NULL,
    Name nvarchar(128) NOT NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_AssetCategories_IsActive DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_AssetCategories_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_AssetCategories_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_AssetCategories PRIMARY KEY CLUSTERED (CategoryId),
    CONSTRAINT UQ_pm_AssetCategories_Name UNIQUE (Name)
  );
END;

IF OBJECT_ID(N'pm.Locations', N'U') IS NULL
BEGIN
  CREATE TABLE pm.Locations (
    LocationId uniqueidentifier NOT NULL CONSTRAINT DF_pm_Locations_LocationId DEFAULT (newsequentialid()),
    SnipeLocationId int NULL,
    Name nvarchar(256) NOT NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_Locations_IsActive DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Locations_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Locations_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_Locations PRIMARY KEY CLUSTERED (LocationId),
    CONSTRAINT UQ_pm_Locations_Name UNIQUE (Name)
  );
END;

IF OBJECT_ID(N'pm.Assets', N'U') IS NULL
BEGIN
  CREATE TABLE pm.Assets (
    AssetId uniqueidentifier NOT NULL CONSTRAINT DF_pm_Assets_AssetId DEFAULT (newsequentialid()),
    SnipeAssetId int NULL,
    AssetTag nvarchar(64) NULL,
    Name nvarchar(256) NOT NULL,
    Manufacturer nvarchar(128) NULL,
    Model nvarchar(128) NULL,
    SerialNumber nvarchar(128) NULL,
    CategoryId uniqueidentifier NULL,
    LocationId uniqueidentifier NULL,
    AssetStatus nvarchar(64) NULL,
    AssignedToText nvarchar(256) NULL,
    IsArchived bit NOT NULL CONSTRAINT DF_pm_Assets_IsArchived DEFAULT (0),
    LastSyncedAt datetime2(0) NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Assets_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_Assets_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_Assets PRIMARY KEY CLUSTERED (AssetId),
    CONSTRAINT UQ_pm_Assets_SnipeAssetId UNIQUE (SnipeAssetId),
    CONSTRAINT FK_pm_Assets_AssetCategories FOREIGN KEY (CategoryId) REFERENCES pm.AssetCategories(CategoryId),
    CONSTRAINT FK_pm_Assets_Locations FOREIGN KEY (LocationId) REFERENCES pm.Locations(LocationId)
  );
END;

IF OBJECT_ID(N'pm.AssetPMSettings', N'U') IS NULL
BEGIN
  CREATE TABLE pm.AssetPMSettings (
    AssetId uniqueidentifier NOT NULL,
    PMEnabled bit NOT NULL CONSTRAINT DF_pm_AssetPMSettings_PMEnabled DEFAULT (1),
    DefaultTemplateId uniqueidentifier NULL,
    LastPMCompletedAt datetime2(0) NULL,
    NextPMDueAt datetime2(0) NULL,
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_AssetPMSettings_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_AssetPMSettings PRIMARY KEY CLUSTERED (AssetId),
    CONSTRAINT FK_pm_AssetPMSettings_Assets FOREIGN KEY (AssetId) REFERENCES pm.Assets(AssetId)
  );
END;

IF OBJECT_ID(N'pm.PMTemplates', N'U') IS NULL
BEGIN
  CREATE TABLE pm.PMTemplates (
    TemplateId uniqueidentifier NOT NULL CONSTRAINT DF_pm_PMTemplates_TemplateId DEFAULT (newsequentialid()),
    Name nvarchar(256) NOT NULL,
    Description nvarchar(1024) NULL,
    IntervalDays int NOT NULL,
    ApplicableCategoryId uniqueidentifier NULL,
    EstimatedDurationMinutes int NULL,
    RequiredRoleId uniqueidentifier NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_PMTemplates_IsActive DEFAULT (1),
    Version int NOT NULL CONSTRAINT DF_pm_PMTemplates_Version DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMTemplates_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMTemplates_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_PMTemplates PRIMARY KEY CLUSTERED (TemplateId),
    CONSTRAINT UQ_pm_PMTemplates_Name UNIQUE (Name),
    CONSTRAINT FK_pm_PMTemplates_AssetCategories FOREIGN KEY (ApplicableCategoryId) REFERENCES pm.AssetCategories(CategoryId),
    CONSTRAINT FK_pm_PMTemplates_Roles FOREIGN KEY (RequiredRoleId) REFERENCES pm.Roles(RoleId)
  );
END;

IF OBJECT_ID(N'pm.PMTemplateChecklistItems', N'U') IS NULL
BEGIN
  CREATE TABLE pm.PMTemplateChecklistItems (
    TemplateChecklistItemId uniqueidentifier NOT NULL CONSTRAINT DF_pm_PMTemplateChecklistItems_Id DEFAULT (newsequentialid()),
    TemplateId uniqueidentifier NOT NULL,
    SortOrder int NOT NULL,
    ItemText nvarchar(512) NOT NULL,
    IsMandatory bit NOT NULL CONSTRAINT DF_pm_PMTemplateChecklistItems_IsMandatory DEFAULT (1),
    RequiresNotes bit NOT NULL CONSTRAINT DF_pm_PMTemplateChecklistItems_RequiresNotes DEFAULT (0),
    RequiresPassFail bit NOT NULL CONSTRAINT DF_pm_PMTemplateChecklistItems_RequiresPassFail DEFAULT (1),
    IsActive bit NOT NULL CONSTRAINT DF_pm_PMTemplateChecklistItems_IsActive DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMTemplateChecklistItems_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMTemplateChecklistItems_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_PMTemplateChecklistItems PRIMARY KEY CLUSTERED (TemplateChecklistItemId),
    CONSTRAINT FK_pm_PMTemplateChecklistItems_Templates FOREIGN KEY (TemplateId) REFERENCES pm.PMTemplates(TemplateId)
  );
END;

IF OBJECT_ID(N'pm.AssignmentRules', N'U') IS NULL
BEGIN
  CREATE TABLE pm.AssignmentRules (
    RuleId uniqueidentifier NOT NULL CONSTRAINT DF_pm_AssignmentRules_RuleId DEFAULT (newsequentialid()),
    Priority int NOT NULL,
    CategoryId uniqueidentifier NULL,
    LocationId uniqueidentifier NULL,
    AssetStatus nvarchar(64) NULL,
    AssignToUserId uniqueidentifier NULL,
    AssignToRoleId uniqueidentifier NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_AssignmentRules_IsActive DEFAULT (1),
    EffectiveFrom datetime2(0) NULL,
    EffectiveTo datetime2(0) NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_AssignmentRules_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_AssignmentRules_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_AssignmentRules PRIMARY KEY CLUSTERED (RuleId),
    CONSTRAINT FK_pm_AssignmentRules_AssetCategories FOREIGN KEY (CategoryId) REFERENCES pm.AssetCategories(CategoryId),
    CONSTRAINT FK_pm_AssignmentRules_Locations FOREIGN KEY (LocationId) REFERENCES pm.Locations(LocationId),
    CONSTRAINT FK_pm_AssignmentRules_AssignToUser FOREIGN KEY (AssignToUserId) REFERENCES pm.Users(UserId),
    CONSTRAINT FK_pm_AssignmentRules_AssignToRole FOREIGN KEY (AssignToRoleId) REFERENCES pm.Roles(RoleId)
  );
END;

IF OBJECT_ID(N'pm.BlackoutWindows', N'U') IS NULL
BEGIN
  CREATE TABLE pm.BlackoutWindows (
    BlackoutWindowId uniqueidentifier NOT NULL CONSTRAINT DF_pm_BlackoutWindows_Id DEFAULT (newsequentialid()),
    Name nvarchar(256) NOT NULL,
    StartsAt datetime2(0) NOT NULL,
    EndsAt datetime2(0) NOT NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_BlackoutWindows_IsActive DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_BlackoutWindows_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_BlackoutWindows_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_BlackoutWindows PRIMARY KEY CLUSTERED (BlackoutWindowId)
  );
END;

IF OBJECT_ID(N'pm.PMSchedules', N'U') IS NULL
BEGIN
  CREATE TABLE pm.PMSchedules (
    ScheduleId uniqueidentifier NOT NULL CONSTRAINT DF_pm_PMSchedules_ScheduleId DEFAULT (newsequentialid()),
    AssetId uniqueidentifier NOT NULL,
    TemplateId uniqueidentifier NOT NULL,
    NextDueAt datetime2(0) NOT NULL,
    LastCalculatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMSchedules_LastCalculatedAt DEFAULT (sysutcdatetime()),
    Frozen bit NOT NULL CONSTRAINT DF_pm_PMSchedules_Frozen DEFAULT (0),
    Source nvarchar(32) NOT NULL CONSTRAINT DF_pm_PMSchedules_Source DEFAULT (N'auto'),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMSchedules_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMSchedules_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_PMSchedules PRIMARY KEY CLUSTERED (ScheduleId),
    CONSTRAINT FK_pm_PMSchedules_Assets FOREIGN KEY (AssetId) REFERENCES pm.Assets(AssetId),
    CONSTRAINT FK_pm_PMSchedules_Templates FOREIGN KEY (TemplateId) REFERENCES pm.PMTemplates(TemplateId)
  );
END;

IF OBJECT_ID(N'pm.PMTasks', N'U') IS NULL
BEGIN
  CREATE TABLE pm.PMTasks (
    TaskId uniqueidentifier NOT NULL CONSTRAINT DF_pm_PMTasks_TaskId DEFAULT (newsequentialid()),
    TaskNumber nvarchar(32) NOT NULL,
    AssetId uniqueidentifier NOT NULL,
    TemplateId uniqueidentifier NOT NULL,
    ScheduledDueAt datetime2(0) NOT NULL,
    AssignedToUserId uniqueidentifier NULL,
    AssignedToRoleId uniqueidentifier NULL,
    Status nvarchar(32) NOT NULL,
    Priority nvarchar(16) NOT NULL CONSTRAINT DF_pm_PMTasks_Priority DEFAULT (N'medium'),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMTasks_CreatedAt DEFAULT (sysutcdatetime()),
    StartedAt datetime2(0) NULL,
    CompletedAt datetime2(0) NULL,
    CompletedByUserId uniqueidentifier NULL,
    CancelledAt datetime2(0) NULL,
    CancelledByUserId uniqueidentifier NULL,
    ForceCompleted bit NOT NULL CONSTRAINT DF_pm_PMTasks_ForceCompleted DEFAULT (0),
    CONSTRAINT PK_pm_PMTasks PRIMARY KEY CLUSTERED (TaskId),
    CONSTRAINT UQ_pm_PMTasks_TaskNumber UNIQUE (TaskNumber),
    CONSTRAINT FK_pm_PMTasks_Assets FOREIGN KEY (AssetId) REFERENCES pm.Assets(AssetId),
    CONSTRAINT FK_pm_PMTasks_Templates FOREIGN KEY (TemplateId) REFERENCES pm.PMTemplates(TemplateId),
    CONSTRAINT FK_pm_PMTasks_AssignedToUser FOREIGN KEY (AssignedToUserId) REFERENCES pm.Users(UserId),
    CONSTRAINT FK_pm_PMTasks_AssignedToRole FOREIGN KEY (AssignedToRoleId) REFERENCES pm.Roles(RoleId),
    CONSTRAINT FK_pm_PMTasks_CompletedByUser FOREIGN KEY (CompletedByUserId) REFERENCES pm.Users(UserId),
    CONSTRAINT FK_pm_PMTasks_CancelledByUser FOREIGN KEY (CancelledByUserId) REFERENCES pm.Users(UserId)
  );
END;

IF OBJECT_ID(N'pm.PMTaskChecklistResults', N'U') IS NULL
BEGIN
  CREATE TABLE pm.PMTaskChecklistResults (
    TaskChecklistResultId uniqueidentifier NOT NULL CONSTRAINT DF_pm_PMTaskChecklistResults_Id DEFAULT (newsequentialid()),
    TaskId uniqueidentifier NOT NULL,
    TemplateChecklistItemId uniqueidentifier NOT NULL,
    Outcome tinyint NOT NULL,
    Notes nvarchar(1024) NULL,
    CompletedAt datetime2(0) NULL,
    CompletedByUserId uniqueidentifier NULL,
    CONSTRAINT PK_pm_PMTaskChecklistResults PRIMARY KEY CLUSTERED (TaskChecklistResultId),
    CONSTRAINT FK_pm_PMTaskChecklistResults_Tasks FOREIGN KEY (TaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT FK_pm_PMTaskChecklistResults_TemplateItems FOREIGN KEY (TemplateChecklistItemId) REFERENCES pm.PMTemplateChecklistItems(TemplateChecklistItemId),
    CONSTRAINT FK_pm_PMTaskChecklistResults_CompletedByUser FOREIGN KEY (CompletedByUserId) REFERENCES pm.Users(UserId)
  );
END;

IF OBJECT_ID(N'pm.PMTaskEvidence', N'U') IS NULL
BEGIN
  CREATE TABLE pm.PMTaskEvidence (
    EvidenceId uniqueidentifier NOT NULL CONSTRAINT DF_pm_PMTaskEvidence_EvidenceId DEFAULT (newsequentialid()),
    TaskId uniqueidentifier NOT NULL,
    FileName nvarchar(256) NULL,
    ContentType nvarchar(128) NULL,
    SizeBytes bigint NULL,
    Uri nvarchar(1024) NOT NULL,
    UploadedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_PMTaskEvidence_UploadedAt DEFAULT (sysutcdatetime()),
    UploadedByUserId uniqueidentifier NULL,
    CONSTRAINT PK_pm_PMTaskEvidence PRIMARY KEY CLUSTERED (EvidenceId),
    CONSTRAINT FK_pm_PMTaskEvidence_Tasks FOREIGN KEY (TaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT FK_pm_PMTaskEvidence_UploadedByUser FOREIGN KEY (UploadedByUserId) REFERENCES pm.Users(UserId)
  );
END;

IF OBJECT_ID(N'pm.NotificationChannels', N'U') IS NULL
BEGIN
  CREATE TABLE pm.NotificationChannels (
    ChannelId uniqueidentifier NOT NULL CONSTRAINT DF_pm_NotificationChannels_ChannelId DEFAULT (newsequentialid()),
    ChannelType nvarchar(32) NOT NULL,
    Config nvarchar(max) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_NotificationChannels_IsActive DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_NotificationChannels_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_NotificationChannels_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_NotificationChannels PRIMARY KEY CLUSTERED (ChannelId)
  );
END;

IF OBJECT_ID(N'pm.NotificationRules', N'U') IS NULL
BEGIN
  CREATE TABLE pm.NotificationRules (
    NotificationRuleId uniqueidentifier NOT NULL CONSTRAINT DF_pm_NotificationRules_Id DEFAULT (newsequentialid()),
    RuleName nvarchar(256) NOT NULL,
    EventType nvarchar(64) NOT NULL,
    OffsetDays int NULL,
    EscalateAfterDays int NULL,
    ChannelId uniqueidentifier NOT NULL,
    MessageTemplate nvarchar(max) NULL,
    IsActive bit NOT NULL CONSTRAINT DF_pm_NotificationRules_IsActive DEFAULT (1),
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_NotificationRules_CreatedAt DEFAULT (sysutcdatetime()),
    UpdatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_NotificationRules_UpdatedAt DEFAULT (sysutcdatetime()),
    CONSTRAINT PK_pm_NotificationRules PRIMARY KEY CLUSTERED (NotificationRuleId),
    CONSTRAINT FK_pm_NotificationRules_Channels FOREIGN KEY (ChannelId) REFERENCES pm.NotificationChannels(ChannelId)
  );
END;

IF OBJECT_ID(N'pm.NotificationLog', N'U') IS NULL
BEGIN
  CREATE TABLE pm.NotificationLog (
    NotificationLogId uniqueidentifier NOT NULL CONSTRAINT DF_pm_NotificationLog_Id DEFAULT (newsequentialid()),
    TaskId uniqueidentifier NULL,
    NotificationRuleId uniqueidentifier NULL,
    ChannelId uniqueidentifier NOT NULL,
    SentAt datetime2(0) NOT NULL CONSTRAINT DF_pm_NotificationLog_SentAt DEFAULT (sysutcdatetime()),
    Status nvarchar(32) NOT NULL,
    ErrorMessage nvarchar(1024) NULL,
    Payload nvarchar(max) NULL,
    CONSTRAINT PK_pm_NotificationLog PRIMARY KEY CLUSTERED (NotificationLogId),
    CONSTRAINT FK_pm_NotificationLog_Tasks FOREIGN KEY (TaskId) REFERENCES pm.PMTasks(TaskId),
    CONSTRAINT FK_pm_NotificationLog_Rules FOREIGN KEY (NotificationRuleId) REFERENCES pm.NotificationRules(NotificationRuleId),
    CONSTRAINT FK_pm_NotificationLog_Channel FOREIGN KEY (ChannelId) REFERENCES pm.NotificationChannels(ChannelId)
  );
END;

IF OBJECT_ID(N'pm.AuditLog', N'U') IS NULL
BEGIN
  CREATE TABLE pm.AuditLog (
    AuditLogId uniqueidentifier NOT NULL CONSTRAINT DF_pm_AuditLog_Id DEFAULT (newsequentialid()),
    ActorUserId uniqueidentifier NULL,
    Action nvarchar(128) NOT NULL,
    EntityType nvarchar(128) NOT NULL,
    EntityId uniqueidentifier NULL,
    OccurredAt datetime2(0) NOT NULL CONSTRAINT DF_pm_AuditLog_OccurredAt DEFAULT (sysutcdatetime()),
    Metadata nvarchar(max) NULL,
    IpAddress nvarchar(64) NULL,
    UserAgent nvarchar(512) NULL,
    CONSTRAINT PK_pm_AuditLog PRIMARY KEY CLUSTERED (AuditLogId),
    CONSTRAINT FK_pm_AuditLog_ActorUser FOREIGN KEY (ActorUserId) REFERENCES pm.Users(UserId)
  );
END;

IF OBJECT_ID(N'pm.SystemLog', N'U') IS NULL
BEGIN
  CREATE TABLE pm.SystemLog (
    SystemLogId uniqueidentifier NOT NULL CONSTRAINT DF_pm_SystemLog_Id DEFAULT (newsequentialid()),
    LogLevel nvarchar(16) NOT NULL,
    Message nvarchar(1024) NOT NULL,
    CreatedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_SystemLog_CreatedAt DEFAULT (sysutcdatetime()),
    Context nvarchar(max) NULL,
    CONSTRAINT PK_pm_SystemLog PRIMARY KEY CLUSTERED (SystemLogId)
  );
END;

IF OBJECT_ID(N'pm.SnipeSyncRuns', N'U') IS NULL
BEGIN
  CREATE TABLE pm.SnipeSyncRuns (
    SnipeSyncRunId uniqueidentifier NOT NULL CONSTRAINT DF_pm_SnipeSyncRuns_Id DEFAULT (newsequentialid()),
    StartedAt datetime2(0) NOT NULL CONSTRAINT DF_pm_SnipeSyncRuns_StartedAt DEFAULT (sysutcdatetime()),
    CompletedAt datetime2(0) NULL,
    Status nvarchar(32) NOT NULL,
    AssetsProcessed int NULL,
    ErrorMessage nvarchar(2048) NULL,
    CONSTRAINT PK_pm_SnipeSyncRuns PRIMARY KEY CLUSTERED (SnipeSyncRunId)
  );
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pm_Assets_CategoryId' AND object_id = OBJECT_ID(N'pm.Assets'))
BEGIN
  CREATE INDEX IX_pm_Assets_CategoryId ON pm.Assets(CategoryId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pm_Assets_LocationId' AND object_id = OBJECT_ID(N'pm.Assets'))
BEGIN
  CREATE INDEX IX_pm_Assets_LocationId ON pm.Assets(LocationId);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pm_PMTasks_Status_Due' AND object_id = OBJECT_ID(N'pm.PMTasks'))
BEGIN
  CREATE INDEX IX_pm_PMTasks_Status_Due ON pm.PMTasks(Status, ScheduledDueAt);
END;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_pm_PMSchedules_AssetId' AND object_id = OBJECT_ID(N'pm.PMSchedules'))
BEGIN
  CREATE INDEX IX_pm_PMSchedules_AssetId ON pm.PMSchedules(AssetId);
END;
