import sql from "mssql";

type SqlExecutor = sql.ConnectionPool | sql.Transaction;

const toBoolean = (value: unknown): boolean => value === true || value === 1 || value === "1";

export type TaskChecklistDefinitionSource = "live" | "snapshot" | "legacy-live";

export type TaskChecklistDefinitionItem = {
  templateChecklistItemId: string;
  sortOrder: number;
  itemText: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  enableAttachment: boolean;
  requiresAttachment: boolean;
  isActive: boolean;
};

export type TaskChecklistDefinition = {
  source: TaskChecklistDefinitionSource;
  capturedAt: Date | null;
  sourceTemplateVersion: number | null;
  items: TaskChecklistDefinitionItem[];
};

type LoadTaskChecklistDefinitionInput = {
  executor: SqlExecutor;
  taskId: string;
  templateId: string;
  historicalSubmitted: boolean;
};

const mapDefinitionItems = (rows: Array<Record<string, unknown>>): TaskChecklistDefinitionItem[] =>
  rows.map((row) => ({
    templateChecklistItemId: String(row.TemplateChecklistItemId),
    sortOrder: Number(row.SortOrder ?? 0),
    itemText: typeof row.ItemText === "string" ? row.ItemText : "",
    isMandatory: toBoolean(row.IsMandatory),
    requiresNotes: toBoolean(row.RequiresNotes),
    requiresPassFail: toBoolean(row.RequiresPassFail),
    enableAttachment: toBoolean(row.EnableAttachment),
    requiresAttachment: toBoolean(row.RequiresAttachment),
    isActive: toBoolean(row.IsActive),
  }));

const loadSnapshotRows = async (executor: SqlExecutor, taskId: string): Promise<Array<Record<string, unknown>>> => {
  const result = await executor
    .request()
    .input("taskId", sql.UniqueIdentifier, taskId)
    .query(
      [
        "SELECT",
        "  s.TemplateChecklistItemId AS TemplateChecklistItemId,",
        "  s.SortOrder AS SortOrder,",
        "  s.ItemText AS ItemText,",
        "  s.IsMandatory AS IsMandatory,",
        "  s.RequiresNotes AS RequiresNotes,",
        "  s.RequiresPassFail AS RequiresPassFail,",
        "  s.EnableAttachment AS EnableAttachment,",
        "  s.RequiresAttachment AS RequiresAttachment,",
        "  s.IsActive AS IsActive,",
        "  s.SourceTemplateVersion AS SourceTemplateVersion,",
        "  s.CapturedAt AS CapturedAt",
        "FROM pm.PMTaskChecklistSnapshots s",
        "WHERE s.TaskId = @taskId",
        "ORDER BY s.SortOrder ASC, s.TemplateChecklistItemId ASC",
      ].join("\n"),
    );

  return result.recordset as Array<Record<string, unknown>>;
};

const loadLiveRows = async (executor: SqlExecutor, templateId: string): Promise<Array<Record<string, unknown>>> => {
  const result = await executor
    .request()
    .input("templateId", sql.UniqueIdentifier, templateId)
    .query(
      [
        "SELECT",
        "  i.TemplateChecklistItemId AS TemplateChecklistItemId,",
        "  i.SortOrder AS SortOrder,",
        "  i.ItemText AS ItemText,",
        "  i.IsMandatory AS IsMandatory,",
        "  i.RequiresNotes AS RequiresNotes,",
        "  i.RequiresPassFail AS RequiresPassFail,",
        "  i.EnableAttachment AS EnableAttachment,",
        "  i.RequiresAttachment AS RequiresAttachment,",
        "  i.IsActive AS IsActive,",
        "  tpl.Version AS SourceTemplateVersion",
        "FROM pm.PMTemplates tpl",
        "INNER JOIN pm.PMTemplateChecklistItems i ON i.TemplateId = tpl.TemplateId",
        "WHERE tpl.TemplateId = @templateId",
        "ORDER BY i.SortOrder ASC, i.TemplateChecklistItemId ASC",
      ].join("\n"),
    );

  return result.recordset as Array<Record<string, unknown>>;
};

export const loadTaskChecklistDefinition = async (
  input: LoadTaskChecklistDefinitionInput,
): Promise<TaskChecklistDefinition> => {
  const snapshotRows = await loadSnapshotRows(input.executor, input.taskId);
  if (snapshotRows.length > 0) {
    const first = snapshotRows[0];
    return {
      source: "snapshot",
      capturedAt: first.CapturedAt instanceof Date ? first.CapturedAt : first.CapturedAt ? new Date(String(first.CapturedAt)) : null,
      sourceTemplateVersion:
        typeof first.SourceTemplateVersion === "number"
          ? first.SourceTemplateVersion
          : first.SourceTemplateVersion
            ? Number(first.SourceTemplateVersion)
            : null,
      items: mapDefinitionItems(snapshotRows),
    };
  }

  const liveRows = await loadLiveRows(input.executor, input.templateId);
  return {
    source: input.historicalSubmitted ? "legacy-live" : "live",
    capturedAt: null,
    sourceTemplateVersion:
      liveRows.length > 0
        ? typeof liveRows[0].SourceTemplateVersion === "number"
          ? liveRows[0].SourceTemplateVersion
          : liveRows[0].SourceTemplateVersion
            ? Number(liveRows[0].SourceTemplateVersion)
            : null
        : null,
    items: mapDefinitionItems(liveRows),
  };
};

