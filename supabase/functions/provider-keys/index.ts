import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getKey(secret: string): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret.padEnd(32, "0").slice(0, 32));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encrypt(plaintext: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(iv.length + new Uint8Array(ciphertext).length);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decrypt(encoded: string, secret: string): Promise<string> {
  const key = await getKey(secret);
  const combined = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const encryptionKey = Deno.env.get("ENCRYPTION_KEY");
    if (!encryptionKey) {
      return new Response(
        JSON.stringify({ error: "ENCRYPTION_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY");

    console.log("NEXUS_DB_URL present:", !!nexusUrl, "starts with:", nexusUrl?.substring(0, 20));
    console.log("NEXUS_DB_ANON_KEY present:", !!nexusKey);

    if (!nexusUrl || !nexusKey) {
      return new Response(
        JSON.stringify({ error: "NEXUS_DB_URL or NEXUS_DB_ANON_KEY not configured", nexusUrl: !!nexusUrl, nexusKey: !!nexusKey }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward the self-hosted auth token from the request
    const authHeader = req.headers.get("x-nexus-auth") || "";

    const supabase = createClient(nexusUrl, nexusKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const { action, provider_id, api_key } = await req.json();

    if (action === "encrypt") {
      if (!provider_id || !api_key) {
        return new Response(
          JSON.stringify({ error: "provider_id and api_key required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const encrypted = await encrypt(api_key, encryptionKey);

      const { error: updateError } = await supabase
        .from("providers")
        .update({ api_key_encrypted: encrypted })
        .eq("id", provider_id);

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "decrypt") {
      if (!provider_id) {
        return new Response(
          JSON.stringify({ error: "provider_id required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: provider, error: fetchError } = await supabase
        .from("providers")
        .select("api_key_encrypted")
        .eq("id", provider_id)
        .single();

      if (fetchError || !provider?.api_key_encrypted) {
        return new Response(
          JSON.stringify({ error: "Key not found", detail: fetchError?.message }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const decrypted = await decrypt(provider.api_key_encrypted, encryptionKey);

      return new Response(
        JSON.stringify({ api_key: decrypted }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
