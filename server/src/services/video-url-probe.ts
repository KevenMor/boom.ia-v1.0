import { toDirectDownloadUrl } from "../utils/videoUrl.js";
import {
  classifyVideoDelivery,
  humanDeliveryLabelPt,
  type VideoDeliveryClass,
} from "../utils/videoDeliveryLimits.js";

const PROBE_TIMEOUT_MS = 12_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export type VideoProbeDeliveryMode = VideoDeliveryClass | "unknown";

export interface VideoProbeResult {
  ok: boolean;
  sizeBytes: number | null;
  deliveryMode: VideoProbeDeliveryMode;
  humanLabelPt: string;
  error?: string;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;

  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = h.match(ipv4);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

function parseContentRangeTotal(header: string | null): number | null {
  if (!header) return null;
  const m = header.trim().match(/\/(\d+)\s*$/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseContentLength(header: string | null): number | null {
  if (!header) return null;
  const n = parseInt(header.trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function looksLikeHtmlContentType(ct: string | null): boolean {
  return (ct || "").toLowerCase().includes("text/html");
}

/**
 * Estima tamanho e modo de envio WhatsApp (mesmas regras que sendChatwootVideoMessage).
 * Pode falhar em URLs do Drive com página de confirmação (HTML).
 */
export async function probeVideoUrl(rawUrl: string): Promise<VideoProbeResult> {
  const trimmed = (rawUrl || "").trim();
  if (!trimmed) {
    return {
      ok: false,
      sizeBytes: null,
      deliveryMode: "unknown",
      humanLabelPt: "Informe uma URL.",
      error: "empty_url",
    };
  }

  let resolved: string;
  try {
    resolved = toDirectDownloadUrl(trimmed);
  } catch {
    return {
      ok: false,
      sizeBytes: null,
      deliveryMode: "unknown",
      humanLabelPt: "URL inválida.",
      error: "invalid_url",
    };
  }

  let url: URL;
  try {
    url = new URL(resolved);
  } catch {
    return {
      ok: false,
      sizeBytes: null,
      deliveryMode: "unknown",
      humanLabelPt: "URL inválida.",
      error: "invalid_url",
    };
  }

  if (url.protocol !== "https:") {
    return {
      ok: false,
      sizeBytes: null,
      deliveryMode: "unknown",
      humanLabelPt: "Use apenas links https://",
      error: "https_only",
    };
  }

  if (isBlockedHostname(url.hostname)) {
    return {
      ok: false,
      sizeBytes: null,
      deliveryMode: "unknown",
      humanLabelPt: "Este endereço não é permitido.",
      error: "blocked_host",
    };
  }

  const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  const fetchInit = { redirect: "follow" as RequestRedirect, signal };

  let sizeBytes: number | null = null;

  try {
    const headResp = await fetch(resolved, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      ...fetchInit,
    });
    const ct = headResp.headers.get("content-type");
    if (!looksLikeHtmlContentType(ct)) {
      sizeBytes = parseContentLength(headResp.headers.get("content-length"));
    }
  } catch {
    // segue para Range
  }

  if (sizeBytes == null) {
    try {
      const getResp = await fetch(resolved, {
        method: "GET",
        headers: { "User-Agent": UA, Range: "bytes=0-0" },
        ...fetchInit,
      });
      const ct = getResp.headers.get("content-type");
      if (looksLikeHtmlContentType(ct)) {
        sizeBytes = null;
      } else {
        sizeBytes =
          parseContentRangeTotal(getResp.headers.get("content-range")) ??
          parseContentLength(getResp.headers.get("content-length"));
      }
    } catch {
      sizeBytes = null;
    }
  }

  if (sizeBytes == null) {
    return {
      ok: true,
      sizeBytes: null,
      deliveryMode: "unknown",
      humanLabelPt:
        "Não foi possível detectar o tamanho (comum em alguns links do Drive). No envio, o sistema tenta vídeo, arquivo ou link.",
    };
  }

  const deliveryMode = classifyVideoDelivery(sizeBytes);
  return {
    ok: true,
    sizeBytes,
    deliveryMode,
    humanLabelPt: humanDeliveryLabelPt(sizeBytes, deliveryMode),
  };
}
