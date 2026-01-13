import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Mail,
} from "lucide-react";
import Header from "@/components/layout/Header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { Skeleton } from "@/components/ui/skeleton";
import { apiGetLookups, apiListUsers, apiUpdateUserRoles, type LookupRole, type UserSummary } from "@/lib/api";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";

type UserStatusFilter = "all" | "active" | "inactive";

const UserManagement = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const lookupsQuery = useQuery({
    queryKey: ["lookups", "roles"],
    queryFn: apiGetLookups,
  });

  const usersQuery = useQuery({
    queryKey: ["users", { search, statusFilter, page, pageSize }],
    queryFn: () =>
      apiListUsers({
        page,
        pageSize,
        search,
        isActive: statusFilter === "all" ? undefined : statusFilter === "active",
      }),
    placeholderData: (prev) => prev,
  });

  const roles: LookupRole[] = lookupsQuery.data?.roles ?? [];
  const users: UserSummary[] = usersQuery.data?.items ?? [];

  const queryClient = useQueryClient();
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserSummary | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [nextActive, setNextActive] = useState<boolean>(true);
  const [newRoleName, setNewRoleName] = useState("");

  const openEdit = (user: UserSummary) => {
    setEditTarget(user);
    setSelectedRoles([...user.roles]);
    setNextActive(Boolean(user.isActive));
    setEditDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!editTarget) return Promise.resolve({ ok: true, roles: [] });
      return apiUpdateUserRoles({ userId: editTarget.id, roles: selectedRoles, isActive: nextActive });
    },
    onSuccess: async () => {
      setEditDialogOpen(false);
      setEditTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["lookups", "roles"] });
    },
  });

  const usersByRole = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of users) {
      for (const role of user.roles) {
        counts.set(role, (counts.get(role) ?? 0) + 1);
      }
    }
    return counts;
  }, [users]);

  const roleMeta: Record<string, { description: string; color: string }> = {
    Superadmin: { description: "Full platform access", color: "bg-destructive/20 text-destructive" },
    Admin: { description: "System configuration and management", color: "bg-destructive/20 text-destructive" },
    Supervisor: { description: "Approve and manage assigned work", color: "bg-warning/20 text-warning" },
    Technician: { description: "Execute PM tasks", color: "bg-primary/20 text-primary" },
    Viewer: { description: "Read-only access", color: "bg-muted text-muted-foreground" },
  };

  const getRoleBadge = (role: string) => {
    const styles: Record<string, string> = {
      Superadmin: "bg-destructive/20 text-destructive border-destructive/30",
      Admin: "bg-destructive/20 text-destructive border-destructive/30",
      Supervisor: "bg-warning/20 text-warning border-warning/30",
      Technician: "bg-primary/20 text-primary border-primary/30",
      Viewer: "bg-muted text-muted-foreground border-border",
    };
    const className = styles[role] ?? "bg-muted text-muted-foreground border-border";
    return (
      <Badge variant="outline" className={className}>
        {role}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen">
      <Header title="Users & Roles" subtitle="Manage system access and permissions" />

      <div className="p-6 space-y-6">
        {/* Roles Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {lookupsQuery.isLoading
            ? Array.from({ length: 4 }).map((_, index) => (
                <motion.div
                  key={`role-skeleton-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="stat-card"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-3 w-32" />
                </motion.div>
              ))
            : roles.map((role, index) => {
                const meta = roleMeta[role.name] ?? {
                  description: "System role used for access control.",
                  color: "bg-muted text-muted-foreground",
                };
                const userCount = usersByRole.get(role.name) ?? 0;

                return (
                  <motion.div
                    key={role.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="stat-card"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${meta.color}`}>
                        <Shield className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-foreground">{role.name}</p>
                        <p className="text-xs text-muted-foreground">{userCount} users</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{meta.description}</p>
                  </motion.div>
                );
              })}
        </div>

        {/* Users List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="glass rounded-xl overflow-hidden"
        >
          <div className="p-4 border-b border-border flex flex-col md:flex-row gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                className="pl-10 bg-muted/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant={statusFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter("all");
                  setPage(1);
                }}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "active" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter("active");
                  setPage(1);
                }}
              >
                Active
              </Button>
              <Button
                variant={statusFilter === "inactive" ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setStatusFilter("inactive");
                  setPage(1);
                }}
              >
                Inactive
              </Button>
            </div>
            <Button className="gap-2 bg-gradient-to-r from-primary to-accent hover:opacity-90">
              <Plus className="w-4 h-4" />
              Add User
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-muted-foreground">User</TableHead>
                <TableHead className="text-muted-foreground">Role</TableHead>
                <TableHead className="text-muted-foreground">Tasks Completed</TableHead>
                <TableHead className="text-muted-foreground">Status</TableHead>
                <TableHead className="text-muted-foreground"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usersQuery.isLoading
                ? Array.from({ length: 5 }).map((_, index) => (
                    <motion.tr
                      key={`user-skeleton-${index}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 + index * 0.05 }}
                      className="border-border hover:bg-muted/30 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Skeleton className="w-10 h-10 rounded-full" />
                          <div className="space-y-1">
                            <Skeleton className="h-4 w-32" />
                            <Skeleton className="h-3 w-40" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                      <TableCell>
                        <Skeleton className="h-8 w-8 rounded-full" />
                      </TableCell>
                    </motion.tr>
                  ))
                : users.map((user, index) => (
                <motion.tr
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className="border-border hover:bg-muted/30 transition-colors"
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarFallback className="bg-primary/20 text-primary">
                          {(user.displayName ?? user.username)
                            .split(" ")
                            .filter((part) => part.length > 0)
                            .slice(0, 2)
                            .map((part) => {
                              const first = part[0];
                              return first ? first.toUpperCase() : "";
                            })
                            .join("")}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-foreground">{user.displayName ?? user.username}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="space-x-1">
                    {user.roles.map((role) => (
                      <span key={role}>{getRoleBadge(role)}</span>
                    ))}
                  </TableCell>
                  <TableCell className="text-foreground">{user.tasksCompleted}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={
                      user.isActive
                        ? "bg-success/20 text-success border-success/30"
                        : "bg-muted text-muted-foreground"
                    }>
                      {user.isActive ? "active" : "inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem className="gap-2" onClick={() => openEdit(user)}>
                          <Edit2 className="w-4 h-4" /> Edit User
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2">
                          <Mail className="w-4 h-4" /> Send Email
                        </DropdownMenuItem>
                        <DropdownMenuItem className="gap-2 text-destructive">
                          <Trash2 className="w-4 h-4" /> Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </motion.tr>
                ))}
            </TableBody>
          </Table>

          {usersQuery.isError && (
            <div className="p-4 text-sm text-destructive border-t border-border">Failed to load users.</div>
          )}

          <div className="p-4 border-t border-border flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Page {usersQuery.data?.page ?? page} of {usersQuery.data ? Math.max(1, Math.ceil(usersQuery.data.total / pageSize)) : 1}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={(usersQuery.data?.page ?? page) <= 1 || usersQuery.isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  usersQuery.isLoading ||
                  !usersQuery.data ||
                  (usersQuery.data.page ?? page) >= Math.max(1, Math.ceil(usersQuery.data.total / pageSize))
                }
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </motion.div>

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-6">
                <div className="space-y-2">
                  <Label>Roles</Label>
                  <div className="space-y-2">
                    {[...roles.map((r) => r.name), ...([] as string[])]
                      .filter((v, i, arr) => arr.indexOf(v) === i)
                      .sort()
                      .map((roleName) => (
                        <div key={roleName} className="flex items-center gap-2">
                          <Checkbox
                            checked={selectedRoles.includes(roleName)}
                            onCheckedChange={(checked) => {
                              setSelectedRoles((prev) => {
                                const has = prev.includes(roleName);
                                if (checked && !has) return [...prev, roleName];
                                if (!checked && has) return prev.filter((r) => r !== roleName);
                                return prev;
                              });
                            }}
                          />
                          <span className="text-sm">{roleName}</span>
                        </div>
                      ))}
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <Input
                      placeholder="Add role by name"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      className="max-w-xs"
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        const name = newRoleName.trim();
                        if (!name) return;
                        setSelectedRoles((prev) => (prev.includes(name) ? prev : [...prev, name]));
                        setNewRoleName("");
                      }}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              </div>
              <div className="col-span-12 md:col-span-6">
                <div className="space-y-2">
                  <Label>Status</Label>
                  <div className="flex items-center gap-3">
                    <Switch checked={nextActive} onCheckedChange={(v) => setNextActive(Boolean(v))} />
                    <span className="text-sm">{nextActive ? "Active" : "Inactive"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)} disabled={saveMutation.isPending}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="bg-primary">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
};

export default UserManagement;
