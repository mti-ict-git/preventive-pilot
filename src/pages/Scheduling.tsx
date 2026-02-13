import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  apiListAssignmentRules,
  apiListBlackoutWindows,
  apiGetSchedulingCalendar,
  apiGetSchedulingDayEvents,
  apiRecalculateSchedules,
  apiBulkAssignUnassignedTasks,
  apiCreateAssignmentRule,
  apiDeactivateAssignmentRule,
  apiGetLookups,
  apiListUsers,
  apiUpdateAssignmentRule,
  ApiError,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { isManager, isSuperadmin } from "@/lib/auth";

const DAILY_CAPACITY_MINUTES = 480;

type CapacityState = "ok" | "near" | "over";

const evaluateCapacity = (estimatedMinutes: number, thresholdMinutes: number): { utilization: number; state: CapacityState } => {
  if (thresholdMinutes <= 0) {
    return { utilization: 0, state: "ok" };
  }

  const utilization = estimatedMinutes / thresholdMinutes;

  if (!Number.isFinite(utilization) || utilization <= 0) {
    return { utilization: 0, state: "ok" };
  }

  if (utilization >= 1) {
    return { utilization, state: "over" };
  }

  if (utilization >= 0.8) {
    return { utilization, state: "near" };
  }

  return { utilization, state: "ok" };
};

