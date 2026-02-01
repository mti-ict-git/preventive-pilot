import { getAccessToken, getRefreshToken, setAccessToken, setRefreshToken, clearAccessToken, clearRefreshToken } from "@/lib/auth";

const defaultApiBaseUrl = import.meta.env.PROD ? "" : "http://localhost:3001";
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? defaultApiBaseUrl).replace(/\/$/, "");

export type LoginProvider = "ldap" | "local";

export type LoginResponse = {
  accessToken: string;
  refreshToken: string;
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
  const attempt = async (): Promise<Response> => {
    const hasBody = init?.body !== undefined;
    const headers: Record<string, string> = {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...buildAuthHeaders(),
      ...(init?.headers ? (init.headers as Record<string, string>) : {}),
    };

    return fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      body: hasBody ? JSON.stringify(init?.body) : undefined,
    });
  };

  let res = await attempt();
  if (res.status === 401) {
    const rt = getRefreshToken();
    if (rt) {
      const refreshRes = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (refreshRes.ok) {
        const ct = refreshRes.headers.get("content-type") ?? "";
        if (ct.includes("application/json")) {
          const payload = (await refreshRes.json()) as unknown;
          const at = typeof payload === "object" && payload !== null && "accessToken" in payload && typeof (payload as { accessToken?: unknown }).accessToken === "string" ? (payload as { accessToken: string }).accessToken : null;
          const nr = typeof payload === "object" && payload !== null && "refreshToken" in payload && typeof (payload as { refreshToken?: unknown }).refreshToken === "string" ? (payload as { refreshToken: string }).refreshToken : null;
          if (at) setAccessToken(at);
          if (nr) setRefreshToken(nr);
          res = await attempt();
        }
      } else {
        clearAccessToken();
        clearRefreshToken();
      }
    }
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as unknown;
      const message =
        typeof data === "object" && data !== null && "message" in data && typeof (data as { message?: unknown }).message === "string"
          ? (data as { message: string }).message
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

export const apiHealth = async (): Promise<{ status: string }> => {
  return apiFetchJson<{ status: string }>("/health");
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

export type MeUser = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  roles: string[];
};

export type MeResponse = {
  user: MeUser;
};

export const apiGetMe = async (): Promise<MeResponse> => {
  return apiFetchJson<MeResponse>("/api/auth/me");
};

export type ThemeMode = "dark" | "light";
export type UserPreferencesResponse = { themeMode: ThemeMode | null; themePalette: string | null };

export const apiGetMyPreferences = async (): Promise<UserPreferencesResponse> => {
  return apiFetchJson<UserPreferencesResponse>("/api/auth/me/preferences");
};

export const apiUpdateMyPreferences = async (input: {
  themeMode?: ThemeMode | null;
  themePalette?: string | null;
}): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>("/api/auth/me/preferences", { method: "PUT", body: input });
};

export type AssetOperationalStatus = "operational" | "broken" | "archived";

export type Asset = {
  id: string;
  snipeAssetId: number | null;
  assetTag: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serialNumber: string | null;
  assetStatus: string | null;
  assetOperationalStatus: AssetOperationalStatus;
  assignedToText: string | null;
  snipeNotes: string | null;
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
  operationalStatus?: "operational" | "broken" | "archived";
  pmEnabled?: boolean;
  categoryId?: string;
  categoryIds?: string[];
  locationId?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListAssetsResponse> => {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
   if (input.operationalStatus) params.set("operationalStatus", input.operationalStatus);
  if (input.pmEnabled !== undefined) params.set("pmEnabled", input.pmEnabled ? "true" : "false");
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.categoryIds && input.categoryIds.length > 0) params.set("categoryIds", input.categoryIds.join(","));
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));

  const query = params.toString();
  return apiFetchJson<ListAssetsResponse>(`/api/assets${query ? `?${query}` : ""}`);
};

export type Facility = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  location: { id: string | null; name: string | null } | null;
  pm: {
    enabled: boolean | null;
    defaultTemplateId: string | null;
    lastCompletedAt: string | null;
    nextDueAt: string | null;
  };
};

export type ListFacilitiesResponse = {
  page: number;
  pageSize: number;
  items: Facility[];
};

export const apiListFacilities = async (input: {
  search?: string;
  locationId?: string;
  pmEnabled?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<ListFacilitiesResponse> => {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.pmEnabled !== undefined) params.set("pmEnabled", input.pmEnabled ? "true" : "false");
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiFetchJson<ListFacilitiesResponse>(`/api/facilities${query ? `?${query}` : ""}`);
};

export const apiGetFacility = async (facilityId: string): Promise<Facility> => {
  return apiFetchJson<Facility>(`/api/facilities/${facilityId}`);
};

export const apiCreateFacility = async (input: {
  name: string;
  locationId?: string | null;
  description?: string | null;
  isActive?: boolean;
}): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>(`/api/facilities`, { method: "POST", body: input });
};

export const apiUpdateFacility = async (input: {
  facilityId: string;
  name?: string;
  locationId?: string | null;
  description?: string | null;
  isActive?: boolean;
}): Promise<{ ok: true }> => {
  const { facilityId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/facilities/${facilityId}`, { method: "PUT", body });
};

export const apiUpdateFacilityPmSettings = async (input: {
  facilityId: string;
  pmEnabled?: boolean;
  defaultTemplateId?: string | null;
  nextPmDueAt?: string | null;
}): Promise<{ ok: true }> => {
  const { facilityId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/facilities/${facilityId}/pm-settings`, { method: "PUT", body });
};

