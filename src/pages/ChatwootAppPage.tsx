import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Phone, Mail, FileText, Clock, MessageCircle, User } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConversationMessagesView } from "@/components/chat/ConversationMessagesView";
import { cn } from "@/lib/utils";

interface DashboardAppContext {
  event?: string;
  data?: {
    conversation: { id: number; inbox_id: number };
    contact: { id: number; name: string; phone_number?: string };
    currentAgent: { id: number; name: string };
  };
}

interface DashboardAppData {
  found: boolean;
  agent?: {
    name: string;
    avatar_url: string | null;
  };
  conversation?: {
    id: string;
    status: string;
    started_at: string;
    contact_name: string | null;
    contact_avatar_url: string | null;
  };
  messages?: Array<{
    role: string;
    content: string;
    created_at: string;
  }>;
  followups?: Array<{
    scheduled_at: string;
    status: string;
    attempt: number;
    max_attempts: number;
  }>;
  contact?: {
    name: string | null;
    phone: string | null;
    email: string | null;
    notes: string | null;
    contact_type: string | null;
    lead_status?: string | null;
  };
}

export default function ChatwootAppPage() {
  const [searchParams] = useSearchParams();
  const agentId = searchParams.get("agent_id");
  const token = searchParams.get("token");

  const [appContext, setAppContext] = useState<DashboardAppContext | null>(null);
  const [data, setData] = useState<DashboardAppData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen for postMessage from Chatwoot
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.event === "appContext") {
        setAppContext(event.data);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Fetch context when postMessage arrives
  useEffect(() => {
    if (!appContext || !agentId || !token) return;

    const fetchContext = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/chatwoot-app/context?agent_id=${agentId}&chatwoot_conversation_id=${appContext.data?.conversation?.id}&token=${token}`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const result: DashboardAppData = await response.json();
        setData(result);

        if (!result.found) {
          setError("Conversa ainda não processada pelo agente BoomIA");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(`Erro ao carregar: ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    fetchContext();
  }, [appContext, agentId, token]);

  // Waiting for postMessage state
  if (!appContext) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="text-center space-y-4">
          <div className="inline-block p-3 bg-white rounded-full shadow-sm">
            <MessageCircle className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-600 text-sm font-medium">Aguardando dados da conversa...</p>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
        <Loader2 className="w-8 h-8 text-slate-400 animate-spin" />
      </div>
    );
  }

  // Not found state
  if (!data?.found) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="text-center space-y-2 px-4">
          <p className="text-slate-600 text-sm">{error || "Conversa ainda não processada pelo agente BoomIA"}</p>
        </div>
      </div>
    );
  }

  const agentInitials = data.agent?.name
    ? data.agent.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "AI";

  const contactInitials = data.contact?.name
    ? data.contact.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .toUpperCase()
    : "CT";

  const statusColor = {
    open: "bg-green-100 text-green-800",
    closed: "bg-slate-100 text-slate-800",
    pending: "bg-yellow-100 text-yellow-800",
  }[data.conversation?.status || "open"] || "bg-slate-100 text-slate-800";

  const followupStatusColor = {
    pending: "bg-yellow-50 text-yellow-700",
    sent: "bg-green-50 text-green-700",
    cancelled: "bg-slate-50 text-slate-700",
    exhausted: "bg-red-50 text-red-700",
  };

  return (
    <div className="w-full h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="border-b border-slate-200 bg-slate-50 p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8 flex-shrink-0">
            <AvatarImage src={data.agent?.avatar_url || ""} />
            <AvatarFallback className="bg-blue-100 text-blue-700 text-xs">{agentInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">{data.agent?.name}</p>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${statusColor}`}>
                {data.conversation?.status === "open" ? "Ativo" : "Encerrado"}
              </Badge>
              {data.conversation?.started_at && (
                <span className="text-xs text-slate-500">
                  {format(new Date(data.conversation.started_at), "d MMM", { locale: ptBR })}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="historico" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full rounded-none border-b border-slate-200 bg-slate-50 h-auto p-0">
          <TabsTrigger value="contato" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 px-3 py-2 text-xs font-medium">
            <User className="w-3.5 h-3.5 mr-1.5" />
            Contato
          </TabsTrigger>
          <TabsTrigger value="historico" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 px-3 py-2 text-xs font-medium">
            <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
            Histórico
          </TabsTrigger>
          {(data.followups?.length ?? 0) > 0 && (
            <TabsTrigger value="followups" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 px-3 py-2 text-xs font-medium">
              <Clock className="w-3.5 h-3.5 mr-1.5" />
              Follow-ups
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab: Contato */}
        <TabsContent value="contato" className="flex-1 overflow-y-auto p-3 m-0">
          {data.contact ? (
            <div className="space-y-3">
              <div className="flex items-start gap-2">
                <Avatar className="h-10 w-10 flex-shrink-0">
                  <AvatarImage src={data.conversation?.contact_avatar_url || ""} />
                  <AvatarFallback className="bg-amber-100 text-amber-700 text-xs">{contactInitials}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm text-slate-900">{data.contact.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {data.contact.contact_type && (
                      <Badge variant="secondary" className="text-xs">
                        {data.contact.contact_type === "lead" ? "Lead" : "Cliente"}
                      </Badge>
                    )}
                    {data.contact.lead_status && (
                      <Badge variant="outline" className="text-xs">
                        {data.contact.lead_status}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {data.contact.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <a href={`tel:${data.contact.phone}`} className="text-blue-600 hover:underline truncate">
                      {data.contact.phone}
                    </a>
                  </div>
                )}
                {data.contact.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <a href={`mailto:${data.contact.email}`} className="text-blue-600 hover:underline truncate">
                      {data.contact.email}
                    </a>
                  </div>
                )}
              </div>

              {data.contact.notes && (
                <div className="bg-slate-50 border border-slate-200 rounded p-2 text-xs text-slate-700">
                  <div className="flex items-start gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="break-words">{data.contact.notes}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Nenhum contato associado
            </div>
          )}
        </TabsContent>

        {/* Tab: Histórico */}
        <TabsContent value="historico" className="flex-1 overflow-hidden m-0">
          <ConversationMessagesView
            messages={
              data.messages?.map((m) => ({
                id: Math.random().toString(),
                role: m.role,
                content: m.content,
                created_at: m.created_at,
              })) || []
            }
            contactAvatarUrl={data.conversation?.contact_avatar_url}
            contactInitials={contactInitials}
            agentName={data.agent?.name}
            agentAvatarUrl={data.agent?.avatar_url}
            showDebug={false}
            className="bg-white"
          />
        </TabsContent>

        {/* Tab: Follow-ups */}
        {(data.followups?.length ?? 0) > 0 && (
          <TabsContent value="followups" className="flex-1 overflow-y-auto p-3 m-0 space-y-2">
            {data.followups?.map((followup, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-2 rounded border text-xs",
                  followupStatusColor[followup.status as keyof typeof followupStatusColor] ||
                    "bg-slate-50 text-slate-700"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      Tentativa {followup.attempt} de {followup.max_attempts}
                    </div>
                    <div className="text-xs opacity-75">
                      {format(new Date(followup.scheduled_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-xs flex-shrink-0">
                    {followup.status === "pending" && "Pendente"}
                    {followup.status === "sent" && "Enviado"}
                    {followup.status === "cancelled" && "Cancelado"}
                    {followup.status === "exhausted" && "Esgotado"}
                  </Badge>
                </div>
              </div>
            ))}
          </TabsContent>
        )}
      </Tabs>

      {/* Footer */}
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
        Powered by Boom IA
      </div>
    </div>
  );
}
