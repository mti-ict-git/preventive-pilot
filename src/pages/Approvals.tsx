import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { hasRole, isSuperadmin } from "@/lib/auth";
import {
  apiListTasks,
  apiApproveTaskBySupervisor,
  apiApproveTaskBySuperadmin,
  apiRejectTaskApproval,
  apiReviseTaskApproval,
  type ListTasksResponse,
} from "@/lib/api";

const stageLabel = (status: string): "supervisor" | "superadmin" | null => {
  if (status === "PendingSupervisor") return "supervisor";
  if (status === "PendingSuperadmin") return "superadmin";
  return null;
};

const Approvals = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"supervisor" | "superadmin">("supervisor");
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTaskId, setRejectTaskId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [reviseTaskId, setReviseTaskId] = useState<string | null>(null);
  const [reviseReason, setReviseReason] = useState("");
  const [bulkSelected, setBulkSelected] = useState<Record<string, boolean>>({});

  const canSupervisor = hasRole("Supervisor") || hasRole("Admin") || isSuperadmin();
  const canSuperadmin = isSuperadmin();

  const tasksQuery = useQuery({
    queryKey: ["approvals", { tab, locationId, categoryId }],
    queryFn: async () => {
      const res = await apiListTasks({ maintenanceType: "PM", page: 1, pageSize: 100 });
      return res;
    },
    staleTime: 15_000,
  });

  const items = useMemo(() => {
    const all = (tasksQuery.data?.items ?? []) as ListTasksResponse["items"];
    const filtered = all.filter((t) => {
      const stage = stageLabel(t.approvalStatus ?? "None");
      if (tab === "supervisor") return stage === "supervisor";
      return stage === "superadmin";
    });
    const q = search.trim().toLowerCase();
    return filtered.filter((t) => {
      if (!q) return true;
      const s = `${t.taskNumber} ${t.asset?.assetTag ?? ""} ${t.asset?.name ?? ""} ${t.template?.name ?? ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [tasksQuery.data?.items, tab, search]);

  useEffect(() => {
    setBulkSelected({});
  }, [tab]);

  const approveSupervisorMutation = useMutation({
    mutationFn: async (taskId: string) => apiApproveTaskBySupervisor(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast({ title: "Supervisor approved" });
    },
    onError: (err: unknown) => {
      toast({ title: "Approve failed", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const approveSuperadminMutation = useMutation({
    mutationFn: async (taskId: string) => apiApproveTaskBySuperadmin(taskId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast({ title: "Superadmin approved" });
    },
    onError: (err: unknown) => {
      toast({ title: "Approve failed", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectTaskId) throw new Error("No task selected");
      return apiRejectTaskApproval({ taskId: rejectTaskId, reason: rejectReason.trim() ? rejectReason.trim() : null, reopenTask: false });
    },
    onSuccess: async () => {
      setRejectDialogOpen(false);
      setRejectTaskId(null);
      setRejectReason("");
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast({ title: "Approval rejected" });
    },
    onError: (err: unknown) => {
      toast({ title: "Reject failed", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const reviseMutation = useMutation({
    mutationFn: async () => {
      if (!reviseTaskId) {
        throw new Error("No task selected");
      }
      return apiReviseTaskApproval({
        taskId: reviseTaskId,
        reason: reviseReason.trim() ? reviseReason.trim() : null,
        reopenTask: false,
      });
    },
    onSuccess: async () => {
      setReviseDialogOpen(false);
      setReviseTaskId(null);
      setReviseReason("");
      await queryClient.invalidateQueries({ queryKey: ["approvals"] });
      toast({ title: "Sent for revision" });
    },
    onError: (err: unknown) => {
      toast({
        title: "Revise failed",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      });
    },
  });

  const allVisibleIds = useMemo(() => items.map((x) => x.id), [items]);
  const selectedCount = Object.keys(bulkSelected).filter((id) => bulkSelected[id]).length;
  const allSelectedOnPage = selectedCount > 0 && allVisibleIds.every((id) => bulkSelected[id]);

  const canBulkApproveSupervisor = tab === "supervisor" && canSupervisor;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Approvals</h1>
          <p className="text-sm text-muted-foreground">Review and sign-off pending PM approvals</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => tasksQuery.refetch()} disabled={tasksQuery.isFetching}>Refresh</Button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-8">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="supervisor">Pending Supervisor</TabsTrigger>
              <TabsTrigger value="superadmin">Pending Superadmin</TabsTrigger>
            </TabsList>
            <TabsContent value="supervisor">
              <div className="space-y-3">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending supervisor approvals</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-muted-foreground">{selectedCount} selected</div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={!canBulkApproveSupervisor || selectedCount === 0 || approveSupervisorMutation.isPending}
                          onClick={async () => {
                            const ids = Object.keys(bulkSelected).filter((id) => bulkSelected[id]);
                            for (const id of ids) {
                              await approveSupervisorMutation.mutateAsync(id);
                            }
                          }}
                        >
                          Bulk Approve
                        </Button>
                      </div>
                    </div>
                    <div className="grid grid-cols-12 gap-2">
                      {items.map((t) => {
                        const dueDate = format(new Date(t.scheduledDueAt), "yyyy-MM-dd");
                        const checklistTotal = Number(t.checklistTotal ?? 0);
                        const checklistCompleted = Number(t.checklistCompleted ?? 0);
                        const canApprove = canSupervisor && (t.approvalStatus === "PendingSupervisor");
                        const canRevise = canSupervisor && (t.approvalStatus === "PendingSupervisor");
                        return (
                          <div key={t.id} className="col-span-12 glass rounded-lg p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={bulkSelected[t.id] || false}
                                  onCheckedChange={(checked) => setBulkSelected((prev) => ({ ...prev, [t.id]: !!checked }))}
                                  disabled={!canBulkApproveSupervisor}
                                />
                                <div>
                                  <p className="text-sm font-medium text-foreground">#{t.taskNumber} • {t.asset?.name ?? t.asset?.assetTag ?? ""}</p>
                                  <p className="text-xs text-muted-foreground">{t.template?.name ?? ""} • Due {dueDate}</p>
                                  <p className="text-xs text-muted-foreground">Checklist {checklistCompleted}/{checklistTotal}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => navigate(`/tasks?taskId=${t.id}`)}>View Task</Button>
                                <Button
                                  onClick={() => approveSupervisorMutation.mutate(t.id)}
                                  disabled={!canApprove || approveSupervisorMutation.isPending}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setReviseTaskId(t.id);
                                    setReviseDialogOpen(true);
                                  }}
                                  disabled={!canRevise || reviseMutation.isPending}
                                >
                                  Revise
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => {
                                    setRejectTaskId(t.id);
                                    setRejectDialogOpen(true);
                                  }}
                                  disabled={!canApprove || rejectMutation.isPending}
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
            <TabsContent value="superadmin">
              <div className="space-y-3">
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No pending superadmin approvals</p>
                ) : (
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-2">
                      {items.map((t) => {
                        const dueDate = format(new Date(t.scheduledDueAt), "yyyy-MM-dd");
                        const checklistTotal = Number(t.checklistTotal ?? 0);
                        const checklistCompleted = Number(t.checklistCompleted ?? 0);
                        const canApprove = canSuperadmin && (t.approvalStatus === "PendingSuperadmin");
                        const canRevise = canSuperadmin && (t.approvalStatus === "PendingSuperadmin");
                        return (
                          <div key={t.id} className="col-span-12 glass rounded-lg p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-foreground">#{t.taskNumber} • {t.asset?.name ?? t.asset?.assetTag ?? ""}</p>
                                <p className="text-xs text-muted-foreground">{t.template?.name ?? ""} • Due {dueDate}</p>
                                <p className="text-xs text-muted-foreground">Checklist {checklistCompleted}/{checklistTotal}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" onClick={() => navigate(`/tasks?taskId=${t.id}`)}>View Task</Button>
                                <Button
                                  onClick={() => approveSuperadminMutation.mutate(t.id)}
                                  disabled={!canApprove || approveSuperadminMutation.isPending}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setReviseTaskId(t.id);
                                    setReviseDialogOpen(true);
                                  }}
                                  disabled={!canRevise || reviseMutation.isPending}
                                >
                                  Revise
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => {
                                    setRejectTaskId(t.id);
                                    setRejectDialogOpen(true);
                                  }}
                                  disabled={!canApprove || rejectMutation.isPending}
                                >
                                  Reject
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
        <div className="col-span-12 md:col-span-4 space-y-3">
          <Input placeholder="Search approvals…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Location" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Reject Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Reason</Label>
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="bg-muted/50" />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending}>Confirm Reject</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviseDialogOpen} onOpenChange={setReviseDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Send for revision</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Instructions to previous approver or technician</Label>
            <Textarea
              value={reviseReason}
              onChange={(e) => setReviseReason(e.target.value)}
              rows={3}
              className="bg-muted/50"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setReviseDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => reviseMutation.mutate()} disabled={reviseMutation.isPending}>
                Confirm Revise
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Approvals;
