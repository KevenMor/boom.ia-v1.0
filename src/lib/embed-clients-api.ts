import { getApiBase } from "@/lib/api-client";

export interface EmbedClientsCredentials {
  embedKey: string;
  accountId: string;
}

function toEmbedClientsListPath(endpoint: string): string {
  if (!endpoint.startsWith("/crm-contacts")) return endpoint;
  const qIndex = endpoint.indexOf("?");
  const qs = qIndex >= 0 ? endpoint.slice(qIndex) : "";
  return `/embed/chatwoot/clients${qs}`;
}

export async function embedClientsFetch<T = unknown>(
  endpoint: string,
  creds: EmbedClientsCredentials,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;
  const embedPath = toEmbedClientsListPath(endpoint);
  const base = getApiBase();
  const url = new URL(`${base}${embedPath.startsWith("/") ? "" : "/"}${embedPath}`);
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

export async function bootstrapEmbedClients(creds: EmbedClientsCredentials): Promise<{
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
  const res = await fetch(`${base}/embed/chatwoot/clients/bootstrap?${params}`, {
    headers: { "x-chatwoot-mirror-key": creds.embedKey },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Erro ${res.status}`);
  }
  return res.json();
}
