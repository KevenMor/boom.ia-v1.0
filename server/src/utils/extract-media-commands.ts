/**
 * Extrai comandos ENVIAR_* do texto bruto do assistente (antes do sanitize).
 * Usado para SSE `media_commands` → fila → delivery (Chatwoot/WhatsApp).
 */
export function extractMediaCommandsFromAssistantRaw(raw: string): {
  photoInventoryIds: string[];
  videoInventoryIds: string[];
  photosSent: Array<{ id: string; name: string }>;
} {
  const photoIdRegex = /ENVIAR_FOTOS?_VEICULOS?[:\s]+([^|\n]+?)\s*\|\s*id:\s*([a-f0-9-]{36})/gi;
  const videoIdRegex = /ENVIAR_VIDEO_DETALHES[:\s]+[^|\n]+\|\s*id:\s*([a-f0-9-]{36})/gi;
  const photoInventoryIds: string[] = [];
  const videoInventoryIds: string[] = [];
  const photosSent: Array<{ id: string; name: string }> = [];
  let cmdMatch: RegExpExecArray | null;
  while ((cmdMatch = photoIdRegex.exec(raw)) !== null) {
    const [, photoName, photoId] = cmdMatch;
    if (photoId && !photoInventoryIds.includes(photoId)) {
      photoInventoryIds.push(photoId);
      photosSent.push({ id: photoId, name: (photoName ?? "").trim() });
    }
  }
  while ((cmdMatch = videoIdRegex.exec(raw)) !== null) {
    if (cmdMatch[1] && !videoInventoryIds.includes(cmdMatch[1])) videoInventoryIds.push(cmdMatch[1]);
  }
  return { photoInventoryIds, videoInventoryIds, photosSent };
}

export function emitMediaCommandsSseIfNeeded(
  sendSse: (payload: unknown) => void,
  raw: string
): Array<{ id: string; name: string }> {
  const { photoInventoryIds, videoInventoryIds, photosSent } = extractMediaCommandsFromAssistantRaw(raw);
  if (photoInventoryIds.length > 0 || videoInventoryIds.length > 0) {
    sendSse({ media_commands: { photo_inventory_ids: photoInventoryIds, video_inventory_ids: videoInventoryIds } });
  }
  return photosSent;
}
