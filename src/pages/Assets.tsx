import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Server,
  Search,
  Filter,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  apiGetSystemStatus,
  apiGetLookups,
  apiGetAssetsUiSettings,
  apiBulkSetAssetPmEnabled,
  apiBulkSetAssetPmTemplate,
  apiListAssets,
  apiListTemplates,
  apiPatchAssetPm,
  apiRunJob,
  ApiError,
  type Asset,
  type LookupAssetCategory,
  type TemplateSummary,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isManager } from "@/lib/auth";

const EMPTY_ASSETS: Asset[] = [];

const PAGE_SIZE_OPTIONS = [10, 50, 100, 200, 500] as const;

const EMPTY_TEMPLATES: TemplateSummary[] = [];

const OperationalStatusBadge = ({ status }: { status: Asset["assetOperationalStatus"] }) => {
  if (status === "broken") return <Badge variant="destructive">Broken</Badge>;
  if (status === "archived") return <Badge variant="secondary">Archived</Badge>;
  return <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">Operational</Badge>;
};

const Assets = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("all");
  const [selectedLocationId, setSelectedLocationId] = useState<string>("all");
  const [pmStatusFilter, setPmStatusFilter] = useState<
    "all" | "not-started" | "on-track" | "due-soon" | "overdue" | "no-schedule"
  >("all");
  const [operationalStatusFilter, setOperationalStatusFilter] = useState<
    "all" | "operational" | "broken" | "archived"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pmEnabledFilter, setPmEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selectedAssetIds, setSelectedAssetIds] = useState<Record<string, true>>({});
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  const [bulkTemplateValue, setBulkTemplateValue] = useState<string>("none");
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const systemStatusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: apiGetSystemStatus,
    refetchInterval: 30_000,
  });

  const lookupsQuery = useQuery({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    staleTime: 60_000,
  });

  const uiSettingsQuery = useQuery({
    queryKey: ["ui-settings", "assets"],
    queryFn: apiGetAssetsUiSettings,
    staleTime: 60_000,
  });

  const visibleCategoryIds = uiSettingsQuery.data?.visibleCategoryIds ?? null;

  const allCategories = useMemo((): LookupAssetCategory[] => {
    return lookupsQuery.data?.assetCategories ?? [];
  }, [lookupsQuery.data?.assetCategories]);

  useEffect(() => {
    if (selectedCategoryId === "all") return;
    if (visibleCategoryIds === null) return;
    if (!visibleCategoryIds.includes(selectedCategoryId)) {
      setSelectedCategoryId("all");
      setPage(1);
    }
  }, [selectedCategoryId, visibleCategoryIds]);

  const assetsQuery = useQuery({
    queryKey: [
      "assets",
      {
        page,
        pageSize,
        searchQuery,
        pmEnabledFilter,
        selectedCategoryId,
        selectedLocationId,
        visibleCategoryIds,
        operationalStatusFilter,
      },
    ],
    queryFn: () =>
      apiListAssets({
        page,
        pageSize,
        search: searchQuery || undefined,
        pmEnabled: pmEnabledFilter === "all" ? undefined : pmEnabledFilter === "enabled",
        categoryId: selectedCategoryId === "all" ? undefined : selectedCategoryId,
        categoryIds: visibleCategoryIds ?? undefined,
        locationId: selectedLocationId === "all" ? undefined : selectedLocationId,
        operationalStatus:
          operationalStatusFilter === "all" ? undefined : operationalStatusFilter,
      }),
  });

  const assets = assetsQuery.data?.items ?? EMPTY_ASSETS;

  const templatesQuery = useQuery({
    queryKey: ["templates", "active"],
    queryFn: () => apiListTemplates({ active: true }),
    staleTime: 60_000,
  });

  const allTemplates = templatesQuery.data?.items ?? EMPTY_TEMPLATES;

  const missingTemplateCount = useMemo(() => {
    return assets.filter((a) => a.pm.enabled === true && !a.pm.defaultTemplateId).length;
  }, [assets]);

  const getPMStatus = (
    lastCompletedAt: string | null,
    nextPM: string | null,
    pmEnabled: boolean,
  ): { status: string; icon: typeof XCircle; color: string } => {
    if (!pmEnabled) return { status: "disabled", icon: XCircle, color: "text-muted-foreground" };

    if (!lastCompletedAt) {
      return { status: "not started", icon: Clock, color: "text-muted-foreground" };
    }

    if (!nextPM) return { status: "no schedule", icon: Clock, color: "text-muted-foreground" };

    const next = new Date(nextPM);
    const today = new Date();
    const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { status: "overdue", icon: XCircle, color: "text-destructive" };
    if (diffDays <= 7) return { status: "due soon", icon: Clock, color: "text-warning" };
    return { status: "on track", icon: CheckCircle, color: "text-success" };
  };

  const filteredAssets = useMemo(() => {
    const toKey = (status: string): "not-started" | "on-track" | "due-soon" | "overdue" | "no-schedule" => {
      const normalized = status.trim().toLowerCase();
      if (normalized === "not started") return "not-started";
      if (normalized === "on track") return "on-track";
      if (normalized === "due soon") return "due-soon";
      if (normalized === "overdue") return "overdue";
      return "no-schedule";
    };

    return assets.filter((asset) => {
      const matchesCategory = selectedCategoryId === "all" || asset.category.id === selectedCategoryId;
      if (!matchesCategory) return false;

      const pmEnabled = asset.pm.enabled === true;
      const statusInfo = getPMStatus(asset.pm.lastCompletedAt, asset.pm.nextDueAt, pmEnabled);
      const statusKey = toKey(statusInfo.status);
      const matchesStatus = pmStatusFilter === "all" || statusKey === pmStatusFilter;
      return matchesStatus;
    });
  }, [assets, selectedCategoryId, pmStatusFilter]);

  const selectedIdsOnPage = useMemo(() => {
    const ids: string[] = [];
    for (const a of filteredAssets) {
      if (selectedAssetIds[a.id]) ids.push(a.id);
    }
    return ids;
  }, [filteredAssets, selectedAssetIds]);

  const isAllSelectedOnPage = filteredAssets.length > 0 && selectedIdsOnPage.length === filteredAssets.length;

  const bulkSetPmEnabledMutation = useMutation({
    mutationFn: async (input: { assetIds: string[]; pmEnabled: boolean }) => {
      return apiBulkSetAssetPmEnabled(input);
    },
    onSuccess: async () => {
      setSelectedAssetIds({});
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Updated", description: "PM settings updated for selected assets." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to update PM settings";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    },
  });

  const bulkSetPmTemplateMutation = useMutation({
    mutationFn: async (input: { assetIds: string[]; defaultTemplateId: string | null }) => {
      return apiBulkSetAssetPmTemplate(input);
    },
    onSuccess: async () => {
      setBulkTemplateOpen(false);
      setSelectedAssetIds({});
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({ title: "Updated", description: "PM template assigned for selected assets." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to assign PM template";
      toast({ title: "Update failed", description: message, variant: "destructive" });
    },
  });

  const visibleCategories = useMemo((): LookupAssetCategory[] => {
    if (visibleCategoryIds === null) return allCategories;
    const selected = new Set(visibleCategoryIds);
    return allCategories.filter((c) => selected.has(c.id));
  }, [allCategories, visibleCategoryIds]);

  const categorySelectItems = useMemo((): Array<{ id: string; name: string }> => {
    const rows: Array<{ id: string; name: string }> = [{ id: "all", name: "All Categories" }];
    for (const c of visibleCategories) {
      rows.push({ id: c.id, name: c.isActive ? c.name : `${c.name} (Inactive)` });
    }
    return rows.sort((a, b) => {
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [visibleCategories]);

  const locationSelectItems = useMemo((): Array<{ id: string; name: string }> => {
    const locations = lookupsQuery.data?.locations ?? [];
    const rows: Array<{ id: string; name: string }> = [{ id: "all", name: "All Locations" }];
    for (const l of locations) {
      rows.push({ id: l.id, name: l.isActive ? l.name : `${l.name} (Inactive)` });
    }
    return rows.sort((a, b) => {
      if (a.id === "all") return -1;
      if (b.id === "all") return 1;
      return a.name.localeCompare(b.name);
    });
  }, [lookupsQuery.data?.locations]);


  const togglePmMutation = useMutation({
    mutationFn: async (input: { assetId: string; pmEnabled: boolean }) => {
      return apiPatchAssetPm({ assetId: input.assetId, pmEnabled: input.pmEnabled });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to update asset PM settings";
      toast({
        title: "Update failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const syncNowMutation = useMutation({
    mutationFn: async () => apiRunJob("snipe-sync"),
    onSuccess: async () => {
      toast({ title: "Sync started", description: "Snipe-IT sync job started." });
      await queryClient.invalidateQueries({ queryKey: ["system-status"] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to start Snipe-IT sync";
      toast({
        title: "Sync failed",
        description: message,
        variant: "destructive",
      });
    },
  });


  const lastSyncText = (() => {
    const data = systemStatusQuery.data;
    const lastRun = data?.snipeIt.lastRun;
    if (!data) return "Loading system status…";
    if (!data.snipeIt.configured) return "Snipe-IT not configured";
    if (!lastRun) return "No sync run recorded";
    const time = new Date(lastRun.completedAt ?? lastRun.startedAt).toLocaleString();
    const count = lastRun.assetsProcessed ?? null;
    return `Last sync: ${time}${count !== null ? ` • ${count} assets` : ""}`;
  })();

  const snipeItUrl = systemStatusQuery.data?.snipeIt.baseUrl;

  const canManage = isManager();

  return (
    <div className="min-h-screen">
      <Header title="Assets" subtitle="Synchronized from Snipe-IT" />

      <div className="p-6 space-y-6">
        {/* Sync Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-4 border border-border/60 shadow-card flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="font-medium text-foreground">Snipe-IT Sync Active</p>
              <p className="text-sm text-muted-foreground">
                {lastSyncText}
                {missingTemplateCount > 0 ? ` • ${missingTemplateCount} missing PM template` : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-background/80"
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
            >
              <RefreshCw className="w-4 h-4" />
              Sync Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 bg-background/80"
              onClick={() => {
                if (snipeItUrl) window.open(snipeItUrl, "_blank", "noreferrer");
              }}
              disabled={!snipeItUrl}
            >
              <ExternalLink className="w-4 h-4" />
              Open Snipe-IT
            </Button>
          </div>
        </motion.div>

        {/* Filters */}
        <div className="glass rounded-xl p-4 border border-border/60 shadow-card">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by asset ID or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-background/80"
                />
              </div>
              <Select
                value={selectedCategoryId}
                onValueChange={(value) => {
                  setSelectedCategoryId(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="w-full md:w-52 bg-background/80">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  {categorySelectItems.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="gap-2 bg-background/80">
                    <Filter className="w-4 h-4" />
                    More Filters
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-80">
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium">PM Enabled</div>
                      <div className="mt-2">
                        <Select
                          value={pmEnabledFilter}
                          onValueChange={(v) => {
                            setPmEnabledFilter(v as "all" | "enabled" | "disabled");
                            setPage(1);
                          }}
                        >
                          <SelectTrigger className="bg-muted/50">
                            <SelectValue placeholder="PM Enabled" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="enabled">Enabled</SelectItem>
                            <SelectItem value="disabled">Disabled</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:pl-4 xl:border-l xl:border-border/60">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 bg-background/80" disabled={selectedIdsOnPage.length === 0}>
                    Bulk Actions
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={() => bulkSetPmEnabledMutation.mutate({ assetIds: selectedIdsOnPage, pmEnabled: true })}
                    disabled={!canManage || bulkSetPmEnabledMutation.isPending}
                  >
                    Enable PM
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => bulkSetPmEnabledMutation.mutate({ assetIds: selectedIdsOnPage, pmEnabled: false })}
                    disabled={!canManage || bulkSetPmEnabledMutation.isPending}
                  >
                    Disable PM
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setBulkTemplateValue("none");
                      setBulkTemplateOpen(true);
                    }}
                    disabled={!canManage || selectedIdsOnPage.length === 0}
                  >
                    Assign PM Template…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setSelectedAssetIds({})}
                    disabled={selectedIdsOnPage.length === 0 || bulkSetPmEnabledMutation.isPending}
                  >
                    Clear selection
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" className="gap-2 bg-background/80">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </div>
        </div>

        {/* Assets Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-xl overflow-hidden border border-border/60 shadow-card"
        >
          {assetsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading assets…</div>
          ) : assetsQuery.isError ? (
            <div className="p-6 text-sm text-destructive">Failed to load assets.</div>
          ) : (
            <>
              <Table>
              <TableHeader>
                <TableRow className="border-border bg-muted/30 hover:bg-muted/30">
                  <TableHead className="w-10">
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                      }}
                    >
                      <Checkbox
                        checked={isAllSelectedOnPage}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const next: Record<string, true> = { ...selectedAssetIds };
                            for (const a of filteredAssets) next[a.id] = true;
                            setSelectedAssetIds(next);
                            return;
                          }

                          const next: Record<string, true> = { ...selectedAssetIds };
                          for (const a of filteredAssets) {
                            delete next[a.id];
                          }
                          setSelectedAssetIds(next);
                        }}
                        aria-label="Select all assets on this page"
                      />
                    </div>
                  </TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asset ID</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operational</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PM Status</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Next PM</TableHead>
                  <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">PM Enabled</TableHead>
                  <TableHead className="text-muted-foreground"></TableHead>
                </TableRow>
                <TableRow className="border-border bg-muted/20">
                  <TableHead className="w-10"></TableHead>
                  <TableHead>
                    <Input
                      placeholder="Filter Asset ID"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setPage(1);
                      }}
                      className="h-8 bg-background/80"
                    />
                  </TableHead>
                  <TableHead>
                    
                  </TableHead>
                  <TableHead>
                    <Select
                      value={selectedCategoryId}
                      onValueChange={(value) => {
                        setSelectedCategoryId(value);
                        setPage(1);
                      }}
                    >
                    <SelectTrigger className="h-8 bg-background/80">
                        <SelectValue placeholder="Category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categorySelectItems.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead></TableHead>
                  <TableHead>
                    <Select
                      value={selectedLocationId}
                      onValueChange={(value) => {
                        setSelectedLocationId(value);
                        setPage(1);
                      }}
                    >
                    <SelectTrigger className="h-8 bg-background/80">
                        <SelectValue placeholder="Location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locationSelectItems.map((loc) => (
                          <SelectItem key={loc.id} value={loc.id}>
                            {loc.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead>
                    <Select
                      value={operationalStatusFilter}
                      onValueChange={(value) => {
                        setOperationalStatusFilter(
                          value as "all" | "operational" | "broken" | "archived",
                        );
                        setPage(1);
                      }}
                    >
                    <SelectTrigger className="h-8 bg-background/80">
                        <SelectValue placeholder="Operational" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="operational">Operational</SelectItem>
                        <SelectItem value="broken">Broken</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead>
                    <Select
                      value={pmStatusFilter}
                      onValueChange={(v) => {
                        setPmStatusFilter(v as typeof pmStatusFilter);
                        setPage(1);
                      }}
                    >
                    <SelectTrigger className="h-8 bg-background/80">
                        <SelectValue placeholder="PM Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="not-started">Not Started</SelectItem>
                        <SelectItem value="on-track">On Track</SelectItem>
                        <SelectItem value="due-soon">Due Soon</SelectItem>
                        <SelectItem value="overdue">Overdue</SelectItem>
                        <SelectItem value="no-schedule">No Schedule</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead></TableHead>
                  <TableHead>
                    <Select
                      value={pmEnabledFilter}
                      onValueChange={(v) => {
                        setPmEnabledFilter(v as "all" | "enabled" | "disabled");
                        setPage(1);
                      }}
                    >
                    <SelectTrigger className="h-8 bg-background/80">
                        <SelectValue placeholder="PM Enabled" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssets.map((asset, index) => {
                  const pmEnabled = asset.pm.enabled === true;
                  const pmStatus = getPMStatus(asset.pm.lastCompletedAt, asset.pm.nextDueAt, pmEnabled);
                  return (
                    <motion.tr
                      key={asset.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className="border-border hover:bg-muted/40 transition-colors cursor-pointer group"
                      onClick={() => navigate(`/assets/${asset.id}`)}
                    >
                      <TableCell
                        onClick={(e) => {
                          e.stopPropagation();
                        }}
                      >
                        <Checkbox
                          checked={Boolean(selectedAssetIds[asset.id])}
                          onCheckedChange={(checked) => {
                            setSelectedAssetIds((prev) => {
                              const next: Record<string, true> = { ...prev };
                              if (checked) next[asset.id] = true;
                              else delete next[asset.id];
                              return next;
                            });
                          }}
                          aria-label={`Select ${asset.assetTag}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                            <Server className="w-4 h-4 text-primary" />
                          </div>
                          <span className="font-mono text-sm text-foreground">{asset.assetTag}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">{asset.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="bg-muted/60 text-foreground">
                          {asset.category.name ?? "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs">
                        <span className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-wrap">
                          {asset.snipeNotes && asset.snipeNotes.trim().length > 0
                            ? asset.snipeNotes
                            : "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{asset.location.name ?? "—"}</TableCell>
                      <TableCell>
                        <OperationalStatusBadge status={asset.assetOperationalStatus} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <pmStatus.icon className={`w-4 h-4 ${pmStatus.color}`} />
                          <span className={`text-sm capitalize ${pmStatus.color}`}>{pmStatus.status}</span>
                          {pmEnabled && !asset.pm.defaultTemplateId ? (
                            <div className="flex items-center gap-1 text-xs text-warning">
                              <AlertTriangle className="w-4 h-4" />
                              Missing template
                            </div>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {asset.pm.nextDueAt ? new Date(asset.pm.nextDueAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                          }}
                        >
                          <Switch
                            checked={pmEnabled}
                            onCheckedChange={(checked) =>
                              togglePmMutation.mutate({ assetId: asset.id, pmEnabled: checked })
                            }
                            disabled={togglePmMutation.isPending}
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </TableBody>
            </Table>
            <div className="flex flex-col gap-3 border-t border-border/60 bg-muted/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <p className="text-sm text-muted-foreground">Showing {filteredAssets.length} assets</p>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Per page</span>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => {
                      setPageSize(Number(value));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger className="w-28 bg-background/80" aria-label="Assets per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={String(opt)}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || assetsQuery.isLoading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(assetsQuery.data?.items.length ?? 0) < pageSize || assetsQuery.isLoading}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
            </>
          )}
        </motion.div>
      </div>

      <Dialog open={bulkTemplateOpen} onOpenChange={setBulkTemplateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign PM Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">Template</span>
              <Select value={bulkTemplateValue} onValueChange={setBulkTemplateValue}>
                <SelectTrigger className="bg-muted/50" aria-label="PM template">
                  <SelectValue placeholder={templatesQuery.isLoading ? "Loading templates…" : "Select template"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {allTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkTemplateOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={bulkSetPmTemplateMutation.isPending || selectedIdsOnPage.length === 0}
                onClick={() => {
                  bulkSetPmTemplateMutation.mutate({
                    assetIds: selectedIdsOnPage,
                    defaultTemplateId: bulkTemplateValue === "none" ? null : bulkTemplateValue,
                  });
                }}
              >
                Apply
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Assets;
