import { motion } from "framer-motion";
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
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const SystemSettings = () => {
  const systemStatus = [
    { name: "Snipe-IT Connection", status: "connected", lastCheck: "2 min ago" },
    { name: "Database", status: "healthy", lastCheck: "1 min ago" },
    { name: "Job Scheduler", status: "running", lastCheck: "5 min ago" },
    { name: "Email Service", status: "connected", lastCheck: "10 min ago" },
  ];

  const recentLogs = [
    { type: "info", message: "Snipe-IT sync completed successfully", time: "10:45 AM" },
    { type: "info", message: "PM Task PM-2026-001 completed by John Doe", time: "10:30 AM" },
    { type: "warning", message: "API rate limit approaching (80%)", time: "10:15 AM" },
    { type: "info", message: "Daily backup completed", time: "06:00 AM" },
    { type: "info", message: "System health check passed", time: "05:00 AM" },
  ];

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
                      item.status === "connected" || item.status === "healthy" || item.status === "running"
                        ? "bg-success"
                        : "bg-warning"
                    }`} />
                    <span className="text-sm font-medium text-foreground capitalize">{item.status}</span>
                  </div>
                </div>
                <CheckCircle className="w-5 h-5 text-success" />
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
                    <Input value="https://assets.company.com" className="bg-muted/50" readOnly />
                    <Button variant="outline" size="icon">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>API Token</Label>
                  <div className="flex gap-2">
                    <Input type="password" value="••••••••••••••••" className="bg-muted/50" readOnly />
                    <Button variant="outline">Update</Button>
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div>
                    <p className="font-medium text-foreground">Auto Sync</p>
                    <p className="text-sm text-muted-foreground">Sync every 15 minutes</p>
                  </div>
                  <Switch checked />
                </div>

                <div className="flex gap-2">
                  <Button className="flex-1 gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Sync Now
                  </Button>
                  <Button variant="outline">Test Connection</Button>
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
                  { name: "Asset Sync", schedule: "Every 15 min", lastRun: "10:45 AM", nextRun: "11:00 AM" },
                  { name: "PM Generation", schedule: "Daily 6 AM", lastRun: "6:00 AM", nextRun: "Tomorrow" },
                  { name: "Reminder Emails", schedule: "Daily 8 AM", lastRun: "8:00 AM", nextRun: "Tomorrow" },
                  { name: "Database Backup", schedule: "Daily 2 AM", lastRun: "2:00 AM", nextRun: "Tomorrow" },
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
                      <Badge variant="outline" className="bg-success/20 text-success border-success/30">
                        Active
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">Next: {job.nextRun}</p>
                    </div>
                  </div>
                ))}
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
                  <Button variant="outline">View Full Logs</Button>
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
                        log.type === "warning" ? "bg-warning" :
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
