import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useFirstEnabledRoute } from "@/hooks/useFirstEnabledRoute";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ModuleRoute } from "@/components/ModuleRoute";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantContext } from "@/contexts/TenantContext";
import { AppLoadingScreen } from "@/components/layout/AppLoadingScreen";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Tenants from "@/pages/Tenants";
import EditTenant from "@/pages/EditTenant";
import UsersManagementPage from "@/pages/UsersManagementPage";
import TenantPermissionsPage from "@/pages/TenantPermissionsPage";
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
import FollowUpsPage from "@/pages/FollowUpsPage";
import InventoryPage from "@/pages/InventoryPage";
import OccurrencesPage from "@/pages/OccurrencesPage";
import ServiceCatalogPage from "@/pages/ServiceCatalogPage";
import CatalogProfessionalsPage from "@/pages/CatalogProfessionalsPage";
import EditCatalogItemPage from "@/pages/EditCatalogItemPage";
import ContactsPage from "@/pages/ContactsPage";
import ClientsPage from "@/pages/ClientsPage";
import ContactProfilePage from "@/pages/ContactProfilePage";
import FinanceiroPage from "@/pages/FinanceiroPage";
import TokenAnalytics from "@/pages/TokenAnalytics";
import PublicSandbox from "@/pages/PublicSandbox";
import ChatwootEmbedMirror from "@/pages/ChatwootEmbedMirror";
import ChatwootEmbedClient from "@/pages/ChatwootEmbedClient";
import ChatwootEmbedHospedagem from "@/pages/ChatwootEmbedHospedagem";
import ChatwootEmbedInventory from "@/pages/ChatwootEmbedInventory";
import EmbedChatwootViewRedirect from "@/pages/EmbedChatwootViewRedirect";
import EmbedChatwootHospedagemViewRedirect from "@/pages/EmbedChatwootHospedagemViewRedirect";
import EmbedChatwootInventoryViewRedirect from "@/pages/EmbedChatwootInventoryViewRedirect";
import NotFound from "@/pages/NotFound";
import SuiteGalleriesPage from "@/pages/SuiteGalleriesPage";
import ParkCalendarManagementPage from "@/pages/hospedagem/ParkCalendarManagementPage";
import LodgingRegistryPage from "@/pages/hospedagem/LodgingRegistryPage";
import LodgingPricingPage from "@/pages/hospedagem/LodgingPricingPage";

import { hydrateQueryCache, persistQueryCache } from "@/lib/query-cache-persist";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnMount: false,   // Não refaz ao remontar se dados estão em cache
      staleTime: 1000 * 60 * 10,  // Dados válidos por 10 minutos
      gcTime: 1000 * 60 * 30,     // Mantém no cache por 30 minutos
      retry: 1,
    },
  },
});

hydrateQueryCache(queryClient);

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => persistQueryCache(queryClient));
}

function RootRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { bootstrapPending } = useTenantContext();
  const firstRoute = useFirstEnabledRoute();

  if (authLoading || (user && bootstrapPending)) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Navigate to={firstRoute} replace />;
}

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
            <Route path="/embed/chatwoot/view" element={<EmbedChatwootViewRedirect />} />
            <Route path="/embed/chatwoot/hospedagem/view" element={<EmbedChatwootHospedagemViewRedirect />} />
            <Route path="/embed/chatwoot/inventory/view" element={<EmbedChatwootInventoryViewRedirect />} />
            <Route path="/embed/chatwoot/client" element={<ChatwootEmbedClient />} />
            <Route path="/embed/chatwoot/hospedagem/*" element={<ChatwootEmbedHospedagem />} />
            <Route path="/embed/chatwoot/inventory" element={<ChatwootEmbedInventory />} />
            <Route path="/embed/chatwoot" element={<ChatwootEmbedMirror />} />
            <Route path="/" element={<RootRedirect />} />
            <Route
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard/v2" element={<Navigate to="/dashboard" replace />} />
              <Route
                path="/dashboard"
                element={
                  <ModuleRoute moduleKey="dashboard">
                    <Dashboard />
                  </ModuleRoute>
                }
              />
              <Route
                path="/tenants"
                element={
                  <ModuleRoute moduleKey="tenants" requiredRoles={["superadmin"]}>
                    <Tenants />
                  </ModuleRoute>
                }
              />
              <Route
                path="/tenants/:tenantId/edit"
                element={
                  <ModuleRoute moduleKey="tenants" requiredRoles={["superadmin"]}>
                    <EditTenant />
                  </ModuleRoute>
                }
              />
              <Route
                path="/users"
                element={
                  <ModuleRoute moduleKey="tenants" requiredRoles={["superadmin"]}>
                    <UsersManagementPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/permissions"
                element={
                  <ModuleRoute moduleKey="tenants" requiredRoles={["superadmin"]}>
                    <TenantPermissionsPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/agents"
                element={
                  <ModuleRoute moduleKey="agents">
                    <Agents />
                  </ModuleRoute>
                }
              />
              <Route
                path="/agents/:agentId/edit"
                element={
                  <ModuleRoute moduleKey="agents">
                    <EditAgent />
                  </ModuleRoute>
                }
              />
              <Route
                path="/agents/:agentId/sandbox"
                element={
                  <ModuleRoute moduleKey="agents">
                    <AgentSandbox />
                  </ModuleRoute>
                }
              />
              <Route
                path="/conversations"
                element={
                  <ModuleRoute moduleKey="conversations">
                    <Conversations />
                  </ModuleRoute>
                }
              />
              <Route
                path="/calendar"
                element={
                  <ModuleRoute moduleKey="calendar">
                    <CalendarPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/followups"
                element={
                  <ModuleRoute moduleKey="followups">
                    <FollowUpsPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/inventory"
                element={
                  <ModuleRoute moduleKey="inventory">
                    <InventoryPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/occurrences"
                element={
                  <ModuleRoute moduleKey="occurrences">
                    <OccurrencesPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/galeria"
                element={
                  <ModuleRoute moduleKey="suite_galleries">
                    <SuiteGalleriesPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/catalog"
                element={
                  <ModuleRoute moduleKey="service_catalog">
                    <ServiceCatalogPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/catalog/professionals"
                element={
                  <ModuleRoute moduleKey="service_catalog">
                    <CatalogProfessionalsPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/catalog/items/:itemId"
                element={
                  <ModuleRoute moduleKey="service_catalog">
                    <EditCatalogItemPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/contacts"
                element={
                  <ModuleRoute moduleKey="contacts">
                    <ContactsPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/clients"
                element={
                  <ModuleRoute moduleKey="clients">
                    <ClientsPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/contacts/:contactId"
                element={
                  <ModuleRoute moduleKey="contacts">
                    <ContactProfilePage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/clients/:contactId"
                element={
                  <ModuleRoute moduleKey="clients">
                    <ContactProfilePage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/hospedagem"
                element={
                  <ModuleRoute moduleKey="hospedagem">
                    <Navigate to="/hospedagem/calendario-parque" replace />
                  </ModuleRoute>
                }
              />
              <Route
                path="/hospedagem/calendario-parque"
                element={
                  <ModuleRoute moduleKey="hospedagem">
                    <ParkCalendarManagementPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/hospedagem/cadastro"
                element={
                  <ModuleRoute moduleKey="hospedagem">
                    <LodgingRegistryPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/hospedagem/valores"
                element={
                  <ModuleRoute moduleKey="hospedagem">
                    <LodgingPricingPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/financeiro"
                element={
                  <ModuleRoute moduleKey="financeiro">
                    <FinanceiroPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/tools"
                element={
                  <ModuleRoute moduleKey="tools">
                    <Tools />
                  </ModuleRoute>
                }
              />
              <Route
                path="/tools/:toolId/edit"
                element={
                  <ModuleRoute moduleKey="tools">
                    <EditTool />
                  </ModuleRoute>
                }
              />
              <Route
                path="/providers"
                element={
                  <ModuleRoute moduleKey="providers">
                    <Providers />
                  </ModuleRoute>
                }
              />
              <Route
                path="/providers/:providerId/edit"
                element={
                  <ModuleRoute moduleKey="providers">
                    <EditProvider />
                  </ModuleRoute>
                }
              />
              <Route
                path="/analytics/tokens"
                element={
                  <ModuleRoute moduleKey="analytics_tokens">
                    <TokenAnalytics />
                  </ModuleRoute>
                }
              />
              <Route
                path="/monitoring"
                element={
                  <ModuleRoute moduleKey="monitoring">
                    <Monitoring />
                  </ModuleRoute>
                }
              />
              <Route
                path="/audit"
                element={
                  <ModuleRoute moduleKey="audit">
                    <Audit />
                  </ModuleRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ModuleRoute moduleKey="settings">
                    <SettingsPage />
                  </ModuleRoute>
                }
              />
              <Route
                path="/prompts"
                element={
                  <ModuleRoute moduleKey="prompts">
                    <PromptsPage />
                  </ModuleRoute>
                }
              />
              <Route path="/profile" element={<ProfilePage />} />
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
