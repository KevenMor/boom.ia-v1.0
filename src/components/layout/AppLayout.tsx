import { Suspense } from "react";
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

  const mainChrome =
    isSandbox
      ? "flex min-h-0 flex-1 flex-col overflow-hidden"
      : isConversations
        ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-background"
        : "min-h-0 w-full min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6 md:p-8";

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-background">
      <AppSidebar />
      <div
        className="flex min-w-0 flex-1 flex-col transition-all duration-200 ease-out"
        style={{ paddingLeft: isMobile ? 0 : (collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) }}
      >
        <AppHeader />
        <main className={mainChrome}>
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
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
