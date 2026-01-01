import { env } from "../config/env";
import { writeSystemLog } from "./systemLog";
import { runSnipeSyncJob } from "./snipeSync";
import { runScheduleCalculationJob } from "./scheduleCalc";
import { runReminderEscalationJob } from "./reminders";

type JobFn = () => Promise<void>;

const minutesToMs = (minutes: number): number => minutes * 60 * 1000;

const schedule = (name: string, intervalMinutes: number, fn: JobFn): void => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      await writeSystemLog({ level: "error", message: `Job failed: ${name}`, context: { job: name, error: message } });
    } finally {
      running = false;
    }
  };

  void run();
  setInterval(() => {
    void run();
  }, minutesToMs(intervalMinutes));
};

export const startJobs = async (): Promise<void> => {
  if (!env.JOBS_ENABLED) {
    await writeSystemLog({ level: "info", message: "Job scheduler disabled", context: { jobsEnabled: false } });
    return;
  }

  await writeSystemLog({ level: "info", message: "Job scheduler started", context: { jobsEnabled: true } });

  if (env.JOB_SNIPE_SYNC_ENABLED) {
    schedule("snipe-sync", env.JOB_SNIPE_SYNC_INTERVAL_MINUTES, runSnipeSyncJob);
  }

  schedule("schedule-calc", env.JOB_SCHEDULE_CALC_INTERVAL_MINUTES, runScheduleCalculationJob);
  schedule("notifications", env.JOB_NOTIFICATION_INTERVAL_MINUTES, runReminderEscalationJob);
};

