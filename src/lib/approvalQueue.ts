import type { apiListTasks, ListTasksResponse } from "./api";

// Inspect every page in the user scope; pending and historical final records are not drafts.
export async function loadWaitingSubmissions(list: typeof apiListTasks, userId: string | null, q: string) {
  if (!userId) return [];
  const waiting: ListTasksResponse["items"] = [];
  for (let page = 1; ; page += 1) {
    const result = await list({ maintenanceType: "PM", assigned: "me", q: q || undefined, page, pageSize: 200 });
    waiting.push(...result.items.filter(task => task.assignedTo.userId === userId &&
      (task.approvalStatus ?? "None") === "None" && task.status !== "cancelled" && task.technicianCompletedAt != null));
    if (page * result.pageSize >= result.total || !result.items.length) return waiting;
  }
}
