/**
 * Metadados de fotos de inventário enviadas ao cliente (anti-repetição).
 * Usado pelo chat-local (injeção no system) e pela fila /queue/process (persistência em produção).
 */

export type PhotosSentEntry = { id: string; name: string };

export type InventoryRowForPhotos = {
  id: string;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
};

export function buildPhotosSentMeta(
  photoInventoryIds: string[],
  invRows: InventoryRowForPhotos[] | null | undefined
): PhotosSentEntry[] {
  const byId = new Map((invRows ?? []).map((r) => [r.id, r]));
  const seen = new Set<string>();
  const out: PhotosSentEntry[] = [];
  for (const id of photoInventoryIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = byId.get(id);
    const name = row ? [row.brand, row.model, row.version].filter(Boolean).join(" ").trim() : "";
    out.push({ id, name: name || "Veículo" });
  }
  return out;
}

export type HistoryMessageWithPhotosMeta = {
  role: string;
  metadata?: { photos_sent?: PhotosSentEntry[] } | null;
};

/**
 * Sufixo de system prompt listando veículos cujo pacote de fotos já foi enviado (por id de estoque).
 */
export function buildFotosJaEnviadasSystemSuffix(histMsgs: HistoryMessageWithPhotosMeta[] | null | undefined): string {
  if (!histMsgs?.length) return "";
  const seenIds = new Set<string>();
  const parts: string[] = [];
  for (const msg of histMsgs) {
    if (msg.role !== "assistant" || !msg.metadata?.photos_sent?.length) continue;
    for (const p of msg.metadata.photos_sent) {
      if (!p?.id || seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      const label = (p.name || "Veículo").trim() || "Veículo";
      parts.push(`${label} (id: ${p.id})`);
    }
  }
  if (parts.length === 0) return "";
  return (
    `\n\nFOTOS JÁ ENVIADAS NESTA CONVERSA: ${parts.join("; ")}. ` +
    "Não reenvie o mesmo pacote de fotos desses veículos sem pedido explícito do cliente " +
    '(ex.: "manda de novo", "mais fotos", "outro ângulo", "manda de novo as fotos"). ' +
    "Se o cliente pedir explicitamente de novo, aí sim pode usar ENVIAR_FOTOS_VEICULO para o mesmo id."
  );
}