export const apiFacilityPmNow = async (facilityId: string): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>(`/api/facilities/${facilityId}/pm-now`, { method: "POST" });
};

export const apiCloneFacility = async (input: {
  facilityId: string;
  name?: string;
  includePmSettings?: boolean;
}): Promise<{ id: string }> => {
  const { facilityId, ...body } = input;
  return apiFetchJson<{ id: string }>(`/api/facilities/${facilityId}/clone`, { method: "POST", body });
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

export const apiBulkSetAssetPmEnabled = async (input: {
  assetIds: string[];
  pmEnabled: boolean;
}): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>("/api/assets/pm/bulk", {
    method: "POST",
    body: input,
  });
};

export const apiBulkSetAssetPmTemplate = async (input: {
  assetIds: string[];
  defaultTemplateId: string | null;
}): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>("/api/assets/pm/bulk/template", {
    method: "POST",
    body: input,
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
  checklistTotal: number;
  checklistCompleted: number;
  asset: { id: string | null; assetTag: string | null; name: string | null };
  facility: { id: string; name: string | null; locationName: string | null } | null;
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
  maintenanceType?: MaintenanceTypeFilter;
  assetId?: string;
  facilityId?: string;
  templateId?: string;
  dueFrom?: string;
  dueTo?: string;
  page?: number;
  pageSize?: number;
}): Promise<ListTasksResponse> => {
  const params = new URLSearchParams();
  if (input.status) params.set("status", input.status);
  if (input.assigned) params.set("assigned", input.assigned);
  if (input.overdue !== undefined) params.set("overdue", input.overdue ? "true" : "false");
  if (input.maintenanceType) params.set("maintenanceType", input.maintenanceType);
  if (input.assetId) params.set("assetId", input.assetId);
   if (input.facilityId) params.set("facilityId", input.facilityId);
  if (input.templateId) params.set("templateId", input.templateId);
  if (input.dueFrom) params.set("dueFrom", input.dueFrom);
  if (input.dueTo) params.set("dueTo", input.dueTo);
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  const query = params.toString();
  return apiFetchJson<ListTasksResponse>(`/api/tasks${query ? `?${query}` : ""}`);
};

export type DashboardOverviewResponse = {
  stats: {
    totalAssetsInPm: number;
    upcoming7DaysCount: number;
    dueTodayCount: number;
    overdueCount: number;
  };
  complianceTrend: Array<{
    monthStart: string;
    monthEnd: string;
    totalDue: number;
    completedOnTime: number;
    complianceRate: number | null;
  }>;
  overdueByCategory: Array<{ name: string; count: number }>;
  recentTasks: Array<{
    id: string;
    taskNumber: string;
    status: string;
    scheduledDueAt: string;
    asset: { assetTag: string; name: string };
    template: { name: string };
    assignedTo: { displayName: string | null; roleName: string | null };
  }>;
};

export const apiGetDashboardOverview = async (): Promise<DashboardOverviewResponse> => {
  return apiFetchJson<DashboardOverviewResponse>("/api/dashboard/overview");
};

export type TaskUserRef = {
  userId: string;
  username: string | null;
  displayName: string | null;
};

export type TaskChecklistEvidence = {
  id: string;
  templateChecklistItemId: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uri: string;
  uploadedAt: string;
  uploadedBy: TaskUserRef | null;
};

export type TaskDetailChecklistItem = {
  id: string;
  sortOrder: number;
  itemText: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  enableAttachment: boolean;
  requiresAttachment: boolean;
  isActive: boolean;
  evidence: TaskChecklistEvidence[];
  result: {
    id: string;
    outcome: 0 | 1 | 2;
    outcomeLabel: "skip" | "pass" | "fail" | "done";
    notes: string | null;
    completedAt: string | null;
    completedBy: TaskUserRef | null;
  } | null;
};

export type TaskEvidence = {
  id: string;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uri: string;
  uploadedAt: string;
  uploadedBy: TaskUserRef | null;
};

export type TaskDetail = {
  id: string;
  taskNumber: string;
  maintenanceType: "PM" | "CM";
  status: string;
  priority: string;
  scheduledDueAt: string;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  completedBy: TaskUserRef | null;
  cancelledAt: string | null;
  cancelledBy: TaskUserRef | null;
  forceCompleted: boolean | null;
  asset: { id: string; assetTag: string; name: string };
  facility: { id: string; name: string | null } | null;
  template: { id: string; name: string };
  assignedTo: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
    roleId: string | null;
    roleName: string | null;
  };
  checklistItems: TaskDetailChecklistItem[];
  evidence: TaskEvidence[];
};

export const apiGetTask = async (taskId: string): Promise<TaskDetail> => {
  return apiFetchJson<TaskDetail>(`/api/tasks/${taskId}`);
};

export const apiAssignTask = async (input: {
  taskId: string;
  assignedToUserId?: string | null;
  assignedToRoleId?: string | null;
  priority?: string;
  status?: string;
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/assign`, {
    method: "POST",
    body,
  });
};

export const apiBulkAssignUnassignedTasks = async (input: {
  assignedToUserId?: string | null;
  assignedToRoleId?: string | null;
  dueFrom?: string;
  dueTo?: string;
}): Promise<{ ok: true; updatedCount: number }> => {
  return apiFetchJson<{ ok: true; updatedCount: number }>("/api/tasks/bulk-assign-unassigned", {
    method: "POST",
    body: input,
  });
};

export const apiStartTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/start`, { method: "POST" });
};

