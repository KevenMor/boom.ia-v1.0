/**
 * Garante Markdown com URLs de capa Omnibees quando o modelo omite fotos em orçamentos
 * ou quando o cliente pediu fotos de acomodação.
 */

const MARKDOWN_HTTPS_IMG = /!\[[^\]]*\]\(https?:\/\//i;
const OMNIBEES_QUOTE_RE = /\bR\$\s*[\d.]|\bTOTAL para \d+ noite/i;

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeRoomNameKey(name: string): string {
  return stripDiacritics(name.trim().toLowerCase());
}

function buildRoomPhotoMarkdown(roomName: string, imageUrl: string): string {
  const label = roomName.replace(/\s+/g, " ").trim().slice(0, 80);
  const url = imageUrl.replace(/\)/g, "%29");
  return `![Foto - ${label}](${url})`;
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

function extractOmnibeesRoomPhotosFromSummaryText(summaryText: string): Array<{ roomName: string; imageUrl: string }> {
  const out: Array<{ roomName: string; imageUrl: string }> = [];
  const re = /!\[Foto - ([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(summaryText)) !== null) {
    const roomName = (match[1] || "").trim();
    const imageUrl = (match[2] || "").trim();
    if (!roomName || !imageUrl) continue;
    if (!out.some((x) => normalizeRoomNameKey(x.roomName) === normalizeRoomNameKey(roomName))) {
      out.push({ roomName, imageUrl });
    }
  }
  return out;
}

export function collectOmnibeesRoomPhotosFromToolResults(toolResultStrings: string[]): Array<{ roomName: string; imageUrl: string }> {
  const out: Array<{ roomName: string; imageUrl: string }> = [];
  const seen = new Set<string>();
  const add = (roomName: string, imageUrl: string) => {
    const key = normalizeRoomNameKey(roomName);
    if (!key || !imageUrl || seen.has(key)) return;
    seen.add(key);
    out.push({ roomName, imageUrl });
  };

  for (const raw of toolResultStrings) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      for (const room of extractOmnibeesRoomPhotosFromToolResult(parsed)) {
        add(room.roomName, room.imageUrl);
      }
      const summaryText =
        parsed && typeof parsed === "object" && typeof (parsed as { summaryText?: unknown }).summaryText === "string"
          ? String((parsed as { summaryText: string }).summaryText)
          : "";
      if (summaryText.trim()) {
        for (const room of extractOmnibeesRoomPhotosFromSummaryText(summaryText)) {
          add(room.roomName, room.imageUrl);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

function assistantDeliversOmnibeesQuote(text: string): boolean {
  return OMNIBEES_QUOTE_RE.test(text || "");
}

function roomMarkdownPresent(text: string, roomName: string, imageUrl: string): boolean {
  if (imageUrl && text.includes(imageUrl)) return true;
  const key = normalizeRoomNameKey(roomName);
  const re = new RegExp(`!\\[[^\\]]*${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^\\]]*\\]\\(https?:\\/\\/`, "i");
  return re.test(text);
}

function lineLooksLikeRoomQuote(line: string, roomName: string): boolean {
  const normLine = normalizeRoomNameKey(line);
  const normRoom = normalizeRoomNameKey(roomName);
  if (!normLine.includes(normRoom)) return false;
  return OMNIBEES_QUOTE_RE.test(line) || /à vista|parcelad/i.test(line);
}

/**
 * Em orçamentos Omnibees, prefixa cada acomodação com a capa retornada pela consulta.
 */
export function injectOmnibeesQuotePhotosIfMissing(
  assistantText: string,
  toolResultStrings: string[]
): { appended: string; fullText: string } | null {
  const rooms = collectOmnibeesRoomPhotosFromToolResults(toolResultStrings);
  if (rooms.length === 0) return null;

  const base = (assistantText ?? "").trimEnd();
  if (!base || !assistantDeliversOmnibeesQuote(base)) return null;

  const missing = rooms.filter((room) => !roomMarkdownPresent(base, room.roomName, room.imageUrl));
  if (missing.length === 0) return null;

  const lines = base.split(/\r?\n/);
  const used = new Set<string>();

  for (const room of missing) {
    const key = normalizeRoomNameKey(room.roomName);
    if (used.has(key)) continue;

    const prefix = buildRoomPhotoMarkdown(room.roomName, room.imageUrl);
    let idx = lines.findIndex((line) => lineLooksLikeRoomQuote(line, room.roomName));
    if (idx === -1) {
      idx = lines.findIndex((line) => normalizeRoomNameKey(line).startsWith(key));
    }
    if (idx < 0) continue;

    const prev = (lines[idx - 1] ?? "").trim();
    if (prev.startsWith("![") && prev.includes(room.imageUrl)) {
      used.add(key);
      continue;
    }

    lines.splice(idx, 0, prefix);
    used.add(key);
  }

  const fullText = lines.join("\n");
  if (fullText === base) {
    const tail = missing
      .filter((room) => !used.has(normalizeRoomNameKey(room.roomName)))
      .map((room) => buildRoomPhotoMarkdown(room.roomName, room.imageUrl));
    if (tail.length === 0) return null;
    const appended = `\n\n${tail.join("\n")}`;
    return { appended, fullText: `${base}${appended}` };
  }

  return {
    appended: fullText.slice(base.length),
    fullText,
  };
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
