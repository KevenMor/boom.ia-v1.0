import { useState, useEffect, useRef } from "react";
import { MessageSquare, Bot, User, Clock, Hash, Radio, ArrowLeft, Search, Image as ImageIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAgents } from "@/hooks/useAgents";
import { useConversations, useConversationMessages } from "@/hooks/useConversations";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

/** Extract a short preview from the last assistant or user message */
function getLastMessagePreview(messages: any[] | undefined): string {
  return "";
}

/** Detect image URLs in message content */
function extractImages(content: string): { text: string; images: string[] } {
  const imgRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const images: string[] = [];
  const text = content.replace(imgRegex, (_, _alt, url) => {
    images.push(url);
    return "";
  }).trim();
  return { text, images };
}

export default function Conversations() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: conversations, isLoading: convsLoading } = useConversations(selectedAgentId);
  const { data: messages, isLoading: msgsLoading } = useConversationMessages(selectedAgentId, selectedConvId);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConv = conversations?.find((c) => c.id === selectedConvId);

  const filteredConversations = conversations?.filter((c) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (c.contact_name?.toLowerCase().includes(term)) ||
      (c.external_user_id?.toLowerCase().includes(term)) ||
      (c.channel?.toLowerCase().includes(term))
    );
  });

  // Group messages by date
  const groupedMessages = messages?.reduce((groups, msg) => {
    const date = format(new Date(msg.created_at), "dd MMM yyyy", { locale: ptBR });
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
    return groups;
  }, {} as Record<string, typeof messages>);

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-1 pb-3">
        <div className="flex items-center gap-3">
          <Radio className="h-4 w-4 text-primary animate-pulse" />
          <h2 className="text-base font-semibold">Conversas</h2>
          {conversations && (
            <Badge variant="secondary" className="text-[10px] font-mono">
              {conversations.length}
            </Badge>
          )}
        </div>
        <div className="w-52">
          <Select
            value={selectedAgentId ?? ""}
            onValueChange={(v) => {
              setSelectedAgentId(v);
              setSelectedConvId(null);
            }}
          >
            <SelectTrigger className="h-8 bg-card text-xs">
              <SelectValue placeholder="Selecione um agente" />
            </SelectTrigger>
            <SelectContent>
              {agentsLoading && <SelectItem value="_loading" disabled>Carregando...</SelectItem>}
              {agents?.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  <span className="flex items-center gap-2">
                    <Bot className="h-3 w-3" />
                    {a.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {!selectedAgentId ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          <div className="text-center space-y-2">
            <MessageSquare className="h-10 w-10 mx-auto text-muted-foreground/30" />
            <p>Selecione um agente para ver as conversas</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex rounded-lg border border-border overflow-hidden bg-card">
          {/* ─── Left panel: conversation list ─── */}
          <div
            className={cn(
              "w-full lg:w-80 lg:min-w-[320px] border-r border-border flex flex-col bg-card",
              selectedConvId ? "hidden lg:flex" : "flex"
            )}
          >
            {/* Search */}
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar conversa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-8 pl-8 text-xs bg-background border-border/50"
                />
              </div>
            </div>

            {/* Tabs: status */}
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-border/50 text-[10px]">
              <span className="font-medium text-primary">
                Abertas {filteredConversations?.filter(c => c.status === "open").length ?? 0}
              </span>
              <span className="text-muted-foreground mx-1">·</span>
              <span className="text-muted-foreground">
                Todas {filteredConversations?.length ?? 0}
              </span>
            </div>

            {/* List */}
            <ScrollArea className="flex-1">
              {convsLoading && (
                <div className="space-y-1 p-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-md" />
                  ))}
                </div>
              )}
              {!convsLoading && filteredConversations?.length === 0 && (
                <p className="py-12 text-center text-xs text-muted-foreground">Nenhuma conversa</p>
              )}
              <div className="p-1">
                {filteredConversations?.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={cn(
                      "w-full text-left rounded-md px-3 py-2.5 transition-all group",
                      selectedConvId === conv.id
                        ? "bg-primary/10"
                        : "hover:bg-muted/40"
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="relative shrink-0">
                        <Avatar className="h-9 w-9">
                          {conv.contact_avatar_url && (
                            <AvatarImage src={conv.contact_avatar_url} alt={conv.contact_name || ""} />
                          )}
                          <AvatarFallback className="text-[11px] bg-secondary">
                            {(conv.contact_name || conv.external_user_id || "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {conv.status === "open" && (
                          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success border-2 border-card" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium truncate">
                            {conv.contact_name || conv.external_user_id || "Anônimo"}
                          </span>
                          <span className="text-[9px] text-muted-foreground shrink-0 ml-2">
                            {formatDistanceToNow(new Date(conv.started_at), { addSuffix: false, locale: ptBR })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-0.5">
                          <span className="text-[10px] text-muted-foreground truncate">
                            {conv.channel === "webhook" ? "WhatsApp" : conv.channel} · {conv.message_count} msgs
                          </span>
                          <Badge
                            variant={conv.status === "open" ? "default" : "secondary"}
                            className="text-[8px] h-3.5 px-1.5 shrink-0"
                          >
                            {conv.status === "open" ? "Aberta" : "Fechada"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* ─── Right panel: chat ─── */}
          <div
            className={cn(
              "flex-1 flex flex-col min-w-0",
              !selectedConvId ? "hidden lg:flex" : "flex"
            )}
          >
            {!selectedConvId ? (
              <div className="flex-1 flex items-center justify-center">
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
                {/* ── Chat header ── */}
                <div className="border-b border-border px-4 py-2.5 flex items-center justify-between bg-card">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 lg:hidden"
                      onClick={() => setSelectedConvId(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <Avatar className="h-8 w-8">
                      {selectedConv?.contact_avatar_url && (
                        <AvatarImage src={selectedConv.contact_avatar_url} alt={selectedConv.contact_name || ""} />
                      )}
                      <AvatarFallback className="text-[10px] bg-secondary">
                        {(selectedConv?.contact_name || selectedConv?.external_user_id || "?").slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium leading-tight">
                        {selectedConv?.contact_name || selectedConv?.external_user_id || "Anônimo"}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {selectedConv?.channel === "webhook" ? "WhatsApp" : selectedConv?.channel}
                        {selectedConv?.status === "open" && (
                          <span className="text-success ml-1.5">● Online</span>
                        )}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-mono">
                    #{selectedConvId.slice(0, 8)}
                  </Badge>
                </div>

                {/* ── Messages area ── */}
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-1">
                    {msgsLoading && (
                      <div className="space-y-3">
                        {Array.from({ length: 4 }).map((_, i) => (
                          <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
                            <Skeleton className="h-12 w-2/3 rounded-xl" />
                          </div>
                        ))}
                      </div>
                    )}

                    {groupedMessages && Object.entries(groupedMessages).map(([date, msgs]) => (
                      <div key={date}>
                        {/* Date separator */}
                        <div className="flex items-center justify-center py-3">
                          <span className="text-[9px] bg-muted/60 text-muted-foreground px-3 py-0.5 rounded-full font-medium">
                            {date}
                          </span>
                        </div>

                        {/* Messages for this date */}
                        <div className="space-y-1.5">
                          {msgs?.map((msg) => {
                            const isUser = msg.role === "user";
                            const isSystem = msg.role === "system" || msg.role === "tool";
                            const { text, images } = extractImages(msg.content || "");

                            if (isSystem) {
                              return (
                                <div key={msg.id} className="flex justify-center py-1">
                                  <span className="text-[9px] bg-accent/30 text-muted-foreground px-3 py-1 rounded-full italic max-w-[80%] truncate">
                                    {msg.content?.slice(0, 100)}
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div
                                key={msg.id}
                                className={cn("flex", isUser ? "justify-start" : "justify-end")}
                              >
                                <div
                                  className={cn(
                                    "max-w-[70%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed shadow-sm",
                                    isUser
                                      ? "bg-muted/80 text-foreground rounded-bl-sm"
                                      : "bg-primary text-primary-foreground rounded-br-sm"
                                  )}
                                >
                                  {/* Images */}
                                  {images.length > 0 && (
                                    <div className={cn(
                                      "mb-1.5 grid gap-1",
                                      images.length === 1 ? "grid-cols-1" : images.length === 2 ? "grid-cols-2" : "grid-cols-2"
                                    )}>
                                      {images.map((img, idx) => (
                                        <a key={idx} href={img} target="_blank" rel="noopener noreferrer" className="block">
                                          <img
                                            src={img}
                                            alt=""
                                            className="rounded-lg w-full h-auto max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                            loading="lazy"
                                          />
                                        </a>
                                      ))}
                                    </div>
                                  )}

                                  {/* Text content */}
                                  {text && (
                                    <div className="prose prose-sm prose-invert max-w-none [&_p]:m-0 [&_p]:leading-relaxed">
                                      <ReactMarkdown
                                        components={{
                                          p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
                                          a: ({ href, children }) => (
                                            <a href={href} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">
                                              {children}
                                            </a>
                                          ),
                                          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                        }}
                                      >
                                        {text}
                                      </ReactMarkdown>
                                    </div>
                                  )}

                                  {/* Timestamp */}
                                  <div className={cn(
                                    "mt-1 flex items-center gap-1.5 text-[9px]",
                                    isUser ? "opacity-40" : "opacity-50"
                                  )}>
                                    <span>
                                      {format(new Date(msg.created_at), "HH:mm")}
                                    </span>
                                    {!isUser && msg.model && (
                                      <span className="font-mono">{msg.model.split("/").pop()}</span>
                                    )}
                                    {!isUser && msg.latency_ms && (
                                      <span>{msg.latency_ms}ms</span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {/* ── Footer bar (read-only indicator) ── */}
                <div className="border-t border-border px-4 py-2 flex items-center justify-center bg-card/50">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <Radio className="h-3 w-3 text-success animate-pulse" />
                    Modo espelhamento — somente leitura
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
