import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Loader2, Plus, Clock, MessageSquare, Trash2, Phone, Video, MoreVertical, Smile, Paperclip, Mic, Check, CheckCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgents } from "@/hooks/useAgents";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { toast } from "sonner";
import { format } from "date-fns";

type Msg = { role: "user" | "assistant"; content: string; timestamp?: Date };
type Conversation = {
  id: string;
  channel: string;
  status: string;
  started_at: string;
  message_count: number;
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-agent`;
const MSG_SPLIT = "<<MSG_SPLIT>>";

// Extract image URLs from message content
function extractImages(content: string): { text: string; images: string[] } {
  const images: string[] = [];
  
  // Match markdown image syntax ![...](url)
  const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
  let match;
  while ((match = mdImgRegex.exec(content)) !== null) {
    if (match[1] && !images.includes(match[1])) images.push(match[1]);
  }

  // Match bare image URLs
  const bareImgRegex = /(?<!\()(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)[^\s"'<>]*)/gi;
  while ((match = bareImgRegex.exec(content)) !== null) {
    if (!images.includes(match[1] || match[0])) images.push(match[1] || match[0]);
  }

  // Also detect photo_url patterns from tool output
  const photoUrlRegex = /https?:\/\/[^\s"'<>]+\/fotos\/[^\s"'<>]+/gi;
  while ((match = photoUrlRegex.exec(content)) !== null) {
    if (!images.includes(match[0])) images.push(match[0]);
  }

  // Clean text: remove image markdown, bare URLs already captured, and tool artifacts
  let text = content;
  // Remove markdown images
  text = text.replace(/!\[.*?\]\(https?:\/\/[^\s)]+\)/gi, '');
  // Remove tool artifact lines like "ENVIAR_FOTOS_VEICULO: ..."
  text = text.replace(/^.*?ENVIAR_FOTOS?_VEICULOS?.*$/gmi, '');
  // Remove orphan image URLs
  images.forEach(url => {
    text = text.split(url).join('');
  });
  text = text.replace(/\n{3,}/g, '\n\n').trim();

  return { text, images };
}

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = useCallback(async () => {
    if (!agentId) return;
    try {
      const { data, error } = await nexusDb.rpc("list_agent_conversations", {
        p_agent_id: agentId,
        p_limit: 50,
      });
      if (!error && data) setConversations(data as Conversation[]);
    } catch {}
  }, [agentId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

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
        (data as any[]).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.created_at),
        }))
      );
      setConversationId(convId);
      setShowHistory(false);
    } catch {
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

    const userMsg: Msg = { role: "user", content: text, timestamp: new Date() };
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

            if (parsed.conversation_id && !conversationId) {
              setConversationId(parsed.conversation_id);
              continue;
            }

            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              // Check for split marker
              if (content.includes(MSG_SPLIT)) {
                // The chunk may contain text + marker + text
                const segments = content.split(MSG_SPLIT);
                for (let si = 0; si < segments.length; si++) {
                  if (si > 0) {
                    // Start a new assistant bubble
                    assistantSoFar = segments[si];
                    setMessages((prev) => [
                      ...prev,
                      { role: "assistant", content: assistantSoFar, timestamp: new Date() },
                    ]);
                  } else {
                    assistantSoFar += segments[si];
                    setMessages((prev) => {
                      const last = prev[prev.length - 1];
                      if (last?.role === "assistant") {
                        return prev.map((m, idx) =>
                          idx === prev.length - 1 ? { ...m, content: assistantSoFar } : m
                        );
                      }
                      return [...prev, { role: "assistant", content: assistantSoFar, timestamp: new Date() }];
                    });
                  }
                }
              } else {
                assistantSoFar += content;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") {
                    return prev.map((m, idx) =>
                      idx === prev.length - 1 ? { ...m, content: assistantSoFar } : m
                    );
                  }
                  return [...prev, { role: "assistant", content: assistantSoFar, timestamp: new Date() }];
                });
              }
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

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

  const agentInitial = agent?.name?.charAt(0)?.toUpperCase() || "A";

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Sidebar - Conversation History */}
      <div
        className={`border-r border-border bg-[#111b21] transition-all duration-200 ${
          showHistory ? "w-72" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-[#2a3942]">
          <span className="text-xs font-medium text-[#8696a0]">Conversas</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-[#8696a0] hover:text-white" onClick={startNewConversation}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100%-3rem)]">
          <div className="space-y-0">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left px-4 py-3 text-xs transition-colors hover:bg-[#2a3942] border-b border-[#2a3942]/50 ${
                  conversationId === conv.id ? "bg-[#2a3942]" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center text-white text-sm font-medium shrink-0">
                    {agentInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-white text-sm truncate">{agent?.name || "Agent"}</span>
                      <span className="text-[#8696a0] text-[10px]">
                        {format(new Date(conv.started_at), "HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[#8696a0]">
                      <CheckCheck className="h-3 w-3 text-[#53bdeb] shrink-0" />
                      <span className="truncate">{conv.message_count} mensagens</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col bg-[#0b141a]">
        {/* WhatsApp-style Header */}
        <div className="flex items-center gap-3 bg-[#202c33] px-4 py-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-[#8696a0] hover:text-white md:hidden" onClick={() => navigate("/agents")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 text-[#8696a0] hover:text-white ${showHistory ? "text-[#00a884]" : ""}`}
            onClick={() => setShowHistory(!showHistory)}
          >
            <Clock className="h-4 w-4" />
          </Button>
          
          {/* Avatar */}
          <div className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center text-white text-lg font-medium cursor-pointer">
            {agentInitial}
          </div>
          
          <div className="flex-1 min-w-0">
            <h2 className="text-[#e9edef] text-base font-normal">{agent?.name ?? "Agent"}</h2>
            <p className="text-[#8696a0] text-xs">
              {isLoading ? "digitando..." : "online"}
            </p>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9 text-[#8696a0] hover:text-white" onClick={startNewConversation}>
              <Plus className="h-5 w-5" />
            </Button>
            {messages.length > 0 && (
              <Button variant="ghost" size="icon" className="h-9 w-9 text-[#8696a0] hover:text-white" onClick={() => setMessages([])}>
                <Trash2 className="h-5 w-5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 text-[#8696a0] hover:text-white" onClick={() => navigate("/agents")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Chat Messages - WhatsApp wallpaper style */}
        <div 
          className="flex-1 overflow-y-auto px-4 md:px-16 lg:px-24"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cg fill-opacity='0.03'%3E%3Cpath fill='%23ffffff' d='M20 20h10v10H20zM50 10h10v10H50zM80 30h10v10H80zM110 20h10v10h-10zM140 10h10v10h-10zM170 30h10v10h-10zM30 60h10v10H30zM60 50h10v10H60zM90 70h10v10H90zM120 60h10v10h-10zM150 50h10v10h-10zM180 70h10v10h-10zM10 100h10v10H10zM40 90h10v10H40zM70 110h10v10H70zM100 100h10v10h-10zM130 90h10v10h-10zM160 110h10v10h-10zM20 140h10v10H20zM50 130h10v10H50zM80 150h10v10H80zM110 140h10v10h-10zM140 130h10v10h-10zM170 150h10v10h-10zM30 180h10v10H30zM60 170h10v10H60zM90 190h10v10H90zM120 180h10v10h-10zM150 170h10v10h-10zM180 190h10v10h-10z'/%3E%3C/g%3E%3C/svg%3E")`,
            backgroundColor: "#0b141a",
          }}
        >
          {loadingHistory && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-[#8696a0]" />
            </div>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="flex h-full items-center justify-center py-20">
              <div className="bg-[#182229] rounded-lg px-4 py-2 text-center max-w-sm">
                <p className="text-[#8696a0] text-xs">
                  🔒 As mensagens neste sandbox são para teste. Envie uma mensagem para começar.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1 py-4">
            {messages.map((msg, i) => {
              const { text, images } = msg.role === "assistant" 
                ? extractImages(msg.content)
                : { text: msg.content, images: [] };
              const time = msg.timestamp ? format(msg.timestamp, "HH:mm") : "";

              return (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} mb-1`}>
                  <div
                    className={`relative max-w-[85%] md:max-w-[65%] rounded-lg px-3 py-1.5 shadow-sm ${
                      msg.role === "user"
                        ? "bg-[#005c4b] text-[#e9edef]"
                        : "bg-[#202c33] text-[#e9edef]"
                    }`}
                    style={{
                      borderTopLeftRadius: msg.role === "assistant" ? 0 : undefined,
                      borderTopRightRadius: msg.role === "user" ? 0 : undefined,
                    }}
                  >
                    {/* Images */}
                    {images.length > 0 && (
                      <div className={`${images.length > 1 ? 'grid grid-cols-2 gap-1' : ''} mb-1 -mx-1 -mt-0.5`}>
                        {images.map((url, imgIdx) => (
                          <a key={imgIdx} href={url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={url}
                              alt="Foto do veículo"
                              className="rounded-md w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Text content */}
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm prose-invert max-w-none [&>p]:my-0.5 [&>p]:leading-relaxed text-[13px]">
                        <ReactMarkdown>{text}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
                    )}

                    {/* Timestamp + read receipts */}
                    <div className={`flex items-center gap-1 justify-end -mb-0.5 mt-0.5`}>
                      <span className="text-[10px] text-[#8696a0] leading-none">{time}</span>
                      {msg.role === "user" && (
                        <CheckCheck className="h-3 w-3 text-[#53bdeb]" />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            
            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start mb-1">
                <div className="bg-[#202c33] rounded-lg px-4 py-2.5 shadow-sm" style={{ borderTopLeftRadius: 0 }}>
                  <div className="flex items-center gap-1">
                    <span className="w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-2 h-2 bg-[#8696a0] rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* WhatsApp-style Input */}
        <div className="bg-[#202c33] px-3 py-2 flex items-end gap-2">
          <div className="flex-1 flex items-end bg-[#2a3942] rounded-3xl px-4 py-1">
            <input
              ref={inputRef}
              type="text"
              placeholder="Mensagem"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 bg-transparent text-[#e9edef] text-sm py-2 outline-none placeholder:text-[#8696a0]"
              disabled={isLoading}
            />
          </div>
          <button
            onClick={send}
            disabled={!input.trim() || isLoading}
            className="h-10 w-10 rounded-full bg-[#00a884] flex items-center justify-center text-white hover:bg-[#06cf9c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
