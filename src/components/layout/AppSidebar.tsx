import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LogOut,
  X,
  Sun,
  Moon,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ModuleKey } from "@/lib/tenant-modules";
import { useSidebar } from "@/contexts/SidebarContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantContext } from "@/contexts/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";
import { useTheme } from "next-themes";
import { TenantSwitcher } from "./TenantSwitcher";
import { BoomIaLogo } from "@/components/brand/BoomIaLogo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ms } from "@/components/ui/material-symbol";

interface NavItem {
  to: string;
  label: string;
  ms: string;
  moduleKey?: ModuleKey;
}

interface NavGroup {
  label: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Ícone da seção colapsável (Material Symbol). Sem colapsável é ignorado. */
  groupMs?: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    label: "Visão Geral",
    items: [
      { to: "/dashboard", ms: "dashboard", label: "Painel", moduleKey: "dashboard" },
      { to: "/conversations", ms: "chat", label: "Chat ao Vivo", moduleKey: "conversations" },
      { to: "/agents", ms: "smart_toy", label: "Agentes", moduleKey: "agents" },
      { to: "/calendar", ms: "calendar_today", label: "Agenda", moduleKey: "calendar" },
      { to: "/followups", ms: "sync", label: "Follow-ups", moduleKey: "followups" },
      { to: "/inventory", ms: "inventory_2", label: "Inventário", moduleKey: "inventory" },
      { to: "/occurrences", ms: "report_problem", label: "Ocorrências", moduleKey: "occurrences" },
      { to: "/galeria", ms: "gallery_thumbnail", label: "Galeria", moduleKey: "suite_galleries" },
      { to: "/catalog", ms: "menu_book", label: "Catálogo", moduleKey: "service_catalog" },
      { to: "/contacts", ms: "person_search", label: "Leads", moduleKey: "contacts" },
      { to: "/clients", ms: "groups", label: "Clientes", moduleKey: "clients" },
      { to: "/financeiro", ms: "payments", label: "Financeiro", moduleKey: "financeiro" },
    ],
  },
  {
    label: "Gestão de reservas",
    collapsible: true,
    defaultOpen: false,
    groupMs: "holiday_village",
    items: [
      { to: "/hospedagem/calendario-parque", ms: "calendar_month", label: "Calendário do parque", moduleKey: "hospedagem" },
      { to: "/hospedagem/cadastro", ms: "bedroom_parent", label: "Estoque de quartos", moduleKey: "hospedagem" },
      { to: "/hospedagem/valores", ms: "request_quote", label: "Valores", moduleKey: "hospedagem" },
    ],
  },
  {
    label: "Infraestrutura",
    items: [
      { to: "/tenants", ms: "domain", label: "Tenants", moduleKey: "tenants" },
      { to: "/users", ms: "badge", label: "Usuários", moduleKey: "tenants" },
      { to: "/permissions", ms: "vpn_key", label: "Permissões", moduleKey: "tenants" },
      { to: "/tools", ms: "construction", label: "Ferramentas", moduleKey: "tools" },
      { to: "/providers", ms: "cloud_done", label: "Provedores", moduleKey: "providers" },
    ],
  },
  {
    label: "Sistema",
    collapsible: true,
    defaultOpen: false,
    groupMs: "settings",
    items: [
      { to: "/analytics/tokens", ms: "bar_chart", label: "Analytics Tokens", moduleKey: "analytics_tokens" },
      { to: "/prompts", ms: "description", label: "Prompts", moduleKey: "prompts" },
      { to: "/monitoring", ms: "monitoring", label: "Monitoramento", moduleKey: "monitoring" },
      { to: "/audit", ms: "fact_check", label: "Auditoria", moduleKey: "audit" },
      { to: "/settings", ms: "settings", label: "Configurações", moduleKey: "settings" },
    ],
  },
];