type EnsureTaskChecklistSnapshotInput = {
  tx: sql.Transaction;
  taskId: string;
  templateId: string;
};

export const ensureTaskChecklistSnapshot = async (input: EnsureTaskChecklistSnapshotInput): Promise<void> => {
  await input.tx
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .input("templateId", sql.UniqueIdentifier, input.templateId)
    .query(
      [
        "IF NOT EXISTS (",
        "  SELECT 1",
        "  FROM pm.PMTaskChecklistSnapshots s WITH (UPDLOCK, HOLDLOCK)",
        "  WHERE s.TaskId = @taskId",
        ")",
        "BEGIN",
        "  INSERT INTO pm.PMTaskChecklistSnapshots (",
        "    TaskId,",
        "    TemplateChecklistItemId,",
        "    SortOrder,",
        "    ItemText,",
        "    IsMandatory,",
        "    RequiresNotes,",
        "    RequiresPassFail,",
        "    EnableAttachment,",
        "    RequiresAttachment,",
        "    IsActive,",
        "    SourceTemplateVersion",
        "  )",
        "  SELECT",
        "    @taskId,",
        "    i.TemplateChecklistItemId,",
        "    i.SortOrder,",
        "    i.ItemText,",
        "    i.IsMandatory,",
        "    i.RequiresNotes,",
        "    i.RequiresPassFail,",
        "    i.EnableAttachment,",
        "    i.RequiresAttachment,",
        "    i.IsActive,",
        "    tpl.Version",
        "  FROM pm.PMTemplates tpl WITH (UPDLOCK, HOLDLOCK)",
        "  INNER JOIN pm.PMTemplateChecklistItems i WITH (UPDLOCK, HOLDLOCK)",
        "    ON i.TemplateId = tpl.TemplateId",
        "  WHERE tpl.TemplateId = @templateId;",
        "END",
      ].join("\n"),
    );
};

type LoadTaskChecklistItemDefinitionInput = {
  executor: SqlExecutor;
  taskId: string;
  templateId: string;
  templateChecklistItemId: string;
};

export const loadTaskChecklistItemDefinition = async (
  input: LoadTaskChecklistItemDefinitionInput,
): Promise<(TaskChecklistDefinitionItem & { source: "snapshot" | "live" }) | null> => {
  const snapshotResult = await input.executor
    .request()
    .input("taskId", sql.UniqueIdentifier, input.taskId)
    .input("templateChecklistItemId", sql.UniqueIdentifier, input.templateChecklistItemId)
    .query(
      [
        "SELECT TOP (1)",
        "  s.TemplateChecklistItemId AS TemplateChecklistItemId,",
        "  s.SortOrder AS SortOrder,",
        "  s.ItemText AS ItemText,",
        "  s.IsMandatory AS IsMandatory,",
        "  s.RequiresNotes AS RequiresNotes,",
        "  s.RequiresPassFail AS RequiresPassFail,",
        "  s.EnableAttachment AS EnableAttachment,",
        "  s.RequiresAttachment AS RequiresAttachment,",
        "  s.IsActive AS IsActive",
        "FROM pm.PMTaskChecklistSnapshots s",
        "WHERE s.TaskId = @taskId",
        "  AND s.TemplateChecklistItemId = @templateChecklistItemId",
      ].join("\n"),
    );

  const snapshotRow = snapshotResult.recordset[0] as Record<string, unknown> | undefined;
  if (snapshotRow) {
    return { ...mapDefinitionItems([snapshotRow])[0], source: "snapshot" };
  }

  const liveResult = await input.executor
    .request()
    .input("templateId", sql.UniqueIdentifier, input.templateId)
    .input("templateChecklistItemId", sql.UniqueIdentifier, input.templateChecklistItemId)
    .query(
      [
        "SELECT TOP (1)",
        "  i.TemplateChecklistItemId AS TemplateChecklistItemId,",
        "  i.SortOrder AS SortOrder,",
        "  i.ItemText AS ItemText,",
        "  i.IsMandatory AS IsMandatory,",
        "  i.RequiresNotes AS RequiresNotes,",
        "  i.RequiresPassFail AS RequiresPassFail,",
        "  i.EnableAttachment AS EnableAttachment,",
        "  i.RequiresAttachment AS RequiresAttachment,",
        "  i.IsActive AS IsActive",
        "FROM pm.PMTemplateChecklistItems i",
        "WHERE i.TemplateChecklistItemId = @templateChecklistItemId",
        "  AND i.TemplateId = @templateId",
      ].join("\n"),
    );
  const liveRow = liveResult.recordset[0] as Record<string, unknown> | undefined;
  if (!liveRow) return null;
  return { ...mapDefinitionItems([liveRow])[0], source: "live" };
};