export const apiPauseTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/pause`, { method: "POST" });
};

export const apiCancelTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/cancel`, { method: "POST" });
};

export const apiResumeTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/resume`, { method: "POST" });
};

export const apiReopenTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/reopen`, { method: "POST" });
};

export type CompleteTaskChecklistResultInput = {
  templateChecklistItemId: string;
  outcome: 0 | 1 | 2;
  notes?: string | null;
};

export const apiDeleteTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}`, { method: "DELETE" });
};

export const apiCompleteTask = async (input: {
  taskId: string;
  checklistResults: CompleteTaskChecklistResultInput[];
  forceCompleted?: boolean;
  completedAt?: string;
  backdateReason?: string;
  technicianName?: string;
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/complete`, {
    method: "POST",
    body,
  });
};

export const apiAddTaskEvidence = async (input: {
  taskId: string;
  uri: string;
  fileName?: string | null;
  contentType?: string | null;
  sizeBytes?: number | null;
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/evidence`, {
    method: "POST",
    body,
  });
};

export type WorkOrderListItem = {
  id: string;
  taskNumber: string;
  status: string;
  priority: string | null;
  scheduledDueAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  symptom: string | null;
  impactLevel: string | null;
  failureCategory: string | null;
  failureCode: string | null;
  reportedAt: string | null;
  reportedByUsername: string | null;
  asset: { id: string; assetTag: string | null; name: string | null } | null;
  facility: { id: string; name: string | null } | null;
  category: { id: string | null; name: string | null } | null;
  location: { id: string | null; name: string | null } | null;
  templateName: string | null;
  assignedTo: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
    roleId: string | null;
    roleName: string | null;
  };
};

export type ListWorkOrdersResponse = {
  page: number;
  pageSize: number;
  items: WorkOrderListItem[];
};

export const apiListWorkOrders = async (input: {
  page?: number;
  pageSize?: number;
  status?: string;
  assetId?: string;
  facilityId?: string;
  impactLevel?: string;
  categoryId?: string;
  locationId?: string;
  reportedFrom?: string;
  reportedTo?: string;
  completedFrom?: string;
  completedTo?: string;
  assigned?: "any" | "unassigned" | "me";
}): Promise<ListWorkOrdersResponse> => {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.status) params.set("status", input.status);
  if (input.assetId) params.set("assetId", input.assetId);
  if (input.facilityId) params.set("facilityId", input.facilityId);
  if (input.impactLevel) params.set("impactLevel", input.impactLevel);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.reportedFrom) params.set("reportedFrom", input.reportedFrom);
  if (input.reportedTo) params.set("reportedTo", input.reportedTo);
  if (input.completedFrom) params.set("completedFrom", input.completedFrom);
  if (input.completedTo) params.set("completedTo", input.completedTo);
  if (input.assigned) params.set("assigned", input.assigned);
  const query = params.toString();
  return apiFetchJson<ListWorkOrdersResponse>(`/api/work-orders${query ? `?${query}` : ""}`);
};

export const apiCreateWorkOrder = async (input: {
  assetId?: string;
  facilityId?: string;
  templateId?: string;
  symptom: string;
  impactLevel?: "normal" | "high" | "critical";
  failureCategory?: string;
  failureCode?: string;
  downtimeStartedAt?: string;
  reportedChannel?: string;
}): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>(`/api/work-orders`, { method: "POST", body: input });
};

export type WorkOrderDetail = {
  id: string;
  taskNumber: string;
  status: string;
  priority: string | null;
  scheduledDueAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  symptom: string | null;
  impactLevel: string | null;
  failureCategory: string | null;
  failureCode: string | null;
  downtimeStartedAt: string | null;
  downtimeEndedAt: string | null;
  reportedAt: string | null;
  reportedChannel: string | null;
  reportedBy: TaskUserRef | null;
  asset: { id: string; assetTag: string | null; name: string | null } | null;
  facility: { id: string; name: string | null } | null;
  template: { id: string; name: string };
  assignedTo: {
    userId: string | null;
    username: string | null;
    displayName: string | null;
    roleId: string | null;
    roleName: string | null;
  };
  completedBy: TaskUserRef | null;
  cancelledBy: TaskUserRef | null;
  resolutionNotes: string | null;
};

export const apiGetWorkOrder = async (taskId: string): Promise<WorkOrderDetail> => {
  return apiFetchJson<WorkOrderDetail>(`/api/work-orders/${taskId}`);
};

export const apiAssignWorkOrder = async (input: {
  taskId: string;
  assignedToUserId?: string | null;
  assignedToRoleId?: string | null;
  priority?: "low" | "medium" | "high";
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/assign`, { method: "POST", body });
};

export const apiStartWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/start`, { method: "POST" });
};

export const apiPauseWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/pause`, { method: "POST" });
};

export const apiResumeWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/resume`, { method: "POST" });
};

export const apiCancelWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/cancel`, { method: "POST" });
};

export const apiCloseDowntime = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/close-downtime`, { method: "POST" });
};

export const apiCompleteWorkOrder = async (input: {
  taskId: string;
  checklistResults: CompleteTaskChecklistResultInput[];
  forceCompleted?: boolean;
  completedAt?: string;
  backdateReason?: string;
  technicianName?: string;
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/complete`, { method: "POST", body });
};

export const apiUpdateWorkOrderResolution = async (input: {
  taskId: string;
  resolutionNotes: string;
}): Promise<{ ok: true }> => {
  const { taskId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}/resolution`, { method: "POST", body });
};

export const apiDeleteWorkOrder = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/work-orders/${taskId}`, { method: "DELETE" });
};

