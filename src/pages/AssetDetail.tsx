import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Server,
  MapPin,
  User,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  ExternalLink,
  FileText,
  Image,
  Download,
  ChevronDown,
  ChevronUp,
  Wrench,
  Shield,
  Activity,
  Paperclip,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { isManager } from "@/lib/auth";
import { TaskDetailDialog } from "@/pages/Tasks";
import { ReportBreakdownDialog } from "@/components/workorders/ReportBreakdownDialog";
import {
  ApiError,
  apiDownloadEvidence,
  apiDownloadTaskPdf,
  apiDownloadChecklistEvidence,
  apiGetAsset,
  apiGetSystemStatus,
  apiGetTask,
  apiListBlackoutWindows,
  apiListTasks,
    apiListWorkOrders,
  apiListTemplates,
  apiPatchAssetPm,
  apiCreatePmNowTask,
  apiRecalculateSchedules,
  apiDeleteTask,
  type BlackoutWindow,
  type TaskEvidence,
  type TaskDetail,
  type TaskListItem,
    type WorkOrderListItem,
  type TemplateSummary,
} from "@/lib/api";

const EMPTY_TEMPLATES: TemplateSummary[] = [];

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".m4v": "video/x-m4v",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

const inferMimeTypeFromFileName = (fileName: string | null): string | null => {
  if (!fileName) return null;
  const extIndex = fileName.lastIndexOf(".");
  if (extIndex < 0) return null;
  const ext = fileName.slice(extIndex).toLowerCase();
  return MIME_BY_EXT[ext] ?? null;
};

const daysInUtcMonth = (year: number, monthIndex: number): number => {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
};

const addUtcMonthsClamped = (date: Date, months: number): Date => {
  const year = date.getUTCFullYear();
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();

  const targetMonthIndex = monthIndex + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonthIndex = ((targetMonthIndex % 12) + 12) % 12;
  const maxDay = daysInUtcMonth(targetYear, normalizedMonthIndex);
  const clampedDay = Math.min(day, maxDay);

  return new Date(
    Date.UTC(
      targetYear,
      normalizedMonthIndex,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ),
  );
};

const addUtcYearsClamped = (date: Date, years: number): Date => {
  const year = date.getUTCFullYear() + years;
  const monthIndex = date.getUTCMonth();
  const day = date.getUTCDate();
  const maxDay = daysInUtcMonth(year, monthIndex);
  const clampedDay = Math.min(day, maxDay);
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      clampedDay,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
    ),
  );
};

const addIntervalUtc = (date: Date, intervalDays: number): Date => {
  if (intervalDays === 30) return addUtcMonthsClamped(date, 1);
  if (intervalDays === 90) return addUtcMonthsClamped(date, 3);
  if (intervalDays === 180) return addUtcMonthsClamped(date, 6);
  if (intervalDays === 365) return addUtcYearsClamped(date, 1);
  return new Date(date.getTime() + intervalDays * 24 * 60 * 60 * 1000);
};

const shiftForBlackoutsUtc = (candidate: Date, windows: BlackoutWindow[]): Date => {
  const candidateTime = candidate.getTime();
  let latestEndsAt: number | null = null;

  for (const w of windows) {
    if (!w.IsActive) continue;
    const startsAt = new Date(w.StartsAt).getTime();
    const endsAt = new Date(w.EndsAt).getTime();
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) continue;
    if (startsAt <= candidateTime && candidateTime <= endsAt) {
      if (latestEndsAt === null || endsAt > latestEndsAt) {
        latestEndsAt = endsAt;
      }
    }
  }

  if (latestEndsAt === null) return candidate;
  return new Date(latestEndsAt);
};

type AssetScheduleItem = {
  id: string;
  date: string;
  templateName: string;
  status: "scheduled" | "projected";
  taskId: string | null;
  taskNumber: string | null;
};

