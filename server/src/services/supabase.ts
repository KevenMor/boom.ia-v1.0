import { createClient, SupabaseClient } from "@supabase/supabase-js";

const nexusUrl = process.env.NEXUS_DB_URL!;
const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY!;

export function createNexusClient(authHeader?: string): SupabaseClient {
  const options: { global?: { headers?: Record<string, string> } } = {};
  if (authHeader) {
    options.global = { headers: { Authorization: authHeader.startsWith("Bearer ") ? authHeader : `Bearer ${authHeader}` } };
  }
  return createClient(nexusUrl, nexusKey, options);
}
