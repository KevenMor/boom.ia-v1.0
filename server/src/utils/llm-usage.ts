/** Usage normalizado de stream OpenAI-compat (OpenAI, Gemini, etc.). */
export type LlmStreamUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_tokens?: number;
};

/** Extrai usage de um chunk SSE; Gemini 2.5+ envia cached_tokens em prompt_tokens_details. */
export function parseOpenAIStreamUsage(usage: unknown): LlmStreamUsage | null {
  if (!usage || typeof usage !== "object") return null;
  const u = usage as Record<string, unknown>;
  const prompt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const completion = typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  const total = typeof u.total_tokens === "number" ? u.total_tokens : prompt + completion;

  let cached: number | undefined;
  const details = u.prompt_tokens_details;
  if (details && typeof details === "object") {
    const cachedVal = (details as Record<string, unknown>).cached_tokens;
    if (typeof cachedVal === "number" && cachedVal > 0) {
      cached = cachedVal;
    }
  }

  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: total,
    ...(cached !== undefined ? { cached_tokens: cached } : {}),
  };
}

export function mergeLlmStreamUsage(
  acc: LlmStreamUsage,
  next: LlmStreamUsage | null | undefined,
): LlmStreamUsage {
  if (!next) return acc;
  return {
    prompt_tokens: acc.prompt_tokens + next.prompt_tokens,
    completion_tokens: acc.completion_tokens + next.completion_tokens,
    total_tokens: acc.total_tokens + next.total_tokens,
    cached_tokens: (acc.cached_tokens ?? 0) + (next.cached_tokens ?? 0),
  };
}
