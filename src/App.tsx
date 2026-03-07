import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Tenants from "@/pages/Tenants";
import EditTenant from "@/pages/EditTenant";
import Agents from "@/pages/Agents";
import EditAgent from "@/pages/EditAgent";
import AgentSandbox from "@/pages/AgentSandbox";
import Tools from "@/pages/Tools";
import EditTool from "@/pages/EditTool";
import Providers from "@/pages/Providers";
import EditProvider from "@/pages/EditProvider";
import Monitoring from "@/pages/Monitoring";
import Conversations from "@/pages/Conversations";
import Audit from "@/pages/Audit";
import SettingsPage from "@/pages/SettingsPage";
import PromptsPage from "@/pages/PromptsPage";
import ProfilePage from "@/pages/ProfilePage";
import CalendarPage from "@/pages/CalendarPage";
import PublicSandbox from "@/pages/PublicSandbox";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="dark" storageKey="boomia-theme">
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <TenantProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/demo/:agentId" element={<PublicSandbox />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/tenants" element={<Tenants />} />
              <Route path="/tenants/:tenantId/edit" element={<EditTenant />} />
              <Route path="/agents" element={<Agents />} />
              <Route path="/agents/:agentId/edit" element={<EditAgent />} />
              <Route path="/agents/:agentId/sandbox" element={<AgentSandbox />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/tools/:toolId/edit" element={<EditTool />} />
              <Route path="/providers" element={<Providers />} />
              <Route path="/providers/:providerId/edit" element={<EditProvider />} />
              <Route path="/monitoring" element={<Monitoring />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/prompts" element={<PromptsPage />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