export type DownloadEvidenceResponse = {
  blob: Blob;
  fileName: string | null;
  contentType: string | null;
};

const parseFilenameFromContentDisposition = (value: string | null): string | null => {
  if (!value) return null;
  const match = value.match(/filename\*=UTF-8''([^;]+)|filename="?([^;"]+)"?/i);
  const encoded = match?.[1] ?? null;
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      return encoded;
    }
  }
  const plain = match?.[2] ?? null;
  return plain ? plain.trim() : null;
};

export const apiDownloadEvidence = async (input: {
  evidenceId: string;
  download?: boolean;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams();
  if (input.download) params.set("download", "1");
  const query = params.toString();

  const res = await fetch(
    `${API_BASE_URL}/api/tasks/evidence/${encodeURIComponent(input.evidenceId)}${query ? `?${query}` : ""}`,
    {
      headers: buildAuthHeaders(),
    },
  );

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

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const fileName = parseFilenameFromContentDisposition(cd);
  const contentType = res.headers.get("content-type");
  return { blob, fileName, contentType };
};

export const apiDownloadChecklistEvidence = async (input: {
  checklistEvidenceId: string;
  download?: boolean;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams();
  if (input.download) params.set("download", "1");
  const query = params.toString();

  const res = await fetch(
    `${API_BASE_URL}/api/tasks/checklist-evidence/${encodeURIComponent(input.checklistEvidenceId)}${
      query ? `?${query}` : ""
    }`,
    {
      headers: buildAuthHeaders(),
    },
  );

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

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const fileName = parseFilenameFromContentDisposition(cd);
  const contentType = res.headers.get("content-type");
  return { blob, fileName, contentType };
};

export const apiDeleteEvidence = async (input: { evidenceId: string }): Promise<{ ok: true }> => {
  const res = await fetch(`${API_BASE_URL}/api/tasks/evidence/${encodeURIComponent(input.evidenceId)}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
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

  const data = (await res.json()) as unknown;
  const ok = typeof data === "object" && data !== null && "ok" in data && data.ok === true;
  if (!ok) throw new ApiError("Request failed", 500);
  return { ok: true };
};

export const apiDeleteChecklistEvidence = async (input: { checklistEvidenceId: string }): Promise<{ ok: true }> => {
  const res = await fetch(
    `${API_BASE_URL}/api/tasks/checklist-evidence/${encodeURIComponent(input.checklistEvidenceId)}`,
    {
      method: "DELETE",
      headers: buildAuthHeaders(),
    },
  );

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

  const data = (await res.json()) as unknown;
  const ok = typeof data === "object" && data !== null && "ok" in data && data.ok === true;
  if (!ok) throw new ApiError("Request failed", 500);
  return { ok: true };
};

export const apiUploadTaskEvidenceFile = async (input: {
  taskId: string;
  file: File;
}): Promise<{ id: string }> => {
  const res = await fetch(`${API_BASE_URL}/api/tasks/${encodeURIComponent(input.taskId)}/evidence/upload`, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(),
      "Content-Type": input.file.type || "application/octet-stream",
      "x-filename": input.file.name,
    },
    body: input.file,
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

  const data = (await res.json()) as unknown;
  const id = typeof data === "object" && data !== null && "id" in data && typeof data.id === "string" ? data.id : null;
  if (!id) throw new ApiError("Request failed", 500);
  return { id };
};

export const apiUploadTaskChecklistEvidenceFile = async (input: {
  taskId: string;
  templateChecklistItemId: string;
  file: File;
}): Promise<{ id: string }> => {
  const res = await fetch(
    `${API_BASE_URL}/api/tasks/${encodeURIComponent(input.taskId)}/checklist-items/${encodeURIComponent(
      input.templateChecklistItemId,
    )}/evidence/upload`,
    {
      method: "POST",
      headers: {
        ...buildAuthHeaders(),
        "Content-Type": input.file.type || "application/octet-stream",
        "x-filename": input.file.name,
      },
      body: input.file,
    },
  );

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

  const data = (await res.json()) as unknown;
  const id = typeof data === "object" && data !== null && "id" in data && typeof data.id === "string" ? data.id : null;
  if (!id) throw new ApiError("Request failed", 500);
  return { id };
};

export type MaintenanceTypeFilter = "PM" | "CM" | "all";

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
  locationId?: string;
  categoryId?: string;
  maintenanceType?: MaintenanceTypeFilter;
}): Promise<OverdueReportResponse> => {
  const params = new URLSearchParams();
  if (input.page) params.set("page", String(input.page));
  if (input.pageSize) params.set("pageSize", String(input.pageSize));
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.maintenanceType) params.set("maintenanceType", input.maintenanceType);
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

export const apiGetComplianceReport = async (input: {
  from: string;
  to: string;
  locationId?: string;
  categoryId?: string;
  maintenanceType?: MaintenanceTypeFilter;
}): Promise<ComplianceReportResponse> => {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.maintenanceType) params.set("maintenanceType", input.maintenanceType);
  return apiFetchJson<ComplianceReportResponse>(`/api/reports/compliance?${params.toString()}`);
};

const apiFetchBlob = async (path: string): Promise<DownloadEvidenceResponse> => {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: buildAuthHeaders(),
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

  const blob = await res.blob();
  const cd = res.headers.get("content-disposition");
  const fileName = parseFilenameFromContentDisposition(cd);
  const contentType = res.headers.get("content-type");
  return { blob, fileName, contentType };
};

export const apiDownloadTaskPdf = async (taskId: string): Promise<DownloadEvidenceResponse> => {
  return apiFetchBlob(`/api/tasks/${taskId}/export.pdf`);
};

export const apiDownloadOverdueReportCsv = async (input: {
  locationId?: string;
  categoryId?: string;
  maintenanceType?: MaintenanceTypeFilter;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams();
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.maintenanceType) params.set("maintenanceType", input.maintenanceType);
  const query = params.toString();
  return apiFetchBlob(`/api/reports/overdue/export.csv${query ? `?${query}` : ""}`);
};

export const apiDownloadComplianceReportCsv = async (input: {
  from: string;
  to: string;
  locationId?: string;
  categoryId?: string;
  maintenanceType?: MaintenanceTypeFilter;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.maintenanceType) params.set("maintenanceType", input.maintenanceType);
  return apiFetchBlob(`/api/reports/compliance/export.csv?${params.toString()}`);
};

export type CmBreakdownRow = {
  name: string;
  count: number;
};

export type CmMttrRow = {
  name: string;
  seconds: number;
};

export type CmMonthlyIncidentRow = {
  monthStart: string;
  incidentCount: number;
};

export type CmMetricsResponse = {
  from: string;
  to: string;
  breakdownByCategory: CmBreakdownRow[];
  breakdownByLocation: CmBreakdownRow[];
  breakdownByFailureCategory: CmBreakdownRow[];
  breakdownByImpactLevel: CmBreakdownRow[];
  monthlyIncidents: CmMonthlyIncidentRow[];
  mttrByCategory: CmMttrRow[];
  mttrByLocation: CmMttrRow[];
};

export const apiGetCmMetrics = async (input: {
  from: string;
  to: string;
  locationId?: string;
  categoryId?: string;
}): Promise<CmMetricsResponse> => {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  return apiFetchJson<CmMetricsResponse>(`/api/reports/cm/metrics?${params.toString()}`);
};

export const apiDownloadCmMetricsCsv = async (input: {
  from: string;
  to: string;
  locationId?: string;
  categoryId?: string;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  return apiFetchBlob(`/api/reports/cm/metrics/export.csv?${params.toString()}`);
};

export const apiDownloadSystemLogsCsv = async (input: {
  from: string;
  to: string;
  level?: string;
  maxRows?: number;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.level) params.set("level", input.level);
  if (input.maxRows !== undefined) params.set("maxRows", String(input.maxRows));
  return apiFetchBlob(`/api/reports/system-logs/export.csv?${params.toString()}`);
};

export const apiDownloadAssetsWithoutPmCsv = async (input: {
  locationId?: string;
  categoryId?: string;
}): Promise<DownloadEvidenceResponse> => {
  const params = new URLSearchParams();
  if (input.locationId) params.set("locationId", input.locationId);
  if (input.categoryId) params.set("categoryId", input.categoryId);
  const query = params.toString();
  return apiFetchBlob(`/api/reports/assets-without-pm/export.csv${query ? `?${query}` : ""}`);
};

export type LookupRole = {
  id: string;
  name: string;
};

export type LookupAssetCategory = {
  id: string;
  name: string;
  isActive: boolean;
};

export type LookupLocation = {
  id: string;
  name: string;
  isActive: boolean;
};

export type LookupsResponse = {
  roles: LookupRole[];
  assetCategories: LookupAssetCategory[];
  locations: LookupLocation[];
};

export const apiGetLookups = async (): Promise<LookupsResponse> => {
  return apiFetchJson<LookupsResponse>("/api/system/lookups");
};

export type UserSummary = {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  phone: string | null;
  externalProvider: string | null;
  isActive: boolean;
  roles: string[];
  tasksCompleted: number;
};

export const apiListUsers = async (input?: {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}): Promise<{ page: number; pageSize: number; total: number; items: UserSummary[] }> => {
  const params = new URLSearchParams();
  if (input?.page !== undefined) params.set("page", String(input.page));
  if (input?.pageSize !== undefined) params.set("pageSize", String(input.pageSize));
  if (input?.search?.trim()) params.set("search", input.search.trim());
  if (input?.isActive !== undefined) params.set("isActive", input.isActive ? "true" : "false");
  const query = params.toString();
  return apiFetchJson<{ page: number; pageSize: number; total: number; items: UserSummary[] }>(
    `/api/system/users${query ? `?${query}` : ""}`,
  );
};

export const apiRefreshLdapUser = async (userId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/system/users/${userId}/refresh-ldap`, { method: "POST" });
};

export const apiUpdateUserRoles = async (input: {
  userId: string;
  roles: string[];
  isActive?: boolean;
}): Promise<{ ok: true; roles: string[] }> => {
  return apiFetchJson<{ ok: true; roles: string[] }>(`/api/system/users/${input.userId}/roles`, {
    method: "PUT",
    body: { roles: input.roles, isActive: input.isActive },
  });
};

export const apiDeleteUser = async (userId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/system/users/${userId}`, {
    method: "DELETE",
  });
};

export const apiCreateLocalUser = async (input: {
  username: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  password: string;
  roleName: string;
  isActive?: boolean;
}): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>("/api/system/users/local", { method: "POST", body: input });
};

export const apiAssignAdUser = async (input: {
  identifier: string;
  roleName: string;
  isActive?: boolean;
}): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>("/api/system/users/assign-ldap", { method: "POST", body: input });
};

export type AdUserSearchItem = {
  username: string;
  displayName: string | null;
  email: string | null;
  upn: string | null;
  dn: string;
  identifier: string;
};

export const apiSearchAdUsers = async (input: { q: string; limit?: number }): Promise<{ items: AdUserSearchItem[] }> => {
  const params = new URLSearchParams();
  params.set("q", input.q);
  if (input.limit !== undefined) params.set("limit", String(input.limit));
  return apiFetchJson<{ items: AdUserSearchItem[] }>(`/api/system/ldap/search?${params.toString()}`);
};

export type SchedulingCalendarDay = {
  date: string;
  type: "scheduled" | "due" | "overdue";
  count: number;
  capacityMinutes: number;
};

export type SchedulingDayEventItem = {
  id: string;
  taskNumber: string;
  scheduledDueAt: string;
  status: string;
  priority: string;
  estimatedMinutes: number;
  bucket: "scheduled" | "due" | "overdue";
  asset: { id: string; assetTag: string; name: string };
  template: { id: string; name: string };
};

export const apiGetSchedulingCalendar = async (input: {
  month: string;
}): Promise<{ items: SchedulingCalendarDay[] }> => {
  const params = new URLSearchParams();
  params.set("month", input.month);
  return apiFetchJson<{ items: SchedulingCalendarDay[] }>(`/api/scheduling/calendar?${params.toString()}`);
};

export const apiGetSchedulingDayEvents = async (input: {
  date: string;
}): Promise<{ items: SchedulingDayEventItem[] }> => {
  const params = new URLSearchParams();
  params.set("date", input.date);
  return apiFetchJson<{ items: SchedulingDayEventItem[] }>(`/api/scheduling/day?${params.toString()}`);
};

export const apiRecalculateSchedules = async (input: {
  assetId?: string;
  force?: boolean;
}): Promise<{ updated: number }> => {
  return apiFetchJson<{ updated: number }>("/api/scheduling/recalculate", {
    method: "POST",
    body: {
      assetId: input.assetId,
      force: Boolean(input.force),
    },
  });
};

export const apiCreatePmNowTask = async (input: { assetId: string }): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>("/api/tasks/pm-now", {
    method: "POST",
    body: {
      assetId: input.assetId,
    },
  });
};

export type TemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  intervalDays: number;
  applicableCategory: { id: string; name: string | null } | null;
  estimatedDurationMinutes: number | null;
  requiredRole: { id: string; name: string | null } | null;
  isActive: boolean;
  version: number;
  updatedAt: string;
};

export type TemplateChecklistItem = {
  id: string;
  sortOrder: number;
  itemText: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  enableAttachment: boolean;
  requiresAttachment: boolean;
  isActive: boolean;
};

export type TemplateDetail = TemplateSummary & {
  checklistItems: TemplateChecklistItem[];
};

export const apiListTemplates = async (input?: { active?: boolean }): Promise<{ items: TemplateSummary[] }> => {
  const params = new URLSearchParams();
  if (input?.active !== undefined) params.set("active", input.active ? "true" : "false");
  const query = params.toString();
  return apiFetchJson<{ items: TemplateSummary[] }>(`/api/templates${query ? `?${query}` : ""}`);
};

export const apiGetTemplate = async (templateId: string): Promise<TemplateDetail> => {
  return apiFetchJson<TemplateDetail>(`/api/templates/${templateId}`);
};

export type UpsertTemplateChecklistItemInput = {
  id?: string;
  sortOrder: number;
  itemText: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  enableAttachment: boolean;
  requiresAttachment: boolean;
  isActive: boolean;
};

export type CreateTemplateInput = {
  name: string;
  description?: string | null;
  intervalDays: number;
  applicableCategoryId?: string | null;
  estimatedDurationMinutes?: number | null;
  requiredRoleId?: string | null;
  isActive: boolean;
  checklistItems: UpsertTemplateChecklistItemInput[];
};

export const apiCreateTemplate = async (input: CreateTemplateInput): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>("/api/templates", {
    method: "POST",
    body: input,
  });
};

export type UpdateTemplateInput = Partial<CreateTemplateInput> & {
  templateId: string;
};

export const apiUpdateTemplate = async (input: UpdateTemplateInput): Promise<{ ok: true }> => {
  const { templateId, ...body } = input;
  return apiFetchJson<{ ok: true }>(`/api/templates/${templateId}`, {
    method: "PUT",
    body,
  });
};

export const apiDeleteTemplate = async (templateId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/templates/${templateId}`, {
    method: "DELETE",
  });
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

export type CreateAssignmentRuleInput = {
  priority: number;
  categoryId?: string | null;
  locationId?: string | null;
  assetStatus?: string | null;
  assignToUserId?: string | null;
  assignToRoleId?: string | null;
  isActive?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
};

export const apiCreateAssignmentRule = async (input: CreateAssignmentRuleInput): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>("/api/scheduling/assignment-rules", {
    method: "POST",
    body: {
      priority: input.priority,
      categoryId: input.categoryId ?? null,
      locationId: input.locationId ?? null,
      assetStatus: input.assetStatus ?? null,
      assignToUserId: input.assignToUserId ?? null,
      assignToRoleId: input.assignToRoleId ?? null,
      isActive: input.isActive ?? true,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveTo: input.effectiveTo ?? null,
    },
  });
};

export const apiUpdateAssignmentRule = async (input: {
  ruleId: string;
  data: Partial<CreateAssignmentRuleInput>;
}): Promise<{ ok: true }> => {
  const { ruleId, data } = input;
  return apiFetchJson<{ ok: true }>(`/api/scheduling/assignment-rules/${ruleId}`,
    {
      method: "PUT",
      body: data,
    },
  );
};

export const apiDeactivateAssignmentRule = async (ruleId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/scheduling/assignment-rules/${ruleId}`,
    {
      method: "DELETE",
    },
  );
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


export type NotificationChannel = {
  id: string;
  channelName?: string | null;
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

export const apiCreateNotificationChannel = async (input: {
  channelType: string;
  channelName?: string | null;
  config?: string | null;
  isActive?: boolean;
}): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>("/api/notifications/channels", {
    method: "POST",
    body: {
      channelType: input.channelType,
      channelName: input.channelName ?? null,
      config: input.config ?? null,
      isActive: input.isActive ?? true,
    },
  });
};

export const apiUpdateNotificationChannel = async (input: {
  channelId: string;
  channelType?: string;
  channelName?: string | null;
  config?: string | null;
  isActive?: boolean;
}): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/notifications/channels/${input.channelId}`,
    {
      method: "PUT",
      body: {
        channelType: input.channelType,
        channelName: input.channelName,
        config: input.config,
        isActive: input.isActive,
      },
    },
  );
};

