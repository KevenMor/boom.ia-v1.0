import { getApiBase } from "@/lib/api-client";

export interface EmbedInventoryCredentials {
  embedKey: string;
  accountId: string;
}

export async function embedInventoryFetch<T = unknown>(
  endpoint: string,
  creds: EmbedInventoryCredentials,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;
  const path = endpoint.startsWith("/inventory")
    ? endpoint.replace(/^\/inventory/, "/embed/chatwoot/inventory")
    : endpoint;

  const base = getApiBase();
  const url = new URL(`${base}${path.startsWith("/") ? "" : "/"}${path}`);
  url.searchParams.set("key", creds.embedKey);
  url.searchParams.set("account_id", creds.accountId);

  const res = await fetch(url.toString(), {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-chatwoot-mirror-key": creds.embedKey,
      ...headers,
    },
    body: method !== "GET" && body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    let message = errText;
    try {
      const parsed = JSON.parse(errText) as { error?: string };
      if (parsed.error) message = parsed.error;
    } catch {
      /* keep raw */
    }
    throw new Error(message || `API error: ${res.status}`);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as Promise<T>;
}

export async function bootstrapEmbedInventory(creds: EmbedInventoryCredentials): Promise<{
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  account_id: string;
}> {
  const base = getApiBase();
  const params = new URLSearchParams({
    key: creds.embedKey,
    account_id: creds.accountId,
  });
  const res = await fetch(`${base}/embed/chatwoot/inventory/bootstrap?${params}`, {
    headers: { "x-chatwoot-mirror-key": creds.embedKey },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Erro ${res.status}`);
  }
  return res.json();
}
