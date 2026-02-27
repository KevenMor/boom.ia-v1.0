import { useState, useEffect, useRef } from "react";
import { MessageSquare, Bot, User, Clock, Hash, Radio, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAgents } from "@/hooks/useAgents";
import { useConversations, useConversationMessages } from "@/hooks/useConversations";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function Conversations() {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);

  const { data: conversations, isLoading: convsLoading } = useConversations(selectedAgentId);
  const { data: messages, isLoading: msgsLoading } = useConversationMessages(selectedAgentId, selectedConvId);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const selectedConv = conversations?.find((c) => c.id === selectedConvId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 text-primary animate-pulse" />
            Conversas ao Vivo
          </h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe as conversas dos agentes em tempo real
          </p>
        </div>
      </div>

      {/* Agent selector */}
      <div className="max-w-xs">
        <Select
          value={selectedAgentId ?? ""}
          onValueChange={(v) => {
            setSelectedAgentId(v);
            setSelectedConvId(null);
          }}
        >
          <SelectTrigger className="h-9 bg-background">
            <SelectValue placeholder="Selecione um agente..." />
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

      {!selectedAgentId && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Selecione um agente para ver as conversas
        </p>
      )}

      {selectedAgentId && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[calc(100vh-240px)]">
          {/* Conversations list */}
          <Card className="border-border bg-card overflow-hidden lg:col-span-1">
            <div className="border-b border-border px-4 py-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Conversas ({conversations?.length ?? 0})
              </p>
            </div>
            <ScrollArea className="h-[calc(100%-44px)]">
              {convsLoading && (
                <div className="space-y-2 p-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full rounded-md" />
                  ))}
                </div>
              )}
              {!convsLoading && conversations?.length === 0 && (
                <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma conversa encontrada</p>
              )}
              <div className="space-y-0.5 p-1.5">
                {conversations?.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={cn(
                      "w-full text-left rounded-md px-3 py-2.5 transition-colors",
                      selectedConvId === conv.id
                        ? "bg-primary/10 border border-primary/20"
                        : "hover:bg-muted/50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium truncate max-w-[140px]">
                        {conv.external_user_id || "Anônimo"}
                      </span>
                      <Badge
                        variant={conv.status === "open" ? "default" : "secondary"}
                        className="text-[9px] h-4"
                      >
                        {conv.status === "open" ? "Ativa" : "Fechada"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-0.5">
                        <Hash className="h-2.5 w-2.5" />
                        {conv.channel}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <MessageSquare className="h-2.5 w-2.5" />
                        {conv.message_count}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {formatDistanceToNow(new Date(conv.started_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>

          {/* Chat view */}
          <Card className="border-border bg-card overflow-hidden lg:col-span-2 flex flex-col">
            {!selectedConvId ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                <div className="text-center space-y-2">
                  <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40" />
                  <p>Selecione uma conversa para visualizar</p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="border-b border-border px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 lg:hidden"
                      onClick={() => setSelectedConvId(null)}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{selectedConv?.external_user_id || "Anônimo"}</span>
                    <Badge variant="outline" className="text-[9px]">{selectedConv?.channel}</Badge>
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    ID: {selectedConvId.slice(0, 8)}...
                  </span>
                </div>

                {/* Messages */}
                <ScrollArea className="flex-1 p-4">
                  {msgsLoading && (
                    <div className="space-y-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-3/4 rounded-lg" />
                      ))}
                    </div>
                  )}
                  <div className="space-y-3">
                    {messages?.map((msg) => (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          msg.role === "user" ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-lg px-3 py-2 text-sm",
                            msg.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : msg.role === "assistant"
                              ? "bg-muted text-foreground"
                              : "bg-accent/50 text-accent-foreground text-xs italic"
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                          <div className="mt-1 flex items-center gap-2 text-[9px] opacity-60">
                            <span>
                              {new Date(msg.created_at).toLocaleTimeString("pt-BR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {msg.role === "assistant" && msg.latency_ms && (
                              <span>{msg.latency_ms}ms</span>
                            )}
                            {msg.role === "assistant" && msg.model && (
                              <span className="font-mono">{msg.model}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
