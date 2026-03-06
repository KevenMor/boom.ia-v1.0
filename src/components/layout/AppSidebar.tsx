import { NavLink, useLocation } from "react-router-dom";
import boomLogo from "@/assets/boom-ia-logo.png";
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
  ChevronRight,
  User,
  Sun,
  Moon,
  Monitor,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { useTheme } from "next-themes";
import { TenantSwitcher } from "./TenantSwitcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavGroup {
  label: string;
  defaultOpen?: boolean;
  items: { to: string; icon: React.ElementType; label: string }[];
}

const navGroups: NavGroup[] = [
  {
    label: "Visão geral",
    defaultOpen: true,
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Painel" },
      { to: "/conversations", icon: MessageSquare, label: "Chat ao Vivo" },
      { to: "/agents", icon: Bot, label: "Agentes" },
      { to: "/calendar", icon: CalendarDays, label: "Agenda" },
    ],
  },
  {
    label: "Infraestrutura",
    defaultOpen: true,
    items: [
      { to: "/tenants", icon: Building2, label: "Tenants" },
      { to: "/tools", icon: Wrench, label: "Ferramentas" },
      { to: "/providers", icon: Cpu, label: "Provedores" },
    ],
  },
  {
    label: "Sistema",
    defaultOpen: false,
    items: [
      { to: "/prompts", icon: FileText, label: "Prompts" },
      { to: "/monitoring", icon: Activity, label: "Monitoramento" },
      { to: "/audit", icon: FileText, label: "Auditoria" },
      { to: "/settings", icon: Settings, label: "Configurações" },
    ],
  },
];

function CollapsibleGroup({
  group,
  currentPath,
  onLinkClick,
}: {
  group: NavGroup;
  currentPath: string;
  onLinkClick?: () => void;
}) {
  const hasActive = group.items.some((i) => currentPath.startsWith(i.to));
  const [open, setOpen] = useState(group.defaultOpen || hasActive);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-white/25 transition-colors hover:text-white/45"
      >
        <span className="flex-1 text-start">{group.label}</span>
        <ChevronRight
          className={cn(
            "size-3 transition-transform duration-200",
            open && "rotate-90"
          )}
        />
      </button>

      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-1 space-y-0.5">
            {group.items.map((item) => {
              const isActive = currentPath.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onLinkClick}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0 transition-colors",
                      isActive
                        ? "text-white"
                        : "text-white/40 group-hover:text-white/70"
                    )}
                  />
                  <span className="flex-1">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { setMobileOpen, toggle } = useSidebar();
  const { theme, setTheme } = useTheme();

  const onLinkClick = isMobile ? () => setMobileOpen(false) : undefined;

  return (
    <div className="flex h-full flex-col">
      {/* Logo header */}
      <div className="flex h-14 items-center gap-3 border-b border-white/10 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl overflow-hidden">
          <img src={boomLogo} alt="Boom IA" className="h-9 w-9 object-cover" />
        </div>
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-bold tracking-tight text-white">
              Boom IA
            </span>
            <span className="text-[10px] font-medium uppercase tracking-widest text-white/35">
              Painel
            </span>
          </div>
        )}
        {isMobile && (
          <button
            onClick={() => setMobileOpen(false)}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {!isMobile && !collapsed && (
          <button
            onClick={toggle}
            className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tenant Switcher */}
      <div className="border-b border-white/10 px-2 py-2">
        <TenantSwitcher collapsed={collapsed} />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-3 overflow-y-auto px-2 py-4">
        {collapsed ? (
          <div className="space-y-1">
            {navGroups.flatMap((g) => g.items).map((item) => {
              const isActive = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onLinkClick}
                  title={item.label}
                  className={cn(
                    "flex items-center justify-center rounded-xl p-2 transition-all duration-200",
                    isActive
                      ? "bg-white/15 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <item.icon className={cn("h-[18px] w-[18px]", isActive ? "text-white" : "text-white/40")} />
                </NavLink>
              );
            })}
          </div>
        ) : (
          navGroups.map((group) => (
            <CollapsibleGroup
              key={group.label}
              group={group}
              currentPath={location.pathname}
              onLinkClick={onLinkClick}
            />
          ))
        )}
      </nav>

      {/* Expand button when collapsed */}
      {collapsed && !isMobile && (
        <div className="border-t border-white/10 p-2">
          <button
            onClick={toggle}
            title="Expandir menu"
            className="flex w-full items-center justify-center rounded-xl p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* User footer */}
      {!collapsed && (
      <div className="border-t border-white/10 px-3 py-2.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/10">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[11px] font-bold text-white">
                  {user?.email?.slice(0, 2).toUpperCase() ?? "AD"}
                </div>
                <div className="flex flex-1 flex-col min-w-0">
                  <span className="text-sm font-medium text-white truncate">
                    Admin
                  </span>
                  <span className="text-[11px] text-white/45 truncate">
                    {user?.email ?? "—"}
                  </span>
                </div>
                <LogOut className="h-4 w-4 text-white/35 shrink-0" />
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
      )}

      {/* Collapsed user avatar */}
      {collapsed && (
        <div className="border-t border-white/10 p-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-center rounded-xl p-2 transition-colors hover:bg-white/10">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-[11px] font-bold text-white">
                  {user?.email?.slice(0, 2).toUpperCase() ?? "AD"}
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel>{user?.email ?? "—"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()} className="gap-2 text-destructive focus:text-destructive">
                <LogOut className="h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

export const SIDEBAR_WIDTH = 260;
export const SIDEBAR_COLLAPSED_WIDTH = 60;

export function AppSidebar() {
  const { isMobileOpen, setMobileOpen, collapsed } = useSidebar();
  const isMobile = useIsMobile();

  if (isMobile) {
    return isMobileOpen ? (
      <>
        <div
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-50 bg-black/50"
        />
        <aside className="fixed left-0 top-0 bottom-0 z-50 w-[260px] bg-sidebar border-r border-sidebar-border animate-slide-in-left">
          <SidebarContent />
        </aside>
      </>
    ) : null;
  }

  return (
    <aside
      className="fixed left-0 top-0 bottom-0 z-40 border-r border-sidebar-border bg-sidebar transition-all duration-300"
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
