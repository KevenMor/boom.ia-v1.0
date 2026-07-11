import type { SupabaseClient } from "@supabase/supabase-js";
import { msgLog } from "../utils/flow-logger.js";

/** Base URL do endpoint OpenAI-compatível do Ollama (local ou túnel). Chave real não é obrigatória. */
function isOllamaOpenAiCompatibleBase(baseUrl: string): boolean {
  const u = baseUrl.trim().toLowerCase();
  return (
    u.includes("localhost:11434") ||
    u.includes("127.0.0.1:11434") ||
    u.includes(":11434/") ||
    u.includes(":11434") ||
    /\.local:11434/.test(u) ||
    /ollama\.(ai|cloud|run)\b/i.test(u)
  );
}

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
      .select("base_url, api_key_encrypted, name, model_default")
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
      if (isOllamaOpenAiCompatibleBase(baseUrl)) {
        return { apiKey: "ollama", baseUrl };
      }
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

export type ProviderRow = {
  name?: string | null;
  model_default?: string | null;
  base_url?: string | null;
};

/** Modelo efetivo do dispatcher: agente → tenant → provider.model_default → inferência por base_url. */
export function resolveDispatcherModel(
  agentDispatcherModel: string | undefined,
  tenantDispatcherModel: string | undefined,
  provider: ProviderRow | null | undefined,
): string {
  let model =
    (agentDispatcherModel || "").trim() ||
    (tenantDispatcherModel || "").trim() ||
    (provider?.model_default || "").trim();

  if (!model) {
    const base = provider?.base_url || "";
    if (/anthropic/i.test(base)) model = "claude-sonnet-4-20250514";
    else if (/generativelanguage|googleapis/i.test(base)) model = "gemini-2.0-flash";
    else model = "gpt-4o";
  }

  if (model === "gpt-4o-mini") model = "gpt-4o";
  return model;
}
