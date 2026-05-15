import { useEffect, useMemo, useState, type HTMLAttributes } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Mic, CheckCheck, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { DebugBlock } from "@/components/sandbox/DebugBlock";
import { cn } from "@/lib/utils";
import {
  stripChatwootHeader,
  stripUserNamePrefix,
  sanitizeAssistantContent,
  deduplicateRepeatedContent,
  extractImages,
  imageUrlsEquivalent,
  parseAudioTranscription,
  shouldShowChatMessage,
  dedupeAndSortConversationMessages,
} from "@/lib/chatMessageDisplay";
import { VideoPlayer, AudioPlayer, extractVideos } from "@/components/sandbox/MediaBubble";
import { nexusDb } from "@/integrations/supabase/nexus-client";

export type ConversationMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  model?: string | null;
  metadata?: {
    debug?: unknown[];
    token_usage?: Record<string, unknown>;
    type?: string;
    video_url?: string;
    sender_name?: string;
    attachments?: Array<{ file_type?: string; data_url?: string }>;
    photos_sent?: Array<{ id?: string; name?: string }>;
  } | null;
};

export interface ConversationMessagesViewProps {
  messages: ConversationMessageRow[] | undefined | null;
  isLoading?: boolean;
  /** Avatar do contato (primeira bolha do usuário) */
  contactAvatarUrl?: string | null;
  contactInitials: string;
  /** Nome do agente IA que responde (exibido nas mensagens do assistente) */
  agentName?: string | null;
  /** Avatar URL do agente IA */
  agentAvatarUrl?: string | null;
  showDebug?: boolean;
  className?: string;
  /** Estilo ChatApp: bolhas com gradiente e bordas arredondadas; boom-live = painel Stitch (roxo/branco). */
  variant?: "default" | "chat-app" | "boom-live";
  /** Busca dentro do texto das mensagens (destaque e rolagem à ocorrência ativa). */
  messageSearchQuery?: string;
  /** ID da mensagem destacada na navegação por busca. */
  activeSearchMessageId?: string | null;
}

function getAgentInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "IA";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

const CONTACT_AVATAR_COLORS = ["#019FA2", "#0d9488", "#0ea5e9", "#64748b", "#14b8a6", "#475569"];

function getContactAvatarColor(initials: string): string {
  let h = 0;
  for (let i = 0; i < (initials || "").length; i++) h = (h << 5) - h + initials.charCodeAt(i);
  return CONTACT_AVATAR_COLORS[Math.abs(h) % CONTACT_AVATAR_COLORS.length];
}

