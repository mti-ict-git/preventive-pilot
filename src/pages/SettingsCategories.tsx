import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, Search, Tags } from "lucide-react";
import Header from "@/components/layout/Header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  ApiError,
  apiGetAssetsUiSettings,
  apiGetLookups,
  apiUpdateAssetsUiSettings,
  apiRunJob,
  type LookupAssetCategory,
} from "@/lib/api";
import { isSuperadmin } from "@/lib/auth";
import { toast } from "@/hooks/use-toast";

type ListFilter = "all" | "selected" | "unselected";

const normalizeVisibleCategoryIds = (
  ids: string[] | null,
  allIds: string[],
): string[] | null => {
  if (allIds.length === 0) return null;
  if (ids === null) return null;
  const next = ids.filter((id) => allIds.includes(id));
  if (next.length === 0) return null;
  return next.length === allIds.length ? null : next;
};

const isSameIdSelection = (a: string[] | null, b: string[] | null): boolean => {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
};

const SettingsCategories = () => {
  const superadmin = isSuperadmin();

  const queryClient = useQueryClient();

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

  const allCategories = useMemo((): LookupAssetCategory[] => {
    return lookupsQuery.data?.assetCategories ?? [];
  }, [lookupsQuery.data?.assetCategories]);

  const allCategoryIds = useMemo((): string[] => {
    const ids: string[] = [];
    for (const c of allCategories) {
      if (c.id) ids.push(c.id);
    }
    return ids;
  }, [allCategories]);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [listFilter, setListFilter] = useState<ListFilter>("all");
  const [draftVisibleCategoryIds, setDraftVisibleCategoryIds] = useState<string[] | null>(null);
  const [excludeInactive, setExcludeInactive] = useState<boolean>(false);

  useEffect(() => {
    if (!uiSettingsQuery.isSuccess) return;
    setDraftVisibleCategoryIds(uiSettingsQuery.data.visibleCategoryIds);
    setExcludeInactive(Boolean(uiSettingsQuery.data.excludeInactive));
  }, [uiSettingsQuery.isSuccess, uiSettingsQuery.data?.visibleCategoryIds]);

  const normalizedDraft = useMemo(() => {
    return normalizeVisibleCategoryIds(draftVisibleCategoryIds, allCategoryIds);
  }, [draftVisibleCategoryIds, allCategoryIds]);

  const normalizedServer = useMemo(() => {
    const serverIds = uiSettingsQuery.data?.visibleCategoryIds ?? null;
    return normalizeVisibleCategoryIds(serverIds, allCategoryIds);
  }, [uiSettingsQuery.data?.visibleCategoryIds, allCategoryIds]);

  const serverExcludeInactive = uiSettingsQuery.data?.excludeInactive === true;

  const selectedCount = useMemo(() => {
    if (allCategoryIds.length === 0) return 0;
    return normalizedDraft === null ? allCategoryIds.length : normalizedDraft.length;
  }, [normalizedDraft, allCategoryIds.length]);

  const selectedSet = useMemo(() => {
    return normalizedDraft === null ? null : new Set(normalizedDraft);
  }, [normalizedDraft]);

  const setCategorySelected = (categoryId: string, checked: boolean): void => {
    const allIds = allCategoryIds;
    const current = normalizedDraft;

    if (allIds.length === 0) return;

    if (current === null) {
      if (checked) return;
      const next = allIds.filter((id) => id !== categoryId);
      if (next.length === 0) {
        toast({
          title: "Selection required",
          description: "Keep at least one category visible.",
        });
        return;
      }
      setDraftVisibleCategoryIds(next.length === allIds.length ? null : next);
      return;
    }

    const set = new Set(current);
    if (checked) set.add(categoryId);
    else set.delete(categoryId);
    const next = Array.from(set);
    if (next.length === 0) {
      toast({
        title: "Selection required",
        description: "Keep at least one category visible.",
      });
      return;
    }
    setDraftVisibleCategoryIds(next.length === allIds.length ? null : next);
  };

  const filteredCategories = useMemo((): LookupAssetCategory[] => {
    const q = searchQuery.trim().toLowerCase();
    return allCategories.filter((c) => {
      const matchesText = !q || c.name.toLowerCase().includes(q);
      if (!matchesText) return false;
      if (excludeInactive && !c.isActive) return false;

      if (listFilter === "all") return true;
      const selected = selectedSet === null ? true : selectedSet.has(c.id);
      return listFilter === "selected" ? selected : !selected;
    });
  }, [allCategories, searchQuery, listFilter, selectedSet, excludeInactive]);

  const invertSelection = (): void => {
    const allIds = allCategoryIds;
    const currentSet = new Set(normalizedDraft === null ? allIds : normalizedDraft);
    const next = allIds.filter((id) => !currentSet.has(id));
    if (next.length === 0) {
      toast({
        title: "Selection required",
        description: "Keep at least one category visible.",
      });
      return;
    }
    setDraftVisibleCategoryIds(next.length === allIds.length ? null : next);
  };

  const selectAll = (): void => {
    setDraftVisibleCategoryIds(null);
  };

  const resetSelection = (): void => {
    setDraftVisibleCategoryIds(normalizedServer);
    setExcludeInactive(serverExcludeInactive);
  };

  const hasUnsavedChanges = useMemo(() => {
    return !isSameIdSelection(normalizedDraft, normalizedServer) || excludeInactive !== serverExcludeInactive;
  }, [normalizedDraft, normalizedServer, excludeInactive, serverExcludeInactive]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiUpdateAssetsUiSettings({ visibleCategoryIds: normalizedDraft, excludeInactive });
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(["ui-settings", "assets"], data);
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      toast({
        title: "Saved",
        description: "Visible categories updated for all users.",
      });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to save category visibility";
      toast({ title: "Save failed", description: message, variant: "destructive" });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return apiRunJob("snipe-sync");
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lookups"] });
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["lookups"] });
      }, 3000);
      setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ["lookups"] });
      }, 7000);
      toast({ title: "Sync started", description: "Snipe-IT category sync has been triggered." });
    },
    onError: (err: unknown) => {
      const message = err instanceof ApiError ? err.message : "Failed to start category sync";
      toast({ title: "Sync failed", description: message, variant: "destructive" });
    },
  });

  if (!superadmin) return <Navigate to="/settings" replace />;

  return (
    <div className="min-h-screen bg-white">
      <Header title="Categories" subtitle="Choose which categories appear in Assets" />

      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 md:col-span-8">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="border-b border-border/60 pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base text-foreground flex items-center gap-2">
                        <Tags className="h-4 w-4 text-primary" />
                        Visible Categories
                      </CardTitle>
                      <CardDescription>
                        This setting is global and affects what everyone sees on the Assets page.
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs">
                      {allCategoryIds.length === 0
                        ? "No categories"
                        : `${selectedCount} of ${allCategoryIds.length} selected`}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-7">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search categories…"
                          className="pl-10 bg-muted/50"
                        />
                      </div>
                    </div>
                    <div className="col-span-12 md:col-span-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Tabs value={listFilter} onValueChange={(v) => setListFilter(v as ListFilter)}>
                          <TabsList className="w-full">
                            <TabsTrigger value="all" className="flex-1">
                              All
                            </TabsTrigger>
                            <TabsTrigger value="selected" className="flex-1">
                              Selected
                            </TabsTrigger>
                            <TabsTrigger value="unselected" className="flex-1">
                              Unselected
                            </TabsTrigger>
                          </TabsList>
                        </Tabs>
                        <label className="flex items-center gap-2 text-sm rounded-md border border-border px-2.5 py-1.5 bg-muted/30">
                          <span>Exclude inactive</span>
                          <Switch checked={excludeInactive} onCheckedChange={(v) => setExcludeInactive(v)} />
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={selectAll}>
                      Select all
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={invertSelection}>
                      Invert
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetSelection}
                      disabled={!hasUnsavedChanges || saveMutation.isPending}
                    >
                      Reset
                    </Button>
                  </div>

                  <div className="rounded-lg border border-border/60 bg-background/70">
                    <div className="max-h-[420px] overflow-auto p-3">
                      {lookupsQuery.isLoading ? (
                        <div className="p-3 text-sm text-muted-foreground">Loading categories…</div>
                      ) : filteredCategories.length === 0 ? (
                        <div className="p-3 text-sm text-muted-foreground">No matching categories.</div>
                      ) : (
                        <div className="space-y-2">
                          {filteredCategories.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 hover:bg-muted/30 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Checkbox
                                  checked={selectedSet === null ? true : selectedSet.has(c.id)}
                                  onCheckedChange={(checked) =>
                                    setCategorySelected(c.id, checked === true)
                                  }
                                  aria-label={`Toggle ${c.name}`}
                                />
                                <div className="min-w-0">
                                  <div className="text-sm truncate">{c.name}</div>
                                </div>
                              </div>
                              {!c.isActive ? (
                                <Badge variant="outline" className="shrink-0">
                                  Inactive
                                </Badge>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          <div className="col-span-12 md:col-span-4">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="border-border/60 bg-card/70 shadow-sm">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="text-base text-foreground flex items-center gap-2">
                    <Save className="h-4 w-4 text-primary" />
                    Save Changes
                  </CardTitle>
                  <CardDescription>Apply the selection for all users.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={() => saveMutation.mutate()}
                    disabled={!hasUnsavedChanges || saveMutation.isPending || allCategoryIds.length === 0}
                  >
                    {saveMutation.isPending ? "Saving…" : "Save"}
                  </Button>
                  <Button
                    className="w-full mt-2"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                  >
                    {syncMutation.isPending ? "Syncing Categories…" : "Sync Categories from Snipe-IT"}
                  </Button>
                  <div className="text-xs text-muted-foreground">
                    Users without Superadmin cannot change this setting.
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsCategories;
