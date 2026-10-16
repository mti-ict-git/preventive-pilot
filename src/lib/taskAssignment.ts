import type { TaskListItem } from "@/lib/api";

export type AssignmentTask = Pick<TaskListItem, "id" | "taskNumber" | "maintenanceType" | "status" | "approvalStatus" | "assignedTo">;

export const getTaskAssignmentLockReason = (task: AssignmentTask): string | null => {
  if (task.maintenanceType !== "PM") return null;
  if (["completed", "cancelled"].includes(task.status.toLowerCase())) return "Completed or cancelled PM tasks cannot be reassigned.";
  if (["PendingSupervisor", "PendingSuperadmin"].includes(task.approvalStatus ?? "")) return "Return this task for revision before changing its assignment.";
  if (task.approvalStatus === "Approved") return "Approved PM tasks cannot be reassigned.";
  return null;
};
