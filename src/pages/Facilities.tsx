import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  apiFacilityPmNow,
  apiListTemplates,
  type Facility,
  type LookupsResponse,
  type TemplateSummary,
} from "@/lib/api";

const Facilities = () => {
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string>("all");
  const [pmEnabledFilter, setPmEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkTemplateOpen, setBulkTemplateOpen] = useState(false);
  const [bulkTemplateValue, setBulkTemplateValue] = useState<string>("none");
  const [selectedFacilityIds, setSelectedFacilityIds] = useState<Record<string, true>>({});
  const [rowTemplateDialogFacilityId, setRowTemplateDialogFacilityId] = useState<string | null>(null);
  const [rowTemplateValue, setRowTemplateValue] = useState<string>("none");
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
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-5">
            <Input placeholder="Search facilities..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="col-span-12 md:col-span-3">
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
          <div className="col-span-12 md:col-span-2">
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
          <div className="col-span-12 md:col-span-2 flex justify-end">
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>Create Facility</Button>
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
        </div>

        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{selectedCount} selected</div>
          <div className="flex gap-2">
            <Button
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
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={selectedCount === 0}>
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
            <Dialog open={bulkTemplateOpen} onOpenChange={setBulkTemplateOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" disabled={selectedCount === 0}>Bulk Set Template</Button>
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
          </div>
        </div>

        <div className="bg-card rounded-lg border">
          <Table>
            <TableHeader>
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
                <TableHead>Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>PM Enabled</TableHead>
                <TableHead>Last PM</TableHead>
                <TableHead>Next Due</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{f.location?.name ?? "—"}</TableCell>
                  <TableCell>{f.pm.enabled ? "Enabled" : "Disabled"}</TableCell>
                  <TableCell>{f.pm.lastCompletedAt ?? "—"}</TableCell>
                  <TableCell>{f.pm.nextDueAt ?? "—"}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" onClick={() => navigate(`/facilities/${f.id}`)}>
                      Details
                    </Button>
                    <Button variant="outline" onClick={() => pmNowMutation.mutate(f.id)}>PM Now</Button>
                    <Button
                      variant="secondary"
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
                        <Button variant="ghost">Set Template</Button>
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
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
};

export default Facilities;
