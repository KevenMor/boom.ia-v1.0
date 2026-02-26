import { createClient } from "@supabase/supabase-js";

// Lovable injects secrets as VITE_ prefixed env vars
const SUPABASE_URL = (import.meta.env.VITE_NEXUS_DB_URL ?? import.meta.env.NEXUS_DB_URL ?? "") as string;
const SUPABASE_ANON_KEY = (import.meta.env.VITE_NEXUS_DB_ANON_KEY ?? import.meta.env.NEXUS_DB_ANON_KEY ?? "") as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase credentials not found. Ensure NEXUS_DB_URL and NEXUS_DB_ANON_KEY secrets are configured."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
