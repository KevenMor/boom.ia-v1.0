import { createClient } from "@supabase/supabase-js";

// Em dev (localhost) usa proxy local (Vite → backend); em produção usa origem atual.
const isDev = typeof window !== "undefined" && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(window.location.origin);
const proxyBase =
  import.meta.env.VITE_SUPABASE_PROXY_URL ||
  (typeof window !== "undefined" ? `${window.location.origin}/api/supabase-proxy` : "https://boomsolution-supabase.kgn6uc.easypanel.host");
const NEXUS_URL =
  typeof window !== "undefined"
    ? (isDev ? proxyBase : `${window.location.origin}/api/supabase-proxy`)
    : (import.meta.env.VITE_SUPABASE_URL || "https://boomsolution-supabase.kgn6uc.easypanel.host");
const NEXUS_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

export const nexusDb = createClient(NEXUS_URL, NEXUS_ANON_KEY);

/** Base URL do Supabase (usa proxy no browser para evitar CORS) */
export const getSupabaseBaseUrl = () =>
  typeof window !== "undefined"
    ? (isDev ? proxyBase : `${window.location.origin}/api/supabase-proxy`)
    : (import.meta.env.VITE_SUPABASE_URL || "https://boomsolution-supabase.kgn6uc.easypanel.host");
