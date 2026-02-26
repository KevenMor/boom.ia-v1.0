// Catálogo de modelos por provider
export const providerModels: Record<string, { label: string; models: { value: string; label: string; description: string }[] }> = {
  "Google Gemini": {
    label: "Google Gemini",
    models: [
      { value: "gemini-3-pro-preview", label: "Gemini 3 Pro Preview", description: "Próxima geração, máxima capacidade" },
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview", description: "Próxima geração, rápido e eficiente" },
      { value: "gemini-2.5-pro-preview-06-05", label: "Gemini 2.5 Pro", description: "Thinking model mais avançado" },
      { value: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash", description: "Thinking rápido e econômico" },
      { value: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite", description: "Ultra econômico, alto volume" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", description: "Rápido, multimodal, uso geral" },
      { value: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", description: "Mais leve e econômico" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", description: "Contexto longo (2M tokens)" },
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", description: "Rápido, contexto longo" },
      { value: "gemini-1.5-flash-8b", label: "Gemini 1.5 Flash 8B", description: "Ultra leve, alto volume" },
    ],
  },
  OpenAI: {
    label: "OpenAI",
    models: [
      { value: "gpt-4o", label: "GPT-4o", description: "Multimodal flagship" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "Rápido e econômico" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo", description: "Alta capacidade" },
      { value: "o1", label: "o1", description: "Raciocínio avançado" },
      { value: "o1-mini", label: "o1 Mini", description: "Raciocínio rápido" },
    ],
  },
  Anthropic: {
    label: "Anthropic",
    models: [
      { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", description: "Último modelo" },
      { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", description: "Equilíbrio qualidade/velocidade" },
      { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", description: "Ultra rápido" },
      { value: "claude-3-opus-20240229", label: "Claude 3 Opus", description: "Máxima qualidade" },
    ],
  },
  Groq: {
    label: "Groq",
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", description: "Versátil, inferência rápida" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B", description: "Ultra rápido" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B", description: "MoE, contexto longo" },
      { value: "gemma2-9b-it", label: "Gemma 2 9B", description: "Google, compacto" },
    ],
  },
};

export function getModelsForProvider(providerName: string | undefined): { value: string; label: string; description: string }[] {
  if (!providerName) return [];
  return providerModels[providerName]?.models ?? [];
}
