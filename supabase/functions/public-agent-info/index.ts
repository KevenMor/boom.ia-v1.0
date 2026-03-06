import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NEXUS_URL = "https://boomsolution-supabase.kgn6uc.easypanel.host";
const NEXUS_SERVICE_KEY = Deno.env.get("NEXUS_SERVICE_ROLE_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const agentId = url.searchParams.get("agent_id");

    if (!agentId) {
      return new Response(
        JSON.stringify({ error: "agent_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use the nexus anon key if service key not available
    const nexusKey = NEXUS_SERVICE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";
    
    const db = createClient(NEXUS_URL, nexusKey);

    const { data, error } = await db
      .from("agents")
      .select("id, name, avatar_url, config, tenants(name, slug)")
      .eq("id", agentId)
      .single();

    if (error || !data) {
      console.error("Agent lookup error:", error);
      return new Response(
        JSON.stringify({ error: "Agent not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only return public-safe fields
    const publicInfo = {
      id: data.id,
      name: data.name,
      avatar_url: data.avatar_url,
      config: {
        sandbox_password: (data.config as any)?.sandbox_password ?? null,
      },
      tenants: data.tenants,
    };

    return new Response(
      JSON.stringify(publicInfo),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("public-agent-info error:", e);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
