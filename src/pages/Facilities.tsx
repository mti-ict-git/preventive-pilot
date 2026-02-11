import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreVertical, Plus, Search } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  apiGetLookups,
  apiListFacilities,
  apiCreateFacility,
  apiUpdateFacility,
  apiUpdateFacilityPmSettings,
  apiCloneFacility,
  apiFacilityPmNow,
  apiListTemplates,
  type Facility,
  type LookupsResponse,
  type TemplateSummary,
} from "@/lib/api";

const Facilities = () => {
  const formatTitleCase = (value?: string | null) => {
    if (!value) return "—";
    return value
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  };
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string>("all");
  const [pmEnabledFilter, setPmEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  const [bulkTemplateValue, setBulkTemplateValue] = useState<string>("none");
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<Record<string, true>>({});
  const [rowTemplateDialogFacilityId, setRowTemplateDialogFacilityId] = useState<string | null>(null);
  const [rowTemplateValue, setRowTemplateValue] = useState<string>("none");
  const [cloneDialogFacilityId, setCloneDialogFacilityId] = useState<string | null>(null);
  const [cloneName, setCloneName] = useState<string>("");
  const [cloneIncludePm, setCloneIncludePm] = useState<boolean>(true);
  const navigate = useNavigate();

  const queryClient = useQueryClient();

  const lookupsQuery = useQuery<LookupsResponse>({
    queryKey: ["lookups"],
    queryFn: apiGetLookups,
    staleTime: 60_000,
  });

  const listInput = useMemo(() => {
    return {
      search: search || undefined,
      locationId: locationId !== "all" ? locationId : undefined,
      pmEnabled: pmEnabledFilter === "enabled" ? true : pmEnabledFilter === "disabled" ? false : undefined,
      page: 1,
      pageSize: 50,
    };
  }, [search, locationId, pmEnabledFilter]);

  const facilitiesQuery = useQuery({
    queryKey: ["facilities", listInput],
    queryFn: () => apiListFacilities(listInput),
  });

  const templatesQuery = useQuery<{ items: TemplateSummary[] }>({
    queryKey: ["templates", "active"],
    queryFn: () => apiListTemplates({ active: true }),
    staleTime: 60_000,
  });

  const updateFacilityMutation = useMutation({
    mutationFn: (input: {
      facilityId: string;
      name?: string;
      locationId?: string | null;
      description?: string | null;
      isActive?: boolean;
    }) => apiUpdateFacility(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (input: { name: string; locationId?: string | null; description?: string | null; isActive?: boolean }) =>
      apiCreateFacility(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
      setCreateOpen(false);
    },
  });

  const updatePmMutation = useMutation({
    mutationFn: (input: { facilityId: string; pmEnabled?: boolean; defaultTemplateId?: string | null; nextPmDueAt?: string | null }) =>
      apiUpdateFacilityPmSettings(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["facilities"] }),
  });

  const cloneFacilityMutation = useMutation({
    mutationFn: (input: { facilityId: string; name?: string; includePmSettings?: boolean }) =>
      apiCloneFacility(input),
    onSuccess: () => {
      setCloneDialogFacilityId(null);
      queryClient.invalidateQueries({ queryKey: ["facilities"] });
    },
  });

  const pmNowMutation = useMutation({
    mutationFn: (facilityId: string) => apiFacilityPmNow(facilityId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const locations = lookupsQuery.data?.locations ?? [];
  const templates = templatesQuery.data?.items ?? [];
  const templateOptions = useMemo(() => [{ id: "none", name: "No Template" }, ...templates], [templates]);

  const allVisibleIds = useMemo(() => (facilitiesQuery.data?.items ?? []).map((x: Facility) => x.id), [facilitiesQuery.data?.items]);
  const selectedCount = Object.keys(selectedFacilityIds).length;
  const allSelectedOnPage = selectedCount > 0 && allVisibleIds.every((id) => selectedFacilityIds[id]);

  return (
    <>
      <Header title="Facilities" subtitle="Manage non-asset areas and PM settings" />
      <div className="p-6 space-y-6">
        <Card className="border-border/60 bg-card/80 shadow-sm">
          <CardHeader className="border-b border-border/60">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-lg">Facilities</CardTitle>
                <CardDescription>Manage non-asset areas and PM settings</CardDescription>
              </div>
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Facility
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>New Facility</DialogTitle>
                  </DialogHeader>
                  <form
                    className="space-y-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.currentTarget as HTMLFormElement;
                      const nameInput = form.elements.namedItem("name") as HTMLInputElement;
                      const locationSelect = form.elements.namedItem("location") as HTMLSelectElement;
                      const nameVal = nameInput.value.trim();
                      const locVal = locationSelect.value;
                      if (!nameVal) return;
                      createMutation.mutate({ name: nameVal, locationId: locVal ? locVal : null });
                    }}
                  >
                    <Input name="name" placeholder="Name" required />
                    <select name="location" className="w-full border rounded px-3 py-2">
                      <option value="">No Location</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name ?? l.id}</option>
                      ))}
                    </select>
                    <Button type="submit">Save</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
              <div className="lg:col-span-5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search facilities..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="lg:col-span-3">
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Location" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Locations</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>{l.name ?? l.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="lg:col-span-2">
                <Select
                  value={pmEnabledFilter}
                  onValueChange={(val) => setPmEnabledFilter(val as "all" | "enabled" | "disabled")}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="PM status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="enabled">Enabled</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="lg:col-span-2 flex items-center justify-end">
                <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs">
                  {selectedCount} selected
                </Badge>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-muted-foreground">Bulk actions apply to selected facilities</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedCount === 0}
                  onClick={() => {
                    const ids = Object.keys(selectedFacilityIds);
                    Promise.all(
                      ids.map((id) =>
                        updatePmMutation.mutateAsync({ facilityId: id, pmEnabled: true }),
                      ),
                    ).then(() => queryClient.invalidateQueries({ queryKey: ["facilities"] }));
                  }}
                >
                  Bulk Enable PM
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={selectedCount === 0}
                  onClick={() => {
                    const ids = Object.keys(selectedFacilityIds);
                    Promise.all(
                      ids.map((id) =>
                        updatePmMutation.mutateAsync({ facilityId: id, pmEnabled: false }),
                      ),
                    ).then(() => queryClient.invalidateQueries({ queryKey: ["facilities"] }));
                  }}
                >
                  Bulk Disable PM
                </Button>
                <Dialog open={bulkTemplateOpen} onOpenChange={setBulkTemplateOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="secondary" disabled={selectedCount === 0}>Bulk Set Template</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Assign Default Template</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Select value={bulkTemplateValue} onValueChange={setBulkTemplateValue}>
                        <SelectTrigger>
                          <SelectValue placeholder="Template" />
                        </SelectTrigger>
                        <SelectContent>
                          {templateOptions.map((t) => (
                            <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => {
                          const ids = Object.keys(selectedFacilityIds);
                          Promise.all(
                            ids.map((id) =>
                              updatePmMutation.mutateAsync({
                                facilityId: id,
                                defaultTemplateId: bulkTemplateValue === "none" ? null : bulkTemplateValue,
                              }),
                            ),
                          ).then(() => {
                            queryClient.invalidateQueries({ queryKey: ["facilities"] });
                            setBulkTemplateOpen(false);
                          });
                        }}
                      >
                        Save
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="destructive" disabled={selectedCount === 0}>
                      Archive Facilities
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive selected facilities?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Archived facilities will no longer appear in this list but remain available for history.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => {
                          const ids = Object.keys(selectedFacilityIds);
                          if (ids.length === 0) return;
                          Promise.all(
                            ids.map((id) =>
                              updateFacilityMutation.mutateAsync({
                                facilityId: id,
                                isActive: false,
                              }),
                            ),
                          ).then(() => {
                            setSelectedFacilityIds({});
                            queryClient.invalidateQueries({ queryKey: ["facilities"] });
                          });
                        }}
                      >
                        Archive
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <div className="rounded-lg border border-border/60">
              <Table>
                <TableHeader className="bg-muted/40">
                  <TableRow>
                    <TableHead className="w-12">
                      <input
                        type="checkbox"
                        checked={allSelectedOnPage}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const next: Record<string, true> = { ...selectedFacilityIds };
                          if (checked) {
                            for (const id of allVisibleIds) next[id] = true;
                          } else {
                            for (const id of allVisibleIds) delete next[id];
                          }
                          setSelectedFacilityIds(next);
                        }}
                      />
                    </TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Name</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Location</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">PM Status</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Last PM</TableHead>
                    <TableHead className="text-xs uppercase tracking-wide">Next Due</TableHead>
                    <TableHead className="text-right pr-6 text-xs uppercase tracking-wide">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr:nth-child(even)]:bg-muted/20">
                  {(facilitiesQuery.data?.items ?? []).map((f: Facility) => (
                    <TableRow key={f.id}>
                      <TableCell className="w-12">
                        <input
                          type="checkbox"
                          checked={!!selectedFacilityIds[f.id]}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            const next: Record<string, true> = { ...selectedFacilityIds };
                            if (checked) next[f.id] = true; else delete next[f.id];
                            setSelectedFacilityIds(next);
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{formatTitleCase(f.name)}</TableCell>
                      <TableCell>{formatTitleCase(f.location?.name ?? null)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            f.pm.enabled
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                              : "border-slate-500/30 bg-slate-500/10 text-slate-500"
                          }
                        >
                          {formatTitleCase(f.pm.enabled ? "Enabled" : "Disabled")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.pm.lastCompletedAt ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{f.pm.nextDueAt ?? "—"}</TableCell>
                      <TableCell className="text-right pr-6">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="bg-background/80"
                            onClick={() => navigate(`/facilities/${f.id}`)}
                          >
                            Details
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => pmNowMutation.mutate(f.id)}>
                            PM Now
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              updatePmMutation.mutate({
                                facilityId: f.id,
                                pmEnabled: !(f.pm.enabled ?? false),
                                defaultTemplateId: f.pm.defaultTemplateId,
                                nextPmDueAt: f.pm.nextDueAt,
                              })
                            }
                          >
                            Toggle PM
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <Dialog
                                open={rowTemplateDialogFacilityId === f.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    setRowTemplateDialogFacilityId(f.id);
                                    setRowTemplateValue(f.pm.defaultTemplateId ?? "none");
                                  } else {
                                    setRowTemplateDialogFacilityId(null);
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                                    Set Template
                                  </DropdownMenuItem>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Default Template</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <Select value={rowTemplateValue} onValueChange={setRowTemplateValue}>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Template" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {templateOptions.map((t) => (
                                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <div className="flex justify-end gap-2">
                                      <Button onClick={() => navigate(`/facilities/${f.id}`)}>Details</Button>
                                      <Button
                                        onClick={() =>
                                          updatePmMutation
                                            .mutateAsync({
                                              facilityId: f.id,
                                              defaultTemplateId: rowTemplateValue === "none" ? null : rowTemplateValue,
                                            })
                                            .then(() => setRowTemplateDialogFacilityId(null))
                                        }
                                      >
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                              <Dialog
                                open={cloneDialogFacilityId === f.id}
                                onOpenChange={(open) => {
                                  if (open) {
                                    setCloneDialogFacilityId(f.id);
                                    setCloneName(`${f.name} (Copy)`);
                                    setCloneIncludePm(true);
                                  } else {
                                    setCloneDialogFacilityId(null);
                                  }
                                }}
                              >
                                <DialogTrigger asChild>
                                  <DropdownMenuItem onSelect={(event) => event.preventDefault()}>
                                    Clone
                                  </DropdownMenuItem>
                                </DialogTrigger>
                                <DialogContent>
                                  <DialogHeader>
                                    <DialogTitle>Clone Facility</DialogTitle>
                                  </DialogHeader>
                                  <div className="space-y-4">
                                    <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} placeholder="New name" />
                                    <label className="flex items-center gap-2 text-sm">
                                      <input type="checkbox" checked={cloneIncludePm} onChange={(e) => setCloneIncludePm(e.target.checked)} />
                                      <span>Copy PM settings</span>
                                    </label>
                                    <div className="flex justify-end gap-2">
                                      <Button onClick={() => setCloneDialogFacilityId(null)}>Cancel</Button>
                                      <Button
                                        onClick={() =>
                                          cloneFacilityMutation.mutate({
                                            facilityId: f.id,
                                            name: cloneName.trim() ? cloneName.trim() : undefined,
                                            includePmSettings: cloneIncludePm,
                                          })
                                        }
                                      >
                                        Save
                                      </Button>
                                    </div>
                                  </div>
                                </DialogContent>
                              </Dialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default Facilities;
