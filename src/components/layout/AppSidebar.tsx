import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Columns3,
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
  Map,
  LandPlot,
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleKey } from "@/lib/tenant-modules";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantContext } from "@/contexts/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState, useRef, useCallback } from "react";
import { TenantSwitcher } from "./TenantSwitcher";
import { BoomIaLogo } from "@/components/brand/BoomIaLogo";
import { Skeleton } from "@/components/ui/skeleton";
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

/** Prefixo mais longo vence — evita /kanban ativo em rotas irmãs com prefixo comum. */
function isNavItemActive(pathname: string, itemTo: string, allTos: string[]): boolean {
  const matches = allTos.filter((to) => pathname === to || pathname.startsWith(`${to}/`));
  if (matches.length === 0) return false;
  const best = matches.reduce((a, b) => (a.length >= b.length ? a : b));
  return best === itemTo;
}

export const navGroups: NavGroup[] = [
  {
    groupLabel: "Operação",
    items: [
      { to: "/dashboard", icon: LayoutDashboard, label: "Painel", moduleKey: "dashboard" },
      { to: "/conversations", icon: MessageSquare, label: "Chat ao Vivo", moduleKey: "conversations" },
      { to: "/kanban", icon: Columns3, label: "Kanban", moduleKey: "conversations" },
      { to: "/agents", icon: Bot, label: "Agentes", moduleKey: "agents" },
      { to: "/calendar", icon: Calendar, label: "Agenda", moduleKey: "calendar" },
      { to: "/followups", icon: RefreshCw, label: "Follow-ups", moduleKey: "followups" },
    ],
  },
  {
    groupLabel: "Comercial",
    items: [
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
    collapsible: true,
    defaultOpen: false,
    groupLabel: "Loteamentos",
    groupIcon: Map,
    items: [
      { to: "/loteamentos/empreendimentos", icon: LandPlot, label: "Empreendimentos", moduleKey: "loteamentos" },
    ],
  },
  {
    groupLabel: "Admin",
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

export const SIDEBAR_WIDTH = 240;
export const SIDEBAR_COLLAPSED_WIDTH = 64;

const navItemClass = (active: boolean, collapsed: boolean) =>
  cn(
    "flex items-center rounded-lg text-[13px] transition-colors duration-150",
    collapsed ? "h-9 w-9 justify-center" : "gap-2.5 px-2.5 py-2",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
  );

function SectionLabel({ label, collapsed }: { label: string; collapsed?: boolean }) {
  if (collapsed || !label) return null;
  return (
    <div className="mb-1 px-2.5">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-sidebar-foreground/55">
        {label}
      </span>
    </div>
  );
}

function CollapsibleSection({
  group,
  currentPath,
  allTos,
  onLinkClick,
  collapsed,
}: {
  group: NavGroup;
  currentPath: string;
  allTos: string[];
  onLinkClick?: () => void;
  collapsed?: boolean;
}) {
  const hasActive = group.items.some((i) => isNavItemActive(currentPath, i.to, allTos));
  const [open, setOpen] = useState(group.defaultOpen ?? hasActive);
  const GroupIcon = group.groupIcon;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        {group.items.map((item) => {
          const isActive = isNavItemActive(currentPath, item.to, allTos);
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onLinkClick}
              title={item.label}
              className={navItemClass(isActive, true)}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
            </NavLink>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="mb-1 flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.08em] text-sidebar-foreground/55 transition-colors duration-150 hover:text-sidebar-accent-foreground"
      >
        <div className="flex items-center gap-2">
          {GroupIcon && <GroupIcon className="h-3.5 w-3.5" strokeWidth={1.5} />}
          <span>{group.groupLabel}</span>
        </div>
        {open ? (
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={1.5} />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.5} />
        )}
      </button>
      {open && (
        <div className="space-y-0.5">
          {group.items.map((item) => {
            const isActive = isNavItemActive(currentPath, item.to, allTos);
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onLinkClick}
                className={navItemClass(isActive, false)}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SidebarNavSkeleton({ collapsed }: { collapsed: boolean }) {
  const rows = collapsed ? 6 : 8;
  return (
    <div className={cn("space-y-1.5", collapsed && "flex flex-col items-center")}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "rounded-lg bg-sidebar-accent/60",
            collapsed ? "h-9 w-9" : "h-9 w-full",
          )}
        />
      ))}
    </div>
  );
}

function SidebarContent({ collapsed = false, onDropdownOpenChange }: { collapsed?: boolean; onDropdownOpenChange?: (open: boolean) => void }) {
  const navigate = useNavigate();
  const { signOut, user, profile, isSuperAdmin } = useAuth();
  const location = useLocation();
  const isMobile = useIsMobile();
  const { setMobileOpen, toggle } = useSidebar();
  const { isModuleEnabled, tenantModulesLoading, bootstrapPending } = useTenantContext();
  const navLoading = !isSuperAdmin && tenantModulesLoading && !bootstrapPending;

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

  const allNavTos = filteredNavGroups.flatMap((g) => g.items.map((i) => i.to));
  const footerName = profile?.full_name?.trim() || null;
  const footerInitials = (
    footerName?.slice(0, 2) || user?.email?.slice(0, 2) || "?"
  ).toUpperCase();
  const footerEmail = user?.email ?? "—";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "px-2 py-3" : "px-3 py-4",
      )}
    >
      <BoomIaLogo collapsed={collapsed} onNavigate={onLinkClick} className="mb-4 shrink-0" />

      {!collapsed && (
        <div className="mb-4 shrink-0">
          <TenantSwitcher collapsed={false} onDropdownOpenChange={onDropdownOpenChange} />
        </div>
      )}
      {collapsed && (
        <div className="mb-4 flex justify-center shrink-0">
          <TenantSwitcher collapsed onDropdownOpenChange={onDropdownOpenChange} />
        </div>
      )}

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto scrollbar-none">
        {navLoading ? (
          <SidebarNavSkeleton collapsed={collapsed} />
        ) : collapsed ? (
          <div className="flex flex-col items-center gap-0.5">
            {filteredNavGroups.flatMap((g) => g.items).map((item) => {
              const isActive = isNavItemActive(location.pathname, item.to, allNavTos);
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onLinkClick}
                  title={item.label}
                  className={navItemClass(isActive, true)}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.5} />
                </NavLink>
              );
            })}
          </div>
        ) : (
          filteredNavGroups.map((group, idx) => (
            <div key={group.groupLabel ?? idx} className={cn(idx > 0 && "pt-3")}>
              {group.collapsible ? (
                <CollapsibleSection
                  group={group}
                  currentPath={location.pathname}
                  allTos={allNavTos}
                  onLinkClick={onLinkClick}
                  collapsed={false}
                />
              ) : (
                <>
                  <SectionLabel label={group.groupLabel ?? ""} />
                  <div className="space-y-0.5">
                    {group.items.map((item) => {
                      const isActive = isNavItemActive(location.pathname, item.to, allNavTos);
                      const Icon = item.icon;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={onLinkClick}
                          className={navItemClass(isActive, false)}
                        >
                          <Icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                          <span className="truncate">{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </nav>

      {!isMobile && (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "mt-2 flex shrink-0 items-center rounded-lg text-sidebar-foreground transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "h-9 w-9 justify-center" : "gap-2 px-2.5 py-2 text-[13px]",
          )}
          title={collapsed ? "Expandir" : "Recolher"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4" strokeWidth={1.5} />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4" strokeWidth={1.5} />
              <span>Recolher</span>
            </>
          )}
        </button>
      )}

      {!collapsed && (
        <div className="mt-2 shrink-0 border-t border-sidebar-border pt-3">
          <DropdownMenu onOpenChange={onDropdownOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors duration-150 hover:bg-sidebar-accent"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground">
                  {footerInitials}
                </div>
                <div className="min-w-0 flex-1">
                  {footerName && (
                    <p className="truncate text-[13px] font-medium text-sidebar-accent-foreground">
                      {footerName}
                    </p>
                  )}
                  <p className="truncate text-[11px] text-sidebar-foreground/70">{footerEmail}</p>
                </div>
                <ChevronUp className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" strokeWidth={1.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-52">
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

      {collapsed && (
        <div className="mt-2 flex shrink-0 justify-center border-t border-sidebar-border pt-3">
          <DropdownMenu onOpenChange={onDropdownOpenChange}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                title={footerEmail}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-[11px] font-semibold text-sidebar-accent-foreground transition-colors duration-150 hover:opacity-90"
              >
                {footerInitials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-52">
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
  const { collapsed, isMobileOpen, setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();
  const [hoveredOpen, setHoveredOpen] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownOpen = useRef(false);

  const handleMouseEnter = useCallback(() => {
    if (leaveTimer.current) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
    if (collapsed) setHoveredOpen(true);
  }, [collapsed]);

  const handleMouseLeave = useCallback(() => {
    if (dropdownOpen.current) return;
    leaveTimer.current = setTimeout(() => setHoveredOpen(false), 200);
  }, []);

  const handleDropdownOpenChange = useCallback((open: boolean) => {
    dropdownOpen.current = open;
    if (!open) {
      leaveTimer.current = setTimeout(() => setHoveredOpen(false), 200);
    }
  }, []);

  const effectiveCollapsed = collapsed && !hoveredOpen;

  if (isMobile) {
    return (
      <>
        {isMobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
        )}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[240px] transition-transform duration-200 ease-out",
            isMobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarContent />
        </aside>
      </>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 left-0 z-40 transition-all duration-200 ease-out"
      style={{ width: effectiveCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <SidebarContent collapsed={effectiveCollapsed} onDropdownOpenChange={handleDropdownOpenChange} />
    </aside>
  );
}
