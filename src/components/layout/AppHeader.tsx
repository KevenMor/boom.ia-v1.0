import { useLocation, useNavigate } from "react-router-dom";
import { User, LogOut, Menu, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useSidebar } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { NotificationsPopover } from "./NotificationsPopover";
import { ThemeToggle } from "@/components/ui/theme-toggle";

const routeTitles: Record<string, string> = {
  "/dashboard": "Painel",
  "/kanban": "Kanban",
  "/tenants": "Tenants",
  "/agents": "Agentes",
  "/conversations": "Conversas",
  "/calendar": "Agenda",
  "/followups": "Follow-ups",
  "/tools": "Ferramentas",
  "/providers": "Provedores",
  "/analytics/tokens": "Analytics",
  "/monitoring": "Monitoramento",
  "/audit": "Auditoria",
  "/settings": "Configurações",
  "/profile": "Perfil",
  "/inventory": "Inventário",
  "/contacts": "Leads",
  "/clients": "Clientes",
  "/financeiro": "Financeiro",
  "/catalog": "Catálogo",
  "/galeria": "Galeria",
  "/hospedagem": "Hospedagem",
};

function getTitle(pathname: string): string {
  for (const [route, title] of Object.entries(routeTitles)) {
    if (pathname.startsWith(route)) return title;
  }
  return "Boom";
}

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();
  const title = getTitle(location.pathname);

  const initials = (
    profile?.full_name?.trim()?.slice(0, 2) || user?.email?.slice(0, 2) || "?"
  ).toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-border bg-background/80 backdrop-blur-md px-4">
      <div className="flex items-center gap-2">
        {isMobile && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        )}
        <span className="text-sm font-medium text-foreground">{title}</span>
      </div>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationsPopover />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-foreground transition-colors duration-150 hover:bg-muted/80"
            >
              {initials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem className="text-xs text-muted-foreground">
              {user?.email ?? "—"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
    </header>
  );
}
