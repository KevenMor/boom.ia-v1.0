// Detecta se realmente roda em localhost (window.location, não VITE_API_URL)
const isTrulyLocal =
  typeof window !== "undefined" &&
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);

const DEFAULT_PROD_API = "https://conexoesapp-server-boomia-lb.kgn6uc.easypanel.host/api";
const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const configuredIsLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(configuredApiUrl || "");
const PROD_API = !isTrulyLocal && configuredIsLocalhost
  ? DEFAULT_PROD_API
  : (configuredApiUrl || DEFAULT_PROD_API);

const API_BASE = isTrulyLocal
  ? "/api"
  : PROD_API;

export function getApiBase(): string {
  return API_BASE.replace(/\/+$/, "");
}

export async function callAPI<T = unknown>(
  endpoint: string,
  options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<T> {
  const { method = "POST", body, headers = {} } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${getApiBase()}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: method !== "GET" && body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `API error: ${res.status}`);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return res.json() as Promise<T>;
  }
  return res.text() as Promise<T>;
}
