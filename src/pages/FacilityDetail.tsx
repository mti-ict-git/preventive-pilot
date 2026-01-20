import { useMemo, useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import Header from "@/components/layout/Header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QRCodeSVG } from "qrcode.react";
import {
  apiGetFacility,
  apiListTasks,
  apiUpdateFacilityPmSettings,
  apiListTemplates,
  apiFacilityPmNow,
  type Facility,
  type TemplateSummary,
  type ListTasksResponse,
} from "@/lib/api";

const FacilityDetail = () => {
  const params = useParams();
  const facilityId = params.facilityId as string;
  const queryClient = useQueryClient();

  const facilityQuery = useQuery<Facility>({
    queryKey: ["facility", facilityId],
    queryFn: () => apiGetFacility(facilityId),
  });

  const templatesQuery = useQuery<{ items: TemplateSummary[] }>({
    queryKey: ["templates", "active"],
    queryFn: () => apiListTemplates({ active: true }),
    staleTime: 60_000,
  });

  const tasksQuery = useQuery<ListTasksResponse>({
    queryKey: ["tasks", "facility", facilityId],
    queryFn: () => apiListTasks({ facilityId, page: 1, pageSize: 50 }),
  });

  const [pmEnabled, setPmEnabled] = useState<boolean | null>(null);
  const [defaultTemplateId, setDefaultTemplateId] = useState<string>("none");
  const [nextDueAt, setNextDueAt] = useState<string>("");

  const updatePmMutation = useMutation({
    mutationFn: (input: { facilityId: string; pmEnabled?: boolean; defaultTemplateId?: string | null; nextPmDueAt?: string | null }) =>
      apiUpdateFacilityPmSettings(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["facility", facilityId] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "facility", facilityId] });
    },
  });

  const pmNowMutation = useMutation({
    mutationFn: (fid: string) => apiFacilityPmNow(fid),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks", "facility", facilityId] });
    },
  });

  const templates = templatesQuery.data?.items ?? [];

  const templateOptions = useMemo(() => [{ id: "none", name: "No Template" }, ...templates], [templates]);

  const f = facilityQuery.data;

  useEffect(() => {
    const data = facilityQuery.data;
    if (!data) return;
    setPmEnabled(data.pm.enabled ?? false);
    setDefaultTemplateId(data.pm.defaultTemplateId ?? "none");
    setNextDueAt(data.pm.nextDueAt ?? "");
  }, [facilityQuery.data]);

  return (
    <>
      <Header title="Facility" subtitle={f ? f.name : ""} />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-6">
            <Card>
              <CardHeader>
                <CardTitle>PM Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-12 gap-4">
                  <div className="col-span-12 md:col-span-4">
                    <Select
                      value={pmEnabled ? "enabled" : "disabled"}
                      onValueChange={(v) => setPmEnabled(v === "enabled")}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="PM Enabled" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enabled">Enabled</SelectItem>
                        <SelectItem value="disabled">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Select value={defaultTemplateId} onValueChange={setDefaultTemplateId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Default Template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templateOptions.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-12 md:col-span-4">
                    <Input
                      placeholder="Next PM Due (ISO)"
                      value={nextDueAt}
                      onChange={(e) => setNextDueAt(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() =>
                      updatePmMutation.mutate({
                        facilityId,
                        pmEnabled: pmEnabled ?? undefined,
                        defaultTemplateId: defaultTemplateId === "none" ? null : defaultTemplateId,
                        nextPmDueAt: nextDueAt ? nextDueAt : null,
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button variant="outline" onClick={() => pmNowMutation.mutate(facilityId)}>PM Now</Button>
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="col-span-12 md:col-span-6">
            <Card>
              <CardHeader>
                <CardTitle>Facility QR</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-center">
                <QRCodeSVG value={facilityId} size={200} />
              </CardContent>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>PM History</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Completed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(tasksQuery.data?.items ?? []).map((t) => (
                  <TableRow key={t.id}>
                    <TableCell>{t.taskNumber}</TableCell>
                    <TableCell>{t.status}</TableCell>
                    <TableCell>{t.scheduledDueAt}</TableCell>
                    <TableCell>{t.completedAt ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default FacilityDetail;
