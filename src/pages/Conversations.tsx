import { useState, useEffect, useRef } from "react";
import { MessageSquare, Bot, ArrowLeft, Search, Send, Paperclip, Smile, CheckCheck, Bug, Trash2, Mic, Phone, Hash, Clock, Users, UserPlus } from "lucide-react";
import { DebugBlock } from "@/components/sandbox/DebugBlock";
import { cloudClient } from "@/integrations/supabase/cloud-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAgents } from "@/hooks/useAgents";
import { useTenantContext } from "@/contexts/TenantContext";
import { useConversations, useMultiConversationMessages } from "@/hooks/useConversations";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

function extractImages(content: string): { text: string; images: string[] } {
  const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const images: string[] = [];
  const text = content.replace(imgRegex, (_, _alt, url) => {
    images.push(url);
    return "";
  }).trim();
  return { text, images };
}

function parseAudioTranscription(content: string): { isAudio: boolean; transcription: string; remainingText: string } {
  const audioRegex = /\[Áudio do cliente\s*-?\s*transcrição\]:\s*"([^"]*)"/i;
  const match = content.match(audioRegex);
  if (match) {
    const transcription = match[1] || "";
    const remainingText = content.replace(audioRegex, "").trim();
    return { isAudio: true, transcription, remainingText };
  }
  return { isAudio: false, transcription: "", remainingText: content };
}

