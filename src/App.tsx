import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Assets from "./pages/Assets";
import AssetDetail from "./pages/AssetDetail";
import Templates from "./pages/Templates";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Scheduling from "./pages/Scheduling";
import Notifications from "./pages/Notifications";
import UserManagement from "./pages/UserManagement";
import SystemSettings from "./pages/SystemSettings";
import SettingsCategories from "./pages/SettingsCategories";
import SettingsNotifications from "./pages/SettingsNotifications";
import LabelDesigner from "./pages/LabelDesigner";
import DashboardLayout from "./components/layout/DashboardLayout";
import NotFound from "./pages/NotFound";
import { getAccessToken, isSuperadmin } from "@/lib/auth";
import { ThemeProvider } from "next-themes";

const queryClient = new QueryClient();

const ProtectedLayout = () => {
  const token = getAccessToken();
  if (!token) return <Navigate to="/login" replace />;
  return <DashboardLayout />;
};

const SuperadminRoute = ({ element }: { element: ReactElement }) => {
  if (!isSuperadmin()) return <Navigate to="/settings" replace />;
  return element;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          
          {/* Dashboard Layout Routes */}
          <Route element={<ProtectedLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assets" element={<Assets />} />
            <Route path="/assets/:assetId" element={<AssetDetail />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/scheduling" element={<Scheduling />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/users" element={<UserManagement />} />
            <Route path="/settings" element={<SystemSettings />} />
            <Route path="/settings/notifications" element={<SettingsNotifications />} />
            <Route path="/settings/categories" element={<SuperadminRoute element={<SettingsCategories />} />} />
            <Route path="/label-designer" element={<LabelDesigner />} />
          </Route>
          
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      </ThemeProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
