export function buildChatwootConversationPath(
  accountId: string | number | null | undefined,
  conversationId: number | null | undefined,
): string | null {
  if (conversationId == null || !Number.isFinite(Number(conversationId))) return null;
  const acct = String(accountId ?? "").trim();
  if (!acct) return null;
  return `/app/accounts/${acct}/conversations/${conversationId}`;
}

/** Prioriza path relativo no Mega; fallback para URL absoluta da API. */
export function resolveMegaConversationNavigateUrl(
  preview: {
    chatwoot_url?: string | null;
    chatwoot_conversation_id?: number | null;
    chatwoot_account_id?: string | number | null;
  },
  embedAccountId?: string | null,
): string | null {
  const accountId = embedAccountId ?? preview.chatwoot_account_id;
  const fromIds = buildChatwootConversationPath(accountId, preview.chatwoot_conversation_id ?? null);
  if (fromIds) return fromIds;

  const absolute = preview.chatwoot_url?.trim();
  if (!absolute) return null;

  try {
    const parsed = new URL(absolute, "https://mega.atendai.app");
    if (/\/app\/accounts\/\d+\/conversations\/\d+/.test(parsed.pathname)) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    /* ignore */
  }

  return absolute;
}