export default function Conversations() {
  const { selectedTenantId } = useTenantContext();
  const { data: agents, isLoading: agentsLoading } = useAgents(selectedTenantId ?? undefined);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactMessage, setNewContactMessage] = useState("");
  const [sendingNewContact, setSendingNewContact] = useState(false);
  const queryClient = useQueryClient();

  const { data: conversations, isLoading: convsLoading } = useConversations(selectedAgentId);

  const { deduplicatedConversations, contactConvIds } = (() => {
    if (!conversations) return { deduplicatedConversations: [] as typeof conversations, contactConvIds: new Map<string, string[]>() };
    const contactMap = new Map<string, (typeof conversations)[number]>();
    const idsMap = new Map<string, string[]>();

    const resolveContactKey = (conv: (typeof conversations)[number]) => {
      const normalizePhoneKey = (v: unknown) => {
        const digits = String(v ?? "").replace(/\D/g, "");
        if (digits.length < 10) return null;
        if (digits.startsWith("55") && digits.length >= 12) return digits.slice(-11);
        return digits;
      };

      const phoneKey = normalizePhoneKey(conv.external_user_id);
      if (phoneKey) return `phone:${phoneKey}`;

      let key = conv.contact_name || conv.external_user_id || conv.id;
      if (key.startsWith("{") || key.startsWith("[")) {
        try {
          const parsed = JSON.parse(key);
          const parsedPhoneKey = normalizePhoneKey(parsed?.phone || parsed?.phone_number || parsed?.identifier);
          if (parsedPhoneKey) return `phone:${parsedPhoneKey}`;
          key = parsed?.name || parsed?.phone || parsed?.email || conv.id;
        } catch {
          key = conv.id;
        }
      }
      return key;
    };

    const cwConvKeyMap = new Map<number, string>();
    for (const conv of conversations) {
      const cwId = conv.chatwoot_conversation_id;
      if (cwId && !cwConvKeyMap.has(cwId)) {
        cwConvKeyMap.set(cwId, resolveContactKey(conv));
      }
    }

    for (const conv of conversations) {
      let contactKey: string;
      const cwId = conv.chatwoot_conversation_id;
      if (cwId && cwConvKeyMap.has(cwId)) {
        contactKey = cwConvKeyMap.get(cwId)!;
      } else {
        contactKey = resolveContactKey(conv);
      }

      if (!idsMap.has(contactKey)) idsMap.set(contactKey, []);
      idsMap.get(contactKey)!.push(conv.id);

      if (!contactMap.has(contactKey)) {
        contactMap.set(contactKey, conv);
      } else {
        const existing = contactMap.get(contactKey)!;
        contactMap.set(contactKey, {
          ...existing,
          message_count: existing.message_count + conv.message_count,
        });
      }
    }
    return { deduplicatedConversations: Array.from(contactMap.values()), contactConvIds: idsMap };
  })();

  const selectedConvIds = selectedContactKey ? (contactConvIds.get(selectedContactKey) ?? []) : [];
  const selectedConv = deduplicatedConversations.find((c) => {
    const key = c.contact_name || c.external_user_id || c.id;
    return selectedContactKey && (contactConvIds.get(selectedContactKey) ?? []).includes(c.id);
  }) ?? (selectedContactKey ? deduplicatedConversations.find((c) => {
    let k = c.contact_name || c.external_user_id || c.id;
    if (k.startsWith("{") || k.startsWith("[")) {
      try { const p = JSON.parse(k); k = p?.name || p?.phone || p?.email || c.id; } catch { k = c.id; }
    }
    return k === selectedContactKey;
  }) : undefined);

  const { data: messages, isLoading: msgsLoading } = useMultiConversationMessages(selectedAgentId, selectedConvIds);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const filteredConversations = deduplicatedConversations.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      c.contact_name?.toLowerCase().includes(term) ||
      c.external_user_id?.toLowerCase().includes(term) ||
      c.channel?.toLowerCase().includes(term)
    );
  });

  const groupedMessages = messages?.reduce((groups: Record<string, typeof messages>, msg) => {
    const date = format(new Date(msg.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
    return groups;
  }, {} as Record<string, typeof messages>);

  const hasDebugData = (messages ?? []).some(
    (msg) => !!msg.metadata?.debug?.length || !!msg.metadata?.edge_logs?.length
  );

  const handleClearConversation = async () => {
    if (!selectedConvIds.length) return;
    const name = displayName(selectedConv);
    if (!confirm(`Tem certeza que deseja apagar todo o histórico de "${name}"? Essa ação não pode ser desfeita.`)) return;
    setClearing(true);
    try {
      const { data, error } = await cloudClient.functions.invoke("clear-conversations", {
        body: { conversation_ids: selectedConvIds, agent_id: selectedAgentId },
      });
      if (error) throw error;
      toast.success(`Histórico limpo: ${data.deleted_messages} mensagens removidas`);
      setSelectedContactKey(null);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["multi-conversation-messages"] });
    } catch (e: any) {
      toast.error("Erro ao limpar histórico: " + (e?.message || "erro desconhecido"));
    } finally {
      setClearing(false);
    }
  };

  const handleNewContact = async () => {
    if (!newContactPhone.trim() || !newContactMessage.trim() || !selectedAgentId) return;
    setSendingNewContact(true);
    try {
      const { data, error } = await cloudClient.functions.invoke("new-contact", {
        body: {
          agent_id: selectedAgentId,
          phone: newContactPhone.trim(),
          name: newContactName.trim() || undefined,
          message: newContactMessage.trim(),
        },
      });
      if (error) throw error;
      toast.success("Mensagem enviada para " + (newContactName.trim() || newContactPhone.trim()));
      setNewContactOpen(false);
      setNewContactPhone("");
      setNewContactName("");
      setNewContactMessage("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: any) {
      toast.error("Erro ao enviar: " + (e?.message || "erro desconhecido"));
    } finally {
      setSendingNewContact(false);
    }
  };

  const displayName = (conv: any) => {
    if (conv?.contact_name) return conv.contact_name;
    const ext = conv?.external_user_id;
    if (ext && (ext.startsWith("{") || ext.startsWith("["))) {
      try {
        const parsed = JSON.parse(ext);
        return parsed?.name || parsed?.phone || parsed?.email || "Anônimo";
      } catch { /* ignore */ }
    }
    return ext || "Anônimo";
  };
  const initials = (conv: any) => (displayName(conv)).slice(0, 2).toUpperCase();
  const getContactKey = (conv: any) => {
    const cwId = conv?.chatwoot_conversation_id;
    if (cwId) {
      for (const [key, ids] of contactConvIds.entries()) {
        if (ids.includes(conv?.id)) return key;
      }
    }
    const digits = String(conv?.external_user_id ?? "").replace(/\D/g, "");
    if (digits.length >= 10) {
      const normalized = digits.startsWith("55") && digits.length >= 12 ? digits.slice(-11) : digits;
      return `phone:${normalized}`;
    }
    let key = conv?.contact_name || conv?.external_user_id || conv?.id;
    if (key && (key.startsWith("{") || key.startsWith("["))) {
      try {
        const p = JSON.parse(key);
        const pDigits = String(p?.phone || p?.phone_number || p?.identifier || "").replace(/\D/g, "");
        if (pDigits.length >= 10) {
          const normalized = pDigits.startsWith("55") && pDigits.length >= 12 ? pDigits.slice(-11) : pDigits;
          return `phone:${normalized}`;
        }
        key = p?.name || p?.phone || p?.email || conv?.id;
      } catch { key = conv?.id; }
    }
    return key;
  };

  const normalizePhone = (value: string) => value.replace(/\D/g, "");

  const extractPhoneDigits = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value === "number") {
      const digits = normalizePhone(String(value));
      return digits.length >= 10 ? digits : null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      const digits = normalizePhone(trimmed);
      if (digits.length >= 10) return digits;
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 2) {
        try { const parsed = JSON.parse(trimmed); return extractPhoneDigits(parsed); } catch { return null; }
      }
      return null;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const priorityKeys = ["phone", "phone_number", "identifier", "source_id", "external_user_id", "whatsapp"];
      for (const key of priorityKeys) { const found = extractPhoneDigits(record[key]); if (found) return found; }
      for (const nested of Object.values(record)) { const found = extractPhoneDigits(nested); if (found) return found; }
    }
    return null;
  };

  const formatPhone = (value?: string | null) => {
    if (!value) return null;
    const digits = normalizePhone(value);
    if (digits.length === 13 && digits.startsWith("55")) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
    if (digits.length === 12 && digits.startsWith("55")) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return value;
  };

  const getPhoneDisplay = (conv: any) => {
    const candidates = [conv?.external_user_id, conv?.contact_name, conv?.chatwoot_contact_id];
    for (const candidate of candidates) {
      const digits = extractPhoneDigits(candidate);
      if (digits) return formatPhone(digits);
    }
    return null;
  };

  const selectedAgent = agents?.find((a) => a.id === selectedAgentId);

  const getChannelLabel = (channel: string) => {
    if (channel?.toLowerCase().includes("whatsapp")) return "WhatsApp";
    if (channel === "webhook") return "WhatsApp";
    if (channel?.toLowerCase().includes("web")) return "Web";
    return channel || "Chat";
  };

  const getTimestamp = (conv: any) => {
    try {
      return formatDistanceToNow(new Date(conv.started_at), { addSuffix: false, locale: ptBR });
    } catch {
      return "";
    }
  };

  return (
    <div className="h-full overflow-hidden">
      {!selectedAgentId ? (
        /* ─── Agent selection ─── */
        <div className="space-y-6 p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Chat ao Vivo</h1>
            <p className="text-sm text-muted-foreground mt-1">Selecione um agente para ver as conversas:</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agentsLoading && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
            ))}
            {agents?.map((agent) => {
              const isActive = agent.status === "active";
              return (
                <button
                  key={agent.id}
                  onClick={() => { setSelectedAgentId(agent.id); setSelectedContactKey(null); }}
                  className="group flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all duration-200 hover:border-primary/30 hover:shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.12)] hover:-translate-y-0.5"
                >
                  <div className="relative shrink-0">
                    {agent.avatar_url ? (
                      <img src={agent.avatar_url} alt={agent.name} className="h-11 w-11 rounded-xl object-cover ring-2 ring-border/30" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${isActive ? "bg-success" : "bg-muted-foreground/40"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{(agent.tenants as any)?.name ?? "Sem tenant"}</p>
                  </div>
                  <MessageSquare className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </button>
              );
            })}
            {!agentsLoading && (!agents || agents.length === 0) && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhum agente configurado</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── CRM Layout: Contact List + Chat ─── */
        <div className="flex h-full overflow-hidden">
          {/* ─── Left: Contact List (CRM style) ─── */}
          <div
            className={cn(
              "w-full flex-col border-r border-border bg-card md:w-[340px] lg:w-[380px] md:shrink-0",
              selectedContactKey ? "hidden md:flex" : "flex"
            )}
          >
            {/* Contact list header */}
            <div className="shrink-0 border-b border-border">
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold tracking-tight">Contatos</h2>
                  {filteredConversations.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                      {filteredConversations.length}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
                    <DialogTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                        <UserPlus className="h-3.5 w-3.5" />
                        Novo
                      </button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-[400px]">
                      <DialogHeader>
                        <DialogTitle>Novo Contato</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="nc-phone">Telefone *</Label>
                          <Input
                            id="nc-phone"
                            placeholder="(11) 99999-9999"
                            value={newContactPhone}
                            onChange={(e) => setNewContactPhone(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nc-name">Nome (opcional)</Label>
                          <Input
                            id="nc-name"
                            placeholder="Nome do contato"
                            value={newContactName}
                            onChange={(e) => setNewContactName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="nc-msg">Mensagem *</Label>
                          <Textarea
                            id="nc-msg"
                            placeholder="Digite a mensagem..."
                            value={newContactMessage}
                            onChange={(e) => setNewContactMessage(e.target.value)}
                            rows={3}
                          />
                        </div>
                        <Button
                          className="w-full"
                          disabled={!newContactPhone.trim() || !newContactMessage.trim() || sendingNewContact}
                          onClick={handleNewContact}
                        >
                          {sendingNewContact ? "Enviando..." : "Enviar Mensagem"}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <button
                    onClick={() => { setSelectedAgentId(null); setSelectedContactKey(null); }}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Voltar
                  </button>
                </div>
              </div>

              {/* Agent info bar */}
              {selectedAgent && (
                <div className="flex items-center gap-2.5 border-t border-border/50 bg-muted/30 px-4 py-2">
                  {selectedAgent.avatar_url ? (
                    <img src={selectedAgent.avatar_url} alt="" className="h-6 w-6 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <span className="text-xs font-medium text-foreground truncate">{selectedAgent.name}</span>
                  <span className={cn("ml-auto h-2 w-2 rounded-full shrink-0", selectedAgent.status === "active" ? "bg-success" : "bg-muted-foreground/40")} />
                </div>
              )}

              {/* Search */}
              <div className="px-3 py-2 border-t border-border/50">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Buscar contato..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 pl-8 text-xs border-border/50 bg-background"
                  />
                </div>
              </div>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto">
              {convsLoading && (
                <div className="space-y-px">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-10 w-10 rounded-full bg-muted/60 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-24 rounded bg-muted/60 animate-pulse" />
                        <div className="h-3 w-36 rounded bg-muted/40 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!convsLoading && filteredConversations?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground">Nenhuma conversa encontrada</p>
                </div>
              )}

              <div className="divide-y divide-border/30">
                {filteredConversations?.map((conv) => {
                  const isSelected = selectedContactKey === getContactKey(conv);
                  const phone = getPhoneDisplay(conv);
                  const channel = getChannelLabel(conv.channel);
                  const timestamp = getTimestamp(conv);
                  const name = displayName(conv);
                  const convCount = contactConvIds.get(getContactKey(conv))?.length ?? 1;

                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedContactKey(getContactKey(conv))}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-start transition-all duration-150",
                        isSelected
                          ? "bg-primary/8 border-l-2 border-l-primary"
                          : "border-l-2 border-l-transparent hover:bg-muted/50"
                      )}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0 mt-0.5">
                        <Avatar className="h-10 w-10">
                          {conv.contact_avatar_url && (
                            <AvatarImage src={conv.contact_avatar_url} alt={conv.contact_name || ""} />
                          )}
                          <AvatarFallback className={cn(
                            "text-xs font-semibold",
                            isSelected ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                          )}>
                            {initials(conv)}
                          </AvatarFallback>
                        </Avatar>
                        {conv.status === "open" && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-success" />
                        )}
                      </div>

                      {/* Contact info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn(
                            "text-sm truncate",
                            isSelected ? "font-semibold text-foreground" : "font-medium text-foreground"
                          )}>
                            {name}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                            {timestamp}
                          </span>
                        </div>

                        {/* Phone number */}
                        {phone && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Phone className="h-3 w-3 text-muted-foreground/60" />
                            <span className="text-[11px] text-muted-foreground truncate">{phone}</span>
                          </div>
                        )}

                        {/* Bottom row: channel + message count */}
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <div className="flex items-center gap-1.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "h-4 px-1.5 text-[9px] font-normal border-border/50",
                                channel === "WhatsApp" && "text-success border-success/30 bg-success/5"
                              )}
                            >
                              {channel}
                            </Badge>
                            {convCount > 1 && (
                              <span className="text-[9px] text-muted-foreground/60">
                                {convCount} conversas
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <MessageSquare className="h-3 w-3 text-muted-foreground/40" />
                            <span className="text-[10px] text-muted-foreground">{conv.message_count}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── Right: Chat Panel ─── */}
          <div
            className={cn(
              "flex-1 flex-col min-w-0 bg-background overflow-hidden",
              !selectedContactKey ? "hidden md:flex" : "flex"
            )}
          >
            {!selectedContactKey ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Selecione um contato</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Escolha um contato na lista para visualizar as mensagens
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 bg-card">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 md:hidden"
                    onClick={() => setSelectedContactKey(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="relative">
                    <Avatar className="h-9 w-9">
                      {selectedConv?.contact_avatar_url && (
                        <AvatarImage src={selectedConv.contact_avatar_url} alt={selectedConv.contact_name || ""} />
                      )}
                      <AvatarFallback className="text-xs bg-primary/10 text-primary font-semibold">
                        {initials(selectedConv)}
                      </AvatarFallback>
                    </Avatar>
                    {selectedConv?.status === "open" && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{displayName(selectedConv)}</p>
                    <p className="text-xs text-muted-foreground">
                      {getPhoneDisplay(selectedConv) || "Telefone não informado"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                    {selectedConvIds.length > 1 ? `${selectedConvIds.length} conversas` : `#${(selectedConvIds[0] ?? "").slice(0, 8)}`}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("h-8 w-8 shrink-0", showDebug ? "text-primary" : "text-muted-foreground")}
                    onClick={() => setShowDebug(!showDebug)}
                    title={showDebug ? "Ocultar debug" : "Mostrar debug"}
                    aria-pressed={showDebug}
                  >
                    <Bug className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={handleClearConversation}
                    disabled={clearing}
                    title="Limpar histórico deste contato"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {showDebug && !hasDebugData && (
                  <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    Debug ativado, mas esta conversa ainda não possui rastros de debug.
                  </div>
                )}

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div className="space-y-6">
                    {msgsLoading && (
                      <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                            <div className="h-12 w-2/3 rounded-2xl bg-muted/50 animate-pulse" />
                          </div>
                        ))}
                      </div>
                    )}

                    {groupedMessages && Object.entries(groupedMessages).map(([date, msgs]) => (
                      <div key={date}>
                        <div className="flex items-center gap-3 mb-4">
                          <Separator className="flex-1" />
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {date}
                          </span>
                          <Separator className="flex-1" />
                        </div>

                        <div className="space-y-3">
                          {msgs?.filter((msg) => {
                            if (msg.role === "user" && msg.content?.startsWith("[SISTEMA INTERNO")) return false;
                            if (msg.role === "user" && msg.content?.trim().startsWith("{") && (msg.content.includes('"_hint"') || msg.content.includes('"vehicles"') || msg.content.includes('"total"'))) return false;
                            if (msg.role === "user" && msg.content?.trim().startsWith("{") && msg.content.includes('"tool_results"')) return false;
                            if ((msg.role === "tool" || msg.role === "system") && !showDebug) {
                              const c = (msg.content || "").trim();
                              if (c.startsWith("{") || c.startsWith("[")) return false;
                              if (c.startsWith("[Resultado da ferramenta")) return false;
                              if (c.startsWith("⚠️")) return false;
                            }
                            return true;
                          }).map((msg) => {
                            const isUser = msg.role === "user";
                            const isSystem = msg.role === "system" || msg.role === "tool";
                            const audioInfo = isUser ? parseAudioTranscription(msg.content || "") : { isAudio: false, transcription: "", remainingText: msg.content || "" };
                            const contentForExtraction = isUser ? audioInfo.remainingText : msg.content || "";
                            const { text, images } = extractImages(contentForExtraction);

                            if (isSystem) {
                              return (
                                <div key={msg.id} className="flex justify-center py-1">
                                  <span className="text-[9px] bg-muted/60 text-muted-foreground px-3 py-1 rounded-full italic max-w-[80%] truncate">
                                    {msg.content?.slice(0, 100)}
                                  </span>
                                </div>
                              );
                            }

                            const bubbles: { text: string; images: string[]; isAudio?: boolean; transcription?: string }[] = [];
                            if (!isUser) {
                              const paragraphs = (msg.content || "").split(/\n\n+/);
                              let currentBubble = { text: "", images: [] as string[] };
                              for (const para of paragraphs) {
                                const { text: pText, images: pImages } = extractImages(para);
                                if (pImages.length > 0) {
                                  if (currentBubble.text.trim()) {
                                    bubbles.push({ ...currentBubble });
                                    currentBubble = { text: "", images: [] };
                                  }
                                  for (let i = 0; i < pImages.length; i += 3) {
                                    bubbles.push({ text: pText && i === 0 ? pText : "", images: pImages.slice(i, i + 3) });
                                  }
                                } else if (pText.trim()) {
                                  currentBubble.text += (currentBubble.text ? "\n\n" : "") + pText;
                                }
                              }
                              if (currentBubble.text.trim()) bubbles.push(currentBubble);
                              if (bubbles.length === 0 && text) bubbles.push({ text, images });
                            } else {
                              if (audioInfo.isAudio) {
                                bubbles.push({ text: "", images: [], isAudio: true, transcription: audioInfo.transcription });
                              }
                              if (text.trim() || images.length > 0) {
                                bubbles.push({ text, images });
                              }
                            }

                            return (
                              <div key={msg.id} className="space-y-1.5">
                                {!isUser && !isSystem && showDebug && (msg.metadata?.debug?.length || msg.metadata?.edge_logs?.length) && (
                                  <div className="flex justify-end mb-1">
                                    <DebugBlock debug={msg.metadata?.debug ?? []} edgeLogs={msg.metadata?.edge_logs} />
                                  </div>
                                )}
                                {bubbles.map((bubble, bIdx) => (
                                  <div key={`${msg.id}-${bIdx}`} className={cn("flex", isUser ? "justify-start" : "justify-end")}>
                                    <div className={cn("max-w-[75%]", isUser && bIdx === 0 && "flex gap-2.5")}>
                                      {/* User avatar on first bubble */}
                                      {isUser && bIdx === 0 && (
                                        <Avatar className="h-7 w-7 shrink-0 mt-1">
                                          {selectedConv?.contact_avatar_url && (
                                            <AvatarImage src={selectedConv.contact_avatar_url} />
                                          )}
                                          <AvatarFallback className="text-[10px] bg-accent/20 text-accent-foreground font-semibold">
                                            {initials(selectedConv)}
                                          </AvatarFallback>
                                        </Avatar>
                                      )}
                                      <div
                                        className={cn(
                                          "rounded-2xl px-3.5 py-2.5",
                                          isUser
                                            ? "rounded-tl-md bg-accent border border-border"
                                            : "rounded-br-md bg-primary text-primary-foreground"
                                        )}
                                      >
                                        {bubble.isAudio && (
                                          <div className="flex items-start gap-2.5">
                                            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-accent/20 shrink-0 mt-0.5">
                                              <Mic className="h-4 w-4 text-accent-foreground" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex items-center gap-1.5 mb-1">
                                                <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">Áudio transcrito</span>
                                              </div>
                                              <p className="text-sm whitespace-pre-wrap break-words italic">
                                                "{bubble.transcription}"
                                              </p>
                                            </div>
                                          </div>
                                        )}

                                        {bubble.images.length > 0 && (
                                          <div className="mb-1.5 grid gap-1 grid-cols-1">
                                            {bubble.images.map((img, idx) => (
                                              <a key={idx} href={img} target="_blank" rel="noopener noreferrer">
                                                <img
                                                  src={img}
                                                  alt=""
                                                  className="rounded-lg w-full h-auto max-h-48 object-cover hover:opacity-90 transition-opacity"
                                                  loading="lazy"
                                                />
                                              </a>
                                            ))}
                                          </div>
                                        )}

                                        {bubble.text && !bubble.isAudio && (
                                          <div className="prose prose-sm max-w-none [&_p]:m-0 [&_p]:leading-relaxed">
                                            <ReactMarkdown
                                              components={{
                                                p: ({ children }) => <p className="text-sm whitespace-pre-wrap break-words">{children}</p>,
                                                a: ({ href, children }) => (
                                                  <a href={href} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">
                                                    {children}
                                                  </a>
                                                ),
                                                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                              }}
                                            >
                                              {bubble.text}
                                            </ReactMarkdown>
                                          </div>
                                        )}
                                      </div>

                                      {bIdx === bubbles.length - 1 && (
                                        <div className={cn(
                                          "mt-1 flex items-center gap-1 px-1",
                                          isUser ? "justify-start" : "justify-end"
                                        )}>
                                          <span className="text-[10px] text-muted-foreground">
                                            {format(new Date(msg.created_at), "HH:mm")}
                                          </span>
                                          {!isUser && (
                                            <CheckCheck className="h-3 w-3 text-primary" />
                                          )}
                                          {!isUser && msg.model && (
                                            <span className="text-[9px] text-muted-foreground/50 ml-1">
                                              ↳ {msg.model}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Footer — send message */}
                <div className="shrink-0 border-t border-border px-4 py-3 bg-card">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const input = form.elements.namedItem("operator-msg") as HTMLTextAreaElement;
                      const text = input?.value?.trim();
                      if (!text || !selectedAgentId || !selectedConvIds.length) return;
                      input.disabled = true;
                      try {
                        const { error } = await cloudClient.functions.invoke("send-operator-message", {
                          body: { agent_id: selectedAgentId, conversation_id: selectedConvIds[0], content: text },
                        });
                        if (error) throw error;
                        input.value = "";
                        queryClient.invalidateQueries({ queryKey: ["multi-conversation-messages"] });
                      } catch (err: any) {
                        toast.error("Erro ao enviar: " + (err?.message || "erro desconhecido"));
                      } finally {
                        input.disabled = false;
                        input.focus();
                      }
                    }}
                    className="flex items-end gap-2"
                  >
                    <Textarea
                      name="operator-msg"
                      className="min-h-[40px] max-h-[120px] resize-none text-sm"
                      placeholder="Digite uma mensagem..."
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
                        }
                      }}
                    />
                    <Button type="submit" size="icon" className="h-8 w-8 shrink-0 mb-0.5">
                      <Send className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
