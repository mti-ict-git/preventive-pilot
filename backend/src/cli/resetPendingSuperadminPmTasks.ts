import { z } from "zod";
import { getDb } from "../db/mssql.js";

const ArgSchema = z.object({
  apply: z.boolean().default(false),
});

type ParsedArgs = z.infer<typeof ArgSchema>;

const parseArgs = (): ParsedArgs => {
  const args = process.argv.slice(2);
  process.stdout.write(`CLI args: ${JSON.stringify(args)}\n`);
  const apply = args.includes("--apply");
  return ArgSchema.parse({ apply });
};

type PendingSuperadminRow = {
  TaskId: string;
  TaskNumber: string | null;
  MaintenanceType: string | null;
  ApprovalStatus: string | null;
};

const main = async (): Promise<void> => {
  const { apply } = parseArgs();
  const db = await getDb();

  const selectResult = await db
    .request()
    .query(
      [
        "SELECT",
        "  TaskId,",
        "  TaskNumber,",
        "  MaintenanceType,",
        "  ApprovalStatus",
        "FROM pm.PMTasks",
        "WHERE MaintenanceType = N'PM'",
        "  AND ApprovalStatus = N'PendingSuperadmin'",
        "ORDER BY TechnicianCompletedAt DESC",
      ].join("\n"),
    );

  const rawRows = selectResult.recordset as Array<Record<string, unknown>>;
  const rows: PendingSuperadminRow[] = rawRows.map((r) => ({
    TaskId: String(r.TaskId),
    TaskNumber:
      r.TaskNumber === null || r.TaskNumber === undefined ? null : String(r.TaskNumber),
    MaintenanceType:
      r.MaintenanceType === null || r.MaintenanceType === undefined
        ? null
        : String(r.MaintenanceType),
    ApprovalStatus:
      r.ApprovalStatus === null || r.ApprovalStatus === undefined
        ? null
        : String(r.ApprovalStatus),
  }));

  if (rows.length === 0) {
    process.stdout.write("No PM tasks found with ApprovalStatus = 'PendingSuperadmin'.\n");
    return;
  }

  const sample = rows.slice(0, 10);
  process.stdout.write(
    [
      `Found ${rows.length} PM tasks with ApprovalStatus = 'PendingSuperadmin'.`,
      "Sample (up to 10):",
      ...sample.map((row) => {
        const numberPart = row.TaskNumber ? ` #${row.TaskNumber}` : "";
        return `  - TaskId=${row.TaskId}${numberPart}`;
      }),
      apply
        ? "Applying reset to PendingSupervisor for all matched tasks..."
        : "Dry run only. Re-run with --apply to perform the reset.",
      "",
    ].join("\n"),
  );

  if (!apply) {
    return;
  }

  const updateResult = await db
    .request()
    .query(
      [
        "UPDATE pm.PMTasks",
        "SET",
        "  ApprovalStatus = N'PendingSupervisor',",
        "  SuperadminApprovedAt = NULL,",
        "  SuperadminApprovedByUserId = NULL,",
        "  RejectedAt = NULL,",
        "  RejectedByUserId = NULL,",
        "  RejectionReason = NULL",
        "WHERE MaintenanceType = N'PM'",
        "  AND ApprovalStatus = N'PendingSuperadmin'",
      ].join("\n"),
    );

  const affected = updateResult.rowsAffected[0] ?? 0;
  process.stdout.write(`Reset ${affected} PM tasks back to PendingSupervisor.\n`);
};

await main();
