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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { getJwtClaims, hasRole, isSuperadmin } from "@/lib/auth";
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
  const [tab, setTab] = useState<"supervisor" | "superadmin" | "waiting">("supervisor");
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
  const claims = getJwtClaims();
  const currentUserId = claims?.sub ?? null;

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
    let filtered: ListTasksResponse["items"] = [];

    if (tab === "supervisor" || tab === "superadmin") {
      filtered = all.filter((t) => {
        const stage = stageLabel(t.approvalStatus ?? "None");
        if (tab === "supervisor") return stage === "supervisor";
        return stage === "superadmin";
      });
    } else if (tab === "waiting") {
      filtered = all.filter((t) => {
        const stage = stageLabel(t.approvalStatus ?? "None");
        const assignedUserId = t.assignedTo.userId;
        const isAssignedToCurrentUser = currentUserId !== null && assignedUserId === currentUserId;
        const hasNoApprovalStage = stage === null;
        const isTechnicianCompleted = t.technicianCompletedAt !== null;
        return isAssignedToCurrentUser && hasNoApprovalStage && isTechnicianCompleted;
      });
    }

    const q = search.trim().toLowerCase();
    if (!q) {
      return filtered;
    }

    return filtered.filter((t) => {
      const s = `${t.taskNumber} ${t.asset?.assetTag ?? ""} ${t.asset?.name ?? ""} ${t.template?.name ?? ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [tasksQuery.data?.items, tab, search, currentUserId]);

  const summary = useMemo(() => {
    const all = (tasksQuery.data?.items ?? []) as ListTasksResponse["items"];
    let pendingSupervisor = 0;
    let pendingSuperadmin = 0;
    let waitingSubmit = 0;

    for (const t of all) {
      const stage = stageLabel(t.approvalStatus ?? "None");
      if (stage === "supervisor") pendingSupervisor += 1;
      if (stage === "superadmin") pendingSuperadmin += 1;

      const assignedUserId = t.assignedTo.userId;
      const isAssignedToCurrentUser = currentUserId !== null && assignedUserId === currentUserId;
      const hasNoApprovalStage = stage === null;
      const isTechnicianCompleted = t.technicianCompletedAt !== null;
      if (isAssignedToCurrentUser && hasNoApprovalStage && isTechnicianCompleted) waitingSubmit += 1;
    }

    return { pendingSupervisor, pendingSuperadmin, waitingSubmit };
  }, [tasksQuery.data?.items, currentUserId]);

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
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">PM Approvals</p>
            <h1 className="text-2xl font-semibold text-foreground">Approvals Inbox</h1>
            <p className="text-sm text-muted-foreground">Review and sign-off pending PM approvals</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => tasksQuery.refetch()} disabled={tasksQuery.isFetching}>Refresh</Button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-border/60 bg-background/70 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pending Supervisor</p>
                  <p className="text-2xl font-semibold text-foreground">{summary.pendingSupervisor}</p>
                </div>
                <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Supervisor</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/70 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pending Superadmin</p>
                  <p className="text-2xl font-semibold text-foreground">{summary.pendingSuperadmin}</p>
                </div>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Superadmin</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/60 bg-background/70 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Waiting Submit</p>
                  <p className="text-2xl font-semibold text-foreground">{summary.waitingSubmit}</p>
                </div>
                <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">My Tasks</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-6">
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base text-foreground">Approval Queue</CardTitle>
                  <CardDescription>Focus on what needs your attention right now.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs">{items.length} items</Badge>
                  {tab === "supervisor" ? (
                    <>
                      <Badge
                        variant="outline"
                        className="rounded-md px-2.5 py-1 text-xs bg-muted/30 text-muted-foreground border-border"
                      >
                        {selectedCount} selected
                      </Badge>
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
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="w-full">
                <TabsList className="bg-muted/40 p-1 rounded-lg">
                  <TabsTrigger
                    value="supervisor"
                    className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Pending Supervisor
                  </TabsTrigger>
                  <TabsTrigger
                    value="superadmin"
                    className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Pending Superadmin
                  </TabsTrigger>
                  <TabsTrigger
                    value="waiting"
                    className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Waiting Submit
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="supervisor" className="mt-4">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-8 text-center text-sm text-muted-foreground">
                      No pending supervisor approvals
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-3">
                      {items.map((t) => {
                        const dueDate = format(new Date(t.scheduledDueAt), "yyyy-MM-dd");
                        const checklistTotal = Number(t.checklistTotal ?? 0);
                        const checklistCompleted = Number(t.checklistCompleted ?? 0);
                        const canApprove = canSupervisor && (t.approvalStatus === "PendingSupervisor");
                        const canRevise = canSupervisor && (t.approvalStatus === "PendingSupervisor");
                        return (
                          <div key={t.id} className="col-span-12 rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm transition-shadow hover:shadow-md">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  checked={bulkSelected[t.id] || false}
                                  onCheckedChange={(checked) => setBulkSelected((prev) => ({ ...prev, [t.id]: !!checked }))}
                                  disabled={!canBulkApproveSupervisor}
                                />
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-sm font-semibold text-foreground">#{t.taskNumber} • {t.asset?.name ?? t.asset?.assetTag ?? ""}</p>
                                    <Badge variant="outline" className="bg-warning/10 text-warning border-warning/30">Supervisor</Badge>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    <span>{t.template?.name ?? ""}</span>
                                    <span>•</span>
                                    <span>Due {dueDate}</span>
                                    <span>•</span>
                                    <span>Checklist {checklistCompleted}/{checklistTotal}</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
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
                  )}
                </TabsContent>
                <TabsContent value="superadmin" className="mt-4">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-8 text-center text-sm text-muted-foreground">
                      No pending superadmin approvals
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-3">
                      {items.map((t) => {
                        const dueDate = format(new Date(t.scheduledDueAt), "yyyy-MM-dd");
                        const checklistTotal = Number(t.checklistTotal ?? 0);
                        const checklistCompleted = Number(t.checklistCompleted ?? 0);
                        const canApprove = canSuperadmin && (t.approvalStatus === "PendingSuperadmin");
                        const canRevise = canSuperadmin && (t.approvalStatus === "PendingSuperadmin");
                        return (
                          <div key={t.id} className="col-span-12 rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm transition-shadow hover:shadow-md">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground">#{t.taskNumber} • {t.asset?.name ?? t.asset?.assetTag ?? ""}</p>
                                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">Superadmin</Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{t.template?.name ?? ""}</span>
                                  <span>•</span>
                                  <span>Due {dueDate}</span>
                                  <span>•</span>
                                  <span>Checklist {checklistCompleted}/{checklistTotal}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
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
                  )}
                </TabsContent>
                <TabsContent value="waiting" className="mt-4">
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-8 text-center text-sm text-muted-foreground">
                      No tasks waiting to submit for approval
                    </div>
                  ) : (
                    <div className="grid grid-cols-12 gap-3">
                      {items.map((t) => {
                        const dueDate = format(new Date(t.scheduledDueAt), "yyyy-MM-dd");
                        const checklistTotal = Number(t.checklistTotal ?? 0);
                        const checklistCompleted = Number(t.checklistCompleted ?? 0);
                        return (
                          <div key={t.id} className="col-span-12 rounded-xl border border-border/60 bg-background/80 p-4 shadow-sm transition-shadow hover:shadow-md">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-foreground">#{t.taskNumber} • {t.asset?.name ?? t.asset?.assetTag ?? ""}</p>
                                  <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">Waiting</Badge>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                  <span>{t.template?.name ?? ""}</span>
                                  <span>•</span>
                                  <span>Due {dueDate}</span>
                                  <span>•</span>
                                  <span>Checklist {checklistCompleted}/{checklistTotal}</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Button variant="outline" onClick={() => navigate(`/tasks?taskId=${t.id}`)}>
                                  View Task
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        <div className="col-span-12 lg:col-span-4">
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="text-base text-foreground">Filters</CardTitle>
              <CardDescription>Refine approvals list quickly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Search</Label>
                <Input
                  placeholder="Search approvals…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 bg-background/80"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger className="h-9 bg-background/80"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-9 bg-background/80"><SelectValue placeholder="Category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
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
