import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  MessageSquare,
  Bot,
  Calendar,
  RefreshCw,
  Package,
  AlertTriangle,
  Image,
  BookOpen,
  UserSearch,
  Users,
  CreditCard,
  Building2,
  CalendarDays,
  BedDouble,
  Receipt,
  Globe,
  UserCircle,
  Key,
  Wrench,
  Cloud,
  BarChart3,
  FileText,
  Activity,
  ClipboardCheck,
  Settings,
  ChevronUp,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleKey } from "@/lib/tenant-modules";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantContext } from "@/contexts/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { TenantSwitcher } from "./TenantSwitcher";
import { BoomIaLogo } from "@/components/brand/BoomIaLogo";
import type { LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  moduleKey?: ModuleKey;
}

interface NavGroup {
  items: NavItem[];
  collapsible?: boolean;
  defaultOpen?: boolean;
  groupLabel?: string;
  groupIcon?: LucideIcon;
}

export const navGroups: NavGroup[] = [
  {
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Painel", moduleKey: "dashboard" },
      { to: "/conversations", icon: MessageSquare, label: "Chat ao Vivo", moduleKey: "conversations" },
      { to: "/agents", icon: Bot, label: "Agentes", moduleKey: "agents" },
      { to: "/calendar", icon: Calendar, label: "Agenda", moduleKey: "calendar" },
      { to: "/followups", icon: RefreshCw, label: "Follow-ups", moduleKey: "followups" },
      { to: "/inventory", icon: Package, label: "Inventário", moduleKey: "inventory" },
      { to: "/occurrences", icon: AlertTriangle, label: "Ocorrências", moduleKey: "occurrences" },
      { to: "/galeria", icon: Image, label: "Galeria", moduleKey: "suite_galleries" },
      { to: "/catalog", icon: BookOpen, label: "Catálogo", moduleKey: "service_catalog" },
      { to: "/contacts", icon: UserSearch, label: "Leads", moduleKey: "contacts" },
      { to: "/clients", icon: Users, label: "Clientes", moduleKey: "clients" },
      { to: "/financeiro", icon: CreditCard, label: "Financeiro", moduleKey: "financeiro" },
    ],
  },
  {
    collapsible: true,
    defaultOpen: false,
    groupLabel: "Reservas",
    groupIcon: Building2,
    items: [
      { to: "/hospedagem/calendario-parque", icon: CalendarDays, label: "Calendário do parque", moduleKey: "hospedagem" },
      { to: "/hospedagem/cadastro", icon: BedDouble, label: "Estoque de quartos", moduleKey: "hospedagem" },
      { to: "/hospedagem/valores", icon: Receipt, label: "Valores", moduleKey: "hospedagem" },
    ],
  },
  {
    items: [
      { to: "/tenants", icon: Globe, label: "Tenants", moduleKey: "tenants" },
      { to: "/users", icon: UserCircle, label: "Usuários", moduleKey: "tenants" },
      { to: "/permissions", icon: Key, label: "Permissões", moduleKey: "tenants" },
      { to: "/tools", icon: Wrench, label: "Ferramentas", moduleKey: "tools" },
      { to: "/providers", icon: Cloud, label: "Provedores", moduleKey: "providers" },
    ],
  },
  {
    collapsible: true,
    defaultOpen: false,
    groupLabel: "Sistema",
    groupIcon: Settings,
    items: [
      { to: "/analytics/tokens", icon: BarChart3, label: "Analytics Tokens", moduleKey: "analytics_tokens" },
      { to: "/prompts", icon: FileText, label: "Prompts", moduleKey: "prompts" },
      { to: "/monitoring", icon: Activity, label: "Monitoramento", moduleKey: "monitoring" },
      { to: "/audit", icon: ClipboardCheck, label: "Auditoria", moduleKey: "audit" },
      { to: "/settings", icon: Settings, label: "Configurações", moduleKey: "settings" },
    ],
  },
];

