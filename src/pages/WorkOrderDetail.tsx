import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  MapPin,
  Server,
  User,
  Wrench,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  apiAddTaskEvidence,
  apiAssignWorkOrder,
  ApiError,
  apiCancelWorkOrder,
  apiCloseDowntime,
  apiCompleteWorkOrder,
  apiDeleteEvidence,
  apiDeleteWorkOrder,
  apiDownloadEvidence,
  apiGetLookups,
  apiGetTask,
  apiGetWorkOrder,
  apiListUsers,
  apiPauseWorkOrder,
  apiReopenWorkOrderDowntime,
  apiReportWorkOrderRecurrence,
  apiResumeWorkOrder,
  apiReturnWorkOrderForCorrection,
  apiStartWorkOrder,
  apiUpdateWorkOrderResolution,
  apiUploadTaskEvidenceFile,
  apiVerifyCloseWorkOrder,
  type LookupsResponse,
  type UserSummary,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getJwtClaims, isManager, isSuperadmin } from "@/lib/auth";

const impactBadgeClass = (level: string | null): string => {
  if (!level) return "bg-muted/40 text-muted-foreground border-muted/60";
  const v = level.toLowerCase();
  if (v === "critical") return "bg-destructive/20 text-destructive border-destructive/30";
  if (v === "high") return "bg-warning/20 text-warning border-warning/30";
  return "bg-primary/20 text-primary border-primary/30";
};

const statusBadge = (status: string): { label: string; color: string; icon: React.ElementType } => {
  const s = status.toLowerCase();
  if (s === "completed") return { label: "Completed", color: "bg-success/20 text-success border-success/30", icon: CheckCircle };
  if (s === "in_progress") return { label: "In Progress", color: "bg-primary/20 text-primary border-primary/30", icon: Wrench };
  if (s === "pending_review") return { label: "Pending Review", color: "bg-warning/20 text-warning border-warning/30", icon: Clock };
  if (s === "cancelled") return { label: "Cancelled", color: "bg-muted/40 text-muted-foreground border-muted/60", icon: AlertTriangle };
  if (s === "overdue") return { label: "Overdue", color: "bg-destructive/20 text-destructive border-destructive/30", icon: AlertTriangle };
  return { label: "Open", color: "bg-accent/20 text-accent border-accent/30", icon: Clock };
};

const priorityBadgeClass = (priority: string | null): string => {
  if (!priority) return "bg-muted/40 text-muted-foreground border-muted/60";
  const v = priority.toLowerCase();
  if (v === "high") return "bg-destructive/20 text-destructive border-destructive/30";
  if (v === "medium") return "bg-warning/20 text-warning border-warning/30";
  return "bg-primary/20 text-primary border-primary/30";
};

const formatDateTime = (value: string | null | undefined): string => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString();
};

