import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  Server,
  Key,
  Clock,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Database,
  Shield,
  Activity,
  ExternalLink,
  Upload,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  apiGetSnipeItSettings,
  apiGetSystemLogs,
  apiGetSystemStatus,
  apiListTemplates,
  apiRunJob,
  apiRunEvidenceImport,
  apiTestSnipeItSettings,
  apiUpdateSnipeItSettings,
  type UpdateSnipeItSettingsInput,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SystemSettings = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const systemStatusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: apiGetSystemStatus,
    refetchInterval: 30_000,
  });

  const logsQuery = useQuery({
    queryKey: ["system-logs", { page: 1, pageSize: 5 }],
    queryFn: () => apiGetSystemLogs({ page: 1, pageSize: 5 }),
    refetchInterval: 30_000,
  });

  const snipeSettingsQuery = useQuery({
    queryKey: ["snipeit-settings"],
    queryFn: apiGetSnipeItSettings,
  });

  const templatesQuery = useQuery({
    queryKey: ["templates", { active: true }],
    queryFn: () => apiListTemplates({ active: true }),
    staleTime: 30_000,
  });

  const [baseUrl, setBaseUrl] = useState<string>("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);
  const [syncIntervalMinutes, setSyncIntervalMinutes] = useState<number>(60);
  const [editToken, setEditToken] = useState<boolean>(false);
  const [apiToken, setApiToken] = useState<string>("");

  const [importTemplateId, setImportTemplateId] = useState<string>("__asset_default__");
  const [importDuplicateAction, setImportDuplicateAction] = useState<"skip" | "replace">("skip");

  useEffect(() => {
    const settings = snipeSettingsQuery.data;
    if (!settings) return;
    setBaseUrl(settings.baseUrl ?? "");
    setAutoSyncEnabled(settings.autoSyncEnabled);
    setSyncIntervalMinutes(settings.syncIntervalMinutes);
    setEditToken(false);
    setApiToken("");
  }, [snipeSettingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: UpdateSnipeItSettingsInput = {
        baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
        autoSyncEnabled,
        syncIntervalMinutes,
      };
      if (editToken) {
        payload.apiToken = apiToken.trim() ? apiToken.trim() : null;
      }
      return apiUpdateSnipeItSettings(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system-status"] });
      await queryClient.invalidateQueries({ queryKey: ["snipeit-settings"] });
      toast({ title: "Settings saved", description: "Snipe-IT settings updated." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to save settings";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const payload: Partial<UpdateSnipeItSettingsInput> = {
        baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
        autoSyncEnabled,
        syncIntervalMinutes,
      };
      if (editToken) {
        payload.apiToken = apiToken.trim() ? apiToken.trim() : null;
      }
      return apiTestSnipeItSettings(payload);
    },
    onSuccess: () => {
      toast({ title: "Connection ok", description: "Snipe-IT API request succeeded." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Connection test failed";
      toast({ title: "Test failed", description: message, variant: "destructive" });
    },
  });

  const syncNowMutation = useMutation({
    mutationFn: async () => apiRunJob("snipe-sync"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["system-status"] });
      toast({ title: "Sync started", description: "Snipe-IT sync job triggered." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to start sync";
      toast({ title: "Sync failed", description: message, variant: "destructive" });
    },
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      const templateId = importTemplateId === "__asset_default__" ? null : importTemplateId;
      return apiRunEvidenceImport({ templateId, duplicateAction: importDuplicateAction });
    },
    onSuccess: (result) => {
      toast({
        title: "Import completed",
        description: `Imported ${result.importedFiles}, skipped ${result.skippedFiles}, errors ${result.errorFiles}.`,
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to run import";
      toast({ title: "Import failed", description: message, variant: "destructive" });
    },
  });

  const systemStatus = useMemo(() => {
    const data = systemStatusQuery.data;
    const nowText = data ? new Date(data.backendTime).toLocaleString() : "—";
    const dbOk = data?.database.ok ?? false;
    const jobsEnabled = data?.jobs.enabled ?? false;
    const snipeConfigured = data?.snipeIt.configured ?? false;
    return [
      {
        name: "Snipe-IT Connection",
        ok: snipeConfigured,
        status: snipeConfigured ? "configured" : "not configured",
        lastCheck: nowText,
      },
      {
        name: "Database",
        ok: dbOk,
        status: dbOk ? "healthy" : "unhealthy",
        lastCheck: nowText,
      },
      {
        name: "Job Scheduler",
        ok: jobsEnabled,
        status: jobsEnabled ? "running" : "disabled",
        lastCheck: nowText,
      },
      {
        name: "System",
        ok: Boolean(data),
        status: data ? "online" : "loading",
        lastCheck: nowText,
      },
    ];
  }, [systemStatusQuery.data]);

  const recentLogs = useMemo(() => {
    const items = logsQuery.data?.items ?? [];
    return items.slice(0, 5).map((l) => ({
      type: l.level,
      message: l.message,
      time: new Date(l.createdAt).toLocaleTimeString(),
    }));
  }, [logsQuery.data]);

  const apiTokenConfigured = snipeSettingsQuery.data?.apiTokenConfigured ?? false;
  const snipeItUrl = baseUrl.trim() ? baseUrl.trim() : systemStatusQuery.data?.snipeIt.baseUrl;

  return (
    <div className="min-h-screen">
      <Header title="System Settings" subtitle="Manage integrations and system configuration" />

      <div className="p-6 space-y-6">
        {/* System Status */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {systemStatus.map((item, index) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="stat-card"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">{item.name}</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${
                      item.ok ? "bg-success" : "bg-warning"
                    }`} />
                    <span className="text-sm font-medium text-foreground capitalize">{item.status}</span>
                  </div>
                </div>
                {item.ok ? (
                  <CheckCircle className="w-5 h-5 text-success" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-warning" />
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Last check: {item.lastCheck}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Snipe-IT Integration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Card className="glass border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Server className="w-5 h-5 text-primary" />
                  Snipe-IT Integration
                </CardTitle>
                <CardDescription>Manage asset synchronization settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Snipe-IT URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={baseUrl}
                      onChange={(e) => setBaseUrl(e.target.value)}
                      className="bg-muted/50"
                      placeholder="https://assets.company.com"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      disabled={!snipeItUrl}
                      onClick={() => {
                        if (snipeItUrl) window.open(snipeItUrl, "_blank", "noreferrer");
                      }}
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>API Token</Label>
                  <div className="flex gap-2">
                    <Input
                      type="password"
                      value={editToken ? apiToken : apiTokenConfigured ? "••••••••••••••••" : ""}
                      onChange={(e) => {
                        if (editToken) setApiToken(e.target.value);
                      }}
                      className="bg-muted/50"
                      placeholder={
                        editToken
                          ? apiTokenConfigured
                            ? "Leave blank to clear or paste a new token"
                            : "Paste API token"
                          : apiTokenConfigured
                            ? "Configured"
                            : "Not configured"
                      }
                      readOnly={!editToken}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditToken((prev) => !prev);
                        setApiToken("");
                      }}
                    >
                      {editToken ? "Cancel" : apiTokenConfigured ? "Update" : "Set Token"}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium text-foreground">Auto Sync</p>
                    <p className="text-sm text-muted-foreground">Sync every {syncIntervalMinutes} minutes</p>
                  </div>
                  <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
                </div>

                <div className="space-y-2">
                  <Label>Sync Interval (minutes)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={String(syncIntervalMinutes)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setSyncIntervalMinutes(Number.isFinite(next) && next > 0 ? Math.floor(next) : 1);
                    }}
                    className="bg-muted/50"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    <Settings className="w-4 h-4" />
                    Save
                  </Button>
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => syncNowMutation.mutate()}
                    disabled={syncNowMutation.isPending}
                    variant="outline"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Sync Now
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => testMutation.mutate()}
                    disabled={testMutation.isPending}
                  >
                    Test Connection
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Job Scheduler */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Card className="glass border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Clock className="w-5 h-5 text-accent" />
                  Job Scheduler
                </CardTitle>
                <CardDescription>Automated task scheduling settings</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    name: "Asset Sync",
                    schedule: `Every ${systemStatusQuery.data?.jobs.snipeSyncIntervalMinutes ?? 60} min`,
                    active: systemStatusQuery.data?.jobs.snipeSyncEnabled ?? false,
                  },
                  {
                    name: "Schedule Calc",
                    schedule: `Every ${systemStatusQuery.data?.jobs.scheduleCalcIntervalMinutes ?? 10} min`,
                    active: systemStatusQuery.data?.jobs.enabled ?? false,
                  },
                  {
                    name: "Notifications",
                    schedule: `Every ${systemStatusQuery.data?.jobs.notificationIntervalMinutes ?? 60} min`,
                    active: systemStatusQuery.data?.jobs.enabled ?? false,
                  },
                ].map((job, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div>
                      <p className="font-medium text-foreground">{job.name}</p>
                      <p className="text-xs text-muted-foreground">{job.schedule}</p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant="outline"
                        className={job.active ? "bg-success/20 text-success border-success/30" : "bg-muted text-muted-foreground border-border"}
                      >
                        {job.active ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>

          {/* Evidence Import */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
          >
            <Card className="glass border-border">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Upload className="w-5 h-5 text-primary" />
                  Evidence Import
                </CardTitle>
                <CardDescription>Move backdated evidence into the correct folder structure</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Template</Label>
                  <Select value={importTemplateId} onValueChange={setImportTemplateId}>
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__asset_default__">Use asset default template</SelectItem>
                      {(templatesQuery.data?.items ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Duplicates</Label>
                  <Select
                    value={importDuplicateAction}
                    onValueChange={(v) => setImportDuplicateAction(v === "replace" ? "replace" : "skip")}
                  >
                    <SelectTrigger className="bg-muted/50">
                      <SelectValue placeholder="Duplicate handling" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="skip">Skip existing</SelectItem>
                      <SelectItem value="replace">Replace (delete and recreate task)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={() => importMutation.mutate()}
                  disabled={importMutation.isPending || templatesQuery.isLoading}
                >
                  <Upload className="w-4 h-4" />
                  Run Import
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* System Logs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="lg:col-span-2"
          >
            <Card className="glass border-border">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-foreground flex items-center gap-2">
                      <Activity className="w-5 h-5 text-primary" />
                      System Logs
                    </CardTitle>
                    <CardDescription>Recent system activity and events</CardDescription>
                  </div>
                  <Button variant="outline" disabled>
                    View Full Logs
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentLogs.map((log, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                    >
                      <div className={`w-2 h-2 rounded-full ${
                        log.type === "warn" ? "bg-warning" :
                        log.type === "error" ? "bg-destructive" : "bg-primary"
                      }`} />
                      <span className="flex-1 text-sm text-foreground">{log.message}</span>
                      <span className="text-xs text-muted-foreground">{log.time}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default SystemSettings;