export const SIDEBAR_WIDTH = 220;
export const SIDEBAR_COLLAPSED_WIDTH = 56;

function CollapsibleSection({
  group,
  currentPath,
  onLinkClick,
}: {
  group: NavGroup;
  currentPath: string;
  onLinkClick?: () => void;
}) {
  const hasActive = group.items.some((i) => currentPath.startsWith(i.to));
  const [open, setOpen] = useState(group.defaultOpen ?? hasActive);
  const GroupIcon = group.groupIcon;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          {GroupIcon && <GroupIcon className="h-4 w-4" strokeWidth={1.5} />}
          <span>{group.groupLabel}</span>
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
        )}
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5">
          {group.items.map((item) => {
            const isActive = currentPath.startsWith(item.to);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onLinkClick}
                className={cn(
                  "relative flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150",
                  isActive
                    ? "font-medium text-primary before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:bg-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  const { signOut, user, profile, isSuperAdmin } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { setMobileOpen, toggle } = useSidebar();
  const { isModuleEnabled } = useTenantContext();

  const onLinkClick = isMobile ? () => setMobileOpen(false) : undefined;
  const filteredNavGroups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (isSuperAdmin) return true;
        return item.moduleKey ? isModuleEnabled(item.moduleKey) : true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const footerInitials = (
    profile?.full_name?.trim()?.slice(0, 2) || user?.email?.slice(0, 2) || "?"
  ).toUpperCase();
  const footerEmail = user?.email ?? "—";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col border-r border-border bg-card/50 backdrop-blur-sm",
        collapsed ? "px-1.5 py-3" : "px-3 py-4",
      )}
    >
      {/* Logo */}
      <BoomIaLogo collapsed={collapsed} onNavigate={onLinkClick} className="mb-4 shrink-0" />

      {/* Workspace switcher */}
      {!collapsed && (
        <div className="mb-3 px-1">
          <TenantSwitcher collapsed={false} />
        </div>
      )}
      {collapsed && (
        <div className="mb-3 flex justify-center">
          <TenantSwitcher collapsed />
        </div>
      )}

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto scrollbar-none">
        {collapsed ? (
          <div className="flex flex-col items-center gap-0.5">
            {filteredNavGroups.flatMap((g) => g.items).map((item) => {
              const isActive = location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onLinkClick}
                  title={item.label}
                  className={cn(
                    "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150",
                    isActive
                      ? "text-primary before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-0.5 before:rounded-full before:bg-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </NavLink>
              );
            })}
          </div>
        ) : (
          filteredNavGroups.map((group, idx) => (
            <div key={idx}>
              {idx > 0 && <div className="my-2 mx-3 border-t border-border" />}
              {group.collapsible ? (
                <CollapsibleSection
                  group={group}
                  currentPath={location.pathname}
                  onLinkClick={onLinkClick}
                />
              ) : (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = location.pathname.startsWith(item.to);
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={onLinkClick}
                        className={cn(
                          "relative flex items-center gap-2.5 px-3 py-2 text-sm transition-colors duration-150",
                          isActive
                            ? "font-medium text-primary before:absolute before:left-0 before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:bg-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.5} />
                        <span>{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </nav>

      {/* Collapse toggle */}
      {!isMobile && (
        <button
          type="button"
          onClick={toggle}
          className="mt-2 flex shrink-0 items-center justify-center rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
          )}
        </button>
      )}

      {/* User footer */}
      {!collapsed && (
        <div className="mt-2 shrink-0 border-t border-border pt-3 px-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors duration-150 hover:bg-muted"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-foreground">
                  {footerInitials}
                </div>
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {footerEmail}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-48">
              <DropdownMenuItem onClick={() => navigate("/profile")}>
                Meu Perfil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-3.5 w-3.5" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-background/80"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[220px] transition-transform duration-200 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarContent />
        </aside>
      </>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-30 transition-all duration-200 ease-out"
      style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
    >
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
