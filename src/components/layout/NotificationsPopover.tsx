import { useState, useEffect } from "react";
import { Bell, Check, CheckCheck, Calendar, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, getReadIds, markAsRead, markAllAsRead, type AppNotification } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { Ms } from "@/components/ui/material-symbol";

interface NotificationsPopoverProps {
  /** Botão inspirado no painel Stitch (ícone Material + chrome claro). */
  premiumDash?: boolean;
}

export function NotificationsPopover({ premiumDash = false }: NotificationsPopoverProps) {
  const { data: notifications = [], isLoading } = useNotifications();
  const [readIds, setReadIds] = useState<Set<string>>(getReadIds);
  const [open, setOpen] = useState(false);

  // Refresh read state when popover opens
  useEffect(() => {
    if (open) setReadIds(getReadIds());
  }, [open]);

  const unreadCount = notifications.filter((n) => !readIds.has(n.id)).length;

  const handleMarkRead = (id: string) => {
    markAsRead(id);
    setReadIds(new Set(readIds).add(id));
  };

  const handleMarkAllRead = () => {
    markAllAsRead(notifications);
    setReadIds(new Set(notifications.map((n) => n.id)));
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={premiumDash ? "outline" : "ghost"}
          size="icon"
          className={
            premiumDash
              ? "relative h-10 w-10 rounded-xl border border-slate-200/60 bg-white text-[#64748b] shadow-sm transition-all duration-300 hover:border-slate-200/80 hover:text-[#7c3aed] hover:shadow-md active:scale-95 dark:border-border dark:bg-card dark:text-muted-foreground"
              : "relative h-8 w-8 text-muted-foreground hover:text-foreground"
          }
          title="Notificações"
        >
          {premiumDash ? (
            <Ms name="notifications" className={cn("!text-[22px]", unreadCount > 0 && "relative")} />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">Notificações</h3>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleMarkAllRead}
            >
              <CheckCheck className="mr-1 h-3 w-3" />
              Marcar todas como lidas
            </Button>
          )}
        </div>

        {/* List */}
        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              Carregando…
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-sm text-muted-foreground">
              <Bell className="mb-2 h-8 w-8 opacity-30" />
              Nenhuma notificação
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notifications.map((n) => {
                const isRead = readIds.has(n.id);
                return (
                  <li
                    key={n.id}
                    className={cn(
                      "flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/50",
                      !isRead && "bg-primary/5"
                    )}
                    onClick={() => handleMarkRead(n.id)}
                  >
                    <div className="mt-0.5 shrink-0">
                      {n.type === "reminder" ? (
                        <Calendar className="h-4 w-4 text-primary" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className={cn("text-xs font-medium truncate", !isRead && "text-foreground", isRead && "text-muted-foreground")}>
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatTime(n.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground truncate">{n.body}</p>
                    </div>
                    {!isRead && (
                      <div className="mt-1.5 shrink-0">
                        <span className="block h-2 w-2 rounded-full bg-primary" />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