const AssetDetail = () => {
  const { assetId } = useParams();
  const [expandedHistoryTaskId, setExpandedHistoryTaskId] = useState<string | null>(null);
  const [previewEvidenceId, setPreviewEvidenceId] = useState<string | null>(null);
  const [previewKind, setPreviewKind] = useState<"task" | "checklist">("task");
  const [previewOpen, setPreviewOpen] = useState<boolean>(false);
  const [previewLoading, setPreviewLoading] = useState<boolean>(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const [exportingPdfTaskId, setExportingPdfTaskId] = useState<string | null>(null);
  const [pmNowTaskId, setPmNowTaskId] = useState<string | null>(null);
  const [pmNowDialogOpen, setPmNowDialogOpen] = useState<boolean>(false);
  const [reportBreakdownOpen, setReportBreakdownOpen] = useState<boolean>(false);
  const [deleteTaskDialogOpen, setDeleteTaskDialogOpen] = useState<boolean>(false);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<{ id: string; taskNumber: string } | null>(null);
  const [approvedOnly, setApprovedOnly] = useState<boolean>(false);

  const queryClient = useQueryClient();

  const systemStatusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: apiGetSystemStatus,
    refetchInterval: 30_000,
  });

  const assetQuery = useQuery({
    queryKey: ["asset", assetId],
    queryFn: async () => {
      if (!assetId) throw new Error("Missing assetId");
      return apiGetAsset(assetId);
    },
    enabled: Boolean(assetId),
  });

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => apiListTemplates(),
    staleTime: 60_000,
  });

  const historyTasksQuery = useQuery({
    queryKey: ["tasks", "history", assetId, approvedOnly ? "approved-only" : "all"],
    queryFn: async () => {
      if (!assetId) throw new Error("Missing assetId");
      return apiListTasks({ assetId, status: "completed", maintenanceType: "PM", approvedOnly, page: 1, pageSize: 50 });
    },
    enabled: Boolean(assetId),
    staleTime: 30_000,
  });

  const cmHistoryQuery = useQuery({
    queryKey: ["work-orders", "history", assetId],
    queryFn: async () => {
      if (!assetId) throw new Error("Missing assetId");
      return apiListWorkOrders({ assetId, status: "completed", page: 1, pageSize: 50 });
    },
    enabled: Boolean(assetId),
    staleTime: 30_000,
  });

  const expandedTaskQuery = useQuery({
    queryKey: ["task", expandedHistoryTaskId],
    queryFn: async () => {
      if (!expandedHistoryTaskId) throw new Error("Missing taskId");
      return apiGetTask(expandedHistoryTaskId);
    },
    enabled: Boolean(expandedHistoryTaskId),
  });

  const patchPmMutation = useMutation({
    mutationFn: async (input: { pmEnabled?: boolean; defaultTemplateId?: string | null }) => {
      if (!assetId) throw new Error("Missing assetId");
      return apiPatchAssetPm({ assetId, ...input });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["asset", assetId] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Updated", description: "PM settings saved." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Update failed";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    },
  });

  const recalcPmMutation = useMutation({
    mutationFn: async () => {
      if (!assetId) throw new Error("Missing assetId");
      return apiRecalculateSchedules({ assetId, force: true });
    },
    onSuccess: async () => {
      if (!assetId) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["asset", assetId] }),
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
      ]);
      toast({
        title: "PM schedule updated",
        description: "Next PM date was recalculated for this asset.",
      });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to recalculate schedule";
      toast({ title: "Action failed", description: message, variant: "destructive" });
    },
  });

  const pmNowStartMutation = useMutation({
    mutationFn: async () => {
      if (!assetId) throw new Error("Missing assetId");

      const currentAsset = assetQuery.data;
      const defaultTemplateId = currentAsset?.pm.defaultTemplateId ?? null;
      if (!defaultTemplateId) {
        throw new Error("PM template is not configured for this asset");
      }
      const created = await apiCreatePmNowTask({ assetId });
      return created.id;
    },
    onSuccess: (taskId) => {
      setPmNowTaskId(taskId);
      setPmNowDialogOpen(true);
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to start PM Now";
      toast({ title: "PM Now unavailable", description: message, variant: "destructive" });
    },
  });

  const asset = assetQuery.data;
  const canManage = isManager();
  const pmEnabled = asset?.pm.enabled === true;

  const deleteHistoryTaskMutation = useMutation({
    mutationFn: async (taskId: string) => apiDeleteTask(taskId),
    onSuccess: async (_data, taskId) => {
      if (assetId) {
        await queryClient.invalidateQueries({ queryKey: ["tasks", "history", assetId] });
        await queryClient.invalidateQueries({
          queryKey: ["tasks", "upcoming", assetId, asset?.pm.defaultTemplateId],
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (expandedHistoryTaskId === taskId) {
        setExpandedHistoryTaskId(null);
      }
      toast({
        title: "PM history entry removed",
        description: "Task and its evidence were deleted.",
      });
    },
    onError: (err: unknown) => {
      const message =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to delete task";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    },
  });

  const blackoutWindowsQuery = useQuery({
    queryKey: ["scheduling", "blackout-windows"],
    queryFn: apiListBlackoutWindows,
    staleTime: 60_000,
  });

  const upcomingTasksQuery = useQuery({
    queryKey: ["tasks", "upcoming", assetId, asset?.pm.defaultTemplateId],
    queryFn: async () => {
      if (!assetId) throw new Error("Missing assetId");

      const templateId = asset?.pm.defaultTemplateId ?? null;
      if (!templateId) return { page: 1, pageSize: 0, items: [] };

      const now = new Date();
      const dueFrom = now.toISOString();
      const dueTo = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
      return apiListTasks({
        assetId,
        templateId,
        dueFrom,
        dueTo,
        page: 1,
        pageSize: 200,
      });
    },
    enabled: Boolean(assetId) && Boolean(asset?.pm.defaultTemplateId),
    staleTime: 30_000,
  });

  const snipeItBaseUrl = systemStatusQuery.data?.snipeIt.baseUrl ?? null;
  const snipeItHardwareUrl =
    snipeItBaseUrl && asset?.snipeAssetId
      ? `${snipeItBaseUrl.replace(/\/$/, "")}/hardware/${asset.snipeAssetId}`
      : snipeItBaseUrl;

  const categoryId = asset?.category.id ?? null;
  const allTemplates = templatesQuery.data?.items ?? EMPTY_TEMPLATES;
  const filteredTemplates = useMemo((): TemplateSummary[] => {
    if (!asset) return allTemplates;

    const selectedId = asset.pm.defaultTemplateId;
    return allTemplates.filter((t) => {
      if (selectedId && t.id === selectedId) return true;

      const applicableCategoryId = t.applicableCategory?.id ?? null;
      if (!categoryId) return applicableCategoryId === null;
      return applicableCategoryId === null || applicableCategoryId === categoryId;
    });
  }, [allTemplates, asset, categoryId]);

  const selectedTemplate = useMemo((): TemplateSummary | null => {
    const id = asset?.pm.defaultTemplateId ?? null;
    if (!id) return null;
    return allTemplates.find((t) => t.id === id) ?? null;
  }, [allTemplates, asset?.pm.defaultTemplateId]);

  const scheduleItems = useMemo((): AssetScheduleItem[] => {
    if (!asset) return [];
    if (!pmEnabled) return [];

    const templateId = asset.pm.defaultTemplateId ?? null;
    if (!templateId) return [];

    const intervalDays = selectedTemplate?.intervalDays ?? null;
    const blackoutWindows = blackoutWindowsQuery.data?.items ?? [];

    const upcomingTasks = (upcomingTasksQuery.data?.items ?? [])
      .filter((t) => t.status !== "completed" && t.status !== "cancelled")
      .sort((a, b) => new Date(a.scheduledDueAt).getTime() - new Date(b.scheduledDueAt).getTime());

    if (!intervalDays || !Number.isFinite(intervalDays) || intervalDays <= 0) {
      return upcomingTasks.slice(0, 4).map((t) => ({
        id: t.id,
        date: t.scheduledDueAt.slice(0, 10),
        templateName: t.template.name,
        status: "scheduled",
        taskId: t.id,
        taskNumber: t.taskNumber,
      }));
    }

    const byScheduledSecond = new Map<number, TaskListItem>();
    for (const t of upcomingTasks) {
      const time = new Date(t.scheduledDueAt).getTime();
      if (!Number.isFinite(time)) continue;
      byScheduledSecond.set(Math.floor(time / 1000), t);
    }

    const baseDueAtIso = asset.pm.nextDueAt ?? null;
    if (!baseDueAtIso) {
      return upcomingTasks.slice(0, 4).map((t) => ({
        id: t.id,
        date: t.scheduledDueAt.slice(0, 10),
        templateName: t.template.name,
        status: "scheduled",
        taskId: t.id,
        taskNumber: t.taskNumber,
      }));
    }

    let dueAt = new Date(baseDueAtIso);
    if (!Number.isFinite(dueAt.getTime())) {
      return upcomingTasks.slice(0, 4).map((t) => ({
        id: t.id,
        date: t.scheduledDueAt.slice(0, 10),
        templateName: t.template.name,
        status: "scheduled",
        taskId: t.id,
        taskNumber: t.taskNumber,
      }));
    }

    const items: AssetScheduleItem[] = [];
    for (let i = 0; i < 4; i += 1) {
      const dueSecond = Math.floor(dueAt.getTime() / 1000);
      const scheduledTask = byScheduledSecond.get(dueSecond) ?? null;
      const templateName = scheduledTask?.template.name ?? selectedTemplate?.name ?? "—";
      const date = (scheduledTask?.scheduledDueAt ?? dueAt.toISOString()).slice(0, 10);
      items.push({
        id: scheduledTask?.id ?? `projected:${templateId}:${dueSecond}`,
        date,
        templateName,
        status: scheduledTask ? "scheduled" : "projected",
        taskId: scheduledTask?.id ?? null,
        taskNumber: scheduledTask?.taskNumber ?? null,
      });

      const nextCandidate = addIntervalUtc(dueAt, intervalDays);
      dueAt = shiftForBlackoutsUtc(nextCandidate, blackoutWindows);
    }

    return items;
  }, [asset, blackoutWindowsQuery.data?.items, pmEnabled, selectedTemplate?.intervalDays, selectedTemplate?.name, upcomingTasksQuery.data?.items]);

  const historyTasks = useMemo((): TaskListItem[] => {
    const items = historyTasksQuery.data?.items ?? [];
    return [...items]
      .filter((t) => Boolean(t.completedAt))
      .sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [historyTasksQuery.data?.items]);

  const cmHistoryOrders = useMemo((): WorkOrderListItem[] => {
    const items = cmHistoryQuery.data?.items ?? [];
    return [...items]
      .filter((t) => Boolean(t.completedAt))
      .sort((a, b) => {
        const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
        const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [cmHistoryQuery.data?.items]);

  const expandedTask = expandedTaskQuery.data as TaskDetail | undefined;

  const formatDuration = (startedAt: string | null, completedAt: string | null): string => {
    if (!startedAt || !completedAt) return "—";
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
    const minutes = Math.round((end - start) / 60_000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
  };

  const formatBytes = (bytes: number | null): string => {
    if (bytes === null || !Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(1)} GB`;
  };

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const closePreview = (): void => {
    setPreviewOpen(false);
    setPreviewEvidenceId(null);
    setPreviewLoading(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFileName(null);
    setPreviewContentType(null);
  };

  type EvidencePreviewInput = {
    kind: "task" | "checklist";
    id: string;
    uri: string;
    fileName: string | null;
    contentType: string | null;
  };

  const openEvidencePreviewInternal = async (input: EvidencePreviewInput): Promise<void> => {
    const isInternal = input.uri === "imported" || input.uri === "stored" || input.uri === "uploaded";
    if (!isInternal) {
      const target = input.uri.trim();
      if (target) window.open(target, "_blank", "noreferrer");
      return;
    }

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewEvidenceId(input.id);
    setPreviewFileName(input.fileName);
    setPreviewContentType(input.contentType);
    setPreviewUrl(null);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewKind(input.kind);
    try {
      const res =
        input.kind === "task"
          ? await apiDownloadEvidence({ evidenceId: input.id })
          : await apiDownloadChecklistEvidence({ checklistEvidenceId: input.id });
      const preferredType =
        res.contentType ?? input.contentType ?? inferMimeTypeFromFileName(res.fileName ?? input.fileName);
      const blob = preferredType && res.blob.type !== preferredType ? new Blob([res.blob], { type: preferredType }) : res.blob;
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
      setPreviewFileName((prev) => prev ?? res.fileName);
      setPreviewContentType((prev) => prev ?? preferredType ?? res.contentType);
    } catch (err: unknown) {
      closePreview();
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to open evidence";
      toast({ title: "Evidence error", description: message, variant: "destructive" });
      return;
    } finally {
      setPreviewLoading(false);
    }
  };

  const openEvidencePreview = async (evidence: TaskEvidence): Promise<void> => {
    await openEvidencePreviewInternal({
      kind: "task",
      id: evidence.id,
      uri: evidence.uri,
      fileName: evidence.fileName,
      contentType: evidence.contentType,
    });
  };

  const openChecklistEvidencePreview = async (input: {
    id: string;
    uri: string;
    fileName: string | null;
    contentType: string | null;
  }): Promise<void> => {
    await openEvidencePreviewInternal({
      kind: "checklist",
      id: input.id,
      uri: input.uri,
      fileName: input.fileName,
      contentType: input.contentType,
    });
  };

  const viewEvidence = async (evidenceId: string, kind: "task" | "checklist"): Promise<void> => {
    try {
      const res =
        kind === "task"
          ? await apiDownloadEvidence({ evidenceId })
          : await apiDownloadChecklistEvidence({ checklistEvidenceId: evidenceId });
      const preferredType = res.contentType ?? inferMimeTypeFromFileName(res.fileName);
      const blob = preferredType && res.blob.type !== preferredType ? new Blob([res.blob], { type: preferredType }) : res.blob;
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to open evidence";
      toast({ title: "Evidence error", description: message, variant: "destructive" });
    }
  };

  const downloadEvidence = async (evidenceId: string, kind: "task" | "checklist"): Promise<void> => {
    try {
      const res =
        kind === "task"
          ? await apiDownloadEvidence({ evidenceId, download: true })
          : await apiDownloadChecklistEvidence({ checklistEvidenceId: evidenceId, download: true });
      const preferredType = res.contentType ?? inferMimeTypeFromFileName(res.fileName);
      const blob = preferredType && res.blob.type !== preferredType ? new Blob([res.blob], { type: preferredType }) : res.blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName ?? "evidence";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to download evidence";
      toast({ title: "Evidence error", description: message, variant: "destructive" });
    }
  };

  const downloadTaskPdf = async (taskId: string): Promise<void> => {
    setExportingPdfTaskId(taskId);
    try {
      const res = await apiDownloadTaskPdf(taskId);
      const url = URL.createObjectURL(res.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName ?? "pm-history.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      toast({ title: "Export ready", description: "PDF downloaded." });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed to export PDF";
      toast({ title: "Export failed", description: message, variant: "destructive" });
    } finally {
      setExportingPdfTaskId((prev) => (prev === taskId ? null : prev));
    }
  };

  const handleConfirmDeleteHistoryTask = async (): Promise<void> => {
    if (!deleteTaskTarget) return;

    try {
      await deleteHistoryTaskMutation.mutateAsync(deleteTaskTarget.id);
    } finally {
      setDeleteTaskDialogOpen(false);
      setDeleteTaskTarget(null);
    }
  };

  const getChecklistStatusIcon = (status: string) => {
    switch (status) {
      case "pass":
      case "done":
        return <CheckCircle className="w-4 h-4 text-success" />;
      case "fail":
        return <XCircle className="w-4 h-4 text-destructive" />;
      case "skip":
        return <Clock className="w-4 h-4 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getTotalEvidenceCount = (taskDetail: TaskDetail): number => {
    const checklistEvidenceCount = taskDetail.checklistItems.reduce((total, item) => {
      return total + item.evidence.length;
    }, 0);
    return taskDetail.evidence.length + checklistEvidenceCount;
  };

  const getPMStatusBadge = () => {
    if (!pmEnabled) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">PM Disabled</Badge>;
    }

    const nextDueAt = asset.pm.nextDueAt;
    if (!nextDueAt) {
      return <Badge variant="outline" className="bg-muted text-muted-foreground">Not Scheduled</Badge>;
    }

    const nextPM = new Date(nextDueAt);
    const today = new Date();
    const diffDays = Math.ceil((nextPM.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">Overdue</Badge>;
    }
    if (diffDays <= 7) {
      return <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">Due Soon</Badge>;
    }
    return <Badge variant="outline" className="bg-success/20 text-success border-success/30">On Track</Badge>;
  };

  if (!assetId) {
    return (
      <div className="min-h-screen">
        <Header title="Asset Details" subtitle="Missing asset" />
        <div className="p-6 text-sm text-muted-foreground">Missing assetId.</div>
      </div>
    );
  }

  if (assetQuery.isLoading) {
    return (
      <div className="min-h-screen">
        <Header title="Asset Details" subtitle={assetId} />
        <div className="p-6 text-sm text-muted-foreground">Loading asset…</div>
      </div>
    );
  }

  if (assetQuery.isError || !asset) {
    return (
      <div className="min-h-screen">
        <Header title="Asset Details" subtitle={assetId} />
        <div className="p-6 text-sm text-destructive">Failed to load asset.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header title="Asset Details" subtitle={`${asset.assetTag} - ${asset.name}`} />

      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePreview();
            return;
          }
          setPreviewOpen(true);
        }}
      >
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="truncate">{previewFileName ?? "Evidence preview"}</DialogTitle>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (previewUrl) {
                      window.open(previewUrl, "_blank", "noreferrer");
                      return;
                    }
                    if (previewEvidenceId) viewEvidence(previewEvidenceId, previewKind);
                  }}
                  disabled={previewLoading || (!previewUrl && !previewEvidenceId)}
                  aria-label="Open in new tab"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (previewEvidenceId) downloadEvidence(previewEvidenceId, previewKind);
                  }}
                  disabled={previewLoading || !previewEvidenceId}
                  aria-label="Download"
                >
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="w-full">
            {previewLoading ? (
              <div className="h-[70vh] flex items-center justify-center text-sm text-muted-foreground">Loading…</div>
            ) : !previewUrl ? (
              <div className="h-[70vh] flex items-center justify-center text-sm text-muted-foreground">
                Preview not available.
              </div>
            ) : (previewContentType ?? "").includes("pdf") || (previewFileName ?? "").toLowerCase().endsWith(".pdf") ? (
              <iframe
                title={previewFileName ?? "Evidence"}
                src={previewUrl}
                className="w-full h-[70vh] rounded-md bg-background"
              />
            ) : (previewContentType ?? "").startsWith("image/") ||
              (previewFileName ?? "").toLowerCase().endsWith(".png") ||
              (previewFileName ?? "").toLowerCase().endsWith(".jpg") ||
              (previewFileName ?? "").toLowerCase().endsWith(".jpeg") ? (
              <div className="h-[70vh] flex items-center justify-center bg-background rounded-md">
                <img src={previewUrl} alt={previewFileName ?? "Evidence"} className="max-h-[70vh] max-w-full object-contain" />
              </div>
            ) : (previewContentType ?? "").startsWith("video/") ||
              (previewFileName ?? "").toLowerCase().endsWith(".mp4") ||
              (previewFileName ?? "").toLowerCase().endsWith(".mov") ||
              (previewFileName ?? "").toLowerCase().endsWith(".m4v") ? (
              <div className="h-[70vh] flex items-center justify-center bg-background rounded-md">
                <video src={previewUrl} controls className="max-h-[70vh] max-w-full rounded-md" />
              </div>
            ) : (previewContentType ?? "").startsWith("audio/") ||
              (previewFileName ?? "").toLowerCase().endsWith(".mp3") ||
              (previewFileName ?? "").toLowerCase().endsWith(".wav") ||
              (previewFileName ?? "").toLowerCase().endsWith(".m4a") ||
              (previewFileName ?? "").toLowerCase().endsWith(".aac") ? (
              <div className="h-[70vh] flex flex-col items-center justify-center gap-4 bg-background rounded-md p-6">
                <div className="text-sm text-muted-foreground truncate w-full text-center">{previewFileName ?? "Audio"}</div>
                <audio src={previewUrl} controls className="w-full" />
              </div>
            ) : (
              <div className="h-[70vh] flex items-center justify-center text-sm text-muted-foreground">
                Preview not supported for this file type.
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <TaskDetailDialog
        open={pmNowDialogOpen}
        onOpenChange={(open) => {
          setPmNowDialogOpen(open);
          if (!open) {
            setPmNowTaskId(null);
          }
        }}
        taskId={pmNowTaskId}
        onStarted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }}
        onCompleted={async () => {
          if (!assetId) return;
          await recalcPmMutation.mutateAsync();
        }}
      />

      <ReportBreakdownDialog
        open={reportBreakdownOpen}
        onOpenChange={setReportBreakdownOpen}
        assetId={assetId ?? undefined}
        templateId={asset?.pm.defaultTemplateId ?? null}
      />

      <div className="p-6 space-y-6">
        {/* Back Button */}
        <Link to="/assets">
          <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
            Back to Assets
          </Button>
        </Link>

        {/* Asset Header Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center shrink-0">
                <Server className="w-8 h-8 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold text-foreground">{asset.name}</h2>
                  {getPMStatusBadge()}
                </div>
                <p className="text-muted-foreground font-mono">{asset.assetTag}</p>
                <div className="flex flex-wrap items-center gap-4 mt-3">
                  <Badge variant="secondary">{asset.category.name ?? "—"}</Badge>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="w-4 h-4" />
                    {asset.location.name ?? "—"}
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <User className="w-4 h-4" />
                    {asset.assignedToText ?? "—"}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <span className="text-sm text-muted-foreground">PM Enabled</span>
                <Switch
                  checked={pmEnabled}
                  onCheckedChange={(checked) => patchPmMutation.mutate({ pmEnabled: checked })}
                  disabled={!canManage || patchPmMutation.isPending}
                />
              </div>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setReportBreakdownOpen(true)}
              >
                <Wrench className="w-4 h-4" />
                Report Breakdown
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={
                  !canManage ||
                  !pmEnabled ||
                  !asset?.pm.defaultTemplateId ||
                  recalcPmMutation.isPending ||
                  pmNowStartMutation.isPending
                }
                onClick={() => pmNowStartMutation.mutate()}
              >
                <Activity className="w-4 h-4" />
                PM Now
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                disabled={!snipeItHardwareUrl}
                onClick={() => {
                  if (snipeItHardwareUrl) window.open(snipeItHardwareUrl, "_blank", "noreferrer");
                }}
              >
                <ExternalLink className="w-4 h-4" />
                Open in Snipe-IT
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Last PM</p>
                <p className="text-lg font-semibold text-foreground">
                  {asset.pm.lastCompletedAt ? new Date(asset.pm.lastCompletedAt).toLocaleDateString() : "—"}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center">
                <Clock className="w-5 h-5 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Next PM</p>
                <p className="text-lg font-semibold text-foreground">
                  {asset.pm.nextDueAt ? new Date(asset.pm.nextDueAt).toLocaleDateString() : "—"}
                </p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">PM Completed</p>
                <p className="text-lg font-semibold text-foreground">—</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/20 flex items-center justify-center">
                <Activity className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Compliance</p>
                <p className="text-lg font-semibold text-foreground">—</p>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="stat-card"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">CM Incidents</p>
                <p className="text-lg font-semibold text-foreground">{cmHistoryOrders.length}</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Tabs Content */}
        <Tabs defaultValue="general" className="w-full">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="general">General Info</TabsTrigger>
            <TabsTrigger value="history">PM History</TabsTrigger>
            <TabsTrigger value="cm-history">CM History</TabsTrigger>
            <TabsTrigger value="schedule">Schedule</TabsTrigger>
          </TabsList>

          {/* General Info Tab */}
          <TabsContent value="general" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="glass border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Server className="w-5 h-5 text-primary" />
                      Asset Information
                    </CardTitle>
                    <CardDescription>Synced from Snipe-IT</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {[
                      { label: "Manufacturer", value: asset.manufacturer },
                      { label: "Model", value: asset.model },
                      { label: "Serial Number", value: asset.serialNumber },
                      { label: "Category", value: asset.category.name },
                      { label: "Status", value: asset.assetStatus },
                      { label: "Operational Status", value: asset.assetOperationalStatus },
                      { label: "Assigned To", value: asset.assignedToText },
                    ].map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                        <span className="text-muted-foreground">{item.label}</span>
                        <span className="font-medium text-foreground">{item.value ?? "—"}</span>
                      </div>
                    ))}
                    <div className="pt-2">
                      <span className="text-muted-foreground block mb-1">Snipe-IT Notes</span>
                      <div className="text-sm font-medium text-foreground whitespace-pre-wrap max-h-40 overflow-auto rounded-md bg-muted/40 px-3 py-2">
                        {asset.snipeNotes && asset.snipeNotes.trim().length > 0 ? asset.snipeNotes : "No notes"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <Card className="glass border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Wrench className="w-5 h-5 text-accent" />
                      PM Configuration
                    </CardTitle>
                    <CardDescription>Maintenance settings for this asset</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {pmEnabled && !asset.pm.defaultTemplateId ? (
                      <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/30">
                        <AlertTriangle className="w-4 h-4 text-warning mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm text-foreground font-medium">PM template is not assigned</p>
                          <p className="text-xs text-muted-foreground">Select a template to enable scheduling.</p>
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <span className="text-muted-foreground">PM Template</span>
                      <Select
                        value={asset.pm.defaultTemplateId ?? "none"}
                        onValueChange={(value) => {
                          const next = value === "none" ? null : value;
                          patchPmMutation.mutate({ defaultTemplateId: next });
                        }}
                        disabled={!canManage || patchPmMutation.isPending}
                      >
                        <SelectTrigger className="bg-muted/50">
                          <SelectValue placeholder={templatesQuery.isLoading ? "Loading templates…" : "Select template"} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {filteredTemplates.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {t.isActive ? t.name : `${t.name} (Inactive)`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
                      <span className="text-muted-foreground">Interval</span>
                      <span className="font-medium text-foreground">
                        {selectedTemplate ? `${selectedTemplate.intervalDays} days` : "—"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
                      <span className="text-muted-foreground">Last Completed</span>
                      <span className="font-medium text-foreground">
                        {asset.pm.lastCompletedAt ? new Date(asset.pm.lastCompletedAt).toLocaleDateString() : "—"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
                      <span className="text-muted-foreground">Next Scheduled</span>
                      <span className="font-medium text-foreground">
                        {asset.pm.nextDueAt ? new Date(asset.pm.nextDueAt).toLocaleDateString() : "—"}
                      </span>
                    </div>

                    <div className="flex justify-between items-center py-2 border-b border-border last:border-0">
                      <span className="text-muted-foreground">PM Status</span>
                      <span className="font-medium text-foreground">{pmEnabled ? "Enabled" : "Disabled"}</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="lg:col-span-2"
              >
                <Card className="glass border-border">
                  <CardHeader>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Shield className="w-5 h-5 text-warning" />
                      Warranty & Dates
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground mb-1">Purchase Date</p>
                        <p className="text-lg font-semibold text-foreground">—</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground mb-1">Warranty Expiry</p>
                        <p className="text-lg font-semibold text-foreground">—</p>
                      </div>
                      <div className="p-4 rounded-lg bg-muted/30">
                        <p className="text-sm text-muted-foreground mb-1">Assigned To</p>
                        <p className="text-lg font-semibold text-foreground">{asset.assignedToText ?? "—"}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </TabsContent>

          {/* PM History Tab */}
          <TabsContent value="history" className="mt-4 space-y-4">
            <div className="flex items-center justify-end">
              <div className="flex items-center gap-2">
                <Switch id="approved-only" checked={approvedOnly} onCheckedChange={(v) => setApprovedOnly(v === true)} />
                <label htmlFor="approved-only" className="text-sm text-muted-foreground">Approved only</label>
              </div>
            </div>
            {historyTasksQuery.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading PM history…</div>
            ) : historyTasksQuery.isError ? (
              <div className="p-6 text-sm text-destructive">Failed to load PM history.</div>
            ) : historyTasks.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No completed PM tasks yet.</div>
            ) : (
              historyTasks.map((task, index) => {
                const isExpanded = expandedHistoryTaskId === task.id;
                const completedDate = task.completedAt ? new Date(task.completedAt).toLocaleDateString() : "—";
                const duration = formatDuration(task.startedAt, task.completedAt);
                const showExpandedDetail = isExpanded && expandedTask && expandedTask.id === task.id;
                const checksLabel = `${task.checklistCompleted}/${task.checklistTotal} checks completed`;

                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="glass rounded-xl overflow-hidden"
                  >
                    <div
                      className="p-5 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => setExpandedHistoryTaskId(isExpanded ? null : task.id)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-success/20 flex items-center justify-center shrink-0">
                            <CheckCircle className="w-6 h-6 text-success" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm text-muted-foreground">{task.taskNumber}</span>
                              <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                                Completed
                              </Badge>
                              {task.approvalStatus === "PendingSupervisor" ? (
                                <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
                                  Pending Supervisor
                                </Badge>
                              ) : task.approvalStatus === "PendingSuperadmin" ? (
                                <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">
                                  Pending Superadmin
                                </Badge>
                              ) : task.approvalStatus === "Approved" ? (
                                <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                                  Approved
                                </Badge>
                              ) : task.approvalStatus === "Rejected" ? (
                                <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">
                                  Rejected
                                </Badge>
                              ) : null}
                            </div>
                            <h3 className="font-semibold text-foreground">{task.template.name}</h3>
                            <p className="text-sm text-muted-foreground">
                              Completed on {completedDate} • {duration}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right hidden md:block">
                            <p className="text-sm text-muted-foreground">{checksLabel}</p>
                            {showExpandedDetail ? (
                              <p className="text-sm text-muted-foreground">{getTotalEvidenceCount(expandedTask)} evidence files</p>
                            ) : null}
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>

                    {isExpanded ? (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-border"
                      >
                        <div className="p-5 space-y-6">
                          {expandedTaskQuery.isLoading ? (
                            <div className="text-sm text-muted-foreground">Loading details…</div>
                          ) : expandedTaskQuery.isError ? (
                            <div className="text-sm text-destructive">Failed to load task details.</div>
                          ) : showExpandedDetail ? (
                            <>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 rounded-lg bg-muted/30">
                                  <p className="text-sm text-muted-foreground mb-1">Completed By</p>
                                  <p className="text-lg font-semibold text-foreground">
                                    {expandedTask.completedBy?.displayName ?? expandedTask.completedBy?.username ?? "—"}
                                  </p>
                                </div>
                                <div className="p-4 rounded-lg bg-muted/30">
                                  <p className="text-sm text-muted-foreground mb-1">Completed At</p>
                                  <p className="text-lg font-semibold text-foreground">
                                    {expandedTask.completedAt ? new Date(expandedTask.completedAt).toLocaleString() : "—"}
                                  </p>
                                </div>
                                <div className="p-4 rounded-lg bg-muted/30">
                                  <p className="text-sm text-muted-foreground mb-1">Evidence Files</p>
                                  <p className="text-lg font-semibold text-foreground">{getTotalEvidenceCount(expandedTask)}</p>
                                </div>
                              </div>

                              <div className="mt-4">
                                <h4 className="font-semibold text-foreground mb-3">Approval Trail</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                  <div className="p-4 rounded-lg bg-muted/30">
                                    <p className="text-sm text-muted-foreground mb-1">Technician</p>
                                    <p className="text-lg font-semibold text-foreground">
                                      {expandedTask.technicianCompletedBy?.displayName ?? expandedTask.technicianCompletedBy?.username ?? expandedTask.completedBy?.displayName ?? expandedTask.completedBy?.username ?? "—"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {expandedTask.technicianCompletedAt
                                        ? new Date(expandedTask.technicianCompletedAt).toLocaleString()
                                        : expandedTask.completedAt
                                        ? new Date(expandedTask.completedAt).toLocaleString()
                                        : "—"}
                                    </p>
                                  </div>
                                  <div className="p-4 rounded-lg bg-muted/30">
                                    <p className="text-sm text-muted-foreground mb-1">Supervisor</p>
                                    <p className="text-lg font-semibold text-foreground">
                                      {expandedTask.supervisorApprovedBy?.displayName ?? expandedTask.supervisorApprovedBy?.username ?? "—"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {expandedTask.supervisorApprovedAt ? new Date(expandedTask.supervisorApprovedAt).toLocaleString() : "—"}
                                    </p>
                                  </div>
                                  <div className="p-4 rounded-lg bg-muted/30">
                                    <p className="text-sm text-muted-foreground mb-1">Superadmin</p>
                                    <p className="text-lg font-semibold text-foreground">
                                      {expandedTask.superadminApprovedBy?.displayName ?? expandedTask.superadminApprovedBy?.username ?? "—"}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {expandedTask.superadminApprovedAt ? new Date(expandedTask.superadminApprovedAt).toLocaleString() : "—"}
                                    </p>
                                  </div>
                                </div>
                                {expandedTask.approvalStatus === "Rejected" ? (
                                  <div className="mt-2 p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                                    <p className="text-sm text-destructive">Rejected</p>
                                    <p className="text-sm text-foreground">{expandedTask.rejectionReason ?? "—"}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {(expandedTask.rejectedBy?.displayName ?? expandedTask.rejectedBy?.username ?? "—")}
                                      {" • "}
                                      {expandedTask.rejectedAt ? new Date(expandedTask.rejectedAt).toLocaleString() : "—"}
                                    </p>
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  disabled={exportingPdfTaskId === task.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void downloadTaskPdf(task.id);
                                  }}
                                >
                                  <Download className="h-4 w-4" />
                                  {exportingPdfTaskId === task.id ? "Exporting…" : "Export PDF"}
                                </Button>
                                {canManage ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="gap-2 text-destructive border-destructive/40 hover:text-destructive"
                                    disabled={deleteHistoryTaskMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeleteTaskTarget({ id: task.id, taskNumber: task.taskNumber });
                                      setDeleteTaskDialogOpen(true);
                                    }}
                                  >
                                    <XCircle className="h-4 w-4" />
                                    Remove from history
                                  </Button>
                                ) : null}
                              </div>

                              <div>
                                <h4 className="font-semibold text-foreground mb-3">Checklist Results</h4>
                                <div className="space-y-2">
                                  {[...expandedTask.checklistItems]
                                    .sort((a, b) => a.sortOrder - b.sortOrder)
                                    .map((item) => {
                                      const outcome = item.result?.outcomeLabel ?? "skip";
                                      const notes = item.result?.notes;
                                      const attachments = item.evidence;
                                      const attachmentCount = attachments.length;
                                      const hasAttachments = attachmentCount > 0;
                                      const visibleAttachments = attachments.slice(0, 3);
                                      return (
                                        <div
                                          key={item.id}
                                          className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                                        >
                                          <div className="flex items-center gap-3 min-w-0">
                                            {getChecklistStatusIcon(outcome)}
                                            <span
                                              className={`text-sm truncate ${outcome === "skip" ? "text-muted-foreground" : "text-foreground"}`}
                                            >
                                              {item.itemText}
                                            </span>
                                            {item.isMandatory ? (
                                              <Badge variant="outline" className="text-xs shrink-0">
                                                Required
                                              </Badge>
                                            ) : null}
                                          </div>
                                          <div className="flex flex-col items-end gap-1 ml-4">
                                            {notes ? (
                                              <span className="text-sm text-muted-foreground max-w-xs text-right truncate">{notes}</span>
                                            ) : null}
                                            {hasAttachments ? (
                                              <div className="flex flex-wrap justify-end gap-1">
                                                {visibleAttachments.map((attachment) => (
                                                  <button
                                                    key={attachment.id}
                                                    type="button"
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      void openChecklistEvidencePreview({
                                                        id: attachment.id,
                                                        uri: attachment.uri,
                                                        fileName: attachment.fileName,
                                                        contentType: attachment.contentType,
                                                      });
                                                    }}
                                                    className="inline-flex items-center gap-1 rounded-full bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-background"
                                                  >
                                                    <Paperclip className="h-3 w-3" />
                                                    <span className="max-w-[8rem] truncate">
                                                      {attachment.fileName ?? attachment.uri}
                                                    </span>
                                                  </button>
                                                ))}
                                                {attachmentCount > visibleAttachments.length ? (
                                                  <span className="text-[11px] text-muted-foreground">
                                                    +{attachmentCount - visibleAttachments.length} more
                                                  </span>
                                                ) : null}
                                              </div>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                              </div>

                              <div>
                                <h4 className="font-semibold text-foreground mb-3">Evidence & Attachments</h4>
                                {expandedTask.evidence.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">No evidence uploaded.</div>
                                ) : (
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {expandedTask.evidence.map((file) => {
                                      const name = file.fileName ?? "Untitled";
                                      const lower = name.toLowerCase();
                                      const contentType = file.contentType ?? "";
                                      const isPdf = contentType.includes("pdf") || lower.endsWith(".pdf");
                                      const isImage = contentType.startsWith("image/") || lower.endsWith(".png") || lower.endsWith(".jpg") || lower.endsWith(".jpeg");
                                      const iconBg = isPdf ? "bg-destructive/20" : "bg-primary/20";
                                      const iconColor = isPdf ? "text-destructive" : "text-primary";
                                      const uploadedAt = new Date(file.uploadedAt).toLocaleDateString();
                                      const sizeLabel = formatBytes(file.sizeBytes);
                                      const isImported = file.uri === "imported";

                                      return (
                                        <div
                                          key={file.id}
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => openEvidencePreview(file)}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter" || e.key === " ") openEvidencePreview(file);
                                          }}
                                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors group cursor-pointer"
                                        >
                                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconBg}`}>
                                            {isPdf ? (
                                              <FileText className={`w-5 h-5 ${iconColor}`} />
                                            ) : isImage ? (
                                              <Image className={`w-5 h-5 ${iconColor}`} />
                                            ) : (
                                              <FileText className={`w-5 h-5 ${iconColor}`} />
                                            )}
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-foreground truncate">{name}</p>
                                            <p className="text-xs text-muted-foreground">
                                              {sizeLabel} • {uploadedAt}
                                            </p>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            {isImported ? (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  openEvidencePreview(file);
                                                }}
                                                aria-label="Preview evidence"
                                              >
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                            ) : (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  const target = file.uri.trim();
                                                  if (target) window.open(target, "_blank", "noreferrer");
                                                }}
                                                aria-label="Open link"
                                              >
                                                <ExternalLink className="h-4 w-4" />
                                              </Button>
                                            )}
                                            {isImported ? (
                                              <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 opacity-0 group-hover:opacity-100"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  void downloadEvidence(file.id, "task");
                                                }}
                                                aria-label="Download evidence"
                                              >
                                                <Download className="h-4 w-4" />
                                              </Button>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <div className="text-sm text-muted-foreground">No details available.</div>
                          )}
                        </div>
                      </motion.div>
                    ) : null}
                  </motion.div>
                );
              })
            )}
          </TabsContent>

          {/* CM History Tab */}
          <TabsContent value="cm-history" className="mt-4 space-y-4">
            {cmHistoryQuery.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading CM history…</div>
            ) : cmHistoryQuery.isError ? (
              <div className="p-6 text-sm text-destructive">Failed to load CM history.</div>
            ) : cmHistoryOrders.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No completed CM work orders yet.</div>
            ) : (
              cmHistoryOrders.map((wo, index) => {
                const completedDate = wo.completedAt ? new Date(wo.completedAt).toLocaleDateString() : "—";
                return (
                  <motion.div
                    key={wo.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="glass rounded-xl overflow-hidden"
                  >
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                            <Wrench className="w-6 h-6 text-primary" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm text-muted-foreground">{wo.taskNumber}</span>
                              <Badge variant="outline" className="bg-success/20 text-success border-success/30">Completed</Badge>
                            </div>
                            <h3 className="font-semibold text-foreground">{wo.templateName ?? "Work Order"}</h3>
                            <p className="text-sm text-muted-foreground">Completed on {completedDate}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link to={`/work-orders/${wo.id}`} className="inline-flex">
                            <Button type="button" variant="outline" size="sm">View</Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })
            )}
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule" className="mt-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <Card className="glass border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Upcoming PM Schedule</CardTitle>
                  <CardDescription>Projected maintenance schedule based on current template</CardDescription>
                </CardHeader>
                <CardContent>
                  {!pmEnabled ? (
                    <div className="p-6 text-sm text-muted-foreground">
                      Enable PM for this asset to see upcoming maintenance dates.
                    </div>
                  ) : !asset.pm.defaultTemplateId ? (
                    <div className="p-6 text-sm text-muted-foreground">
                      Select a default template to see a projected schedule.
                    </div>
                  ) : upcomingTasksQuery.isLoading || blackoutWindowsQuery.isLoading ? (
                    <div className="p-6 text-sm text-muted-foreground">Loading schedule…</div>
                  ) : upcomingTasksQuery.isError || blackoutWindowsQuery.isError ? (
                    <div className="p-6 text-sm text-destructive">Failed to load schedule.</div>
                  ) : scheduleItems.length === 0 ? (
                    <div className="p-6 text-sm text-muted-foreground">No upcoming schedule found.</div>
                  ) : (
                    <div className="space-y-4">
                      {scheduleItems.map((schedule) => (
                        <div
                          key={schedule.id}
                          className="flex items-center justify-between p-4 rounded-lg bg-muted/30"
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                schedule.status === "scheduled" ? "bg-primary/20" : "bg-muted"
                              }`}
                            >
                              <Calendar
                                className={`w-5 h-5 ${
                                  schedule.status === "scheduled" ? "text-primary" : "text-muted-foreground"
                                }`}
                              />
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{schedule.date}</p>
                              <p className="text-sm text-muted-foreground">
                                {schedule.templateName}
                                {schedule.taskNumber ? ` • ${schedule.taskNumber}` : ""}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className={
                              schedule.status === "scheduled"
                                ? "bg-primary/20 text-primary border-primary/30"
                                : "bg-muted text-muted-foreground"
                            }
                          >
                            {schedule.status === "scheduled" ? "Scheduled" : "Projected"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </TabsContent>
        </Tabs>

        <AlertDialog
          open={deleteTaskDialogOpen}
          onOpenChange={(open) => {
            setDeleteTaskDialogOpen(open);
            if (!open) setDeleteTaskTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove PM history</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTaskTarget
                  ? `Delete task "${deleteTaskTarget.taskNumber}" from this asset's history? This will permanently remove its checklist results and evidence.`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleteHistoryTaskMutation.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleConfirmDeleteHistoryTask();
                }}
                disabled={deleteHistoryTaskMutation.isPending || !deleteTaskTarget}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default AssetDetail;
