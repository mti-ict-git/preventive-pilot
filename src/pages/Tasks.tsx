import { useMemo, useState } from "react";
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
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { endOfDay, format, isAfter, isBefore, isSameDay, parseISO, startOfDay } from "date-fns";
import { apiGetTask, apiListTasks, apiStartTask, type TaskDetail, type TaskListItem } from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const Tasks = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);

  const queryClient = useQueryClient();

  const listQueryInput = useMemo(() => {
    const now = new Date();
    if (activeTab === "overdue") {
      return { overdue: true, page: 1, pageSize: 100 };
    }

    if (activeTab === "in_progress") {
      return { status: "in_progress", page: 1, pageSize: 100 };
    }

    if (activeTab === "due_today") {
      return {
        dueFrom: startOfDay(now).toISOString(),
        dueTo: endOfDay(now).toISOString(),
        page: 1,
        pageSize: 100,
      };
    }

    if (activeTab === "upcoming") {
      return { dueFrom: now.toISOString(), page: 1, pageSize: 100 };
    }

    return { page: 1, pageSize: 100 };
  }, [activeTab]);

  const tasksQuery = useQuery({
    queryKey: ["tasks", listQueryInput],
    queryFn: () => apiListTasks(listQueryInput),
  });

  const statsQuery = useQuery({
    queryKey: ["task-stats"],
    queryFn: () => apiListTasks({ page: 1, pageSize: 200 }),
    staleTime: 30_000,
  });

  type UiStatus = "upcoming" | "in_progress" | "due_today" | "overdue" | "completed";

  const getUiStatus = (task: TaskListItem, now: Date): UiStatus => {
    const due = parseISO(task.scheduledDueAt);
    const status = task.status.toLowerCase();
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
      in_progress: { label: "In Progress", color: "bg-primary/20 text-primary border-primary/30", icon: ClipboardList },
      due_today: { label: "Due Today", color: "bg-warning/20 text-warning border-warning/30", icon: AlertTriangle },
      overdue: { label: "Overdue", color: "bg-destructive/20 text-destructive border-destructive/30", icon: AlertTriangle },
      completed: { label: "Completed", color: "bg-success/20 text-success border-success/30", icon: CheckCircle },
    };
    return config[status];
  };

  const statItems = useMemo(() => {
    const now = new Date();
    const items = statsQuery.data?.items ?? [];
    const total = items.length;
    const dueTodayCount = items.filter((t) => {
      const status = t.status.toLowerCase();
      return isSameDay(parseISO(t.scheduledDueAt), now) && status !== "completed";
    }).length;
    const overdueCount = items.filter((t) => {
      const status = t.status.toLowerCase();
      return isBefore(parseISO(t.scheduledDueAt), now) && status !== "completed";
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
    const items = tasksQuery.data?.items ?? [];
    const q = searchQuery.trim().toLowerCase();
    return items
      .map((task) => {
        const uiStatus = getUiStatus(task, now);
        const pic = task.assignedTo.displayName ?? task.assignedTo.roleName ?? "Unassigned";
        const dueDate = format(parseISO(task.scheduledDueAt), "yyyy-MM-dd");
        const progress =
          uiStatus === "completed"
            ? 100
            : task.checklistTotal > 0
              ? Math.round((task.checklistCompleted / task.checklistTotal) * 100)
              : uiStatus === "in_progress"
                ? 50
                : 0;
        return {
          id: task.taskNumber,
          taskId: task.id,
          asset: task.asset.assetTag,
          assetName: task.asset.name,
          template: task.template.name,
          status: uiStatus,
          priority: task.priority,
          dueDate,
          pic,
          progress,
          checklistComplete: task.checklistCompleted,
          checklistTotal: task.checklistTotal,
        };
      })
      .filter((task) => {
        if (!q) return true;
        return (
          task.id.toLowerCase().includes(q) ||
          task.asset.toLowerCase().includes(q) ||
          task.assetName.toLowerCase().includes(q)
        );
      });
  }, [searchQuery, tasksQuery.data?.items]);

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
          <Button variant="outline" className="gap-2">
            <Filter className="w-4 h-4" />
            Filters
          </Button>
          <Button variant="outline" className="gap-2">
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
                              <span className="font-mono text-sm text-muted-foreground">{task.id}</span>
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
        }}
        taskId={selectedTaskId}
        onStarted={async () => {
          await queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
    </div>
  );
};

const TaskDetailDialog = (props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: string | null;
  onStarted: () => Promise<void>;
}) => {
  const taskQuery = useQuery({
    queryKey: ["task", props.taskId],
    queryFn: () => apiGetTask(props.taskId ?? ""),
    enabled: props.open && !!props.taskId,
  });

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

  const task = taskQuery.data;

  const checklistTotal = useMemo(() => {
    const items = task?.checklistItems ?? [];
    return items.filter((i) => i.isActive).length;
  }, [task?.checklistItems]);

  const checklistCompleted = useMemo(() => {
    const items = task?.checklistItems ?? [];
    return items.filter((i) => i.isActive && i.result !== null).length;
  }, [task?.checklistItems]);

  const checklistProgress = checklistTotal > 0 ? Math.round((checklistCompleted / checklistTotal) * 100) : 0;

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden glass border-border">
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

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={!task || startMutation.isPending || task.status.toLowerCase() !== "scheduled"}
                onClick={() => startMutation.mutate()}
              >
                Start
              </Button>
              <Button variant="outline" disabled>
                Complete
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
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
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">Outcome</p>
                              <p className="text-sm text-foreground mt-1">
                                {item.result ? String(item.result.outcome) : "—"}
                              </p>
                            </div>
                          </div>
                          {item.result?.notes ? (
                            <div className="mt-3 text-sm text-muted-foreground">{item.result.notes}</div>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Evidence</h3>
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
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Uploaded</p>
                            <p className="text-sm text-foreground mt-1">
                              {format(parseISO(e.uploadedAt), "yyyy-MM-dd HH:mm")}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default Tasks;
