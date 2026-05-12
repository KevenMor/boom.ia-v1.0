/**
 * Formata orçamentos Omnibees para entrega no WhatsApp: menos bolhas quebradas
 * e pergunta de fechamento coerente quando só há uma acomodação com tarifa.
 */

const MSG_SPLIT = "<<MSG_SPLIT>>";
const OMNIBEES_QUOTE_RE =
  /\bR\$\s*[\d.]|\bTOTAL para \d+ noite|parcelad|à vista|a vista|dep[oó]sito|pens[aã]o completa/i;
const IMAGE_MD_RE = /^!\[[^\]]*\]\(https?:\/\/[^)\s]+\)\s*$/i;
const CHECKIN_FOOTER_RE = /horários nesta página|check-?in|check-?out/i;

export type OmnibeesQuoteMeta = {
  roomCount: number;
  roomNames: string[];
};

function assistantDeliversOmnibeesQuote(text: string): boolean {
  return OMNIBEES_QUOTE_RE.test(text || "");
}

export function extractOmnibeesQuoteMeta(toolResultStrings: string[]): OmnibeesQuoteMeta | null {
  for (const raw of toolResultStrings) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed.summaryText !== "string" || !parsed.summaryText.trim()) continue;
      const rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
      const roomNames = rooms
        .map((room) => {
          if (!room || typeof room !== "object") return "";
          return String((room as { roomName?: unknown }).roomName ?? "").trim();
        })
        .filter(Boolean);
      const roomCount =
        typeof parsed.roomCount === "number" && parsed.roomCount > 0
          ? parsed.roomCount
          : roomNames.length;
      if (roomCount > 0) {
        return { roomCount, roomNames };
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Cola a capa na linha de preço da acomodação (legenda no WhatsApp). */
export function tightenOmnibeesQuoteSpacing(text: string): string {
  let out = text.replace(
    /(!\[[^\]]*\]\(https?:\/\/[^)\s]+\))\s*\n+(?=[^\n!]*(?:TOTAL|R\$))/gi,
    "$1\n"
  );
  out = out.replace(/\n{3,}/g, "\n\n");
  return out;
}

/** Uma acomodação: não perguntar qual opção prefere. */
export function adjustOmnibeesSingleRoomClosing(
  text: string,
  roomCount: number,
  primaryRoomName?: string
): string {
  if (roomCount !== 1) return text;
  const roomLabel = primaryRoomName?.trim() ? ` o ${primaryRoomName.trim()}` : "";
  return text.replace(
    /qual\s+op[cç][aã]o\s+prefere(?:,?\s*([^?.\n]+))?\s*\?/gi,
    (_match, namePart: string | undefined) => {
      const suffix = namePart?.trim() ? `, ${namePart.trim()}` : "";
      return `Quer seguir com${roomLabel} para essas datas${suffix}?`;
    }
  );
}

function lineStartsRoomBlock(line: string, roomNames: string[]): boolean {
  const trimmed = line.trim();
  if (IMAGE_MD_RE.test(trimmed)) return true;
  if (!OMNIBEES_QUOTE_RE.test(trimmed)) return false;
  if (roomNames.length === 0) return true;
  const norm = trimmed.toLowerCase();
  return roomNames.some((name) => name && norm.includes(name.toLowerCase()));
}

function splitBodyByRooms(bodyLines: string[], roomNames: string[]): string[] {
  const blocks: string[][] = [];
  let current: string[] = [];

  for (const line of bodyLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (current.length > 0 && lineStartsRoomBlock(trimmed, roomNames) && IMAGE_MD_RE.test(trimmed)) {
      blocks.push(current);
      current = [trimmed];
      continue;
    }
    if (current.length === 0 && lineStartsRoomBlock(trimmed, roomNames)) {
      current.push(trimmed);
      continue;
    }
    if (current.length > 0) {
      current.push(trimmed);
      continue;
    }
    current.push(trimmed);
  }

  if (current.length > 0) blocks.push(current);
  return blocks.map((block) => block.join("\n"));
}

function insertOmnibeesQuoteMessageSplits(text: string, roomNames: string[]): string {
  const lines = text.split(/\r?\n/);
  const checkInIdx = lines.findIndex((line) => CHECKIN_FOOTER_RE.test(line));
  const firstBodyIdx = lines.findIndex((line) => lineStartsRoomBlock(line.trim(), roomNames));
  if (firstBodyIdx < 0) return text;

  const introLines = lines.slice(0, firstBodyIdx).map((line) => line.trim()).filter(Boolean);
  const bodyEnd = checkInIdx >= 0 ? checkInIdx : lines.length;
  const bodyLines = lines.slice(firstBodyIdx, bodyEnd);
  const footerLines =
    checkInIdx >= 0 ? lines.slice(checkInIdx).map((line) => line.trim()).filter(Boolean) : [];

  const parts: string[] = [];
  if (introLines.length > 0) parts.push(introLines.join("\n"));

  for (const block of splitBodyByRooms(bodyLines, roomNames)) {
    if (block.trim()) parts.push(block.trim());
  }

  if (footerLines.length > 0) parts.push(footerLines.join("\n"));

  if (parts.length <= 1) return text;
  return parts.join(`\n${MSG_SPLIT}\n`);
}

export function formatOmnibeesQuoteForDelivery(
  assistantText: string,
  toolResultStrings: string[]
): string {
  const base = (assistantText ?? "").trim();
  if (!base || !assistantDeliversOmnibeesQuote(base)) return assistantText ?? "";

  const meta = extractOmnibeesQuoteMeta(toolResultStrings);
  if (!meta) return base;

  let text = tightenOmnibeesQuoteSpacing(base);
  text = adjustOmnibeesSingleRoomClosing(text, meta.roomCount, meta.roomNames[0]);
  text = insertOmnibeesQuoteMessageSplits(text, meta.roomNames);
  return text;
}
