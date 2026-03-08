import { createClient } from "@supabase/supabase-js";

// Mesma URL e chave do Supabase/Nexus usados no build (VITE_SUPABASE_*). O login chama esta URL direto do browser; o Supabase precisa permitir CORS da origem do app (ex.: http://ia.agboom.com.br).
const NEXUS_URL = import.meta.env.VITE_SUPABASE_URL || "https://boomsolution-supabase.kgn6uc.easypanel.host";
const NEXUS_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

export const nexusDb = createClient(NEXUS_URL, NEXUS_ANON_KEY);
