import { Bell, Search, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { clearAccessToken, hasRole, isSuperadmin } from "@/lib/auth";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  apiGetDashboardOverview,
  apiGetMe,
  apiGetMyPreferences,
  apiUpdateMyPreferences,
  type MeResponse,
  type ThemeMode,
  type UserPreferencesResponse,
  apiListTasks,
  type ListTasksResponse,
} from "@/lib/api";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

const palettes: ReadonlyArray<{ key: string; label: string }> = [
  { key: "industrial", label: "Industrial" },
  { key: "emerald", label: "Emerald" },
  { key: "amber", label: "Amber" },
  { key: "purple", label: "Purple" },
];

const applyPaletteClass = (palette: string | null) => {
  const root = document.documentElement;
  for (const p of ["industrial", "emerald", "amber", "purple"]) {
    root.classList.remove(`palette-${p}`);
  }
  if (palette) root.classList.add(`palette-${palette}`);
};

const Header = ({ title, subtitle }: HeaderProps) => {
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const [currentPalette, setCurrentPalette] = useState<string | null>(null);

  const meQuery = useQuery<MeResponse>({
    queryKey: ["me"],
    queryFn: apiGetMe,
    staleTime: 60_000,
  });

  const prefsQuery = useQuery<UserPreferencesResponse>({
    queryKey: ["me", "preferences"],
    queryFn: apiGetMyPreferences,
  });

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: apiGetDashboardOverview,
    staleTime: 30_000,
  });

  const canSupervisor = hasRole("Supervisor") || hasRole("Admin") || isSuperadmin();
  const canSuperadmin = isSuperadmin();

  const supervisorApprovalsQuery = useQuery({
    queryKey: ["approvals", "header", "supervisor"],
    queryFn: async () => apiListTasks({ maintenanceType: "PM", page: 1, pageSize: 50 }),
    staleTime: 30_000,
    enabled: canSupervisor,
  });

  const superadminApprovalsQuery = useQuery({
    queryKey: ["approvals", "header", "superadmin"],
    queryFn: async () => apiListTasks({ maintenanceType: "PM", page: 1, pageSize: 50 }),
    staleTime: 30_000,
    enabled: canSuperadmin,
  });

  useEffect(() => {
    const pm = prefsQuery.data?.themeMode ?? null;
    const pp = prefsQuery.data?.themePalette ?? null;
    if (pm) setTheme(pm);
    setCurrentPalette(pp);
    applyPaletteClass(pp);
  }, [prefsQuery.data, setTheme]);

  const updatePrefs = useMutation({
    mutationFn: (input: { themeMode?: ThemeMode | null; themePalette?: string | null }) =>
      apiUpdateMyPreferences(input),
    onSuccess: (_data, variables) => {
      if (variables.themeMode) setTheme(variables.themeMode);
      if (variables.themePalette !== undefined) {
        const palette = variables.themePalette ?? null;
        setCurrentPalette(palette);
        applyPaletteClass(palette);
      }
    },
  });

  const userDisplayName = useMemo(() => {
    const user = meQuery.data?.user;
    if (!user) return "";
    if (user.displayName && user.displayName.trim().length > 0) return user.displayName;
    return user.username;
  }, [meQuery.data]);

  const userRoleLabel = useMemo(() => {
    const roles = meQuery.data?.user.roles ?? [];
    if (roles.length === 0) return "";
    const primary = roles[0];
    if (!primary) return "";
    if (primary.toLowerCase() === "superadmin") return "Superadmin";
    if (primary.toLowerCase() === "admin") return "Administrator";
    if (primary.toLowerCase() === "supervisor") return "Supervisor";
    return primary;
  }, [meQuery.data]);

  const overdueCount = overviewQuery.data?.stats.overdueCount ?? 0;
  const dueTodayCount = overviewQuery.data?.stats.dueTodayCount ?? 0;
  const upcoming7DaysCount = overviewQuery.data?.stats.upcoming7DaysCount ?? 0;
  const totalPmAttentionCount = overdueCount + dueTodayCount + upcoming7DaysCount;
  const stageLabel = (status: string): "supervisor" | "superadmin" | null => {
    if (status === "PendingSupervisor") return "supervisor";
    if (status === "PendingSuperadmin") return "superadmin";
    return null;
  };
  const supervisorPendingItems = ((supervisorApprovalsQuery.data as ListTasksResponse | undefined)?.items ?? []).filter(
    (t) => stageLabel(t.approvalStatus ?? "None") === "supervisor",
  );
  const superadminPendingItems = ((superadminApprovalsQuery.data as ListTasksResponse | undefined)?.items ?? []).filter(
    (t) => stageLabel(t.approvalStatus ?? "None") === "superadmin",
  );
  return (
    <header className="h-16 bg-card/50 backdrop-blur-sm border-b border-border px-6 flex items-center justify-between sticky top-0 z-30">
      <div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search assets, tasks..."
            className="w-64 pl-10 bg-muted/50 border-border"
          />
        </div>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-5 h-5 text-muted-foreground" />
              {totalPmAttentionCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-1 bg-destructive rounded-full text-[10px] font-bold text-destructive-foreground flex items-center justify-center">
                  {totalPmAttentionCount > 99 ? "99+" : totalPmAttentionCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel>Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {overviewQuery.isLoading ? (
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                <span className="text-sm text-muted-foreground">Loading PM summary…</span>
              </DropdownMenuItem>
            ) : overviewQuery.isError ? (
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                <span className="text-sm text-destructive">Failed to load PM summary.</span>
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                  <span className="font-medium text-foreground">{overdueCount} PM task(s) overdue</span>
                  <span className="text-xs text-muted-foreground">Tasks past due and not completed</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                  <span className="font-medium text-foreground">{dueTodayCount} due today</span>
                  <span className="text-xs text-muted-foreground">Scheduled for today</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="flex flex-col items-start gap-1 py-3">
                  <span className="font-medium text-foreground">{upcoming7DaysCount} upcoming in 7 days</span>
                  <span className="text-xs text-muted-foreground">Due within the next week</span>
                </DropdownMenuItem>
                {canSupervisor ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Pending Supervisor Approvals</DropdownMenuLabel>
                    {supervisorApprovalsQuery.isLoading ? (
                      <DropdownMenuItem className="py-3 text-sm text-muted-foreground">Loading…</DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem className="flex items-center justify-between gap-2 py-2">
                          <span className="text-sm text-foreground">{supervisorPendingItems.length} pending</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate("/approvals")}
                          >
                            Open Inbox
                          </Button>
                        </DropdownMenuItem>
                        {supervisorPendingItems.slice(0, 4).map((t) => (
                          <DropdownMenuItem key={t.id} className="flex items-center justify-between gap-2 py-2">
                            <span className="text-xs text-muted-foreground">#{t.taskNumber}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/tasks?taskId=${t.id}`);
                              }}
                            >
                              View Task
                            </Button>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </>
                ) : null}
                {canSuperadmin ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Pending Superadmin Approvals</DropdownMenuLabel>
                    {superadminApprovalsQuery.isLoading ? (
                      <DropdownMenuItem className="py-3 text-sm text-muted-foreground">Loading…</DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem className="flex items-center justify-between gap-2 py-2">
                          <span className="text-sm text-foreground">{superadminPendingItems.length} pending</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate("/approvals")}
                          >
                            Open Inbox
                          </Button>
                        </DropdownMenuItem>
                        {superadminPendingItems.slice(0, 4).map((t) => (
                          <DropdownMenuItem key={t.id} className="flex items-center justify-between gap-2 py-2">
                            <span className="text-xs text-muted-foreground">#{t.taskNumber}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(`/tasks?taskId=${t.id}`);
                              }}
                            >
                              View Task
                            </Button>
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                  </>
                ) : null}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 rounded-full bg-primary/10 hover:bg-primary/20 text-foreground">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div className="hidden md:block text-left">
                <p className="text-sm font-medium text-foreground">
                  {userDisplayName || ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  {userRoleLabel || ""}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              Theme
            </DropdownMenuItem>
            <div className="px-2 py-1.5">
              <div className="flex items-center gap-2">
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePrefs.mutate({ themeMode: "dark" })}
                >
                  Dark
                </Button>
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePrefs.mutate({ themeMode: "light" })}
                >
                  Light
                </Button>
              </div>
            </div>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
              }}
            >
              Color Palette
            </DropdownMenuItem>
            <div className="px-2 py-1.5 grid grid-cols-2 gap-2">
              {palettes.map((p) => (
                <Button
                  key={p.key}
                  variant={currentPalette === p.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => updatePrefs.mutate({ themePalette: p.key })}
                >
                  {p.label}
                </Button>
              ))}
              <Button
                variant={currentPalette === null ? "default" : "outline"}
                size="sm"
                onClick={() => updatePrefs.mutate({ themePalette: null })}
              >
                Default
              </Button>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => {
                clearAccessToken();
                navigate("/login");
              }}
            >
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};

export default Header;
