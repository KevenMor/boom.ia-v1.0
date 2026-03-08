import { createClient } from "@supabase/supabase-js";

// Usa proxy no backend (/api/supabase-proxy) quando no browser para evitar CORS. Senão usa VITE_SUPABASE_URL.
const NEXUS_URL =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/supabase-proxy`
    : (import.meta.env.VITE_SUPABASE_URL || "https://boomsolution-supabase.kgn6uc.easypanel.host");
const NEXUS_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

export const nexusDb = createClient(NEXUS_URL, NEXUS_ANON_KEY);

/** Base URL do Supabase (usa proxy no browser para evitar CORS) */
export const getSupabaseBaseUrl = () =>
  typeof window !== "undefined"
    ? `${window.location.origin}/api/supabase-proxy`
    : (import.meta.env.VITE_SUPABASE_URL || "https://boomsolution-supabase.kgn6uc.easypanel.host");
