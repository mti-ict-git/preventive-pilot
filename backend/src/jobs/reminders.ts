import sql from "mssql";
import { getDb } from "../db/mssql";
import { writeSystemLog } from "./systemLog";

type NotificationRuleRow = {
  NotificationRuleId: string;
  RuleName: string;
  EventType: string;
  OffsetDays: number | null;
  EscalateAfterDays: number | null;
  ChannelId: string;
  ChannelType: string;
  MessageTemplate: string | null;
};

type TaskRow = {
  TaskId: string;
  TaskNumber: string;
  ScheduledDueAt: Date;
  Status: string;
  Priority: string;
  AssetId: string;
  AssetTag: string | null;
  AssetName: string;
  TemplateId: string;
  TemplateName: string;
};

const renderTemplate = (template: string, data: Record<string, string>): string => {
  let rendered = template;
  for (const [key, value] of Object.entries(data)) {
    const safeKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rendered = rendered.replace(new RegExp(`\\{\\{\\s*${safeKey}\\s*\\}\\}`, "g"), value);
  }
  return rendered;
};

const loadActiveRules = async (): Promise<NotificationRuleRow[]> => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT",
        "  r.NotificationRuleId AS NotificationRuleId,",
        "  r.RuleName AS RuleName,",
        "  r.EventType AS EventType,",
        "  r.OffsetDays AS OffsetDays,",
        "  r.EscalateAfterDays AS EscalateAfterDays,",
        "  r.ChannelId AS ChannelId,",
        "  c.ChannelType AS ChannelType,",
        "  r.MessageTemplate AS MessageTemplate",
        "FROM pm.NotificationRules r",
        "INNER JOIN pm.NotificationChannels c ON c.ChannelId = r.ChannelId",
        "WHERE r.IsActive = 1 AND c.IsActive = 1",
        "ORDER BY r.UpdatedAt DESC",
      ].join("\n"),
    );
  return result.recordset as NotificationRuleRow[];
};

const loadTasksForOffsetRule = async (rule: NotificationRuleRow): Promise<TaskRow[]> => {
  if (rule.OffsetDays === null) return [];
  const db = await getDb();
  const result = await db
    .request()
    .input("offsetDays", sql.Int, rule.OffsetDays)
    .query(
      [
        "SELECT",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  a.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "WHERE",
        "  t.CompletedAt IS NULL",
        "  AND t.CancelledAt IS NULL",
        "  AND t.ScheduledDueAt >= DATEADD(day, @offsetDays, CAST(sysutcdatetime() AS date))",
        "  AND t.ScheduledDueAt < DATEADD(day, @offsetDays + 1, CAST(sysutcdatetime() AS date))",
      ].join("\n"),
    );
  return result.recordset as TaskRow[];
};

const loadTasksForEscalationRule = async (rule: NotificationRuleRow): Promise<TaskRow[]> => {
  if (rule.EscalateAfterDays === null) return [];
  const db = await getDb();
  const result = await db
    .request()
    .input("escalateAfterDays", sql.Int, rule.EscalateAfterDays)
    .query(
      [
        "SELECT",
        "  t.TaskId AS TaskId,",
        "  t.TaskNumber AS TaskNumber,",
        "  t.ScheduledDueAt AS ScheduledDueAt,",
        "  t.Status AS Status,",
        "  t.Priority AS Priority,",
        "  a.AssetId AS AssetId,",
        "  a.AssetTag AS AssetTag,",
        "  a.Name AS AssetName,",
        "  tpl.TemplateId AS TemplateId,",
        "  tpl.Name AS TemplateName",
        "FROM pm.PMTasks t",
        "INNER JOIN pm.Assets a ON a.AssetId = t.AssetId",
        "INNER JOIN pm.PMTemplates tpl ON tpl.TemplateId = t.TemplateId",
        "WHERE",
        "  t.CompletedAt IS NULL",
        "  AND t.CancelledAt IS NULL",
        "  AND t.ScheduledDueAt < DATEADD(day, -@escalateAfterDays, sysutcdatetime())",
      ].join("\n"),
    );
  return result.recordset as TaskRow[];
};

const enqueueNotification = async (rule: NotificationRuleRow, task: TaskRow, message: string): Promise<boolean> => {
  const payload = JSON.stringify({
    rule: { id: rule.NotificationRuleId, name: rule.RuleName, eventType: rule.EventType },
    channel: { id: rule.ChannelId, type: rule.ChannelType },
    task: {
      id: task.TaskId,
      taskNumber: task.TaskNumber,
      scheduledDueAt: task.ScheduledDueAt,
      status: task.Status,
      priority: task.Priority,
    },
    asset: { id: task.AssetId, assetTag: task.AssetTag, name: task.AssetName },
    template: { id: task.TemplateId, name: task.TemplateName },
    message,
  });

  const db = await getDb();
  const inserted = await db
    .request()
    .input("taskId", sql.UniqueIdentifier, task.TaskId)
    .input("ruleId", sql.UniqueIdentifier, rule.NotificationRuleId)
    .input("channelId", sql.UniqueIdentifier, rule.ChannelId)
    .input("status", sql.NVarChar(32), "queued")
    .input("payload", sql.NVarChar(sql.MAX), payload)
    .query(
      [
        "IF NOT EXISTS (",
        "  SELECT 1",
        "  FROM pm.NotificationLog",
        "  WHERE TaskId = @taskId",
        "    AND NotificationRuleId = @ruleId",
        "    AND CAST(SentAt AS date) = CAST(sysutcdatetime() AS date)",
        ")",
        "BEGIN",
        "  INSERT INTO pm.NotificationLog (TaskId, NotificationRuleId, ChannelId, Status, Payload)",
        "  VALUES (@taskId, @ruleId, @channelId, @status, @payload)",
        "  SELECT CAST(1 AS bit) AS Inserted",
        "END",
        "ELSE",
        "BEGIN",
        "  SELECT CAST(0 AS bit) AS Inserted",
        "END",
      ].join("\n"),
    );

  const row = inserted.recordset[0] as { Inserted?: boolean } | undefined;
  return row?.Inserted === true;
};

export const runReminderEscalationJob = async (): Promise<void> => {
  const startedAt = Date.now();
  await writeSystemLog({ level: "info", message: "Notification job started", context: { job: "notifications" } });

  const rules = await loadActiveRules();
  let queued = 0;
  let examined = 0;

  for (const rule of rules) {
    const template =
      rule.MessageTemplate ??
      "Task {{taskNumber}} for {{assetName}} is due at {{dueAt}} ({{templateName}}).";

    const tasksForOffset = await loadTasksForOffsetRule(rule);
    const tasksForEscalation = await loadTasksForEscalationRule(rule);
    const tasks = [...tasksForOffset, ...tasksForEscalation];

    for (const task of tasks) {
      examined += 1;
      const message = renderTemplate(template, {
        taskNumber: task.TaskNumber,
        assetTag: task.AssetTag ?? "",
        assetName: task.AssetName,
        templateName: task.TemplateName,
        dueAt: task.ScheduledDueAt.toISOString(),
      });
      const didQueue = await enqueueNotification(rule, task, message);
      if (didQueue) queued += 1;
    }
  }

  const durationMs = Date.now() - startedAt;
  await writeSystemLog({
    level: "info",
    message: "Notification job completed",
    context: { job: "notifications", rules: rules.length, examined, queued, durationMs },
  });
};
