import { motion } from "framer-motion";
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

const Notifications = () => {
  const reminderRules = [
    { name: "7 Days Before Due", timing: "H-7", enabled: true, channels: ["Email", "Teams"] },
    { name: "1 Day Before Due", timing: "H-1", enabled: true, channels: ["Email", "Teams"] },
    { name: "On Due Date", timing: "D-Day", enabled: true, channels: ["Email", "Teams", "WhatsApp"] },
  ];

  const escalationRules = [
    { name: "First Escalation", condition: "Overdue > 1 day", escalateTo: "Supervisor", enabled: true },
    { name: "Critical Escalation", condition: "Overdue > 3 days", escalateTo: "Manager", enabled: true },
    { name: "Executive Alert", condition: "Overdue > 7 days", escalateTo: "IT Director", enabled: false },
  ];

  const channels = [
    { name: "Email", icon: Mail, status: "connected", configured: true },
    { name: "Microsoft Teams", icon: MessageSquare, status: "connected", configured: true },
    { name: "WhatsApp", icon: MessageSquare, status: "pending", configured: false },
  ];

  const recentNotifications = [
    { type: "reminder", message: "PM due tomorrow for LAPTOP-001", time: "2 hours ago", read: false },
    { type: "escalation", message: "Escalated: SRV-WEB-01 overdue by 2 days", time: "5 hours ago", read: false },
    { type: "reminder", message: "Weekly PM summary sent to team", time: "1 day ago", read: true },
    { type: "system", message: "WhatsApp integration pending approval", time: "2 days ago", read: true },
  ];

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
                {reminderRules.map((rule, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Switch checked={rule.enabled} />
                        <span className="font-medium text-foreground">{rule.name}</span>
                      </div>
                      <Badge variant="secondary">{rule.timing}</Badge>
                    </div>
                    <div className="flex items-center gap-2 ml-11">
                      {rule.channels.map((channel) => (
                        <Badge key={channel} variant="outline" className="text-xs">
                          {channel}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
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
                {escalationRules.map((rule, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <Switch checked={rule.enabled} />
                        <span className="font-medium text-foreground">{rule.name}</span>
                      </div>
                      <Pencil className="w-4 h-4 text-muted-foreground cursor-pointer hover:text-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground ml-11">
                      {rule.condition} → Escalate to {rule.escalateTo}
                    </p>
                  </div>
                ))}
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
                {channels.map((channel, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer group flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        channel.status === "connected" ? "bg-success/20" : "bg-warning/20"
                      }`}>
                        <channel.icon className={`w-5 h-5 ${
                          channel.status === "connected" ? "text-success" : "text-warning"
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{channel.name}</p>
                        <p className="text-sm text-muted-foreground capitalize">{channel.status}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                ))}
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
                {recentNotifications.map((notif, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded-lg transition-colors ${
                      notif.read ? "bg-muted/20" : "bg-primary/10 border border-primary/20"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-2 h-2 rounded-full mt-2 ${
                        notif.type === "escalation" ? "bg-warning" :
                        notif.type === "reminder" ? "bg-primary" : "bg-muted-foreground"
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm text-foreground">{notif.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{notif.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
