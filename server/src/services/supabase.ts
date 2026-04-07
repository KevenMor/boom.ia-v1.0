import { createClient, SupabaseClient } from "@supabase/supabase-js";

const nexusUrl = process.env.NEXUS_DB_URL!;
const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY!;

/** Decodifica `iss` do JWT sem validar assinatura (só diagnóstico). */
function jwtPayloadIss(jwt: string | undefined): string | undefined {
  if (!jwt || typeof jwt !== "string") return undefined;
  try {
    const part = jwt.split(".")[1];
    if (!part) return undefined;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    const o = JSON.parse(json) as { iss?: string };
    return typeof o.iss === "string" ? o.iss : undefined;
  } catch {
    return undefined;
  }
}

function warnIfDemoKeysWithForeignSupabaseUrl(): void {
  if (process.env.NODE_ENV === "test") return;
  const url = (process.env.NEXUS_DB_URL ?? "").replace(/\/$/, "");
  const anonIss = jwtPayloadIss(process.env.NEXUS_DB_ANON_KEY);
  const serviceIss = jwtPayloadIss(process.env.NEXUS_SERVICE_ROLE_KEY);
  const usingDemoIss = anonIss === "supabase-demo" || serviceIss === "supabase-demo";
  const looksLovableCloud = /qqueviooottrostbxkek\.supabase\.co$/i.test(url);
  if (usingDemoIss && url && !looksLovableCloud) {
    console.error(
      "[Server] NEXUS_DB_ANON_KEY / NEXUS_SERVICE_ROLE_KEY são as chaves de DEMONSTRAÇÃO (iss supabase-demo do template Lovable), " +
        "mas NEXUS_DB_URL não é o projeto Lovable — ex.: Easypanel (boomsolution-supabase…). " +
        "O browser faz login no Supabase REAL; o servidor valida o JWT com apikey do projeto ERRADO → 401 em /api/admin/tenants e \"unauthorized\". " +
        "Corrige: no Easypanel → Supabase → Settings → API, copia anon + service_role para server/.env e a anon também para .env na raiz (VITE_SUPABASE_PUBLISHABLE_KEY)."
    );
  }
}

warnIfDemoKeysWithForeignSupabaseUrl();

export function createNexusClient(authHeader?: string): SupabaseClient {
  const options: { global?: { headers?: Record<string, string> } } = {};
  if (authHeader) {
    options.global = { headers: { Authorization: authHeader.startsWith("Bearer ") ? authHeader : `Bearer ${authHeader}` } };
  }
  return createClient(nexusUrl, nexusKey, options);
}
