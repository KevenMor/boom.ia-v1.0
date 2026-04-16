/**
 * Garante Markdown com URLs de capa Omnibees quando o **cliente pediu fotos** e o modelo esqueceu o `![...](https...)`.
 * Não injeta por promessa espontânea do assistente — evita fotos não solicitadas.
 */

const MARKDOWN_HTTPS_IMG = /!\[[^\]]*\]\(https?:\/\//i;

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Extrai quartos com URL de imagem a partir do JSON retornado pela tool omnibees_availability. */
export function extractOmnibeesRoomPhotosFromToolResult(result: unknown): Array<{ roomName: string; imageUrl: string }> {
  if (!result || typeof result !== "object") return [];
  const rooms = (result as Record<string, unknown>).rooms;
  if (!Array.isArray(rooms)) return [];
  const out: Array<{ roomName: string; imageUrl: string }> = [];
  for (const r of rooms) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const roomName = String(rec.roomName ?? "").trim();
    const imageUrl = String(rec.imageUrl ?? "").trim();
    if (!roomName || !imageUrl || !/^https?:\/\//i.test(imageUrl)) continue;
    if (!out.some((x) => x.imageUrl === imageUrl)) out.push({ roomName, imageUrl });
  }
  return out;
}

function userWantsAccommodationPhotos(lastUserText: string): boolean {
  const t = stripDiacritics((lastUserText || "").toLowerCase());
  if (/\b(fotos?|imagens?)\b/.test(t)) return true;
  if (/\b(enviar|mandar|mostrar|manda|envia)\b/.test(t) && /\b(loft|vip|suite|quarto|acomod|acomoda|hosped)\b/.test(t)) return true;
  return false;
}

function pickRoomsForAppend(
  rooms: Array<{ roomName: string; imageUrl: string }>,
  lastUserText: string,
  assistantText: string
): Array<{ roomName: string; imageUrl: string }> {
  const blob = `${stripDiacritics(lastUserText.toLowerCase())} ${stripDiacritics(assistantText.toLowerCase())}`;
  const norm = (s: string) => stripDiacritics(s.toLowerCase());

  const matchesToken = (roomNorm: string, token: string) => roomNorm.includes(token);

  const withUrl = rooms.filter((r) => r.imageUrl && /^https?:\/\//i.test(r.imageUrl));
  if (withUrl.length === 0) return [];

  const picked: typeof rooms = [];
  const tryAdd = (pred: (roomNorm: string) => boolean) => {
    for (const r of withUrl) {
      const rn = norm(r.roomName);
      if (pred(rn) && !picked.some((p) => p.imageUrl === r.imageUrl)) picked.push(r);
    }
  };

  if (/\bloft\b/.test(blob)) tryAdd((rn) => matchesToken(rn, "loft"));
  if (/\bvip\b/.test(blob)) tryAdd((rn) => matchesToken(rn, "vip"));
  if (/\b(chale|chal[eé])\b/.test(blob)) tryAdd((rn) => /chal/.test(rn));
  if (/\b(bangalo|bangal[oô])\b/.test(blob)) tryAdd((rn) => /banga/.test(rn));

  if (picked.length > 0) return picked;

  // Pedido genérico de fotos / “acomodações” — limitar para não inundar o Zap
  if (/\b(fotos?|imagens?)\b/.test(blob) || /\b(acomod|acomoda|quarto|suite|hosped)\b/.test(blob)) {
    return withUrl.slice(0, 5);
  }

  return [];
}

/**
 * Só quando o **último texto do cliente** pede fotos de acomodação: completa Markdown se o modelo não colou URLs.
 */
export function appendOmnibeesPhotoMarkdownIfMissing(
  assistantText: string,
  lastUserText: string,
  rooms: Array<{ roomName: string; imageUrl: string }>
): { text: string; appended: string } {
  const base = (assistantText ?? "").trimEnd();
  if (!base || rooms.length === 0) return { text: assistantText ?? "", appended: "" };
  if (MARKDOWN_HTTPS_IMG.test(base)) return { text: base, appended: "" };

  if (!userWantsAccommodationPhotos(lastUserText)) return { text: base, appended: "" };

  let picked = pickRoomsForAppend(rooms, lastUserText, base);
  if (picked.length === 0) {
    picked = rooms.filter((r) => /^https?:\/\//i.test(r.imageUrl)).slice(0, 5);
  }
  if (picked.length === 0) return { text: base, appended: "" };

  const lines = picked.map((r) => {
    const label = r.roomName.replace(/\s+/g, " ").trim().slice(0, 80);
    const url = r.imageUrl.replace(/\)/g, "%29");
    return `![${label}](${url})`;
  });
  const appended = "\n\n" + lines.join("\n");
  return { text: base + appended, appended };
}
