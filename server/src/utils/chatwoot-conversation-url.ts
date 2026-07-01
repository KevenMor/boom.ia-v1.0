export function buildChatwootConversationPath(
  accountId: string | number | null | undefined,
  conversationId: number | null | undefined,
): string | null {
  if (conversationId == null || !Number.isFinite(Number(conversationId))) return null;
  const acct = String(accountId ?? "").trim();
  if (!acct) return null;
  return `/app/accounts/${acct}/conversations/${conversationId}`;
}

export function buildChatwootConversationUrl(
  baseUrl: string | null | undefined,
  accountId: string | number | null | undefined,
  conversationId: number | null | undefined,
  opts?: { relative?: boolean },
): string | null {
  const path = buildChatwootConversationPath(accountId, conversationId);
  if (!path) return null;
  if (opts?.relative) return path;

  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) return null;
  return `${base}${path}`;
}
