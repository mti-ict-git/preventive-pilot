import { env } from "../config/env";
import { getDb } from "../db/mssql";
import { writeSystemLog } from "./systemLog";
import { runSnipeSyncJob } from "./snipeSync";
import { runScheduleCalculationJob } from "./scheduleCalc";
import { runReminderEscalationJob } from "./reminders";
import { runEvidenceImportJob } from "./evidenceImport.js";

export type JobName = "snipe-sync" | "schedule-calc" | "notifications" | "evidence-import";

type RunJobOptions = {
  force?: boolean;
};

const minutesToMs = (minutes: number): number => minutes * 60 * 1000;

const runningJobs: Record<JobName, boolean> = {
  "snipe-sync": false,
  "schedule-calc": false,
  notifications: false,
  "evidence-import": false,
};

const runJobImpl = async (name: JobName, options?: RunJobOptions): Promise<void> => {
  if (name === "snipe-sync") {
    await runSnipeSyncJob({ force: options?.force });
    return;
  }

  if (name === "schedule-calc") {
    await runScheduleCalculationJob();
    return;
  }

  if (name === "evidence-import") {
    await runEvidenceImportJob();
    return;
  }

  await runReminderEscalationJob();
};

export const runJobNow = async (name: JobName, options?: RunJobOptions): Promise<boolean> => {
  if (runningJobs[name]) return false;
  runningJobs[name] = true;
  try {
    await runJobImpl(name, options);
    return true;
  } finally {
    runningJobs[name] = false;
  }
};

const schedule = (name: JobName, intervalMinutes: number): void => {
  const run = async () => {
    try {
      await runJobNow(name);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await writeSystemLog({ level: "error", message: `Job failed: ${name}`, context: { job: name, error: message } });
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, minutesToMs(intervalMinutes));
};

const loadSnipeSchedulerConfig = async (): Promise<{ enabled: boolean; scheduleIntervalMinutes: number }> => {
  let dbRow: Record<string, unknown> | null = null;
  try {
    const db = await getDb();
    const result = await db
      .request()
      .query(
        [
          "SELECT TOP (1)",
          "  AutoSyncEnabled, SyncIntervalMinutes",
          "FROM pm.SnipeItSettings",
          "ORDER BY UpdatedAt DESC",
        ].join("\n"),
      );
    dbRow = (result.recordset[0] as Record<string, unknown> | undefined) ?? null;
  } catch {
    dbRow = null;
  }

  const enabled =
    typeof dbRow?.AutoSyncEnabled === "boolean"
      ? dbRow.AutoSyncEnabled
      : typeof dbRow?.AutoSyncEnabled === "number"
        ? dbRow.AutoSyncEnabled === 1
        : env.JOB_SNIPE_SYNC_ENABLED;

  const requestedInterval =
    typeof dbRow?.SyncIntervalMinutes === "number" && Number.isFinite(dbRow.SyncIntervalMinutes)
      ? dbRow.SyncIntervalMinutes
      : env.JOB_SNIPE_SYNC_INTERVAL_MINUTES;

  return {
    enabled,
    scheduleIntervalMinutes: Math.max(1, requestedInterval),
  };
};

export const startJobs = async (): Promise<void> => {
  if (!env.JOBS_ENABLED) {
    await writeSystemLog({ level: "info", message: "Job scheduler disabled", context: { jobsEnabled: false } });
    return;
  }

  await writeSystemLog({ level: "info", message: "Job scheduler started", context: { jobsEnabled: true } });

  const snipe = await loadSnipeSchedulerConfig();
  if (snipe.enabled) {
    schedule("snipe-sync", snipe.scheduleIntervalMinutes);
  }

  schedule("schedule-calc", env.JOB_SCHEDULE_CALC_INTERVAL_MINUTES);
  schedule("notifications", env.JOB_NOTIFICATION_INTERVAL_MINUTES);

  if (env.JOB_EVIDENCE_IMPORT_ENABLED && env.EVIDENCE_IMPORT_ROOT && env.EVIDENCE_STORAGE_ROOT) {
    schedule("evidence-import", env.JOB_EVIDENCE_IMPORT_INTERVAL_MINUTES);
  }
};
