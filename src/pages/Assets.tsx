import { useMemo, useState } from "react";
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
  apiBulkSetAssetPmEnabled,
  apiListAssets,
  apiPatchAssetPm,
  apiRunJob,
  ApiError,
  type Asset,
} from "@/lib/api";
import { toast } from "@/hooks/use-toast";

const EMPTY_ASSETS: Asset[] = [];

const Assets = () => {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pmEnabledFilter, setPmEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [selectedAssetIds, setSelectedAssetIds] = useState<Record<string, true>>({});
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const systemStatusQuery = useQuery({
    queryKey: ["system-status"],
    queryFn: apiGetSystemStatus,
    refetchInterval: 30_000,
  });

  const assetsQuery = useQuery({
    queryKey: ["assets", { page, pageSize, searchQuery, pmEnabledFilter }],
    queryFn: () =>
      apiListAssets({
        page,
        pageSize,
        search: searchQuery || undefined,
        pmEnabled: pmEnabledFilter === "all" ? undefined : pmEnabledFilter === "enabled",
      }),
  });

  const assets = assetsQuery.data?.items ?? EMPTY_ASSETS;

  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      const categoryName = asset.category.name ?? "";
      const matchesCategory = selectedCategory === "all" || categoryName === selectedCategory;
      return matchesCategory;
    });
  }, [assets, selectedCategory]);

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

  const categories = useMemo(() => {
    const values = new Set<string>();
    for (const a of assets) {
      const name = a.category.name;
      if (name) values.add(name);
    }
    return ["all", ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [assets]);

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

  const getPMStatus = (nextPM: string | null, pmEnabled: boolean) => {
    if (!pmEnabled) return { status: "disabled", icon: XCircle, color: "text-muted-foreground" };
    if (!nextPM) return { status: "no schedule", icon: Clock, color: "text-muted-foreground" };
    
    const next = new Date(nextPM);
    const today = new Date();
    const diffDays = Math.ceil((next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) return { status: "overdue", icon: XCircle, color: "text-destructive" };
    if (diffDays <= 7) return { status: "due soon", icon: Clock, color: "text-warning" };
    return { status: "on track", icon: CheckCircle, color: "text-success" };
  };

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

  return (
    <div className="min-h-screen">
      <Header title="Assets" subtitle="Synchronized from Snipe-IT" />

      <div className="p-6 space-y-6">
        {/* Sync Status Banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-xl p-4 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="font-medium text-foreground">Snipe-IT Sync Active</p>
              <p className="text-sm text-muted-foreground">{lastSyncText}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => syncNowMutation.mutate()}
              disabled={syncNowMutation.isPending}
            >
              <RefreshCw className="w-4 h-4" />
              Sync Now
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
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
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by asset ID or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-muted/50"
            />
          </div>
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full md:w-48 bg-muted/50">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat === "all" ? "All Categories" : cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={selectedIdsOnPage.length === 0}>
                Bulk Actions
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => bulkSetPmEnabledMutation.mutate({ assetIds: selectedIdsOnPage, pmEnabled: true })}
                disabled={bulkSetPmEnabledMutation.isPending}
              >
                Enable PM
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => bulkSetPmEnabledMutation.mutate({ assetIds: selectedIdsOnPage, pmEnabled: false })}
                disabled={bulkSetPmEnabledMutation.isPending}
              >
                Disable PM
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
          <Button variant="outline" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>

        {/* Assets Table */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-xl overflow-hidden"
        >
          {assetsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading assets…</div>
          ) : assetsQuery.isError ? (
            <div className="p-6 text-sm text-destructive">Failed to load assets.</div>
          ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
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
                <TableHead className="text-muted-foreground">Asset ID</TableHead>
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Category</TableHead>
                <TableHead className="text-muted-foreground">Location</TableHead>
                <TableHead className="text-muted-foreground">PM Status</TableHead>
                <TableHead className="text-muted-foreground">Next PM</TableHead>
                <TableHead className="text-muted-foreground">PM Enabled</TableHead>
                <TableHead className="text-muted-foreground"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.map((asset, index) => {
                const pmEnabled = asset.pm.enabled === true;
                const pmStatus = getPMStatus(asset.pm.nextDueAt, pmEnabled);
                return (
                  <motion.tr
                    key={asset.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-border hover:bg-muted/30 transition-colors cursor-pointer group"
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
                        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                          <Server className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <span className="font-mono text-sm text-foreground">{asset.assetTag}</span>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{asset.name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{asset.category.name ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{asset.location.name ?? "—"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <pmStatus.icon className={`w-4 h-4 ${pmStatus.color}`} />
                        <span className={`text-sm capitalize ${pmStatus.color}`}>{pmStatus.status}</span>
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
          )}
        </motion.div>

        {/* Pagination */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {filteredAssets.length} assets
          </p>
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
      </div>
    </div>
  );
};

export default Assets;
