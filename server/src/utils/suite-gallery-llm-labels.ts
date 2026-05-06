/**
 * Rótulos e regras para suite_gallery_query: o modelo não deve expor nomes operacionais
 * do painel (ex.: "Imagem inicial conversa") como se fossem "áreas" para o hóspede.
 */

function normalizeAsciiKey(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Galerias só para sistema (boas-vindas, capa etc.) — não entram em menu de fotos ao cliente. */
export function isGalleryExcludedFromClientCatalog(panelName: string): boolean {
  const n = normalizeAsciiKey(panelName);
  if (!n) return false;
  if (n.includes("imagem") && n.includes("inicial")) return true;
  if (n.includes("inicial") && n.includes("conversa")) return true;
  if (n.includes("boas") && n.includes("vindas")) return true;
  if (n.includes("capa") && (n.includes("chat") || n.includes("conversa"))) return true;
  if (/\bwelcome\b/.test(n)) return true;
  if (n.includes("mensagem") && n.includes("inicial")) return true;
  if (n.includes("thumb") && n.includes("only")) return true;
  return false;
}

const INSTITUTIONAL_RE = /\binstitucional\b/i;

/**
 * Texto curto para listar ao cliente e para alt de imagem quando não há descrição útil.
 * Nunca substitui o nome real no painel (`name`) usado na ferramenta.
 */
export function galleryRotuloParaCliente(panelName: string, description?: string | null): string | null {
  if (isGalleryExcludedFromClientCatalog(panelName)) return null;

  const d = typeof description === "string" ? description.trim() : "";
  if (d) {
    const line = d.split(/\r?\n/)[0]?.trim() ?? "";
    if (
      line.length >= 3 &&
      line.length <= 120 &&
      !/^https?:\/\//i.test(line) &&
      !line.includes("](") &&
      !line.includes("`")
    ) {
      return line;
    }
  }

  const raw = panelName.replace(/_/g, " ").trim();
  if (!raw) return null;

  if (INSTITUTIONAL_RE.test(raw)) {
    return "Apresentação do resort (fotos e vídeo)";
  }

  return raw;
}
