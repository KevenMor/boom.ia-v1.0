// Em dev (localhost) usa /api relativo (proxy do Vite); em produção usa origem atual.
const isLocalhost =
  typeof window !== "undefined" &&
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);

const API_BASE =
  typeof window !== "undefined"
    ? (isLocalhost ? "/api" : `${window.location.origin}/api`)
    : (import.meta.env.VITE_API_URL || "http://localhost:3001/api");

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
