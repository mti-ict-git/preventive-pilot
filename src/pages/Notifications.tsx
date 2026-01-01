import { useMemo } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Mail,
  MessageSquare,
  Clock,
  AlertTriangle,
  Plus,
  Settings,
  ChevronRight,
  Pencil,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  apiListNotificationChannels,
  apiListNotificationLog,
  apiListNotificationRules,
  apiUpdateNotificationChannel,
  apiUpdateNotificationRule,
  ApiError,
  type NotificationChannel,
  type NotificationRule,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const Notifications = () => {
  const queryClient = useQueryClient();

  const channelsQuery = useQuery({
    queryKey: ["notification-channels"],
    queryFn: apiListNotificationChannels,
  });

  const rulesQuery = useQuery({
    queryKey: ["notification-rules"],
    queryFn: apiListNotificationRules,
  });

  const logQuery = useQuery({
    queryKey: ["notification-log"],
    queryFn: () => apiListNotificationLog({ page: 1, pageSize: 5 }),
    refetchInterval: 30_000,
  });

  const updateChannelMutation = useMutation({
    mutationFn: async (input: { channelId: string; isActive: boolean }) =>
      apiUpdateNotificationChannel({ channelId: input.channelId, isActive: input.isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to update channel";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async (input: { ruleId: string; isActive: boolean }) =>
      apiUpdateNotificationRule({ ruleId: input.ruleId, isActive: input.isActive }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to update rule";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    },
  });

  const channelItems = channelsQuery.data?.items ?? [];
  const ruleItems = rulesQuery.data?.items ?? [];
  const channelById = useMemo(() => {
    const map = new Map<string, NotificationChannel>();
    for (const c of channelItems) map.set(c.id, c);
    return map;
  }, [channelItems]);

  const reminderRules = useMemo(() => {
    return ruleItems.filter((r) => r.offsetDays !== null);
  }, [ruleItems]);

  const escalationRules = useMemo(() => {
    return ruleItems.filter((r) => r.escalateAfterDays !== null);
  }, [ruleItems]);

  const getChannelIcon = (channelType: string) => {
    const value = channelType.toLowerCase();
    if (value.includes("mail")) return Mail;
    if (value.includes("teams")) return MessageSquare;
    if (value.includes("whatsapp")) return MessageSquare;
    return Settings;
  };

  const formatRuleTiming = (rule: NotificationRule): string => {
    if (rule.offsetDays !== null) {
      const n = rule.offsetDays;
      if (n === 0) return "D-Day";
      return n > 0 ? `H-${n}` : `H+${Math.abs(n)}`;
    }

    if (rule.escalateAfterDays !== null) {
      return `Overdue > ${rule.escalateAfterDays} day${rule.escalateAfterDays === 1 ? "" : "s"}`;
    }

    return rule.eventType;
  };

  return (
    <div className="min-h-screen">
      <Header title="Notifications" subtitle="Configure reminders and escalation rules" />

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Reminder Rules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <Card className="glass border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Reminder Rules
                  </CardTitle>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Rule
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {rulesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading rules…</div>
                ) : rulesQuery.isError ? (
                  <div className="text-sm text-destructive">Failed to load rules.</div>
                ) : reminderRules.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No reminder rules.</div>
                ) : (
                  reminderRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(checked) =>
                              updateRuleMutation.mutate({ ruleId: rule.id, isActive: checked })
                            }
                            disabled={updateRuleMutation.isPending}
                          />
                          <span className="font-medium text-foreground">{rule.ruleName}</span>
                        </div>
                        <Badge variant="secondary">{formatRuleTiming(rule)}</Badge>
                      </div>
                      <div className="flex items-center gap-2 ml-11">
                        <Badge variant="outline" className="text-xs">
                          {channelById.get(rule.channel.id)?.channelType ?? rule.channel.channelType}
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Escalation Rules */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="glass border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-warning" />
                    Escalation Rules
                  </CardTitle>
                  <Button size="sm" variant="outline" className="gap-2">
                    <Plus className="w-4 h-4" />
                    Add Rule
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {rulesQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading rules…</div>
                ) : rulesQuery.isError ? (
                  <div className="text-sm text-destructive">Failed to load rules.</div>
                ) : escalationRules.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No escalation rules.</div>
                ) : (
                  escalationRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={rule.isActive}
                            onCheckedChange={(checked) =>
                              updateRuleMutation.mutate({ ruleId: rule.id, isActive: checked })
                            }
                            disabled={updateRuleMutation.isPending}
                          />
                          <span className="font-medium text-foreground">{rule.ruleName}</span>
                        </div>
                        <Pencil className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground ml-11">
                        {formatRuleTiming(rule)} → Channel {rule.channel.channelType}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Notification Channels */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Settings className="w-5 h-5 text-accent" />
                  Notification Channels
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {channelsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading channels…</div>
                ) : channelsQuery.isError ? (
                  <div className="text-sm text-destructive">Failed to load channels.</div>
                ) : channelItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No channels configured.</div>
                ) : (
                  channelItems.map((channel) => {
                    const Icon = getChannelIcon(channel.channelType);
                    const active = channel.isActive;
                    return (
                      <div
                        key={channel.id}
                        className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                              active ? "bg-success/20" : "bg-warning/20"
                            }`}
                          >
                            <Icon className={`w-5 h-5 ${active ? "text-success" : "text-warning"}`} />
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{channel.channelType}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                              {active ? "active" : "inactive"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={active}
                            onCheckedChange={(checked) =>
                              updateChannelMutation.mutate({ channelId: channel.id, isActive: checked })
                            }
                            disabled={updateChannelMutation.isPending}
                          />
                          <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Recent Notifications */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Card className="glass border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Bell className="w-5 h-5 text-primary" />
                    Recent Activity
                  </CardTitle>
                  <Button size="sm" variant="ghost">View All</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {logQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading activity…</div>
                ) : logQuery.isError ? (
                  <div className="text-sm text-destructive">Failed to load activity.</div>
                ) : (logQuery.data?.items ?? []).length === 0 ? (
                  <div className="text-sm text-muted-foreground">No recent activity.</div>
                ) : (
                  (logQuery.data?.items ?? []).map((entry) => (
                    <div key={entry.id} className="p-3 rounded-lg transition-colors bg-muted/20">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-2 h-2 rounded-full mt-2 ${
                            entry.status.toLowerCase() === "failed" ? "bg-destructive" : "bg-primary"
                          }`}
                        />
                        <div className="flex-1">
                          <p className="text-sm text-foreground">
                            {entry.ruleId ? `Rule ${entry.ruleId}` : "Notification"}
                            {entry.taskId ? ` • Task ${entry.taskId}` : ""}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(entry.sentAt).toLocaleString()} • {entry.channel.channelType}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
