import { useState, useEffect, useRef } from "react";
import { MessageSquare, Bot, ArrowLeft, Search, Send, Paperclip, Smile, CheckCheck, Bug, Trash2, Mic } from "lucide-react";
import { DebugBlock } from "@/components/sandbox/DebugBlock";
import { cloudClient } from "@/integrations/supabase/cloud-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useAgents } from "@/hooks/useAgents";
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

function getLastMessagePreview(messages: any[] | undefined): string {
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1];
  return last?.content?.slice(0, 60) || "";
}

export default function Conversations() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDebug, setShowDebug] = useState(false);
  const [clearing, setClearing] = useState(false);
  const queryClient = useQueryClient();

  const { data: conversations, isLoading: convsLoading } = useConversations(selectedAgentId);

  // Build contact-key → conversation IDs map AND deduplicated list
  const { deduplicatedConversations, contactConvIds } = (() => {
    if (!conversations) return { deduplicatedConversations: [] as typeof conversations, contactConvIds: new Map<string, string[]>() };
    const contactMap = new Map<string, (typeof conversations)[number]>();
    const idsMap = new Map<string, string[]>();

    const resolveContactKey = (conv: (typeof conversations)[number]) => {
      const normalizePhoneKey = (v: unknown) => {
        const digits = String(v ?? "").replace(/\D/g, "");
        if (digits.length < 10) return null;
        // normalize BR with/without country code (55)
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
    // First pass: build a chatwoot_conversation_id → canonical key map
    const cwConvKeyMap = new Map<number, string>();
    for (const conv of conversations) {
      const cwId = conv.chatwoot_conversation_id;
      if (cwId && !cwConvKeyMap.has(cwId)) {
        cwConvKeyMap.set(cwId, resolveContactKey(conv));
      }
    }

    for (const conv of conversations) {
      // Use chatwoot_conversation_id to unify when available
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

  // Get all conversation IDs for the selected contact
  const selectedConvIds = selectedContactKey ? (contactConvIds.get(selectedContactKey) ?? []) : [];
  const selectedConv = deduplicatedConversations.find((c) => {
    const key = c.contact_name || c.external_user_id || c.id;
    // Match by resolved contact key
    return selectedContactKey && (contactConvIds.get(selectedContactKey) ?? []).includes(c.id);
  }) ?? (selectedContactKey ? deduplicatedConversations.find((c) => {
    // fallback: find by contactKey matching
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
    // If this conv has a chatwoot_conversation_id, find the canonical key from our dedup map
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
      } catch {
        key = conv?.id;
      }
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
        try {
          const parsed = JSON.parse(trimmed);
          return extractPhoneDigits(parsed);
        } catch {
          return null;
        }
      }

      return null;
    }

    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const priorityKeys = ["phone", "phone_number", "identifier", "source_id", "external_user_id", "whatsapp"];

      for (const key of priorityKeys) {
        const found = extractPhoneDigits(record[key]);
        if (found) return found;
      }

      for (const nested of Object.values(record)) {
        const found = extractPhoneDigits(nested);
        if (found) return found;
      }
    }

    return null;
  };

  const formatPhone = (value?: string | null) => {
    if (!value) return null;
    const digits = normalizePhone(value);
    if (digits.length === 13 && digits.startsWith("55")) {
      return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
    }
    if (digits.length === 12 && digits.startsWith("55")) {
      return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    }
    if (digits.length === 11) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
      return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Chat ao Vivo</h1>
            <p className="text-sm text-muted-foreground">Mensagens e conversas dos agentes.</p>
          </div>
          <div className="w-56">
            <Select
              value={selectedAgentId ?? ""}
              onValueChange={(v) => {
                setSelectedAgentId(v);
                setSelectedContactKey(null);
              }}
            >
              <SelectTrigger className="h-9 bg-card text-sm">
                <SelectValue placeholder="Selecione um agente" />
              </SelectTrigger>
              <SelectContent>
                {agentsLoading && <SelectItem value="_loading" disabled>Carregando...</SelectItem>}
                {agents?.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    <span className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5" />
                      {a.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {!selectedAgentId ? (
        <div className="flex h-[calc(100vh-14rem)] items-center justify-center rounded-xl border bg-card text-card-foreground shadow-sm">
          <div className="text-center space-y-3">
            <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
              <MessageSquare className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Selecione um agente para ver as conversas</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border bg-card text-card-foreground shadow-sm flex h-[calc(100vh-14rem)] overflow-hidden">
          {/* ─── Left panel: conversation list ─── */}
          <div
            className={cn(
              "w-full flex-col border-r border-border md:w-80 md:shrink-0",
              selectedContactKey ? "hidden md:flex" : "flex"
            )}
          >
            <div className="flex flex-col h-full">
              {/* Search */}
              <div className="shrink-0 p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Pesquisar conversas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-9 pl-9 text-sm"
                  />
                </div>
              </div>

              <Separator />

              {/* Conversation list */}
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {convsLoading && (
                  <div className="space-y-2 p-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
                    ))}
                  </div>
                )}
                {!convsLoading && filteredConversations?.length === 0 && (
                  <p className="py-12 text-center text-xs text-muted-foreground">Nenhuma conversa</p>
                )}
                {filteredConversations?.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedContactKey(getContactKey(conv))}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors",
                      selectedContactKey === getContactKey(conv) ? "bg-accent/20" : "hover:bg-accent/10"
                    )}
                  >
                    <div className="relative shrink-0">
                      <Avatar className="h-10 w-10">
                        {conv.contact_avatar_url && (
                          <AvatarImage src={conv.contact_avatar_url} alt={conv.contact_name || ""} />
                        )}
                        <AvatarFallback className="text-xs bg-muted font-medium">
                          {initials(conv)}
                        </AvatarFallback>
                      </Avatar>
                      {conv.status === "open" && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-card bg-success" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{displayName(conv)}</p>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.started_at), { addSuffix: false, locale: ptBR })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {getPhoneDisplay(conv) || (conv.channel === "webhook" ? "WhatsApp" : conv.channel)} · {conv.message_count} msgs
                        </p>
                        {conv.status === "open" && (
                          <Badge className="h-4.5 min-w-4.5 shrink-0 rounded-full px-1.5 text-[10px]">
                            {conv.message_count}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Right panel: chat ─── */}
          <div
            className={cn(
              "flex-1 flex-col min-w-0",
              !selectedContactKey ? "hidden md:flex" : "flex"
            )}
          >
            {!selectedContactKey ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
                    <MessageSquare className="h-7 w-7 text-muted-foreground/40" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Selecione uma conversa</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      Visualize as mensagens em tempo real
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
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
                      <AvatarFallback className="text-xs bg-muted font-medium">
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
                        {/* Date separator */}
                        <div className="flex items-center gap-3 mb-4">
                          <Separator className="flex-1" />
                          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {date}
                          </span>
                          <Separator className="flex-1" />
                        </div>

                        {/* Messages */}
                        <div className="space-y-3">
                          {msgs?.filter((msg) => {
                            // Hide internal system prompts (follow-up instructions, etc.)
                            if (msg.role === "user" && msg.content?.startsWith("[SISTEMA INTERNO")) return false;
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

                            // Split assistant messages into separate bubbles (like WhatsApp)
                            const bubbles: { text: string; images: string[]; isAudio?: boolean; transcription?: string }[] = [];
                            if (!isUser) {
                              // Split by double newlines to create separate bubbles
                              const paragraphs = (msg.content || "").split(/\n\n+/);
                              let currentBubble = { text: "", images: [] as string[] };
                              for (const para of paragraphs) {
                                const { text: pText, images: pImages } = extractImages(para);
                                if (pImages.length > 0) {
                                  // Flush current text bubble if any
                                  if (currentBubble.text.trim()) {
                                    bubbles.push({ ...currentBubble });
                                    currentBubble = { text: "", images: [] };
                                  }
                                  // Group images (up to 3 per bubble like WhatsApp)
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
                              // For user messages with audio, create audio bubble first
                              if (audioInfo.isAudio) {
                                bubbles.push({ text: "", images: [], isAudio: true, transcription: audioInfo.transcription });
                              }
                              if (text.trim() || images.length > 0) {
                                bubbles.push({ text, images });
                              }
                            }

                            return (
                              <div key={msg.id} className="space-y-1.5">
                                {/* Debug block before assistant messages */}
                                {!isUser && !isSystem && showDebug && (msg.metadata?.debug?.length || msg.metadata?.edge_logs?.length) && (
                                  <div className="flex justify-end mb-1">
                                    <DebugBlock debug={msg.metadata?.debug ?? []} edgeLogs={msg.metadata?.edge_logs} />
                                  </div>
                                )}
                                {bubbles.map((bubble, bIdx) => (
                              <div key={`${msg.id}-${bIdx}`} className={cn("flex", isUser ? "justify-start" : "justify-end")}>
                              <div className="max-w-[75%]">
                                  <div
                                    className={cn(
                                      "rounded-2xl px-3.5 py-2",
                                      isUser
                                        ? "rounded-bl-md bg-muted"
                                        : "rounded-br-md bg-primary text-primary-foreground"
                                    )}
                                  >
                                    {/* Audio transcription bubble */}
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

                                    {/* Images */}
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

                                    {/* Text */}
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

                                  {/* Timestamp only on last bubble */}
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
                                      <span className="text-[9px] text-muted-foreground font-mono">{msg.model.split("/").pop()}</span>
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

                {/* Footer — read-only */}
                <div className="shrink-0 border-t border-border px-4 py-3">
                  <div className="flex items-end gap-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mb-0.5" disabled>
                      <Paperclip className="h-4 w-4" />
                    </Button>
                    <Textarea
                      className="min-h-[40px] max-h-[120px] resize-none text-sm"
                      placeholder="Modo somente leitura..."
                      rows={1}
                      disabled
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 mb-0.5" disabled>
                      <Smile className="h-4 w-4" />
                    </Button>
                    <Button size="icon" className="h-8 w-8 shrink-0 mb-0.5" disabled>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
