import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { embedCrmFetch, type EmbedCrmCredentials } from "@/lib/embed-crm-api";
import { embedHospedagemFetch, type EmbedHospedagemCredentials } from "@/lib/embed-hospedagem-api";

let activeEmbedCrm: EmbedCrmCredentials | null = null;
let activeEmbedHospedagem: EmbedHospedagemCredentials | null = null;

export function setActiveEmbedCrm(creds: EmbedCrmCredentials | null): void {
  activeEmbedCrm = creds;
}

export function getActiveEmbedCrm(): EmbedCrmCredentials | null {
  return activeEmbedCrm;
}

export function setActiveEmbedHospedagem(creds: EmbedHospedagemCredentials | null): void {
  activeEmbedHospedagem = creds;
}

export function getActiveEmbedHospedagem(): EmbedHospedagemCredentials | null {
  return activeEmbedHospedagem;
}

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
  if (activeEmbedCrm && endpoint.startsWith("/crm-contacts")) {
    return embedCrmFetch<T>(endpoint, activeEmbedCrm, options);
  }

  if (activeEmbedHospedagem && endpoint.startsWith("/hospedagem")) {
    return embedHospedagemFetch<T>(endpoint, activeEmbedHospedagem, options);
  }

  const { method = "POST", body, headers = {} } = options;
  const url = endpoint.startsWith("http") ? endpoint : `${getApiBase()}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
  const resolvedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (!resolvedHeaders["x-nexus-auth"]) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      resolvedHeaders["x-nexus-auth"] = `Bearer ${session.access_token}`;
    }
  }

  const res = await fetch(url, {
    method,
    headers: resolvedHeaders,
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
