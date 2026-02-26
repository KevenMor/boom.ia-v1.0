import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_NEXUS_DB_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_NEXUS_DB_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "Supabase credentials not found. Set NEXUS_DB_URL and NEXUS_DB_ANON_KEY secrets."
  );
}

export const supabase = createClient(SUPABASE_URL ?? "", SUPABASE_ANON_KEY ?? "");
