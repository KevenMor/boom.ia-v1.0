/**
 * Se o modelo promete fotos da suite_gallery mas omite o photos_markdown, o chat fica sem imagens.
 * Esta etapa anexa o bloco ![...](url) vindo do JSON da ferramenta quando seguro.
 *
 * Importante: `![alt](https://...` **sem** `)` de fecho (stream/modelo cortou) não conta como
 * "já tem imagem" — senão a injeção não corre e o cliente vê markdown cru.
 */

/** Parênteses balanceados no destino `](URL)` (igual ao frontend `consumeMdImageUrl`). */
function consumeMdImageUrl(s: string, urlStart: number): { url: string; endExclusive: number } | null {
  if (urlStart >= s.length) return null;
  let depth = 0;
  for (let p = urlStart; p < s.length; p++) {
    const c = s[p];
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth > 0) depth--;
      else return { url: s.slice(urlStart, p).trim(), endExclusive: p + 1 };
    }
  }
  return null;
}

export function hasAtLeastOneCompleteMarkdownHttpImage(text: string): boolean {
  let pos = 0;
  while (pos < text.length) {
    const i = text.indexOf("![", pos);
    if (i === -1) break;
    const j = text.indexOf("](", i + 2);
    if (j === -1) break;
    let urlStart = j + 2;
    while (urlStart < text.length && /\s/.test(text[urlStart])) urlStart++;
    if (urlStart >= text.length) break;
    if (!text.startsWith("http://", urlStart) && !text.startsWith("https://", urlStart)) {
      pos = j + 2;
      continue;
    }
    const consumed = consumeMdImageUrl(text, urlStart);
    if (consumed) return true;
    pos = i + 2;
  }
  return false;
}

/**
 * Remove linhas que são só `![…](https://…` incompletas (stream truncou antes do `)`).
 * Preserva linhas seguintes (ex.: "Como posso te chamar?").
 */
export function stripBrokenMarkdownImageLines(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      if (!t.startsWith("![")) return true;
      const j = t.indexOf("](", 2);
      if (j === -1) return false;
      let urlStart = j + 2;
      while (urlStart < t.length && /\s/.test(t[urlStart])) urlStart++;
      if (urlStart >= t.length) return false;
      if (!t.startsWith("http://", urlStart) && !t.startsWith("https://", urlStart)) return true;
      return consumeMdImageUrl(t, urlStart) !== null;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseSuiteGalleryToolContent(jsonStr: string): string {
  try {
    const obj = JSON.parse(jsonStr) as {
      galleries?: Array<{ photos_markdown?: string; total_fotos?: number }>;
    };
    if (!obj?.galleries || !Array.isArray(obj.galleries)) return "";
    const blocks: string[] = [];
    const seenUrl = new Set<string>();
    for (const g of obj.galleries) {
      const pm = typeof g.photos_markdown === "string" ? g.photos_markdown.trim() : "";
      if (!pm) continue;
      for (const line of pm.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        const m = t.match(/!\[[^\]]*\]\(\s*(https?:\/\/[^)\s]+)\s*\)/i);
        const url = m?.[1]?.trim();
        if (url && !seenUrl.has(url)) {
          seenUrl.add(url);
          blocks.push(t);
        } else if (!url) {
          blocks.push(t);
        }
      }
    }
    return blocks.join("\n").trim();
  } catch {
    return "";
  }
}

export function collectSuiteGalleryMarkdownFromToolResults(toolResultStrings: string[]): string {
  const chunks: string[] = [];
  for (const raw of toolResultStrings) {
    const block = parseSuiteGalleryToolContent(raw);
    if (block) chunks.push(block);
  }
  if (chunks.length === 0) return "";
  return chunks.join("\n\n").trim();
}

type SuiteGalleryVideoItem = { url?: string; llm_send_when?: string };

function parseSuiteGalleryVideoUrls(jsonStr: string): string[] {
  try {
    const obj = JSON.parse(jsonStr) as {
      galleries?: Array<{ videos?: SuiteGalleryVideoItem[] }>;
    };
    if (!obj?.galleries || !Array.isArray(obj.galleries)) return [];
    const urls: string[] = [];
    const seen = new Set<string>();
    for (const g of obj.galleries) {
      const videos = Array.isArray(g.videos) ? g.videos : [];
      for (const v of videos) {
        const raw = typeof v?.url === "string" ? v.url.trim() : "";
        if (!raw || seen.has(raw)) continue;
        if (!/^https?:\/\//i.test(raw)) continue;
        seen.add(raw);
        urls.push(raw);
      }
    }
    return urls;
  } catch {
    return [];
  }
}

export function collectSuiteGalleryVideoUrlsFromToolResults(toolResultStrings: string[]): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const raw of toolResultStrings) {
    for (const url of parseSuiteGalleryVideoUrls(raw)) {
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}

export function extractVideoUrlsFromText(text: string): string[] {
  const videoUrls: string[] = [];
  const videoRegex = /(?:!\[.*?\]\()?(https?:\/\/[^\s)"]+\.(?:mp4|webm|mov)(?:[^\s)"]*)?)\)?/gi;
  let match: RegExpExecArray | null;
  while ((match = videoRegex.exec(text || "")) !== null) {
    const url = (match[1] || "").trim();
    if (url && !videoUrls.includes(url)) videoUrls.push(url);
  }
  return videoUrls;
}

function userLikelyAskedForVideo(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (/\b(tem|mostra|mostrar|manda|mandar|mande|envia|enviar|quero|queria|ver)\b/.test(t) && /\bv[ií]deos?\b/.test(t)) {
    return true;
  }
  return /\b(v[ií]deo|vídeo)\b/.test(t) && /\?/.test(t);
}

