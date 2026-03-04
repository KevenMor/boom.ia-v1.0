import { X, FileText, Film, Image as ImageIcon, Music } from "lucide-react";

export interface AttachmentFile {
  file: File;
  preview?: string;
  type: "image" | "video" | "audio" | "file";
}

interface AttachmentPreviewProps {
  attachments: AttachmentFile[];
  onRemove: (index: number) => void;
}

function getFileType(file: File): AttachmentFile["type"] {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  return "file";
}

export function classifyFile(file: File): AttachmentFile {
  const type = getFileType(file);
  const preview =
    type === "image" || type === "video" ? URL.createObjectURL(file) : undefined;
  return { file, preview, type };
}

export function AttachmentPreview({ attachments, onRemove }: AttachmentPreviewProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="bg-[#1a2730] border-t border-[#2a3942] px-3 py-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {attachments.map((att, i) => (
          <div key={i} className="relative shrink-0 group">
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-1 -right-1 z-10 h-5 w-5 rounded-full bg-[#374045] text-[#8696a0] flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
            {att.type === "image" && att.preview && (
              <img src={att.preview} alt="" className="h-16 w-16 rounded-lg object-cover" />
            )}
            {att.type === "video" && att.preview && (
              <div className="h-16 w-16 rounded-lg bg-[#2a3942] flex items-center justify-center relative overflow-hidden">
                <video src={att.preview} className="h-full w-full object-cover" />
                <Film className="h-5 w-5 text-white absolute" />
              </div>
            )}
            {att.type === "audio" && (
              <div className="h-16 w-20 rounded-lg bg-[#2a3942] flex flex-col items-center justify-center gap-1">
                <Music className="h-5 w-5 text-[#00a884]" />
                <span className="text-[9px] text-[#8696a0] truncate max-w-[72px]">{att.file.name}</span>
              </div>
            )}
            {att.type === "file" && (
              <div className="h-16 w-20 rounded-lg bg-[#2a3942] flex flex-col items-center justify-center gap-1">
                <FileText className="h-5 w-5 text-[#8696a0]" />
                <span className="text-[9px] text-[#8696a0] truncate max-w-[72px]">{att.file.name}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
