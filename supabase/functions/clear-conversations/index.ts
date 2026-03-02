import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusServiceKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY");

    if (!nexusUrl || !nexusServiceKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusServiceKey);
    const { conversation_ids, agent_id } = await req.json();

    if (!agent_id) {
      return new Response(JSON.stringify({ error: "agent_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!conversation_ids || !Array.isArray(conversation_ids) || conversation_ids.length === 0) {
      return new Response(JSON.stringify({ error: "conversation_ids array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ClearConv] agent=${agent_id}, deleting ${conversation_ids.length} conversation(s)`);

    // Call the RPC function that handles tenant schema lookup + deletion
    const { data, error } = await supabase.rpc("delete_conversations", {
      p_agent_id: agent_id,
      p_conversation_ids: conversation_ids,
    });

    if (error) {
      console.error("[ClearConv] RPC error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = Array.isArray(data) ? data[0] : data;
    const deletedMessages = result?.deleted_messages ?? 0;
    const deletedConversations = result?.deleted_conversations ?? 0;

    // Also cancel any pending follow-ups
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("conversation_id", conversation_ids)
      .eq("status", "pending");

    console.log(`[ClearConv] Done: ${deletedMessages} msgs, ${deletedConversations} convs deleted`);

    return new Response(JSON.stringify({
      success: true,
      deleted_messages: deletedMessages,
      deleted_conversations: deletedConversations,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[ClearConv] Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
