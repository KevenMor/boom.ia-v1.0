import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTenantContext } from "@/contexts/TenantContext";
import { useFollowUpQueue, type FollowUpQueueItem } from "@/hooks/useFollowUpQueue";
import { useAppointmentRemindersList, type AppointmentReminderItem } from "@/hooks/useAppointmentRemindersList";
import { useAgents } from "@/hooks/useAgents";
import { useTenants } from "@/hooks/useTenants";
import { Bell, RefreshCw, Clock, User, Bot, MessageSquare, CalendarClock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

function formatScheduledAt(iso: string): string {
  try {
    return format(new Date(iso), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return iso;
  }
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  cancelled: "Cancelado",
  exhausted: "Esgotado",
};

const CANCEL_REASON_LABELS: Record<string, string> = {
  human_assigned: "Agente humano atribuído",
  user_replied: "Cliente enviou mensagem",
  appointment_confirmed: "Agendamento já confirmado",
  agent_inactive: "Agente inativo",
  agent_not_found: "Agente não encontrado",
  test_assignee_mismatch: "Modo teste: conversa com outro atendente",
};
function getCancelReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return CANCEL_REASON_LABELS[code] ?? code;
}

const REMINDER_STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  sent: "Enviado",
  cancelled: "Cancelado",
  failed: "Falha ao enviar",
};

const REMINDER_SKIP_REASON_LABELS: Record<string, string> = {
  agent_inactive: "Agente inativo",
  reminder_disabled: "Lembrete desativado no agente",
  no_delivery_channel: "Sem canal (Chatwoot/WAHA)",
  send_failed: "Falha ao enviar mensagem",
  duplicate: "Duplicado (evento já processado)",
};
function getReminderSkipReasonLabel(code: string | null | undefined): string {
  if (!code) return "";
  return REMINDER_SKIP_REASON_LABELS[code] ?? code;
}

