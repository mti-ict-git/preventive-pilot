import { getAccessToken } from "@/lib/auth";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001").replace(
  /\/$/,
  "",
);

export type LoginProvider = "ldap" | "local";

export type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    email: string | null;
    roles: string[];
  };
};

export class ApiError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const buildAuthHeaders = (): Record<string, string> => {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const apiFetchJson = async <T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { body?: unknown },
): Promise<T> => {
  const hasBody = init?.body !== undefined;
  const headers: Record<string, string> = {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...buildAuthHeaders(),
    ...(init?.headers ? (init.headers as Record<string, string>) : {}),
  };

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    body: hasBody ? JSON.stringify(init?.body) : undefined,
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as unknown;
      const message =
        typeof data === "object" && data !== null && "message" in data && typeof data.message === "string"
          ? data.message
          : "Request failed";
      throw new ApiError(message, res.status);
    }

    throw new ApiError("Request failed", res.status);
  }

  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const data = (await res.json()) as unknown;
  return data as T;
};

export const apiLogin = async (input: {
  identifier: string;
  password: string;
  provider: LoginProvider;
}): Promise<LoginResponse> => {
  const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const message = res.status === 401 ? "Invalid username or password" : "Login failed";
    throw new ApiError(message, res.status);
  }

  const data = (await res.json()) as unknown;
  return data as LoginResponse;
};

export const apiGetMe = async (): Promise<{
  user: { id: string; username: string; roles: string[] };
}> => {
  const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
    headers: buildAuthHeaders(),
  });

  if (!res.ok) {
    throw new ApiError("Failed to load profile", res.status);
  }

  const data = (await res.json()) as unknown;
  return data as { user: { id: string; username: string; roles: string[] } };
};

export type Asset = {
  id: string;
  snipeAssetId: number | null;
  assetTag: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetStatus: string | null;
  assignedToText: string | null;
  category: { id: string | null; name: string | null };
  location: { id: string | null; name: string | null };
  pm: {
    enabled: boolean | null;
    defaultTemplateId: string | null;
    lastCompletedAt: string | null;
    nextDueAt: string | null;
  };
};

export type ListAssetsResponse = {
  page: number;
  pageSize: number;
  items: Asset[];
};

export const apiListAssets = async (input: {
  search?: string;
  status?: string;
  pmEnabled?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<ListAssetsResponse> => {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  if (input.pmEnabled !== undefined) params.set("pmEnabled", input.pmEnabled ? "true" : "false");
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));

  const query = params.toString();
  return apiFetchJson<ListAssetsResponse>(`/api/assets${query ? `?${query}` : ""}`);
};

export const apiGetAsset = async (assetId: string): Promise<Asset> => {
  return apiFetchJson<Asset>(`/api/assets/${assetId}`);
};

