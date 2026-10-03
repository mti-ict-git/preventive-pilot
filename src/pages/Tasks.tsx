import { useCallback, useEffect, useMemo, useRef, useState, type ElementType } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ClipboardList,
	Search,
	Filter,
	Clock,
	AlertTriangle,
	CheckCircle,
	User,
	Server,
	ChevronRight,
	Calendar,
	Wrench,
	X,
	Pause,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDays, endOfDay, format, isBefore, isSameDay, parseISO, startOfDay } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  apiAddTaskEvidence,
  apiCompleteTask,
  apiDeleteChecklistEvidence,
  apiDeleteEvidence,
  apiDownloadChecklistEvidence,
  apiDownloadEvidence,
  apiAssignTask,
  apiClaimTask,
  apiGetLookups,
  apiListAssignableUsers,
  ApiError,
  apiGetTask,
  apiGetTaskDraft,
  apiSaveTaskDraft,
  apiListTasks,
  apiStartTask,
  apiPauseTask,
  apiCancelTask,
  apiResumeTask,
  apiReopenTask,
  apiSubmitTaskForApproval,
  apiApproveTaskBySupervisor,
  apiApproveTaskBySuperadmin,
  apiRejectTaskApproval,
  apiUploadTaskChecklistEvidenceFile,
  apiUploadTaskEvidenceFile,
  type CompleteTaskChecklistResultInput,
  type TaskListItem,
  type TaskView,
  type LookupRole,
  type UserSummary,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { isManager, isSuperadmin, hasRole, getJwtClaims } from "@/lib/auth";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ReportBreakdownDialog } from "@/components/workorders/ReportBreakdownDialog";

