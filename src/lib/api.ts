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
  categoryId?: string;
  categoryIds?: string[];
  page?: number;
  pageSize?: number;
}): Promise<ListAssetsResponse> => {
  const params = new URLSearchParams();
  if (input.search) params.set("search", input.search);
  if (input.status) params.set("status", input.status);
  if (input.pmEnabled !== undefined) params.set("pmEnabled", input.pmEnabled ? "true" : "false");
  if (input.categoryId) params.set("categoryId", input.categoryId);
  if (input.categoryIds && input.categoryIds.length > 0) params.set("categoryIds", input.categoryIds.join(","));
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
  assetId?: string;
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
  if (input.assetId) params.set("assetId", input.assetId);
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

export type TaskDetailChecklistItem = {
  id: string;
  sortOrder: number;
  itemText: string;
  isMandatory: boolean;
  requiresNotes: boolean;
  requiresPassFail: boolean;
  isActive: boolean;
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

export const apiStartTask = async (taskId: string): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>(`/api/tasks/${taskId}/start`, { method: "POST" });
};

export type CompleteTaskChecklistResultInput = {
  templateChecklistItemId: string;
  outcome: 0 | 1 | 2;
  notes?: string | null;
};

export const apiCompleteTask = async (input: {
  taskId: string;
  checklistResults: CompleteTaskChecklistResultInput[];
  forceCompleted?: boolean;
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

export type LookupRole = {
  id: string;
  name: string;
};

export type LookupAssetCategory = {
  id: string;
  name: string;
  isActive: boolean;
};

export type LookupsResponse = {
  roles: LookupRole[];
  assetCategories: LookupAssetCategory[];
};

export const apiGetLookups = async (): Promise<LookupsResponse> => {
  return apiFetchJson<LookupsResponse>("/api/system/lookups");
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

export type SnipeItSettingsResponse = {
  baseUrl: string | null;
  apiTokenConfigured: boolean;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
};

export type UpdateSnipeItSettingsInput = {
  baseUrl: string | null;
  apiToken?: string | null;
  autoSyncEnabled: boolean;
  syncIntervalMinutes: number;
};

export const apiGetSnipeItSettings = async (): Promise<SnipeItSettingsResponse> => {
  return apiFetchJson<SnipeItSettingsResponse>("/api/system/snipeit-settings");
};

export const apiUpdateSnipeItSettings = async (input: UpdateSnipeItSettingsInput): Promise<SnipeItSettingsResponse> => {
  return apiFetchJson<SnipeItSettingsResponse>("/api/system/snipeit-settings", { method: "PUT", body: input });
};

export const apiTestSnipeItSettings = async (input?: Partial<UpdateSnipeItSettingsInput>): Promise<{ ok: true }> => {
  return apiFetchJson<{ ok: true }>("/api/system/snipeit-settings/test", input ? { method: "POST", body: input } : { method: "POST" });
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
