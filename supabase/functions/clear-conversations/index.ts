import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusServiceKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY");

    if (!nexusUrl || !nexusServiceKey) {
      return new Response(JSON.stringify({ error: "Missing server configuration" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusServiceKey);
    const { conversation_ids } = await req.json();

    if (!conversation_ids || !Array.isArray(conversation_ids) || conversation_ids.length === 0) {
      return new Response(JSON.stringify({ error: "conversation_ids array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[ClearConv] Deleting ${conversation_ids.length} conversation(s)`);

    // Delete messages first (FK constraint)
    const { error: msgErr, count: msgCount } = await supabase
      .from("conversation_messages")
      .delete({ count: "exact" })
      .in("conversation_id", conversation_ids);

    if (msgErr) {
      console.error("[ClearConv] Error deleting messages:", msgErr.message);
      return new Response(JSON.stringify({ error: msgErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Delete conversations
    const { error: convErr, count: convCount } = await supabase
      .from("conversations")
      .delete({ count: "exact" })
      .in("id", conversation_ids);

    if (convErr) {
      console.error("[ClearConv] Error deleting conversations:", convErr.message);
      return new Response(JSON.stringify({ error: convErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Also cancel any pending follow-ups for these conversations
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("conversation_id", conversation_ids)
      .eq("status", "pending");

    console.log(`[ClearConv] Done: ${msgCount} messages, ${convCount} conversations deleted`);

    return new Response(JSON.stringify({
      success: true,
      deleted_messages: msgCount,
      deleted_conversations: convCount,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[ClearConv] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