export default function FollowUpsPage() {
  const { selectedTenantId: globalTenantId } = useTenantContext();
  const { data: tenants } = useTenants();
  const [localTenantId, setLocalTenantId] = useState<string>("");
  const selectedTenantId = globalTenantId || localTenantId;

  const { data: list, isLoading, error, refetch, isFetching } = useFollowUpQueue(
    selectedTenantId || undefined
  );
  const { data: remindersList, isLoading: remindersLoading, error: remindersError, refetch: refetchReminders, isFetching: remindersFetching } = useAppointmentRemindersList(
    selectedTenantId || undefined
  );
  const { data: agents } = useAgents(selectedTenantId ?? undefined);

  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [reminderStatusFilter, setReminderStatusFilter] = useState<string>("all");
  const [reminderAgentFilter, setReminderAgentFilter] = useState<string>("all");

  const filteredList = useMemo(() => {
    if (!list) return [];
    let out = list;
    if (statusFilter !== "all") {
      out = out.filter((r) => r.status === statusFilter);
    }
    if (agentFilter !== "all") {
      out = out.filter((r) => r.agent_id === agentFilter);
    }
    return out;
  }, [list, statusFilter, agentFilter]);

  const filteredReminders = useMemo(() => {
    if (!remindersList) return [];
    let out = remindersList;
    if (reminderStatusFilter !== "all") {
      out = out.filter((r) => r.status === reminderStatusFilter);
    }
    if (reminderAgentFilter !== "all") {
      out = out.filter((r) => r.agent_id === reminderAgentFilter);
    }
    return out;
  }, [remindersList, reminderStatusFilter, reminderAgentFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-4">
          {!globalTenantId && (
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs">Tenant</Label>
              <Select
                value={localTenantId}
                onValueChange={setLocalTenantId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants?.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {globalTenantId && (
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs">Tenant</Label>
              <p className="text-sm font-medium py-2">
                {tenants?.find((t) => t.id === globalTenantId)?.name ?? "—"}
              </p>
            </div>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetch(); refetchReminders(); }}
          disabled={!selectedTenantId || isFetching || remindersFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${(isFetching || remindersFetching) ? "animate-spin" : ""}`} />
          Atualizar
        </Button>
      </div>

      {!selectedTenantId ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          Selecione um tenant para ver follow-ups e lembretes de agendamento.
        </p>
      ) : (
        <Tabs defaultValue="followups" className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="followups" className="gap-2">
              <Bell className="h-4 w-4" />
              Follow-ups
            </TabsTrigger>
            <TabsTrigger value="reminders" className="gap-2">
              <CalendarClock className="h-4 w-4" />
              Lembretes de Agendamento
            </TabsTrigger>
          </TabsList>

          <TabsContent value="followups" className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1 min-w-[160px]">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {agents && agents.length > 1 && (
                <div className="space-y-1 min-w-[180px]">
                  <Label className="text-xs">Agente</Label>
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bell className="h-4 w-4 text-primary" />
                  Fila de Follow-ups
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  Atualização automática a cada 30s
                </span>
              </CardHeader>
              <CardContent>
                {error && (
                  <p className="text-sm text-destructive py-4">
                    {error instanceof Error ? error.message : "Erro ao carregar follow-ups."}
                  </p>
                )}
                {isLoading && (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Carregando...
                  </p>
                )}
                {!isLoading && !error && (
                  filteredList.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      Nenhum follow-up na fila com os filtros selecionados.
                    </p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Agendado para</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Agente</TableHead>
                            <TableHead>Tentativa</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Motivo (cancelado)</TableHead>
                            <TableHead>Canal</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredList.map((row) => (
                            <FollowUpRow key={row.id} item={row} />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reminders" className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="space-y-1 min-w-[160px]">
                <Label className="text-xs">Status</Label>
                <Select value={reminderStatusFilter} onValueChange={setReminderStatusFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {Object.entries(REMINDER_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {agents && agents.length > 1 && (
                <div className="space-y-1 min-w-[180px]">
                  <Label className="text-xs">Agente</Label>
                  <Select value={reminderAgentFilter} onValueChange={setReminderAgentFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {agents.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-primary" />
                  Lembretes de Agendamento
                </CardTitle>
                <span className="text-xs text-muted-foreground">
                  Atualização automática a cada 30s
                </span>
              </CardHeader>
              <CardContent>
                {remindersError && (
                  <p className="text-sm text-destructive py-4">
                    {remindersError instanceof Error ? remindersError.message : "Erro ao carregar lembretes."}
                  </p>
                )}
                {remindersLoading && (
                  <p className="text-sm text-muted-foreground py-8 text-center">
                    Carregando...
                  </p>
                )}
                {!remindersLoading && !remindersError && (
                  filteredReminders.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">
                      Nenhum lembrete com os filtros selecionados.
                    </p>
                  ) : (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Lembrar em</TableHead>
                            <TableHead>Evento</TableHead>
                            <TableHead>Data/hora evento</TableHead>
                            <TableHead>Cliente</TableHead>
                            <TableHead>Agente</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Motivo (não enviado)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredReminders.map((row) => (
                            <ReminderRow key={row.id} item={row} />
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function FollowUpRow({ item }: { item: FollowUpQueueItem }) {
  const statusVariant =
    item.status === "pending"
      ? "default"
      : item.status === "sent"
        ? "secondary"
        : "outline";
  return (
    <TableRow>
      <TableCell className="font-mono text-xs whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {formatScheduledAt(item.scheduled_at)}
        </span>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-sm">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {item.external_user_id || "—"}
        </span>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-sm">
          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {item.agent_name ?? "—"}
        </span>
      </TableCell>
      <TableCell className="text-sm">
        {item.attempt}/{item.max_attempts}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant} className="text-[10px]">
          {STATUS_LABELS[item.status] ?? item.status}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[200px]" title={item.status === "cancelled" && item.cancel_reason ? getCancelReasonLabel(item.cancel_reason) : undefined}>
        {item.status === "cancelled" ? (
          item.cancel_reason ? getCancelReasonLabel(item.cancel_reason) : "Motivo não registrado"
        ) : (
          ""
        )}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {item.channel === "chatwoot" && <MessageSquare className="h-3 w-3" />}
          {item.channel}
        </span>
      </TableCell>
    </TableRow>
  );
}

function ReminderRow({ item }: { item: AppointmentReminderItem }) {
  const statusVariant =
    item.status === "pending"
      ? "default"
      : item.status === "sent"
        ? "secondary"
        : "outline";
  return (
    <TableRow>
      <TableCell className="font-mono text-xs whitespace-nowrap">
        <span className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
          {formatScheduledAt(item.remind_at)}
        </span>
      </TableCell>
      <TableCell className="text-sm max-w-[180px] truncate" title={item.event_title}>
        {item.event_title || "—"}
      </TableCell>
      <TableCell className="font-mono text-xs whitespace-nowrap">
        {formatScheduledAt(item.event_start_at)}
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-sm">
          <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {item.external_user_id || "—"}
        </span>
      </TableCell>
      <TableCell>
        <span className="flex items-center gap-1.5 text-sm">
          <Bot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {item.agent_name ?? "—"}
        </span>
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant} className="text-[10px]">
          {REMINDER_STATUS_LABELS[item.status] ?? item.status}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-[220px]">
        {(item.status === "cancelled" || item.status === "failed") && item.skip_reason ? (
          getReminderSkipReasonLabel(item.skip_reason)
        ) : (item.status === "cancelled" || item.status === "failed") ? (
          "—"
        ) : (
          ""
        )}
      </TableCell>
    </TableRow>
  );
}
