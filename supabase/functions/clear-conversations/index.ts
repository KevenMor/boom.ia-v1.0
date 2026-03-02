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

    // Find the tenant schema for this agent
    const { data: agentRow, error: agentErr } = await supabase
      .from("agents")
      .select("tenant_id")
      .eq("id", agent_id)
      .single();

    if (agentErr || !agentRow) {
      return new Response(JSON.stringify({ error: "Agent not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenantRow, error: tenantErr } = await supabase
      .from("tenants")
      .select("db_name")
      .eq("id", agentRow.tenant_id)
      .single();

    if (tenantErr || !tenantRow?.db_name) {
      return new Response(JSON.stringify({ error: "Tenant schema not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schema = tenantRow.db_name;
    console.log(`[ClearConv] Schema: ${schema}, Deleting ${conversation_ids.length} conversation(s)`);

    // Use raw SQL via rpc to delete from tenant schema
    // Delete messages first (FK constraint)
    const idsLiteral = conversation_ids.map((id: string) => `'${id}'`).join(",");

    const { data: msgResult, error: msgErr } = await supabase.rpc("exec_sql", {
      query: `DELETE FROM ${schema}.messages WHERE conversation_id IN (${idsLiteral}) RETURNING id`,
    });

    if (msgErr) {
      // Fallback: try using schema-qualified client
      console.log("[ClearConv] exec_sql not available, trying direct schema query");
      
      // Use postgrest schema header approach
      const schemaClient = createClient(nexusUrl, nexusServiceKey, {
        db: { schema },
      });

      const { error: msgErr2, count: msgCount } = await schemaClient
        .from("messages")
        .delete({ count: "exact" })
        .in("conversation_id", conversation_ids);

      if (msgErr2) {
        console.error("[ClearConv] Error deleting messages:", msgErr2.message);
        return new Response(JSON.stringify({ error: msgErr2.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error: convErr2, count: convCount } = await schemaClient
        .from("conversations")
        .delete({ count: "exact" })
        .in("id", conversation_ids);

      if (convErr2) {
        console.error("[ClearConv] Error deleting conversations:", convErr2.message);
        return new Response(JSON.stringify({ error: convErr2.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Cancel pending follow-ups
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
    }

    // If exec_sql worked
    const msgCount = Array.isArray(msgResult) ? msgResult.length : 0;

    await supabase.rpc("exec_sql", {
      query: `DELETE FROM ${schema}.conversations WHERE id IN (${idsLiteral})`,
    });

    // Cancel pending follow-ups
    await supabase
      .from("follow_up_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .in("conversation_id", conversation_ids)
      .eq("status", "pending");

    console.log(`[ClearConv] Done: ${msgCount} messages deleted`);

    return new Response(JSON.stringify({
      success: true,
      deleted_messages: msgCount,
      deleted_conversations: conversation_ids.length,
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
