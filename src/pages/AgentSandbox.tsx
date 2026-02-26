import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Loader2, Bot, User, Trash2, MessageSquare, Plus, Clock } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgents } from "@/hooks/useAgents";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { format } from "date-fns";

type Msg = { role: "user" | "assistant"; content: string };
type Conversation = {
  id: string;
  channel: string;
  status: string;
  started_at: string;
  message_count: number;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-agent`;

export default function AgentSandbox() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { data: agents } = useAgents();
  const agent = agents?.find((a) => a.id === agentId);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load conversation list
  const loadConversations = useCallback(async () => {
    if (!agentId) return;
    try {
      const { data, error } = await nexusDb.rpc("list_agent_conversations", {
        p_agent_id: agentId,
        p_limit: 50,
      });
      if (!error && data) setConversations(data as Conversation[]);
    } catch {
      // Schema may not be provisioned yet
    }
  }, [agentId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Load messages from a conversation
  const loadConversation = async (convId: string) => {
    if (!agentId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await nexusDb.rpc("load_conversation_messages", {
        p_agent_id: agentId,
        p_conversation_id: convId,
      });
      if (error) throw error;
      setMessages(
        (data as any[]).map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      );
      setConversationId(convId);
      setShowHistory(false);
    } catch (e: any) {
      toast.error("Erro ao carregar conversa");
    } finally {
      setLoadingHistory(false);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationId(null);
    setShowHistory(false);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || isLoading || !agentId) return;

    const userMsg: Msg = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    let assistantSoFar = "";
    const allMessages = [...messages, userMsg];

    try {
      const { data: { session } } = await nexusDb.auth.getSession();
      const token = session?.access_token;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          ...(token ? { "x-nexus-auth": `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          agent_id: agentId,
          messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
          conversation_id: conversationId,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || err.detail || `Status ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, nl);
          textBuffer = textBuffer.slice(nl + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;

          try {
            const parsed = JSON.parse(jsonStr);

            // Capture conversation_id from first event
            if (parsed.conversation_id && !conversationId) {
              setConversationId(parsed.conversation_id);
              continue;
            }

            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              assistantSoFar += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
                  );
                }
                return [...prev, { role: "assistant", content: assistantSoFar }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      // Refresh conversation list
      loadConversations();
    } catch (e: any) {
      console.error("Chat error:", e);
      toast.error(e.message || "Erro ao enviar mensagem");
      if (!assistantSoFar) {
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - Conversation History */}
      <div
        className={`border-r border-border bg-muted/30 transition-all duration-200 ${
          showHistory ? "w-72" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-xs font-medium text-muted-foreground">Conversas</span>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startNewConversation}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100%-3rem)]">
          <div className="space-y-1 p-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left rounded-md px-3 py-2 text-xs transition-colors hover:bg-muted ${
                  conversationId === conv.id ? "bg-muted border border-border" : ""
                }`}
              >
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {format(new Date(conv.started_at), "dd/MM HH:mm")}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <span>{conv.message_count} msgs</span>
                  <Badge variant="secondary" className="text-[9px] h-4">
                    {conv.channel}
                  </Badge>
                </div>
              </button>
            ))}
            {conversations.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-4">
                Nenhuma conversa ainda
              </p>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/agents")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
            className={showHistory ? "bg-muted" : ""}
          >
            <Clock className="h-4 w-4" />
          </Button>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Bot className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold">{agent?.name ?? "Agent"}</h2>
            <div className="flex items-center gap-2">
              {agent?.model && (
                <Badge variant="secondary" className="font-mono text-[10px]">{agent.model}</Badge>
              )}
              {(agent?.providers as any)?.name && (
                <Badge variant="secondary" className="text-[10px]">{(agent.providers as any).name}</Badge>
              )}
              <span className="text-[10px] text-muted-foreground">temp: {agent?.temperature ?? 0.7}</span>
              {conversationId && (
                <Badge variant="outline" className="text-[9px] font-mono">
                  {conversationId.slice(0, 8)}…
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={startNewConversation}>
            <Plus className="h-3 w-3" />
            Nova
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={() => setMessages([])}>
              <Trash2 className="h-3 w-3" />
              Limpar
            </Button>
          )}
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4">
          {loadingHistory && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="flex h-full items-center justify-center py-20">
              <div className="text-center">
                <Bot className="mx-auto h-10 w-10 text-muted-foreground/30" />
                <p className="mt-3 text-sm text-muted-foreground">
                  Envie uma mensagem para testar o agente
                </p>
                {agent?.system_prompt && (
                  <p className="mt-1 max-w-md text-xs text-muted-foreground/60 line-clamp-3">
                    System prompt: {agent.system_prompt}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4 py-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "assistant" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
                  msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-1">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex gap-3">
                <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="rounded-xl bg-muted px-4 py-2.5">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="border-t border-border p-4">
          <div className="relative">
            <Textarea
              placeholder="Digite sua mensagem..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              className="min-h-[44px] resize-none pr-12"
              disabled={isLoading}
            />
            <Button
              size="icon"
              className="absolute bottom-1.5 right-1.5 h-8 w-8"
              onClick={send}
              disabled={!input.trim() || isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
