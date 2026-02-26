import { Outlet } from "react-router-dom";
import { motion } from "framer-motion";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { SidebarProvider, useSidebar } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";

function LayoutInner() {
  const { collapsed } = useSidebar();
  const isMobile = useIsMobile();
  const paddingLeft = isMobile ? 0 : collapsed ? 64 : 240;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <motion.div
        className="flex flex-1 flex-col"
        animate={{ paddingLeft }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        <AppHeader />
        <main className="flex-1 p-4 md:p-6">
          <motion.div
            key={undefined}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </motion.div>
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
