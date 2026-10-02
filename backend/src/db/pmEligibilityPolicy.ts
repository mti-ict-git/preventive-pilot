import sql from "mssql";
import { writeAuditLog } from "./auditLog.js";

type SqlExecutor = { request(): sql.Request };
export type PmEligibilityKind = "asset" | "facility";
export class PmEligibilityError extends Error {
  readonly code = "PM_ACTIVATION_INVALID";
  constructor(public readonly contextId: string, public readonly field: string, message: string) { super(message); }
}

// Call inside the same transaction as the settings/master mutation. HOLDLOCK protects
// the effective site/template while the activation is committed.
export const validateEnabledPmContext = async (executor: SqlExecutor, kind: PmEligibilityKind, contextId: string): Promise<void> => {
  const asset = kind === "asset";
  const result = await executor.request().input("contextId", sql.UniqueIdentifier, contextId).query([
    "/* pm-eligibility: activation */",
    "SELECT c.LocationId, s.PMEnabled, s.DefaultTemplateId, tpl.IsActive AS TemplateIsActive,",
    asset ? "  c.CategoryId AS CategoryId, tpl.ApplicableCategoryId AS TemplateCategoryId" : "  NULL AS CategoryId, NULL AS TemplateCategoryId",
    `FROM pm.${asset ? "Assets" : "Facilities"} c WITH (UPDLOCK, HOLDLOCK)`,
    `LEFT JOIN pm.${asset ? "Asset" : "Facility"}PMSettings s WITH (UPDLOCK, HOLDLOCK) ON s.${asset ? "AssetId" : "FacilityId"} = c.${asset ? "AssetId" : "FacilityId"}`,
    "LEFT JOIN pm.PMTemplates tpl WITH (HOLDLOCK) ON tpl.TemplateId = s.DefaultTemplateId",
    `WHERE c.${asset ? "AssetId" : "FacilityId"} = @contextId`,
  ].join("\n"));
  const row = result.recordset[0] as Record<string, unknown> | undefined;
  if (!row || !(row.PMEnabled === true || row.PMEnabled === 1)) return;
  if (!row.LocationId) throw new PmEligibilityError(contextId, "locationId", "A site is required to enable PM.");
  if (!row.DefaultTemplateId || !(row.TemplateIsActive === true || row.TemplateIsActive === 1)) {
    throw new PmEligibilityError(contextId, "defaultTemplateId", "An active default template is required to enable PM.");
  }
  if (asset && row.TemplateCategoryId && row.TemplateCategoryId !== row.CategoryId) {
    throw new PmEligibilityError(contextId, "defaultTemplateId", "The PM template must match the asset category.");
  }
};

export const cancelUnstartedPmTasks = async (input: {
  executor: SqlExecutor; kind: PmEligibilityKind; contextId: string; actorUserId: string;
  reason: "PM disabled" | "Facility archived"; ipAddress: string | null; userAgent: string | null;
}): Promise<void> => {
  const result = await input.executor.request()
    .input("contextId", sql.UniqueIdentifier, input.contextId)
    .input("actorUserId", sql.UniqueIdentifier, input.actorUserId)
    .input("reason", sql.NVarChar(1024), input.reason)
    .query([
      "/* pm-eligibility: cancel-unstarted */",
      "UPDATE t SET Status = N'cancelled', CancelledAt = sysutcdatetime(),",
      "  CancelledByUserId = @actorUserId, CancelledReason = @reason",
      "OUTPUT inserted.TaskId AS TaskId",
      "FROM pm.PMTasks t WITH (UPDLOCK, HOLDLOCK)",
      `WHERE t.${input.kind === "asset" ? "AssetId" : "FacilityId"} = @contextId`,
      "  AND t.MaintenanceType = N'PM' AND t.Status = N'open'",
      "  AND t.StartedAt IS NULL AND t.TechnicianCompletedAt IS NULL",
      "  AND t.CompletedAt IS NULL AND t.CancelledAt IS NULL",
      "  AND ISNULL(t.ApprovalStatus, N'None') = N'None'",
      "  AND t.RevisedAt IS NULL AND t.RejectedAt IS NULL",
      "  AND NOT EXISTS (SELECT 1 FROM pm.TaskWorkSessions w WITH (HOLDLOCK) WHERE w.TaskId = t.TaskId)",
    ].join("\n"));
  for (const row of result.recordset as Array<{ TaskId: string }>) {
    await writeAuditLog({ executor: input.executor, actorUserId: input.actorUserId,
      action: "task.cancel.pm-disabled", entityType: "task", entityId: row.TaskId,
      metadata: { reason: input.reason, contextKind: input.kind, contextId: input.contextId },
      ipAddress: input.ipAddress, userAgent: input.userAgent });
  }
};

