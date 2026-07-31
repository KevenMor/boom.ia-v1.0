import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["#019FA2", "#0d9488", "#0ea5e9", "#64748b", "#14b8a6", "#475569"];

export function getContactAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

type ContactConversationAvatarProps = {
  url?: string | null;
  name: string;
  initials: string;
  className?: string;
  textClassName?: string;
};

/**
 * Avatar de contato no Chat ao Vivo.
 * Se a URL do Chatwoot/WhatsApp estiver quebrada ou expirada, volta às iniciais
 * (evita o ícone de imagem quebrada no browser).
 */
export function ContactConversationAvatar({
  url,
  name,
  initials,
  className,
  textClassName,
}: ContactConversationAvatarProps) {
  const trimmed = (url ?? "").trim();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [trimmed]);

  const showImg = !!trimmed && !failed;
  const color = getContactAvatarColor(name);
  const bg = `linear-gradient(135deg, ${color}dd, ${color})`;

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white shadow-sm",
        className,
      )}
      style={{
        background: bg,
        boxShadow: showImg ? undefined : `0 2px 8px ${color}44`,
      }}
    >
      {showImg ? (
        <img
          src={trimmed}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className={cn("select-none", textClassName)}>{initials}</span>
      )}
    </div>
  );
}
