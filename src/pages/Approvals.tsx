import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/lib/api";

import { loadWaitingSubmissions } from "@/lib/approvalQueue";

const Approvals = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabValue = searchParams.get("tab");
  const tab = tabValue === "superadmin" || tabValue === "waiting" ? tabValue : "supervisor";
  const page = Math.max(1, Math.floor(Number(searchParams.get("page")) || 1));
  const committedSearch = searchParams.get("q") ?? "";
  const [search, setSearch] = useState(committedSearch);
  const [composing, setComposing] = useState(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const updateFilter = (key: string, value: string) => setSearchParams(previous => {
    const next = new URLSearchParams(previous);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    return next;
  }, { replace: true });
  const setPage = (value: number) => setSearchParams(previous => {
    const next = new URLSearchParams(previous); next.set("page", String(value)); return next;
  });
  useEffect(() => { setSearch(committedSearch); }, [committedSearch]);
  useEffect(() => {
    if (composing || search === committedSearch) return;
    const timeout = window.setTimeout(() => updateFilter("q", search.trim()), search.trim() ? 300 : 0);
    return () => window.clearTimeout(timeout);
  }, [search, composing, committedSearch]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectTaskId, setRejectTaskId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reviseDialogOpen, setReviseDialogOpen] = useState(false);
  const [reviseTaskId, setReviseTaskId] = useState<string | null>(null);
  const [reviseReason, setReviseReason] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Record<string, boolean>>({});

  const canSupervisor = hasRole("Supervisor") || hasRole("Admin") || isSuperadmin();
  const canSuperadmin = isSuperadmin();
  const claims = getJwtClaims();
  const currentUserId = claims?.sub ?? null;

  const view: "pending_superadmin" | "pending_supervisor" = tab === "superadmin" ? "pending_superadmin" : "pending_supervisor";
  const listInput = { maintenanceType: "PM" as const, view, q: committedSearch || undefined, page: tab === "waiting" ? 1 : page, pageSize: 25 };
  const tasksQuery = useQuery({
    queryKey: ["approvals", "queue", listInput],
    queryFn: () => apiListTasks(listInput),
    refetchInterval: 30_000,
  });
  const waitingQuery = useQuery({
    queryKey: ["approvals", "waiting", currentUserId, committedSearch],
    queryFn: () => loadWaitingSubmissions(apiListTasks, currentUserId, committedSearch),
    refetchInterval: 30_000,
  });
  const queueQuery = tab === "waiting" ? waitingQuery : tasksQuery;
  const total = tab === "waiting" ? waitingQuery.data?.length ?? 0 : tasksQuery.data?.total ?? 0;
  const items = tab === "waiting" ? (waitingQuery.data ?? []).slice((page - 1) * 25, page * 25) : tasksQuery.data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil(total / 25));
  const summary = {
    pendingSupervisor: tasksQuery.isError ? "Unavailable" : tasksQuery.data?.tabCounts.pending_supervisor ?? "…",
    pendingSuperadmin: tasksQuery.isError ? "Unavailable" : tasksQuery.data?.tabCounts.pending_superadmin ?? "…",
    waitingSubmit: waitingQuery.isError ? "Unavailable" : waitingQuery.data?.length ?? "…",
  };
  useEffect(() => {
    if (queueQuery.isSuccess && page > pageCount) setPage(pageCount);
  }, [queueQuery.isSuccess, page, pageCount]);
  useEffect(() => { setBulkSelected({}); }, [tab, page, committedSearch]);
  const refreshQueues = async () => {
    await Promise.all(["approvals", "tasks", "task-stats"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
  };

  const approveSupervisorMutation = useMutation({
    mutationFn: async (taskId: string) => apiApproveTaskBySupervisor(taskId),
    onSuccess: async () => {
      await refreshQueues();
      toast({ title: "Supervisor approved" });
    },
    onError: (err: unknown) => {
      toast({ title: "Approve failed", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const approveSuperadminMutation = useMutation({
    mutationFn: async (taskId: string) => apiApproveTaskBySuperadmin(taskId),
    onSuccess: async () => {
      await refreshQueues();
      toast({ title: "Superadmin approved" });
    },
    onError: (err: unknown) => {
      toast({ title: "Approve failed", description: err instanceof Error ? err.message : "Request failed", variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectTaskId) throw new Error("No task selected");
      return apiRejectTaskApproval({ taskId: rejectTaskId, reason: rejectReason.trim(), reopenTask: false });
    },
    onSuccess: async () => {
      setRejectDialogOpen(false);
      setRejectTaskId(null);
      setRejectReason("");
      await refreshQueues();
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
        reason: reviseReason.trim(),
        reopenTask: false,
      });
    },
    onSuccess: async () => {
      setReviseDialogOpen(false);
      setReviseTaskId(null);
      setReviseReason("");
      await refreshQueues();
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
  const selectedCount = allVisibleIds.filter(id => bulkSelected[id]).length;

  const mutationPending = bulkBusy || approveSupervisorMutation.isPending || approveSuperadminMutation.isPending || rejectMutation.isPending || reviseMutation.isPending;
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
            <Button variant="outline" onClick={() => { void tasksQuery.refetch(); void waitingQuery.refetch(); }} disabled={tasksQuery.isFetching || waitingQuery.isFetching}>Refresh</Button>
          </div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="border-border/60 bg-background/70 shadow-sm">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
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
              <div className="flex flex-wrap items-center justify-between gap-2">
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
        <div className="col-span-12 lg:col-span-8 space-y-6 order-last lg:order-first">
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <CardTitle className="text-base text-foreground">Approval Queue</CardTitle>
                  <CardDescription>Focus on what needs your attention right now.</CardDescription>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="rounded-md px-2.5 py-1 text-xs">{queueQuery.isSuccess ? `${total} items` : queueQuery.isError ? "Unavailable" : "Loading…"}</Badge>
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
                        disabled={!canBulkApproveSupervisor || selectedCount === 0 || mutationPending || queueQuery.isFetching}
                        onClick={async () => {
                          const ids = allVisibleIds.filter((id) => bulkSelected[id]);
                          setBulkBusy(true);
                          try {
                            for (const id of ids) {
                              try { await approveSupervisorMutation.mutateAsync(id); } catch { break; }
                            }
                          } finally { setBulkBusy(false); setBulkSelected({}); }
                        }}
                      >
                        Bulk Approve
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4" aria-busy={queueQuery.isFetching}>
              {queueQuery.isPending ? <div role="status" className="min-h-32 p-8 text-center text-muted-foreground">Loading approval queue…</div> : null}
              {queueQuery.isError ? <div role="alert" className="min-h-32 p-4 space-y-3"><p>Could not load the approval queue. Please retry.</p><Button variant="outline" onClick={() => { void queueQuery.refetch(); }}>Retry</Button></div> : null}
              {queueQuery.isFetching && !queueQuery.isPending ? <p role="status" className="text-sm text-muted-foreground">Refreshing queue…</p> : null}
              <Tabs activationMode="manual" value={tab} onValueChange={(v) => updateFilter("tab", v)} className="w-full">
                <TabsList className="bg-muted/40 p-1 rounded-lg flex h-auto flex-wrap justify-start gap-1">
                  <TabsTrigger
                    value="supervisor"
                    className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Pending Supervisor <Badge variant="secondary" className="ml-2 tabular-nums">{summary.pendingSupervisor}</Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="superadmin"
                    className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Pending Superadmin <Badge variant="secondary" className="ml-2 tabular-nums">{summary.pendingSuperadmin}</Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="waiting"
                    className="rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm"
                  >
                    Waiting Submit <Badge variant="secondary" className="ml-2 tabular-nums">{summary.waitingSubmit}</Badge>
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="supervisor" className="mt-4">
                  {queueQuery.isPending || queueQuery.isError ? null : items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-8 text-center text-sm text-muted-foreground">
                      {committedSearch ? "No supervisor approvals match your search" : "No pending supervisor approvals"}
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
                                  aria-label={`Select ${t.taskNumber}`} disabled={!canBulkApproveSupervisor || mutationPending || queueQuery.isFetching}
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
                                <Button variant="outline" onClick={() => navigate(`/tasks?view=${view}&taskId=${t.id}`)}>View Task</Button>
                                <Button
                                  onClick={() => approveSupervisorMutation.mutate(t.id)}
                                  disabled={!canApprove || mutationPending || queueQuery.isFetching}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setReviseTaskId(t.id);
                                    setReviseDialogOpen(true);
                                  }}
                                  disabled={!canRevise || mutationPending || queueQuery.isFetching}
                                >
                                  Revise
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => {
                                    setRejectTaskId(t.id);
                                    setRejectDialogOpen(true);
                                  }}
                                  disabled={!canApprove || mutationPending || queueQuery.isFetching}
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
                  {queueQuery.isPending || queueQuery.isError ? null : items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/40 p-8 text-center text-sm text-muted-foreground">
                      {committedSearch ? "No superadmin approvals match your search" : "No pending superadmin approvals"}
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
                                <Button variant="outline" onClick={() => navigate(`/tasks?view=${view}&taskId=${t.id}`)}>View Task</Button>
                                <Button
                                  onClick={() => approveSuperadminMutation.mutate(t.id)}
                                  disabled={!canApprove || mutationPending || queueQuery.isFetching}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="outline"
                                  onClick={() => {
                                    setReviseTaskId(t.id);
                                    setReviseDialogOpen(true);
                                  }}
                                  disabled={!canRevise || mutationPending || queueQuery.isFetching}
                                >
                                  Revise
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => {
                                    setRejectTaskId(t.id);
                                    setRejectDialogOpen(true);
                                  }}
                                  disabled={!canApprove || mutationPending || queueQuery.isFetching}
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
                  {queueQuery.isPending || queueQuery.isError ? null : items.length === 0 ? (
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
                                <Button variant="outline" onClick={() => navigate(`/tasks?view=${view}&taskId=${t.id}`)}>
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
              {queueQuery.isSuccess ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
                <span role="status">{total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, total)} of ${total}` : "0 results"}</span>
                <div className="flex items-center gap-3"><Button variant="outline" size="sm" disabled={page <= 1 || queueQuery.isFetching} onClick={() => setPage(page - 1)}>Previous</Button><span className="tabular-nums">Page {page} of {pageCount}</span><Button variant="outline" size="sm" disabled={page >= pageCount || queueQuery.isFetching} onClick={() => setPage(page + 1)}>Next</Button></div>
              </div> : null}
            </CardContent>
          </Card>
        </div>
        <div className="col-span-12 lg:col-span-4 order-first lg:order-last">
          <Card className="border-border/60 bg-card/70 shadow-sm">
            <CardHeader className="border-b border-border/60 pb-3">
              <CardTitle className="text-base text-foreground">Filters</CardTitle>
              <CardDescription>Refine approvals list quickly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="approval-search" className="text-xs text-muted-foreground">Search</Label>
                <Input id="approval-search" ref={searchInput} placeholder="Search task, asset or facility…" value={search}
                  onChange={(e) => setSearch(e.target.value)} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) updateFilter("q", search.trim()); }} className="h-9 bg-background/80" />
                {search ? <Button variant="outline" size="sm" onClick={() => { setSearch(""); updateFilter("q", ""); searchInput.current?.focus(); }}>Clear search</Button> : null}
                <p className="text-xs text-muted-foreground">Search and counts cover the full queue, across all pages.</p>
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
            <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={3} className="bg-muted/50 resize-none" />
            <p className="text-xs text-muted-foreground">
              Reject creates a new linked replacement PM task and preserves the rejected submission history.
            </p>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={() => rejectMutation.mutate()} disabled={rejectMutation.isPending || rejectReason.trim().length === 0}>Confirm Reject</Button>
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
              className="bg-muted/50 resize-none"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setReviseDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => reviseMutation.mutate()} disabled={reviseMutation.isPending || reviseReason.trim().length === 0}>
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
