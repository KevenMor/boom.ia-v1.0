import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const nexusUrl = Deno.env.get("NEXUS_DB_URL");
  const nexusKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY") || Deno.env.get("NEXUS_DB_ANON_KEY");

  if (!nexusUrl || !nexusKey) {
    return new Response(JSON.stringify({ error: "Missing config" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(nexusUrl, nexusKey);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "agents";

  if (action === "agents") {
    const { data, error } = await supabase
      .from("agents")
      .select("id, name, status, tenant_id, tenants(name, slug)")
      .order("created_at", { ascending: false });

    return new Response(JSON.stringify({ data, error: error?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "conversations") {
    const agentId = url.searchParams.get("agent_id");
    if (!agentId) {
      return new Response(JSON.stringify({ error: "Missing agent_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: rpcConvs, error: rpcErr } = await supabase.rpc("list_agent_conversations", {
      p_agent_id: agentId,
      p_limit: 10,
    });

    return new Response(JSON.stringify({ conversations: rpcConvs, error: rpcErr?.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (action === "messages") {
    const agentId = url.searchParams.get("agent_id");
    const convId = url.searchParams.get("conversation_id");

    if (!agentId || !convId) {
      return new Response(JSON.stringify({ error: "Missing agent_id or conversation_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msgs, error: msgErr } = await supabase.rpc("load_conversation_messages", {
      p_agent_id: agentId,
      p_conversation_id: convId,
    });

    return new Response(JSON.stringify({ messages: msgs, error: msgErr?.message, count: msgs?.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown action. Use ?action=agents|conversations|messages" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
