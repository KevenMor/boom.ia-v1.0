const OPENAI_WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const GEMINI_TRANSCRIBE_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

interface TranscribeResult {
  text: string;
  error?: string;
}

/** Extrai base64 e mimeType de data URL (data:audio/webm;base64,...) */
function parseDataUrl(dataUrl: string): { data: string; mimeType: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1].trim(), data: match[2] };
}

/**
 * Transcreve áudio usando Gemini (mesma lógica de produção).
 * Usa inline_data com base64; fallback para Whisper se Gemini falhar ou não houver chave.
 */
async function transcribeWithGemini(audioUrl: string, apiKey: string): Promise<TranscribeResult> {
  try {
    let base64: string;
    let mimeType = "audio/webm";

    if (audioUrl.startsWith("data:")) {
      const parsed = parseDataUrl(audioUrl);
      if (!parsed) return { text: "", error: "Data URL inválida" };
      base64 = parsed.data;
      mimeType = parsed.mimeType;
    } else {
      const audioResp = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
      if (!audioResp.ok) return { text: "", error: `Failed to download audio: HTTP ${audioResp.status}` };
      const buffer = await audioResp.arrayBuffer();
      if (buffer.byteLength < 100) return { text: "", error: "Audio file too small" };
      if (buffer.byteLength > 20 * 1024 * 1024) return { text: "", error: "Audio file too large (max 20MB)" };
      base64 = Buffer.from(buffer).toString("base64");
      const ct = audioResp.headers.get("content-type") || "";
      if (ct.includes("webm")) mimeType = "audio/webm";
      else if (ct.includes("mp3") || ct.includes("mpeg")) mimeType = "audio/mpeg";
      else if (ct.includes("ogg")) mimeType = "audio/ogg";
      else if (ct.includes("wav")) mimeType = "audio/wav";
    }

    const body = {
      contents: [{
        parts: [
          { inlineData: { mimeType, data: base64 } },
          { text: "Transcreva este áudio em português. Retorne APENAS o texto transcrito, sem explicações, sem aspas, sem formatação." },
        ],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 1024 },
    };

    const resp = await fetch(`${GEMINI_TRANSCRIBE_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });

    if (!resp.ok) {
      const errBody = await resp.text().catch(() => "");
      console.error("[Transcribe] Gemini API error:", resp.status, errBody.slice(0, 200));
      return { text: "", error: `Gemini API error: ${resp.status}` };
    }

    const json = await resp.json();
    const textPart = json.candidates?.[0]?.content?.parts?.find((p: any) => p.text);
    const text = (textPart?.text || "").trim();
    console.log("[Transcribe] Gemini success, length:", text.length, "preview:", text.slice(0, 80));
    return { text };
  } catch (e: any) {
    console.error("[Transcribe] Gemini error:", e?.message || e);
    return { text: "", error: e?.message || "Gemini transcription failed" };
  }
}

/**
 * Transcreve áudio usando OpenAI Whisper (fallback).
 */
async function transcribeWithWhisper(audioUrl: string, apiKey: string): Promise<TranscribeResult> {
  try {
    const audioResp = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
    if (!audioResp.ok) return { text: "", error: `Failed to download audio: HTTP ${audioResp.status}` };
    const contentType = audioResp.headers.get("content-type") || "audio/ogg";
    const buffer = await audioResp.arrayBuffer();
    if (buffer.byteLength < 100) return { text: "", error: "Audio file too small" };
    if (buffer.byteLength > 25 * 1024 * 1024) return { text: "", error: "Audio file too large (max 25MB)" };
    const ext = contentType.includes("webm") ? "webm" : contentType.includes("mp3") ? "mp3" : contentType.includes("wav") ? "wav" : "ogg";
    const formData = new FormData();
    formData.append("file", new Blob([buffer], { type: contentType }), `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");
    formData.append("response_format", "text");
    const whisperResp = await fetch(OPENAI_WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });
    if (!whisperResp.ok) {
      const errBody = await whisperResp.text().catch(() => "");
      console.error("[Transcribe] Whisper API error:", whisperResp.status, errBody.slice(0, 200));
      return { text: "", error: `Whisper API error: ${whisperResp.status}` };
    }
    const text = (await whisperResp.text()).trim();
    console.log("[Transcribe] Whisper success, length:", text.length);
    return { text };
  } catch (e: any) {
    console.error("[Transcribe] Whisper error:", e?.message || e);
    return { text: "", error: e?.message || "Whisper transcription failed" };
  }
}

/**
 * Transcreve áudio. Usa Gemini se GEMINI_API_KEY disponível (produção); fallback para Whisper.
 */
export async function transcribeAudio(audioUrl: string, apiKey?: string): Promise<TranscribeResult> {
  const geminiKey = apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    const result = await transcribeWithGemini(audioUrl, geminiKey);
    if (result.text) return result;
    if (openaiKey) {
      console.log("[Transcribe] Gemini falhou, tentando Whisper...");
      return transcribeWithWhisper(audioUrl, openaiKey);
    }
    return result;
  }

  if (openaiKey) {
    return transcribeWithWhisper(audioUrl, apiKey || openaiKey);
  }

  return { text: "", error: "Nenhuma chave de transcrição (GEMINI_API_KEY ou OPENAI_API_KEY)" };
}

/**
 * Checks if an attachment is an audio file that can be transcribed.
 */
export function isAudioAttachment(attachment: { file_type?: string; data_url?: string }): boolean {
  if (!attachment.data_url) return false;
  return attachment.file_type === "audio";
}
