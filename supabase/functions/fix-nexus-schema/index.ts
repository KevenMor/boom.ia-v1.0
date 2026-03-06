import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL");
    const nexusKey = Deno.env.get("NEXUS_SERVICE_ROLE_KEY");

    if (!nexusUrl || !nexusKey) {
      return new Response(JSON.stringify({ error: "Missing Nexus config" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(nexusUrl, nexusKey);
    const results: string[] = [];

    // 1) Find all tenant schemas
    const { data: tenants, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, name, db_name")
      .not("db_name", "is", null);

    if (tenantErr) {
      return new Response(JSON.stringify({ error: "Failed to list tenants", detail: tenantErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    results.push(`Found ${tenants?.length || 0} tenant(s)`);

    // 2) For each tenant, add missing columns to conversations table
    for (const tenant of tenants || []) {
      const schema = tenant.db_name;
      if (!schema) continue;

      try {
        // Add chatwoot_conversation_id column
        const { error: e1 } = await supabase.rpc("exec_sql", {
          sql: `ALTER TABLE ${schema}.conversations ADD COLUMN IF NOT EXISTS chatwoot_conversation_id INTEGER;`,
        });
        if (e1) {
          results.push(`${schema}: chatwoot_conversation_id - ${e1.message}`);
        } else {
          results.push(`${schema}: chatwoot_conversation_id - OK`);
        }

        // Add chatwoot_contact_id column
        const { error: e2 } = await supabase.rpc("exec_sql", {
          sql: `ALTER TABLE ${schema}.conversations ADD COLUMN IF NOT EXISTS chatwoot_contact_id INTEGER;`,
        });
        if (e2) {
          results.push(`${schema}: chatwoot_contact_id - ${e2.message}`);
        } else {
          results.push(`${schema}: chatwoot_contact_id - OK`);
        }

        // Add contact_name column
        const { error: e3 } = await supabase.rpc("exec_sql", {
          sql: `ALTER TABLE ${schema}.conversations ADD COLUMN IF NOT EXISTS contact_name TEXT;`,
        });
        if (e3) {
          results.push(`${schema}: contact_name - ${e3.message}`);
        } else {
          results.push(`${schema}: contact_name - OK`);
        }

        // Add contact_avatar_url column
        const { error: e4 } = await supabase.rpc("exec_sql", {
          sql: `ALTER TABLE ${schema}.conversations ADD COLUMN IF NOT EXISTS contact_avatar_url TEXT;`,
        });
        if (e4) {
          results.push(`${schema}: contact_avatar_url - ${e4.message}`);
        } else {
          results.push(`${schema}: contact_avatar_url - OK`);
        }

        // Add metadata column to messages
        const { error: e5 } = await supabase.rpc("exec_sql", {
          sql: `ALTER TABLE ${schema}.messages ADD COLUMN IF NOT EXISTS metadata JSONB;`,
        });
        if (e5) {
          results.push(`${schema}: messages.metadata - ${e5.message}`);
        } else {
          results.push(`${schema}: messages.metadata - OK`);
        }
      } catch (err: any) {
        results.push(`${schema}: ERROR - ${err.message}`);
      }
    }

    // 3) Update the find_or_create_webhook_conversation function
    const functionSql = `
CREATE OR REPLACE FUNCTION public.find_or_create_webhook_conversation(
  p_agent_id UUID,
  p_channel TEXT,
  p_external_user_id TEXT,
  p_chatwoot_conversation_id INTEGER DEFAULT NULL,
  p_chatwoot_contact_id INTEGER DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_avatar_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_schema TEXT;
  v_conv_id UUID;
  v_has_cw_col BOOLEAN;
BEGIN
  SELECT t.db_name INTO v_schema
  FROM public.agents a
  JOIN public.tenants t ON t.id = a.tenant_id
  WHERE a.id = p_agent_id;

  IF v_schema IS NULL THEN
    RAISE EXCEPTION 'Tenant schema not provisioned for agent %', p_agent_id;
  END IF;

  -- Check if chatwoot_conversation_id column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = v_schema AND table_name = 'conversations' AND column_name = 'chatwoot_conversation_id'
  ) INTO v_has_cw_col;

  -- 1) Search by chatwoot_conversation_id (most precise)
  IF p_chatwoot_conversation_id IS NOT NULL AND v_has_cw_col THEN
    EXECUTE format(
      'SELECT id FROM %I.conversations WHERE agent_id = $1 AND chatwoot_conversation_id = $2 AND status = ''open'' LIMIT 1',
      v_schema
    ) INTO v_conv_id USING p_agent_id, p_chatwoot_conversation_id;

    IF v_conv_id IS NOT NULL THEN
      IF p_contact_name IS NOT NULL OR p_contact_avatar_url IS NOT NULL THEN
        BEGIN
          EXECUTE format(
            'UPDATE %I.conversations SET contact_name = COALESCE($2, contact_name), contact_avatar_url = COALESCE($3, contact_avatar_url) WHERE id = $1',
            v_schema
          ) USING v_conv_id, p_contact_name, p_contact_avatar_url;
        EXCEPTION WHEN undefined_column THEN
          NULL; -- columns don't exist yet, skip
        END;
      END IF;
      RETURN v_conv_id;
    END IF;
  END IF;

  -- 2) Fallback: search by external_user_id + channel
  EXECUTE format(
    'SELECT id FROM %I.conversations WHERE agent_id = $1 AND channel = $2 AND external_user_id = $3 AND status = ''open'' ORDER BY started_at DESC LIMIT 1',
    v_schema
  ) INTO v_conv_id USING p_agent_id, p_channel, p_external_user_id;

  IF v_conv_id IS NOT NULL THEN
    IF v_has_cw_col AND p_chatwoot_conversation_id IS NOT NULL THEN
      BEGIN
        EXECUTE format(
          'UPDATE %I.conversations SET chatwoot_conversation_id = COALESCE(chatwoot_conversation_id, $2), chatwoot_contact_id = COALESCE(chatwoot_contact_id, $3), contact_name = COALESCE($4, contact_name), contact_avatar_url = COALESCE($5, contact_avatar_url) WHERE id = $1',
          v_schema
        ) USING v_conv_id, p_chatwoot_conversation_id, p_chatwoot_contact_id, p_contact_name, p_contact_avatar_url;
      EXCEPTION WHEN undefined_column THEN
        NULL;
      END;
    END IF;
    RETURN v_conv_id;
  END IF;

  -- 3) Create new conversation
  IF v_has_cw_col THEN
    EXECUTE format(
      'INSERT INTO %I.conversations (agent_id, channel, external_user_id, chatwoot_conversation_id, chatwoot_contact_id, contact_name, contact_avatar_url) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      v_schema
    ) INTO v_conv_id USING p_agent_id, p_channel, p_external_user_id, p_chatwoot_conversation_id, p_chatwoot_contact_id, p_contact_name, p_contact_avatar_url;
  ELSE
    EXECUTE format(
      'INSERT INTO %I.conversations (agent_id, channel, external_user_id) VALUES ($1, $2, $3) RETURNING id',
      v_schema
    ) INTO v_conv_id USING p_agent_id, p_channel, p_external_user_id;
  END IF;

  RETURN v_conv_id;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.find_or_create_webhook_conversation(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_webhook_conversation(UUID, TEXT, TEXT, INTEGER, INTEGER, TEXT, TEXT) TO service_role;
`;

    try {
      const { error: fnErr } = await supabase.rpc("exec_sql", { sql: functionSql });
      if (fnErr) {
        results.push(`Function update: ${fnErr.message}`);
      } else {
        results.push(`Function find_or_create_webhook_conversation: UPDATED`);
      }
    } catch (err: any) {
      results.push(`Function update error: ${err.message}`);
    }

    return new Response(JSON.stringify({ status: "done", results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[FixSchema] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
