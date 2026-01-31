import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  Clock,
  FileText,
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
import { apiAddTaskEvidence, apiAssignWorkOrder, ApiError, apiCancelWorkOrder, apiCloseDowntime, apiCompleteWorkOrder, apiDeleteEvidence, apiDownloadEvidence, apiGetLookups, apiGetTask, apiGetWorkOrder, apiListUsers, apiPauseWorkOrder, apiResumeWorkOrder, apiStartWorkOrder, apiUpdateWorkOrderResolution, apiUploadTaskEvidenceFile, apiDeleteWorkOrder, type LookupsResponse, type UserSummary } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { isManager, isSuperadmin } from "@/lib/auth";

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

const formatDuration = (start: string | null | undefined, end: string | null | undefined): string => {
  if (!start) return "—";
  const startDate = new Date(start);
  if (Number.isNaN(startDate.getTime())) return "—";
  const endDate = end ? new Date(end) : new Date();
  if (Number.isNaN(endDate.getTime())) return "—";
  const diffMs = endDate.getTime() - startDate.getTime();
  if (diffMs < 0) return "—";
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const WorkOrderDetail = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const managerUser = isManager();
  const superadminUser = isSuperadmin();

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
      return apiCloseDowntime(taskId);
    },
    onSuccess: async () => {
      await workOrderQuery.refetch();
      toast({ title: "Downtime closed" });
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to close downtime", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
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
  const canStart = normalizedStatus === "open" || normalizedStatus === "scheduled";
  const canPause = normalizedStatus === "in_progress";
  const canResume = normalizedStatus === "paused";
  const canCancel = normalizedStatus !== null && normalizedStatus !== "completed" && normalizedStatus !== "cancelled";
  const canComplete = normalizedStatus !== null && normalizedStatus !== "completed" && normalizedStatus !== "cancelled";
  const canCloseDowntime = Boolean(workOrder?.downtimeStartedAt && !workOrder?.downtimeEndedAt);

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
      toast({ title: "Work order completed" });
      setBackdateMode(false);
      setBackdateCompletedAt("");
      setBackdateReason("");
      setBackdateTechnicianName("");
    },
    onError: (err: unknown) => {
      toast({ title: "Failed to complete", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
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
            <Button variant="outline" disabled={!workOrder || closeDowntimeMutation.isPending || !canCloseDowntime} onClick={() => closeDowntimeMutation.mutate()}>
              Close Downtime
            </Button>
            <Button variant="destructive" disabled={!workOrder || cancelMutation.isPending || !canCancel} onClick={() => cancelMutation.mutate()}>
              Cancel
            </Button>
            <Button variant="outline" disabled={!workOrder || completeMutation.isPending || !canComplete} onClick={() => completeMutation.mutate()}>
              Complete
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
                    <p className="text-xs text-muted-foreground">Downtime Started</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.downtimeStartedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Downtime Ended</p>
                    <p className="text-sm text-foreground mt-1">{formatDateTime(workOrder.downtimeEndedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Downtime Duration</p>
                    <p className="text-sm text-foreground mt-1">
                      {formatDuration(workOrder.downtimeStartedAt, workOrder.downtimeEndedAt)}
                    </p>
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
                      <p className="text-xs text-muted-foreground">Completed</p>
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
                      disabled={saveResolutionMutation.isPending || !workOrder}
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
                <CardTitle className="text-base">Completion Details</CardTitle>
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
                        Backdate completion (supervisor and above only)
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
              <span className="text-sm text-muted-foreground">Force complete</span>
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
