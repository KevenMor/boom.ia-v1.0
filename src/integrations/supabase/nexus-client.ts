import { createClient } from "@supabase/supabase-js";

/** Painel aberto em localhost real (não confundir com build que embute VITE_API_URL apontando para localhost). */
function isTrulyLocalHost(): boolean {
  return typeof window !== "undefined" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);
}

const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const configuredIsLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(configuredApiUrl || "");
const safeApiUrl =
  typeof window !== "undefined" && !isTrulyLocalHost() && configuredIsLocalhost ? undefined : configuredApiUrl;

function apiUrlToOrigin(url: string): string {
  return url.replace(/\/api\/?$/, "").replace(/\/$/, "");
}

/** supabase-js exige URL absoluta; em dev costumamos usar path relativo `/api/supabase-proxy`. */
function resolveLocalProxyBase(): string {
  const raw = (import.meta.env.VITE_SUPABASE_PROXY_URL as string | undefined)?.trim() || "/api/supabase-proxy";
  if (/^https?:\/\//i.test(raw)) return raw.replace(/\/$/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  return `${origin.replace(/\/$/, "")}${path}`;
}

/**
 * Base do proxy Supabase (auth, REST, Storage).
 *
 * Em produção no browser, usar **sempre** o mesmo host que serve o SPA (`window.location.origin`).
 * Caso contrário, se `VITE_API_URL` não for passado no build do Docker, o fallback antigo apontava
 * para outro servidor — uploads iam para um Supabase e o painel lia outro (404 nas fotos).
 */
function resolveNexusProxyBase(): string {
  if (isTrulyLocalHost()) {
    return resolveLocalProxyBase();
  }

  const explicitFull = (import.meta.env.VITE_SUPABASE_PROXY_URL as string | undefined)?.trim();
  if (explicitFull && /^https?:\/\//i.test(explicitFull)) {
    return explicitFull.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin.replace(/\/$/, "")}/api/supabase-proxy`;
  }

  if (safeApiUrl) {
    return `${apiUrlToOrigin(safeApiUrl)}/api/supabase-proxy`;
  }

  return "http://localhost:8080/api/supabase-proxy";
}

const proxyBase = resolveNexusProxyBase();

const NEXUS_URL = proxyBase;
// Always use the Nexus (self-hosted) anon key — the proxy on the VPS should override,
// but older server versions may forward headers as-is, so we send the correct key from the client.
const NEXUS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

export const nexusDb = createClient(NEXUS_URL, NEXUS_ANON_KEY);

/** Base URL do Supabase (usa proxy no browser para evitar CORS) */
export const getSupabaseBaseUrl = () => proxyBase;
