import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  apiListNotificationChannels,
  apiListNotificationLog,
  apiListNotificationRules,
  apiRunJob,
  apiUpdateNotificationChannel,
  apiUpdateNotificationRule,
  apiTestMicrosoftGraphSettings,
  apiCreateNotificationRule,
  apiCreateNotificationChannel,
  ApiError,
  type NotificationChannel,
  type NotificationRule,
  type NotificationLogEntry,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const Notifications = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState<"all" | "queued" | "sent" | "failed">("all");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(5);
  const [logItems, setLogItems] = useState<NotificationLogEntry[]>([]);

  const [ruleModalOpen, setRuleModalOpen] = useState<boolean>(false);
  const [ruleModalMode, setRuleModalMode] = useState<"create" | "edit">("create");
  const [ruleModalType, setRuleModalType] = useState<"reminder" | "escalation">("reminder");
  const [ruleId, setRuleId] = useState<string | null>(null);
  const [ruleName, setRuleName] = useState<string>("");
  const [eventType, setEventType] = useState<string>("task_due");
  const [offsetDays, setOffsetDays] = useState<string>("0");
  const [escalateAfterDays, setEscalateAfterDays] = useState<string>("1");
  const [ruleChannelId, setRuleChannelId] = useState<string>("");
  const [messageTemplate, setMessageTemplate] = useState<string>("");
  const [ruleActive, setRuleActive] = useState<boolean>(true);

  const [channelModalOpen, setChannelModalOpen] = useState<boolean>(false);
  const [channelModalMode, setChannelModalMode] = useState<"create" | "edit">("create");
  const [channelId, setChannelId] = useState<string | null>(null);
  const [channelType, setChannelType] = useState<string>("Mail");
  const [channelConfig, setChannelConfig] = useState<string>("");
  const [channelActive, setChannelActive] = useState<boolean>(true);

  const channelsQuery = useQuery({
    queryKey: ["notification-channels"],
    queryFn: apiListNotificationChannels,
  });

  const rulesQuery = useQuery({
    queryKey: ["notification-rules"],
    queryFn: apiListNotificationRules,
  });

  const logQuery = useQuery({
    queryKey: ["notification-log", { page, pageSize }],
    queryFn: () => apiListNotificationLog({ page, pageSize }),
    refetchInterval: 30_000,
  });

  const runNotificationsMutation = useMutation({
    mutationFn: async () => apiRunJob("notifications"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-log"] });
      toast({ title: "Job started", description: "Notifications job triggered." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to start notifications job";
      toast({ title: "Job failed", description: message, variant: "destructive" });
    },
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

  const saveRuleMutation = useMutation({
    mutationFn: async () => {
      const base = {
        ruleName: ruleName.trim(),
        eventType: eventType.trim(),
        channelId: ruleChannelId,
        messageTemplate: messageTemplate.trim() ? messageTemplate : null,
        isActive: ruleActive,
      };
      if (ruleModalMode === "create") {
        if (ruleModalType === "reminder") {
          const n = Number(offsetDays);
          return apiCreateNotificationRule({ ...base, offsetDays: Number.isFinite(n) ? n : 0 });
        }
        const n = Number(escalateAfterDays);
        return apiCreateNotificationRule({ ...base, escalateAfterDays: Number.isFinite(n) ? n : 1 });
      }
      const payload: {
        ruleId: string;
        ruleName?: string;
        eventType?: string;
        offsetDays?: number | null;
        escalateAfterDays?: number | null;
        channelId?: string;
        messageTemplate?: string | null;
        isActive?: boolean;
      } = { ruleId: ruleId ?? "" };
      payload.ruleName = base.ruleName;
      payload.eventType = base.eventType;
      payload.channelId = base.channelId;
      payload.messageTemplate = base.messageTemplate;
      payload.isActive = base.isActive;
      if (ruleModalType === "reminder") {
        const n = Number(offsetDays);
        payload.offsetDays = Number.isFinite(n) ? n : 0;
        payload.escalateAfterDays = null;
      } else {
        const n = Number(escalateAfterDays);
        payload.escalateAfterDays = Number.isFinite(n) ? n : 1;
        payload.offsetDays = null;
      }
      return apiUpdateNotificationRule(payload);
    },
    onSuccess: async () => {
      setRuleModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      toast({ title: ruleModalMode === "create" ? "Rule created" : "Rule updated" });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to save rule";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  const saveChannelMutation = useMutation({
    mutationFn: async () => {
      if (channelModalMode === "create") {
        return apiCreateNotificationChannel({ channelType, config: channelConfig || null, isActive: channelActive });
      }
      return apiUpdateNotificationChannel({
        channelId: channelId ?? "",
        channelType,
        config: channelConfig || null,
        isActive: channelActive,
      });
    },
    onSuccess: async () => {
      setChannelModalOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
      toast({ title: channelModalMode === "create" ? "Channel created" : "Channel updated" });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to save channel";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  const channelItems = useMemo(() => channelsQuery.data?.items ?? [], [channelsQuery.data?.items]);
  const ruleItems = useMemo(() => rulesQuery.data?.items ?? [], [rulesQuery.data?.items]);
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

  useEffect(() => {
    const items = logQuery.data?.items ?? [];
    setLogItems((prev) => (page === 1 ? items : [...prev, ...items]));
  }, [logQuery.data?.items, page]);

  const channelFilterItems = useMemo((): Array<{ id: string; name: string }> => {
    const types = new Set<string>();
    for (const c of channelItems) types.add(c.channelType);
    const rows: Array<{ id: string; name: string }> = [{ id: "all", name: "All Channels" }];
    for (const t of Array.from(types).sort((a, b) => a.localeCompare(b))) rows.push({ id: t, name: t });
    return rows;
  }, [channelItems]);

  const filteredLogItems = useMemo((): NotificationLogEntry[] => {
    const byStatus = statusFilter;
    const byChannel = channelFilter;
    return logItems.filter((e) => {
      const statusOk = byStatus === "all" || e.status.toLowerCase() === byStatus;
      const channelOk = byChannel === "all" || e.channel.channelType === byChannel;
      return statusOk && channelOk;
    });
  }, [logItems, statusFilter, channelFilter]);

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
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setRuleModalMode("create");
                      setRuleModalType("reminder");
                      setRuleId(null);
                      setRuleName("");
                      setEventType("task_due");
                      setOffsetDays("0");
                      setEscalateAfterDays("1");
                      setRuleChannelId(channelItems[0]?.id ?? "");
                      setMessageTemplate("");
                      setRuleActive(true);
                      setRuleModalOpen(true);
                    }}
                  >
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setRuleModalMode("create");
                      setRuleModalType("escalation");
                      setRuleId(null);
                      setRuleName("");
                      setEventType("task_overdue");
                      setOffsetDays("0");
                      setEscalateAfterDays("1");
                      setRuleChannelId(channelItems[0]?.id ?? "");
                      setMessageTemplate("");
                      setRuleActive(true);
                      setRuleModalOpen(true);
                    }}
                  >
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
                        <Pencil
                          className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground"
                          onClick={() => {
                            setRuleModalMode("edit");
                            const isEsc = rule.escalateAfterDays !== null;
                            setRuleModalType(isEsc ? "escalation" : "reminder");
                            setRuleId(rule.id);
                            setRuleName(rule.ruleName);
                            setEventType(rule.eventType);
                            setOffsetDays(String(rule.offsetDays ?? 0));
                            setEscalateAfterDays(String(rule.escalateAfterDays ?? 1));
                            setRuleChannelId(rule.channel.id);
                            setMessageTemplate(rule.messageTemplate ?? "");
                            setRuleActive(rule.isActive);
                            setRuleModalOpen(true);
                          }}
                        />
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
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      setChannelModalMode("create");
                      setChannelId(null);
                      setChannelType("Mail");
                      setChannelConfig("");
                      setChannelActive(true);
                      setChannelModalOpen(true);
                    }}
                  >
                    <Plus className="w-4 h-4" /> Add Channel
                  </Button>
                </div>
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
                        onClick={() => {
                          setChannelModalMode("edit");
                          setChannelId(channel.id);
                          setChannelType(channel.channelType);
                          setChannelConfig(channel.config ?? "");
                          setChannelActive(channel.isActive);
                          setChannelModalOpen(true);
                        }}
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
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => runNotificationsMutation.mutate()} disabled={runNotificationsMutation.isPending}>
                      Run Now
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await apiTestMicrosoftGraphSettings({ sendTestEmail: true });
                          toast({ title: "Test email sent", description: "Check your inbox." });
                        } catch (err) {
                          const message = err instanceof ApiError ? err.message : "Failed to send test email";
                          toast({ title: "Test failed", description: message, variant: "destructive" });
                        }
                      }}
                    >
                      Send Test Email
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => navigate("/settings/notifications")}>Settings</Button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-4">
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1); }}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="queued">Queued</SelectItem>
                        <SelectItem value="sent">Sent</SelectItem>
                        <SelectItem value="failed">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Select value={channelFilter} onValueChange={(v) => { setChannelFilter(v); setPage(1); }}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Channel" />
                      </SelectTrigger>
                      <SelectContent>
                        {channelFilterItems.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="Page Size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {logQuery.isLoading && page === 1 ? (
                  <div className="text-sm text-muted-foreground">Loading activity…</div>
                ) : logQuery.isError ? (
                  <div className="text-sm text-destructive">Failed to load activity.</div>
                ) : filteredLogItems.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No recent activity.</div>
                ) : (
                  filteredLogItems.map((entry) => (
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
                          {entry.status.toLowerCase() === "failed" && entry.errorMessage ? (
                            <p className="text-xs text-destructive mt-1 break-words">{entry.errorMessage}</p>
                          ) : null}
                          {entry.payload ? (
                            <pre className="mt-2 text-xs bg-muted/30 p-2 rounded overflow-x-auto">
                              {(() => {
                                try {
                                  const obj = JSON.parse(entry.payload);
                                  return JSON.stringify(obj, null, 2);
                                } catch {
                                  return entry.payload;
                                }
                              })()}
                            </pre>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-muted-foreground">Showing {filteredLogItems.length} items</p>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={logQuery.isLoading}>Load More</Button>
                    <Button size="sm" variant="outline" onClick={() => { setPage(1); setLogItems([]); }}>Refresh</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
      {/* Rule Modal */}
      <Dialog open={ruleModalOpen} onOpenChange={setRuleModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{ruleModalMode === "create" ? "Add Rule" : "Edit Rule"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6 space-y-2">
              <Label>Type</Label>
              <Select value={ruleModalType} onValueChange={(v) => setRuleModalType(v as typeof ruleModalType)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reminder">Reminder</SelectItem>
                  <SelectItem value="escalation">Escalation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 md:col-span-6 space-y-2">
              <Label>Event</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task_due">Task Due</SelectItem>
                  <SelectItem value="task_overdue">Task Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 space-y-2">
              <Label>Rule Name</Label>
              <Input value={ruleName} onChange={(e) => setRuleName(e.target.value)} className="bg-muted/50" />
            </div>
            {ruleModalType === "reminder" ? (
              <div className="col-span-12 md:col-span-6 space-y-2">
                <Label>Offset (days)</Label>
                <Input value={offsetDays} onChange={(e) => setOffsetDays(e.target.value)} className="bg-muted/50" />
                <p className="text-xs text-muted-foreground">Use negative for H+ and positive for H-; 0 for D-Day.</p>
              </div>
            ) : (
              <div className="col-span-12 md:col-span-6 space-y-2">
                <Label>Escalate After (days)</Label>
                <Input
                  value={escalateAfterDays}
                  onChange={(e) => setEscalateAfterDays(e.target.value)}
                  className="bg-muted/50"
                />
              </div>
            )}
            <div className="col-span-12 md:col-span-6 space-y-2">
              <Label>Channel</Label>
              <Select value={ruleChannelId} onValueChange={setRuleChannelId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Channel" />
                </SelectTrigger>
                <SelectContent>
                  {channelItems.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.channelType}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 space-y-2">
              <Label>Message Template</Label>
              <Textarea
                value={messageTemplate}
                onChange={(e) => setMessageTemplate(e.target.value)}
                className="bg-muted/50"
                rows={4}
              />
            </div>
            <div className="col-span-12">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Active</p>
                  <p className="text-xs text-muted-foreground">Rule will be evaluated only when active</p>
                </div>
                <Switch checked={ruleActive} onCheckedChange={setRuleActive} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setRuleModalOpen(false)}>Cancel</Button>
            <Button onClick={() => saveRuleMutation.mutate()} disabled={saveRuleMutation.isPending || !ruleName.trim() || !ruleChannelId}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Channel Modal */}
      <Dialog open={channelModalOpen} onOpenChange={setChannelModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{channelModalMode === "create" ? "Add Channel" : "Edit Channel"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6 space-y-2">
              <Label>Type</Label>
              <Select value={channelType} onValueChange={setChannelType}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mail">Mail</SelectItem>
                  <SelectItem value="Teams">Teams</SelectItem>
                  <SelectItem value="WhatsApp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 space-y-2">
              <Label>Config (JSON or text)</Label>
              <Textarea
                value={channelConfig}
                onChange={(e) => setChannelConfig(e.target.value)}
                className="bg-muted/50"
                rows={4}
              />
            </div>
            <div className="col-span-12">
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Active</p>
                  <p className="text-xs text-muted-foreground">Delivery enabled when active</p>
                </div>
                <Switch checked={channelActive} onCheckedChange={setChannelActive} />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setChannelModalOpen(false)}>Cancel</Button>
            <Button onClick={() => saveChannelMutation.mutate()} disabled={saveChannelMutation.isPending || !channelType.trim()}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Notifications;