const Tasks = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewOptions: { value: TaskView; label: string; description: string }[] = [
    { value: "all", label: "All", description: "All PM tasks, including historical records." },
    { value: "due_today", label: "Due Today", description: "Open work due today. Submitted and closed tasks are excluded." },
    { value: "overdue", label: "Overdue", description: "Open work past its due time. Tasks due earlier today may also appear in Due Today." },
    { value: "in_progress", label: "In Progress", description: "Started work that is still in progress, excluding paused and submitted tasks." },
    { value: "upcoming", label: "Upcoming", description: "Open work due from tomorrow onward." },
    { value: "paused", label: "Paused", description: "Work paused by a technician and not yet submitted." },
    { value: "completed", label: "Completed", description: "Completed work with no pending approval." },
    { value: "cancelled", label: "Cancelled", description: "Cancelled task records." },
    { value: "pending_supervisor", label: "Pending Supervisor", description: "Submitted tasks waiting for supervisor review." },
    { value: "pending_superadmin", label: "Pending Superadmin", description: "Tasks waiting for final superadmin review." },
  ];
  const validView = (value: string | null): TaskView => viewOptions.find(option => option.value === value)?.value ?? "all";
  const activeTab = validView(searchParams.get("view"));
  const statusFilter = validView(searchParams.get("status"));
  const assignedValue = searchParams.get("assigned");
  const assignedFilter = assignedValue === "me" || assignedValue === "unassigned" ? assignedValue : "any";
  const approvedOnlyFilter = searchParams.get("approvedOnly") === "true";
  const dueFromFilter = searchParams.get("dueFrom") ?? "";
  const dueToFilter = searchParams.get("dueTo") ?? "";
  const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
  const updateFilter = (key: string, value: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value && value !== "all" && value !== "any") next.set(key, value); else next.delete(key);
    next.delete("page"); return next;
  }, { replace: true });
  const setActiveTab = (value: string) => updateFilter("view", value);
  const setStatusFilter = (value: string) => updateFilter("status", value);
  const setAssignedFilter = (value: string) => updateFilter("assigned", value);
  const setApprovedOnlyFilter = (value: boolean) => updateFilter("approvedOnly", value ? "true" : "");
  const setDueFromFilter = (value: string) => updateFilter("dueFrom", value);
  const setDueToFilter = (value: string) => updateFilter("dueTo", value);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") ?? "");
  const [composing, setComposing] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const committedSearch = searchParams.get("q") ?? "";
  useEffect(() => { setSearchQuery(committedSearch); }, [committedSearch]);
  useEffect(() => {
    if (composing || searchQuery === committedSearch) return;
    const timeout = window.setTimeout(() => updateFilter("q", searchQuery.trim()), searchQuery.trim() ? 300 : 0);
    return () => window.clearTimeout(timeout);
  }, [searchQuery, composing, committedSearch]);
  const [day, setDay] = useState(() => format(new Date(), "yyyy-MM-dd"));
  useEffect(() => {
    const interval = window.setInterval(() => setDay(format(new Date(), "yyyy-MM-dd")), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
	const queryClient = useQueryClient();

	useEffect(() => {
		const tid = searchParams.get("taskId");
		if (tid) {
			setSelectedTaskId(tid);
			setTaskDetailOpen(true);
		}
	}, [searchParams]);

  const sharedQueryInput = useMemo<Parameters<typeof apiListTasks>[0]>(() => {
    const start = startOfDay(parseISO(day));
    const dateBoundary = (value: string, end = false) => {
      const date = parseISO(value); if (Number.isNaN(date.getTime())) return undefined;
      return (end ? endOfDay(date) : startOfDay(date)).toISOString();
    };
    return {
      maintenanceType: "PM", assigned: assignedFilter, approvedOnly: approvedOnlyFilter,
      q: committedSearch || undefined, uiStatus: statusFilter,
      todayStart: start.toISOString(), todayEnd: addDays(start, 1).toISOString(),
      dueFrom: dueFromFilter ? dateBoundary(dueFromFilter) : undefined,
      dueTo: dueToFilter ? dateBoundary(dueToFilter, true) : undefined,
    };
  }, [day, assignedFilter, approvedOnlyFilter, committedSearch, statusFilter, dueFromFilter, dueToFilter]);
  const listQueryInput = { ...sharedQueryInput, view: activeTab, page, pageSize: 25 };
  const tasksQuery = useQuery({
    queryKey: ["tasks", listQueryInput], queryFn: () => apiListTasks(listQueryInput), refetchInterval: 30_000,
  });
  const statsQuery = useQuery({
    queryKey: ["task-stats", sharedQueryInput],
    queryFn: () => apiListTasks({ ...sharedQueryInput, page: 1, pageSize: 1 }),
    refetchInterval: 30_000,
  });
  const tabCounts = statsQuery.data?.tabCounts;
  const total = tasksQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const setPage = (value: number) => setSearchParams(previous => {
    const next = new URLSearchParams(previous); next.set("page", String(value)); return next;
  });
  useEffect(() => {
    if (tasksQuery.isSuccess && page > pageCount) setPage(pageCount);
  }, [tasksQuery.isSuccess, page, pageCount]);

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTaskId, setAssignTaskId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<"user" | "role" | "unassigned">("user");
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [assignRoleId, setAssignRoleId] = useState<string>("");

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    enabled: assignDialogOpen,
  });

  const usersQuery = useQuery({
    queryKey: ["assignable-users", { page: 1, pageSize: 500, isActive: true }],
    queryFn: () => apiListAssignableUsers({ page: 1, pageSize: 500, isActive: true }),
    enabled: assignDialogOpen,
  });

  const technicianOptions = useMemo(() => {
    const users = usersQuery.data?.items ?? [];
    return users
      .filter((u) => u.roles.some((role) => role.trim().toLowerCase() === "technician"))
      .slice()
      .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));
  }, [usersQuery.data?.items]);

  const openAssignDialogFor = (taskId: string) => {
    setAssignTaskId(taskId);
    const full = (tasksQuery.data?.items ?? []).find((t) => t.id === taskId);
    if (full?.assignedTo.userId) {
      setAssignMode("user");
      setAssignUserId(full.assignedTo.userId);
      setAssignRoleId("");
    } else if (full?.assignedTo.roleId) {
      setAssignMode("role");
      setAssignRoleId(full.assignedTo.roleId);
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
      if (!assignTaskId) throw new Error("No task selected");
      if (assignMode === "user") {
        if (!assignUserId) throw new Error("Select technician");
        return apiAssignTask({ taskId: assignTaskId, assignedToUserId: assignUserId, assignedToRoleId: null });
      }
      if (assignMode === "role") {
        if (!assignRoleId) throw new Error("Select role");
        return apiAssignTask({ taskId: assignTaskId, assignedToRoleId: assignRoleId, assignedToUserId: null });
      }
      return apiAssignTask({ taskId: assignTaskId, assignedToUserId: null, assignedToRoleId: null });
    },
    onSuccess: async () => {
      setAssignDialogOpen(false);
      setAssignTaskId(null);
      toast({ title: "Task assigned" });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await statsQuery.refetch();
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed";
      toast({ title: "Assign failed", description: message, variant: "destructive" });
    },
  });

  const claimMutation = useMutation({
    mutationFn: (taskId: string) => apiClaimTask(taskId),
    onSuccess: async () => {
      toast({ title: "Task claimed" });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
      await statsQuery.refetch();
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Failed";
      toast({ title: "Claim failed", description: message, variant: "destructive" });
    },
  });

  const currentUserId = getJwtClaims()?.sub ?? null;

  type UiStatus = Exclude<TaskView, "all">;
  const getUiStatus = (task: TaskListItem, now: Date): UiStatus => {
    if (task.displayStatus && task.displayStatus !== "all") return task.displayStatus;
    if (task.status === "cancelled") return "cancelled";
    if (task.approvalStatus === "PendingSupervisor") return "pending_supervisor";
    if (task.approvalStatus === "PendingSuperadmin") return "pending_superadmin";
    if (task.status === "completed" || task.status === "in_progress" || task.status === "paused") return task.status;
    const due = parseISO(task.scheduledDueAt);
    if (isSameDay(due, now)) return "due_today";
    return isBefore(due, now) ? "overdue" : "upcoming";
  };

  const getStatusConfig = (status: UiStatus) => {
    const config = {
      paused: { label: "Paused", color: "bg-muted text-muted-foreground border-border", icon: Pause },
      pending_supervisor: { label: "Pending Supervisor", color: "bg-warning/10 text-foreground border-warning/40", icon: Clock },
      pending_superadmin: { label: "Pending Superadmin", color: "bg-warning/10 text-foreground border-warning/40", icon: Clock },
      upcoming: { label: "Upcoming", color: "bg-muted/60 text-muted-foreground border-border", icon: Clock },
      in_progress: {
        label: "In Progress",
        color: "bg-primary/20 text-primary border-primary/30",
        icon: ClipboardList,
      },
      due_today: { label: "Due Today", color: "bg-warning/10 text-foreground border-warning/40", icon: AlertTriangle },
      overdue: { label: "Overdue", color: "bg-destructive/20 text-destructive border-destructive/30", icon: AlertTriangle },
      completed: { label: "Completed", color: "bg-success/20 text-success border-success/30", icon: CheckCircle },
      cancelled: {
        label: "Cancelled",
        color: "bg-muted/40 text-muted-foreground border-muted/60",
        icon: AlertTriangle,
      },
    } as const;
    return config[status];
  };

  type StatTone = "primary" | "warning" | "destructive" | "success";
  type StatItem = { label: string; value: number; tone: StatTone; icon: ElementType };

  const statItems = useMemo<StatItem[]>(() => {
    return [
      { label: "Total Tasks", value: tabCounts?.all ?? 0, tone: "primary", icon: ClipboardList },
      { label: "Due Today", value: tabCounts?.due_today ?? 0, tone: "warning", icon: Clock },
      { label: "Overdue", value: tabCounts?.overdue ?? 0, tone: "destructive", icon: AlertTriangle },
      { label: "Completed", value: tabCounts?.completed ?? 0, tone: "success", icon: CheckCircle },
    ];
  }, [tabCounts]);

  const statBorder = (tone: "primary" | "warning" | "destructive" | "success") => {
    if (tone === "primary") return "border-t-primary";
    if (tone === "warning") return "border-t-warning";
    if (tone === "success") return "border-t-success";
    return "border-t-destructive";
  };

  const statIconClass = (tone: "primary" | "warning" | "destructive" | "success") => {
    if (tone === "warning") return "bg-warning/10 text-warning";
    if (tone === "destructive") return "bg-destructive/10 text-destructive";
    if (tone === "success") return "bg-success/10 text-success";
    return "bg-primary/10 text-primary";
  };

	const filteredTasks = useMemo(() => {
		const now = new Date();
    const items = tasksQuery.data?.items ?? [];
		return items
			.map((task) => {
				const uiStatus = getUiStatus(task, now);
				const pic = task.assignedTo.displayName ?? task.assignedTo.roleName ?? "Unassigned";
				const dueDate = format(parseISO(task.scheduledDueAt), "yyyy-MM-dd");
				const assetTag = task.asset.assetTag ?? (task.facility ? task.facility.name ?? "" : "");
				const assetName = task.asset.name ?? (task.facility ? task.facility.locationName ?? task.facility.name ?? "" : "");
        const progress = task.checklistTotal > 0 ? Math.round((task.checklistCompleted / task.checklistTotal) * 100) : 0;
				const isAssigned = Boolean(task.assignedTo.userId || task.assignedTo.roleId);
                                const assignmentLocked =
                                        task.maintenanceType === "PM" &&
                                        (task.status === "completed" || task.status === "cancelled" || (task.approvalStatus ?? "None") === "PendingSupervisor" ||
                                                (task.approvalStatus ?? "None") === "PendingSuperadmin" ||
                                                (task.approvalStatus ?? "None") === "Approved");
                                const canClaim =
                                        task.maintenanceType === "PM" &&
                                        task.assignedTo.userId === null &&
                                        currentUserId !== null &&
                                        Boolean(task.assignedTo.roleName) &&
                                        hasRole(task.assignedTo.roleName ?? "") &&
                                        !assignmentLocked &&
                                        task.status !== "completed" &&
                                        task.status !== "cancelled";
				return {
					id: task.id,
					displayId: task.taskNumber,
					taskId: task.id,
					asset: assetTag,
					assetName,
					template: task.template.name,
					status: uiStatus,
					priority: task.priority,
					dueDate,
					pic,
					progress,
					checklistComplete: task.checklistCompleted,
					checklistTotal: task.checklistTotal,
					isAssigned,
                                        assignmentLocked,
                                        canClaim,
					approvalStatus: task.approvalStatus ?? "None",
				};
			})
        }, [tasksQuery.data?.items, currentUserId]);

  return (
    <div className="min-h-screen bg-background">
      <Header title="PM Tasks" subtitle="Track and execute maintenance tasks" />

      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {statItems.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
            >
              <Card
                className={`border-border/60 bg-card/70 shadow-sm hover:shadow-md transition-shadow border-t-2 ${statBorder(stat.tone)}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">{stat.label}</p>
                      <p className="text-3xl font-semibold text-foreground mt-2 tabular-nums leading-none">
                        {statsQuery.isError ? "—" : statsQuery.isLoading ? "…" : stat.value}
                      </p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${statIconClass(stat.tone)}`}>
                      <stat.icon className="w-6 h-6" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <Card className="border-border/60 bg-card/70 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base text-foreground flex items-center gap-2">
                  <Filter className="w-4 h-4 text-primary" />
                  Filters
                </CardTitle>
                <div className="text-sm text-muted-foreground mt-1">Search and refine tasks quickly</div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="gap-2" onClick={() => setFiltersOpen(true)}>
                  <Filter className="w-4 h-4" />
                  Advanced
                </Button>
                <Button variant="outline" className="gap-2" onClick={() => navigate("/scheduling")}>
                  <Calendar className="w-4 h-4" />
                  Calendar View
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-8">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    ref={searchInput}
                    aria-label="Search tasks"
                    maxLength={200}
                    onCompositionStart={() => setComposing(true)}
                    onCompositionEnd={() => setComposing(false)}
                    onKeyDown={event => { if (event.key === "Enter" && !event.nativeEvent.isComposing) updateFilter("q", searchQuery.trim()); }}
                    placeholder="Search by task ID, asset or facility..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-10 bg-background"
                  />
                  {searchQuery && <Button type="button" size="icon" variant="ghost" aria-label="Clear search" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => { setSearchQuery(""); updateFilter("q", ""); searchInput.current?.focus(); }}><X className="h-4 w-4" /></Button>}
                </div>
              </div>
              <div className="col-span-12 md:col-span-4">
                <div className="flex items-center gap-2 justify-end text-sm text-muted-foreground h-full">
                  <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs">
                    {tasksQuery.isError ? "Unavailable" : tasksQuery.isLoading ? "Loading…" : `${total} tasks`}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs activationMode="manual" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-primary" />
                  Tasks
                </CardTitle>
              </div>
              <TabsList aria-label="Task views" className="mt-4 flex h-auto w-full flex-wrap justify-start gap-2 rounded-lg bg-muted/40 p-2" >
                {viewOptions.map(option => (
                  <TabsTrigger key={option.value} value={option.value} className="group min-h-10 cursor-pointer gap-2 rounded-md px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    {option.label}
                    <span className="min-w-6 rounded-md bg-muted px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground group-data-[state=active]:bg-primary-foreground/20 group-data-[state=active]:text-primary-foreground">
                      {statsQuery.isError ? "—" : tabCounts ? tabCounts[option.value].toLocaleString() : "…"}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
              <p className="mt-3 text-sm text-muted-foreground">{viewOptions.find(option => option.value === activeTab)?.description}</p>
              {statsQuery.isError && <p role="alert" className="text-sm text-destructive">Task counts could not be loaded. <Button variant="link" onClick={() => statsQuery.refetch()}>Retry counts</Button></p>}

            </CardHeader>
            <CardContent>
              <TabsContent value={activeTab} className="mt-0">
                {tasksQuery.isLoading ? (
                  <div role="status" className="min-h-40 flex items-center justify-center text-sm text-muted-foreground">Loading tasks…</div>
                ) : tasksQuery.isError ? (
                  <div role="alert" className="min-h-40 flex items-center justify-center gap-3 text-sm text-destructive">Failed to load tasks.<Button variant="outline" onClick={() => tasksQuery.refetch()}>Retry</Button></div>
                ) : filteredTasks.length === 0 ? (
                  <div role="status" className="min-h-40 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"><ClipboardList className="h-6 w-6" /><p>No tasks match this view and filters.</p><Button variant="outline" onClick={() => { setSearchQuery(""); setSearchParams({ view: activeTab }); }}>Clear filters</Button></div>
                ) : (
                  <div className="space-y-3">
                    {filteredTasks.map((task, index) => {
                      const statusConfig = getStatusConfig(task.status);
                      return (
                        <motion.article
                          key={task.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.04 }}
                          className="rounded-lg border border-border/60 bg-background/60 p-4 hover:border-primary/40 transition-colors group"
                        >
                          <button type="button" aria-label={`Open task ${task.displayId}`} className="flex w-full cursor-pointer items-start justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => { setSelectedTaskId(task.taskId); setTaskDetailOpen(true); }}>
                            <div className="flex min-w-0 items-start gap-3">
                              <div className="w-12 h-12 rounded-xl bg-muted/60 flex items-center justify-center shrink-0">
                                <Server className="w-6 h-6 text-muted-foreground" />
                              </div>
                              <div>
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <span className="break-all font-mono text-xs text-muted-foreground">{task.displayId}</span>
                                  <Badge variant="outline" className={statusConfig.color}>
                                    <statusConfig.icon className="w-3 h-3 mr-1" />
                                    {statusConfig.label}
                                  </Badge>
                                  {task.priority === "high" && (
                                    <Badge
                                      variant="outline"
                                      className="bg-destructive/20 text-destructive border-destructive/30"
                                    >
                                      High Priority
                                    </Badge>
                                  )}
                                </div>
                                <h3 className="font-semibold text-foreground">{task.asset}</h3>
                                <p className="text-sm text-muted-foreground">
                                  {task.assetName} / {task.template}
                                </p>
                              </div>
                            </div>
                            <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>

                          <div className="mt-3 pt-3 border-t border-border/60 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex flex-wrap items-center gap-6">
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">{task.pic}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Due: {task.dueDate}</span>
                              </div>
                            </div>
                            <div className="flex w-full items-center gap-3 sm:w-auto sm:min-w-48">
                              <Progress value={task.progress} className="h-1.5 w-20 shrink-0" />
                              <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {task.checklistComplete}/{task.checklistTotal}
                              </span>
                              {isManager() && !task.assignmentLocked ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={task.assignmentLocked}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openAssignDialogFor(task.taskId);
                                  }}
                                >
                                  {task.isAssigned ? "Reassign" : "Assign"}
                                </Button>
                              ) : task.canClaim ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={claimMutation.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    claimMutation.mutate(task.taskId);
                                  }}
                                >
                                  Claim
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </motion.article>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
              <nav aria-label="Task pagination" className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 text-sm">
                <p aria-live="polite" className="text-muted-foreground">{tasksQuery.isError ? "Task totals unavailable" : tasksQuery.isLoading ? "Loading tasks…" : `${total ? (page - 1) * 25 + 1 : 0}-${Math.min(page * 25, total)} of ${total} tasks`}</p>
                <div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={page <= 1 || tasksQuery.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><span className="tabular-nums">Page {page} of {pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount || tasksQuery.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div>
              </nav>
            </CardContent>
          </Card>
        </Tabs>
      </div>

      <TaskDetailDialog
        open={taskDetailOpen}
        onOpenChange={(next) => {
          setTaskDetailOpen(next);
          if (!next) setSelectedTaskId(null);
          if (!next) navigate("/tasks", { replace: true });
        }}
        taskId={selectedTaskId}
        onStarted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["tasks"] });
          await statsQuery.refetch();
        }}
        onCompleted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["tasks"] });
          await statsQuery.refetch();
        }}
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Filter Tasks</DialogTitle>
            <DialogDescription>Filter tasks by assignment, approval, due date and status.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6 space-y-2">
                <Label htmlFor="task-assigned-filter">Assigned</Label>
                <Select
                  value={assignedFilter}
                  onValueChange={(value) => {
                    if (value === "any" || value === "me" || value === "unassigned") {
                      setAssignedFilter(value);
                    }
                  }}
                >
                  <SelectTrigger id="task-assigned-filter">
                    <SelectValue placeholder="Assigned" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="any">Any</SelectItem>
                    <SelectItem value="me">Assigned to me</SelectItem>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-12 md:col-span-6 flex items-end">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="approved-only"
                    checked={approvedOnlyFilter}
                    onCheckedChange={(checked) => setApprovedOnlyFilter(Boolean(checked))}
                  />
                  <Label htmlFor="approved-only">Approved only</Label>
                </div>
              </div>
              <div className="col-span-12 md:col-span-6 space-y-2">
                <Label htmlFor="task-due-from">Due from</Label>
                <Input
                  id="task-due-from"
                  type="date"
                  value={dueFromFilter}
                  onChange={(event) => setDueFromFilter(event.target.value)}
                />
              </div>
              <div className="col-span-12 md:col-span-6 space-y-2">
                <Label htmlFor="task-due-to">Due to</Label>
                <Input
                  id="task-due-to"
                  type="date"
                  value={dueToFilter}
                  onChange={(event) => setDueToFilter(event.target.value)}
                />
              </div>
					<div className="col-span-12 md:col-span-6 space-y-2">
						<Label htmlFor="task-status-filter">Status</Label>
						<Select
							value={statusFilter}
              onValueChange={setStatusFilter}
						>
							<SelectTrigger id="task-status-filter">
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
                {viewOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
							</SelectContent>
						</Select>
					</div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchParams(previous => {
                    const next = new URLSearchParams(previous);
                    for (const key of ["assigned", "approvedOnly", "dueFrom", "dueTo", "status", "page"]) next.delete(key);
                    return next;
                  }, { replace: true });
                  setFiltersOpen(false);
                }}
              >
                Clear
              </Button>
              <Button onClick={() => setFiltersOpen(false)}>Apply</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={(o) => setAssignDialogOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assignment Target</Label>
              <RadioGroup value={assignMode} onValueChange={(v) => setAssignMode(v as "user" | "role" | "unassigned")}
                className="grid grid-cols-12 gap-2">
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
                    {technicianOptions.map((u) => (
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
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={() => assignMutation.mutate()}
                disabled={assignMutation.isPending || (assignMode === "user" && !assignUserId) || (assignMode === "role" && !assignRoleId)}
              >
                {assignMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const TaskDetailDialog = (props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
  onStarted: () => Promise<void>;
  onCompleted?: () => Promise<void> | void;
}) => {
  const formatDurationLabel = (totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  const checklistDraftStorageKey = (id: string): string => `pm-web.checklistDraft.${id}`;
  const checklistDraftSavedAtStorageKey = (id: string): string => `pm-web.checklistDraftSavedAt.${id}`;
  const parseChecklistDraft = (
    raw: string,
  ): Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> | null => {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      const record = parsed as Record<string, unknown>;
      const next: Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> = {};
      for (const [key, value] of Object.entries(record)) {
        if (typeof key !== "string" || !key.trim()) continue;
        if (!value || typeof value !== "object") continue;
        const v = value as Record<string, unknown>;
        const outcome = v.outcome;
        const notes = v.notes;
        const validOutcome = outcome === null || outcome === 0 || outcome === 1 || outcome === 2;
        if (!validOutcome) continue;
        if (typeof notes !== "string") continue;
        next[key] = { outcome: outcome as 0 | 1 | 2 | null, notes };
      }
      return next;
    } catch {
      return null;
    }
  };
  const taskQuery = useQuery({
    queryKey: ["task", props.taskId],
    queryFn: () => apiGetTask(props.taskId ?? ""),
    enabled: props.open && !!props.taskId,
  });

  const draftQuery = useQuery({
    queryKey: ["taskDraft", props.taskId],
    queryFn: () => apiGetTaskDraft(props.taskId ?? ""),
    enabled: props.open && !!props.taskId,
  });

	const [backdateMode, setBackdateMode] = useState(false);
	const [backdateCompletedAt, setBackdateCompletedAt] = useState("");
	const [backdateReason, setBackdateReason] = useState("");
	const [backdateTechnicianName, setBackdateTechnicianName] = useState("");

	const usersQueryForBackdate = useQuery({
		queryKey: ["assignable-users", { page: 1, pageSize: 500, isActive: true }],
		queryFn: () => apiListAssignableUsers({ page: 1, pageSize: 500, isActive: true }),
		enabled: backdateMode,
	});

	const technicianOptionsForBackdate = useMemo(() => {
		const users = usersQueryForBackdate.data?.items ?? [];
		return users
			.filter((u) => u.roles.some((role) => role.trim().toLowerCase() === "technician"))
			.slice()
			.sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));
	}, [usersQueryForBackdate.data?.items]);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiStartTask(props.taskId);
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      await props.onStarted();
      toast({ title: "Task started" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to start task",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiPauseTask(props.taskId);
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Task paused" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to pause task",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiClaimTask(props.taskId);
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      await props.onStarted();
      toast({ title: "Task claimed" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to claim task",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      const reason = cancelReason.trim();
      if (!reason) {
        setCancelTouched(true);
        throw new Error("Reason is required");
      }
      return apiCancelTask({ taskId: props.taskId, reason });
    },
    onSuccess: async () => {
      setCancelDialogOpen(false);
      setCancelReason("");
      setCancelTouched(false);
      await taskQuery.refetch();
      toast({ title: "Task cancelled" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to cancel task",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiResumeTask(props.taskId);
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Task resumed" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to resume task",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiReopenTask(props.taskId);
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      await props.onStarted();
      toast({ title: "Task reopened" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to reopen task",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

	const task = taskQuery.data;

	const buildChecklistResults = (): CompleteTaskChecklistResultInput[] => {
		const items = task?.checklistItems ?? [];
		const results: CompleteTaskChecklistResultInput[] = [];
		for (const item of items) {
			if (!item.isActive) continue;
			const draft = checklistDraft[item.id];
			const outcome = draft?.outcome ?? null;
			if (outcome === null) {
				if (item.isMandatory) {
					throw new Error("Missing outcome for a mandatory checklist item");
				}
				continue;
			}

			if (!item.requiresPassFail && outcome === 2) {
				throw new Error("Invalid outcome for this checklist item");
			}

			if (item.isMandatory && outcome === 0) {
				throw new Error("Mandatory checklist items cannot be skipped");
			}

                        const notesValue = draft?.notes ?? "";
                        const notesRequired = outcome === 2 || (item.requiresNotes && outcome !== 0);
                        if (notesRequired && notesValue.trim().length === 0) {
				throw new Error("Notes are required for this checklist item");
			}

			if (
				item.enableAttachment &&
				item.requiresAttachment &&
				outcome !== 0 &&
				item.evidence.length === 0
			) {
				throw new Error("Attachment is required for this checklist item");
			}

			results.push({
				templateChecklistItemId: item.id,
				outcome,
				notes: notesValue.trim() ? notesValue.trim() : null,
			});
		}
		return results;
	};

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
			const results = buildChecklistResults();
			return apiSubmitTaskForApproval({ taskId: props.taskId, checklistResults: results });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Submitted for approval" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Submission failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const approveBySupervisorMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiApproveTaskBySupervisor(props.taskId);
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Supervisor approved" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Approve failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const approveBySuperadminMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiApproveTaskBySuperadmin(props.taskId);
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Superadmin approved" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Approve failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const rejectApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiRejectTaskApproval({ taskId: props.taskId, reason: rejectReason.trim() ? rejectReason.trim() : null, reopenTask: false });
    },
    onSuccess: async () => {
      setRejectDialogOpen(false);
      setRejectReason("");
      await taskQuery.refetch();
      toast({ title: "Approval rejected" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Reject failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelTouched, setCancelTouched] = useState(false);
  const cancelReasonError = cancelTouched && cancelReason.trim().length === 0;

	const normalizedStatus = task?.status.toLowerCase() ?? null;
  const claims = getJwtClaims();
  const myUserId = claims?.sub ?? null;
  const canModify =
    isManager() ||
    (!!task?.assignedTo.userId && task.assignedTo.userId === myUserId) ||
    (!task?.assignedTo.userId && !!task?.assignedTo.roleName && hasRole(task.assignedTo.roleName));
  const canClaim =
    task?.maintenanceType === "PM" &&
    !task?.assignedTo.userId &&
    !!task?.assignedTo.roleName &&
    hasRole(task.assignedTo.roleName) &&
    task?.approvalStatus !== "PendingSupervisor" &&
    task?.approvalStatus !== "PendingSuperadmin" &&
    task?.approvalStatus !== "Approved" &&
    normalizedStatus !== "completed" &&
    normalizedStatus !== "cancelled";
  const canStart = canModify && (normalizedStatus === "open" || normalizedStatus === "scheduled");
        const canPause = canModify && normalizedStatus === "in_progress";
        const canResume = canModify && normalizedStatus === "paused";
        const canCancel = canModify && normalizedStatus !== null && normalizedStatus !== "completed" && normalizedStatus !== "cancelled";
	const approvalStatus = task?.approvalStatus ?? "None";
	const isPmWithActiveApproval =
		task?.maintenanceType === "PM" &&
		(approvalStatus === "PendingSupervisor" || approvalStatus === "PendingSuperadmin" || approvalStatus === "Approved");
	const canComplete =
                canModify &&
		normalizedStatus !== null &&
		normalizedStatus !== "completed" &&
		normalizedStatus !== "cancelled" &&
		!isPmWithActiveApproval;
	const canReopen = normalizedStatus === "cancelled" && isManager();
  const canSaveDraft =
    normalizedStatus !== null &&
    normalizedStatus !== "completed" &&
    normalizedStatus !== "cancelled" &&
    canModify;

  const canSubmitForApproval =
    canModify &&
    task?.maintenanceType === "PM" &&
    approvalStatus !== "PendingSupervisor" &&
    approvalStatus !== "PendingSuperadmin" &&
    approvalStatus !== "Approved";
  const canApproveBySupervisor =
    (hasRole("Supervisor") || hasRole("Admin") || isSuperadmin()) && approvalStatus === "PendingSupervisor";
  const canApproveBySuperadmin = isSuperadmin() && approvalStatus === "PendingSuperadmin";
  const canRejectApproval =
    approvalStatus === "PendingSupervisor"
      ? hasRole("Supervisor") || hasRole("Admin") || isSuperadmin()
      : approvalStatus === "PendingSuperadmin"
        ? isSuperadmin()
        : false;

  const submittedByName = useMemo(() => {
    const u = task?.technicianCompletedBy;
    const name = u?.displayName ?? u?.username ?? null;
    return name;
  }, [task?.technicianCompletedBy]);
  const reviewedByName = useMemo(() => {
    const u = task?.supervisorApprovedBy;
    const name = u?.displayName ?? u?.username ?? null;
    return name;
  }, [task?.supervisorApprovedBy]);
  const approvedByName = useMemo(() => {
    const u = task?.superadminApprovedBy;
    const name = u?.displayName ?? u?.username ?? null;
    return name;
  }, [task?.superadminApprovedBy]);

  const remarksHistory = useMemo(() => {
    const items: Array<{
      label: string;
      note: string | null;
      at: string;
      by: string;
    }> = [];

    if (task?.remarksHistory && task.remarksHistory.length > 0) {
      return task.remarksHistory.map((item) => ({
        label: item.label,
        note: item.note && item.note.trim().length > 0 ? item.note : null,
        at: item.at ? format(parseISO(item.at), "yyyy-MM-dd HH:mm") : "—",
        by: item.by?.displayName ?? item.by?.username ?? "—",
      }));
    }

    if (task?.revisedAt || task?.revisedBy || task?.revisionNote) {
      items.push({
        label: "Revised",
        note: task.revisionNote && task.revisionNote.trim().length > 0 ? task.revisionNote : null,
        at: task.revisedAt ? format(parseISO(task.revisedAt), "yyyy-MM-dd HH:mm") : "—",
        by: task.revisedBy?.displayName ?? task.revisedBy?.username ?? "—",
      });
    }

    if (task?.rejectedAt || task?.rejectedBy || task?.rejectionReason) {
      items.push({
        label: "Rejected",
        note: task.rejectionReason && task.rejectionReason.trim().length > 0 ? task.rejectionReason : null,
        at: task.rejectedAt ? format(parseISO(task.rejectedAt), "yyyy-MM-dd HH:mm") : "—",
        by: task.rejectedBy?.displayName ?? task.rejectedBy?.username ?? "—",
      });
    }

    if (task?.cancelledAt || task?.cancelledBy || task?.cancelledReason) {
      items.push({
        label: "Cancelled",
        note: task.cancelledReason && task.cancelledReason.trim().length > 0 ? task.cancelledReason : null,
        at: task.cancelledAt ? format(parseISO(task.cancelledAt), "yyyy-MM-dd HH:mm") : "—",
        by: task.cancelledBy?.displayName ?? task.cancelledBy?.username ?? "—",
      });
    }

    return items;
  }, [
    task?.revisedAt,
    task?.revisedBy,
    task?.revisionNote,
    task?.remarksHistory,
    task?.rejectedAt,
    task?.rejectedBy,
    task?.rejectionReason,
    task?.cancelledAt,
    task?.cancelledBy,
    task?.cancelledReason,
  ]);

  const getOutcomeOptions = (requiresPassFail: boolean) => {
    if (requiresPassFail) {
      return [
        { value: "0", label: "Skip" },
        { value: "1", label: "Pass" },
        { value: "2", label: "Fail" },
      ];
    }
    return [
      { value: "0", label: "Skip" },
      { value: "1", label: "Done" },
    ];
  };

  const [forceCompleted, setForceCompleted] = useState(false);
  const [checklistDraft, setChecklistDraft] = useState<
    Record<string, { outcome: 0 | 1 | 2 | null; notes: string }>
  >({});
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(null);
  const [evidenceUri, setEvidenceUri] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
	const [previewContentType, setPreviewContentType] = useState<string | null>(null);
	const [previewKind, setPreviewKind] = useState<"task" | "checklist">("task");
	const [previewId, setPreviewId] = useState<string | null>(null);

  const taskFileInputRef = useRef<HTMLInputElement | null>(null);
  const checklistFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingChecklistItemId, setPendingChecklistItemId] = useState<string | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingReplace, setPendingReplace] = useState<
    { kind: "task" | "checklist"; evidenceId: string; templateChecklistItemId?: string }
  | null>(null);
  const [reportBreakdownOpen, setReportBreakdownOpen] = useState(false);
  const [reportBreakdownSource, setReportBreakdownSource] = useState<{
    sourceTaskId?: string;
    sourceTemplateChecklistItemId?: string;
    initialSymptom?: string;
    title?: string;
    submitLabel?: string;
  } | null>(null);

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
    if (!props.open) return;
    setForceCompleted(false);
    const next: Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> = {};
    for (const item of task?.checklistItems ?? []) {
      if (!item.isActive) continue;
      next[item.id] = {
        outcome: item.result ? item.result.outcome : null,
        notes: item.result?.notes ?? "",
      };
    }
    if (task?.id) {
      const stored = parseChecklistDraft(localStorage.getItem(checklistDraftStorageKey(task.id)) ?? "");
      const serverDraftItems = draftQuery.data?.items ?? [];
      const merged: Record<string, { outcome: 0 | 1 | 2 | null; notes: string }> = {};
      for (const [id, serverValue] of Object.entries(next)) {
        const localValue = stored?.[id];
        const serverDraft = serverDraftItems.find((d) => d.templateChecklistItemId === id) ?? null;
        if (serverValue.outcome !== null) {
          merged[id] = serverValue;
        } else if (serverDraft) {
          merged[id] = { outcome: serverDraft.outcome, notes: serverDraft.notes ?? "" };
        } else if (localValue) {
          merged[id] = localValue;
        } else {
          merged[id] = serverValue;
        }
      }
      setChecklistDraft(merged);
      const localSavedAt = localStorage.getItem(checklistDraftSavedAtStorageKey(task.id)) ?? null;
      const newestServerSavedAt = serverDraftItems.length > 0 ? serverDraftItems[0]?.savedAt ?? null : null;
      setDraftSavedAt(newestServerSavedAt ?? localSavedAt);
    } else {
      setChecklistDraft(next);
      setDraftSavedAt(null);
    }
    setEvidenceUri("");
    closePreview();
    setPendingChecklistItemId(null);
		setBackdateMode(false);
		setBackdateCompletedAt("");
		setBackdateReason("");
		setBackdateTechnicianName("");
  }, [props.open, task?.id, draftQuery.data?.items]);

  const handleSaveDraft = useCallback(async () => {
    if (!task?.id) return;
    const items = Object.entries(checklistDraft).map(([id, v]) => ({
      templateChecklistItemId: id,
      outcome: v.outcome,
      notes: v.notes.trim() ? v.notes.trim() : null,
    }));
    try {
      await apiSaveTaskDraft({ taskId: task.id, items, replace: true });
      const savedAt = new Date().toISOString();
      setDraftSavedAt(savedAt);
      localStorage.setItem(checklistDraftStorageKey(task.id), JSON.stringify(checklistDraft));
      localStorage.setItem(checklistDraftSavedAtStorageKey(task.id), savedAt);
      toast({ title: "Draft saved to server" });
    } catch (err) {
      try {
        localStorage.setItem(checklistDraftStorageKey(task.id), JSON.stringify(checklistDraft));
        const savedAt = new Date().toISOString();
        localStorage.setItem(checklistDraftSavedAtStorageKey(task.id), savedAt);
        setDraftSavedAt(savedAt);
        toast({ title: "Draft saved locally (offline)" });
      } catch {}
      toast({
        title: "Failed to save draft to server",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    }
  }, [task?.id, checklistDraft]);

  const uploadTaskEvidenceMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!props.taskId) throw new Error("No task selected");
      if (file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50MB)");
      return apiUploadTaskEvidenceFile({ taskId: props.taskId, file });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "File uploaded" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const uploadChecklistEvidenceMutation = useMutation({
    mutationFn: async (input: { templateChecklistItemId: string; file: File }) => {
      if (!props.taskId) throw new Error("No task selected");
      if (input.file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50MB)");
      return apiUploadTaskChecklistEvidenceFile({
        taskId: props.taskId,
        templateChecklistItemId: input.templateChecklistItemId,
        file: input.file,
      });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "File uploaded" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const replaceEvidenceMutation = useMutation({
    mutationFn: async (input: {
      kind: "task" | "checklist";
      evidenceId: string;
      file: File;
      templateChecklistItemId?: string;
    }) => {
      if (!props.taskId) throw new Error("No task selected");
      if (input.file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50MB)");
      if (input.kind === "task") {
        await apiDeleteEvidence({ evidenceId: input.evidenceId });
        return apiUploadTaskEvidenceFile({ taskId: props.taskId, file: input.file });
      }
      await apiDeleteChecklistEvidence({ checklistEvidenceId: input.evidenceId });
      if (!input.templateChecklistItemId) throw new Error("Missing checklist item");
      return apiUploadTaskChecklistEvidenceFile({
        taskId: props.taskId,
        templateChecklistItemId: input.templateChecklistItemId,
        file: input.file,
      });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Attachment replaced" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Replace failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const openEvidencePreview = useCallback(
    async (input: {
      kind: "task" | "checklist";
      id: string;
      uri: string;
      fileName: string | null;
      contentType: string | null;
    }) => {
      const isInternal = input.uri === "imported" || input.uri === "stored" || input.uri === "uploaded";
      if (!isInternal) {
        const target = input.uri.trim();
        if (target) window.open(target, "_blank", "noreferrer");
        return;
      }
      try {
        const downloaded =
          input.kind === "task"
            ? await apiDownloadEvidence({ evidenceId: input.id })
            : await apiDownloadChecklistEvidence({ checklistEvidenceId: input.id });
        const url = URL.createObjectURL(downloaded.blob);
        setPreviewKind(input.kind);
        setPreviewId(input.id);
        setPreviewUrl(url);
        setPreviewFileName(downloaded.fileName ?? input.fileName);
        setPreviewContentType(downloaded.contentType ?? input.contentType);
        setPreviewOpen(true);
      } catch (err) {
        toast({
          title: "Preview failed",
          description: err instanceof Error ? err.message : "Request failed",
          variant: "destructive",
        });
      }
    },
    [],
  );

  const downloadEvidence = useCallback(
    async (input: { kind: "task" | "checklist"; id: string; uri?: string | null }) => {
      const uriValue = input.uri?.trim() ?? "";
      const isInternal = uriValue === "" || uriValue === "imported" || uriValue === "stored" || uriValue === "uploaded";
      if (!isInternal) {
        window.open(uriValue, "_blank", "noreferrer");
        return;
      }
      try {
        const downloaded =
          input.kind === "task"
            ? await apiDownloadEvidence({ evidenceId: input.id, download: true })
            : await apiDownloadChecklistEvidence({ checklistEvidenceId: input.id, download: true });
        const url = URL.createObjectURL(downloaded.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = downloaded.fileName ?? "download";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        toast({
          title: "Download failed",
          description: err instanceof Error ? err.message : "Request failed",
          variant: "destructive",
        });
      }
    },
    [],
  );

  const deleteEvidenceMutation = useMutation({
    mutationFn: async (input: { kind: "task" | "checklist"; id: string }) => {
      if (input.kind === "task") return apiDeleteEvidence({ evidenceId: input.id });
      return apiDeleteChecklistEvidence({ checklistEvidenceId: input.id });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Attachment deleted" });
      closePreview();
    },
    onError: (err: unknown) => {
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
			const results = buildChecklistResults();
      const isManagerUser = isManager();
      const trimmedReason = backdateReason.trim();
      const completedAtValue = backdateCompletedAt.trim();

      if (backdateMode) {
        if (!isManagerUser) {
          throw new Error("Only supervisors and above can backdate completion");
        }
        if (!completedAtValue) {
          throw new Error("Completion date is required when backdating");
        }
        if (!trimmedReason) {
          throw new Error("Reason is required when backdating");
        }
      }

      return apiCompleteTask({
        taskId: props.taskId,
        checklistResults: results,
        forceCompleted,
        completedAt: backdateMode ? new Date(completedAtValue).toISOString() : undefined,
        backdateReason: backdateMode ? trimmedReason : undefined,
        technicianName: backdateMode && backdateTechnicianName.trim() ? backdateTechnicianName.trim() : undefined,
      });
    },
    onSuccess: async () => {
      await taskQuery.refetch();
      toast({ title: "Task completed" });
      setBackdateMode(false);
      setBackdateCompletedAt("");
      setBackdateReason("");
      setBackdateTechnicianName("");
      if (props.onCompleted) {
        await props.onCompleted();
      }
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to complete task",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const addEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      const uri = evidenceUri.trim();
      if (!uri) throw new Error("Evidence URI is required");
      return apiAddTaskEvidence({ taskId: props.taskId, uri });
    },
    onSuccess: async () => {
      setEvidenceUri("");
      await taskQuery.refetch();
      toast({ title: "Evidence added" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Failed to add evidence",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const checklistTotal = useMemo(() => {
    const items = task?.checklistItems ?? [];
    return items.filter((i) => i.isActive).length;
  }, [task?.checklistItems]);

  const checklistCompleted = useMemo(() => {
    const items = task?.checklistItems ?? [];
    return items.filter((i) => {
      if (!i.isActive) return false;
      const draft = checklistDraft[i.id];
      return draft !== undefined && draft.outcome !== null;
    }).length;
  }, [task?.checklistItems, checklistDraft]);

  const checklistProgress = checklistTotal > 0 ? Math.round((checklistCompleted / checklistTotal) * 100) : 0;
  const checklistDefinitionLabel =
    task?.checklistDefinitionSource === "snapshot"
      ? task.checklistDefinitionCapturedAt
        ? `Checklist frozen at first submission on ${task.checklistDefinitionCapturedAt}`
        : "Checklist frozen at first submission"
      : task?.checklistDefinitionSource === "legacy-live"
        ? task.checklistDefinitionNote ?? "Historical checklist definition was not preserved for this task."
        : null;

  return (
    <>
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl h-[90vh] bg-card border border-border/60 shadow-xl flex flex-col">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold text-foreground">
                {task ? task.taskNumber : "Task"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {task ? `${task.asset.assetTag} • ${task.asset.name} • ${task.template.name}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-start lg:justify-end w-full lg:w-auto">
              <Button
                size="sm"
                variant="outline"
                disabled={!task || claimMutation.isPending || !canClaim}
                onClick={() => claimMutation.mutate()}
              >
                Claim
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!task || startMutation.isPending || !canStart}
                onClick={() => startMutation.mutate()}
              >
                Start
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!task || pauseMutation.isPending || !canPause}
                onClick={() => pauseMutation.mutate()}
              >
                Pause
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!task || resumeMutation.isPending || !canResume}
                onClick={() => resumeMutation.mutate()}
              >
                Resume
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!task || !canSaveDraft}
                onClick={() => handleSaveDraft()}
              >
                Save Draft
              </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!task}
              onClick={() => {
                setReportBreakdownSource(null);
                setReportBreakdownOpen(true);
              }}
              className="gap-2"
            >
              <Wrench className="w-4 h-4" />
              Create Work Order
            </Button>
              {canReopen ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!task || reopenMutation.isPending}
                  onClick={() => reopenMutation.mutate()}
                >
                  Reopen
                </Button>
              ) : null}
              <Button
                size="sm"
                variant="destructive"
                disabled={!task || cancelMutation.isPending || !canCancel}
                onClick={() => setCancelDialogOpen(true)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!task || completeMutation.isPending || !canComplete}
                onClick={() => completeMutation.mutate()}
              >
                Complete
              </Button>
              {task ? (
                <>
                  {canSubmitForApproval ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={submitForApprovalMutation.isPending}
                      onClick={() => submitForApprovalMutation.mutate()}
                    >
                      Submit For Approval
                    </Button>
                  ) : null}
                  {canApproveBySupervisor ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={approveBySupervisorMutation.isPending}
                      onClick={() => approveBySupervisorMutation.mutate()}
                    >
                      Approve (Supervisor)
                    </Button>
                  ) : null}
                  {canApproveBySuperadmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={approveBySuperadminMutation.isPending}
                      onClick={() => approveBySuperadminMutation.mutate()}
                    >
                      Approve (Superadmin)
                    </Button>
                  ) : null}
                  {canRejectApproval ? (
                    <Button size="sm" variant="destructive" onClick={() => setRejectDialogOpen(true)}>
                      Reject
                    </Button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="backdate-toggle"
                  checked={backdateMode}
                  onCheckedChange={(checked) => setBackdateMode(Boolean(checked))}
                  disabled={!isManager()}
                />
                <Label htmlFor="backdate-toggle" className="text-sm">
                  Backdate completion (supervisor and above only)
                </Label>
              </div>
              {backdateMode && !isManager() && (
                <span className="text-xs text-destructive">You do not have permission to backdate</span>
              )}
            </div>
				{backdateMode && (
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
				)}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="py-4 space-y-6">
            {taskQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading…</div>
            ) : taskQuery.isError ? (
              <div className="text-sm text-destructive">Failed to load task.</div>
            ) : task ? (
              <>
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-6 glass rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Due</p>
                    <p className="text-sm text-foreground mt-1">
                      {format(parseISO(task.scheduledDueAt), "yyyy-MM-dd HH:mm")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-3">Status</p>
                    <p className="text-sm text-foreground mt-1">{task.status}</p>
                    <p className="text-xs text-muted-foreground mt-3">Approval Status</p>
                    <div className="mt-1">
                      {approvalStatus === "PendingSupervisor" ? (
                        <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">Pending Supervisor</Badge>
                      ) : approvalStatus === "PendingSuperadmin" ? (
                        <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">Pending Superadmin</Badge>
                      ) : approvalStatus === "Approved" ? (
                        <Badge variant="outline" className="bg-success/20 text-success border-success/30">Approved</Badge>
                      ) : approvalStatus === "Rejected" ? (
                        <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">Rejected</Badge>
                      ) : (
                        <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-muted/60">None</Badge>
                      )}
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-6 glass rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Checklist</p>
                        <p className="text-sm text-foreground mt-1">
                          {checklistCompleted}/{checklistTotal}
                        </p>
                      </div>
                      <div className="w-40">
                        <Progress value={checklistProgress} className="h-2" />
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground mt-3">Assigned</p>
                    <p className="text-sm text-foreground mt-1">
                      {task.assignedTo.displayName ?? task.assignedTo.roleName ?? "Unassigned"}
                    </p>
                    <div className="grid grid-cols-12 gap-2 mt-3">
                      {task.maintenanceType === "PM" ? (
                        <div className="col-span-12 md:col-span-4">
                          <p className="text-xs text-muted-foreground">Active Work Time</p>
                          <p className="text-sm text-foreground mt-1">
                            {task.workSessionSummary ? formatDurationLabel(task.workSessionSummary.totalSeconds) : "0m"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {task.workSessionSummary?.activeSessionStartedAt
                              ? `Running since ${format(parseISO(task.workSessionSummary.activeSessionStartedAt), "yyyy-MM-dd HH:mm")}`
                              : `${task.workSessionSummary?.sessionCount ?? 0} sessions`}
                          </p>
                        </div>
                      ) : null}
                      <div className="col-span-12 md:col-span-4">
                        <p className="text-xs text-muted-foreground">Technician Completed</p>
                        <p className="text-sm text-foreground mt-1">
                          {task.technicianCompletedAt ? format(parseISO(task.technicianCompletedAt), "yyyy-MM-dd HH:mm") : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.technicianCompletedBy?.displayName ?? task.technicianCompletedBy?.username ?? ""}
                        </p>
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <p className="text-xs text-muted-foreground">Supervisor Approved</p>
                        <p className="text-sm text-foreground mt-1">
                          {task.supervisorApprovedAt ? format(parseISO(task.supervisorApprovedAt), "yyyy-MM-dd HH:mm") : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.supervisorApprovedBy?.displayName ?? task.supervisorApprovedBy?.username ?? ""}
                        </p>
                      </div>
                      <div className="col-span-12 md:col-span-4">
                        <p className="text-xs text-muted-foreground">Superadmin Approved</p>
                        <p className="text-sm text-foreground mt-1">
                          {task.superadminApprovedAt ? format(parseISO(task.superadminApprovedAt), "yyyy-MM-dd HH:mm") : "—"}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {task.superadminApprovedBy?.displayName ?? task.superadminApprovedBy?.username ?? ""}
                        </p>
                      </div>
                    </div>
                    {approvalStatus === "Rejected" ? (
                      <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                        <p className="text-xs text-destructive">Rejected</p>
                        <p className="text-sm text-foreground mt-1">{task.rejectionReason ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {(task.rejectedBy?.displayName ?? task.rejectedBy?.username ?? "—")} {" • "}
                          {task.rejectedAt ? format(parseISO(task.rejectedAt), "yyyy-MM-dd HH:mm") : "—"}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="glass rounded-lg p-4">
                  <p className="text-sm font-semibold text-foreground">Remarks History</p>
                  {remarksHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">No remarks yet</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {remarksHistory.map((item, index) => (
                        <div key={`${item.label}-${index}`} className="rounded-lg border border-border/60 bg-muted/30 p-3">
                          <div className="flex items-center justify-between">
                            <p className="text-xs text-muted-foreground">{item.label}</p>
                            <p className="text-xs text-muted-foreground">{item.at}</p>
                          </div>
                          {item.note ? <p className="text-sm text-foreground mt-1">{item.note}</p> : null}
                          <p className="text-xs text-muted-foreground mt-1">{item.by}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Checklist</h3>
                  {checklistDefinitionLabel ? (
                    <div className="mb-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                      <p className="text-xs text-muted-foreground">{checklistDefinitionLabel}</p>
                    </div>
                  ) : null}
                  {draftSavedAt ? (
                    <div className="mb-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground">
                        Draft last saved at {format(parseISO(draftSavedAt), "yyyy-MM-dd HH:mm")}
                      </p>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {task.checklistItems
                      .filter((i) => i.isActive)
                      .map((item) => (
                        <div key={item.id} className="glass rounded-lg p-3">
                          <div className="grid grid-cols-12 gap-3 items-start">
                            <div className="min-w-0 col-span-12 lg:col-span-8">
                              <p className="text-sm text-foreground">{item.itemText}</p>
                              <div className="flex flex-wrap items-center gap-2 mt-1">
                                {item.isMandatory ? (
                                  <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
                                    Mandatory
                                  </Badge>
                                ) : null}
                                {item.requiresPassFail ? (
                                  <Badge variant="outline" className="bg-primary/20 text-primary border-primary/30">
                                    Pass/Fail
                                  </Badge>
                                ) : null}
                                {item.requiresPassFail ? (
                                  <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">
                                    Notes on Fail
                                  </Badge>
                                ) : null}
                                {item.requiresPassFail && item.requiresNotes ? (
                                  <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">
                                    Notes on Pass
                                  </Badge>
                                ) : null}
                                {!item.requiresPassFail && item.requiresNotes ? (
                                  <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">
                                    Notes Required
                                  </Badge>
                                ) : null}
                                {item.enableAttachment && item.requiresAttachment ? (
                                  <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border">
                                    Attachment Required
                                  </Badge>
                                ) : null}
                                {item.enableAttachment && !item.requiresAttachment ? (
                                  <Badge variant="outline" className="bg-muted/50 text-muted-foreground border-border">
                                    Attachment Optional
                                  </Badge>
                                ) : null}
                              </div>
                            </div>
                            <div className="col-span-12 lg:col-span-4 lg:justify-self-end w-full lg:w-56">
                              <p className="text-xs text-muted-foreground">Outcome</p>
                              <Select
                                value={
                                  checklistDraft[item.id]?.outcome === null
                                    ? "__none__"
                                    : String(checklistDraft[item.id]?.outcome)
                                }
                                onValueChange={(v) => {
                                  const nextOutcome = v === "__none__" ? null : (Number(v) as 0 | 1 | 2);
                                  setChecklistDraft((prev) => ({
                                    ...prev,
                                    [item.id]: { outcome: nextOutcome, notes: prev[item.id]?.notes ?? "" },
                                  }));
                                }}
                              >
                                <SelectTrigger className="mt-1 bg-muted/50 w-full">
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">None</SelectItem>
                                  {getOutcomeOptions(item.requiresPassFail).map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="mt-3">
                            <p className="text-xs text-muted-foreground">Notes</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {item.requiresPassFail
                                ? item.requiresNotes
                                  ? "Fail always needs notes. Pass also needs notes for this item."
                                  : "Fail always needs notes."
                                : item.requiresNotes
                                  ? "Notes are required when this item is marked done."
                                  : "Notes are optional for this item."}
                            </p>
                              <Input
                                value={checklistDraft[item.id]?.notes ?? ""}
                                onChange={(e) => {
                                  const nextNotes = e.target.value;
                                  setChecklistDraft((prev) => ({
                                    ...prev,
                                    [item.id]: { outcome: prev[item.id]?.outcome ?? null, notes: nextNotes },
                                  }));
                                }}
                                className="mt-1 bg-muted/50"
                              />
                          </div>

                          {task.maintenanceType === "PM" &&
                          (checklistDraft[item.id]?.outcome ?? item.result?.outcome ?? null) === 2 ? (
                            <div className="mt-3 flex justify-end">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-2"
                                onClick={() => {
                                  const findingNotes = (checklistDraft[item.id]?.notes ?? "").trim();
                                  const symptomParts = [item.itemText.trim(), findingNotes].filter((value) => value.length > 0);
                                  setReportBreakdownSource({
                                    sourceTaskId: task.id,
                                    sourceTemplateChecklistItemId: item.id,
                                    initialSymptom: symptomParts.join(" - "),
                                    title: "Create Work Order From Failed Finding",
                                    submitLabel: "Create Work Order",
                                  });
                                  setReportBreakdownOpen(true);
                                }}
                              >
                                <Wrench className="w-4 h-4" />
                                Create Work Order For This Finding
                              </Button>
                            </div>
                          ) : null}

                          {item.enableAttachment ? (
                            <div className="mt-3">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs text-muted-foreground">Attachments</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={uploadChecklistEvidenceMutation.isPending}
                                  onClick={() => {
                                    setPendingChecklistItemId(item.id);
                                    checklistFileInputRef.current?.click();
                                  }}
                                >
                                  Attach file
                                </Button>
                              </div>

                              {item.evidence.length === 0 ? (
                                <div className="text-xs text-muted-foreground mt-2">No attachments.</div>
                              ) : (
                                <div className="space-y-2 mt-2">
                                  {item.evidence.map((e) => (
                                    <div
                                      key={e.id}
                                      className="rounded-md border border-border bg-muted/30 p-2 flex items-center justify-between gap-3"
                                    >
                                      <div className="min-w-0">
                                        <div className="text-xs text-foreground truncate">{e.fileName ?? e.uri}</div>
                                        <div className="text-[11px] text-muted-foreground truncate">
                                          {e.uploadedBy?.displayName ?? e.uploadedBy?.username ?? ""}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 shrink-0">
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() =>
                                            openEvidencePreview({
                                              kind: "checklist",
                                              id: e.id,
                                              uri: e.uri,
                                              fileName: e.fileName,
                                              contentType: e.contentType,
                                            })
                                          }
                                        >
                                          View
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => downloadEvidence({ kind: "checklist", id: e.id, uri: e.uri })}
                                        >
                                          Download
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={replaceEvidenceMutation.isPending}
                                          onClick={() => {
                                            setPendingReplace({
                                              kind: "checklist",
                                              evidenceId: e.id,
                                              templateChecklistItemId: e.templateChecklistItemId,
                                            });
                                            replaceFileInputRef.current?.click();
                                          }}
                                        >
                                          Replace
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="destructive"
                                          disabled={deleteEvidenceMutation.isPending}
                                          onClick={() =>
                                            deleteEvidenceMutation.mutate({ kind: "checklist", id: e.id })
                                          }
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      ))}
                  </div>

                  <div className="mt-4 flex items-center gap-2">
                    <Checkbox checked={forceCompleted} onCheckedChange={(v) => setForceCompleted(v === true)} />
                    <span className="text-sm text-muted-foreground">Force complete</span>
                  </div>
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
                  {task.evidence.length === 0 ? (
                    <div className="text-sm text-muted-foreground">No evidence uploaded.</div>
                  ) : (
                    <div className="space-y-2">
                      {task.evidence.map((e) => (
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
                                  kind: "task",
                                  id: e.id,
                                  uri: e.uri,
                                  fileName: e.fileName,
                                  contentType: e.contentType,
                                })
                              }
                            >
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => downloadEvidence({ kind: "task", id: e.id, uri: e.uri })}
                            >
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={replaceEvidenceMutation.isPending}
                              onClick={() => {
                                setPendingReplace({ kind: "task", evidenceId: e.id });
                                replaceFileInputRef.current?.click();
                              }}
                            >
                              Replace
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={deleteEvidenceMutation.isPending}
                              onClick={() => deleteEvidenceMutation.mutate({ kind: "task", id: e.id })}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 glass rounded-lg p-4">
                    <p className="text-xs text-muted-foreground">Workflow</p>
                    <div className="mt-2 flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Submitted by</span>
                        <span className="text-sm text-foreground">{submittedByName ?? "—"}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Reviewed by</span>
                        <span className="text-sm text-foreground">{reviewedByName ?? "—"}</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Approved by</span>
                        <span className="text-sm text-foreground">{approvedByName ?? "—"}</span>
                        {approvedByName ? (
                          <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">Superadmin</Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <Dialog open={previewOpen} onOpenChange={(o) => (o ? setPreviewOpen(true) : closePreview())}>
                  <DialogContent className="max-w-4xl">
                    <DialogHeader>
                      <DialogTitle className="truncate">
                        {previewFileName ?? (previewKind === "task" ? "Evidence" : "Checklist attachment")}
                      </DialogTitle>
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
                          deleteEvidenceMutation.mutate({ kind: previewKind, id: previewId });
                        }}
                        disabled={!previewId || deleteEvidenceMutation.isPending}
                      >
                        Delete
                      </Button>
                      <Button
                        onClick={() => {
                          if (!previewId) return;
                          void downloadEvidence({ kind: previewKind, id: previewId });
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
                <input
                  ref={checklistFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    const targetItemId = pendingChecklistItemId;
                    e.target.value = "";
                    setPendingChecklistItemId(null);
                    if (!file || !targetItemId) return;
                    uploadChecklistEvidenceMutation.mutate({ templateChecklistItemId: targetItemId, file });
                  }}
                />
                <input
                  ref={replaceFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    const target = pendingReplace;
                    e.target.value = "";
                    setPendingReplace(null);
                    if (!file || !target) return;
                    replaceEvidenceMutation.mutate({
                      kind: target.kind,
                      evidenceId: target.evidenceId,
                      file,
                      templateChecklistItemId: target.templateChecklistItemId,
                    });
                  }}
                />
              </>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
    <Dialog
      open={cancelDialogOpen}
      onOpenChange={(open) => {
        setCancelDialogOpen(open);
        if (!open) {
          setCancelReason("");
          setCancelTouched(false);
        }
      }}
    >
      <DialogContent className="max-w-lg p-0 overflow-hidden">
        <div className="px-6 py-4 bg-muted/40 border-b border-border/60">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Cancel Task</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground mt-1">
            Provide a reason for cancellation.
          </p>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="space-y-2">
            <Label>Reason <span className="text-destructive">*</span></Label>
            <Input
              value={cancelReason}
              onChange={(e) => {
                setCancelReason(e.target.value);
                if (!cancelTouched) setCancelTouched(true);
              }}
              onBlur={() => setCancelTouched(true)}
              className={cancelReasonError ? "border-destructive focus-visible:ring-destructive" : "bg-muted/30"}
            />
            {cancelReasonError ? (
              <p className="text-xs text-destructive">Reason is required.</p>
            ) : null}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelDialogOpen(false)}>Close</Button>
            <Button
              variant="destructive"
              disabled={cancelMutation.isPending || cancelReason.trim().length === 0}
              onClick={() => cancelMutation.mutate()}
              className="shadow-sm"
            >
              Confirm Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject Approval</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reason</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-1" />
          </div>
          <p className="text-xs text-muted-foreground">
            Reject creates a new linked replacement PM task. The current submitted task stays rejected for history.
          </p>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectApprovalMutation.isPending || rejectReason.trim().length === 0}
              onClick={() => rejectApprovalMutation.mutate()}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ReportBreakdownDialog
      open={reportBreakdownOpen}
      onOpenChange={(open) => {
        setReportBreakdownOpen(open);
        if (!open) setReportBreakdownSource(null);
      }}
      assetId={task && !task.facility ? task.asset.id : undefined}
      facilityId={task?.facility?.id ?? undefined}
      templateId={task?.template.id}
      sourceTaskId={reportBreakdownSource?.sourceTaskId}
      sourceTemplateChecklistItemId={reportBreakdownSource?.sourceTemplateChecklistItemId}
      initialSymptom={reportBreakdownSource?.initialSymptom}
      title={reportBreakdownSource?.title}
      submitLabel={reportBreakdownSource?.submitLabel}
    />
  </>);
};

export default Tasks;
