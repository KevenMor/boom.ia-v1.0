import { Play, Pause, FileText, Download } from "lucide-react";
import { useState, useRef } from "react";

// Detect video URLs in text
export function extractVideos(content: string): { text: string; videoUrls: string[] } {
  const videoUrls: string[] = [];
  const videoRegex = /(?:!\[.*?\]\()?(https?:\/\/[^\s)"]+\.(?:mp4|webm|mov|avi)[^\s)"]*)\)?/gi;
  let match;
  while ((match = videoRegex.exec(content)) !== null) {
    if (match[1] && !videoUrls.includes(match[1])) videoUrls.push(match[1]);
  }
  let text = content;
  videoUrls.forEach((url) => {
    text = text.replace(new RegExp(`!?\\[.*?\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'), '');
    text = text.split(url).join('');
  });
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return { text, videoUrls };
}

// WhatsApp-style audio player
export function AudioPlayer({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
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
    <div className="flex items-center gap-2 min-w-[200px]">
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={() => {
          if (audioRef.current) setProgress(audioRef.current.currentTime);
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) setDuration(audioRef.current.duration);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); }}
      />
      <button onClick={toggle} className="h-8 w-8 rounded-full bg-[#00a884] flex items-center justify-center text-white shrink-0">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1 flex flex-col gap-0.5">
        <div className="h-1 bg-[#374045] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#00a884] rounded-full transition-all"
            style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
          />
        </div>
        <span className="text-[10px] text-[#8696a0]">{formatTime(progress)} / {formatTime(duration)}</span>
      </div>
    </div>
  );
}

// Video player in bubble
export function VideoPlayer({ src }: { src: string }) {
  return (
    <video
      src={src}
      controls
      className="rounded-md max-h-64 w-full"
      preload="metadata"
    />
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