function userIndicatedFirstVisitOrNoKnowledge(text: string): boolean {
  const t = (text || "").trim().toLowerCase();
  if (!t) return false;
  if (/^(n[aã]o|nao|nunca|ainda n[aã]o)\b/.test(t)) return true;
  if (/\bprimeira\s+vez\b/.test(t)) return true;
  if (/\bn[aã]o\s+conhe[cç]o\b/.test(t)) return true;
  if (/\bnunca\s+fui\b/.test(t)) return true;
  if (/\bainda\s+n[aã]o\b/.test(t)) return true;
  return false;
}

function assistantClaimsVideoDelivery(text: string): boolean {
  const head = (text || "").slice(0, 800);
  return /\b(esse\s+v[ií]deo|este\s+v[ií]deo|segue(?:m)?\s+o\s+v[ií]deo|v[ií]deo\s+mostra|apresenta[cç][aã]o\s+do\s+resort|estrutura\s+do\s+resort|tour\s+em\s+v[ií]deo)\b/i.test(
    head
  );
}

export function shouldInjectSuiteGalleryVideos(params: {
  assistantText: string;
  videoUrls: string[];
  lastUserMessage: string;
}): boolean {
  const { assistantText, videoUrls, lastUserMessage } = params;
  if (videoUrls.length === 0) return false;
  if (extractVideoUrlsFromText(assistantText || "").length > 0) return false;
  if (userLikelyAskedForVideo(lastUserMessage)) return true;
  if (userIndicatedFirstVisitOrNoKnowledge(lastUserMessage)) return true;
  if (assistantClaimsVideoDelivery(assistantText || "")) return true;
  return false;
}

export function injectSuiteGalleryVideosIfMissing(params: {
  assistantText: string;
  toolResultStrings: string[];
  lastUserMessage: string;
}): { appended: string; fullText: string } | null {
  const videoUrls = collectSuiteGalleryVideoUrlsFromToolResults(params.toolResultStrings);
  const assistantStripped = stripBrokenMarkdownImageLines(params.assistantText || "");
  if (
    !shouldInjectSuiteGalleryVideos({
      assistantText: assistantStripped,
      videoUrls,
      lastUserMessage: params.lastUserMessage,
    })
  ) {
    return null;
  }
  const block = videoUrls.join("\n");
  const sep = assistantStripped.trim() ? "\n\n" : "";
  const appended = `${sep}${block}`;
  return {
    appended,
    fullText: `${assistantStripped}${appended}`,
  };
}

function userLikelyAskedForPhotos(text: string): boolean {
  const t = (text || "").toLowerCase();
  if (/\b(todas|todos|cada\s+uma|todas\s+as|as\s+3|as\s+tr[êe]s)\b/.test(t)) return true;
  if (/^\s*quero\s+fotos?\s*$/i.test((text || "").trim())) return true;
  if (/\bquero\s+fotos?\b/.test(t)) return true;
  if (/\b(tem|mostra|mostrar|manda)\b/.test(t) && /\bfotos?\b/.test(t)) return true;
  if (/\b(primeira\s+vez|não\s+conheço|nunca\s+fui)\b/.test(t) && /\bfotos?\b/.test(t)) return true;
  if (/\b(quero|queria|manda|mandar|mande|mostra|mostrar|envia|enviar|ver|pedir|pedi|gostaria)\b/.test(t) &&
    /\b(fotos?|imagens?|galeria|su[ií]te|suites?|quarto|acomod)\b/.test(t)) {
    return true;
  }
  if (/\b(tem|tem\s+fotos?|fotos?\s*\?|imagem)\b/.test(t) && /\b(fotos?|imagens?)\b/.test(t)) return true;
  return false;
}

function assistantClaimsPhotoDelivery(text: string): boolean {
  const head = (text || "").slice(0, 800);
  return /\b(aqui est[aã]o|aqui estao|seguem as fotos|segue(?:m)?\s+(?:uma\s+)?foto|fotos das acomoda[cç][oõ]es|algumas fotos da|segue(?:m)?\s+o\s+material|segue(?:m)?\s+as\s+imagens?|as\s+fotos?\s+(da|das|do)\s+su[ií]te)\b/i.test(
    head
  );
}

export function shouldInjectSuiteGalleryMarkdown(params: {
  assistantText: string;
  galleryMarkdown: string;
  lastUserMessage: string;
}): boolean {
  const { assistantText, galleryMarkdown, lastUserMessage } = params;
  if (!galleryMarkdown.trim()) return false;
  if (hasAtLeastOneCompleteMarkdownHttpImage(assistantText || "")) return false;
  if (userLikelyAskedForPhotos(lastUserMessage) || assistantClaimsPhotoDelivery(assistantText || "")) return true;
  return false;
}

export function injectSuiteGalleryMarkdownIfMissing(params: {
  assistantText: string;
  toolResultStrings: string[];
  lastUserMessage: string;
}): { appended: string; fullText: string } | null {
  const galleryMd = collectSuiteGalleryMarkdownFromToolResults(params.toolResultStrings);
  const assistantStripped = stripBrokenMarkdownImageLines(params.assistantText || "");
  if (!shouldInjectSuiteGalleryMarkdown({
    assistantText: assistantStripped,
    galleryMarkdown: galleryMd,
    lastUserMessage: params.lastUserMessage,
  })) {
    return null;
  }
  const sep = assistantStripped.trim() ? "\n\n" : "";
  const appended = `${sep}${galleryMd}`;
  return {
    appended,
    fullText: `${assistantStripped}${appended}`,
  };
}
