import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Key, Mail, MessageSquare, Save, Send, Shield } from "lucide-react";
import Header from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  ApiError,
  apiCreateNotificationChannel,
  apiGetMicrosoftGraphSettings,
  apiGetWhatsAppSettings,
  apiListNotificationChannels,
  apiTestMicrosoftGraphSettings,
  apiTestWhatsAppSettings,
  apiUpdateMicrosoftGraphSettings,
  apiUpdateNotificationChannel,
  apiUpdateWhatsAppSettings,
  type NotificationChannel,
  type TestMicrosoftGraphSettingsResponse,
  type TestWhatsAppSettingsResponse,
  type UpdateMicrosoftGraphSettingsInput,
  type UpdateWhatsAppSettingsInput,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

const splitList = (value: string): string[] => {
  return value
    .split(/[\n,;]+/)
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
};

const joinList = (value: string[]): string => {
  return value.join(", ");
};

const SettingsNotifications = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"email" | "whatsapp" | "push">("email");

  const settingsQuery = useQuery({
    queryKey: ["settings", "notifications", "ms-graph"],
    queryFn: apiGetMicrosoftGraphSettings,
  });

  const whatsAppSettingsQuery = useQuery({
    queryKey: ["settings", "notifications", "whatsapp"],
    queryFn: apiGetWhatsAppSettings,
  });

  const [enabled, setEnabled] = useState<boolean>(false);
  const [tenantId, setTenantId] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [senderEmail, setSenderEmail] = useState<string>("");
  const [useLoggedInUserAsSender, setUseLoggedInUserAsSender] = useState<boolean>(true);
  const [scopeText, setScopeText] = useState<string>("https://graph.microsoft.com/.default");

  const [editSecret, setEditSecret] = useState<boolean>(false);
  const [clientSecret, setClientSecret] = useState<string>("");

  const [defaultToRecipientsText, setDefaultToRecipientsText] = useState<string>("");
  const [defaultCcRecipientsText, setDefaultCcRecipientsText] = useState<string>("");
  const [defaultBccRecipientsText, setDefaultBccRecipientsText] = useState<string>("");
  const [emailSubjectTemplate, setEmailSubjectTemplate] = useState<string>("");
  const [emailBodyTemplate, setEmailBodyTemplate] = useState<string>("");

  const [sendTestEmail, setSendTestEmail] = useState<boolean>(false);

  const [whatsAppEnabled, setWhatsAppEnabled] = useState<boolean>(false);
  const [whatsAppBaseUrl, setWhatsAppBaseUrl] = useState<string>("");
  const [whatsAppTarget, setWhatsAppTarget] = useState<"single" | "group">("group");
  const [whatsAppDefaultNumber, setWhatsAppDefaultNumber] = useState<string>("");
  const [whatsAppGroupId, setWhatsAppGroupId] = useState<string>("");
  const [whatsAppGroupName, setWhatsAppGroupName] = useState<string>("");
  const [whatsAppMentionNumbersText, setWhatsAppMentionNumbersText] = useState<string>("");
  const [sendTestWhatsApp, setSendTestWhatsApp] = useState<boolean>(false);

  const cardClassName = "metronic-card";

  useEffect(() => {
    const data = settingsQuery.data;
    if (!data) return;

    setEnabled(data.enabled);
    setTenantId(data.tenantId ?? "");
    setClientId(data.clientId ?? "");
    setSenderEmail(data.senderEmail ?? "");
    setUseLoggedInUserAsSender(data.useLoggedInUserAsSender);
    setScopeText(joinList(data.scope));

    setEditSecret(false);
    setClientSecret("");

    setDefaultToRecipientsText(joinList(data.defaultToRecipients));
    setDefaultCcRecipientsText(joinList(data.defaultCcRecipients));
    setDefaultBccRecipientsText(joinList(data.defaultBccRecipients));
    setEmailSubjectTemplate(data.emailSubjectTemplate ?? "");
    setEmailBodyTemplate(data.emailBodyTemplate ?? "");
  }, [settingsQuery.data]);

  useEffect(() => {
    const data = whatsAppSettingsQuery.data;
    if (!data) return;

    setWhatsAppEnabled(data.enabled);
    setWhatsAppBaseUrl(data.baseUrl ?? "");
    setWhatsAppTarget(data.target);
    setWhatsAppDefaultNumber(data.defaultNumber ?? "");
    setWhatsAppGroupId(data.groupId ?? "");
    setWhatsAppGroupName(data.groupName ?? "");
    setWhatsAppMentionNumbersText(joinList(data.mentionNumbers));
  }, [whatsAppSettingsQuery.data]);

  const clientSecretConfigured = settingsQuery.data?.clientSecretConfigured ?? false;
  const lastTestText = useMemo(() => {
    const raw = settingsQuery.data?.lastConnectionTestAt;
    if (!raw) return "Never";
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
  }, [settingsQuery.data?.lastConnectionTestAt]);

  const payload = useMemo((): UpdateMicrosoftGraphSettingsInput => {
    const scope = splitList(scopeText);
    return {
      tenantId: tenantId.trim() ? tenantId.trim() : null,
      clientId: clientId.trim() ? clientId.trim() : null,
      scope,
      senderEmail: senderEmail.trim() ? senderEmail.trim() : null,
      useLoggedInUserAsSender,
      defaultToRecipients: splitList(defaultToRecipientsText),
      defaultCcRecipients: splitList(defaultCcRecipientsText),
      defaultBccRecipients: splitList(defaultBccRecipientsText),
      emailSubjectTemplate: emailSubjectTemplate.trim() ? emailSubjectTemplate.trim() : null,
      emailBodyTemplate: emailBodyTemplate.trim() ? emailBodyTemplate : null,
      enabled,
      ...(editSecret ? { clientSecret: clientSecret.trim() ? clientSecret.trim() : null } : {}),
    };
  }, [
    clientId,
    clientSecret,
    defaultBccRecipientsText,
    defaultCcRecipientsText,
    defaultToRecipientsText,
    editSecret,
    emailBodyTemplate,
    emailSubjectTemplate,
    enabled,
    scopeText,
    senderEmail,
    tenantId,
    useLoggedInUserAsSender,
  ]);

  const whatsAppPayload = useMemo((): UpdateWhatsAppSettingsInput => {
    return {
      enabled: whatsAppEnabled,
      baseUrl: whatsAppBaseUrl.trim() ? whatsAppBaseUrl.trim() : null,
      target: whatsAppTarget,
      defaultNumber: whatsAppDefaultNumber.trim() ? whatsAppDefaultNumber.trim() : null,
      groupId: whatsAppGroupId.trim() ? whatsAppGroupId.trim() : null,
      groupName: whatsAppGroupName.trim() ? whatsAppGroupName.trim() : null,
      mentionNumbers: splitList(whatsAppMentionNumbersText),
    };
  }, [
    whatsAppBaseUrl,
    whatsAppDefaultNumber,
    whatsAppEnabled,
    whatsAppGroupId,
    whatsAppGroupName,
    whatsAppMentionNumbersText,
    whatsAppTarget,
  ]);

  const saveMutation = useMutation({
    mutationFn: async () => apiUpdateMicrosoftGraphSettings(payload),
    onSuccess: async (data) => {
      queryClient.setQueryData(["settings", "notifications", "ms-graph"], data);
      await queryClient.invalidateQueries({ queryKey: ["system-status"] });
      toast({ title: "Saved", description: "Microsoft Graph settings updated." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to save settings";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => apiTestMicrosoftGraphSettings({ ...payload, sendTestEmail }),
    onSuccess: async (data: TestMicrosoftGraphSettingsResponse) => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "notifications", "ms-graph"] });

      const testEmailSent =
        "testEmailSent" in data && typeof data.testEmailSent === "boolean" ? data.testEmailSent : false;

      toast({
        title: testEmailSent ? "Test email sent" : "Connection ok",
        description: testEmailSent
          ? "Microsoft Graph sendMail succeeded using your configured recipients."
          : "Microsoft Graph token request succeeded.",
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Connection test failed";
      toast({ title: "Test failed", description: message, variant: "destructive" });
    },
  });

  const whatsAppSaveMutation = useMutation({
    mutationFn: async () => apiUpdateWhatsAppSettings(whatsAppPayload),
    onSuccess: async (data) => {
      queryClient.setQueryData(["settings", "notifications", "whatsapp"], data);
      await queryClient.invalidateQueries({ queryKey: ["system-status"] });
      toast({ title: "Saved", description: "WhatsApp settings updated." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to save settings";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  const whatsAppTestMutation = useMutation({
    mutationFn: async () => apiTestWhatsAppSettings({ ...whatsAppPayload, sendTestMessage: sendTestWhatsApp }),
    onSuccess: async (data: TestWhatsAppSettingsResponse) => {
      await queryClient.invalidateQueries({ queryKey: ["settings", "notifications", "whatsapp"] });

      const testMessageSent =
        "testMessageSent" in data && typeof data.testMessageSent === "boolean" ? data.testMessageSent : false;

      toast({
        title: testMessageSent ? "Test message sent" : "Connection ok",
        description: testMessageSent
          ? "WhatsApp API send succeeded using your configured target."
          : "WhatsApp base URL is present.",
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Connection test failed";
      toast({ title: "Test failed", description: message, variant: "destructive" });
    },
  });

  const channelsQuery = useQuery({
    queryKey: ["notification-channels"],
    queryFn: apiListNotificationChannels,
  });

  const channelItems = useMemo(() => channelsQuery.data?.items ?? [], [channelsQuery.data?.items]);

  const pushChannel = useMemo(() => {
    return channelItems.find((channel) => channel.channelType.toLowerCase() === "push") ?? null;
  }, [channelItems]);

  const pushActive = Boolean(pushChannel?.isActive);

  const togglePushMutation = useMutation({
    mutationFn: async (input: { enable: boolean; channel: NotificationChannel | null }) => {
      if (input.channel) {
        await apiUpdateNotificationChannel({ channelId: input.channel.id, isActive: input.enable });
        return;
      }
      if (input.enable) {
        await apiCreateNotificationChannel({ channelType: "Push", channelName: "Push", isActive: true });
      }
    },
    onSuccess: async (_data, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["notification-channels"] });
      toast({ title: variables.enable ? "Push enabled" : "Push disabled" });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to update push channel";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Header title="Notification Settings" subtitle="Configure email and WhatsApp notifications" />

      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "email" | "whatsapp" | "push")}
          className="w-full"
        >
          <TabsList className="bg-muted/40 p-1 rounded-lg border border-border/60 shadow-sm">
            <TabsTrigger
              value="email"
              className="gap-2 rounded-md px-3 py-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
            >
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger
              value="whatsapp"
              className="gap-2 rounded-md px-3 py-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
            >
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger
              value="push"
              className="gap-2 rounded-md px-3 py-2 text-sm data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground"
            >
              <Bell className="h-4 w-4" />
              Push Notification
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email" className="mt-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-7">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={cardClassName}>
                    <CardHeader className="border-b border-border/60">
                      <CardTitle className="flex items-center gap-2">
                        <Mail className="w-5 h-5 text-primary" />
                        Microsoft Graph
                      </CardTitle>
                      <CardDescription>Used by notification jobs to send email</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Enable email notifications</p>
                          <p className="text-xs text-muted-foreground">Applies to server-side jobs</p>
                        </div>
                        <Switch checked={enabled} onCheckedChange={setEnabled} />
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-6 space-y-2">
                          <Label>Tenant ID</Label>
                          <Input value={tenantId} onChange={(e) => setTenantId(e.target.value)} className="bg-muted/30" />
                        </div>
                        <div className="col-span-12 md:col-span-6 space-y-2">
                          <Label>Client ID</Label>
                          <Input value={clientId} onChange={(e) => setClientId(e.target.value)} className="bg-muted/30" />
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-7 space-y-2">
                          <Label>Sender Email</Label>
                          <Input
                            value={senderEmail}
                            onChange={(e) => setSenderEmail(e.target.value)}
                            className="bg-muted/30"
                            placeholder="widji.santoso@company.com"
                          />
                        </div>
                        <div className="col-span-12 md:col-span-5 flex items-end">
                          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 w-full">
                            <Shield className="w-4 h-4 text-muted-foreground" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">Use logged-in sender</p>
                              <p className="text-xs text-muted-foreground">UI-only; jobs use Sender Email</p>
                            </div>
                            <Switch
                              checked={useLoggedInUserAsSender}
                              onCheckedChange={setUseLoggedInUserAsSender}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Scope (comma / newline separated)</Label>
                        <Textarea
                          value={scopeText}
                          onChange={(e) => setScopeText(e.target.value)}
                          className="bg-muted/30"
                          rows={2}
                        />
                      </div>

                      <div className="rounded-lg border border-border/60 bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-muted-foreground" />
                            <p className="text-sm font-medium text-foreground">Client Secret</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={clientSecretConfigured ? "secondary" : "destructive"}>
                              {clientSecretConfigured ? "Configured" : "Missing"}
                            </Badge>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Edit</span>
                              <Switch checked={editSecret} onCheckedChange={setEditSecret} />
                            </div>
                          </div>
                        </div>
                        {editSecret ? (
                          <Input
                            value={clientSecret}
                            onChange={(e) => setClientSecret(e.target.value)}
                            className="bg-muted/30"
                            placeholder="Paste new secret"
                            type="password"
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">Secret is never shown after saving.</p>
                        )}
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-4 space-y-2">
                          <Label>Default To</Label>
                          <Textarea
                            value={defaultToRecipientsText}
                            onChange={(e) => setDefaultToRecipientsText(e.target.value)}
                            className="bg-muted/30"
                            rows={3}
                          />
                        </div>
                        <div className="col-span-12 md:col-span-4 space-y-2">
                          <Label>Default Cc</Label>
                          <Textarea
                            value={defaultCcRecipientsText}
                            onChange={(e) => setDefaultCcRecipientsText(e.target.value)}
                            className="bg-muted/30"
                            rows={3}
                          />
                        </div>
                        <div className="col-span-12 md:col-span-4 space-y-2">
                          <Label>Default Bcc</Label>
                          <Textarea
                            value={defaultBccRecipientsText}
                            onChange={(e) => setDefaultBccRecipientsText(e.target.value)}
                            className="bg-muted/30"
                            rows={3}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-6 space-y-2">
                          <Label>Email Subject Template</Label>
                          <Input
                            value={emailSubjectTemplate}
                            onChange={(e) => setEmailSubjectTemplate(e.target.value)}
                            className="bg-muted/30"
                            placeholder="PM Reminder: {{taskNumber}} due {{dueAt}}"
                          />
                        </div>
                        <div className="col-span-12 md:col-span-6 space-y-2">
                          <Label>Last Connection Test</Label>
                          <div className="h-10 flex items-center rounded-md border border-border/60 bg-muted/20 px-3 text-sm text-muted-foreground">
                            {lastTestText}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Email Body Template</Label>
                        <Textarea
                          value={emailBodyTemplate}
                          onChange={(e) => setEmailBodyTemplate(e.target.value)}
                          className="bg-muted/30"
                          rows={8}
                          placeholder="{{message}}"
                        />
                        <p className="text-xs text-muted-foreground">
                          Available placeholders: {"{{taskNumber}}"}, {"{{dueAt}}"}, {"{{assetName}}"}, {"{{templateName}}"}, {"{{message}}"}.
                          The message value comes from the rule message template.
                        </p>
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-7 flex flex-wrap items-center gap-2">
                          <Button
                            className="gap-2"
                            onClick={() => saveMutation.mutate()}
                            disabled={saveMutation.isPending || settingsQuery.isLoading}
                          >
                            <Save className="w-4 h-4" />
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => testMutation.mutate()}
                            disabled={testMutation.isPending || settingsQuery.isLoading}
                          >
                            <Send className="w-4 h-4" />
                            Test Connection
                          </Button>
                          {settingsQuery.isError && (
                            <span className="text-sm text-destructive">Failed to load settings.</span>
                          )}
                          {settingsQuery.isLoading && (
                            <span className="text-sm text-muted-foreground">Loading…</span>
                          )}
                        </div>

                        <div className="col-span-12 md:col-span-5">
                          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">Send test email</p>
                              <p className="text-xs text-muted-foreground">Uses Default To/Cc/Bcc</p>
                            </div>
                            <Switch
                              checked={sendTestEmail}
                              onCheckedChange={setSendTestEmail}
                              disabled={testMutation.isPending || settingsQuery.isLoading}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <div className="col-span-12 md:col-span-5">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                  <Card className={cardClassName}>
                    <CardHeader className="border-b border-border/60">
                      <CardTitle>Notes</CardTitle>
                      <CardDescription>How this setting is used</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Job sender</span>
                        <span className="text-foreground">Sender Email</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Recipients</span>
                        <span className="text-foreground">Default To/Cc/Bcc</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Secret</span>
                        <span className="text-foreground">Stored in DB (masked)</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="whatsapp" className="mt-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-7">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={cardClassName}>
                    <CardHeader className="border-b border-border/60">
                      <CardTitle className="flex items-center gap-2">
                        <MessageSquare className="w-5 h-5 text-primary" />
                        WhatsApp
                      </CardTitle>
                      <CardDescription>Used by notification jobs to send WhatsApp messages</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Enable WhatsApp notifications</p>
                          <p className="text-xs text-muted-foreground">Applies to server-side jobs</p>
                        </div>
                        <Switch checked={whatsAppEnabled} onCheckedChange={setWhatsAppEnabled} />
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-7 space-y-2">
                          <Label>WhatsApp API Base URL</Label>
                          <Input
                            value={whatsAppBaseUrl}
                            onChange={(e) => setWhatsAppBaseUrl(e.target.value)}
                            className="bg-muted/30"
                            placeholder="http://localhost:3000"
                          />
                        </div>
                        <div className="col-span-12 md:col-span-5 space-y-2">
                          <Label>Send Target</Label>
                          <Select value={whatsAppTarget} onValueChange={(v) => setWhatsAppTarget(v as "single" | "group")}>
                            <SelectTrigger className="bg-muted/30">
                              <SelectValue placeholder="Select target" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="group">Group</SelectItem>
                              <SelectItem value="single">Single Number</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      {whatsAppTarget === "single" ? (
                        <div className="grid grid-cols-12 gap-4">
                          <div className="col-span-12 md:col-span-7 space-y-2">
                            <Label>Default Number</Label>
                            <Input
                              value={whatsAppDefaultNumber}
                              onChange={(e) => setWhatsAppDefaultNumber(e.target.value)}
                              className="bg-muted/30"
                              placeholder="6281234567890"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-12 gap-4">
                          <div className="col-span-12 md:col-span-6 space-y-2">
                            <Label>Group ID</Label>
                            <Input
                              value={whatsAppGroupId}
                              onChange={(e) => setWhatsAppGroupId(e.target.value)}
                              className="bg-muted/30"
                              placeholder="1203630xxxxxxxxx@g.us"
                            />
                          </div>
                          <div className="col-span-12 md:col-span-6 space-y-2">
                            <Label>Group Name</Label>
                            <Input
                              value={whatsAppGroupName}
                              onChange={(e) => setWhatsAppGroupName(e.target.value)}
                              className="bg-muted/30"
                              placeholder="My Group Name"
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Mentions (comma / newline separated)</Label>
                        <Textarea
                          value={whatsAppMentionNumbersText}
                          onChange={(e) => setWhatsAppMentionNumbersText(e.target.value)}
                          className="bg-muted/30"
                          rows={2}
                          placeholder="6281234567890, 6289998887777"
                        />
                      </div>

                      <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-12 md:col-span-7 flex flex-wrap items-center gap-2">
                          <Button
                            className="gap-2"
                            onClick={() => whatsAppSaveMutation.mutate()}
                            disabled={whatsAppSaveMutation.isPending || whatsAppSettingsQuery.isLoading}
                          >
                            <Save className="w-4 h-4" />
                            Save
                          </Button>
                          <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => whatsAppTestMutation.mutate()}
                            disabled={whatsAppTestMutation.isPending || whatsAppSettingsQuery.isLoading}
                          >
                            <Send className="w-4 h-4" />
                            Test Connection
                          </Button>
                          {whatsAppSettingsQuery.isError && (
                            <span className="text-sm text-destructive">Failed to load settings.</span>
                          )}
                          {whatsAppSettingsQuery.isLoading && (
                            <span className="text-sm text-muted-foreground">Loading…</span>
                          )}
                        </div>

                        <div className="col-span-12 md:col-span-5">
                          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                            <div>
                              <p className="text-sm font-medium text-foreground">Send test message</p>
                              <p className="text-xs text-muted-foreground">Uses configured group/number</p>
                            </div>
                            <Switch
                              checked={sendTestWhatsApp}
                              onCheckedChange={setSendTestWhatsApp}
                              disabled={whatsAppTestMutation.isPending || whatsAppSettingsQuery.isLoading}
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>

              <div className="col-span-12 md:col-span-5">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
                  <Card className={cardClassName}>
                    <CardHeader className="border-b border-border/60">
                      <CardTitle>Notes</CardTitle>
                      <CardDescription>How this setting is used</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Delivery</span>
                        <span className="text-foreground">WhatsApp API (send-message / send-group-message)</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Target</span>
                        <span className="text-foreground">Group ID/Name or Single Number</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Mentions</span>
                        <span className="text-foreground">Applied to group messages</span>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="push" className="mt-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-7">
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <Card className={cardClassName}>
                    <CardHeader className="border-b border-border/60">
                      <CardTitle className="flex items-center gap-2">
                        <Bell className="w-5 h-5 text-primary" />
                        Push Notification
                      </CardTitle>
                      <CardDescription>Control push notifications for all events</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {channelsQuery.isLoading ? (
                        <div className="text-sm text-muted-foreground">Loading push settings…</div>
                      ) : channelsQuery.isError ? (
                        <div className="text-sm text-destructive">Failed to load push settings.</div>
                      ) : (
                        <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 p-3">
                          <div>
                            <p className="text-sm font-medium text-foreground">Enable push notifications</p>
                            <p className="text-xs text-muted-foreground">
                              Applies to all events that use the Push channel.
                            </p>
                          </div>
                          <Switch
                            checked={pushActive}
                            onCheckedChange={(checked) =>
                              togglePushMutation.mutate({ enable: checked, channel: pushChannel })
                            }
                            disabled={togglePushMutation.isPending || channelsQuery.isLoading}
                          />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SettingsNotifications;
