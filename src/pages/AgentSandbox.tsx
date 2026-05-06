import { useParams, useNavigate } from "react-router-dom";
import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowLeft, Send, Loader2, Plus, Clock, Trash2, CheckCheck, Bug, Paperclip, Mic, Camera, AlertTriangle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { DebugBlock, type LogEntry } from "@/components/sandbox/DebugBlock";
import { AudioRecorder } from "@/components/sandbox/AudioRecorder";
import { AttachmentPreview, classifyFile, type AttachmentFile } from "@/components/sandbox/AttachmentPreview";
import { extractVideos, VideoPlayer, AudioPlayer, UserMediaPreview, type UserAttachmentMeta } from "@/components/sandbox/MediaBubble";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAgents } from "@/hooks/useAgents";
import { nexusDb } from "@/integrations/supabase/nexus-client";
import { getApiBase, callAPI } from "@/lib/api-client";
import {
  collectMarkdownImageSpans,
  stripBrokenMarkdownImageLines,
  stripMarkdownImageSpans,
  imageUrlsEquivalent,
  sanitizeAssistantContent,
  deduplicateRepeatedContent,
  stripChatwootHeader,
} from "@/lib/chatMessageDisplay";
import { normalizeSuiteGalleryMediaUrl } from "@/lib/suite-gallery-display";
import { toast } from "sonner";
import { format } from "date-fns";

type DebugEntry = { type: string; [key: string]: any };
type TokenUsageEntry = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  model?: string;
};
type TokenUsageData = {
  dispatcher?: TokenUsageEntry | null;
  conversational?: TokenUsageEntry | null;
  single?: TokenUsageEntry | null;
};
type Msg = {
  role: "user" | "assistant";
  content: string;
  timestamp?: Date;
  debug?: DebugEntry[];
  edgeLogs?: LogEntry[];
  tokenUsage?: TokenUsageData;
  userAttachments?: UserAttachmentMeta[];
  metadata?: { type?: string; video_url?: string };
  inventoryImages?: string[];
};
type Conversation = {
  id: string;
  channel: string;
  status: string;
  started_at: string;
  message_count: number;
};

const CHAT_URL = `${getApiBase()}/chat`;
const MSG_SPLIT = "<<MSG_SPLIT>>";

/** Mensagem legível para toast (PostgREST / Supabase devolvem objeto, não sempre Error). */
function formatCaughtError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof o.message === "string" && o.message.trim()) parts.push(o.message.trim());
    if (typeof o.details === "string" && o.details.trim()) parts.push(o.details.trim());
    if (typeof o.hint === "string" && o.hint.trim()) parts.push(o.hint.trim());
    if (typeof o.code === "string" && o.code.trim()) parts.unshift(`[${o.code}]`);
    if (parts.length > 0) return parts.join(" — ");
    try {
      return JSON.stringify(e);
    } catch {
      return "erro desconhecido";
    }
  }
  return String(e);
}

