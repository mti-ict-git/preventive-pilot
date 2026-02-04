import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { endOfDay, format, isAfter, isBefore, isSameDay, parseISO, startOfDay } from "date-fns";
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
	apiGetLookups,
	apiListAssignableUsers,
	ApiError,
	apiGetTask,
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
	apiReviseTaskApproval,
	apiUploadTaskChecklistEvidenceFile,
	apiUploadTaskEvidenceFile,
	type CompleteTaskChecklistResultInput,
	type TaskListItem,
	type LookupRole,
	type UserSummary,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { isManager, isSuperadmin, hasRole } from "@/lib/auth";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ReportBreakdownDialog } from "@/components/workorders/ReportBreakdownDialog";

type SortMode = "due_asc" | "due_desc" | "created_desc" | "completed_desc";

const Tasks = () => {
	const [searchQuery, setSearchQuery] = useState("");
	const [activeTab, setActiveTab] = useState("all");
	const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
	const [taskDetailOpen, setTaskDetailOpen] = useState(false);
	const navigate = useNavigate();
	const [searchParams] = useSearchParams();
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [assignedFilter, setAssignedFilter] = useState<
		"any" | "assigned" | "me" | "unassigned"
	>("any");
	const [approvedOnlyFilter, setApprovedOnlyFilter] = useState(false);
	const [dueFromFilter, setDueFromFilter] = useState<string>("");
	const [dueToFilter, setDueToFilter] = useState<string>("");
	const [statusFilter, setStatusFilter] = useState<
		"all" | "upcoming" | "in_progress" | "due_today" | "overdue" | "completed" | "cancelled"
	>("all");
	const [sortMode, setSortMode] = useState<SortMode>("due_asc");

	const queryClient = useQueryClient();

	useEffect(() => {
		const tid = searchParams.get("taskId");
		if (tid) {
			setSelectedTaskId(tid);
			setTaskDetailOpen(true);
		}
	}, [searchParams]);

	const listQueryInput: Parameters<typeof apiListTasks>[0] = useMemo(() => {
		const now = new Date();
		let input: Parameters<typeof apiListTasks>[0] = { maintenanceType: "PM", page: 1, pageSize: 100 };

		if (activeTab === "overdue") {
			input = { ...input, overdue: true };
		} else if (activeTab === "in_progress") {
			input = { ...input, status: "in_progress" };
		} else if (activeTab === "due_today") {
			input = {
				...input,
				dueFrom: startOfDay(now).toISOString(),
				dueTo: endOfDay(now).toISOString(),
			};
		} else if (activeTab === "upcoming") {
			input = { ...input, dueFrom: now.toISOString() };
		} else if (activeTab === "cancelled") {
			input = { ...input, status: "cancelled" };
		}

		if (assignedFilter === "me" || assignedFilter === "unassigned") {
			input = { ...input, assigned: assignedFilter };
		}

		if (approvedOnlyFilter) {
			input = { ...input, approvedOnly: true };
		}

		if (dueFromFilter.trim()) {
			const from = startOfDay(new Date(dueFromFilter));
			input = { ...input, dueFrom: from.toISOString() };
		}

		if (dueToFilter.trim()) {
			const to = endOfDay(new Date(dueToFilter));
			input = { ...input, dueTo: to.toISOString() };
		}

		return input;
	}, [activeTab, assignedFilter, approvedOnlyFilter, dueFromFilter, dueToFilter]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", listQueryInput],
    queryFn: () => apiListTasks(listQueryInput),
  });

  const statsQuery = useQuery({
    queryKey: ["task-stats"],
    queryFn: () => apiListTasks({ maintenanceType: "PM", page: 1, pageSize: 200 }),
    staleTime: 30_000,
  });

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignTaskId, setAssignTaskId] = useState<string | null>(null);
  const [assignMode, setAssignMode] = useState<"user" | "role" | "unassigned">("user");
  const [assignUserId, setAssignUserId] = useState<string>("");
  const [assignRoleId, setAssignRoleId] = useState<string>("");

  type SortKey = "due_date_asc" | "due_date_desc" | "created_desc" | "created_asc";
  const [sortKey, setSortKey] = useState<SortKey>("due_date_asc");

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    enabled: assignDialogOpen,
  });

  const usersQuery = useQuery({
		queryKey: ["users-for-assignment", { page: 1, pageSize: 500, isActive: true }],
		queryFn: () => apiListAssignableUsers({ page: 1, pageSize: 500, isActive: true }),
    enabled: assignDialogOpen,
  });

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

  type UiStatus = "upcoming" | "in_progress" | "due_today" | "overdue" | "completed" | "cancelled";

  const getUiStatus = (task: TaskListItem, now: Date): UiStatus => {
    const due = parseISO(task.scheduledDueAt);
    const status = task.status.toLowerCase();
    if (status === "cancelled") return "cancelled";
    if (status === "completed") return "completed";
    if (status === "in_progress") return "in_progress";
    if (isBefore(due, now)) return "overdue";
    if (isSameDay(due, now)) return "due_today";
    if (isAfter(due, now)) return "upcoming";
    return "upcoming";
  };

  const getStatusConfig = (status: UiStatus) => {
    const config = {
      upcoming: { label: "Upcoming", color: "bg-accent/20 text-accent border-accent/30", icon: Clock },
      in_progress: {
        label: "In Progress",
        color: "bg-primary/20 text-primary border-primary/30",
        icon: ClipboardList,
      },
      due_today: { label: "Due Today", color: "bg-warning/20 text-warning border-warning/30", icon: AlertTriangle },
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

  const statItems = useMemo(() => {
    const now = new Date();
    const items = statsQuery.data?.items ?? [];
    const total = items.length;
    const dueTodayCount = items.filter((t) => {
      const status = t.status.toLowerCase();
      if (status === "completed" || status === "cancelled") return false;
      return isSameDay(parseISO(t.scheduledDueAt), now);
    }).length;
    const overdueCount = items.filter((t) => {
      const status = t.status.toLowerCase();
      if (status === "completed" || status === "cancelled") return false;
      return isBefore(parseISO(t.scheduledDueAt), now);
    }).length;
    const completedCount = items.filter((t) => t.status.toLowerCase() === "completed").length;
    return [
      { label: "Total Tasks", value: total, color: "primary" },
      { label: "Due Today", value: dueTodayCount, color: "warning" },
      { label: "Overdue", value: overdueCount, color: "destructive" },
      { label: "Completed", value: completedCount, color: "success" },
    ];
  }, [statsQuery.data?.items]);

	const filteredTasks = useMemo(() => {
		const now = new Date();
		const items = (tasksQuery.data?.items ?? []).filter((task) => {
			const status = task.status.toLowerCase();
			if (activeTab === "due_today" && status === "cancelled") {
				return false;
			}
			if (activeTab === "pending_supervisor") {
				return (task.approvalStatus ?? "None") === "PendingSupervisor";
			}
			if (activeTab === "pending_superadmin") {
				return (task.approvalStatus ?? "None") === "PendingSuperadmin";
			}
			return true;
		});
		const q = searchQuery.trim().toLowerCase();
		return items
			.map((task) => {
				const uiStatus = getUiStatus(task, now);
				const pic = task.assignedTo.displayName ?? task.assignedTo.roleName ?? "Unassigned";
				const dueDate = format(parseISO(task.scheduledDueAt), "yyyy-MM-dd");
				const assetTag = task.asset.assetTag ?? (task.facility ? task.facility.name ?? "" : "");
				const assetName = task.asset.name ?? (task.facility ? task.facility.locationName ?? task.facility.name ?? "" : "");
				const progress =
					uiStatus === "completed"
						? 100
						: task.checklistTotal > 0
							? Math.round((task.checklistCompleted / task.checklistTotal) * 100)
							: uiStatus === "in_progress"
								? 50
								: 0;
				const isAssigned = Boolean(task.assignedTo.userId || task.assignedTo.roleId);
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
					approvalStatus: task.approvalStatus ?? "None",
				};
			})
			.filter((task) => {
				if (statusFilter !== "all" && task.status !== statusFilter) {
					return false;
				}
				if (assignedFilter === "assigned" && !task.isAssigned) {
					return false;
				}
				if (!q) {
					return true;
				}
				return (
					task.displayId.toLowerCase().includes(q) ||
					task.asset.toLowerCase().includes(q) ||
					task.assetName.toLowerCase().includes(q)
				);
			});
	}, [searchQuery, tasksQuery.data?.items, activeTab, statusFilter, assignedFilter]);

  return (
    <div className="min-h-screen">
      <Header title="PM Tasks" subtitle="Track and execute maintenance tasks" />

      <div className="p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statItems.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="stat-card"
            >
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <p className={`text-3xl font-bold text-${stat.color}`}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by task ID, asset..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50"
            />
          </div>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => navigate("/scheduling")}
          >
            <Calendar className="w-4 h-4" />
            Calendar View
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-muted/50 p-1">
            <TabsTrigger value="all">All Tasks</TabsTrigger>
            <TabsTrigger value="due_today">Due Today</TabsTrigger>
            <TabsTrigger value="overdue">Overdue</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
            <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            <TabsTrigger value="pending_supervisor">Pending Supervisor</TabsTrigger>
            <TabsTrigger value="pending_superadmin">Pending Superadmin</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            {tasksQuery.isLoading ? (
              <div className="text-sm text-muted-foreground p-4">Loading tasks…</div>
            ) : tasksQuery.isError ? (
              <div className="text-sm text-destructive p-4">Failed to load tasks.</div>
            ) : (
              <div className="space-y-3">
                {filteredTasks.map((task, index) => {
                  const statusConfig = getStatusConfig(task.status);
                  return (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="glass rounded-xl p-5 hover:border-primary/50 transition-all duration-300 cursor-pointer group"
                      onClick={() => {
                        setSelectedTaskId(task.taskId);
                        setTaskDetailOpen(true);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                            <Server className="w-6 h-6 text-muted-foreground" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono text-sm text-muted-foreground">{task.displayId}</span>
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
                              {task.assetName} • {task.template}
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>

                      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">{task.pic}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Due: {task.dueDate}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 min-w-48">
                          <Progress value={task.progress} className="h-2" />
                          <span className="text-sm text-muted-foreground whitespace-nowrap">
                            {task.checklistComplete}/{task.checklistTotal}
                          </span>
                          {isManager() ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                openAssignDialogFor(task.taskId);
                              }}
                            >
                              {task.isAssigned ? "Reassign" : "Assign"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </TabsContent>
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
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6 space-y-2">
                <Label>Assigned</Label>
                <Select
                  value={assignedFilter}
                  onValueChange={(value) => {
						if (
							value === "any" ||
							value === "assigned" ||
							value === "me" ||
							value === "unassigned"
						) {
                      setAssignedFilter(value);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Assigned" />
                  </SelectTrigger>
                  <SelectContent>
						<SelectItem value="any">All (assigned + unassigned)</SelectItem>
						<SelectItem value="assigned">Assigned (any assignee)</SelectItem>
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
                <Label>Due from</Label>
                <Input
                  type="date"
                  value={dueFromFilter}
                  onChange={(event) => setDueFromFilter(event.target.value)}
                />
              </div>
              <div className="col-span-12 md:col-span-6 space-y-2">
                <Label>Due to</Label>
                <Input
                  type="date"
                  value={dueToFilter}
                  onChange={(event) => setDueToFilter(event.target.value)}
                />
              </div>
					<div className="col-span-12 md:col-span-6 space-y-2">
						<Label>Status</Label>
						<Select
							value={statusFilter}
							onValueChange={(value) => {
								if (
									value === "all" ||
									value === "upcoming" ||
									value === "in_progress" ||
									value === "due_today" ||
									value === "overdue" ||
									value === "completed" ||
									value === "cancelled"
								) {
									setStatusFilter(value);
								}
							}}
						>
							<SelectTrigger>
								<SelectValue placeholder="Status" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">All</SelectItem>
								<SelectItem value="upcoming">Upcoming</SelectItem>
								<SelectItem value="in_progress">In Progress</SelectItem>
								<SelectItem value="due_today">Due Today</SelectItem>
								<SelectItem value="overdue">Overdue</SelectItem>
								<SelectItem value="completed">Completed</SelectItem>
								<SelectItem value="cancelled">Cancelled</SelectItem>
							</SelectContent>
						</Select>
					</div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setAssignedFilter("any");
                  setApprovedOnlyFilter(false);
                  setDueFromFilter("");
                  setDueToFilter("");
							setStatusFilter("all");
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
  const taskQuery = useQuery({
    queryKey: ["task", props.taskId],
    queryFn: () => apiGetTask(props.taskId ?? ""),
    enabled: props.open && !!props.taskId,
  });

	const [backdateMode, setBackdateMode] = useState(false);
	const [backdateCompletedAt, setBackdateCompletedAt] = useState("");
	const [backdateReason, setBackdateReason] = useState("");
	const [backdateTechnicianName, setBackdateTechnicianName] = useState("");

	const usersQueryForBackdate = useQuery({
		queryKey: ["users-for-backdate", { page: 1, pageSize: 500, isActive: true }],
		queryFn: () => apiListAssignableUsers({ page: 1, pageSize: 500, isActive: true }),
		enabled: backdateMode,
	});

	const technicianOptionsForBackdate = useMemo(() => {
		const users = usersQueryForBackdate.data?.items ?? [];
		return users
			.filter((u) => u.roles.includes("Technician"))
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

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiCancelTask(props.taskId);
    },
    onSuccess: async () => {
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

  const submitForApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiSubmitTaskForApproval(props.taskId);
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
  const [rejectReopen, setRejectReopen] = useState(false);
  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [reviseReason, setReviseReason] = useState("");

  const rejectApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) throw new Error("No task selected");
      return apiRejectTaskApproval({ taskId: props.taskId, reason: rejectReason.trim() ? rejectReason.trim() : null, reopenTask: rejectReopen });
    },
    onSuccess: async () => {
      setRejectDialogOpen(false);
      setRejectReason("");
      setRejectReopen(false);
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

  const reviseApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!props.taskId) {
        throw new Error("No task selected");
      }
      return apiReviseTaskApproval({
        taskId: props.taskId,
        reason: reviseReason.trim() ? reviseReason.trim() : null,
        reopenTask: false,
      });
    },
    onSuccess: async () => {
      setReviseDialogOpen(false);
      setReviseReason("");
      await taskQuery.refetch();
      toast({ title: "Sent for revision" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Revise failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

	const normalizedStatus = task?.status.toLowerCase() ?? null;
  const canStart = normalizedStatus === "open" || normalizedStatus === "scheduled";
  const canPause = normalizedStatus === "in_progress";
  const canResume = normalizedStatus === "paused";
  const canCancel = normalizedStatus !== null && normalizedStatus !== "completed" && normalizedStatus !== "cancelled";
  const canComplete = normalizedStatus !== null && normalizedStatus !== "completed" && normalizedStatus !== "cancelled";
  const canReopen = normalizedStatus === "cancelled" && isManager();

  const approvalStatus = task?.approvalStatus ?? "None";
  const canSubmitForApproval =
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
  const canReviseApproval =
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
    setChecklistDraft(next);
    setEvidenceUri("");
    closePreview();
    setPendingChecklistItemId(null);
		setBackdateMode(false);
		setBackdateCompletedAt("");
		setBackdateReason("");
		setBackdateTechnicianName("");
  }, [props.open, task?.id]);

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
    },
    [],
  );

  const downloadEvidence = useCallback(
    async (input: { kind: "task" | "checklist"; id: string }) => {
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
        const notesRequired = item.requiresNotes || item.isMandatory;
        if (notesRequired && outcome !== 0 && notesValue.trim().length === 0) {
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

  return (
    <>
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="w-[95vw] max-w-5xl h-[90vh] glass border-border flex flex-col">
        <DialogHeader className="pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="text-xl font-bold text-foreground">
                {task ? task.taskNumber : "Task"}
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {task ? `${task.asset.assetTag} • ${task.asset.name} • ${task.template.name}` : ""}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Button
                variant="outline"
                disabled={!task || startMutation.isPending || !canStart}
                onClick={() => startMutation.mutate()}
              >
                Start
              </Button>
              <Button
                variant="outline"
                disabled={!task || pauseMutation.isPending || !canPause}
                onClick={() => pauseMutation.mutate()}
              >
                Pause
              </Button>
              <Button
                variant="outline"
                disabled={!task || resumeMutation.isPending || !canResume}
                onClick={() => resumeMutation.mutate()}
              >
                Resume
              </Button>
            <Button
              variant="outline"
              disabled={!task}
              onClick={() => setReportBreakdownOpen(true)}
              className="gap-2"
            >
              <Wrench className="w-4 h-4" />
              Create Work Order
            </Button>
              {canReopen ? (
                <Button
                  variant="outline"
                  disabled={!task || reopenMutation.isPending}
                  onClick={() => reopenMutation.mutate()}
                >
                  Reopen
                </Button>
              ) : null}
              <Button
                variant="destructive"
                disabled={!task || cancelMutation.isPending || !canCancel}
                onClick={() => cancelMutation.mutate()}
              >
                Cancel
              </Button>
              <Button
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
                      variant="outline"
                      disabled={submitForApprovalMutation.isPending}
                      onClick={() => submitForApprovalMutation.mutate()}
                    >
                      Submit For Approval
                    </Button>
                  ) : null}
                  {canApproveBySupervisor ? (
                    <Button
                      variant="outline"
                      disabled={approveBySupervisorMutation.isPending}
                      onClick={() => approveBySupervisorMutation.mutate()}
                    >
                      Approve (Supervisor)
                    </Button>
                  ) : null}
                  {canApproveBySuperadmin ? (
                    <Button
                      variant="outline"
                      disabled={approveBySuperadminMutation.isPending}
                      onClick={() => approveBySuperadminMutation.mutate()}
                    >
                      Approve (Superadmin)
                    </Button>
                  ) : null}
                  {canRejectApproval ? (
                    <Button variant="destructive" onClick={() => setRejectDialogOpen(true)}>
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

                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Checklist</h3>
                  <div className="space-y-2">
                    {task.checklistItems
                      .filter((i) => i.isActive)
                      .map((item) => (
                        <div key={item.id} className="glass rounded-lg p-3">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm text-foreground">{item.itemText}</p>
                              <div className="flex items-center gap-3 mt-1">
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
                                {item.requiresNotes ? (
                                  <Badge variant="outline" className="bg-accent/20 text-accent border-accent/30">
                                    Notes
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
                            <div className="w-48">
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
                                <SelectTrigger className="mt-1 bg-muted/50">
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
                                          onClick={() => downloadEvidence({ kind: "checklist", id: e.id })}
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
                              onClick={() => downloadEvidence({ kind: "task", id: e.id })}
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
    <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reject Approval</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Reason (optional)</Label>
            <Input value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} className="mt-1" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="reject-reopen" checked={rejectReopen} onCheckedChange={(v) => setRejectReopen(v === true)} />
            <Label htmlFor="reject-reopen">Reopen task</Label>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={rejectApprovalMutation.isPending}
              onClick={() => rejectApprovalMutation.mutate()}
            >
              Confirm Reject
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog open={reviseDialogOpen} onOpenChange={setReviseDialogOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send for revision</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Instructions (optional)</Label>
            <Input value={reviseReason} onChange={(e) => setReviseReason(e.target.value)} className="mt-1" />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setReviseDialogOpen(false)}>Cancel</Button>
            <Button
              disabled={reviseApprovalMutation.isPending}
              onClick={() => reviseApprovalMutation.mutate()}
            >
              Confirm Revise
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ReportBreakdownDialog
      open={reportBreakdownOpen}
      onOpenChange={setReportBreakdownOpen}
      assetId={task && !task.facility ? task.asset.id : undefined}
      facilityId={task?.facility?.id ?? undefined}
      templateId={task?.template.id}
    />
  </>);
};

export default Tasks;
