import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Download,
  FileText,
  Calendar as CalendarIcon,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Server,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { endOfDay, format, parseISO, startOfDay, subDays } from "date-fns";
import { apiGetComplianceReport, apiGetOverdueReport, apiGetSystemLogs } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { DateRange } from "react-day-picker";

const Reports = () => {
  const [periodKey, setPeriodKey] = useState("last30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);

  const setPeriod = (next: string) => {
    setPeriodKey(next);
    if (next === "custom") {
      setCustomRange((prev) => {
        if (prev?.from && prev?.to) return prev;
        const now = new Date();
        return { from: subDays(now, 29), to: now };
      });
    }
  };

  const { from, to, label } = useMemo(() => {
    const now = new Date();
    if (periodKey === "custom") {
      const customFrom = customRange?.from;
      const customTo = customRange?.to;
      if (customFrom && customTo) {
        return {
          from: startOfDay(customFrom).toISOString(),
          to: endOfDay(customTo).toISOString(),
          label: `${format(customFrom, "yyyy-MM-dd")} → ${format(customTo, "yyyy-MM-dd")}`,
        };
      }
    }

    if (periodKey === "today") {
      return {
        from: startOfDay(now).toISOString(),
        to: endOfDay(now).toISOString(),
        label: "Today",
      };
    }

    if (periodKey === "last7") {
      return {
        from: startOfDay(subDays(now, 6)).toISOString(),
        to: endOfDay(now).toISOString(),
        label: "Last 7 days",
      };
    }

    if (periodKey === "last90") {
      return {
        from: startOfDay(subDays(now, 89)).toISOString(),
        to: endOfDay(now).toISOString(),
        label: "Last 90 days",
      };
    }

    return {
      from: startOfDay(subDays(now, 29)).toISOString(),
      to: endOfDay(now).toISOString(),
      label: "Last 30 days",
    };
  }, [periodKey, customRange?.from, customRange?.to]);

  const complianceQuery = useQuery({
    queryKey: ["reports", "compliance", from, to],
    queryFn: () => apiGetComplianceReport({ from, to }),
    staleTime: 30_000,
  });

  const overdueQuery = useQuery({
    queryKey: ["reports", "overdue"],
    queryFn: () => apiGetOverdueReport({ page: 1, pageSize: 50 }),
    staleTime: 30_000,
  });

  const logsQuery = useQuery({
    queryKey: ["system", "logs", "recent"],
    queryFn: () => apiGetSystemLogs({ page: 1, pageSize: 8 }),
    staleTime: 15_000,
  });

  const complianceRateText =
    complianceQuery.data?.complianceRate === null || complianceQuery.data?.complianceRate === undefined
      ? "—"
      : `${Math.round(complianceQuery.data.complianceRate * 1000) / 10}%`;

  const quickStats = [
    {
      label: "Total Due",
      value: complianceQuery.data ? String(complianceQuery.data.totalDue) : "—",
      trend: label,
    },
    {
      label: "Completed",
      value: complianceQuery.data ? String(complianceQuery.data.completedTotal) : "—",
      trend: "",
    },
    {
      label: "Compliance",
      value: complianceRateText,
      trend: "On-time completions",
    },
    {
      label: "Currently Overdue",
      value: complianceQuery.data ? String(complianceQuery.data.currentlyOverdue) : "—",
      trend: overdueQuery.data ? `${overdueQuery.data.overdueCount} overdue tasks total` : "",
    },
  ];

  const reportTypes = [
    {
      title: "Compliance Summary",
      description: "On-time completion rates within the selected period",
      icon: TrendingUp,
      color: "success",
      action: () => {
        void complianceQuery.refetch();
        toast({ title: "Compliance refreshed" });
      },
    },
    {
      title: "Overdue Tasks",
      description: "Current overdue tasks list (paged)",
      icon: AlertTriangle,
      color: "warning",
      action: () => {
        void overdueQuery.refetch();
        toast({ title: "Overdue refreshed" });
      },
    },
    {
      title: "System Logs",
      description: "Recent backend activity for audit and troubleshooting",
      icon: FileText,
      color: "primary",
      action: () => {
        void logsQuery.refetch();
        toast({ title: "Logs refreshed" });
      },
    },
    {
      title: "Assets Without PM",
      description: "Not implemented yet",
      icon: Server,
      color: "destructive",
      action: () => {
        toast({ title: "Not implemented", description: "This report export is not wired yet." });
      },
    },
  ];

  return (
    <div className="min-h-screen">
      <Header title="Reports & Audit" subtitle="Generate compliance reports and audit trails" />

      <div className="p-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {quickStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="stat-card"
            >
              <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-success mt-1">{stat.trend}</p>
            </motion.div>
          ))}
        </div>

        {/* Report Period Selector */}
        <div className="flex items-center gap-4">
          <Select value={periodKey} onValueChange={setPeriod}>
            <SelectTrigger className="w-48 bg-muted/50">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="last30">Last 30 days</SelectItem>
              <SelectItem value="last90">Last 90 days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setPeriod("custom")}
              >
                <CalendarIcon className="w-4 h-4" />
                Custom Range
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="range"
                selected={customRange}
                onSelect={setCustomRange}
                numberOfMonths={2}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reportTypes.map((report, index) => (
            <motion.div
              key={report.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              <Card className="glass border-border hover:border-primary/50 transition-all duration-300 cursor-pointer group">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl bg-${report.color}/20 flex items-center justify-center`}>
                      <report.icon className={`w-6 h-6 text-${report.color}`} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="gap-2" disabled>
                        <FileText className="w-4 h-4" />
                        PDF
                      </Button>
                      <Button size="sm" variant="outline" className="gap-2" disabled>
                        <Download className="w-4 h-4" />
                        Excel
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-foreground mt-4">{report.title}</CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Period: {label}</span>
                    <Button variant="ghost" size="sm" className="text-primary" onClick={report.action}>
                      Generate New
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Audit Trail Preview */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="glass rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Recent Audit Trail</h3>
              <p className="text-sm text-muted-foreground">System activity log for compliance tracking</p>
            </div>
            <Button variant="outline">View Full Log</Button>
          </div>

          <div className="space-y-4">
            {logsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading logs…</div>
            ) : logsQuery.isError ? (
              <div className="text-sm text-destructive">Failed to load logs.</div>
            ) : (
              (logsQuery.data?.items ?? []).map((log) => {
                const level = log.level.toLowerCase();
                const dotColor = level === "error" ? "bg-destructive" : level === "warn" ? "bg-warning" : "bg-primary";
                return (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{log.message}</p>
                        <p className="text-sm text-muted-foreground truncate">{log.context ?? ""}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-foreground">{log.level}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(parseISO(log.createdAt), "yyyy-MM-dd HH:mm")}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Reports;
