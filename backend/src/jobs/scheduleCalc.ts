import { lockPmContext } from "../db/pmActiveWorkPolicy.js";
import sql from "mssql";
import { env } from "../config/env.js";
import { resolvePmAssignment } from "../db/pmAssignment.js";
import { getDb } from "../db/mssql.js";
import {
  createPmTaskForOccurrence,
  loadAssetPmScheduleContext,
  loadFacilityPmScheduleContext,
  reconcilePmScheduleContext,
} from "../db/pmSchedulingPolicy.js";
import { writeSystemLog } from "./systemLog.js";

const loadEligibleAssetIds = async (): Promise<string[]> => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT a.AssetId AS AssetId",
        "FROM pm.Assets a",
        "INNER JOIN pm.AssetPMSettings s ON s.AssetId = a.AssetId",
        "INNER JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "LEFT JOIN pm.PMSchedules sch ON sch.AssetId = a.AssetId AND sch.TemplateId = s.DefaultTemplateId",
        "WHERE a.IsArchived = 0 AND a.LocationId IS NOT NULL",
        "  AND (a.AssetOperationalStatus IS NULL OR a.AssetOperationalStatus NOT IN (N'broken', N'archived'))",
        "  AND s.PMEnabled = 1",
        "  AND s.DefaultTemplateId IS NOT NULL",
        "  AND t.IsActive = 1",
        "  AND (t.ApplicableCategoryId IS NULL OR t.ApplicableCategoryId=a.CategoryId)",
        "  AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
      ].join("\n"),
    );
  return (result.recordset as Array<Record<string, unknown>>)
    .map((row) => (typeof row.AssetId === "string" ? row.AssetId : null))
    .filter((value): value is string => value !== null);
};

const loadEligibleFacilityIds = async (): Promise<string[]> => {
  const db = await getDb();
  const result = await db
    .request()
    .query(
      [
        "SELECT f.FacilityId AS FacilityId",
        "FROM pm.Facilities f",
        "INNER JOIN pm.FacilityPMSettings s ON s.FacilityId = f.FacilityId",
        "INNER JOIN pm.PMTemplates t ON t.TemplateId = s.DefaultTemplateId",
        "LEFT JOIN pm.FacilityPMSchedules sch ON sch.FacilityId = f.FacilityId AND sch.TemplateId = s.DefaultTemplateId",
        "WHERE f.IsActive = 1 AND f.LocationId IS NOT NULL",
        "  AND s.PMEnabled = 1",
        "  AND s.DefaultTemplateId IS NOT NULL",
        "  AND t.IsActive = 1",
        "  AND (sch.Frozen IS NULL OR sch.Frozen = 0)",
      ].join("\n"),
    );
  return (result.recordset as Array<Record<string, unknown>>)
    .map((row) => (typeof row.FacilityId === "string" ? row.FacilityId : null))
    .filter((value): value is string => value !== null);
};

export const runScheduleCalculationJob = async (): Promise<void> => {
  const db = await getDb();
  const horizonDays = env.JOB_TASK_HORIZON_DAYS;
  const startedAt = Date.now();
  const horizonAt = new Date(Date.now() + horizonDays * 24 * 60 * 60 * 1000);

  await writeSystemLog({ level: "info", message: "Schedule calculation started", context: { job: "schedule-calc" } });

  const assetIds = await loadEligibleAssetIds();
  const facilityIds = await loadEligibleFacilityIds();

  let created = 0;
  let facilityCreated = 0;
  let reconciledAssets = 0;
  let reconciledFacilities = 0;

  for (const assetId of assetIds) {
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      await lockPmContext(tx, assetId);
    const context = await loadAssetPmScheduleContext({ executor: tx, assetId });
    if (!context) { await tx.commit(); continue; }
    const occurrence = await reconcilePmScheduleContext({ executor: tx, context });
    reconciledAssets += 1;
    if (!occurrence || occurrence.task || occurrence.scheduledDueAt.getTime() > horizonAt.getTime()) { await tx.commit(); continue; }

    const assignment = await resolvePmAssignment({
      executor: tx,
      templateId: context.templateId,
      categoryId: context.categoryId,
      locationId: context.locationId,
      assetStatus: context.assetStatus,
      requiredRoleId: context.requiredRoleId,
    });
    const taskId = await createPmTaskForOccurrence({
      executor: tx,
      context,
      occurrence,
      assignedToUserId: assignment.assignToUserId,
      assignedToRoleId: assignment.assignToRoleId,
    });
    if (taskId) created += 1;
    await tx.commit();
    } catch (error) {
      try { await tx.rollback(); } catch { /* Original error takes precedence. */ }
      throw error;
    }
  }

  for (const facilityId of facilityIds) {
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      await lockPmContext(tx, facilityId);
    const context = await loadFacilityPmScheduleContext({ executor: tx, facilityId });
    if (!context) { await tx.commit(); continue; }
    const occurrence = await reconcilePmScheduleContext({ executor: tx, context });
    reconciledFacilities += 1;
    if (!occurrence || occurrence.task || occurrence.scheduledDueAt.getTime() > horizonAt.getTime()) { await tx.commit(); continue; }

    const assignment = await resolvePmAssignment({
      executor: tx,
      templateId: context.templateId,
      categoryId: null,
      locationId: context.locationId,
      assetStatus: null,
      requiredRoleId: context.requiredRoleId,
    });
    const taskId = await createPmTaskForOccurrence({
      executor: tx,
      context,
      occurrence,
      assignedToUserId: assignment.assignToUserId,
      assignedToRoleId: assignment.assignToRoleId,
    });
    if (taskId) facilityCreated += 1;
    await tx.commit();
    } catch (error) {
      try { await tx.rollback(); } catch { /* Original error takes precedence. */ }
      throw error;
    }
  }

  const durationMs = Date.now() - startedAt;
  await writeSystemLog({
    level: "info",
    message: "Schedule calculation completed",
    context: {
      job: "schedule-calc",
      assets: assetIds.length,
      facilities: facilityIds.length,
      reconciledAssets,
      reconciledFacilities,
      created,
      facilityCreated,
      durationMs,
    },
  });
};
