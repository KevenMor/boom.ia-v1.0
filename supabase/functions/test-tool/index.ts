import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const FALLBACK_URL = "https://boomsolution-supabase.kgn6uc.easypanel.host";
    const FALLBACK_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

    const nexusUrl = Deno.env.get("NEXUS_DB_URL") || FALLBACK_URL;
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY") || FALLBACK_KEY;

    // Forward the user's Nexus auth token if provided
    const nexusAuth = req.headers.get("x-nexus-auth");

    const supabase = createClient(nexusUrl, nexusKey, {
      global: {
        headers: nexusAuth ? { Authorization: `Bearer ${nexusAuth}` } : {},
      },
    });
    const { tool_id, tool_name, args } = await req.json();

    console.log("tool_id:", tool_id, "tool_name:", tool_name, "hasNexusAuth:", !!nexusAuth);

    if (!tool_id && !tool_name) {
      return new Response(JSON.stringify({ error: "tool_id or tool_name is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load tool (robust against duplicate rows)
    let tool: any = null;
    let toolErr: any = null;

    if (tool_id) {
      const { data, error } = await supabase
        .from("tools")
        .select("*")
        .eq("id", tool_id)
        .limit(1);
      tool = data?.[0] ?? null;
      toolErr = error;
    }

    if (!tool && tool_name) {
      const { data, error } = await supabase
        .from("tools")
        .select("*")
        .eq("name", tool_name)
        .limit(1);
      tool = data?.[0] ?? null;
      if (!toolErr) toolErr = error;
    }

    console.log("tool query result:", JSON.stringify({ found: !!tool, toolErr }));

    if (!tool) {
      return new Response(JSON.stringify({ error: "Tool not found", detail: toolErr?.message, nexusUrl, tool_id, tool_name }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: any;

    switch (tool.tool_type) {
      case "web_scraper": {
        const config = tool.execution_config || {};
        const targetUrl = args?.url || config.default_url;
        if (!targetUrl) {
          result = { error: "No URL provided. Pass {\"url\": \"https://...\"}" };
          break;
        }
        const response = await fetch(targetUrl, {
          headers: { "User-Agent": "NexusAI-Bot/1.0" },
        });
        if (!response.ok) {
          result = { error: `HTTP ${response.status}` };
          break;
        }
        const html = await response.text();
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, config.max_chars || 16000);
        result = { url: targetUrl, content: text, chars: text.length };
        break;
      }

      case "api_rest": {
        const config = tool.execution_config || {};
        const url = config.url_template
          ? config.url_template.replace(/\{(\w+)\}/g, (_: string, key: string) => args?.[key] ?? "")
          : tool.endpoint;
        if (!url) {
          result = { error: "No endpoint configured" };
          break;
        }
        const method = (config.method || "GET").toUpperCase();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(config.headers || {}),
        };
        if (tool.auth_config?.api_key) {
          headers["Authorization"] = `Bearer ${tool.auth_config.api_key}`;
        }
        const fetchOpts: RequestInit = { method, headers };
        if (method !== "GET" && method !== "HEAD") {
          fetchOpts.body = JSON.stringify(args || {});
        }
        const response = await fetch(url, fetchOpts);
        const data = await response.text();
        try {
          result = { status: response.status, data: JSON.parse(data) };
        } catch {
          result = { status: response.status, data: data.slice(0, 4000) };
        }
        break;
      }

      case "sql_query": {
        result = { info: "SQL Query tools require agent context (tenant schema). Test via Agent Sandbox." };
        break;
      }

      case "rag_search": {
        result = { info: "RAG Search tools require agent context. Test via Agent Sandbox." };
        break;
      }

      case "fipe_query": {
        const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
        const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

        const fipeArgs: Record<string, any> = {};
        if (args?.marca || args?.brand) fipeArgs.marca = args.marca || args.brand;
        if (args?.modelo || args?.model) fipeArgs.modelo = args.modelo || args.model;
        if (args?.ano || args?.year) fipeArgs.ano = args.ano || args.year;
        if (args?.codigo_fipe) fipeArgs.codigo_fipe = args.codigo_fipe;
        if (args?.tipo) fipeArgs.tipo = args.tipo;

        const resp = await fetch(`${cloudUrl}/functions/v1/fipe-query`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${cloudKey}`,
          },
          body: JSON.stringify(fipeArgs),
        });
        const data = await resp.text();
        try {
          result = { status: resp.status, data: JSON.parse(data) };
        } catch {
          result = { status: resp.status, data: data.slice(0, 4000) };
        }
        break;
      }

      default:
        result = { error: `Unknown tool type: ${tool.tool_type}` };
    }

    return new Response(JSON.stringify({ result, tool_name: tool.name, tool_type: tool.tool_type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("test-tool error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
