import { createContext, useContext, useState, type ReactNode } from "react";

interface SidebarContextType {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
  isMobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isMobileOpen, setMobileOpen] = useState(false);

  return (
    <SidebarContext.Provider
      value={{ collapsed, setCollapsed, toggle: () => setCollapsed((c) => !c), isMobileOpen, setMobileOpen }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
