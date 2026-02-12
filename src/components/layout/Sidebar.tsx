import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Server,
  FileText,
  Calendar,
  ClipboardList,
  BarChart3,
  Bell,
  Users,
  Settings,
  Tags,
  ChevronLeft,
  ChevronRight,
  Wrench,
  LogOut,
  QrCode,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { clearAccessToken, hasRole, isSuperadmin } from "@/lib/auth";
import { apiGetDashboardOverview } from "@/lib/api";

interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
}

const mainNavBase: Omit<NavItem, "badge">[] = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { title: "Assets", icon: Server, href: "/assets" },
  { title: "Facilities", icon: Building2, href: "/facilities" },
  { title: "PM Templates", icon: FileText, href: "/templates" },
  { title: "Scheduling", icon: Calendar, href: "/scheduling" },
  { title: "PM Tasks", icon: ClipboardList, href: "/tasks" },
  { title: "Work Orders", icon: Wrench, href: "/work-orders" },
  { title: "Approvals", icon: CheckCircle2, href: "/approvals" },
  { title: "Reports", icon: BarChart3, href: "/reports" },
  { title: "Notifications", icon: Bell, href: "/notifications" },
  { title: "Label Designer", icon: QrCode, href: "/label-designer" },
];

const settingsNav: NavItem[] = [
  { title: "Users & Roles", icon: Users, href: "/users" },
  { title: "System", icon: Settings, href: "/settings" },
  { title: "Notification Settings", icon: Bell, href: "/settings/notifications" },
];

const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const overviewQuery = useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: apiGetDashboardOverview,
    staleTime: 30_000,
  });

  const pmTasksBadgeCount = overviewQuery.data
    ? overviewQuery.data.stats.overdueCount +
      overviewQuery.data.stats.dueTodayCount +
      overviewQuery.data.stats.upcoming7DaysCount
    : null;

  const isSupervisor = hasRole("Supervisor");

  const mainNavItems = isSupervisor
    ? mainNavBase.filter((item) => item.href !== "/notifications")
    : mainNavBase;

  const mainNav: NavItem[] = mainNavItems.map((item) => {
    if (item.href !== "/tasks") return item;
    return {
      ...item,
      badge: pmTasksBadgeCount && pmTasksBadgeCount > 0 ? pmTasksBadgeCount : undefined,
    };
  });

  const adminNavBase: NavItem[] = isSuperadmin()
    ? [...settingsNav, { title: "Categories", icon: Tags, href: "/settings/categories" }]
    : settingsNav;
  const adminNav: NavItem[] = isSupervisor ? [] : adminNavBase;

  const NavItemComponent = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.href;

    return (
      <NavLink to={item.href}>
        <motion.div
          whileHover={{ x: 3 }}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-200 group relative",
            isActive
              ? "bg-primary/10 text-primary shadow-[0_6px_16px_rgba(27,132,255,0.18)]"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          )}
        >
          {isActive && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 top-2 bottom-2 w-[3px] bg-primary rounded-r-full"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <div
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-accent text-sidebar-foreground/70 transition-colors",
              isActive ? "bg-primary/15 text-primary" : "group-hover:bg-sidebar-accent/80 group-hover:text-sidebar-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="font-semibold text-[13px] whitespace-nowrap overflow-hidden"
              >
                {item.title}
              </motion.span>
            )}
          </AnimatePresence>
          {item.badge && !collapsed && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="ml-auto bg-rose-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-sm"
            >
              {item.badge}
            </motion.span>
          )}
        </motion.div>
      </NavLink>
    );
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 80 : 260 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="h-screen bg-sidebar border-r border-sidebar-border shadow-[0_0_20px_rgba(0,0,0,0.04)] flex flex-col fixed left-0 top-0 z-40"
    >
      {/* Logo */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-sidebar-border bg-sidebar/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15 flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h1 className="font-bold text-sidebar-foreground">PM System</h1>
                <p className="text-xs text-sidebar-foreground/60">Snipe-IT Integration</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          aria-label="Toggle sidebar"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3.5 px-4 space-y-1.5">
        <div className="space-y-1.5">
          {mainNav.map((item) => (
            <NavItemComponent key={item.href} item={item} />
          ))}
        </div>

        {adminNav.length > 0 && (
          <div className="pt-3 mt-3 border-t border-sidebar-border">
            <AnimatePresence>
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="px-3 mb-2 text-[11px] font-semibold text-sidebar-foreground/60 uppercase tracking-widest"
                >
                  Administration
                </motion.p>
              )}
            </AnimatePresence>
            {adminNav.map((item) => (
              <NavItemComponent key={item.href} item={item} />
            ))}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => {
            clearAccessToken();
            navigate("/login");
          }}
          className="w-full mt-2 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm"
              >
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
        <AnimatePresence>
          {!collapsed && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 text-[11px] text-sidebar-foreground/60 text-center"
            >
              Copyright © 2026, Develop by Merdeka Tsingshan Indonesia v1.0.0
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.aside>
  );
};

export default Sidebar;