const formatDurationSeconds = (totalSeconds: number | null | undefined): string => {
  if (!totalSeconds || totalSeconds <= 0) return "—";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatUserLabel = (user: { displayName: string | null; username: string | null } | null | undefined): string => {
  if (!user) return "—";
  return user.displayName ?? user.username ?? "—";
};

const formatHistoryEventLabel = (eventType: string): string => {
  switch (eventType) {
    case "reported":
      return "Reported";
    case "repair_submitted":
      return "Repair Submitted";
    case "returned_for_correction":
      return "Returned for Correction";
    case "verified_closed":
      return "Verified and Closed";
    case "restoration_recorded":
      return "Restoration Recorded";
    case "downtime_reopened":
      return "Downtime Reopened";
    case "repeat_fault_linked":
      return "Repeat Fault Linked";
    default:
      return eventType;
  }
};

const parseMetadataJson = (value: string | null): Record<string, unknown> | null => {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

const WorkOrderDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const managerUser = isManager();
  const superadminUser = isSuperadmin();
  const claims = getJwtClaims();
  const currentUserId = claims?.sub ?? null;
  const currentRoles = claims?.roles ?? [];

  const workOrderQuery = useQuery({
    queryKey: ["work-order", taskId],
    queryFn: () => apiGetWorkOrder(taskId ?? ""),
    enabled: Boolean(taskId),
  });

  const taskQuery = useQuery({
    queryKey: ["task", taskId],
    queryFn: () => apiGetTask(taskId ?? ""),
    enabled: Boolean(taskId),
  });

  const workOrder = workOrderQuery.data;
  const taskDetail = taskQuery.data;

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"user" | "role" | "unassigned">("user");
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [assignRoleId, setAssignRoleId] = useState<string>("");
  const [backdateMode, setBackdateMode] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [restorationDialogOpen, setRestorationDialogOpen] = useState(false);
  const [reopenDowntimeDialogOpen, setReopenDowntimeDialogOpen] = useState(false);
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [recurrenceDialogOpen, setRecurrenceDialogOpen] = useState(false);

  const lookupsQuery = useQuery<LookupsResponse>({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    enabled: assignDialogOpen,
  });

  const usersQuery = useQuery<{ items: UserSummary[] }>({
    queryKey: ["users", { page: 1, pageSize: 500, isActive: true }],
    queryFn: () => apiListUsers({ page: 1, pageSize: 500, isActive: true }),
    enabled: assignDialogOpen,
  });

  const usersQueryForBackdate = useQuery<{ items: UserSummary[] }>({
    queryKey: ["users", "backdate", { page: 1, pageSize: 500, isActive: true }],
    queryFn: () => apiListUsers({ page: 1, pageSize: 500, isActive: true }),
    enabled: managerUser && backdateMode,
  });

  const technicianOptionsForBackdate = useMemo(() => {
    const items = usersQueryForBackdate.data?.items ?? [];
    return items
      .slice()
      .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));
  }, [usersQueryForBackdate.data?.items]);

  const openAssignDialog = () => {
    if (!workOrder) return;
    if (workOrder.assignedTo.userId) {
      setAssignMode("user");
      setAssignUserId(workOrder.assignedTo.userId);
      setAssignRoleId("");
    } else if (workOrder.assignedTo.roleId) {
      setAssignMode("role");
      setAssignRoleId(workOrder.assignedTo.roleId);
      setAssignUserId("");
    } else {
      setAssignMode("unassigned");
      setAssignUserId("");
      setAssignRoleId("");
    }
    setAssignDialogOpen(true);
  };

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      if (assignMode === "user") {
        if (!assignUserId) throw new Error("Select technician");
        return apiAssignWorkOrder({ taskId, assignedToUserId: assignUserId, assignedToRoleId: null });
      }
      if (assignMode === "role") {
        if (!assignRoleId) throw new Error("Select role");
        return apiAssignWorkOrder({ taskId, assignedToRoleId: assignRoleId, assignedToUserId: null });
      }
      return apiAssignWorkOrder({ taskId, assignedToUserId: null, assignedToRoleId: null });
    },
    onSuccess: async () => {
      setAssignDialogOpen(false);
      toast({ title: "Work order assigned" });
      await workOrderQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed";
      toast({ title: "Assign failed", description: message, variant: "destructive" });
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      return apiStartWorkOrder(taskId);
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await taskQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Work order started" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to start", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      return apiPauseWorkOrder(taskId);
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await taskQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Work order paused" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to pause", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      return apiResumeWorkOrder(taskId);
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await taskQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Work order resumed" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to resume", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const closeDowntimeMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      const restoredAtValue = restorationAt.trim();
      const reasonValue = restorationReason.trim();
      return apiCloseDowntime({
        taskId,
        restoredAt: restoredAtValue ? new Date(restoredAtValue).toISOString() : undefined,
        reason: reasonValue || undefined,
      });
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Restoration recorded" });
      setRestorationDialogOpen(false);
      setRestorationAt("");
      setRestorationReason("");
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to record restoration", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const reopenDowntimeMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      const startedAtValue = reopenDowntimeAt.trim();
      const reasonValue = reopenDowntimeReason.trim();
      return apiReopenWorkOrderDowntime({
        taskId,
        downtimeStartedAt: startedAtValue ? new Date(startedAtValue).toISOString() : undefined,
        reason: reasonValue || undefined,
      });
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Downtime reopened" });
      setReopenDowntimeDialogOpen(false);
      setReopenDowntimeAt("");
      setReopenDowntimeReason("");
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to reopen downtime", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const verifyCloseMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      return apiVerifyCloseWorkOrder(taskId);
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await taskQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Work order verified and closed" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to close work order", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const returnForCorrectionMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      const reason = returnReason.trim();
      if (!reason) throw new Error("Reason is required");
      return apiReturnWorkOrderForCorrection({ taskId, reason });
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await taskQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Work order returned for correction" });
      setReturnDialogOpen(false);
      setReturnReason("");
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to return work order", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const reportRecurrenceMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      const startedAtValue = recurrenceDowntimeAt.trim();
      const reasonValue = recurrenceReason.trim();
      return apiReportWorkOrderRecurrence({
        taskId,
        downtimeStartedAt: startedAtValue ? new Date(startedAtValue).toISOString() : undefined,
        reason: reasonValue || undefined,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      await workOrderQuery.refetch();
      toast({ title: result.created ? "Linked recurrence work order created" : "Existing linked work order reused" });
      setRecurrenceDialogOpen(false);
      setRecurrenceDowntimeAt("");
      setRecurrenceReason("");
      navigate(`/work-orders/${result.id}`);
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to report recurrence", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      return apiCancelWorkOrder(taskId);
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await taskQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Work order cancelled" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to cancel", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const normalizedStatus = workOrder?.status.toLowerCase() ?? null;
  const hasActiveDowntime = workOrder?.downtimeIntervals.some((interval) => !interval.endedAt) ?? false;
  const isTerminal = normalizedStatus === "completed" || normalizedStatus === "cancelled";
  const canModifyWorkOrder = Boolean(
    workOrder &&
      (
        managerUser ||
        (currentUserId !== null &&
          (
            workOrder.assignedTo.userId === currentUserId ||
            (workOrder.assignedTo.userId === null &&
              workOrder.assignedTo.roleName !== null &&
              currentRoles.includes(workOrder.assignedTo.roleName))
          ))
      ),
  );
  const canStart = canModifyWorkOrder && normalizedStatus === "open";
  const canPause = canModifyWorkOrder && normalizedStatus === "in_progress";
  const canResume = canModifyWorkOrder && normalizedStatus === "paused";
  const canCancel = canModifyWorkOrder && !isTerminal;
  const canComplete = canModifyWorkOrder && normalizedStatus !== null && normalizedStatus !== "pending_review" && !isTerminal;
  const canCloseDowntime = canModifyWorkOrder && hasActiveDowntime && !isTerminal;
  const canReopenDowntime = canModifyWorkOrder && !hasActiveDowntime && !isTerminal;
  const canVerifyClose =
    managerUser &&
    normalizedStatus === "pending_review" &&
    !hasActiveDowntime &&
    workOrder?.repairSubmittedBy?.userId !== currentUserId;
  const canReturnForCorrection = managerUser && normalizedStatus === "pending_review";
  const canReportRecurrence = normalizedStatus === "completed";
  const canEditResolution = canModifyWorkOrder;

  const [forceCompleted, setForceCompleted] = useState(false);
  const [evidenceUri, setEvidenceUri] = useState("");
  const [resolutionNotesDraft, setResolutionNotesDraft] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [previewContentType, setPreviewContentType] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [backdateCompletedAt, setBackdateCompletedAt] = useState("");
  const [backdateReason, setBackdateReason] = useState("");
  const [backdateTechnicianName, setBackdateTechnicianName] = useState("");
  const [restorationAt, setRestorationAt] = useState("");
  const [restorationReason, setRestorationReason] = useState("");
  const [reopenDowntimeAt, setReopenDowntimeAt] = useState("");
  const [reopenDowntimeReason, setReopenDowntimeReason] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [recurrenceDowntimeAt, setRecurrenceDowntimeAt] = useState("");
  const [recurrenceReason, setRecurrenceReason] = useState("");

  const taskFileInputRef = useRef<HTMLInputElement | null>(null);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewFileName(null);
    setPreviewContentType(null);
    setPreviewId(null);
  }, [previewUrl]);

  useEffect(() => {
    if (previewOpen) return;
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewOpen, previewUrl]);

  useEffect(() => {
    if (!taskDetail) return;
    setEvidenceUri("");
    closePreview();
    setForceCompleted(false);
    setBackdateMode(false);
    setBackdateCompletedAt("");
    setBackdateReason("");
    setBackdateTechnicianName("");
    setRestorationDialogOpen(false);
    setReopenDowntimeDialogOpen(false);
    setReturnDialogOpen(false);
    setRecurrenceDialogOpen(false);
    setRestorationAt("");
    setRestorationReason("");
    setReopenDowntimeAt("");
    setReopenDowntimeReason("");
    setReturnReason("");
    setRecurrenceDowntimeAt("");
    setRecurrenceReason("");
  }, [taskDetail?.id, closePreview]);

  useEffect(() => {
    if (!workOrder) return;
    setResolutionNotesDraft(workOrder.resolutionNotes ?? "");
  }, [workOrder?.id]);

  const uploadTaskEvidenceMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!taskId) throw new Error("No work order selected");
      if (file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50MB)");
      return apiUploadTaskEvidenceFile({ taskId, file });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "File uploaded" });
    },
    onError: (err: unknown) => {
      toast({ title: "Upload failed", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const openEvidencePreview = useCallback(
    async (input: { id: string; uri: string; fileName: string | null; contentType: string | null }) => {
      const isInternal = input.uri === "imported" || input.uri === "stored" || input.uri === "uploaded";
      if (!isInternal) {
        const target = input.uri.trim();
        if (target) window.open(target, "_blank", "noreferrer");
        return;
      }

      const downloaded = await apiDownloadEvidence({ evidenceId: input.id });
      const url = URL.createObjectURL(downloaded.blob);
      setPreviewId(input.id);
      setPreviewUrl(url);
      setPreviewFileName(downloaded.fileName ?? input.fileName);
      setPreviewContentType(downloaded.contentType ?? input.contentType);
      setPreviewOpen(true);
    },
    [],
  );

  const deleteWorkOrderMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      return apiDeleteWorkOrder(taskId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Work order deleted" });
      navigate("/work-orders");
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Delete failed";
      toast({ title: "Delete failed", description: message, variant: "destructive" });
    },
  });

  const downloadEvidence = useCallback(
    async (input: { id: string }) => {
      const downloaded = await apiDownloadEvidence({ evidenceId: input.id, download: true });
      const url = URL.createObjectURL(downloaded.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = downloaded.fileName ?? "download";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
    [],
  );

  const deleteEvidenceMutation = useMutation({
    mutationFn: async (input: { id: string }) => {
      return apiDeleteEvidence({ evidenceId: input.id });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Attachment deleted" });
      closePreview();
    },
    onError: (err: unknown) => {
      toast({ title: "Delete failed", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const saveResolutionMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      return apiUpdateWorkOrderResolution({ taskId, resolutionNotes: resolutionNotesDraft });
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      toast({ title: "Resolution updated" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to update", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      const trimmedReason = backdateReason.trim();
      const completedAtValue = backdateCompletedAt.trim();

      if (backdateMode) {
        if (!managerUser) {
          throw new Error("Only supervisors and above can backdate completion");
        }
        if (!completedAtValue) {
          throw new Error("Completion date is required when backdating");
        }
        if (!trimmedReason) {
          throw new Error("Reason is required when backdating");
        }
      }

      return apiCompleteWorkOrder({
        taskId,
        checklistResults: [],
        forceCompleted,
        completedAt: backdateMode ? new Date(completedAtValue).toISOString() : undefined,
        backdateReason: backdateMode ? trimmedReason : undefined,
        technicianName: backdateMode && backdateTechnicianName.trim() ? backdateTechnicianName.trim() : undefined,
      });
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      await taskQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["work-orders"] });
      toast({ title: "Repair submitted for review" });
      setBackdateMode(false);
      setBackdateCompletedAt("");
      setBackdateReason("");
      setBackdateTechnicianName("");
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to submit repair", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const addEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!taskId) throw new Error("No work order selected");
      const uri = evidenceUri.trim();
      if (!uri) throw new Error("Evidence URI is required");
      return apiAddTaskEvidence({ taskId, uri });
    },
    onSuccess: async () => {
      setEvidenceUri("");
      await taskQuery.refetch();
      toast({ title: "Evidence added" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to add evidence", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const assetLabel = workOrder?.asset
    ? `${workOrder.asset.assetTag ?? ""} ${workOrder.asset.name ?? ""}`.trim()
    : workOrder?.facility?.name ?? "—";

  const subject = useMemo(() => {
    if (!workOrder) return assetLabel;
    const symptom = (workOrder.symptom ?? "").trim();
    if (!symptom) return assetLabel;
    return assetLabel ? `${assetLabel} — ${symptom}` : symptom;
  }, [assetLabel, workOrder]);

  const status = workOrder?.status ? statusBadge(workOrder.status) : null;
  const assignedLabel = workOrder?.assignedTo.displayName ?? workOrder?.assignedTo.roleName ?? "Unassigned";

  if (!taskId) {
    return (
      <div className="min-h-screen">
        <Header title="Work Order Detail" subtitle="Corrective maintenance work orders" />
        <div className="p-6 text-sm text-muted-foreground">Work order not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header title="Work Order Detail" subtitle="Corrective maintenance work orders" />
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4">
            <Button variant="outline" className="gap-2" onClick={() => navigate("/work-orders")}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
            <div className="min-w-0">
                <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2 flex-wrap">
                  <span className="truncate max-w-full">{subject || "Work Order"}</span>
                  <Badge variant="outline" className="font-mono text-xs px-2 py-0.5">
                    {workOrder?.taskNumber ?? "WO"}
                  </Badge>
                </h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                {workOrder?.asset ? <Server className="w-4 h-4" /> : <MapPin className="w-4 h-4" />}
                {workOrder?.asset ? (
                  <Link to={`/assets/${workOrder.asset.id}`} className="hover:text-foreground transition-colors">
                    {assetLabel || "—"}
                  </Link>
                ) : workOrder?.facility ? (
                  <Link to={`/facilities/${workOrder.facility.id}`} className="hover:text-foreground transition-colors">
                    {assetLabel || "—"}
                  </Link>
                ) : (
                  <span>{assetLabel || "—"}</span>
                )}
                <span>•</span>
                <span>{workOrder?.template.name ?? "—"}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {status ? (
              <Badge variant="outline" className={status.color}>
                <status.icon className="w-3 h-3 mr-1" />
                {status.label}
              </Badge>
            ) : null}
            <Badge variant="outline" className={priorityBadgeClass(workOrder?.priority ?? null)}>
              {workOrder?.priority ?? "Priority"}
            </Badge>
            {managerUser ? (
              <Button variant="outline" onClick={() => openAssignDialog()}>
                {assignedLabel === "Unassigned" ? "Assign" : "Reassign"}
              </Button>
            ) : null}
            <Button variant="outline" disabled={!workOrder || startMutation.isPending || !canStart} onClick={() => startMutation.mutate()}>
              Start
            </Button>
            <Button variant="outline" disabled={!workOrder || pauseMutation.isPending || !canPause} onClick={() => pauseMutation.mutate()}>
              Pause
            </Button>
            <Button variant="outline" disabled={!workOrder || resumeMutation.isPending || !canResume} onClick={() => resumeMutation.mutate()}>
              Resume
            </Button>
            <Button
              variant="outline"
              disabled={!workOrder || !canCloseDowntime}
              onClick={() => setRestorationDialogOpen(true)}
            >
              Record Restoration
            </Button>
            <Button
              variant="outline"
              disabled={!workOrder || !canReopenDowntime}
              onClick={() => setReopenDowntimeDialogOpen(true)}
            >
              Reopen Downtime
            </Button>
            <Button variant="destructive" disabled={!workOrder || cancelMutation.isPending || !canCancel} onClick={() => cancelMutation.mutate()}>
              Cancel
            </Button>
            <Button variant="outline" disabled={!workOrder || completeMutation.isPending || !canComplete} onClick={() => completeMutation.mutate()}>
              Submit Repair
            </Button>
            <Button
              variant="outline"
              disabled={!workOrder || verifyCloseMutation.isPending || !canVerifyClose}
              onClick={() => verifyCloseMutation.mutate()}
            >
              Verify Close
            </Button>
            <Button
              variant="outline"
              disabled={!workOrder || !canReturnForCorrection}
              onClick={() => setReturnDialogOpen(true)}
            >
              Return for Correction
            </Button>
            <Button
              variant="outline"
              disabled={!workOrder || !canReportRecurrence}
              onClick={() => setRecurrenceDialogOpen(true)}
            >
              Report Recurrence
            </Button>
            {superadminUser ? (
              <Button
                variant="destructive"
                disabled={!workOrder || deleteWorkOrderMutation.isPending}
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            ) : null}
          </div>
        </div>

        {workOrderQuery.isLoading || taskQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading work order…</div>
        ) : workOrderQuery.isError || taskQuery.isError ? (
          <div className="text-sm text-destructive">Failed to load work order.</div>
        ) : workOrder && taskDetail ? (
          <>
            <div className="grid grid-cols-12 gap-4">
              <Card className="col-span-12 md:col-span-4">
                <CardHeader>
                  <CardTitle className="text-base">Overview</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Assigned</p>
                    <div className="flex items-center gap-2 mt-1">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">{assignedLabel}</span>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className="text-sm text-foreground mt-1">{workOrder.status}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Impact</p>
                    <Badge variant="outline" className={impactBadgeClass(workOrder.impactLevel ?? null)}>
                      {workOrder.impactLevel ?? "—"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Scheduled Due</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.scheduledDueAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Recurring From</p>
                    <p className="text-sm text-foreground mt-1">
                      {workOrder.recurringFromTaskId ? (
                        <Link
                          to={`/work-orders/${workOrder.recurringFromTaskId}`}
                          className="hover:text-foreground transition-colors"
                        >
                          {workOrder.recurringFromTaskId}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-12 md:col-span-4">
                <CardHeader>
                  <CardTitle className="text-base">Corrective Maintenance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Symptom</p>
                    <p className="text-sm text-foreground mt-1">{workOrder.symptom ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Failure Category</p>
                    <p className="text-sm text-foreground mt-1">{workOrder.failureCategory ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Failure Code</p>
                    <p className="text-sm text-foreground mt-1">{workOrder.failureCode ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reported At</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.reportedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reported By</p>
                    <p className="text-sm text-foreground mt-1">
                      {workOrder.reportedBy?.displayName ?? workOrder.reportedBy?.username ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reported Channel</p>
                    <p className="text-sm text-foreground mt-1">{workOrder.reportedChannel ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Repair Submitted</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.repairSubmittedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Repair Submitted By</p>
                    <p className="text-sm text-foreground mt-1">{formatUserLabel(workOrder.repairSubmittedBy)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Returned For Correction</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.returnedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Return Reason</p>
                    <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">{workOrder.returnReason ?? "—"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-12 md:col-span-4">
                <CardHeader>
                  <CardTitle className="text-base">Timeline</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Created</p>
                      <p className="text-sm text-foreground">{formatDateTime(workOrder.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Started</p>
                      <p className="text-sm text-foreground">{formatDateTime(workOrder.startedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Verified Closed</p>
                      <p className="text-sm text-foreground">{formatDateTime(workOrder.completedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Cancelled</p>
                      <p className="text-sm text-foreground">{formatDateTime(workOrder.cancelledAt)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-12 gap-4">
              <Card className="col-span-12 lg:col-span-6">
                <CardHeader>
                  <CardTitle className="text-base">Downtime</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-4">
                      <p className="text-xs text-muted-foreground">Current Start</p>
                      <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.downtimeStartedAt)}</p>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <p className="text-xs text-muted-foreground">Current End</p>
                      <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.downtimeEndedAt)}</p>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <p className="text-xs text-muted-foreground">Accumulated Downtime</p>
                      <p className="text-sm text-foreground mt-1">{formatDurationSeconds(workOrder.downtimeTotalSeconds)}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {workOrder.downtimeIntervals.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No downtime interval recorded.</div>
                    ) : (
                      workOrder.downtimeIntervals.map((interval, index) => (
                        <div key={interval.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-sm font-medium text-foreground">Interval {index + 1}</span>
                            <Badge variant="outline" className={interval.endedAt ? "bg-muted/40 text-muted-foreground border-muted/60" : "bg-warning/20 text-warning border-warning/30"}>
                              {interval.endedAt ? "Closed" : "Active"}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-12 gap-3 text-sm">
                            <div className="col-span-12 md:col-span-6">
                              <p className="text-xs text-muted-foreground">Started</p>
                              <p className="mt-1">{formatDateTime(interval.startedAt)}</p>
                              <p className="text-xs text-muted-foreground mt-1">By {formatUserLabel(interval.startedBy)}</p>
                              {interval.startedReason ? <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{interval.startedReason}</p> : null}
                            </div>
                            <div className="col-span-12 md:col-span-6">
                              <p className="text-xs text-muted-foreground">Ended</p>
                              <p className="mt-1">{formatDateTime(interval.endedAt)}</p>
                              <p className="text-xs text-muted-foreground mt-1">By {formatUserLabel(interval.endedBy)}</p>
                              {interval.endReason ? <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{interval.endReason}</p> : null}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="col-span-12 lg:col-span-6">
                <CardHeader>
                  <CardTitle className="text-base">Review State</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Repair Submitted At</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.repairSubmittedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Repair Submitted By</p>
                    <p className="text-sm text-foreground mt-1">{formatUserLabel(workOrder.repairSubmittedBy)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Returned At</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.returnedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Returned By</p>
                    <p className="text-sm text-foreground mt-1">{formatUserLabel(workOrder.returnedBy)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Reviewer Constraint</p>
                    <p className="text-sm text-foreground mt-1">
                      {workOrder.repairSubmittedBy?.userId === currentUserId
                        ? "You submitted this repair and cannot verify-close it."
                        : "Supervisor, Admin, or Superadmin can verify-close this work order."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resolution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-4">
                    <p className="text-xs text-muted-foreground">Resolution Status</p>
                    <p className="text-sm text-foreground mt-1">
                      {workOrder.status === "completed"
                        ? "Resolved"
                        : workOrder.status === "cancelled"
                        ? "Cancelled"
                        : "Unresolved"}
                    </p>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <p className="text-xs text-muted-foreground">Resolved At</p>
                    <p className="text-sm text-foreground mt-1">
                      {formatDateTime(workOrder.completedAt ?? workOrder.cancelledAt)}
                    </p>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <p className="text-xs text-muted-foreground">
                      {workOrder.status === "cancelled" ? "Cancelled By" : "Completed By"}
                    </p>
                    <p className="text-sm text-foreground mt-1">
                      {workOrder.status === "completed"
                        ? workOrder.completedBy?.displayName ?? workOrder.completedBy?.username ?? "—"
                        : workOrder.status === "cancelled"
                        ? workOrder.cancelledBy?.displayName ?? workOrder.cancelledBy?.username ?? "—"
                        : "—"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground">Resolution Notes</p>
                  <Textarea
                    value={resolutionNotesDraft}
                    onChange={(e) => setResolutionNotesDraft(e.target.value)}
                    className="mt-1 bg-muted/50"
                    placeholder="Add resolution details (free text)"
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      disabled={saveResolutionMutation.isPending || !workOrder || !canEditResolution}
                      onClick={() => saveResolutionMutation.mutate()}
                    >
                      {saveResolutionMutation.isPending ? "Saving…" : "Save resolution"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Repair Submission</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="backdate-toggle"
                        checked={backdateMode}
                        onCheckedChange={(checked) => setBackdateMode(Boolean(checked))}
                        disabled={!managerUser}
                      />
                      <Label htmlFor="backdate-toggle" className="text-sm">
                        Backdate repair submission (supervisor and above only)
                      </Label>
                    </div>
                    {backdateMode && !managerUser ? (
                      <span className="text-xs text-destructive">You do not have permission to backdate</span>
                    ) : null}
                  </div>
                  {backdateMode ? (
                    <div className="grid grid-cols-12 gap-3">
                      <div className="col-span-12 md:col-span-4">
                        <Label htmlFor="backdate-completedAt" className="text-xs">
                          Completion date/time
                        </Label>
                        <Input
                          id="backdate-completedAt"
                          type="datetime-local"
                          value={backdateCompletedAt}
                          onChange={(event) => setBackdateCompletedAt(event.target.value)}
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <Label htmlFor="backdate-technician" className="text-xs">
                          Technician name(s)
                        </Label>
                        <div className="mt-1 flex gap-2">
                          <Input
                            id="backdate-technician"
                            value={backdateTechnicianName}
                            onChange={(event) => setBackdateTechnicianName(event.target.value)}
                            placeholder="Optional"
                            className="h-8 text-xs flex-1"
                          />
                          <Select
                            onValueChange={(userId) => {
                              const user = technicianOptionsForBackdate.find((u) => u.id === userId);
                              if (!user) return;
                              const name = user.displayName ?? user.username;
                              if (!name) return;
                              setBackdateTechnicianName(name);
                            }}
                            value="__none__"
                          >
                            <SelectTrigger className="h-8 w-28 text-xs">
                              <SelectValue placeholder="Lookup" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">None</SelectItem>
                              {technicianOptionsForBackdate.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {(u.displayName ?? u.username) ?? u.username}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {usersQueryForBackdate.isLoading ? (
                          <p className="mt-1 text-[10px] text-muted-foreground">Loading technicians…</p>
                        ) : null}
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <Label htmlFor="backdate-reason" className="text-xs">
                          Reason for backdating
                        </Label>
                        <Input
                          id="backdate-reason"
                          value={backdateReason}
                          onChange={(event) => setBackdateReason(event.target.value)}
                          placeholder="Required"
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <div className="mt-4 flex items-center gap-2">
              <Checkbox checked={forceCompleted} onCheckedChange={(v) => setForceCompleted(v === true)} />
              <span className="text-sm text-muted-foreground">Force submit repair</span>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {workOrder.history.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No history recorded.</div>
                ) : (
                  workOrder.history.map((event) => {
                    const metadata = parseMetadataJson(event.metadataJson);
                    const linkedTaskId =
                      metadata && typeof metadata.linkedTaskId === "string" ? metadata.linkedTaskId : null;
                    return (
                      <div key={event.id} className="rounded-lg border border-border/60 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <span className="text-sm font-medium text-foreground">
                            {formatHistoryEventLabel(event.type)}
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDateTime(event.occurredAt)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Actor: {formatUserLabel(event.actor)}
                        </div>
                        {event.reason ? (
                          <p className="text-sm text-foreground whitespace-pre-wrap">Reason: {event.reason}</p>
                        ) : null}
                        {event.notes ? (
                          <p className="text-sm text-foreground whitespace-pre-wrap">Notes: {event.notes}</p>
                        ) : null}
                        {linkedTaskId ? (
                          <p className="text-sm text-foreground">
                            Linked work order:{" "}
                            <Link to={`/work-orders/${linkedTaskId}`} className="hover:text-foreground transition-colors">
                              {linkedTaskId}
                            </Link>
                          </p>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-end">
              <Button
                variant="outline"
                disabled={!workOrder || completeMutation.isPending || !canComplete}
                onClick={() => completeMutation.mutate()}
              >
                {completeMutation.isPending ? "Submitting…" : "Submit Repair"}
              </Button>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-2">Evidence</h3>
              <div className="glass rounded-lg p-3">
                <div className="flex flex-col md:flex-row gap-3">
                  <Button
                    variant="outline"
                    className="shrink-0"
                    disabled={uploadTaskEvidenceMutation.isPending}
                    onClick={() => taskFileInputRef.current?.click()}
                  >
                    Upload file
                  </Button>

                  <div className="flex-1" />

                  <div className="flex gap-2">
                    <Input
                      value={evidenceUri}
                      onChange={(e) => setEvidenceUri(e.target.value)}
                      placeholder="Evidence link (optional)"
                      className="bg-muted/50"
                    />
                    <Button
                      variant="outline"
                      className="shrink-0"
                      disabled={addEvidenceMutation.isPending}
                      onClick={() => addEvidenceMutation.mutate()}
                    >
                      Add link
                    </Button>
                  </div>
                </div>
              </div>
              {taskDetail.evidence.length === 0 ? (
                <div className="text-sm text-muted-foreground">No evidence uploaded.</div>
              ) : (
                <div className="space-y-2">
                  {taskDetail.evidence.map((e) => (
                    <div key={e.id} className="glass rounded-lg p-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground truncate">{e.fileName ?? e.uri}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {e.contentType ?? ""}
                          {e.sizeBytes !== null ? ` • ${e.sizeBytes} bytes` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            openEvidencePreview({
                              id: e.id,
                              uri: e.uri,
                              fileName: e.fileName,
                              contentType: e.contentType,
                            })
                          }
                        >
                          Preview
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => downloadEvidence({ id: e.id })}>
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={deleteEvidenceMutation.isPending}
                          onClick={() => deleteEvidenceMutation.mutate({ id: e.id })}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Dialog open={previewOpen} onOpenChange={(o) => (o ? setPreviewOpen(true) : closePreview())}>
              <DialogContent className="max-w-4xl">
                <DialogHeader>
                  <DialogTitle className="truncate">{previewFileName ?? "Evidence"}</DialogTitle>
                </DialogHeader>
                {previewUrl ? (
                  (previewContentType ?? "").startsWith("application/pdf") ||
                  (previewFileName ?? "").toLowerCase().endsWith(".pdf") ? (
                    <iframe title="Preview" src={previewUrl} className="w-full h-[70vh] rounded-md" />
                  ) : (previewContentType ?? "").startsWith("image/") ? (
                    <div className="h-[70vh] flex items-center justify-center bg-background rounded-md">
                      <img src={previewUrl} alt={previewFileName ?? "preview"} className="max-h-[70vh] max-w-full rounded-md" />
                    </div>
                  ) : (previewContentType ?? "").startsWith("video/") ? (
                    <div className="h-[70vh] flex items-center justify-center bg-background rounded-md">
                      <video src={previewUrl} controls className="max-h-[70vh] max-w-full rounded-md" />
                    </div>
                  ) : (previewContentType ?? "").startsWith("audio/") ? (
                    <div className="h-[70vh] flex flex-col items-center justify-center gap-4 bg-background rounded-md p-6">
                      <div className="text-sm text-muted-foreground truncate w-full text-center">
                        {previewFileName ?? "Audio"}
                      </div>
                      <audio src={previewUrl} controls className="w-full" />
                    </div>
                  ) : (
                    <div className="h-[70vh] flex items-center justify-center bg-background rounded-md p-6">
                      <div className="text-sm text-muted-foreground">Preview not available for this file type.</div>
                    </div>
                  )
                ) : (
                  <div className="text-sm text-muted-foreground">Loading preview…</div>
                )}

                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => closePreview()}>
                    Close
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!previewId) return;
                      deleteEvidenceMutation.mutate({ id: previewId });
                    }}
                    disabled={!previewId || deleteEvidenceMutation.isPending}
                  >
                    Delete
                  </Button>
                  <Button
                    onClick={() => {
                      if (!previewId) return;
                      void downloadEvidence({ id: previewId });
                    }}
                    disabled={!previewId}
                  >
                    Download
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <input
              ref={taskFileInputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                e.target.value = "";
                if (!file) return;
                uploadTaskEvidenceMutation.mutate(file);
              }}
            />
          </>
        ) : null}
      </div>

      <Dialog open={assignDialogOpen} onOpenChange={(o) => setAssignDialogOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Work Order</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assignment Target</Label>
              <RadioGroup
                value={assignMode}
                onValueChange={(v) => setAssignMode(v as "user" | "role" | "unassigned")}
                className="grid grid-cols-12 gap-2"
              >
                <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                  <RadioGroupItem id="assign-user" value="user" />
                  <Label htmlFor="assign-user">User</Label>
                </div>
                <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                  <RadioGroupItem id="assign-role" value="role" />
                  <Label htmlFor="assign-role">Role</Label>
                </div>
                <div className="col-span-12 md:col-span-4 flex items-center gap-2">
                  <RadioGroupItem id="assign-unassigned" value="unassigned" />
                  <Label htmlFor="assign-unassigned">Unassign</Label>
                </div>
              </RadioGroup>
            </div>

            {assignMode === "user" ? (
              <div className="space-y-2">
                <Label>Technician</Label>
                <Select value={assignUserId} onValueChange={(v) => setAssignUserId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select user" />
                  </SelectTrigger>
                  <SelectContent>
                    {(usersQuery.data?.items ?? [])
                      .slice()
                      .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
                      .map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {(u.displayName ?? u.username) ?? u.username}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : assignMode === "role" ? (
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={assignRoleId} onValueChange={(v) => setAssignRoleId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {(lookupsQuery.data?.roles ?? [])
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => assignMutation.mutate()}
                disabled={
                  assignMutation.isPending ||
                  (assignMode === "user" && !assignUserId) ||
                  (assignMode === "role" && !assignRoleId)
                }
              >
                {assignMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={restorationDialogOpen} onOpenChange={setRestorationDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Restoration</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="restoration-at">Restored At</Label>
              <Input
                id="restoration-at"
                type="datetime-local"
                value={restorationAt}
                onChange={(event) => setRestorationAt(event.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to use the current time. A reason is required when you set a past time.
              </p>
            </div>
            <div>
              <Label htmlFor="restoration-reason">Reason</Label>
              <Textarea
                id="restoration-reason"
                value={restorationReason}
                onChange={(event) => setRestorationReason(event.target.value)}
                className="mt-1 bg-muted/50"
                placeholder="Optional unless you set a custom restoration time"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setRestorationDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={closeDowntimeMutation.isPending} onClick={() => closeDowntimeMutation.mutate()}>
                {closeDowntimeMutation.isPending ? "Saving…" : "Record Restoration"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenDowntimeDialogOpen} onOpenChange={setReopenDowntimeDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reopen Downtime</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="reopen-downtime-at">Downtime Started At</Label>
              <Input
                id="reopen-downtime-at"
                type="datetime-local"
                value={reopenDowntimeAt}
                onChange={(event) => setReopenDowntimeAt(event.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to use the current time. A reason is required when you set a custom time.
              </p>
            </div>
            <div>
              <Label htmlFor="reopen-downtime-reason">Reason</Label>
              <Textarea
                id="reopen-downtime-reason"
                value={reopenDowntimeReason}
                onChange={(event) => setReopenDowntimeReason(event.target.value)}
                className="mt-1 bg-muted/50"
                placeholder="Optional unless you set a custom downtime start"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setReopenDowntimeDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={reopenDowntimeMutation.isPending} onClick={() => reopenDowntimeMutation.mutate()}>
                {reopenDowntimeMutation.isPending ? "Saving…" : "Reopen Downtime"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Return for Correction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="return-reason">Correction Reason</Label>
              <Textarea
                id="return-reason"
                value={returnReason}
                onChange={(event) => setReturnReason(event.target.value)}
                className="mt-1 bg-muted/50"
                placeholder="Explain what must be corrected"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={returnForCorrectionMutation.isPending} onClick={() => returnForCorrectionMutation.mutate()}>
                {returnForCorrectionMutation.isPending ? "Returning…" : "Return Work Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={recurrenceDialogOpen} onOpenChange={setRecurrenceDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Report Recurrence</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="recurrence-at">Downtime Started At</Label>
              <Input
                id="recurrence-at"
                type="datetime-local"
                value={recurrenceDowntimeAt}
                onChange={(event) => setRecurrenceDowntimeAt(event.target.value)}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Leave blank to use the current time for the new linked work order.
              </p>
            </div>
            <div>
              <Label htmlFor="recurrence-reason">Reason</Label>
              <Textarea
                id="recurrence-reason"
                value={recurrenceReason}
                onChange={(event) => setRecurrenceReason(event.target.value)}
                className="mt-1 bg-muted/50"
                placeholder="Optional repeat-fault note"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setRecurrenceDialogOpen(false)}>
                Cancel
              </Button>
              <Button disabled={reportRecurrenceMutation.isPending} onClick={() => reportRecurrenceMutation.mutate()}>
                {reportRecurrenceMutation.isPending ? "Creating…" : "Create Linked Work Order"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this work order?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the work order and its evidence. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteWorkOrderMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteWorkOrderMutation.mutate()}
              disabled={deleteWorkOrderMutation.isPending}
            >
              Confirm Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WorkOrderDetail;
