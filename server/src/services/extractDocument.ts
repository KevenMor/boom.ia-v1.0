/**
 * Extrai dados de documentos (RG, CNH, comprovante de endereço) de imagens e PDFs
 * usando Gemini Vision. Usado para preencher o resumo de matrícula da autoescola.
 */

const GEMINI_EXTRACT_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

const EXTRACT_PROMPT = `Analise este documento (RG, CNH ou comprovante de endereço) e extraia os dados em formato estruturado.
Retorne APENAS um bloco JSON válido, sem markdown, sem explicações, com as chaves exatamente como abaixo.
Para RG ou CNH: extraia nome_completo, cpf, rg_numero, rg_orgao_emissor. Se não conseguir ler algum campo, use null.
Para comprovante de endereço: extraia endereco_completo (logradouro, número, bairro, cidade, UF, CEP). Se não for comprovante, retorne {}.
Formato esperado:
{"nome_completo": "string ou null", "cpf": "string ou null", "rg_numero": "string ou null", "rg_orgao_emissor": "string ou null", "endereco_completo": "string ou null"}`;

export interface ExtractedDocumentData {
  nome_completo?: string | null;
  cpf?: string | null;
  rg_numero?: string | null;
  rg_orgao_emissor?: string | null;
  endereco_completo?: string | null;
}

export interface ExtractDocumentResult {
  data: ExtractedDocumentData;
  rawText?: string;
  error?: string;
}

/** Extrai base64 e mimeType de data URL */
function parseDataUrl(dataUrl: string): { data: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1].trim(), data: match[2] };
}

/** Mapeia file_type do Chatwoot para mimeType do Gemini */
function inferMimeType(attachment: { file_type?: string; data_url?: string }): string {
  if (attachment.data_url?.startsWith("data:")) {
    const parsed = parseDataUrl(attachment.data_url);
    if (parsed) return parsed.mimeType;
  }
  const ft = (attachment.file_type || "").toLowerCase();
  if (ft === "image" || ft === "jpg" || ft === "jpeg") return "image/jpeg";
  if (ft === "png") return "image/png";
  if (ft === "webp") return "image/webp";
  if (ft === "gif") return "image/gif";
  if (ft === "pdf") return "application/pdf";
  if (ft === "file") return "application/pdf"; // PDFs às vezes vêm como "file"
  return "image/jpeg"; // fallback
}

function parseExtractedJson(text: string): ExtractedDocumentData {
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    return {
      nome_completo: (parsed.nome_completo as string) ?? null,
      cpf: (parsed.cpf as string) ?? null,
      rg_numero: (parsed.rg_numero as string) ?? null,
      rg_orgao_emissor: (parsed.rg_orgao_emissor as string) ?? null,
      endereco_completo: (parsed.endereco_completo as string) ?? null,
    };
  } catch {
    return {};
  }
}

async function extractWithGemini(
  dataUrl: string,
  mimeType: string,
  apiKey: string
): Promise<ExtractDocumentResult> {
  try {
    let base64: string;

    if (dataUrl.startsWith("data:")) {
      const parsed = parseDataUrl(dataUrl);
      if (!parsed) return { data: {}, error: "Data URL inválida" };
      base64 = parsed.data;
      mimeType = parsed.mimeType;
    } else {
      const resp = await fetch(dataUrl, { signal: AbortSignal.timeout(30_000) });
      if (!resp.ok) return { data: {}, error: `Fetch failed: HTTP ${resp.status}` };
      const buffer = await resp.arrayBuffer();
      if (buffer.byteLength < 100) return { data: {}, error: "Arquivo muito pequeno" };
      if (buffer.byteLength > 20 * 1024 * 1024) return { data: {}, error: "Arquivo muito grande (max 20MB)" };
      base64 = Buffer.from(buffer).toString("base64");
      const ct = resp.headers.get("content-type") || "";
      if (ct.includes("pdf")) mimeType = "application/pdf";
      else if (ct.includes("png")) mimeType = "image/png";
      else if (ct.includes("webp")) mimeType = "image/webp";
      else if (ct.includes("jpeg") || ct.includes("jpg")) mimeType = "image/jpeg";
    }

    const body = {
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: EXTRACT_PROMPT },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
    };

    const resp = await fetch(`${GEMINI_EXTRACT_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("[ExtractDocument] Gemini API error:", resp.status, errBody.slice(0, 200));
      return { data: {}, error: `Gemini API error: ${resp.status}` };
    }

    const json = await resp.json();
    const textPart = json.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text);
    const rawText = (textPart?.text || "").trim();
    const data = parseExtractedJson(rawText);
    const hasAny = Object.values(data).some((v) => v != null && String(v).trim() !== "");
    console.log("[ExtractDocument] Gemini success, extracted:", hasAny ? Object.keys(data).filter((k) => data[k as keyof ExtractedDocumentData]) : "nenhum dado");
    return { data, rawText };
  } catch (e: unknown) {
    const msg = (e as Error)?.message || "Extract failed";
    console.error("[ExtractDocument] Error:", msg);
    return { data: {}, error: msg };
  }
}

/**
 * Extrai dados de um documento (imagem ou PDF).
 * Retorna objeto com nome_completo, cpf, rg_numero, rg_orgao_emissor, endereco_completo.
 */
export async function extractDocument(
  dataUrl: string,
  attachment?: { file_type?: string; data_url?: string },
  apiKey?: string
): Promise<ExtractDocumentResult> {
  const key = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) return { data: {}, error: "GEMINI_API_KEY não configurada" };

  const mimeType = attachment ? inferMimeType(attachment) : "image/jpeg";
  return extractWithGemini(dataUrl, mimeType, key);
}

/**
 * Converte dados extraídos em texto para anexar à mensagem do usuário.
 */
export function formatExtractedForMessage(data: ExtractedDocumentData): string {
  const parts: string[] = [];
  if (data.nome_completo) parts.push(`nome_completo: ${data.nome_completo}`);
  if (data.cpf) parts.push(`cpf: ${data.cpf}`);
  if (data.rg_numero) parts.push(`rg_numero: ${data.rg_numero}`);
  if (data.rg_orgao_emissor) parts.push(`rg_orgao_emissor: ${data.rg_orgao_emissor}`);
  if (data.endereco_completo) parts.push(`endereco_completo: ${data.endereco_completo}`);
  if (parts.length === 0) return "";
  return `[Dados extraídos do documento]: ${parts.join(" | ")}`;
}

/**
 * Verifica se o attachment é imagem ou PDF (documento para extração).
 */
export function isImageOrPdfAttachment(attachment: { file_type?: string; data_url?: string }): boolean {
  if (!attachment.data_url) return false;
  const ft = (attachment.file_type || "").toLowerCase();
  if (ft === "image" || ft === "jpg" || ft === "jpeg" || ft === "png" || ft === "webp" || ft === "gif") return true;
  if (ft === "pdf" || ft === "file") return true;
  if (attachment.data_url.startsWith("data:image/")) return true;
  if (attachment.data_url.startsWith("data:application/pdf")) return true;
  return false;
}
