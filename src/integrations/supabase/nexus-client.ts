import { createClient } from "@supabase/supabase-js";

// Detecta se realmente roda em localhost (não apenas VITE_API_URL apontando para localhost)
const isTrulyLocal = typeof window !== "undefined" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);

const configuredApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
const configuredIsLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(configuredApiUrl || "");
const safeApiUrl = !isTrulyLocal && configuredIsLocalhost ? undefined : configuredApiUrl;
const PROD_API_ORIGIN = safeApiUrl
  ? safeApiUrl.replace(/\/api\/?$/, "").replace(/\/$/, "")
  : "https://conexoesapp-server-boomia-lb.kgn6uc.easypanel.host";

/** supabase-js exige URL absoluta; em dev costumamos usar path relativo `/api/supabase-proxy`. */
function resolveLocalProxyBase(): string {
  const raw = (import.meta.env.VITE_SUPABASE_PROXY_URL as string | undefined)?.trim() || "/api/supabase-proxy";
  if (/^https?:\/\//i.test(raw)) return raw;
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:5173";
  return `${origin}${path}`;
}

const proxyBase = isTrulyLocal ? resolveLocalProxyBase() : `${PROD_API_ORIGIN}/api/supabase-proxy`;

const NEXUS_URL = proxyBase;
// Always use the Nexus (self-hosted) anon key — the proxy on the VPS should override,
// but older server versions may forward headers as-is, so we send the correct key from the client.
const NEXUS_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

export const nexusDb = createClient(NEXUS_URL, NEXUS_ANON_KEY);

/** Base URL do Supabase (usa proxy no browser para evitar CORS) */
export const getSupabaseBaseUrl = () => proxyBase;
