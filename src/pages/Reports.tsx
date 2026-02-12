import { motion } from "framer-motion";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileText,
  Calendar as CalendarIcon,
  TrendingUp,
  AlertTriangle,
  Server,
  Activity,
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
import {
  ApiError,
  apiDownloadAssetsWithoutPmCsv,
  apiDownloadComplianceReportCsv,
  apiDownloadOverdueReportCsv,
  apiDownloadSystemLogsCsv,
  apiDownloadCmMetricsCsv,
  apiGetComplianceReport,
  apiGetCmMetrics,
  apiGetLookups,
  apiGetOverdueReport,
  apiGetSystemLogs,
  type MaintenanceTypeFilter,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import type { DateRange } from "react-day-picker";

const Reports = () => {
  const [periodKey, setPeriodKey] = useState("last30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [maintenanceType, setMaintenanceType] = useState<MaintenanceTypeFilter>("PM");
  const [exporting, setExporting] = useState<{
    compliance: boolean;
    overdue: boolean;
    logs: boolean;
    assetsWithoutPm: boolean;
    cmMetrics: boolean;
  }>({
    compliance: false,
    overdue: false,
    logs: false,
    assetsWithoutPm: false,
    cmMetrics: false,
  });

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

  const locationId = selectedLocationId === "all" ? undefined : selectedLocationId;
  const categoryId = selectedCategoryId === "all" ? undefined : selectedCategoryId;

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    staleTime: 5 * 60_000,
  });

  const complianceQuery = useQuery({
    queryKey: ["reports", "compliance", from, to, locationId ?? null, categoryId ?? null, maintenanceType],
    queryFn: () => apiGetComplianceReport({ from, to, locationId, categoryId, maintenanceType }),
    staleTime: 30_000,
  });

  const overdueQuery = useQuery({
    queryKey: ["reports", "overdue", locationId ?? null, categoryId ?? null, maintenanceType],
    queryFn: () => apiGetOverdueReport({ page: 1, pageSize: 50, locationId, categoryId, maintenanceType }),
    staleTime: 30_000,
  });

  const logsQuery = useQuery({
    queryKey: ["system", "logs", "recent"],
    queryFn: () => apiGetSystemLogs({ page: 1, pageSize: 8 }),
    staleTime: 15_000,
  });

  const cmMetricsQuery = useQuery({
    queryKey: ["reports", "cm-metrics", from, to, locationId ?? null, categoryId ?? null],
    queryFn: () => apiGetCmMetrics({ from, to, locationId, categoryId }),
    staleTime: 30_000,
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

  const downloadBlob = (input: { blob: Blob; fileName: string | null }, fallbackName: string) => {
    const url = URL.createObjectURL(input.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = input.fileName ?? fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const exportComplianceCsv = async () => {
    try {
      setExporting((prev) => ({ ...prev, compliance: true }));
      const res = await apiDownloadComplianceReportCsv({ from, to, locationId, categoryId, maintenanceType });
      downloadBlob(res, `compliance-summary_${from.slice(0, 10)}_${to.slice(0, 10)}.csv`);
      toast({ title: "Exported", description: "Compliance CSV downloaded." });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Export failed";
      toast({ title: "Export failed", description: message, variant: "destructive" });
    } finally {
      setExporting((prev) => ({ ...prev, compliance: false }));
    }
  };

  const exportOverdueCsv = async () => {
    try {
      setExporting((prev) => ({ ...prev, overdue: true }));
      const res = await apiDownloadOverdueReportCsv({ locationId, categoryId, maintenanceType });
      downloadBlob(res, `overdue-tasks_${new Date().toISOString().slice(0, 10)}.csv`);
      toast({ title: "Exported", description: "Overdue tasks CSV downloaded." });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Export failed";
      toast({ title: "Export failed", description: message, variant: "destructive" });
    } finally {
      setExporting((prev) => ({ ...prev, overdue: false }));
    }
  };

  const exportLogsCsv = async () => {
    try {
      setExporting((prev) => ({ ...prev, logs: true }));
      const res = await apiDownloadSystemLogsCsv({ from, to, maxRows: 5000 });
      downloadBlob(res, `system-logs_${from.slice(0, 10)}_${to.slice(0, 10)}.csv`);
      toast({ title: "Exported", description: "System logs CSV downloaded." });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Export failed";
      toast({ title: "Export failed", description: message, variant: "destructive" });
    } finally {
      setExporting((prev) => ({ ...prev, logs: false }));
    }
  };

  const exportAssetsWithoutPmCsv = async () => {
    try {
      setExporting((prev) => ({ ...prev, assetsWithoutPm: true }));
      const res = await apiDownloadAssetsWithoutPmCsv({ locationId, categoryId });
      downloadBlob(res, `assets-without-pm_${new Date().toISOString().slice(0, 10)}.csv`);
      toast({ title: "Exported", description: "Assets without PM CSV downloaded." });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Export failed";
      toast({ title: "Export failed", description: message, variant: "destructive" });
    } finally {
      setExporting((prev) => ({ ...prev, assetsWithoutPm: false }));
    }
  };

  const exportCmMetricsCsv = async () => {
    try {
      setExporting((prev) => ({ ...prev, cmMetrics: true }));
      const res = await apiDownloadCmMetricsCsv({ from, to, locationId, categoryId });
      downloadBlob(res, `cm-metrics_${from.slice(0, 10)}_${to.slice(0, 10)}.csv`);
      toast({ title: "Exported", description: "CM metrics CSV downloaded." });
    } catch (err: unknown) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Export failed";
      toast({ title: "Export failed", description: message, variant: "destructive" });
    } finally {
      setExporting((prev) => ({ ...prev, cmMetrics: false }));
    }
  };

  const reportTypes: Array<{
    key: "compliance" | "overdue" | "logs" | "assets-without-pm" | "cm-metrics";
    title: string;
    description: string;
    icon: typeof TrendingUp;
    color: string;
    action: () => void;
  }> = [
    {
      key: "compliance",
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
      key: "cm-metrics",
      title: "CM Metrics",
      description: "Corrective maintenance breakdowns and MTTR (reported-to-complete)",
      icon: Activity,
      color: "accent",
      action: () => {
        void cmMetricsQuery.refetch();
        toast({ title: "CM metrics refreshed" });
      },
    },
    {
      key: "overdue",
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
      key: "logs",
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
      key: "assets-without-pm",
      title: "Assets Without PM",
      description: "Assets missing PM enablement or a default template",
      icon: Server,
      color: "destructive",
      action: () => {
        toast({ title: "Tip", description: "Use CSV export for the full list." });
      },
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header title="Reports & Audit" subtitle="Generate compliance reports and audit trails" />

      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {quickStats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card className="border-border/60 bg-card/70 shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-5">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-semibold text-foreground mt-2 tabular-nums leading-none">
                    {stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 min-h-[16px]">{stat.trend}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <div className="rounded-xl border border-border/60 bg-card/70 shadow-sm p-4">
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-4">
              <Select value={periodKey} onValueChange={setPeriod}>
                <SelectTrigger className="w-full bg-background border-border/60">
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
            </div>
            <div className="col-span-12 md:col-span-4">
              <Select value={selectedLocationId} onValueChange={setSelectedLocationId}>
                <SelectTrigger className="w-full bg-background border-border/60">
                  <SelectValue placeholder="All locations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All locations</SelectItem>
                  {(lookupsQuery.data?.locations ?? [])
                    .filter((l) => l.isActive)
                    .map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-12 md:col-span-4">
              <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                <SelectTrigger className="w-full bg-background border-border/60">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {(lookupsQuery.data?.assetCategories ?? [])
                    .filter((c) => c.isActive)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-4">
              <Select
                value={maintenanceType}
                onValueChange={(value) => setMaintenanceType(value as MaintenanceTypeFilter)}
              >
                <SelectTrigger className="w-full bg-background border-border/60">
                  <SelectValue placeholder="Maintenance type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PM">PM only</SelectItem>
                  <SelectItem value="CM">CM only</SelectItem>
                  <SelectItem value="all">PM + CM</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-12 md:col-span-6">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="gap-2 w-full bg-background border-border/60"
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
            <div className="col-span-12 md:col-span-6 flex gap-2">
              <Button
                variant="outline"
                className="flex-1 bg-background border-border/60 shadow-sm"
                onClick={() => {
                  setSelectedLocationId("all");
                  setSelectedCategoryId("all");
                  setMaintenanceType("PM");
                }}
              >
                Clear Filters
              </Button>
              <Button
                className="flex-1 shadow-sm"
                onClick={() => {
                  void complianceQuery.refetch();
                  void overdueQuery.refetch();
                  void logsQuery.refetch();
                  toast({ title: "Reports refreshed" });
                }}
              >
                Refresh
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {reportTypes.map((report, index) => (
            <motion.div
              key={report.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + index * 0.1 }}
            >
              <Card className="border-border/60 bg-card/70 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className={`w-12 h-12 rounded-xl bg-${report.color}/20 flex items-center justify-center`}>
                      <report.icon className={`w-6 h-6 text-${report.color}`} />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (report.key === "compliance") void exportComplianceCsv();
                          if (report.key === "overdue") void exportOverdueCsv();
                          if (report.key === "logs") void exportLogsCsv();
                          if (report.key === "assets-without-pm") void exportAssetsWithoutPmCsv();
                          if (report.key === "cm-metrics") void exportCmMetricsCsv();
                        }}
                        disabled={
                          (report.key === "compliance" && exporting.compliance) ||
                          (report.key === "overdue" && exporting.overdue) ||
                          (report.key === "logs" && exporting.logs) ||
                          (report.key === "assets-without-pm" && exporting.assetsWithoutPm) ||
                          (report.key === "cm-metrics" && exporting.cmMetrics)
                        }
                      >
                        <Download className="w-4 h-4" />
                        CSV
                      </Button>
                    </div>
                  </div>
                  <CardTitle className="text-foreground mt-4 text-base font-semibold">{report.title}</CardTitle>
                  <CardDescription>{report.description}</CardDescription>
                </CardHeader>
                <CardContent className="pt-3 border-t border-border/60">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {report.key === "overdue"
                        ? "Scope: current overdue"
                        : report.key === "assets-without-pm"
                          ? "Scope: all assets"
                          : `Period: ${label}`}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-primary hover:bg-primary/10"
                      onClick={report.action}
                    >
                      Generate New
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">CM Metrics Overview</CardTitle>
              <CardDescription>Breakdowns and MTTR for corrective maintenance</CardDescription>
            </CardHeader>
            <CardContent>
              {cmMetricsQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading CM metrics…</div>
              ) : cmMetricsQuery.isError ? (
                <div className="text-sm text-destructive">Failed to load CM metrics.</div>
              ) : !cmMetricsQuery.data ? (
                <div className="text-sm text-muted-foreground">No CM metrics available for the selected filters.</div>
              ) : (
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-6 lg:col-span-3 space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">By Category</p>
                    <div className="space-y-1">
                      {cmMetricsQuery.data.breakdownByCategory.map((row) => (
                        <div key={`cat-${row.name}`} className="flex justify-between text-sm">
                          <span className="text-foreground truncate max-w-[70%]">{row.name || "Uncategorized"}</span>
                          <span className="text-muted-foreground">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-6 lg:col-span-3 space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">By Location</p>
                    <div className="space-y-1">
                      {cmMetricsQuery.data.breakdownByLocation.map((row) => (
                        <div key={`loc-${row.name}`} className="flex justify-between text-sm">
                          <span className="text-foreground truncate max-w-[70%]">{row.name || "Unassigned"}</span>
                          <span className="text-muted-foreground">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-6 lg:col-span-3 space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">By Failure Category</p>
                    <div className="space-y-1">
                      {cmMetricsQuery.data.breakdownByFailureCategory.map((row) => (
                        <div key={`fail-${row.name}`} className="flex justify-between text-sm">
                          <span className="text-foreground truncate max-w-[70%]">{row.name || "Unspecified"}</span>
                          <span className="text-muted-foreground">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-6 lg:col-span-3 space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">By Impact Level</p>
                    <div className="space-y-1">
                      {cmMetricsQuery.data.breakdownByImpactLevel.map((row) => (
                        <div key={`impact-${row.name}`} className="flex justify-between text-sm">
                          <span className="text-foreground truncate max-w-[70%]">{row.name || "Unspecified"}</span>
                          <span className="text-muted-foreground">{row.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-12 md:col-span-6 lg:col-span-4 space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">MTTR by Category (hours)</p>
                    <div className="space-y-1">
                      {cmMetricsQuery.data.mttrByCategory.map((row) => (
                        <div key={`mttr-cat-${row.name}`} className="flex justify-between text-sm">
                          <span className="text-foreground truncate max-w-[70%]">{row.name || "Uncategorized"}</span>
                          <span className="text-muted-foreground">
                            {row.seconds > 0 ? (row.seconds / 3600).toFixed(1) : "0.0"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-6 lg:col-span-4 space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">MTTR by Location (hours)</p>
                    <div className="space-y-1">
                      {cmMetricsQuery.data.mttrByLocation.map((row) => (
                        <div key={`mttr-loc-${row.name}`} className="flex justify-between text-sm">
                          <span className="text-foreground truncate max-w-[70%]">{row.name || "Unassigned"}</span>
                          <span className="text-muted-foreground">
                            {row.seconds > 0 ? (row.seconds / 3600).toFixed(1) : "0.0"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-12 md:col-span-12 lg:col-span-4 space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Monthly Incidents</p>
                    <div className="space-y-1">
                      {cmMetricsQuery.data.monthlyIncidents.map((row) => (
                        <div key={`month-${row.monthStart}`} className="flex justify-between text-sm">
                          <span className="text-foreground">
                            {row.monthStart ? format(new Date(row.monthStart), "yyyy-MM") : "Unknown"}
                          </span>
                          <span className="text-muted-foreground">{row.incidentCount}</span>
                        </div>
                      ))}
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
          transition={{ delay: 0.6 }}
        >
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Recent Audit Trail</CardTitle>
                  <CardDescription>System activity log for compliance tracking</CardDescription>
                </div>
                <Button variant="outline" className="bg-background border-border/60">
                  View Full Log
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {logsQuery.isLoading ? (
                  <div className="text-sm text-muted-foreground">Loading logs…</div>
                ) : logsQuery.isError ? (
                  <div className="text-sm text-destructive">Failed to load logs.</div>
                ) : (
                  (logsQuery.data?.items ?? []).map((log) => {
                    const level = log.level.toLowerCase();
                    const dotColor =
                      level === "error" ? "bg-destructive" : level === "warn" ? "bg-warning" : "bg-primary";
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
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default Reports;
