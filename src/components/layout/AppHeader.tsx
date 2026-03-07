import { useLocation, useNavigate } from "react-router-dom";
import { User, LogOut, Menu } from "lucide-react";
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

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tenants": "Tenants",
  "/agents": "Agentes",
  "/conversations": "Conversas",
  "/calendar": "Agenda",
  "/tools": "Tools",
  "/providers": "Providers",
  "/monitoring": "Monitoramento",
  "/audit": "Auditoria",
  "/settings": "Configurações",
  "/profile": "Meu Perfil",
};

function getTitle(pathname: string): string {
  for (const [route, title] of Object.entries(routeTitles)) {
    if (pathname.startsWith(route)) return title;
  }
  return "Boom IA";
}

export function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { setMobileOpen } = useSidebar();
  const isMobile = useIsMobile();
  const title = getTitle(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/70 backdrop-blur-xl px-4 md:px-6">
      <div className="flex items-center gap-3">
        {isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <h1 className="text-sm font-bold tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground" title="Notificações">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary ring-2 ring-background" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-1 h-8 w-8 rounded-full bg-primary/10 text-primary hover:bg-primary/20">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-xs text-muted-foreground">
              {user?.email ?? "—"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>
              <User className="mr-2 h-3 w-3" />
              Meu Perfil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOut className="mr-2 h-3 w-3" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
