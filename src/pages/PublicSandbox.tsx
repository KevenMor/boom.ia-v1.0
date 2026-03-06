import { useParams } from "react-router-dom";
import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Lock, Mic, Paperclip, Camera, CheckCheck } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { AudioRecorder } from "@/components/sandbox/AudioRecorder";
import { AttachmentPreview, classifyFile, type AttachmentFile } from "@/components/sandbox/AttachmentPreview";
import { extractVideos, VideoPlayer, UserMediaPreview, type UserAttachmentMeta } from "@/components/sandbox/MediaBubble";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { format } from "date-fns";

type Msg = {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  userAttachments?: UserAttachmentMeta[];
};

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-agent`;
const MSG_SPLIT = "<<MSG_SPLIT>>";

function extractImages(content: string): { text: string; images: string[] } {
  const images: string[] = [];
  const mdImgRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/gi;
  let match;
  while ((match = mdImgRegex.exec(content)) !== null) {
    const url = match[1];
    if (url && !images.includes(url)) images.push(url);
  }
  const bareImgRegex = /(?<!\()(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)[^\s"'<>]*)/gi;
  while ((match = bareImgRegex.exec(content)) !== null) {
    const url = match[1] || match[0];
    if (!images.includes(url)) images.push(url);
  }
  let text = content;
  text = text.replace(/!\[.*?\]\(https?:\/\/[^\s)]+\)/gi, "");
  images.forEach((url) => { text = text.split(url).join(""); });
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return { text, images };
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function sanitizeContent(content: string): string {
  if (!content) return content;
  let cleaned = content
    .replace(/^\s*\{["\s]*total[":].*$/gm, "")
    .replace(/^\s*\{["\s]*id[":].*$/gm, "")
    .replace(/^\s*\[?\{["\s]*id[":].*$/gm, "");
  const trimmed = cleaned.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try { JSON.parse(trimmed); return ""; } catch {}
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try { JSON.parse(trimmed); return ""; } catch {}
  }
  cleaned = cleaned.replace(/\{"total":\d+.*?"vehicles":\[.*?\]\}/gs, "");
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
  return cleaned;
}

interface AgentPublicInfo {
  id: string;
  name: string;
  avatar_url: string | null;
  config: Record<string, any>;
  tenants?: { name: string; slug: string } | null;
}

export default function PublicSandbox() {
  const { agentId } = useParams<{ agentId: string }>();
  const [agent, setAgent] = useState<AgentPublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load agent public info
  useEffect(() => {
    if (!agentId) return;
    (async () => {
      try {
        const { data, error } = await nexusDb
          .from("agents")
          .select("id, name, avatar_url, config, tenants(name, slug)")
          .eq("id", agentId)
          .single();
        if (error) throw error;
        setAgent(data as unknown as AgentPublicInfo);
        // If no password configured, skip gate
        if (!data?.config?.sandbox_password) {
          setAuthenticated(true);
        }
      } catch {
        setAgent(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [agentId]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === agent?.config?.sandbox_password) {
      setAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newAtts = Array.from(files).map(classifyFile);
    setAttachments((prev) => [...prev, ...newAtts]);
    e.target.value = "";
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const att = prev[idx];
      if (att.preview) URL.revokeObjectURL(att.preview);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const handleAudioSend = async (blob: Blob) => {
    setIsRecording(false);
    const dataUrl = await fileToDataUrl(new File([blob], "audio.webm", { type: blob.type }));
    const audioAtt: AttachmentFile = {
      file: new File([blob], "audio.webm", { type: blob.type }),
      type: "audio",
    };
    await sendMessage("", [{ ...audioAtt, preview: undefined }], [{ type: "audio", dataUrl, fileName: "audio.webm" }]);
  };

  const sendMessage = async (
    text: string,
    atts: AttachmentFile[] = [],
    preBuiltMeta?: UserAttachmentMeta[]
  ) => {
    if ((!text && atts.length === 0) || isLoading || !agentId) return;

    const userAttachmentsMeta: UserAttachmentMeta[] = preBuiltMeta || [];
    const apiAttachments: Array<{ file_type: string; data_url: string; file_size?: number }> = [];

    if (!preBuiltMeta) {
      for (const att of atts) {
        const dataUrl = await fileToDataUrl(att.file);
        userAttachmentsMeta.push({ type: att.type, dataUrl, fileName: att.file.name });
        apiAttachments.push({ file_type: att.type === "video" ? "file" : att.type, data_url: dataUrl, file_size: att.file.size });
      }
    } else {
      for (const meta of preBuiltMeta) {
        apiAttachments.push({ file_type: meta.type === "video" ? "file" : meta.type, data_url: meta.dataUrl, file_size: 0 });
      }
    }

    const displayContent = text || (userAttachmentsMeta.length > 0
      ? userAttachmentsMeta.map((a) => `[${a.type === "image" ? "📷 Imagem" : a.type === "audio" ? "🎤 Áudio" : "📄 " + a.fileName}]`).join(" ")
      : "");

    const userMsg: Msg = { role: "user", content: displayContent, timestamp: new Date(), userAttachments: userAttachmentsMeta.length > 0 ? userAttachmentsMeta : undefined };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    let hasAssistantContent = false;
    const allMessages = [...messages, userMsg];

    try {
      const body: any = {
        agent_id: agentId,
        messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        conversation_id: conversationId,
      };
      if (apiAttachments.length > 0) body.attachments = apiAttachments;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `Status ${resp.status}`);
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
            if (parsed.debug || parsed.edge_logs) continue; // skip debug in public
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              hasAssistantContent = true;
              if (content.includes(MSG_SPLIT)) {
                const segments = content.split(MSG_SPLIT);
                for (let si = 0; si < segments.length; si++) {
                  if (si > 0) {
                    setMessages((prev) => [...prev, { role: "assistant", content: segments[si] || "", timestamp: new Date() }]);
                  } else if (segments[si]) {
                    setMessages((prev) => {
                      const last = prev[prev.length - 1];
                      if (last?.role === "assistant") return prev.map((m, idx) => idx === prev.length - 1 ? { ...m, content: m.content + segments[si] } : m);
                      return [...prev, { role: "assistant", content: segments[si], timestamp: new Date() }];
                    });
                  }
                }
              } else {
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.role === "assistant") return prev.map((m, idx) => idx === prev.length - 1 ? { ...m, content: m.content + content } : m);
                  return [...prev, { role: "assistant", content, timestamp: new Date() }];
                });
              }
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }
    } catch (e: any) {
      console.error("Chat error:", e);
      if (!hasAssistantContent) setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  const send = () => sendMessage(input.trim(), attachments);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ─── Loading ─────────────────
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ─── Agent not found ─────────
  if (!agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto">
            <Lock className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">Agente não encontrado ou link inválido.</p>
        </div>
      </div>
    );
  }

  // ─── Password Gate ───────────
  if (!authenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          {agent.avatar_url ? (
            <img src={agent.avatar_url} alt={agent.name} className="h-20 w-20 rounded-full object-cover mx-auto shadow-lg" />
          ) : (
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <span className="text-2xl font-bold text-primary">{agent.name.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div>
            <h1 className="text-xl font-semibold text-foreground">{agent.name}</h1>
            {agent.tenants?.name && (
              <p className="text-sm text-muted-foreground mt-1">{agent.tenants.name}</p>
            )}
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="password"
                placeholder="Digite a senha de acesso"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                className={`w-full rounded-xl border ${passwordError ? "border-destructive" : "border-border"} bg-card px-10 py-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 transition-all`}
                autoFocus
              />
            </div>
            {passwordError && <p className="text-xs text-destructive">Senha incorreta</p>}
            <button
              type="submit"
              className="w-full rounded-xl bg-primary py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Acessar Demo
            </button>
          </form>
          <p className="text-[11px] text-muted-foreground">
            Powered by <span className="font-semibold">Boom IA</span>
          </p>
        </div>
      </div>
    );
  }

  // ─── Chat UI ─────────────────
  const agentInitial = agent.name.charAt(0).toUpperCase();

  const renderBubble = (msg: Msg, i: number) => {
    const isUser = msg.role === "user";
    const hasUserMedia = isUser && msg.userAttachments && msg.userAttachments.length > 0;
    let text = msg.content;
    let images: string[] = [];
    let videoUrls: string[] = [];

    if (!isUser) {
      text = sanitizeContent(text);
      const imgResult = extractImages(text);
      text = imgResult.text;
      images = imgResult.images;
      const vidResult = extractVideos(text);
      text = vidResult.text;
      videoUrls = vidResult.videoUrls;
    }

    const time = msg.timestamp ? format(msg.timestamp, "HH:mm") : "";

    return (
      <div key={i}>
        <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1.5`}>
          {!isUser && (
            <div className="h-8 w-8 rounded-full shrink-0 mr-2 mt-1 overflow-hidden">
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="h-8 w-8 object-cover" />
              ) : (
                <div className="h-8 w-8 bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{agentInitial}</div>
              )}
            </div>
          )}
          <div
            className={`relative max-w-[85%] md:max-w-[65%] rounded-xl px-3 py-1.5 shadow-sm ${
              isUser
                ? "bg-primary text-primary-foreground shadow-primary/20"
                : "bg-card border border-border text-foreground"
            }`}
            style={{
              borderTopLeftRadius: !isUser ? 0 : undefined,
              borderTopRightRadius: isUser ? 0 : undefined,
            }}
          >
            {hasUserMedia && (
              <div className="space-y-1 mb-1 -mx-1 -mt-0.5">
                {msg.userAttachments!.map((att, j) => (
                  <UserMediaPreview key={j} attachment={att} />
                ))}
              </div>
            )}
            {videoUrls.length > 0 && (
              <div className="space-y-1 mb-1 -mx-1 -mt-0.5">
                {videoUrls.map((url, j) => <VideoPlayer key={j} src={url} />)}
              </div>
            )}
            {images.length > 0 && (
              <div className={`${images.length > 1 ? "grid grid-cols-2 gap-1" : ""} mb-1 -mx-1 -mt-0.5`}>
                {images.map((url, imgIdx) => (
                  <a key={imgIdx} href={url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-md">
                    <img src={url} alt="" loading="lazy" className="rounded-md w-full object-cover max-h-64 cursor-pointer hover:opacity-90 transition-opacity"
                      onError={(e) => { (e.target as HTMLImageElement).closest("a")!.style.display = "none"; }}
                    />
                  </a>
                ))}
              </div>
            )}
            {text.trim() && (
              !isUser ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-0.5 [&>p]:leading-relaxed text-[13px]">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              ) : !hasUserMedia ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
              ) : null
            )}
            <div className="flex items-center gap-1 justify-end -mb-0.5 mt-0.5">
              <span className={`text-[10px] leading-none ${isUser ? "text-primary-foreground/60" : "text-muted-foreground"}`}>{time}</span>
              {isUser && <CheckCheck className="h-3 w-3 text-primary-foreground/70" />}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 bg-card border-b border-border px-4 py-3">
        {agent.avatar_url ? (
          <img src={agent.avatar_url} alt={agent.name} className="h-10 w-10 rounded-full object-cover shadow-md" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-semibold text-primary shadow-md">
            {agentInitial}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-foreground text-base font-medium">{agent.name}</h2>
          <p className="text-xs">
            {isLoading ? (
              <span className="text-primary animate-pulse">digitando...</span>
            ) : (
              <span className="text-emerald-500 dark:text-emerald-400">● online</span>
            )}
          </p>
        </div>
        {agent.tenants?.name && (
          <span className="text-[10px] text-muted-foreground hidden sm:inline">{agent.tenants.name}</span>
        )}
      </div>

      {/* Chat Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 md:px-16 lg:px-24"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      >
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center py-20">
            <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl px-6 py-4 text-center max-w-sm shadow-lg">
              {agent.avatar_url ? (
                <img src={agent.avatar_url} alt={agent.name} className="h-14 w-14 rounded-full object-cover mx-auto mb-3 shadow-md" />
              ) : (
                <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Send className="h-6 w-6 text-primary" />
                </div>
              )}
              <p className="text-sm font-medium text-foreground mb-1">Olá! 👋</p>
              <p className="text-muted-foreground text-xs">
                Envie uma mensagem para conversar com <strong>{agent.name}</strong>
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5 py-4">
          {messages.map((msg, i) => renderBubble(msg, i))}
          {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start mb-1">
              <div className="h-8 w-8 rounded-full shrink-0 mr-2 mt-1 overflow-hidden">
                {agent.avatar_url ? (
                  <img src={agent.avatar_url} alt={agent.name} className="h-8 w-8 object-cover" />
                ) : (
                  <div className="h-8 w-8 bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{agentInitial}</div>
                )}
              </div>
              <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-sm" style={{ borderTopLeftRadius: 0 }}>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-primary/70 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-primary/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Attachment Preview */}
      <AttachmentPreview attachments={attachments} onRemove={removeAttachment} />

      {/* Input Bar */}
      <div className="bg-card border-t border-border px-3 py-2.5 flex items-end gap-2">
        {isRecording ? (
          <div className="flex-1">
            <AudioRecorder
              isRecording={isRecording}
              onStartRecording={() => setIsRecording(true)}
              onSend={handleAudioSend}
              onCancel={() => setIsRecording(false)}
            />
          </div>
        ) : (
          <>
            <input ref={fileInputRef} type="file" multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx" className="hidden" onChange={handleFileSelect} />
            <button onClick={() => fileInputRef.current?.click()} className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0" disabled={isLoading}>
              <Paperclip className="h-5 w-5" />
            </button>
            <button
              onClick={() => {
                const inp = document.createElement("input");
                inp.type = "file"; inp.accept = "image/*"; inp.capture = "environment";
                inp.onchange = (e) => { const files = (e.target as HTMLInputElement).files; if (files) setAttachments((prev) => [...prev, ...Array.from(files).map(classifyFile)]); };
                inp.click();
              }}
              className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 md:hidden"
              disabled={isLoading}
            >
              <Camera className="h-5 w-5" />
            </button>
            <div className="flex-1 flex items-end bg-muted/50 border border-border rounded-2xl px-4 py-1 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <input
                ref={inputRef}
                type="text"
                placeholder="Mensagem"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 bg-transparent text-foreground text-sm py-2 outline-none placeholder:text-muted-foreground"
                disabled={isLoading}
              />
            </div>
            {input.trim() || attachments.length > 0 ? (
              <button onClick={send} disabled={isLoading} className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 shrink-0 shadow-md shadow-primary/25">
                {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            ) : (
              <button onClick={() => setIsRecording(true)} disabled={isLoading} className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0">
                <Mic className="h-5 w-5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer branding */}
      <div className="bg-card border-t border-border/50 py-1.5 text-center">
        <p className="text-[10px] text-muted-foreground">
          Powered by <span className="font-semibold">Boom IA</span>
        </p>
      </div>
    </div>
  );
}
