import { createClient } from "@supabase/supabase-js";

// Lovable Cloud client — used ONLY for edge function invocations
const CLOUD_URL = import.meta.env.VITE_SUPABASE_URL;
const CLOUD_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const cloudClient = createClient(CLOUD_URL, CLOUD_ANON_KEY);
