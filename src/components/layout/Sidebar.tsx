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
import { clearAccessToken, isSuperadmin } from "@/lib/auth";
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

  const mainNav: NavItem[] = mainNavBase.map((item) => {
    if (item.href !== "/tasks") return item;
    return {
      ...item,
      badge: pmTasksBadgeCount && pmTasksBadgeCount > 0 ? pmTasksBadgeCount : undefined,
    };
  });

  const adminNav: NavItem[] = isSuperadmin()
    ? [...settingsNav, { title: "Categories", icon: Tags, href: "/settings/categories" }]
    : settingsNav;

  const NavItemComponent = ({ item }: { item: NavItem }) => {
    const isActive = location.pathname === item.href;

    return (
      <NavLink to={item.href}>
        <motion.div
          whileHover={{ x: 4 }}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 group relative",
            isActive
              ? "bg-primary/20 text-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          )}
        >
          {isActive && (
            <motion.div
              layoutId="activeIndicator"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-r-full"
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            />
          )}
          <item.icon className={cn("w-5 h-5 shrink-0", isActive && "text-primary")} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="font-medium text-sm whitespace-nowrap overflow-hidden"
              >
                {item.title}
              </motion.span>
            )}
          </AnimatePresence>
          {item.badge && !collapsed && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="ml-auto bg-destructive text-destructive-foreground text-xs font-semibold px-2 py-0.5 rounded-full"
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
      className="h-screen bg-sidebar border-r border-sidebar-border flex flex-col fixed left-0 top-0 z-40"
    >
      {/* Logo */}
      <div className="h-16 px-4 flex items-center justify-between border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shrink-0">
            <Wrench className="w-5 h-5 text-primary-foreground" />
          </div>
          <AnimatePresence>
            {!collapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <h1 className="font-bold text-foreground">PM System</h1>
                <p className="text-xs text-muted-foreground">Snipe-IT Integration</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        <div className="space-y-1">
          {mainNav.map((item) => (
            <NavItemComponent key={item.href} item={item} />
          ))}
        </div>

        <div className="pt-4 mt-4 border-t border-sidebar-border">
          <AnimatePresence>
            {!collapsed && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider"
              >
                Administration
              </motion.p>
            )}
          </AnimatePresence>
          {adminNav.map((item) => (
            <NavItemComponent key={item.href} item={item} />
          ))}
        </div>
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </button>
        
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
      </div>
    </motion.aside>
  );
};

export default Sidebar;
