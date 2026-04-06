import type { SupabaseClient } from "@supabase/supabase-js";
import { msgLog } from "../utils/flow-logger.js";

/**
 * Resolve API key + base URL for an LLM provider (DB ou env fallback).
 * Usado por chat-local, fila e recuperação de fallback.
 */
export async function getProviderApiKey(
  providerId: string | null,
  supabase: SupabaseClient
): Promise<{ apiKey: string; baseUrl: string } | null> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (providerId) {
    const { data: provider } = await supabase
      .from("providers")
      .select("base_url, api_key_encrypted")
      .eq("id", providerId)
      .single();

    if (provider) {
      let apiKey = "";
      const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;
      if (provider.api_key_encrypted && encryptionKey) {
        try {
          const { decrypt } = await import("./crypto.js");
          apiKey = await decrypt(provider.api_key_encrypted, encryptionKey);
        } catch (err) {
          const isGemini = /generativelanguage|googleapis/i.test(provider.base_url || "");
          apiKey = isGemini ? (geminiKey || openaiKey || "") : (openaiKey || geminiKey || "");
          if (apiKey) {
            msgLog.decryptFallback(providerId);
          } else {
            console.error("[ProviderAPI] Falha ao descriptografar chave do provider:", providerId, err);
          }
        }
      } else {
        const isGemini = /generativelanguage|googleapis/i.test(provider.base_url || "");
        apiKey = isGemini ? (geminiKey || openaiKey || "") : (openaiKey || geminiKey || "");
      }
      const baseUrl = (provider.base_url || "https://api.openai.com/v1").replace(/\/+$/, "");
      if (apiKey) return { apiKey, baseUrl };
    }
  }

  if (openaiKey) {
    return { apiKey: openaiKey, baseUrl: "https://api.openai.com/v1" };
  }
  if (geminiKey) {
    return { apiKey: geminiKey, baseUrl: "https://generativelanguage.googleapis.com/v1beta" };
  }
  return null;
}
