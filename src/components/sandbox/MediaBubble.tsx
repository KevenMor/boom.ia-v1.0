import { Play, Pause, FileText, Download, ExternalLink } from "lucide-react";
import { useState, useRef, useEffect } from "react";

// Detect video URLs in text
export function extractVideos(content: string): { text: string; videoUrls: string[] } {
  const videoUrls: string[] = [];
  const videoRegex = /(?:!\[.*?\]\()?(https?:\/\/[^\s)"]+\.(?:mp4|webm|mov|avi)[^\s)"]*)\)?/gi;
  let match;

  const normalizeVideoUrl = (raw: string): string => {
    let url = (raw || "").trim();
    // Corrige casos como https://https://...
    url = url.replace(/^https?:\/\/(https?:\/\/)+/i, "https://");
    // Remove pontuação de fechamento que às vezes vem colada no texto
    url = url.replace(/[),.;!?]+$/g, "");
    return url;
  };

  while ((match = videoRegex.exec(content)) !== null) {
    const normalized = normalizeVideoUrl(match[1] || "");
    if (normalized && !videoUrls.includes(normalized)) videoUrls.push(normalized);
  }
  let text = content;
  videoUrls.forEach((url) => {
    const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Remove markdown link patterns [text](url) ou ![text](url)
    text = text.replace(new RegExp(`!?\\[.*?\\]\\(${escapedUrl}\\)`, 'g'), '');
    // Remove URL nua + possível ) residual na mesma linha (ex: url.mp4) deixado pelo LLM)
    text = text.replace(new RegExp(escapedUrl + '\\)?', 'g'), '');
  });
  // Remove linhas que ficaram apenas com ) ou ( após a extração
  text = text.replace(/^\s*[()]\s*$/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { text, videoUrls };
}

// WhatsApp-style audio player
export function AudioPlayer({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setDuration(0);
    setLoadError(false);
  }, [src]);

  const toggle = () => {
    if (!audioRef.current || loadError) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      void audioRef.current.play().catch(() => setLoadError(true));
    }
    setPlaying(!playing);
  };

  const formatTime = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex min-w-[200px] flex-col gap-2">
      <audio
        ref={audioRef}
        preload="metadata"
        src={src}
        onTimeUpdate={() => {
          if (audioRef.current) setProgress(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
            setLoadError(false);
          }
        }}
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onError={() => {
          setLoadError(true);
          setPlaying(false);
          setDuration(0);
        }}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={loadError || !src}
          onClick={toggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white disabled:pointer-events-none disabled:opacity-50"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="h-1 overflow-hidden rounded-full bg-[#374045]">
            <div
              className="h-full rounded-full bg-[#00a884] transition-all"
              style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
            />
          </div>
          <span className="text-[10px] text-[#8696a0]">
            {loadError ? "Não foi possível reproduzir aqui." : `${formatTime(progress)} / ${formatTime(duration)}`}
          </span>
        </div>
      </div>
      {loadError && /^https?:/i.test(src?.trim() || "") && (
        <a href={src} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold underline text-[#00a884]">
          Abrir áudio no navegador
        </a>
      )}
    </div>
  );
}

export function VideoPlayer({ src }: { src: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/60 px-3 py-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Play className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">Video</p>
        <p className="text-[11px] text-muted-foreground">Toque para abrir</p>
      </div>
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground"
      >
        <ExternalLink className="h-3 w-3" />
        Abrir video
      </a>
    </div>
  );
}

// File attachment display
export function FileAttachment({ name, url }: { name: string; url?: string }) {
  return (
    <div className="flex items-center gap-2 bg-[#1a2730] rounded-lg px-3 py-2">
      <FileText className="h-8 w-8 text-[#00a884] shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-[#e9edef] truncate">{name}</p>
        <p className="text-[10px] text-[#8696a0]">Documento</p>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-[#8696a0] hover:text-white">
          <Download className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}

// User-sent media inline preview (for images/video/audio/file sent by user in sandbox)
export interface UserAttachmentMeta {
  type: "image" | "video" | "audio" | "file";
  dataUrl: string;
  fileName: string;
}

export function UserMediaPreview({ attachment }: { attachment: UserAttachmentMeta }) {
  switch (attachment.type) {
    case "image":
      return <img src={attachment.dataUrl} alt="" className="rounded-md max-h-48 w-full object-cover" />;
    case "video":
      return <video src={attachment.dataUrl} controls className="rounded-md max-h-48 w-full" />;
    case "audio":
      return <AudioPlayer src={attachment.dataUrl} />;
    case "file":
      return <FileAttachment name={attachment.fileName} />;
    default:
      return null;
  }
}
