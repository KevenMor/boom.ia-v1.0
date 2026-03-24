import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusServiceKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY");

    if (!nexusUrl || !nexusServiceKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    image.png
    const supabase = createClient(nexusUrl, nexusServiceKey);
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const agentId = body?.agent_id as string | undefined;

    if (!agentId) {
      return new Response(JSON.stringify({ error: "agent_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "list") {
      const { data, error } = await supabase.rpc("list_agent_conversations", {
        p_agent_id: agentId,
        p_limit: Number(body?.limit ?? 100),
      });

      if (error) throw error;

      return new Response(JSON.stringify({ data: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "messages") {
      const conversationId = body?.conversation_id as string | undefined;
      if (!conversationId) {
        return new Response(JSON.stringify({ error: "conversation_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase.rpc("load_conversation_messages", {
        p_agent_id: agentId,
        p_conversation_id: conversationId,
      });

      if (error) throw error;

      return new Response(JSON.stringify({ data: data ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action. Use 'list' or 'messages'" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[conversation-history] error:", error?.message || error);
    return new Response(JSON.stringify({ error: error?.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
