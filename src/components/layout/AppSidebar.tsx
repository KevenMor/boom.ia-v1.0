import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Bot,
  Wrench,
  Cpu,
  Activity,
  MessageSquare,
  Settings,
  LogOut,
  FileText,
  X,
  ChevronDown,
  User,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { useTheme } from "next-themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/tenants", icon: Building2, label: "Tenants" },
  { to: "/agents", icon: Bot, label: "Agentes" },
  { to: "/conversations", icon: MessageSquare, label: "Conversas" },
  { to: "/tools", icon: Wrench, label: "Tools" },
  { to: "/providers", icon: Cpu, label: "Providers" },
];

const secondaryItems = [
  { to: "/monitoring", icon: Activity, label: "Monitoramento" },
  { to: "/audit", icon: FileText, label: "Auditoria" },
  { to: "/settings", icon: Settings, label: "Configurações" },
];

function SidebarContent() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { setMobileOpen } = useSidebar();
  const [accountOpen, setAccountOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  const linkClass = (isActive: boolean) =>
    cn(
      "flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-sidebar-accent text-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    );

  return (
    <div className="flex h-full flex-col justify-between">
      <div className="px-4 py-6">
        {/* Logo */}
        <div className="flex items-center justify-between">
          <div className="flex h-10 items-center gap-2.5 rounded-lg bg-sidebar-accent px-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              N
            </div>
            <span className="text-sm font-semibold text-foreground">Nexus AI</span>
          </div>
          {isMobile && (
            <button onClick={() => setMobileOpen(false)} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Main nav */}
        <ul className="mt-6 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => isMobile && setMobileOpen(false)}
                  className={linkClass(isActive)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </NavLink>
              </li>
            );
          })}

          {/* Secondary group - collapsible */}
          <li>
            <button
              onClick={() => setAccountOpen(!accountOpen)}
              className="flex w-full cursor-pointer items-center justify-between rounded-lg px-4 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <span>Administração</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  accountOpen && "-rotate-180"
                )}
              />
            </button>
            {accountOpen && (
              <ul className="mt-1 space-y-1 px-3">
                {secondaryItems.map((item) => {
                  const isActive = location.pathname.startsWith(item.to);
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={() => isMobile && setMobileOpen(false)}
                        className={linkClass(isActive)}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
                <li>
                  <button
                    onClick={() => signOut()}
                    className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <LogOut className="h-4 w-4 shrink-0" />
                    Sair
                  </button>
                </li>
              </ul>
            )}
          </li>
        </ul>
      </div>

      {/* User footer */}
      <div className="border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 p-4 transition-colors hover:bg-sidebar-accent">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
                <User className="h-4 w-4 text-sidebar-foreground" />
              </div>
              <div className="min-w-0 text-left">
                <p className="truncate text-sm font-medium text-foreground">Admin</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email ?? "—"}</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel>Tema</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
              <Sun className="h-4 w-4" />
              Claro
              {theme === "light" && <span className="ml-auto text-xs text-primary">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
              <Moon className="h-4 w-4" />
              Escuro
              {theme === "dark" && <span className="ml-auto text-xs text-primary">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
              <Monitor className="h-4 w-4" />
              Sistema
              {theme === "system" && <span className="ml-auto text-xs text-primary">✓</span>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

export function AppSidebar() {
  const { isMobileOpen, setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();

  if (isMobile) {
    return isMobileOpen ? (
      <>
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-50 bg-black/50"
        />
        <aside className="fixed left-0 top-0 bottom-0 z-50 w-[280px] bg-sidebar border-r border-sidebar-border animate-slide-in-left">
          <SidebarContent />
        </aside>
      </>
    ) : null;
  }

  return (
    <aside className="fixed left-0 top-0 bottom-0 z-40 w-[260px] border-r border-sidebar-border bg-sidebar">
      <SidebarContent />
    </aside>
  );
}