export function ConversationMessagesView({
  messages,
  isLoading,
  contactAvatarUrl,
  contactInitials,
  agentName,
  agentAvatarUrl,
  showDebug = false,
  className,
  variant = "default",
  messageSearchQuery = "",
  activeSearchMessageId = null,
}: ConversationMessagesViewProps) {
  const isChatApp = variant === "chat-app";
  const isBoomLive = variant === "boom-live";
  const [photoUrlsByInventoryId, setPhotoUrlsByInventoryId] = useState<Record<string, string[]>>({});
  const normalizedMessages = useMemo(
    () => dedupeAndSortConversationMessages(messages ?? []),
    [messages]
  );

  const visibleMessages = useMemo(
    () => normalizedMessages.filter((m) => shouldShowChatMessage(m, showDebug)),
    [normalizedMessages, showDebug]
  );

  const groupedMessages = useMemo(() => {
    return visibleMessages.reduce((groups: Record<string, ConversationMessageRow[]>, msg) => {
      const date = format(new Date(msg.created_at), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
      if (!groups[date]) groups[date] = [];
      groups[date].push(msg);
      return groups;
    }, {} as Record<string, ConversationMessageRow[]>);
  }, [visibleMessages]);

  useEffect(() => {
    const ids = new Set<string>();
    for (const msg of visibleMessages) {
      const photosSent = msg.metadata?.photos_sent ?? [];
      for (const item of photosSent) {
        const id = (item?.id || "").trim();
        if (id) ids.add(id);
      }
    }
    const missingIds = Array.from(ids).filter((id) => !photoUrlsByInventoryId[id]);
    if (missingIds.length === 0) return;

    let cancelled = false;
    nexusDb
      .from("inventory")
      .select("id, photos, photo_url")
      .in("id", missingIds)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const next: Record<string, string[]> = {};
        for (const row of data as Array<{ id: string; photos?: unknown; photo_url?: string | null }>) {
          const urls: string[] = [];
          if (row.photos) {
            try {
              const parsed = typeof row.photos === "string" ? JSON.parse(row.photos) : row.photos;
              if (Array.isArray(parsed)) {
                urls.push(...parsed.map((u) => String(u || "").trim()).filter(Boolean));
              }
            } catch {
              // ignore malformed photos payload
            }
          }
          if (urls.length === 0 && row.photo_url) urls.push(String(row.photo_url).trim());
          if (urls.length > 0) next[row.id] = urls;
        }
        if (Object.keys(next).length > 0) {
          setPhotoUrlsByInventoryId((prev) => ({ ...prev, ...next }));
        }
      })
      .catch(() => {
        // silently ignore media lookup errors
      });

    return () => {
      cancelled = true;
    };
  }, [visibleMessages, photoUrlsByInventoryId]);

  const searchLower = messageSearchQuery.trim().toLowerCase();

  function searchMessageAnchor(msg: ConversationMessageRow, layoutClass: string): HTMLAttributes<HTMLDivElement> {
    const matches = Boolean(searchLower && (msg.content || "").toLowerCase().includes(searchLower));
    const active = Boolean(matches && activeSearchMessageId === msg.id);
    return {
      "data-conversation-message-id": msg.id,
      className: cn(
        layoutClass,
        "scroll-mt-24 rounded-xl transition-[box-shadow,ring-color] duration-200",
        matches &&
          !active &&
          "ring-2 ring-amber-400/65 ring-offset-2 ring-offset-transparent dark:ring-amber-500/50",
        active &&
          "z-[1] ring-2 ring-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.2)] dark:shadow-[0_0_0_4px_rgba(245,158,11,0.14)]"
      ),
    };
  }

  useEffect(() => {
    const q = messageSearchQuery.trim();
    if (!q || !activeSearchMessageId) return;
    const id = activeSearchMessageId;
    const t = window.setTimeout(() => {
      const safe =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape(id)
          : id.replace(/"/g, '\\"');
      const el = document.querySelector<HTMLElement>(`[data-conversation-message-id="${safe}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 72);
    return () => window.clearTimeout(t);
  }, [messageSearchQuery, activeSearchMessageId]);

  if (isLoading) {
    return (
      <div className={cn("touch-pan-y space-y-3 px-3 py-4 sm:px-4", className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className={cn("flex", i % 2 === 0 ? "justify-start" : "justify-end")}>
            <div className="h-12 w-2/3 rounded-2xl bg-muted/50 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("touch-pan-y space-y-6 px-3 py-4 sm:px-4", className)}>
      {Object.entries(groupedMessages).map(([date, msgs]) => (
        <div key={date}>
          {isBoomLive ? (
            <div className="mb-4 flex justify-center">
              <span className="rounded-full border border-slate-200/60 bg-white px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 shadow-sm">
                {date}
              </span>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {date}
              </span>
              <Separator className="flex-1" />
            </div>
          )}

          <div className="space-y-3">
            {msgs.map((msg) => {
              const isUser = msg.role === "user";
              const isSystem = msg.role === "system" || msg.role === "tool";
              const audioInfo = isUser
                ? parseAudioTranscription(msg.content || "")
                : { isAudio: false, transcription: "", remainingText: msg.content || "" };
              const contentForExtraction = isUser
                ? stripUserNamePrefix(audioInfo.remainingText)
                : sanitizeAssistantContent(deduplicateRepeatedContent(stripChatwootHeader(msg.content || "")));
              const { text, images } = extractImages(contentForExtraction);

              if (isSystem) {
                if (isBoomLive) {
                  return (
                    <div key={msg.id} {...searchMessageAnchor(msg, "flex justify-center py-2")}>
                      <div className="max-w-md rounded-xl border border-border bg-muted px-5 py-2.5 text-center">
                        <p className="text-[12px] leading-relaxed text-slate-600 dark:text-muted-foreground">
                          {msg.content?.slice(0, 420)}
                        </p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={msg.id} {...searchMessageAnchor(msg, "flex justify-center py-1")}>
                    <span className="max-w-[80%] truncate rounded-full bg-muted/60 px-3 py-1 text-[9px] italic text-muted-foreground">
                      {msg.content?.slice(0, 100)}
                    </span>
                  </div>
                );
              }

              const bubbles: {
                text: string;
                images: string[];
                isAudio?: boolean;
                transcription?: string;
                videoUrl?: string;
                mediaAttachments?: Array<{ file_type?: string; data_url?: string }>;
              }[] = [];

              const photosSent = msg.metadata?.photos_sent ?? [];
              const idBasedAttachments = photosSent.flatMap((p) =>
                (photoUrlsByInventoryId[(p?.id || "").trim()] ?? []).map((url) => ({ file_type: "image", data_url: url }))
              );
              const baseMetaAttachments = (msg.metadata?.attachments as Array<{ file_type?: string; data_url?: string }>) ?? [];
              const metaAttachments = [...baseMetaAttachments, ...idBasedAttachments].filter(
                (att, idx, arr) =>
                  !!att?.data_url &&
                  arr.findIndex((x) => imageUrlsEquivalent(x?.data_url || "", att.data_url || "")) === idx
              );
              const isMediaPlaceholder =
                ((msg.content || "").trim() === "[Mídia enviada pelo atendente]" ||
                  (msg.content || "").trim() === "[Mídia enviada pelo cliente]") &&
                metaAttachments.length > 0;

              if (isMediaPlaceholder) {
                const imageUrls = [...new Set(
                  metaAttachments
                    .filter((a) => /^image\b|jpg|jpeg|png|gif|webp/i.test(a.file_type || "") || (a.data_url || "").startsWith("data:image/"))
                    .map((a) => a.data_url)
                    .filter((u): u is string => !!u)
                )];
                const videoAttachments = metaAttachments.filter(
                  (a) => /^video\b|mp4|webm/i.test(a.file_type || "") || (a.data_url || "").includes("video")
                );
                const audioAttachments = metaAttachments.filter(
                  (a) =>
                    /^audio\b|voice|ogg|mp3|m4a|webm|opus|aac/i.test(a.file_type || "") ||
                    (a.data_url || "").includes("audio") ||
                    (a.data_url || "").match(/\.(ogg|mp3|m4a|webm|opus|aac)(\?|$)/i)
                );
                if (imageUrls.length > 0) {
                  for (let i = 0; i < imageUrls.length; i += 3) {
                    bubbles.push({ text: "", images: imageUrls.slice(i, i + 3), mediaAttachments: [] });
                  }
                }
                const seenVideoUrls = new Set<string>();
                for (const v of videoAttachments) {
                  if (v.data_url && !seenVideoUrls.has(v.data_url)) {
                    seenVideoUrls.add(v.data_url);
                    bubbles.push({ text: "", images: [], videoUrl: v.data_url, mediaAttachments: [] });
                  }
                }
                const seenAudioUrls = new Set<string>();
                for (const a of audioAttachments) {
                  if (a.data_url && !seenAudioUrls.has(a.data_url)) {
                    seenAudioUrls.add(a.data_url);
                    bubbles.push({
                      text: "",
                      images: [],
                      isAudio: true,
                      transcription: "",
                      mediaAttachments: [{ file_type: a.file_type, data_url: a.data_url }],
                    });
                  }
                }
                const otherFiles = metaAttachments.filter(
                  (a) =>
                    !/^image\b|jpg|jpeg|png|gif|webp|video\b|mp4|webm|audio\b|ogg|mp3|m4a/i.test(a.file_type || "")
                );
                if (otherFiles.length > 0) {
                  bubbles.push({ text: "", images: [], mediaAttachments: otherFiles });
                }
                if (bubbles.length === 0 && metaAttachments.length > 0) {
                  const fallbackImages = [...new Set(
                    metaAttachments
                      .filter((a) => (a.data_url || "").startsWith("data:image/") || (a.data_url || "").match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i))
                      .map((a) => a.data_url!)
                      .filter(Boolean)
                  )];
                  if (fallbackImages.length > 0) {
                    bubbles.push({ text: "", images: fallbackImages, mediaAttachments: [] });
                  } else {
                    bubbles.push({ text: "", images: [], mediaAttachments: metaAttachments });
                  }
                }
              }

              if (bubbles.length === 0) {
                if (!isUser) {
                  const meta = msg.metadata as { type?: string; video_url?: string } | undefined;
                  const isWelcomeVideo =
                    (msg.content || "").trim() === "[Vídeo institucional enviado]" &&
                    meta?.type === "welcome_video" &&
                    meta?.video_url;

                  if (isWelcomeVideo) {
                    bubbles.push({
                      text: "",
                      images: [],
                      videoUrl: meta!.video_url!,
                    });
                  } else {
                    const rawContent = sanitizeAssistantContent(
                      deduplicateRepeatedContent(stripChatwootHeader(msg.content || ""))
                    );
                    const paragraphs = rawContent.split(/\n\n+/);
                    for (const para of paragraphs) {
                      const { text: pText, images: pImages } = extractImages(para);
                      const { text: pTextNoVideo, videoUrls } = extractVideos(pText);
                      for (const url of videoUrls) {
                        bubbles.push({ text: "", images: [], videoUrl: url });
                      }
                      if (pImages.length > 0) {
                        for (let i = 0; i < pImages.length; i += 3) {
                          bubbles.push({ text: "", images: pImages.slice(i, i + 3) });
                        }
                      }
                      if (pTextNoVideo.trim()) {
                        bubbles.push({ text: pTextNoVideo.trim(), images: [] });
                      }
                    }
                    if (bubbles.length === 0 && text) {
                      const v = extractVideos(text);
                      const im = extractImages(v.text);
                      for (const url of v.videoUrls) {
                        bubbles.push({ text: "", images: [], videoUrl: url });
                      }
                      if (im.text.trim() || im.images.length > 0) {
                        bubbles.push({ text: im.text.trim(), images: im.images });
                      }
                      if (bubbles.length === 0) bubbles.push({ text, images });
                    }
                  }
                } else {
                  if (audioInfo.isAudio) {
                    bubbles.push({ text: "", images: [], isAudio: true, transcription: audioInfo.transcription });
                  }
                  if (text.trim() || images.length > 0) {
                    bubbles.push({ text, images });
                  }
                }
              }

              if (bubbles.length === 0) return null;

              return (
                <div key={msg.id} {...searchMessageAnchor(msg, "space-y-1.5")}>
                  {!isUser && !isSystem && showDebug && (msg.metadata?.debug?.length || msg.metadata?.token_usage) && (
                    <div className="flex justify-end mb-1">
                      <DebugBlock
                        debug={msg.metadata?.debug ?? []}
                        tokenUsage={msg.metadata?.token_usage}
                      />
                    </div>
                  )}
                  {bubbles.map((bubble, bIdx) => (
                    <div
                      key={`${msg.id}-${bIdx}`}
                      className={cn(
                        "flex items-end gap-3",
                        isBoomLive
                          ? isUser
                            ? "max-w-[min(92%,20rem)] justify-start sm:max-w-[85%]"
                            : "ml-auto max-w-[min(92%,20rem)] justify-end self-end sm:max-w-[85%]"
                          : "gap-2",
                        !isBoomLive && (isUser ? "justify-start" : "justify-end")
                      )}
                    >
                      {isUser && bIdx === 0 && (() => {
                        const avatarColor = getContactAvatarColor(contactInitials);
                        return (
                          <div
                            className={cn(
                              "relative mt-1 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br font-bold text-white shadow-sm",
                              isBoomLive ? "h-8 w-8 text-[11px]" : "h-10 w-10 text-[13px]"
                            )}
                            style={{
                              background: contactAvatarUrl
                                ? "transparent"
                                : `linear-gradient(135deg, ${avatarColor}dd, ${avatarColor})`,
                              boxShadow: contactAvatarUrl ? undefined : `0 2px 8px ${avatarColor}44`,
                            }}
                          >
                            {contactAvatarUrl ? (
                              <img
                                src={contactAvatarUrl}
                                alt=""
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  const parent = (e.target as HTMLImageElement).parentElement;
                                  if (parent) {
                                    parent.style.background = `linear-gradient(135deg, ${avatarColor}dd, ${avatarColor})`;
                                    parent.style.boxShadow = `0 2px 8px ${avatarColor}44`;
                                  }
                                  (e.target as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              contactInitials
                            )}
                          </div>
                        );
                      })()}
                      <div className={cn(isBoomLive ? "max-w-[min(92%,20rem)] sm:max-w-[85%]" : "max-w-[75%]", isUser && bIdx === 0 && !isBoomLive && "flex gap-2.5")}>
                        <div
                          className={cn(
                            "rounded-2xl px-3.5 py-2.5",
                            isBoomLive
                              ? isUser
                                ? "rounded-2xl rounded-bl-sm border border-slate-200/60 bg-white text-slate-900 shadow-sm"
                                : "rounded-2xl rounded-br-sm border-0 bg-primary text-white [&_.prose_a]:text-white/95 [&_.prose_strong]:text-white"
                              : isChatApp
                                ? isUser
                                  ? "chat-bubble-user rounded-tl-md"
                                  : "chat-bubble-assistant rounded-br-md"
                                : isUser
                                  ? "rounded-tl-md bg-accent border border-border"
                                  : "rounded-br-md bg-primary text-primary-foreground"
                          )}
                        >
                          {bubble.videoUrl && (
                            <div className="mb-1.5">
                              <VideoPlayer src={bubble.videoUrl} />
                            </div>
                          )}
                          {bubble.isAudio && (
                            <div className="flex items-start gap-2.5">
                              {bubble.mediaAttachments?.[0]?.data_url ? (
                                <AudioPlayer src={bubble.mediaAttachments[0].data_url} />
                              ) : (
                                <>
                                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-accent/20 shrink-0 mt-0.5">
                                    <Mic className="h-4 w-4 text-accent-foreground" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                      <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">
                                        Áudio transcrito
                                      </span>
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap break-words italic">
                                      &quot;{bubble.transcription}&quot;
                                    </p>
                                  </div>
                                </>
                              )}
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

                          {bubble.mediaAttachments && bubble.mediaAttachments.length > 0 && !bubble.isAudio && bubble.images.length === 0 && !bubble.videoUrl && (
                            <div className="mb-1.5 space-y-1">
                              {bubble.mediaAttachments.map((att, idx) =>
                                att.data_url ? (
                                  <a
                                    key={idx}
                                    href={att.data_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-sm underline opacity-90 hover:opacity-100"
                                  >
                                    📎 {att.file_type === "file" || att.file_type === "document" ? "Documento" : att.file_type || "Arquivo"}
                                  </a>
                                ) : null
                              )}
                            </div>
                          )}

                          {bubble.text && !bubble.isAudio && (
                            <div
                              className={cn(
                                "prose prose-sm max-w-none dark:prose-invert [&_p]:m-0 [&_p]:leading-relaxed",
                                isBoomLive && !isUser && "[--tw-prose-body:theme(colors.white)] [&_p]:text-[15px] [&_p]:text-white [&_strong]:text-white"
                              )}
                            >
                              <ReactMarkdown
                                components={{
                                  p: ({ children }) => (
                                    <p
                                      className={cn(
                                        "whitespace-pre-wrap break-words",
                                        isBoomLive && !isUser ? "text-[15px] leading-relaxed text-white" : "text-sm"
                                      )}
                                    >
                                      {children}
                                    </p>
                                  ),
                                  a: ({ href, children }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className={cn(
                                        "underline opacity-90 hover:opacity-100",
                                        isBoomLive && !isUser && "text-white"
                                      )}
                                    >
                                      {children}
                                    </a>
                                  ),
                                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                                  img: ({ src, alt }) => {
                                    if (!src) return null;
                                    if (bubble.images.some((u) => imageUrlsEquivalent(u, src))) return null;
                                    return (
                                      <img
                                        src={src}
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
                                {bubble.text}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>

                        {bIdx === bubbles.length - 1 && (
                          <div
                            className={cn(
                              "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 px-0.5",
                              isUser ? "justify-start" : "justify-end"
                            )}
                          >
                            <time
                              dateTime={msg.created_at}
                              className={cn(
                                "tabular-nums tracking-tight",
                                isBoomLive && !isUser && "text-[13px] font-medium text-slate-600 dark:text-slate-300",
                                isBoomLive &&
                                  isUser &&
                                  "text-[13px] font-medium text-slate-600 dark:text-muted-foreground",
                                !isBoomLive && !isUser && "text-[13px] font-medium text-foreground/88",
                                !isBoomLive && isUser && "text-[13px] font-medium text-muted-foreground"
                              )}
                            >
                              {format(new Date(msg.created_at), "HH:mm")}
                            </time>
                            {!isUser && (
                              <CheckCheck
                                className={cn(
                                  "h-[15px] w-[15px] shrink-0 text-primary",
                                  isBoomLive && "text-primary dark:text-primary"
                                )}
                                aria-hidden
                              />
                            )}
                            {!isUser && (msg.metadata?.sender_name ?? agentName ?? msg.model) && (
                              <span
                                className={cn(
                                  "max-w-[min(260px,70vw)] truncate text-[12px] font-medium leading-snug tracking-wide text-slate-600 antialiased dark:text-slate-300",
                                  !isBoomLive && "font-normal text-muted-foreground dark:text-muted-foreground"
                                )}
                                title={String(
                                  msg.metadata?.sender_name ?? agentName ?? msg.model ?? ""
                                )}
                              >
                                ↳ {msg.metadata?.sender_name ?? agentName ?? msg.model}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      {!isUser && bIdx === 0 && !isBoomLive && (
                        <Avatar className="h-10 w-10 shrink-0 mt-1">
                          {agentAvatarUrl && !msg.metadata?.sender_name ? (
                            <AvatarImage src={agentAvatarUrl} alt={agentName || "IA"} />
                          ) : null}
                          <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                            {msg.metadata?.sender_name ? (
                              <span className="text-xs">{getAgentInitials(msg.metadata.sender_name)}</span>
                            ) : agentAvatarUrl ? (
                              <span className="text-xs">{getAgentInitials(agentName)}</span>
                            ) : (
                              <Bot className="h-5 w-5" aria-hidden />
                            )}
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