function PremiumSection({
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

  if (group.collapsible) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full cursor-pointer items-center justify-between rounded-xl px-4 py-2.5 transition-all hover:bg-slate-50 group dark:hover:bg-slate-800/60"
        >
          <div className="flex items-center gap-3">
            <Ms
              name={group.groupMs ?? "settings"}
              className="!text-[20px] text-on-surface-variant transition-colors group-hover:text-on-surface dark:text-slate-400 dark:group-hover:text-slate-100"
            />
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-on-surface-variant transition-colors group-hover:text-on-surface dark:text-slate-400 dark:group-hover:text-slate-100">
              {group.label}
            </span>
          </div>
          <Ms
            name={open ? "expand_less" : "expand_more"}
            className="!text-[18px] text-on-surface-variant dark:text-slate-400"
          />
        </button>
        {open && (
          <div className="mt-1 space-y-1 pl-2">
            {group.items.map((item) => {
              const isActive = currentPath.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onLinkClick}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-4 py-2.5 text-label-md transition-all dark:text-slate-300",
                    isActive
                      ? "bg-[#7c3aed]/10 text-[#7c3aed] dark:bg-[#7c3aed]/20 dark:text-[#c4b5fd]"
                      : "text-on-surface-variant hover:bg-slate-50 hover:text-on-surface dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
                  )}
                >
                  <Ms name={item.ms} className="!text-[20px]" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h3 className="mb-3 px-4 text-[11px] font-bold uppercase tracking-[0.1em] text-on-surface-variant dark:text-slate-400">
        {group.label}
      </h3>
      <div className="space-y-1">
        {group.items.map((item) => {
          const isActive = currentPath.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onLinkClick}
              className={cn(
                "relative flex cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-label-md transition-all dark:text-slate-300",
                isActive
                  ? "bg-[#7c3aed]/10 text-[#7c3aed] dark:bg-[#7c3aed]/20 dark:text-[#c4b5fd]"
                  : "text-on-surface-variant hover:bg-slate-50 hover:text-on-surface dark:hover:bg-slate-800/60 dark:hover:text-slate-100",
              )}
            >
              <Ms name={item.ms} className="!text-[20px]" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

function SidebarContent({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  const { signOut, user, profile, isSuperAdmin } = useAuth();
  const footerDisplayName =
    profile?.full_name?.trim() || user?.email?.split("@")[0] || "Utilizador";
  const footerAvatar = profile?.avatar_url?.trim() || null;
  const location = useLocation();
  const isMobile = useIsMobile();
  const { setMobileOpen, toggle } = useSidebar();
  const { theme, setTheme } = useTheme();
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

  const showNewAgent = isSuperAdmin || isModuleEnabled("agents");

  return (
    <div
      className={cn(
        "app-sidebar-premium flex h-full min-h-0 flex-col",
        collapsed ? "px-2 pb-4 pt-3" : "p-6",
      )}
    >
      <BoomIaLogo
        collapsed={collapsed}
        onNavigate={onLinkClick}
        className={collapsed ? "mb-3 shrink-0" : "mb-5 shrink-0"}
      />

      {/* Workspace */}
      {!collapsed && (
        <div className="mb-6">
          <TenantSwitcher collapsed={false} />
        </div>
      )}
      {collapsed && (
        <div className="mb-4 flex justify-center">
          <TenantSwitcher collapsed />
        </div>
      )}

      {showNewAgent && !collapsed && (
        <NavLink
          to="/agents"
          onClick={onLinkClick}
          className="shadow-glow mb-6 flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-[#7c3aed] px-4 py-3 text-label-md text-white shadow-sm transition-all hover:bg-[#6d28d9] hover:shadow-md dark:bg-[#7c3aed] dark:hover:bg-[#6d28d9]"
        >
          <Ms name="add" className="!text-[20px]" />
          Novo Agente
        </NavLink>
      )}
      {showNewAgent && collapsed && (
        <NavLink
          to="/agents"
          title="Novo Agente"
          onClick={onLinkClick}
          className="shadow-glow mb-4 mx-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#7c3aed] text-white shadow-sm transition-all hover:bg-[#6d28d9] dark:bg-[#7c3aed]"
        >
          <Ms name="add" className="!text-[20px]" />
        </NavLink>
      )}

      <nav className="-mr-2 custom-scrollbar min-h-0 flex-1 space-y-8 overflow-y-auto pr-2 overscroll-contain">
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 px-1">
            {filteredNavGroups.flatMap((g) => g.items).map((item) => {
              const isActive = location.pathname.startsWith(item.to);
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={onLinkClick}
                  title={item.label}
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all",
                    isActive
                      ? "bg-[#7c3aed]/10 text-[#7c3aed] dark:bg-[#7c3aed]/25 dark:text-[#c4b5fd]"
                      : "text-[#64748b] hover:bg-slate-100 hover:text-[#0f172a] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
                  )}
                >
                  <Ms name={item.ms} className="!text-[20px]" />
                </NavLink>
              );
            })}
          </div>
        ) : (
          filteredNavGroups.map((group) => (
            <PremiumSection
              key={group.label}
              group={group}
              currentPath={location.pathname}
              onLinkClick={onLinkClick}
            />
          ))
        )}
      </nav>

      {!collapsed && !isMobile && (
        <button
          type="button"
          onClick={toggle}
          title="Recolher menu"
          className="mt-4 flex shrink-0 items-center justify-center gap-2 rounded-xl py-2 text-[11px] font-semibold text-[#94a3b8] transition-colors hover:bg-slate-50 hover:text-[#64748b] dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <PanelLeftClose className="h-4 w-4" />
          Recolher
        </button>
      )}

      {collapsed && !isMobile && (
        <div className="border-t border-slate-200/70 pt-2 dark:border-slate-700">
          <button
            type="button"
            onClick={toggle}
            title="Expandir menu"
            className="flex w-full items-center justify-center rounded-xl p-2 text-[#64748b] transition-colors hover:bg-slate-100 hover:text-[#0f172a] dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {!collapsed && (
        <div
          className={cn(
            "mt-4 flex shrink-0 border-t border-slate-200/50 pt-4 dark:border-slate-700/80",
            isMobile && "pb-[max(4px,env(safe-area-inset-bottom))]",
          )}
        >
          <div className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-start transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-100 ring-2 ring-[#7c3aed]/10 dark:bg-slate-700 dark:ring-[#7c3aed]/20">
                    {footerAvatar ? (
                      <img src={footerAvatar} alt={footerDisplayName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-[#7c3aed] dark:text-[#c4b5fd]">
                        {(profile?.full_name?.trim()?.slice(0, 2) || user?.email?.slice(0, 2) || "?").toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-bold leading-tight text-on-surface dark:text-slate-100">
                      {footerDisplayName}
                    </span>
                    <span className="truncate text-[10px] font-medium leading-tight text-on-surface-variant dark:text-slate-400">
                      {user?.email ?? "—"}
                    </span>
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
                <DropdownMenuItem onClick={() => navigate("/profile")} className="gap-2">
                  Meu perfil
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              type="button"
              onClick={() => void signOut()}
              className="shrink-0 rounded-lg p-1.5 text-[#64748b] transition-all hover:bg-red-500/[0.08] hover:text-red-600 active:scale-90 dark:text-slate-400 dark:hover:text-red-400"
              title="Sair"
            >
              <Ms name="logout" className="!text-[20px]" />
            </button>
          </div>
        </div>
      )}

      {collapsed && (
        <div className="mt-auto border-t border-slate-200/70 pt-2 dark:border-slate-700">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-center rounded-xl p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <div className="relative h-8 w-8 overflow-hidden rounded-full bg-gradient-to-br from-[#7c3aed] to-[#0d9488] p-[2px]">
                  <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-[11px] font-bold text-[#7c3aed] dark:bg-slate-900 dark:text-[#c4b5fd]">
                    {footerAvatar ? (
                      <img src={footerAvatar} alt={footerDisplayName} className="h-full w-full rounded-full object-cover" />
                    ) : (
                      (user?.email?.slice(0, 2) || "?").toUpperCase()
                    )}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user?.email ?? "—"}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setTheme("light")} className="gap-2">
                <Sun className="h-4 w-4" />
                Claro
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("dark")} className="gap-2">
                <Moon className="h-4 w-4" />
                Escuro
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setTheme("system")} className="gap-2">
                <Monitor className="h-4 w-4" />
                Sistema
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}>Meu perfil</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()} className="gap-2 text-destructive focus:text-destructive">
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

/** Largura alinhada ao mock Stitch (~w-72). */
export const SIDEBAR_WIDTH = 288;
export const SIDEBAR_COLLAPSED_WIDTH = 72;

export function AppSidebar() {
  const { isMobileOpen, setMobileOpen, collapsed } = useSidebar();
  const isMobile = useIsMobile();

  const shellAside =
    "app-sidebar-premium fixed left-0 top-0 bottom-0 z-40 border-r border-slate-200/50 bg-white/80 backdrop-blur-xl transition-[width] duration-300 dark:border-slate-800/50 dark:bg-slate-900/85";

  if (isMobile) {
    return isMobileOpen ? (
      <>
        {/* z-40 — abaixo do painel; antes estava z-50 e cobria o aside (z-40), bloqueando cliques */}
        <div onClick={() => setMobileOpen(false)} className="fixed inset-0 z-40 bg-black/50" aria-hidden />
        <aside
          className={cn(shellAside, "z-50 flex max-h-[100dvh] min-h-0 flex-col animate-slide-in-left")}
          style={{ width: SIDEBAR_WIDTH }}
        >
          <div className="flex shrink-0 min-h-[52px] items-center justify-end border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-[#64748b] hover:bg-slate-100 hover:text-[#0f172a] dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              aria-label="Fechar menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {/* flex-1 + min-h-0: conteúdo não soma 100% + header; nav com scroll, footer visível */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <SidebarContent />
          </div>
        </aside>
      </>
    ) : null;
  }

  return (
    <aside className={shellAside} style={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}>
      <SidebarContent collapsed={collapsed} />
    </aside>
  );
}
