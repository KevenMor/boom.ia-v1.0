const OPENAI_WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";

interface TranscribeResult {
  text: string;
  error?: string;
}

/**
 * Downloads an audio file from a URL and transcribes it using OpenAI Whisper.
 * Returns the transcribed text or an error.
 */
export async function transcribeAudio(audioUrl: string, apiKey?: string): Promise<TranscribeResult> {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    return { text: "", error: "No OpenAI API key for transcription" };
  }

  try {
    const audioResp = await fetch(audioUrl, { signal: AbortSignal.timeout(30_000) });
    if (!audioResp.ok) {
      return { text: "", error: `Failed to download audio: HTTP ${audioResp.status}` };
    }

    const contentType = audioResp.headers.get("content-type") || "audio/ogg";
    const buffer = await audioResp.arrayBuffer();
    if (buffer.byteLength < 100) {
      return { text: "", error: "Audio file too small" };
    }
    if (buffer.byteLength > 25 * 1024 * 1024) {
      return { text: "", error: "Audio file too large (max 25MB)" };
    }

    const ext = contentType.includes("mp4") || contentType.includes("m4a")
      ? "m4a"
      : contentType.includes("mpeg") || contentType.includes("mp3")
        ? "mp3"
        : contentType.includes("webm")
          ? "webm"
          : contentType.includes("wav")
            ? "wav"
            : "ogg";

    const blob = new Blob([buffer], { type: contentType });
    const formData = new FormData();
    formData.append("file", blob, `audio.${ext}`);
    formData.append("model", "whisper-1");
    formData.append("language", "pt");
    formData.append("response_format", "text");

    const whisperResp = await fetch(OPENAI_WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });

    if (!whisperResp.ok) {
      const errBody = await whisperResp.text().catch(() => "");
      console.error("[Transcribe] Whisper API error:", whisperResp.status, errBody.slice(0, 200));
      return { text: "", error: `Whisper API error: ${whisperResp.status}` };
    }

    const text = (await whisperResp.text()).trim();
    console.log("[Transcribe] Success, length:", text.length, "preview:", text.slice(0, 80));
    return { text };
  } catch (e: any) {
    console.error("[Transcribe] Error:", e?.message || e);
    return { text: "", error: e?.message || "Transcription failed" };
  }
}

/**
 * Checks if an attachment is an audio file that can be transcribed.
 */
export function isAudioAttachment(attachment: { file_type?: string; data_url?: string }): boolean {
  if (!attachment.data_url) return false;
  return attachment.file_type === "audio";
}
