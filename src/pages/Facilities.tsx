import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  apiGetLookups,
  apiListFacilities,
  apiCreateFacility,
  apiUpdateFacilityPmSettings,
  apiFacilityPmNow,
  type Facility,
  type LookupsResponse,
} from "@/lib/api";

const Facilities = () => {
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState<string>("all");
  const [pmEnabledFilter, setPmEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [createOpen, setCreateOpen] = useState(false);

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

        <div className="bg-card rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
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
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell>{f.location?.name ?? "—"}</TableCell>
                  <TableCell>{f.pm.enabled ? "Enabled" : "Disabled"}</TableCell>
                  <TableCell>{f.pm.lastCompletedAt ?? "—"}</TableCell>
                  <TableCell>{f.pm.nextDueAt ?? "—"}</TableCell>
                  <TableCell className="text-right space-x-2">
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
