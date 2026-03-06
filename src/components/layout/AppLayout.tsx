import { Outlet, useLocation } from "react-router-dom";
import { AppSidebar, SIDEBAR_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";

function LayoutInner() {
  const isMobile = useIsMobile();
  const { collapsed } = useSidebar();
  const location = useLocation();
  const isSandbox = location.pathname.includes("/sandbox");
  const isConversations = location.pathname === "/conversations";

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <div
        className="flex flex-1 flex-col transition-all duration-300"
        style={{ paddingLeft: isMobile ? 0 : (collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) }}
      >
        <AppHeader />
        <main className={isSandbox ? "flex-1 overflow-hidden" : "flex-1 p-4 md:p-6"}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AppLayout() {
  return (
    <SidebarProvider>
      <LayoutInner />
    </SidebarProvider>
  );
}