const Scheduling = () => {
  const [currentMonth, setCurrentMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const queryClient = useQueryClient();

  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [rulePriority, setRulePriority] = useState<number>(0);
  const [ruleCategoryId, setRuleCategoryId] = useState<string>("");
  const [ruleLocationId, setRuleLocationId] = useState<string>("");
  const [ruleAssetStatus, setRuleAssetStatus] = useState<string>("");
  const [ruleAssignTarget, setRuleAssignTarget] = useState<"unassigned" | "user" | "role">("unassigned");
  const [ruleAssignToUserId, setRuleAssignToUserId] = useState<string>("");
  const [ruleAssignToRoleId, setRuleAssignToRoleId] = useState<string>("");
  const [ruleIsActive, setRuleIsActive] = useState<boolean>(true);
  const [ruleEffectiveFrom, setRuleEffectiveFrom] = useState<string>("");
  const [ruleEffectiveTo, setRuleEffectiveTo] = useState<string>("");

  const [bulkAssignTarget, setBulkAssignTarget] = useState<"user" | "role">("role");
  const [bulkAssignedToUserId, setBulkAssignedToUserId] = useState<string>("");
  const [bulkAssignedToRoleId, setBulkAssignedToRoleId] = useState<string>("");
  const [bulkDueFrom, setBulkDueFrom] = useState<string>("");
  const [bulkDueTo, setBulkDueTo] = useState<string>("");

  const rulesQuery = useQuery({
    queryKey: ["assignment-rules"],
    queryFn: apiListAssignmentRules,
  });

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    staleTime: 5 * 60_000,
  });

  const usersQuery = useQuery({
    queryKey: ["users", "assignment"],
    queryFn: () => apiListUsers({ page: 1, pageSize: 200, isActive: true }),
    enabled: ruleDialogOpen || bulkAssignTarget === "user",
  });

  const blackoutQuery = useQuery({
    queryKey: ["blackout-windows"],
    queryFn: apiListBlackoutWindows,
  });

  const recalcMutation = useMutation({
    mutationFn: async () => apiRecalculateSchedules({}),
    onSuccess: async () => {
      toast({ title: "Recalculation started", description: "Schedules recalculated." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["scheduling", "calendar"] }),
        queryClient.invalidateQueries({ queryKey: ["scheduling", "day"] }),
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to recalculate schedules";
      toast({ title: "Action failed", description: message, variant: "destructive" });
    },
  });

  const recalcForceMutation = useMutation({
    mutationFn: async () => apiRecalculateSchedules({ force: true }),
    onSuccess: async () => {
      toast({ title: "Forced recalculation", description: "Stored Next PM ignored and recomputed." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["scheduling", "calendar"] }),
        queryClient.invalidateQueries({ queryKey: ["scheduling", "day"] }),
        queryClient.invalidateQueries({ queryKey: ["assets"] }),
      ]);
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to force recalculate schedules";
      toast({ title: "Action failed", description: message, variant: "destructive" });
    },
  });

  const createRuleMutation = useMutation({
    mutationFn: apiCreateAssignmentRule,
    onSuccess: async () => {
      toast({ title: "Rule created" });
      setRuleDialogOpen(false);
      setEditingRuleId(null);
      await queryClient.invalidateQueries({ queryKey: ["assignment-rules"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to create rule";
      toast({ title: "Create failed", description: message, variant: "destructive" });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async (input: { ruleId: string; data: Parameters<typeof apiUpdateAssignmentRule>[0]["data"] }) => {
      return apiUpdateAssignmentRule({ ruleId: input.ruleId, data: input.data });
    },
    onSuccess: async () => {
      toast({ title: "Rule updated" });
      setRuleDialogOpen(false);
      setEditingRuleId(null);
      await queryClient.invalidateQueries({ queryKey: ["assignment-rules"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to update rule";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  const deactivateRuleMutation = useMutation({
    mutationFn: apiDeactivateAssignmentRule,
    onSuccess: async () => {
      toast({ title: "Rule deactivated" });
      setRuleDialogOpen(false);
      setEditingRuleId(null);
      await queryClient.invalidateQueries({ queryKey: ["assignment-rules"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to deactivate rule";
      toast({ title: "Deactivate failed", description: message, variant: "destructive" });
    },
  });

  const bulkAssignMutation = useMutation({
    mutationFn: apiBulkAssignUnassignedTasks,
    onSuccess: async (data) => {
      toast({ title: "Bulk assignment complete", description: `${data.updatedCount} tasks updated.` });
      await queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to bulk assign";
      toast({ title: "Bulk assign failed", description: message, variant: "destructive" });
    },
  });

  const categoriesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of lookupsQuery.data?.assetCategories ?? []) map.set(c.id, c.name);
    return map;
  }, [lookupsQuery.data?.assetCategories]);

  const locationsById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of lookupsQuery.data?.locations ?? []) map.set(l.id, l.name);
    return map;
  }, [lookupsQuery.data?.locations]);

  const rolesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of lookupsQuery.data?.roles ?? []) map.set(r.id, r.name);
    return map;
  }, [lookupsQuery.data?.roles]);

  const usersById = useMemo(() => {
    const map = new Map<string, { username: string; displayName: string | null }>();
    for (const u of usersQuery.data?.items ?? []) {
      map.set(u.id, { username: u.username, displayName: u.displayName });
    }
    return map;
  }, [usersQuery.data?.items]);

  const toDatetimeLocal = (iso: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const openCreateRule = () => {
    setEditingRuleId(null);
    setRulePriority(0);
    setRuleCategoryId("");
    setRuleLocationId("");
    setRuleAssetStatus("");
    setRuleAssignTarget("unassigned");
    setRuleAssignToUserId("");
    setRuleAssignToRoleId("");
    setRuleIsActive(true);
    setRuleEffectiveFrom("");
    setRuleEffectiveTo("");
    setRuleDialogOpen(true);
  };

  const openEditRule = (ruleId: string) => {
    const rule = (rulesQuery.data?.items ?? []).find((r) => r.RuleId === ruleId);
    if (!rule) return;
    setEditingRuleId(rule.RuleId);
    setRulePriority(rule.Priority);
    setRuleCategoryId(rule.CategoryId ?? "");
    setRuleLocationId(rule.LocationId ?? "");
    setRuleAssetStatus(rule.AssetStatus ?? "");
    if (rule.AssignToUserId) {
      setRuleAssignTarget("user");
      setRuleAssignToUserId(rule.AssignToUserId);
      setRuleAssignToRoleId("");
    } else if (rule.AssignToRoleId) {
      setRuleAssignTarget("role");
      setRuleAssignToRoleId(rule.AssignToRoleId);
      setRuleAssignToUserId("");
    } else {
      setRuleAssignTarget("unassigned");
      setRuleAssignToUserId("");
      setRuleAssignToRoleId("");
    }
    setRuleIsActive(Boolean(rule.IsActive));
    setRuleEffectiveFrom(toDatetimeLocal(rule.EffectiveFrom));
    setRuleEffectiveTo(toDatetimeLocal(rule.EffectiveTo));
    setRuleDialogOpen(true);
  };

  const saveRule = () => {
    const categoryId = ruleCategoryId.trim() ? ruleCategoryId : null;
    const locationId = ruleLocationId.trim() ? ruleLocationId : null;
    const assetStatus = ruleAssetStatus.trim() ? ruleAssetStatus.trim() : null;
    const effectiveFrom = ruleEffectiveFrom.trim() ? new Date(ruleEffectiveFrom).toISOString() : null;
    const effectiveTo = ruleEffectiveTo.trim() ? new Date(ruleEffectiveTo).toISOString() : null;
    const assignToUserId = ruleAssignTarget === "user" && ruleAssignToUserId.trim() ? ruleAssignToUserId : null;
    const assignToRoleId = ruleAssignTarget === "role" && ruleAssignToRoleId.trim() ? ruleAssignToRoleId : null;

    if (editingRuleId) {
      updateRuleMutation.mutate({
        ruleId: editingRuleId,
        data: {
          priority: rulePriority,
          categoryId,
          locationId,
          assetStatus,
          assignToUserId,
          assignToRoleId,
          isActive: ruleIsActive,
          effectiveFrom,
          effectiveTo,
        },
      });
      return;
    }

    createRuleMutation.mutate({
      priority: rulePriority,
      categoryId,
      locationId,
      assetStatus,
      assignToUserId,
      assignToRoleId,
      isActive: ruleIsActive,
      effectiveFrom,
      effectiveTo,
    });
  };

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDateKey = (date: Date): string => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const selectedDateKey = formatDateKey(selectedDate);
  const selectedDateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const goToMonth = (delta: number) => {
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + delta, 1);
    setCurrentMonth(next);
    setSelectedDate((prev) => {
      if (prev.getFullYear() === next.getFullYear() && prev.getMonth() === next.getMonth()) return prev;
      return new Date(next.getFullYear(), next.getMonth(), 1);
    });
  };

  const monthParam = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, "0")}`;
  const calendarQuery = useQuery({
    queryKey: ["scheduling", "calendar", { month: monthParam }],
    queryFn: () => apiGetSchedulingCalendar({ month: monthParam }),
  });

  const dayEventsQuery = useQuery({
    queryKey: ["scheduling", "day", { date: selectedDateKey }],
    queryFn: () => apiGetSchedulingDayEvents({ date: selectedDateKey }),
  });

  type CalendarDayBuckets = {
    buckets: Array<{ count: number; type: "scheduled" | "due" | "overdue" }>;
    capacityMinutes: number;
  };

  const scheduledTasks = useMemo(() => {
    const map: Record<number, CalendarDayBuckets> = {};
    const items = calendarQuery.data?.items ?? [];
    for (const item of items) {
      const date = new Date(`${item.date}T00:00:00`);
      if (date.getFullYear() !== currentMonth.getFullYear() || date.getMonth() !== currentMonth.getMonth()) continue;
      const day = date.getDate();
      const existing = map[day] ?? { buckets: [], capacityMinutes: 0 };
      const nextBuckets = existing.buckets.concat({ count: item.count, type: item.type });
      map[day] = {
        buckets: nextBuckets,
        capacityMinutes: item.capacityMinutes,
      };
    }

    for (const day of Object.keys(map)) {
      const dayIndex = Number(day);
      const value = map[dayIndex];
      const sortedBuckets = value.buckets.slice().sort((a, b) => {
        const order: Record<typeof a.type, number> = { overdue: 0, due: 1, scheduled: 2 };
        return order[a.type] - order[b.type];
      });
      map[dayIndex] = {
        buckets: sortedBuckets,
        capacityMinutes: value.capacityMinutes,
      };
    }

    return map;
  }, [calendarQuery.data, currentMonth]);

  const dayCapacity = useMemo(() => {
    const items = dayEventsQuery.data?.items ?? [];
    const totalEstimatedMinutes = items.reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const thresholdMinutes = DAILY_CAPACITY_MINUTES;
    const { utilization, state } = evaluateCapacity(totalEstimatedMinutes, thresholdMinutes);

    return { totalEstimatedMinutes, thresholdMinutes, utilization, state };
  }, [dayEventsQuery.data]);

  return (
    <div className="min-h-screen bg-background">
      <Header title="PM Scheduling" subtitle="Manage schedules and assignment rules" />

      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-12 gap-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="col-span-12 lg:col-span-7">
            <Card className="border-border/60 bg-card/70 shadow-sm hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Calendar</div>
                    <CardTitle className="text-lg text-foreground">PM Schedule</CardTitle>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => goToMonth(-1)}>
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="text-sm font-semibold text-foreground min-w-32 text-center">
                      {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                    </span>
                    <Button variant="ghost" size="icon" onClick={() => goToMonth(1)}>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-7 gap-1">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <div key={day} className="text-center text-xs font-semibold text-muted-foreground py-2">
                      {day}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: getFirstDayOfMonth(currentMonth) }).map((_, i) => (
                <div key={`empty-${i}`} className="aspect-square" />
              ))}
              {Array.from({ length: getDaysInMonth(currentMonth) }).map((_, i) => {
                const day = i + 1;
                const aggregate = scheduledTasks[day];
                const tasks = aggregate?.buckets;
                const today = new Date();
                const isToday =
                  day === today.getDate() &&
                  currentMonth.getMonth() === today.getMonth() &&
                  currentMonth.getFullYear() === today.getFullYear();

                const isSelected =
                  day === selectedDate.getDate() &&
                  currentMonth.getMonth() === selectedDate.getMonth() &&
                  currentMonth.getFullYear() === selectedDate.getFullYear();
                  return (
                    <motion.button
                      key={day}
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      onClick={() => setSelectedDate(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day))}
                      aria-label={`Select ${currentMonth.toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "long",
                      })} ${day}`}
                      className={`aspect-square rounded-md border p-1 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 border-primary"
                          : isToday
                            ? "bg-accent/20 border-accent"
                            : "border-transparent hover:bg-muted/40"
                      }`}
                    >
                      <div className="h-full flex flex-col">
                        <span
                          className={`text-sm ${
                            isSelected ? "text-primary font-semibold" : isToday ? "text-accent-foreground font-semibold" : "text-foreground"
                          }`}
                        >
                          {day}
                        </span>
                      {aggregate && aggregate.capacityMinutes > 0 && (
                        (() => {
                          const capacity = evaluateCapacity(aggregate.capacityMinutes, DAILY_CAPACITY_MINUTES);
                          const capacityLabel = `${Math.round(aggregate.capacityMinutes)}m`;
                          const capacityClasses =
                            capacity.state === "over"
                              ? "bg-destructive/20 text-destructive border border-destructive/40"
                              : capacity.state === "near"
                                ? "bg-warning/20 text-warning border border-warning/40"
                                : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30";

                          return (
                            <div className="mt-1 flex justify-start">
                              <span
                                className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] ${capacityClasses}`}
                                aria-label={`Capacity ${capacityLabel}, ${capacity.state} capacity`}
                              >
                                {capacityLabel}
                              </span>
                            </div>
                          );
                        })()
                      )}
                      {tasks && (
                        <div className="mt-auto space-y-0.5">
                          {tasks.map((task, idx) => (
                            <div
                              key={idx}
                              className={`text-[10px] px-1 rounded ${
                                task.type === "overdue"
                                  ? "bg-destructive/15 text-destructive"
                                  : task.type === "due"
                                    ? "bg-warning/15 text-warning"
                                    : "bg-primary/15 text-primary"
                              }`}
                            >
                              {task.count} PM
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.button>
                );
              })}
                </div>

                {calendarQuery.isLoading && <div className="text-sm text-muted-foreground">Loading calendar…</div>}
                {calendarQuery.isError && <div className="text-sm text-destructive">Failed to load calendar.</div>}

                <div className="flex items-center gap-6 pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded bg-primary/40" />
                    <span className="text-sm text-muted-foreground">Scheduled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded bg-warning/40" />
                    <span className="text-sm text-muted-foreground">Due Today</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded bg-destructive/40" />
                    <span className="text-sm text-muted-foreground">Overdue</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Right Panel */}
          <div className="col-span-12 lg:col-span-5 space-y-6">
            {/* Assignment Rules */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">Auto-Assignment Rules</CardTitle>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!isSuperadmin()}
                      onClick={() => openCreateRule()}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {rulesQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading rules…</div>
                  ) : rulesQuery.isError ? (
                    <div className="text-sm text-destructive">Failed to load rules.</div>
                  ) : (
                    (rulesQuery.data?.items ?? []).map((rule) => (
                      <div
                        key={rule.RuleId}
                        className="p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                        onClick={() => {
                          if (!isSuperadmin()) return;
                          openEditRule(rule.RuleId);
                        }}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" && e.key !== " ") return;
                          if (!isSuperadmin()) return;
                          openEditRule(rule.RuleId);
                        }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground text-sm">Priority {rule.Priority}</span>
                          <Settings className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {rule.CategoryId ? categoriesById.get(rule.CategoryId) ?? `Category ${rule.CategoryId}` : "Any category"} •{" "}
                          {rule.LocationId ? locationsById.get(rule.LocationId) ?? `Location ${rule.LocationId}` : "Any location"} •{" "}
                          {rule.AssetStatus ? rule.AssetStatus : "Any status"} →{" "}
                          {rule.AssignToUserId
                            ? usersById.get(rule.AssignToUserId)?.displayName ??
                              usersById.get(rule.AssignToUserId)?.username ??
                              rule.AssignToUserId
                            : rule.AssignToRoleId
                              ? rolesById.get(rule.AssignToRoleId) ?? rule.AssignToRoleId
                              : "Unassigned"}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
            >
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-foreground">Bulk Assign Unassigned</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-4 space-y-2">
                      <Label>Assign To</Label>
                      <Select
                        value={bulkAssignTarget}
                        onValueChange={(v) => {
                          if (v === "user" || v === "role") {
                            setBulkAssignTarget(v);
                            setBulkAssignedToUserId("");
                            setBulkAssignedToRoleId("");
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="role">Role</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 md:col-span-8 space-y-2">
                      <Label>Target</Label>
                      {bulkAssignTarget === "user" ? (
                        <Select value={bulkAssignedToUserId} onValueChange={(v) => setBulkAssignedToUserId(v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select user" />
                          </SelectTrigger>
                          <SelectContent>
                            {(usersQuery.data?.items ?? [])
                              .slice()
                              .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
                              .map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.displayName ?? u.username}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Select value={bulkAssignedToRoleId} onValueChange={(v) => setBulkAssignedToRoleId(v)}>
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
                      )}
                    </div>

                    <div className="col-span-12 md:col-span-6 space-y-2">
                      <Label>Due From</Label>
                      <Input type="datetime-local" value={bulkDueFrom} onChange={(e) => setBulkDueFrom(e.target.value)} />
                    </div>
                    <div className="col-span-12 md:col-span-6 space-y-2">
                      <Label>Due To</Label>
                      <Input type="datetime-local" value={bulkDueTo} onChange={(e) => setBulkDueTo(e.target.value)} />
                    </div>
                  </div>

                  <Button
                    className="w-full"
                    disabled={
                      !isManager() ||
                      bulkAssignMutation.isPending ||
                      (bulkAssignTarget === "user" ? !bulkAssignedToUserId.trim() : !bulkAssignedToRoleId.trim())
                    }
                    onClick={() => {
                      const dueFrom = bulkDueFrom.trim() ? new Date(bulkDueFrom).toISOString() : undefined;
                      const dueTo = bulkDueTo.trim() ? new Date(bulkDueTo).toISOString() : undefined;
                      bulkAssignMutation.mutate({
                        assignedToUserId: bulkAssignTarget === "user" ? bulkAssignedToUserId : undefined,
                        assignedToRoleId: bulkAssignTarget === "role" ? bulkAssignedToRoleId : undefined,
                        dueFrom,
                        dueTo,
                      });
                    }}
                  >
                    Apply to Unassigned Tasks
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            {/* Blackout Windows */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">Blackout Windows</CardTitle>
                    <Button size="sm" variant="ghost">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {blackoutQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading blackout windows…</div>
                  ) : blackoutQuery.isError ? (
                    <div className="text-sm text-destructive">Failed to load blackout windows.</div>
                  ) : (
                    (blackoutQuery.data?.items ?? []).map((period) => (
                      <div key={period.BlackoutWindowId} className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-4 h-4 text-warning" />
                          <span className="font-medium text-foreground text-sm">{period.Name}</span>
                          {!period.IsActive && (
                            <Badge variant="outline" className="bg-muted/20 text-muted-foreground border-border">
                              Inactive
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {new Date(period.StartsAt).toLocaleString()} - {new Date(period.EndsAt).toLocaleString()}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Quick Actions */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-foreground">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    className="w-full gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                    onClick={() => recalcMutation.mutate()}
                    disabled={recalcMutation.isPending}
                  >
                    <Clock className="w-4 h-4" />
                    Recalculate All Schedules
                  </Button>
                  <Button
                    className="w-full gap-2"
                    variant="outline"
                    onClick={() => recalcForceMutation.mutate()}
                    disabled={recalcForceMutation.isPending}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Recalculate (Force)
                  </Button>
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
            >
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-foreground">Capacity • {selectedDateLabel}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dayEventsQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading capacity…</div>
                  ) : dayEventsQuery.isError ? (
                    <div className="text-sm text-destructive">Failed to load capacity.</div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">Estimated minutes</div>
                        <div className="text-lg font-semibold text-foreground">
                          {Math.round(dayCapacity.totalEstimatedMinutes)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">/ {dayCapacity.thresholdMinutes}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`inline-flex items-center rounded-full px-2 py-1 text-xs ${
                            dayCapacity.state === "over"
                              ? "bg-destructive/20 text-destructive border border-destructive/40"
                              : dayCapacity.state === "near"
                                ? "bg-warning/20 text-warning border border-warning/40"
                                : "bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
                          }`}
                        >
                          {dayCapacity.state === "over"
                            ? "Over capacity"
                            : dayCapacity.state === "near"
                              ? "Near capacity"
                              : "Within capacity"}
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Utilization {Math.round(dayCapacity.utilization * 100)}%
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-foreground">Events • {selectedDateLabel}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dayEventsQuery.isLoading ? (
                    <div className="text-sm text-muted-foreground">Loading events…</div>
                  ) : dayEventsQuery.isError ? (
                    <div className="text-sm text-destructive">Failed to load events.</div>
                  ) : (dayEventsQuery.data?.items ?? []).length === 0 ? (
                    <div className="text-sm text-muted-foreground">No tasks scheduled for this day.</div>
                  ) : (
                    <ScrollArea className="h-64">
                      <div className="space-y-2 pr-3">
                        {(dayEventsQuery.data?.items ?? []).map((item) => {
                          const dueAt = new Date(item.scheduledDueAt);
                          const timeText = Number.isNaN(dueAt.getTime()) ? item.scheduledDueAt : dueAt.toLocaleTimeString();
                          const badgeVariant =
                            item.bucket === "overdue" ? "destructive" : item.bucket === "due" ? "secondary" : "outline";

                          return (
                            <div
                              key={item.id}
                              className="p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant={badgeVariant} className="capitalize">
                                      {item.bucket}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{timeText}</span>
                                  </div>
                                  <div className="mt-1 text-sm text-foreground font-medium truncate">{item.taskNumber}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {item.asset.assetTag} • {item.asset.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">{item.template.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {item.estimatedMinutes > 0 ? `${item.estimatedMinutes} min` : "—"}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap capitalize">{item.status}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>

      <Dialog
        open={ruleDialogOpen}
        onOpenChange={(open) => {
          setRuleDialogOpen(open);
          if (!open) setEditingRuleId(null);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRuleId ? "Edit Assignment Rule" : "New Assignment Rule"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4">
              <div className="space-y-2">
                <Label>Priority</Label>
                <Input
                  type="number"
                  min={0}
                  value={String(rulePriority)}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setRulePriority(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
                  }}
                />
              </div>
            </div>
            <div className="col-span-12 md:col-span-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={ruleCategoryId} onValueChange={(v) => setRuleCategoryId(v === "__any__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any category</SelectItem>
                    {(lookupsQuery.data?.assetCategories ?? [])
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="col-span-12 md:col-span-4">
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={ruleLocationId} onValueChange={(v) => setRuleLocationId(v === "__any__" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Any location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__any__">Any location</SelectItem>
                    {(lookupsQuery.data?.locations ?? [])
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="col-span-12 md:col-span-6">
              <div className="space-y-2">
                <Label>Asset Status</Label>
                <Input
                  value={ruleAssetStatus}
                  onChange={(e) => setRuleAssetStatus(e.target.value)}
                  placeholder="Any status"
                />
              </div>
            </div>

            <div className="col-span-12 md:col-span-6">
              <div className="space-y-2">
                <Label>Active</Label>
                <div className="flex items-center gap-3 h-10">
                  <Switch checked={ruleIsActive} onCheckedChange={(v) => setRuleIsActive(Boolean(v))} />
                  <span className="text-sm">{ruleIsActive ? "Active" : "Inactive"}</span>
                </div>
              </div>
            </div>

            <div className="col-span-12 md:col-span-6">
              <div className="space-y-2">
                <Label>Effective From</Label>
                <Input type="datetime-local" value={ruleEffectiveFrom} onChange={(e) => setRuleEffectiveFrom(e.target.value)} />
              </div>
            </div>
            <div className="col-span-12 md:col-span-6">
              <div className="space-y-2">
                <Label>Effective To</Label>
                <Input type="datetime-local" value={ruleEffectiveTo} onChange={(e) => setRuleEffectiveTo(e.target.value)} />
              </div>
            </div>

            <div className="col-span-12">
              <div className="space-y-2">
                <Label>Assign To</Label>
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-4">
                    <Select
                      value={ruleAssignTarget}
                      onValueChange={(v) => {
                        if (v === "unassigned" || v === "user" || v === "role") {
                          setRuleAssignTarget(v);
                          if (v !== "user") setRuleAssignToUserId("");
                          if (v !== "role") setRuleAssignToRoleId("");
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="role">Role</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-12 md:col-span-8">
                    {ruleAssignTarget === "user" ? (
                      <Select value={ruleAssignToUserId} onValueChange={(v) => setRuleAssignToUserId(v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select user" />
                        </SelectTrigger>
                        <SelectContent>
                          {(usersQuery.data?.items ?? [])
                            .slice()
                            .sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username))
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id}>
                                {u.displayName ?? u.username}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    ) : ruleAssignTarget === "role" ? (
                      <Select value={ruleAssignToRoleId} onValueChange={(v) => setRuleAssignToRoleId(v)}>
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
                    ) : (
                      <Input value="Unassigned" readOnly className="bg-muted/50" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            {editingRuleId ? (
              <Button
                variant="destructive"
                disabled={deactivateRuleMutation.isPending}
                onClick={() => {
                  if (!editingRuleId) return;
                  deactivateRuleMutation.mutate(editingRuleId);
                }}
              >
                Deactivate
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-primary"
              disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
              onClick={() => saveRule()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Scheduling;