export const apiDeleteNotificationChannel = async (input: { channelId: string }): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/notifications/channels/${input.channelId}`, {
    method: "DELETE",
  });
};

export const apiListNotificationRules = async (): Promise<{ items: NotificationRule[] }> => {
  return apiFetchJson<{ items: NotificationRule[] }>("/api/notifications/rules");
};

export const apiCreateNotificationRule = async (input: {
  ruleName: string;
  eventType: string;
  offsetDays?: number | null;
  escalateAfterDays?: number | null;
  channelId: string;
  messageTemplate?: string | null;
  isActive?: boolean;
}): Promise<{ id: string }> => {
  return apiFetchJson<{ id: string }>("/api/notifications/rules", {
    method: "POST",
    body: {
      ruleName: input.ruleName,
      eventType: input.eventType,
      offsetDays: input.offsetDays ?? null,
      escalateAfterDays: input.escalateAfterDays ?? null,
      channelId: input.channelId,
      messageTemplate: input.messageTemplate ?? null,
      isActive: input.isActive ?? true,
    },
  });
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
  notifications?: {
    msGraph?: {
      enabled: boolean;
      senderEmail: string | null;
      useLoggedInUserAsSender: boolean;
      scope: string[];
      defaultToRecipients: string[];
      defaultCcRecipients: string[];
      defaultBccRecipients: string[];
      emailSubjectTemplate: string | null;
      emailBodyTemplate: string | null;
      lastConnectionTestAt: string | null;
      tenantId: string | null;
      clientId: string | null;
      clientSecretConfigured: boolean;
    };
  };
  snipeIt: {
    configured: boolean;
    baseUrl: string | null;
    autoSyncEnabled: boolean;
    syncIntervalMinutes: number;
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

export type AssetsUiSettingsResponse = {
  visibleCategoryIds: string[] | null;
  excludeInactive: boolean;
};

export type UpdateAssetsUiSettingsInput = AssetsUiSettingsResponse;

export const apiGetAssetsUiSettings = async (): Promise<AssetsUiSettingsResponse> => {
  return apiFetchJson<AssetsUiSettingsResponse>("/api/system/ui-settings/assets");
};

export const apiUpdateAssetsUiSettings = async (
  input: UpdateAssetsUiSettingsInput,
): Promise<AssetsUiSettingsResponse> => {
  return apiFetchJson<AssetsUiSettingsResponse>("/api/system/ui-settings/assets", { method: "PUT", body: input });
};

export type LabelDesignerQrPayloadMode = "assetId" | "assetTag" | "snipeItUrl";

export type LabelDesignerConfig = {
  width: number;
  height: number;
  qrSize: number;
  showAssetTag: boolean;
  showAssetName: boolean;
  showCategory: boolean;
  showLocation: boolean;
  showCustomText: boolean;
  customText: string;
  fontSize: number;
  padding: number;
  borderRadius: number;
  showBorder: boolean;
  showLogo: boolean;
  orientation: "portrait" | "landscape";
};

export type LabelDesignerUiSettingsResponse = {
  qrPayloadMode: LabelDesignerQrPayloadMode;
  gridColumns: number;
  config: LabelDesignerConfig;
};

export type UpdateLabelDesignerUiSettingsInput = LabelDesignerUiSettingsResponse;

export const apiGetLabelDesignerUiSettings = async (): Promise<LabelDesignerUiSettingsResponse> => {
  return apiFetchJson<LabelDesignerUiSettingsResponse>("/api/system/ui-settings/label-designer");
};

export const apiUpdateLabelDesignerUiSettings = async (
  input: UpdateLabelDesignerUiSettingsInput,
): Promise<LabelDesignerUiSettingsResponse> => {
  return apiFetchJson<LabelDesignerUiSettingsResponse>("/api/system/ui-settings/label-designer", {
    method: "PUT",
    body: input,
  });
};

export type SnipeItSettingsResponse = {
  baseUrl: string | null;
  apiTokenConfigured: boolean;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
};

export type MicrosoftGraphSettingsResponse = {
  tenantId: string | null;
  clientId: string | null;
  clientSecretConfigured: boolean;
  scope: string[];
  senderEmail: string | null;
  useLoggedInUserAsSender: boolean;
  defaultToRecipients: string[];
  defaultCcRecipients: string[];
  defaultBccRecipients: string[];
  emailSubjectTemplate: string | null;
  emailBodyTemplate: string | null;
  enabled: boolean;
  lastConnectionTestAt: string | null;
};

export type WhatsAppSettingsResponse = {
  enabled: boolean;
  baseUrl: string | null;
  target: "single" | "group";
  defaultNumber: string | null;
  groupId: string | null;
  groupName: string | null;
  mentionNumbers: string[];
};

export type UpdateSnipeItSettingsInput = {
  baseUrl: string | null;
  apiToken?: string | null;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
};

export type UpdateMicrosoftGraphSettingsInput = {
  tenantId: string | null;
  clientId: string | null;
  clientSecret?: string | null;
  scope: string[];
  senderEmail: string | null;
  useLoggedInUserAsSender: boolean;
  defaultToRecipients: string[];
  defaultCcRecipients: string[];
  defaultBccRecipients: string[];
  emailSubjectTemplate: string | null;
  emailBodyTemplate: string | null;
  enabled: boolean;
};

export type UpdateWhatsAppSettingsInput = WhatsAppSettingsResponse;

export type TestMicrosoftGraphSettingsInput = Partial<UpdateMicrosoftGraphSettingsInput> & {
  sendTestEmail?: boolean;
};

export type TestWhatsAppSettingsInput = Partial<UpdateWhatsAppSettingsInput> & {
  sendTestMessage?: boolean;
};

export type TestMicrosoftGraphSettingsResponse =
  | { ok: true }
  | { ok: true; accessTokenPresent: boolean; lastConnectionTestAt: string; testEmailSent: boolean };

export type TestWhatsAppSettingsResponse = { ok: true } | { ok: true; testMessageSent: boolean };

export const apiGetSnipeItSettings = async (): Promise<SnipeItSettingsResponse> => {
  return apiFetchJson<SnipeItSettingsResponse>("/api/system/snipeit-settings");
};

export const apiUpdateSnipeItSettings = async (input: UpdateSnipeItSettingsInput): Promise<SnipeItSettingsResponse> => {
  return apiFetchJson<SnipeItSettingsResponse>("/api/system/snipeit-settings", { method: "PUT", body: input });
};

export const apiTestSnipeItSettings = async (input?: Partial<UpdateSnipeItSettingsInput>): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>("/api/system/snipeit-settings/test", input ? { method: "POST", body: input } : { method: "POST" });
};

export const apiGetMicrosoftGraphSettings = async (): Promise<MicrosoftGraphSettingsResponse> => {
  return apiFetchJson<MicrosoftGraphSettingsResponse>("/api/system/microsoft-graph-settings");
};

export const apiGetWhatsAppSettings = async (): Promise<WhatsAppSettingsResponse> => {
  return apiFetchJson<WhatsAppSettingsResponse>("/api/system/whatsapp-settings");
};

export const apiUpdateMicrosoftGraphSettings = async (
  input: UpdateMicrosoftGraphSettingsInput,
): Promise<MicrosoftGraphSettingsResponse> => {
  return apiFetchJson<MicrosoftGraphSettingsResponse>("/api/system/microsoft-graph-settings", {
    method: "PUT",
    body: input,
  });
};

export const apiUpdateWhatsAppSettings = async (input: UpdateWhatsAppSettingsInput): Promise<WhatsAppSettingsResponse> => {
  return apiFetchJson<WhatsAppSettingsResponse>("/api/system/whatsapp-settings", { method: "PUT", body: input });
};

export const apiTestMicrosoftGraphSettings = async (
  input?: TestMicrosoftGraphSettingsInput,
): Promise<TestMicrosoftGraphSettingsResponse> => {
  return apiFetchJson<TestMicrosoftGraphSettingsResponse>(
    "/api/system/microsoft-graph-settings/test",
    input ? { method: "POST", body: input } : { method: "POST" },
  );
};

export const apiTestWhatsAppSettings = async (input?: TestWhatsAppSettingsInput): Promise<TestWhatsAppSettingsResponse> => {
  return apiFetchJson<TestWhatsAppSettingsResponse>(
    "/api/system/whatsapp-settings/test",
    input ? { method: "POST", body: input } : { method: "POST" },
  );
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

export type EvidenceImportRunResult = {
  examined: number;
  importedFiles: number;
  skippedFiles: number;
  errorFiles: number;
  createdTasks: number;
  replacedTasks: number;
  skipReasons: Partial<Record<EvidenceImportSkipReason, number>>;
  skippedSamples: EvidenceImportSkippedSample[];
  errorStages: Partial<Record<EvidenceImportErrorStage, number>>;
  errorSamples: EvidenceImportErrorSample[];
};

export type EvidenceImportSkipReason =
  | "no_date_in_name"
  | "no_asset_key"
  | "asset_not_found"
  | "no_template"
  | "not_regular_file"
  | "duplicate_task";

export type EvidenceImportSkippedSample = {
  fileName: string;
  reason: EvidenceImportSkipReason;
  assetKey: string | null;
  date: string | null;
  detail: string | null;
};

export type EvidenceImportErrorStage =
  | "storage_path_escape"
  | "stat_failed"
  | "move_failed"
  | "task_ensure_failed"
  | "db_exception";

export type EvidenceImportErrorSample = {
  fileName: string;
  stage: EvidenceImportErrorStage;
  assetKey: string | null;
  date: string | null;
  error: string | null;
};

export const apiRunEvidenceImport = async (input: {
  templateId?: string | null;
  duplicateAction: "skip" | "replace";
}): Promise<EvidenceImportRunResult> => {
  return apiFetchJson<EvidenceImportRunResult>("/api/system/evidence-import/run", {
    method: "POST",
    body: input,
  });
};
