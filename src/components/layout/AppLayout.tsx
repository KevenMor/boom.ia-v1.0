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
        ? "flex min-h-0 flex-1 flex-col overflow-hidden bg-[#f4f7f9] pb-[env(safe-area-inset-bottom,0px)] pt-0 [-webkit-tap-highlight-color:transparent] dark:bg-background"
        : "flex-1 overflow-auto p-4 md:p-6";

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-background">
      <AppSidebar />
      <div
        className="flex flex-1 flex-col transition-all duration-300"
        style={{ paddingLeft: isMobile ? 0 : (collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH) }}
      >
        <Suspense
          fallback={
            <div
              className="flex h-14 shrink-0 border-b border-border/50 bg-muted/40 dark:bg-background/80"
              aria-hidden
            />
          }
        >
          <AppHeader />
        </Suspense>
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
