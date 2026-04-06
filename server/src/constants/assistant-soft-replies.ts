/**
 * Mensagens de recuperação quando não há resposta utilizável do modelo.
 * Tom humano, sem expor falha técnica — aplicável a todos os tenants.
 */

export const SOFT_REPLY_VARIANTS = [
  "Recebi sua mensagem — pode repetir em outras palavras o que você precisa agora? Assim consigo te ajudar melhor.",
  "Só para alinhar certinho: o que você gostaria que a gente resolvesse neste momento?",
  "Tudo bem! Me conta com calma o próximo passo ou a dúvida, que eu sigo por aqui com você.",
  "Certo! Reformula pra mim o que você precisa agora, pode ser?",
  "Entendi. Pode detalhar um pouco mais o que você quer fazer a seguir?",
] as const;

const LEGACY_FALLBACK_SUBSTRINGS = ["tive um problema na última", "pode me reenviar"] as const;

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return Math.abs(h);
}

export function pickSoftReply(seed?: string | null): string {
  const variants = SOFT_REPLY_VARIANTS as readonly string[];
  if (!seed?.trim()) return variants[0];
  return variants[hashSeed(seed) % variants.length];
}

export function isPlatformSoftFallback(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  for (const leg of LEGACY_FALLBACK_SUBSTRINGS) {
    if (lower.includes(leg)) return true;
  }
  return (SOFT_REPLY_VARIANTS as readonly string[]).some((v) => t === v);
}
