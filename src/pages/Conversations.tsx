import { useState, useEffect, useRef } from "react";
import { MessageSquare, Bot, ArrowLeft, Search, Send, Paperclip, Smile, CheckCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { useAgents } from "@/hooks/useAgents";
import { useConversations, useConversationMessages } from "@/hooks/useConversations";
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

function getLastMessagePreview(messages: any[] | undefined): string {
  if (!messages || messages.length === 0) return "";
  const last = messages[messages.length - 1];
  return last?.content?.slice(0, 60) || "";
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
      c.contact_name?.toLowerCase().includes(term) ||
      c.external_user_id?.toLowerCase().includes(term) ||
      c.channel?.toLowerCase().includes(term)
    );
  });

  const groupedMessages = messages?.reduce((groups, msg) => {
    const date = format(new Date(msg.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    if (!groups[date]) groups[date] = [];
    groups[date].push(msg);
    return groups;
  }, {} as Record<string, typeof messages>);

  const displayName = (conv: any) => conv?.contact_name || conv?.external_user_id || "Anônimo";
  const initials = (conv: any) => (displayName(conv)).slice(0, 2).toUpperCase();

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
                setSelectedConvId(null);
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
              selectedConvId ? "hidden md:flex" : "flex"
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
                    onClick={() => setSelectedConvId(conv.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition-colors",
                      selectedConvId === conv.id ? "bg-accent/20" : "hover:bg-accent/10"
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
                          {conv.channel === "webhook" ? "WhatsApp" : conv.channel} · {conv.message_count} msgs
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
              !selectedConvId ? "hidden md:flex" : "flex"
            )}
          >
            {!selectedConvId ? (
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
                    onClick={() => setSelectedConvId(null)}
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
                      {selectedConv?.status === "open" ? "Online" : "Offline"}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                    #{selectedConvId.slice(0, 8)}
                  </Badge>
                </div>

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
                          {msgs?.map((msg) => {
                            const isUser = msg.role === "user";
                            const isSystem = msg.role === "system" || msg.role === "tool";
                            const { text, images } = extractImages(msg.content || "");

                            if (isSystem) {
                              return (
                                <div key={msg.id} className="flex justify-center py-1">
                                  <span className="text-[9px] bg-muted/60 text-muted-foreground px-3 py-1 rounded-full italic max-w-[80%] truncate">
                                    {msg.content?.slice(0, 100)}
                                  </span>
                                </div>
                              );
                            }

                            return (
                              <div key={msg.id} className={cn("flex", isUser ? "justify-start" : "justify-end")}>
                                <div className="max-w-[75%]">
                                  <div
                                    className={cn(
                                      "rounded-2xl px-3.5 py-2",
                                      isUser
                                        ? "rounded-bl-md bg-muted"
                                        : "rounded-br-md bg-primary text-primary-foreground"
                                    )}
                                  >
                                    {/* Images */}
                                    {images.length > 0 && (
                                      <div className="mb-1.5 grid gap-1 grid-cols-1">
                                        {images.map((img, idx) => (
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
                                    {text && (
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
                                          {text}
                                        </ReactMarkdown>
                                      </div>
                                    )}
                                  </div>

                                  {/* Timestamp */}
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
                                </div>
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
