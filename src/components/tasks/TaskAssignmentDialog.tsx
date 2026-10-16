import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiAssignTask, apiGetLookups, apiListAssignableUsers } from "@/lib/api";
import { isManager } from "@/lib/auth";
import { getTaskAssignmentLockReason, type AssignmentTask } from "@/lib/taskAssignment";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; task: AssignmentTask | null; onAssigned?: () => Promise<void> | void };

export const TaskAssignmentDialog = ({ open, onOpenChange, task, onAssigned }: Props) => {
  const queryClient = useQueryClient();
  const id = useId();
  const initializedTask = useRef<string | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [mode, setMode] = useState<"user" | "role" | "unassigned">("user");
  const [userId, setUserId] = useState("");
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const lockReason = task ? getTaskAssignmentLockReason(task) : null;
  const canAssign = isManager();
  const users = useQuery({ queryKey: ["assignable-users", { page: 1, pageSize: 500, isActive: true }], queryFn: () => apiListAssignableUsers({ page: 1, pageSize: 500, isActive: true }), enabled: open && canAssign && !!task && !lockReason });
  const lookups = useQuery({ queryKey: ["lookups"], queryFn: apiGetLookups, enabled: open && canAssign && !!task && !lockReason });
  const save = useMutation({
    mutationFn: apiAssignTask,
    onSuccess: async (_result, input) => {
      onOpenChange(false);
      toast({ title: "Task assigned" });
      const refreshed = await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["task", input.taskId] }),
        queryClient.invalidateQueries({ queryKey: ["task-stats"] }),
        queryClient.invalidateQueries({ queryKey: ["approvals"] }),
        Promise.resolve().then(() => onAssigned?.()),
      ]);
      if (refreshed.some(result => result.status === "rejected")) toast({ title: "Assignment saved", description: "Refresh the task to reload its latest details." });
    },
    onError: (err: unknown) => setError(err instanceof Error ? err.message : "Assignment failed. Try again."),
  });
  useEffect(() => {
    if (!open) { initializedTask.current = null; return; }
    if (!task || initializedTask.current === task.id) return;
    initializedTask.current = task.id;
    setMode(task.assignedTo.userId ? "user" : task.assignedTo.roleId ? "role" : "unassigned");
    setUserId(task.assignedTo.userId ?? "");
    setRoleId(task.assignedTo.roleId ?? "");
    setError(null);
  }, [open, task]);
  if (!canAssign) return null;
  const technicians = (users.data?.items ?? []).filter(user => user.roles.some(role => role.trim().toLowerCase() === "technician")).slice().sort((a, b) => (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username));
  const readError = mode === "user" ? users.isError : mode === "role" ? lookups.isError : false;
  const loading = mode === "user" ? users.isLoading : mode === "role" ? lookups.isLoading : false;
  const disabled = !task || !!lockReason || save.isPending || loading || readError;
  return (
    <Dialog open={open} onOpenChange={value => { if (!save.isPending) onOpenChange(value); }}>
      <DialogContent className="w-[calc(100%_-_2rem)] max-w-lg" aria-busy={save.isPending}
        onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
        onCloseAutoFocus={event => { if (returnFocus.current?.isConnected) { event.preventDefault(); returnFocus.current.focus(); } }}>

        <DialogHeader>
          <DialogTitle>Assign Task</DialogTitle>
          <DialogDescription>{task?.taskNumber}. Choose a technician, a role queue, or remove the current assignment.</DialogDescription>
        </DialogHeader>
        <form noValidate className="space-y-4" onSubmit={event => {
          event.preventDefault();
          if (disabled || !task || (mode === "user" && !userId) || (mode === "role" && !roleId)) return;
          setError(null);
          save.mutate({ taskId: task.id, assignedToUserId: mode === "user" ? userId : null, assignedToRoleId: mode === "role" ? roleId : null });
        }}>
          {lockReason && <p role="status" className="text-sm text-muted-foreground">{lockReason}</p>}
          <div className="space-y-2">
            <Label id={`${id}-target`}>Assignment Target</Label>
            <RadioGroup aria-labelledby={`${id}-target`} value={mode} onValueChange={value => setMode(value as typeof mode)} disabled={save.isPending || !!lockReason} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([['user', 'User'], ['role', 'Role'], ['unassigned', 'Unassign']] as const).map(([value, label]) => <div key={value} className="flex items-center gap-2"><RadioGroupItem id={`${id}-target-${value}`} value={value} /><Label htmlFor={`${id}-target-${value}`}>{label}</Label></div>)}
            </RadioGroup>
          </div>
          {mode === "user" && <div className="space-y-2">
            <Label htmlFor={`${id}-technician`}>Technician</Label>
            <Select value={userId} onValueChange={value => { if (value) setUserId(value); }} disabled={disabled}>
              <SelectTrigger id={`${id}-technician`}><SelectValue placeholder="Select technician" /></SelectTrigger>
              <SelectContent>{technicians.map(user => <SelectItem key={user.id} value={user.id}>{user.displayName ?? user.username}</SelectItem>)}</SelectContent>
            </Select>
            {!users.isLoading && !users.isError && technicians.length === 0 && <p className="text-sm text-muted-foreground">No active technicians available.</p>}
          </div>}
          {mode === "role" && <div className="space-y-2">
            <Label htmlFor={`${id}-role`}>Role</Label>
            <Select value={roleId} onValueChange={value => { if (value) setRoleId(value); }} disabled={disabled}>
              <SelectTrigger id={`${id}-role`}><SelectValue placeholder="Select role" /></SelectTrigger>
              <SelectContent>{(lookups.data?.roles ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)).map(role => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent>
            </Select>
            {!lookups.isLoading && !lookups.isError && !lookups.data?.roles.length && <p className="text-sm text-muted-foreground">No roles available.</p>}
          </div>}
          {loading && <p role="status" className="text-sm text-muted-foreground">Loading assignment options…</p>}
          {readError && <div role="alert" className="space-y-2 text-sm text-destructive"><p>Unable to load assignment options.</p><Button type="button" variant="outline" onClick={() => { void (mode === "user" ? users.refetch() : lookups.refetch()); }}>Retry</Button></div>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={disabled || (mode === "user" && !userId) || (mode === "role" && !roleId)}>{save.isPending ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
