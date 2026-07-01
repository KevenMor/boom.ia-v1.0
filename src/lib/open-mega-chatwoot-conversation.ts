export type MegaNavigateMessage = {
  type: "boom-ia-embed:navigate";
  url: string;
};

export function isInsideParentEmbed(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}

/** Abre conversa no Chatwoot/Mega (parent) quando estamos dentro do iframe do Dashboard Script. */
export function openMegaChatwootConversation(url: string | null | undefined): boolean {
  const target = url?.trim();
  if (!target) return false;

  if (isInsideParentEmbed()) {
    const payload: MegaNavigateMessage = { type: "boom-ia-embed:navigate", url: target };
    window.parent.postMessage(payload, "*");
    return true;
  }

  window.location.assign(target);
  return true;
}
