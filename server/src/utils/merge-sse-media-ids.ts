/** Acumula ids de mídia quando o SSE envia mais de um evento `media_commands` no mesmo stream. */
export function appendMediaIdsFromSseEvent(
  capturedPhotoIds: string[],
  capturedVideoIds: string[],
  mediaCommands: { photo_inventory_ids?: unknown; video_inventory_ids?: unknown }
): void {
  const p = Array.isArray(mediaCommands.photo_inventory_ids) ? mediaCommands.photo_inventory_ids : [];
  const v = Array.isArray(mediaCommands.video_inventory_ids) ? mediaCommands.video_inventory_ids : [];
  for (const id of p) {
    if (typeof id !== "string") continue;
    const t = id.trim();
    if (t && !capturedPhotoIds.includes(t)) capturedPhotoIds.push(t);
  }
  for (const id of v) {
    if (typeof id !== "string") continue;
    const t = id.trim();
    if (t && !capturedVideoIds.includes(t)) capturedVideoIds.push(t);
  }
}
