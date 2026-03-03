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

      case "calendar_query": {
        const cloudUrl = Deno.env.get("SUPABASE_URL") || "";
        const cloudKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

        // Resolve tenant_id from the tool itself
        const calendarArgs: Record<string, any> = { ...args };
        if (tool.tenant_id) calendarArgs.tenant_id = tool.tenant_id;

        const action = calendarArgs.action || "check_availability";

        if (action === "check_availability") {
          const date = calendarArgs.date || new Date().toISOString().slice(0, 10);
          const daysAhead = calendarArgs.days_ahead || 3;
          const slotDuration = calendarArgs.slot_duration_minutes || 60;
          // Business hours config (can be overridden per calendar later)
          const businessStart = 8; // 08:00
          const businessEnd = 18;  // 18:00

          const { data: calendars, error: calErr } = await supabase
            .from("calendars")
            .select("*")
            .eq("tenant_id", calendarArgs.tenant_id)
            .limit(10);

          if (calErr) {
            result = { error: "Failed to fetch calendars", detail: calErr.message };
            break;
          }
          if (!calendars || calendars.length === 0) {
            result = { error: "No calendars found for this tenant", tenant_id: calendarArgs.tenant_id };
            break;
          }

          const startDate = new Date(date);
          const endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + daysAhead);

          const calendarIds = calendars.map((c: any) => c.id);
          const { data: events, error: evErr } = await supabase
            .from("calendar_events")
            .select("*")
            .in("calendar_id", calendarIds)
            .gte("start_at", startDate.toISOString())
            .lte("start_at", endDate.toISOString())
            .order("start_at", { ascending: true });

          // Generate available slots per day
          const availableSlots: Record<string, string[]> = {};
          for (let d = 0; d < daysAhead; d++) {
            const current = new Date(startDate);
            current.setDate(current.getDate() + d);
            const dayOfWeek = current.getDay();
            // Skip weekends (0=Sun, 6=Sat)
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const dayStr = current.toISOString().slice(0, 10);
            const dayEvents = (events || []).filter((e: any) => e.start_at?.slice(0, 10) === dayStr);
            const slots: string[] = [];

            for (let h = businessStart; h < businessEnd; h++) {
              for (let m = 0; m < 60; m += slotDuration) {
                if (h + m / 60 >= businessEnd) break;
                const slotStart = new Date(`${dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`);
                const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

                // Check if slot conflicts with any existing event
                const conflict = dayEvents.some((ev: any) => {
                  const evStart = new Date(ev.start_at).getTime();
                  const evEnd = new Date(ev.end_at).getTime();
                  return slotStart.getTime() < evEnd && slotEnd.getTime() > evStart;
                });

                if (!conflict) {
                  slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
                }
              }
            }
            availableSlots[dayStr] = slots;
          }

          result = {
            action: "check_availability",
            calendars: calendars.map((c: any) => ({ id: c.id, name: c.name })),
            available_slots: availableSlots,
            existing_events: (events || []).map((e: any) => ({
              title: e.title,
              start: e.start_at,
              end: e.end_at,
            })),
            date_range: { from: startDate.toISOString().slice(0, 10), to: endDate.toISOString().slice(0, 10) },
            slot_duration_minutes: slotDuration,
            business_hours: `${businessStart}:00 - ${businessEnd}:00`,
            note: evErr ? `Warning: ${evErr.message}` : undefined,
          };
        } else if (action === "criar" || action === "create") {
          const title = calendarArgs.title;
          const startAt = calendarArgs.start_at;
          const durationMin = calendarArgs.duration_minutes || 60;

          if (!title || !startAt) {
            result = { error: "Missing required fields: title, start_at" };
            break;
          }

          // Find the first calendar for this tenant
          const { data: cals } = await supabase
            .from("calendars")
            .select("id")
            .eq("tenant_id", calendarArgs.tenant_id)
            .limit(1);

          const calendarId = calendarArgs.calendar_id || cals?.[0]?.id;
          if (!calendarId) {
            result = { error: "No calendar found for this tenant" };
            break;
          }

          const startDt = new Date(startAt);
          const endDt = new Date(startDt.getTime() + durationMin * 60000);

          const { data: created, error: insErr } = await supabase
            .from("calendar_events")
            .insert({
              calendar_id: calendarId,
              tenant_id: calendarArgs.tenant_id,
              title,
              start_at: startDt.toISOString(),
              end_at: endDt.toISOString(),
            })
            .select()
            .maybeSingle();

          if (insErr) {
            result = { error: "Failed to create event", detail: insErr.message };
          } else {
            result = { action: "created", event: created };
          }
        } else {
          result = { error: `Unknown calendar action: ${action}. Use 'check_availability' or 'criar'.` };
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