export const apiPatchAssetPm = async (input: {
  assetId: string;
  pmEnabled?: boolean;
  defaultTemplateId?: string | null;
  nextPmDueAt?: string | null;
}): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/assets/${input.assetId}/pm`, {
    method: "PATCH",
    body: {
      pmEnabled: input.pmEnabled,
      defaultTemplateId: input.defaultTemplateId,
      nextPmDueAt: input.nextPmDueAt,
    },
  });
};

export type TaskListItem = {
  id: string;
  taskNumber: string;
  status: string;
  priority: string;
  scheduledDueAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  asset: { id: string; assetTag: string; name: string };
  template: { id: string; name: string };
  assignedTo: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
    roleId: string | null;
    roleName: string | null;
  };
};

export type ListTasksResponse = {
  page: number;
  pageSize: number;
  items: TaskListItem[];
};

export const apiListTasks = async (input: {
  status?: string;
  assigned?: "me" | "unassigned" | "any";
  overdue?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<ListTasksResponse> => {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.assigned) params.set("assigned", input.assigned);
  if (input.overdue !== undefined) params.set("overdue", input.overdue ? "true" : "false");
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiFetchJson<ListTasksResponse>(`/api/tasks${query ? `?${query}` : ""}`);
};

export type OverdueReportItem = {
  id: string;
  taskNumber: string;
  scheduledDueAt: string;
  status: string;
  priority: string;
  asset: {
    id: string;
    assetTag: string;
    name: string;
    location: { id: string; name: string | null } | null;
    category: { id: string; name: string | null } | null;
  };
  template: { id: string; name: string };
};

export type OverdueReportResponse = {
  page: number;
  pageSize: number;
  overdueCount: number;
  items: OverdueReportItem[];
};

export const apiGetOverdueReport = async (input: {
  page?: number;
  pageSize?: number;
}): Promise<OverdueReportResponse> => {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiFetchJson<OverdueReportResponse>(`/api/reports/overdue${query ? `?${query}` : ""}`);
};

export type ComplianceReportResponse = {
  from: string;
  to: string;
  totalDue: number;
  completedOnTime: number;
  completedTotal: number;
  currentlyOverdue: number;
  complianceRate: number | null;
};

export const apiGetComplianceReport = async (input: { from: string; to: string }): Promise<ComplianceReportResponse> => {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  return apiFetchJson<ComplianceReportResponse>(`/api/reports/compliance?${params.toString()}`);
};

export type AssignmentRule = {
  RuleId: string;
  Priority: number;
  CategoryId: string | null;
  LocationId: string | null;
  AssetStatus: string | null;
  AssignToUserId: string | null;
  AssignToRoleId: string | null;
  IsActive: boolean;
  EffectiveFrom: string | null;
  EffectiveTo: string | null;
  CreatedAt: string;
  UpdatedAt: string;
};

export const apiListAssignmentRules = async (): Promise<{ items: AssignmentRule[] }> => {
  return apiFetchJson<{ items: AssignmentRule[] }>("/api/scheduling/assignment-rules");
};

export type BlackoutWindow = {
  BlackoutWindowId: string;
  Name: string;
  StartsAt: string;
  EndsAt: string;
  IsActive: boolean;
  CreatedAt: string;
  UpdatedAt: string;
};

export const apiListBlackoutWindows = async (): Promise<{ items: BlackoutWindow[] }> => {
  return apiFetchJson<{ items: BlackoutWindow[] }>("/api/scheduling/blackout-windows");
};

export const apiRecalculateSchedules = async (assetId?: string): Promise<{ ok: true; updated: number } | { ok: true }> => {
  return apiFetchJson<{ ok: true; updated: number } | { ok: true }>("/api/scheduling/recalculate", {
    method: "POST",
    body: assetId ? { assetId } : {},
  });
};

export type NotificationChannel = {
  id: string;
  channelType: string;
  config: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationRule = {
  id: string;
  ruleName: string;
  eventType: string;
  offsetDays: number | null;
  escalateAfterDays: number | null;
  channel: { id: string; channelType: string };
  messageTemplate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NotificationLogEntry = {
  id: string;
  taskId: string | null;
  ruleId: string | null;
  channel: { id: string; channelType: string };
  sentAt: string;
  status: string;
  errorMessage: string | null;
  payload: string | null;
};

export const apiListNotificationChannels = async (): Promise<{ items: NotificationChannel[] }> => {
  return apiFetchJson<{ items: NotificationChannel[] }>("/api/notifications/channels");
};

export const apiUpdateNotificationChannel = async (input: {
  channelId: string;
  channelType?: string;
  config?: string | null;
  isActive?: boolean;
}): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/notifications/channels/${input.channelId}`,
    {
      method: "PUT",
      body: {
        channelType: input.channelType,
        config: input.config,
        isActive: input.isActive,
      },
    },
  );
};

export const apiListNotificationRules = async (): Promise<{ items: NotificationRule[] }> => {
  return apiFetchJson<{ items: NotificationRule[] }>("/api/notifications/rules");
};

export const apiUpdateNotificationRule = async (input: {
  ruleId: string;
  ruleName?: string;
  eventType?: string;
  offsetDays?: number | null;
  escalateAfterDays?: number | null;
  channelId?: string;
  messageTemplate?: string | null;
  isActive?: boolean;
}): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/notifications/rules/${input.ruleId}`,
    {
      method: "PUT",
      body: {
        ruleName: input.ruleName,
        eventType: input.eventType,
        offsetDays: input.offsetDays,
        escalateAfterDays: input.escalateAfterDays,
        channelId: input.channelId,
        messageTemplate: input.messageTemplate,
        isActive: input.isActive,
      },
    },
  );
};

export const apiListNotificationLog = async (input: { page?: number; pageSize?: number }): Promise<{ page: number; pageSize: number; items: NotificationLogEntry[] }> => {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiFetchJson<{ page: number; pageSize: number; items: NotificationLogEntry[] }>(
    `/api/notifications/log${query ? `?${query}` : ""}`,
  );
};

export type SystemStatusResponse = {
  backendTime: string;
  uptimeSeconds: number;
  database: { ok: boolean };
  jobs: {
    enabled: boolean;
    scheduleCalcIntervalMinutes: number;
    notificationIntervalMinutes: number;
    snipeSyncEnabled: boolean;
    snipeSyncIntervalMinutes: number;
  };
  snipeIt: {
    configured: boolean;
    baseUrl: string | null;
    syncEnabled: boolean;
    lastRun: {
      id: string;
      startedAt: string;
      completedAt: string | null;
      status: string;
      assetsProcessed: number | null;
      errorMessage: string | null;
    } | null;
  };
};

export const apiGetSystemStatus = async (): Promise<SystemStatusResponse> => {
  return apiFetchJson<SystemStatusResponse>("/api/system/status");
};

export type SystemLogEntry = {
  id: string;
  level: string;
  message: string;
  createdAt: string;
  context: string | null;
};

export const apiGetSystemLogs = async (input: { page?: number; pageSize?: number; level?: string }): Promise<{ page: number; pageSize: number; items: SystemLogEntry[] }> => {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.level) params.set("level", input.level);
  const query = params.toString();
  return apiFetchJson<{ page: number; pageSize: number; items: SystemLogEntry[] }>(
    `/api/system/logs${query ? `?${query}` : ""}`,
  );
};

export const apiRunJob = async (jobName: "snipe-sync" | "schedule-calc" | "notifications"): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/system/jobs/${jobName}/run`, { method: "POST" });
};