// Extract image URLs from message content
function extractImages(content: string): { text: string; images: string[] } {
  const base = stripBrokenMarkdownImageLines(content);
  const images: string[] = [];
  const mdSpans = collectMarkdownImageSpans(base);
  for (const sp of mdSpans) {
    if (sp.url && !images.includes(sp.url) && isValidImageUrl(sp.url)) images.push(sp.url);
  }
  // Só remover do texto os ![…](url) que entram na grelha. Se isValidImageUrl rejeitar, manter no
  // markdown para o ReactMarkdown tentar renderizar — antes apagávamos tudo e sumiam fotos na UI.
  const accepted = new Set(images);
  const spansToStrip = mdSpans.filter((sp) => sp.url && accepted.has(sp.url));
  let text = stripMarkdownImageSpans(base, spansToStrip);
  let match;
  const bareImgRegex = /(?<!\()(https?:\/\/[^\s"'<>]+\.(?:jpg|jpeg|png|gif|webp)[^\s"'<>]*)/gi;
  while ((match = bareImgRegex.exec(base)) !== null) {
    const url = match[1] || match[0];
    if (!images.includes(url) && isValidImageUrl(url)) images.push(url);
  }
  const photoUrlRegex = /https?:\/\/[^\s"'<>]+\/fotos\/[^\s"'<>]+/gi;
  while ((match = photoUrlRegex.exec(base)) !== null) {
    if (!images.includes(match[0]) && isValidImageUrl(match[0])) images.push(match[0]);
  }
  text = text.replace(/^.*?ENVIAR_FOTOS?_VEICULOS?.*$/gmi, "");
  // Remover URLs soltas do texto sem corromper URLs mais longas (prefixo comum no path).
  [...images].sort((a, b) => b.length - a.length).forEach((url) => {
    text = text.split(url).join("");
  });
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return { text, images };
}

// Validate that a URL looks like a real image URL (not a markdown artifact or broken link)
function isValidImageUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    if (!u.hostname || u.hostname.length < 3) return false;
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    return true;
  } catch {
    return false;
  }
}

// Convert File to base64 data URL
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
  const [showDebug, setShowDebug] = useState(false);
  const [pendingDebug, setPendingDebug] = useState<DebugEntry[] | null>(null);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** ID da conversa atual no servidor — atualizado assim que o SSE envia conversation_id (antes do [DONE]). */
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    conversationIdRef.current = null;
    setConversationId(null);
  }, [agentId]);

  const loadConversations = useCallback(async () => {
    if (!agentId) return;
    try {
      const { data, error } = await nexusDb.rpc("list_agent_conversations", {
        p_agent_id: agentId,
        p_limit: 50,
      });
      if (error) {
        console.error("[Sandbox] list_agent_conversations:", error);
        toast.error(`Não foi possível carregar o histórico de conversas: ${formatCaughtError(error)}`);
        return;
      }
      setConversations((data ?? []) as Conversation[]);
    } catch (e) {
      console.error("[Sandbox] erro ao carregar conversas:", e);
      toast.error(`Não foi possível carregar o histórico de conversas: ${formatCaughtError(e)}`);
    }
  }, [agentId]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Sanitize message content to remove leaked JSON dispatcher data and tool_code/assign_agent
  const sanitizeContent = (content: string): string => {
    if (!content) return content;
    // Remove lines that start with JSON-like patterns (dispatcher hints)
    let cleaned = content
      .replace(/^\s*\{["\s]*total[":].*$/gm, "")
      .replace(/^\s*\{["\s]*id[":].*$/gm, "")
      .replace(/^\s*\[?\{["\s]*id[":].*$/gm, "");
    // Remove tool_code / assign_agent leakage (ex.: tool_code print(json.dumps(...)))
    cleaned = cleaned
      .replace(/\*\*?tool_code[\s\S]*?\)\s*\)\*\*?/gim, "")
      .replace(/tool_code[\s\S]*?\)\s*\)(?=\s|$|\.|,|;)/gim, "")
      .replace(/\b(assign_agent|atribuir_agente|chatwoot_assign)\s*\(\s*[^)]*\)/gim, "")
      .replace(/\bprint\s*\(\s*(?:json\.dumps\s*)?\([^)]*assign_agent[^)]*\)\s*\)/gim, "");
    // If content is entirely JSON (starts with { or [), discard it
    const trimmed = cleaned.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try { JSON.parse(trimmed); return ""; } catch {}
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try { JSON.parse(trimmed); return ""; } catch {}
    }
    // Remove large JSON blocks embedded in text
    cleaned = cleaned.replace(/\{"total":\d+.*?"vehicles":\[.*?\]\}/gs, "");
    cleaned = cleaned.replace(/\{"id":"[a-f0-9-]+".*?\}/g, "");
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n").trim();
    return cleaned;
  };

  const loadConversation = async (convId: string) => {
    if (!agentId) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await nexusDb.rpc("load_conversation_messages", {
        p_agent_id: agentId,
        p_conversation_id: convId,
      });
      if (error) throw error;
      const rows = (data ?? []) as any[];
      setMessages(
        rows
          .map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.role === "assistant" ? sanitizeContent(m.content) : m.content,
            timestamp: new Date(m.created_at),
            metadata: m.metadata as { type?: string; video_url?: string } | undefined,
          }))
          .filter((m) => m.content.trim() !== "" || (m.metadata?.type === "welcome_video" && m.metadata?.video_url))
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
    conversationIdRef.current = null;
    setConversationId(null);
    setShowHistory(false);
  };

  const handleDeleteConversation = async () => {
    if (!conversationId || !agentId) {
      startNewConversation();
      return;
    }

    setIsDeletingConversation(true);
    try {
      const data = await callAPI<{ deleted_messages?: number; deleted_conversations?: number }>("/admin/clear-conversations", {
        body: { conversation_ids: [conversationId], agent_id: agentId },
      });

      toast.success(`Conversa excluída (${data?.deleted_messages ?? 0} mensagens removidas)`);
      startNewConversation();
      await loadConversations();
    } catch (e: any) {
      toast.error("Erro ao excluir conversa: " + (e?.message || "erro desconhecido"));
    } finally {
      setIsDeletingConversation(false);
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

  const handleAudioSend = async (blob: Blob, durationSec: number) => {
    setIsRecording(false);
    const dataUrl = await fileToDataUrl(new File([blob], "audio.webm", { type: blob.type }));
    const audioAtt: AttachmentFile = {
      file: new File([blob], "audio.webm", { type: blob.type }),
      type: "audio",
    };
    // Send immediately as a message
    await sendMessage("", [{ ...audioAtt, preview: undefined }], [{ type: "audio", dataUrl, fileName: "audio.webm" }]);
  };

  const sendMessage = async (
    text: string,
    atts: AttachmentFile[] = [],
    preBuiltMeta?: UserAttachmentMeta[]
  ) => {
    if ((!text && atts.length === 0) || isLoading || !agentId) return;

    // Build attachment metadata for display & API
    const userAttachmentsMeta: UserAttachmentMeta[] = preBuiltMeta || [];
    const apiAttachments: Array<{ file_type: string; data_url: string; file_size?: number }> = [];

    if (!preBuiltMeta) {
      for (const att of atts) {
        const dataUrl = await fileToDataUrl(att.file);
        userAttachmentsMeta.push({
          type: att.type,
          dataUrl,
          fileName: att.file.name,
        });
        apiAttachments.push({
          file_type: att.type === "video" ? "file" : att.type,
          data_url: dataUrl,
          file_size: att.file.size,
        });
      }
    } else {
      for (const meta of preBuiltMeta) {
        apiAttachments.push({
          file_type: meta.type === "video" ? "file" : meta.type,
          data_url: meta.dataUrl,
          file_size: 0,
        });
      }
    }

    const displayContent = text || (userAttachmentsMeta.length > 0
      ? userAttachmentsMeta.map((a) => `[${a.type === "image" ? "📷 Imagem" : a.type === "video" ? "🎬 Vídeo" : a.type === "audio" ? "🎤 Áudio" : "📄 " + a.fileName}]`).join(" ")
      : "");

    const userMsg: Msg = {
      role: "user",
      content: displayContent,
      timestamp: new Date(),
      userAttachments: userAttachmentsMeta.length > 0 ? userAttachmentsMeta : undefined,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setAttachments([]);
    setIsLoading(true);

    let debugData: DebugEntry[] | null = null;
    let edgeLogsData: LogEntry[] | null = null;
    let hasAssistantContent = false;
    const allMessages = [...messages, userMsg];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90000);

    try {
      const body: any = {
        agent_id: agentId,
        messages: allMessages.map((m) => ({ role: m.role, content: m.content })),
        conversation_id: conversationIdRef.current ?? conversationId,
      };
      if (apiAttachments.length > 0) {
        body.attachments = apiAttachments;
      }

      const { data: { session } } = await nexusDb.auth.getSession();
      const nexusToken = session?.access_token;

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || ""}`,
          ...(nexusToken ? { "x-nexus-auth": `Bearer ${nexusToken}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || err.detail || `Status ${resp.status}`);
      }

      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let streamAccum = "";

      const applyAccumulatedWithSplit = () => {
        while (streamAccum.includes(MSG_SPLIT)) {
          const idx = streamAccum.indexOf(MSG_SPLIT);
          const partBefore = streamAccum.slice(0, idx);
          streamAccum = streamAccum.slice(idx + MSG_SPLIT.length);
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const isAppendToLast = last?.role === "assistant";
            let out = prev;
            if (partBefore.trim()) {
              if (isAppendToLast) {
                out = prev.map((m, i) =>
                  i === prev.length - 1 ? { ...m, content: m.content + partBefore } : m
                );
              } else {
                out = [...prev, { role: "assistant" as const, content: partBefore, timestamp: new Date(), debug: debugData, edgeLogs: edgeLogsData }];
              }
            }
            if (streamAccum !== "") {
              out = [...out, { role: "assistant" as const, content: "", timestamp: new Date(), debug: debugData, edgeLogs: edgeLogsData }];
            }
            return out;
          });
        }
      };

      const updateStreamingMessage = () => {
        if (!streamAccum) return;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) =>
              i === prev.length - 1 ? { ...m, content: streamAccum } : m
            );
          }
          return [...prev, { role: "assistant" as const, content: streamAccum, timestamp: new Date(), debug: debugData, edgeLogs: edgeLogsData }];
        });
      };

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

            if (parsed.conversation_id) {
              conversationIdRef.current = parsed.conversation_id as string;
              setConversationId(parsed.conversation_id as string);
              continue;
            }

            if (parsed.metadata?.type === "welcome_video" && parsed.metadata?.video_url) {
              hasAssistantContent = true;
              const meta = { type: "welcome_video" as const, video_url: parsed.metadata.video_url };
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) =>
                    i === prev.length - 1 ? { ...m, metadata: meta } : m
                  );
                }
                return [...prev, { role: "assistant" as const, content: "", timestamp: new Date(), metadata: meta }];
              });
              continue;
            }

            if (parsed.error) {
              const errMsg = typeof parsed.error === "string" ? parsed.error : JSON.stringify(parsed.error);
              hasAssistantContent = true;
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `⚠️ Erro: ${errMsg}`, timestamp: new Date() },
              ]);
              toast.error("O agente retornou um erro. Verifique os logs.");
              continue;
            }

            if (parsed.debug) {
              debugData = parsed.debug;
              setPendingDebug(parsed.debug);
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
                  return prev.map((m, idx) =>
                    idx === lastIdx ? { ...m, debug: parsed.debug } : m
                  );
                }
                // Debug chegou antes do conteúdo; criar mensagem assistant para anexar
                return [...prev, { role: "assistant" as const, content: streamAccum, timestamp: new Date(), debug: parsed.debug }];
              });
              continue;
            }

            if (parsed.edge_logs) {
              edgeLogsData = parsed.edge_logs;
              continue;
            }

            if (parsed.token_usage) {
              setMessages((prev) => {
                const lastIdx = prev.length - 1;
                if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
                  return prev.map((m, idx) =>
                    idx === lastIdx ? { ...m, tokenUsage: parsed.token_usage } : m
                  );
                }
                return prev;
              });
              continue;
            }

            if (parsed.media_commands) {
              const photoIds: string[] = Array.isArray(parsed.media_commands.photo_inventory_ids)
                ? parsed.media_commands.photo_inventory_ids
                : [];
              if (photoIds.length > 0) {
                nexusDb
                  .from("inventory")
                  .select("id, photos, photo_url")
                  .in("id", photoIds)
                  .then(({ data }) => {
                    const urls: string[] = [];
                    for (const row of data ?? []) {
                      if (row.photos) {
                        try {
                          const parsed = typeof row.photos === "string" ? JSON.parse(row.photos) : row.photos;
                          if (Array.isArray(parsed)) urls.push(...(parsed as string[]).filter(Boolean));
                        } catch { /* ignore */ }
                      }
                      if (urls.length === 0 && row.photo_url) urls.push(row.photo_url);
                    }
                    if (urls.length > 0) {
                      setMessages((prev) => {
                        const lastIdx = prev.length - 1;
                        if (lastIdx >= 0 && prev[lastIdx].role === "assistant") {
                          return prev.map((m, idx) =>
                            idx === lastIdx ? { ...m, inventoryImages: urls } : m
                          );
                        }
                        return prev;
                      });
                    }
                  });
              }
              continue;
            }

            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              hasAssistantContent = true;
              streamAccum += content;
              applyAccumulatedWithSplit();
              updateStreamingMessage();
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (streamAccum.trim()) {
        updateStreamingMessage();
      }

      clearTimeout(timeoutId);

      if (!hasAssistantContent) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚠️ O servidor não retornou texto. Pode ter havido timeout ou falha no provedor de IA; tente novamente.", timestamp: new Date() },
        ]);
        toast.error("Nenhuma resposta do agente. Verifique o console (F12) para detalhes.");
      }

      loadConversations();
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error("Chat error:", e);

      const isAbort = e?.name === "AbortError";
      const isNetworkError =
        e?.message === "Failed to fetch" ||
        (e?.name === "TypeError" && /fetch|network|aborted/i.test(String(e?.message || "")));

      if (isAbort) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚠️ A resposta demorou muito e foi cancelada. Tente novamente ou simplifique a pergunta.", timestamp: new Date() },
        ]);
        toast.error("Tempo esgotado. Tente novamente.");
      } else if (isNetworkError) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "⚠️ Conexão interrompida ou servidor indisponível. Verifique sua rede e se o servidor está rodando; tente enviar novamente.", timestamp: new Date() },
        ]);
        toast.error("Erro de conexão. Tente novamente.");
      } else {
        toast.error(e.message || "Erro ao enviar mensagem");
        if (!hasAssistantContent) {
          setMessages((prev) => prev.slice(0, -1));
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const send = () => sendMessage(input.trim(), attachments);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const agentInitial = agent?.name?.charAt(0)?.toUpperCase() || "A";

  // Render a single message bubble
  const renderBubble = (msg: Msg, i: number) => {
    const isUser = msg.role === "user";
    const hasUserMedia = isUser && msg.userAttachments && msg.userAttachments.length > 0;

    // For assistant messages, extract images + videos
    let text = msg.content;
    let images: string[] = [];
    let videoUrls: string[] = [];

    if (!isUser) {
      const assistantRaw = sanitizeAssistantContent(
        deduplicateRepeatedContent(stripChatwootHeader(msg.content || ""))
      );
      const imgResult = extractImages(assistantRaw);
      text = imgResult.text;
      const seenNorm = new Set<string>();
      for (const u of imgResult.images) {
        const n = normalizeSuiteGalleryMediaUrl(u);
        if (!seenNorm.has(n)) {
          seenNorm.add(n);
          images.push(n);
        }
      }
      if (msg.inventoryImages && msg.inventoryImages.length > 0) {
        for (const u of msg.inventoryImages) {
          const n = normalizeSuiteGalleryMediaUrl(u);
          if (!seenNorm.has(n)) {
            seenNorm.add(n);
            images.push(n);
          }
        }
      }
      const vidResult = extractVideos(text);
      text = vidResult.text;
      videoUrls = vidResult.videoUrls;
    }

    // Detect audio transcription in user messages
    const isAudioTranscription = isUser && msg.content.includes("[Áudio do cliente");

    const time = msg.timestamp ? format(msg.timestamp, "HH:mm") : "";

    return (
      <div key={i}>
        {/* Debug block */}
        {!isUser && showDebug && (msg.debug?.length || msg.edgeLogs?.length || msg.tokenUsage) && (
          <div className="flex justify-start mb-1">
            <DebugBlock debug={msg.debug || []} edgeLogs={msg.edgeLogs} tokenUsage={msg.tokenUsage} />
          </div>
        )}
        <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-1`}>
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
            {/* User media attachments */}
            {hasUserMedia && (
              <div className="space-y-1 mb-1 -mx-1 -mt-0.5">
                {msg.userAttachments!.map((att, j) => (
                  <UserMediaPreview key={j} attachment={att} />
                ))}
              </div>
            )}

            {/* Vídeo institucional (welcome_video do Chat ao Vivo) */}
            {!isUser && msg.metadata?.type === "welcome_video" && msg.metadata?.video_url && (
              <div className="mb-1 -mx-1 -mt-0.5">
                <VideoPlayer src={normalizeSuiteGalleryMediaUrl(msg.metadata.video_url)} />
              </div>
            )}

            {/* Assistant videos */}
            {videoUrls.length > 0 && (
              <div className="space-y-1 mb-1 -mx-1 -mt-0.5">
                {videoUrls.map((url, j) => (
                  <VideoPlayer key={j} src={normalizeSuiteGalleryMediaUrl(url)} />
                ))}
              </div>
            )}

            {/* Assistant images - filter and validate */}
            {images.length > 0 && (
              <div
                className={`${
                  images.length > 1 ? "grid grid-cols-2 gap-1" : ""
                } mb-1 -mx-1 -mt-0.5 max-h-[min(70vh,28rem)] overflow-y-auto overscroll-contain`}
              >
                {images.map((url, imgIdx) => {
                  // If odd number of images, last one spans full width
                  const isLastOdd = images.length > 1 && images.length % 2 !== 0 && imgIdx === images.length - 1;
                  return (
                    <a
                      key={imgIdx}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`block overflow-hidden rounded-md ${isLastOdd ? "col-span-2" : ""}`}
                    >
                      <img
                        src={url}
                        alt="Foto"
                        loading="lazy"
                        className={`rounded-md w-full object-cover cursor-pointer hover:opacity-90 transition-opacity ${isLastOdd ? "max-h-48" : "max-h-64"}`}
                        onError={(e) => {
                          const el = e.target as HTMLImageElement;
                          const anchor = el.closest("a");
                          if (anchor) anchor.style.display = "none";
                        }}
                      />
                    </a>
                  );
                })}
              </div>
            )}

            {/* Text content (oculta apenas placeholder "[Vídeo institucional enviado]" do delivery) */}
            {text.trim() && text.trim() !== "[Vídeo institucional enviado]" && (
              !isUser ? (
                <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:my-0.5 [&>p]:leading-relaxed text-[13px]">
                  <ReactMarkdown
                    components={{
                      img: ({ src, alt }) => {
                        if (!src) return null;
                        const norm = normalizeSuiteGalleryMediaUrl(String(src));
                        if (images.some((u) => imageUrlsEquivalent(u, norm))) {
                          return null;
                        }
                        return (
                          <img
                            src={norm}
                            alt={typeof alt === "string" ? alt : ""}
                            loading="lazy"
                            className="max-h-48 rounded-md object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = "none";
                            }}
                          />
                        );
                      },
                    }}
                  >
                    {text}
                  </ReactMarkdown>
                </div>
              ) : isAudioTranscription ? (
                <div className="flex items-center gap-2">
                  <Mic className="h-4 w-4 text-primary-foreground/70 shrink-0" />
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed italic">{text}</p>
                </div>
              ) : !hasUserMedia ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
              ) : text !== msg.userAttachments?.map((a) => `[${a.type === "image" ? "📷 Imagem" : a.type === "video" ? "🎬 Vídeo" : a.type === "audio" ? "🎤 Áudio" : "📄 " + a.fileName}]`).join(" ") ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{text}</p>
              ) : null
            )}

            {/* Timestamp + read receipts */}
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
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Sidebar - Conversation History */}
      <div
        className={`border-r border-border bg-card transition-all duration-200 ${
          showHistory ? "w-72" : "w-0 overflow-hidden"
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversas</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={startNewConversation}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <ScrollArea className="h-[calc(100%-3rem)]">
          <div className="space-y-0">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`w-full text-left px-4 py-3 text-xs transition-colors hover:bg-accent border-b border-border/50 ${
                  conversationId === conv.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium shrink-0">
                    {agentInitial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center">
                      <span className="text-foreground text-sm truncate">{agent?.name || "Agent"}</span>
                      <span className="text-muted-foreground text-[10px]">
                        {format(new Date(conv.started_at), "HH:mm")}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <CheckCheck className="h-3 w-3 text-primary shrink-0" />
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
      <div className="flex flex-1 flex-col bg-background min-h-0">
        {/* Header */}
        <div className="flex items-center gap-3 bg-card border-b border-border px-4 py-2.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground md:hidden" onClick={() => messages.length > 0 ? setShowExitConfirm(true) : navigate("/agents")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${showHistory ? "text-primary" : "text-muted-foreground"} hover:text-foreground`}
            onClick={() => setShowHistory(!showHistory)}
          >
            <Clock className="h-4 w-4" />
          </Button>

          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground text-lg font-semibold shadow-md shadow-primary/20">
            {agentInitial}
          </div>

          <div className="flex-1 min-w-0">
            <h2 className="text-foreground text-base font-medium">{agent?.name ?? "Agent"}</h2>
            <p className="text-xs">
              {isLoading ? (
                <span className="text-primary animate-pulse">digitando...</span>
              ) : (
                <span className="text-emerald-500 dark:text-emerald-400">● online</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 ${showDebug ? "text-primary bg-primary/10" : "text-muted-foreground"} hover:text-foreground`}
              onClick={() => setShowDebug(!showDebug)}
              title={showDebug ? "Desativar debug (ocultar tools e logs)" : "Ativar debug (ver tools chamadas e argumentos)"}
            >
              <Bug className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={startNewConversation}>
              <Plus className="h-5 w-5" />
            </Button>
            {messages.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-foreground hover:text-destructive"
                onClick={handleDeleteConversation}
                disabled={isDeletingConversation}
                title={conversationId ? "Excluir conversa do histórico" : "Limpar conversa atual"}
              >
                {isDeletingConversation ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />}
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => messages.length > 0 ? setShowExitConfirm(true) : navigate("/agents")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Chat Messages */}
        <div
          className="flex-1 overflow-y-auto px-4 md:px-16 lg:px-24"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%239C92AC' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        >
          {loadingHistory && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {!loadingHistory && messages.length === 0 && (
            <div className="flex h-full items-center justify-center py-20">
              <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl px-6 py-4 text-center max-w-sm shadow-lg">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Send className="h-5 w-5 text-primary" />
                </div>
                <p className="text-muted-foreground text-sm">
                  Sandbox de teste. Envie uma mensagem para começar a conversa.
                </p>
              </div>
            </div>
          )}

          <div className="space-y-1.5 py-4">
            {messages.map((msg, i) => renderBubble(msg, i))}

            {showDebug && messages.some((m) => !m.role || m.role === "assistant") && !messages.some((m) => m.role === "assistant" && (m.debug?.length || m.edgeLogs?.length || m.tokenUsage)) && (
              <div className="flex justify-start mb-1">
                <div className="text-[10px] text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">
                  Debug ativado. O debug (modelo, tokens, tools) aparece abaixo de cada resposta do agente. Envie uma mensagem para ver.
                </div>
              </div>
            )}

            {isLoading && messages[messages.length - 1]?.role !== "assistant" && (
              <div className="flex justify-start mb-1">
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
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                className="hidden"
                onChange={handleFileSelect}
              />

              {/* Attachment button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                disabled={isLoading}
              >
                <Paperclip className="h-5 w-5" />
              </button>

              {/* Camera button (image capture on mobile) */}
              <button
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.capture = "environment";
                  input.onchange = (e) => {
                    const files = (e.target as HTMLInputElement).files;
                    if (files) {
                      const newAtts = Array.from(files).map(classifyFile);
                      setAttachments((prev) => [...prev, ...newAtts]);
                    }
                  };
                  input.click();
                }}
                className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 md:hidden"
                disabled={isLoading}
              >
                <Camera className="h-5 w-5" />
              </button>

              {/* Text input */}
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

              {/* Send or Mic button */}
              {input.trim() || attachments.length > 0 ? (
                <button
                  onClick={send}
                  disabled={isLoading}
                  className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 shadow-md shadow-primary/25"
                >
                  {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </button>
              ) : (
                <button
                  onClick={() => setIsRecording(true)}
                  disabled={isLoading}
                  className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
                >
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da conversa?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem uma conversa em andamento. Deseja realmente sair? A conversa ficará salva no histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => navigate("/agents")}>Sair</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
