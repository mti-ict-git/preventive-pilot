import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calendar,
  Clock,
  Settings,
  Plus,
  ChevronLeft,
  ChevronRight,
  Server,
  AlertTriangle,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  apiListAssignmentRules,
  apiListBlackoutWindows,
  apiRecalculateSchedules,
  ApiError,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const Scheduling = () => {
  const [currentMonth, setCurrentMonth] = useState(new Date(2026, 0, 1));

  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ["assignment-rules"],
    queryFn: apiListAssignmentRules,
  });

  const blackoutQuery = useQuery({
    queryKey: ["blackout-windows"],
    queryFn: apiListBlackoutWindows,
  });

  const recalcMutation = useMutation({
    mutationFn: async () => apiRecalculateSchedules(),
    onSuccess: async () => {
      toast({ title: "Recalculation started", description: "Schedules recalculated." });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to recalculate schedules";
      toast({ title: "Action failed", description: message, variant: "destructive" });
    },
  });

  const getDaysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const scheduledTasks: { [key: number]: { count: number; type: string }[] } = {
    1: [{ count: 12, type: "due" }],
    3: [{ count: 5, type: "scheduled" }],
    5: [{ count: 8, type: "scheduled" }],
    8: [{ count: 3, type: "scheduled" }],
    10: [{ count: 15, type: "scheduled" }],
    12: [{ count: 7, type: "scheduled" }],
    15: [{ count: 10, type: "scheduled" }],
    18: [{ count: 4, type: "scheduled" }],
    20: [{ count: 6, type: "scheduled" }],
    22: [{ count: 9, type: "scheduled" }],
    25: [{ count: 11, type: "scheduled" }],
    28: [{ count: 8, type: "scheduled" }],
  };

  return (
    <div className="min-h-screen">
      <Header title="PM Scheduling" subtitle="Manage schedules and assignment rules" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="lg:col-span-2 glass rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">PM Calendar</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() - 1)))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="font-medium text-foreground min-w-32 text-center">
                  {currentMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setCurrentMonth(new Date(currentMonth.setMonth(currentMonth.getMonth() + 1)))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
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
                const tasks = scheduledTasks[day];
                const isToday = day === 1 && currentMonth.getMonth() === 0;
                return (
                  <motion.div
                    key={day}
                    whileHover={{ scale: 1.05 }}
                    className={`aspect-square rounded-lg p-1 cursor-pointer transition-colors ${
                      isToday ? "bg-primary/20 border border-primary" : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="h-full flex flex-col">
                      <span className={`text-sm ${isToday ? "text-primary font-bold" : "text-foreground"}`}>
                        {day}
                      </span>
                      {tasks && (
                        <div className="mt-auto">
                          {tasks.map((task, idx) => (
                            <div
                              key={idx}
                              className={`text-[10px] px-1 rounded ${
                                task.type === "due" ? "bg-warning/20 text-warning" : "bg-primary/20 text-primary"
                              }`}
                            >
                              {task.count} PM
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-primary/40" />
                <span className="text-sm text-muted-foreground">Scheduled</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-warning/40" />
                <span className="text-sm text-muted-foreground">Due Today</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-destructive/40" />
                <span className="text-sm text-muted-foreground">Overdue</span>
              </div>
            </div>
          </motion.div>

          {/* Right Panel */}
          <div className="space-y-6">
            {/* Assignment Rules */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card className="glass border-border">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-foreground">Auto-Assignment Rules</CardTitle>
                    <Button size="sm" variant="ghost">
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
                        className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-foreground text-sm">Priority {rule.Priority}</span>
                          <Settings className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {rule.CategoryId ? `Category ${rule.CategoryId}` : "Any category"} •{" "}
                          {rule.LocationId ? `Location ${rule.LocationId}` : "Any location"} •{" "}
                          {rule.AssetStatus ? rule.AssetStatus : "Any status"} →{" "}
                          {rule.AssignToUserId ?? rule.AssignToRoleId ?? "Unassigned"}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Blackout Windows */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="glass border-border">
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
                      <div
                        key={period.BlackoutWindowId}
                        className="p-3 rounded-lg bg-warning/10 border border-warning/20"
                      >
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
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Button
                className="w-full gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                onClick={() => recalcMutation.mutate()}
                disabled={recalcMutation.isPending}
              >
                <Clock className="w-4 h-4" />
                Recalculate All Schedules
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scheduling;
