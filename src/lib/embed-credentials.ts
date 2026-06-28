export interface EmbedCredentials {
  key: string;
  accountId: string;
}

function readParamBag(raw: string): URLSearchParams {
  const cleaned = raw.replace(/^[?#]/, "");
  return new URLSearchParams(cleaned);
}

export function parseEmbedCredentialsFromLocation(loc: Location = window.location): EmbedCredentials {
  const search = readParamBag(loc.search);
  let key = search.get("key")?.trim() ?? "";
  let accountId = search.get("account_id")?.trim() ?? "";

  if (!key || !accountId) {
    const hash = readParamBag(loc.hash);
    key = key || hash.get("key")?.trim() || "";
    accountId = accountId || hash.get("account_id")?.trim() || "";
  }

  return { key, accountId };
}

export function parseEmbedInitMessage(data: unknown): Partial<EmbedCredentials> | null {
  if (!data || typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;
  if (obj.type !== "boom-ia-embed:init") return null;
  const out: Partial<EmbedCredentials> = {};
  if (obj.key != null && String(obj.key).trim()) out.key = String(obj.key).trim();
  if (obj.account_id != null && String(obj.account_id).trim()) {
    out.accountId = String(obj.account_id).trim();
  }
  return Object.keys(out).length ? out : null;
}

export function buildEmbedAppUrl(base: string, key: string, accountId: string): string {
  const root = base.replace(/\/+$/, "");
  const hash = new URLSearchParams({
    key,
    account_id: accountId,
  }).toString();
  return `${root}#${hash}`;
}
