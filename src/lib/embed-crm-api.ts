import { getApiBase } from "@/lib/api-client";

export interface EmbedCrmCredentials {
  embedKey: string;
  accountId: string;
}

function toEmbedPath(endpoint: string): string {
  if (!endpoint.startsWith("/crm-contacts/")) return endpoint;
  return endpoint.replace(/^\/crm-contacts\//, "/embed/chatwoot/crm/contacts/");
}

export async function embedCrmFetch<T = unknown>(
  endpoint: string,
  creds: EmbedCrmCredentials,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;
  const embedPath = toEmbedPath(endpoint);
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

export async function lookupEmbedCrmContact(
  creds: EmbedCrmCredentials,
  phone: string,
): Promise<{
  state: "missing" | "lead" | "client";
  contact: import("@/types/database").Contact | null;
  tenant_id: string | null;
}> {
  const base = getApiBase();
  const params = new URLSearchParams({
    key: creds.embedKey,
    account_id: creds.accountId,
    phone,
  });
  const res = await fetch(`${base}/embed/chatwoot/crm/lookup?${params}`, {
    headers: { "x-chatwoot-mirror-key": creds.embedKey },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Erro ${res.status}`);
  }
  return res.json();
}

export async function promoteEmbedCrmContact(
  creds: EmbedCrmCredentials,
  input: { phone: string; name?: string; email?: string },
): Promise<{
  state: "client";
  contact: import("@/types/database").Contact;
  tenant_id: string;
}> {
  const base = getApiBase();
  const params = new URLSearchParams({
    key: creds.embedKey,
    account_id: creds.accountId,
  });
  const res = await fetch(`${base}/embed/chatwoot/crm/promote?${params}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-chatwoot-mirror-key": creds.embedKey,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `Erro ${res.status}`);
  }
  return res.json();
}
