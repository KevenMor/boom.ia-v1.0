import { useLocation } from "react-router-dom";
import { Bell, Search, User, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";

const routeTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tenants": "Tenants",
  "/agents": "Agentes",
  "/tools": "Tools",
  "/providers": "Providers",
  "/monitoring": "Monitoramento",
  "/audit": "Auditoria",
  "/settings": "Configurações",
};

function getTitle(pathname: string): string {
  for (const [route, title] of Object.entries(routeTitles)) {
    if (pathname.startsWith(route)) return title;
  }
  return "Nexus AI";
}

export function AppHeader() {
  const location = useLocation();
  const { user, signOut } = useAuth();
  const title = getTitle(location.pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 backdrop-blur-sm px-6">
      <h1 className="text-base font-semibold tracking-tight">{title}</h1>

      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
          <Search className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-destructive" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full border border-border text-muted-foreground">
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="text-xs text-muted-foreground">
              {user?.email ?? "—"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
