import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { runFipeQuery } from "../services/fipe.js";
import { runFindNearestUnit } from "../services/find-nearest-unit.js";
import { formatDateBR } from "../utils/agendaNotification.js";

export async function toolsRoutes(fastify: FastifyInstance) {
  fastify.post("/tools/fipe", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as Record<string, unknown>;
      const result = await runFipeQuery({
        marca: body.marca as string,
        modelo: body.modelo as string,
        versao: body.versao as string,
        ano: body.ano as string | number,
        codigo_fipe: body.codigo_fipe as string,
        tipo: body.tipo as number,
      });
      return reply.send(result);
    } catch (err: any) {
      if (err.status === 404) {
        return reply.status(404).send({
          error: err.message,
          sugestoes: err.sugestoes,
          modelos_verificados: err.modelos_verificados,
          versao_considerada: err.versao_considerada,
        });
      }
      throw err;
    }
  });

  fastify.post("/tools/nearest-unit", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { cep?: string; tenant_id?: string };
    if (!body?.cep) {
      return reply.status(400).send({ error: "CEP é obrigatório" });
    }
    try {
      const result = await runFindNearestUnit(
        body.cep,
        body.tenant_id,
        process.env.NEXUS_DB_URL,
        process.env.NEXUS_DB_ANON_KEY,
        process.env.GOOGLE_MAPS_API_KEY
      );
      return reply.send(result);
    } catch (err: any) {
      if (err.status === 404) {
        return reply.status(404).send({ error: err.message, detail: err.detail });
      }
      throw err;
    }
  });

  fastify.post(
    "/tools/test",
    async (
      req: FastifyRequest<{
        Body: { tool_id?: string; tool_name?: string; args?: Record<string, unknown> };
      }>,
      reply: FastifyReply
    ) => {
      const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
      const supabase = createNexusClient(nexusAuth);

      const { tool_id, tool_name, args } = req.body;

      if (!tool_id && !tool_name) {
        return reply.status(400).send({ error: "tool_id or tool_name is required" });
      }

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

      if (!tool) {
        return reply.status(404).send({
          error: "Tool not found",
          detail: toolErr?.message,
          tool_id,
          tool_name,
        });
      }

      let result: any;

      switch (tool.tool_type) {
        case "web_scraper": {
          const config = tool.execution_config || {};
          const targetUrl = args?.url || config.default_url;
          if (!targetUrl) {
            result = { error: 'No URL provided. Pass {"url": "https://..."}' };
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

        case "sql_query":
          result = {
            info: "SQL Query tools require agent context (tenant schema). Test via Agent Sandbox.",
          };
          break;

        case "rag_search":
          result = {
            info: "RAG Search tools require agent context. Test via Agent Sandbox.",
          };
          break;

        case "fipe_query": {
          const fipeArgs: Record<string, any> = {};
          if (args?.marca || args?.brand) fipeArgs.marca = args.marca || args.brand;
          if (args?.modelo || args?.model) fipeArgs.modelo = args.modelo || args.model;
          if (args?.ano || args?.year) fipeArgs.ano = args.ano || args.year;
          if (args?.codigo_fipe) fipeArgs.codigo_fipe = args.codigo_fipe;
          if (args?.tipo) fipeArgs.tipo = args.tipo;

          try {
            const data = await runFipeQuery(fipeArgs);
            result = { status: 200, data };
          } catch (e: any) {
            result = {
              status: e.status || 500,
              data: { error: e.message, ...e },
            };
          }
          break;
        }

        case "calendar_query": {
          const calendarArgs: Record<string, any> = { ...args };
          if (tool.tenant_id) calendarArgs.tenant_id = tool.tenant_id;
          const action = calendarArgs.action || "check_availability";

          if (action === "check_availability") {
            const date = calendarArgs.date || new Date().toISOString().slice(0, 10);
            const daysAhead = calendarArgs.days_ahead || 3;
            const slotDuration = calendarArgs.slot_duration_minutes || 60;
            const businessStart = 8;
            const businessEnd = 18;

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
              result = {
                error: "No calendars found for this tenant",
                tenant_id: calendarArgs.tenant_id,
              };
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

            const availableSlots: Record<string, string[]> = {};
            for (let d = 0; d < daysAhead; d++) {
              const current = new Date(startDate);
              current.setDate(current.getDate() + d);
              const dayOfWeek = current.getDay();
              if (dayOfWeek === 0 || dayOfWeek === 6) continue;

              const dayStr = current.toISOString().slice(0, 10);
              const dayEvents = (events || []).filter(
                (e: any) => e.start_at?.slice(0, 10) === dayStr
              );
              const slots: string[] = [];

              for (let h = businessStart; h < businessEnd; h++) {
                for (let m = 0; m < 60; m += slotDuration) {
                  if (h + m / 60 >= businessEnd) break;
                  const slotStart = new Date(
                    `${dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
                  );
                  const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

                  const conflict = dayEvents.some((ev: any) => {
                    const evStart = new Date(ev.start_at).getTime();
                    const evEnd = new Date(ev.end_at).getTime();
                    return slotStart.getTime() < evEnd && slotEnd.getTime() > evStart;
                  });

                  if (!conflict) {
                    slots.push(
                      `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
                    );
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
              date_range: {
                from: startDate.toISOString().slice(0, 10),
                to: endDate.toISOString().slice(0, 10),
              },
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
              const ev = created as { start_at?: string; end_at?: string } | undefined;
              result = {
                action: "created",
                event: created,
                start_at_br: ev?.start_at ? formatDateBR(ev.start_at) : undefined,
                end_at_br: ev?.end_at ? formatDateBR(ev.end_at) : undefined,
              };
            }
          } else {
            result = {
              error: `Unknown calendar action: ${action}. Use 'check_availability' or 'criar'.`,
            };
          }
          break;
        }

        case "chatwoot_assign": {
          const conversationId = args?.conversation_id;
          const reason = String(args?.reason || "escalation");

          const execCfg = (tool.execution_config || {}) as Record<string, any>;
          const rules = Array.isArray(execCfg.rules) ? execCfg.rules : [];

          let assigneeId = args?.assignee_id ?? execCfg.assignee_id;
          let teamId = args?.team_id ?? execCfg.team_id;
          let matchedRule = "";

          if (!args?.assignee_id && rules.length > 0) {
            const reasonNorm = reason
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");
            let bestScore = 0;
            for (const rule of rules) {
              if (!rule.label) continue;
              const labelNorm = rule.label
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");
              const tokens = labelNorm.split(/\s+/).filter((t: string) => t.length >= 3);
              const score = tokens.reduce(
                (acc: number, tok: string) => acc + (reasonNorm.includes(tok) ? 1 : 0),
                0
              );
              if (score > bestScore) {
                bestScore = score;
                assigneeId = rule.assignee_id ?? assigneeId;
                teamId = rule.team_id ?? teamId;
                matchedRule = rule.label;
              }
            }
          }

          let agentId = args?.agent_id;
          if (!agentId) {
            const { data: linkRows } = await supabase
              .from("agent_tools")
              .select("agent_id")
              .eq("tool_id", tool.id)
              .limit(1);
            agentId = linkRows?.[0]?.agent_id;
          }

          if (!agentId) {
            result = {
              error:
                "Nenhum agente vinculado a esta tool. Vincule a tool a um agente com Chatwoot configurado.",
            };
            break;
          }

          const { data: agentCfgRow } = await supabase
            .from("agents")
            .select("config")
            .eq("id", agentId)
            .single();
          const agCfg = (agentCfgRow?.config || {}) as Record<string, any>;
          const cwUrl = agCfg.chatwoot_url;
          const cwToken = agCfg.chatwoot_api_token;
          const cwAccountId = agCfg.chatwoot_account_id;

          if (!cwUrl || !cwToken || !cwAccountId) {
            result = {
              error: "Chatwoot não configurado neste agente",
              agent_id: agentId,
              config_found: Object.keys(agCfg),
            };
            break;
          }

          let cwConvId = conversationId;
          if (!cwConvId) {
            const { data: cwConvRows } = await supabase
              .from("conversations")
              .select("chatwoot_conversation_id")
              .eq("agent_id", agentId)
              .not("chatwoot_conversation_id", "is", null)
              .order("started_at", { ascending: false })
              .limit(1);
            cwConvId = cwConvRows?.[0]?.chatwoot_conversation_id;
          }

          if (!cwConvId) {
            result = { error: "conversation_id é obrigatório" };
            break;
          }

          const baseUrl = cwUrl.replace(/\/+$/, "");
          const assignUrl = `${baseUrl}/api/v1/accounts/${cwAccountId}/conversations/${cwConvId}/assignments`;
          const assignBody: Record<string, any> = {};
          if (assigneeId) assignBody.assignee_id = Number(assigneeId);
          if (teamId) assignBody.team_id = Number(teamId);

          const assignResp = await fetch(assignUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", api_access_token: cwToken },
            body: JSON.stringify(assignBody),
          });

          const assignRespText = await assignResp.text();
          if (!assignResp.ok) {
            result = {
              error: `Falha na atribuição: ${assignResp.status}`,
              detail: assignRespText,
              url: assignUrl,
            };
          } else {
            let parsedResp: any;
            try {
              parsedResp = JSON.parse(assignRespText);
            } catch {
              parsedResp = assignRespText;
            }
            result = {
              status: "atribuido",
              chatwoot_conversation_id: cwConvId,
              assignee_id: assigneeId || null,
              team_id: teamId || null,
              matched_rule: matchedRule || null,
              chatwoot_response: parsedResp,
            };
          }
          break;
        }

        case "send_notification": {
          const message = args?.message || args?.mensagem;
          if (!message) {
            result = {
              error:
                "message é obrigatório (texto da notificação composto pelo agente)",
            };
            break;
          }

          const execCfg = (tool.execution_config || {}) as Record<string, any>;
          const channel = execCfg.channel || "chatwoot_message";
          const targetConvId = args?.conversation_id || execCfg.conversation_id;

          if (channel === "chatwoot_message") {
            if (!targetConvId) {
              result = {
                error:
                  "conversation_id não configurado. Configure o ID do grupo destino na tool.",
              };
              break;
            }

            let agentId = args?.agent_id;
            if (!agentId) {
              const { data: linkRows } = await supabase
                .from("agent_tools")
                .select("agent_id")
                .eq("tool_id", tool.id)
                .limit(1);
              agentId = linkRows?.[0]?.agent_id;
            }

            if (!agentId) {
              result = { error: "Nenhum agente vinculado a esta tool" };
              break;
            }

            const { data: agentRow } = await supabase
              .from("agents")
              .select("config")
              .eq("id", agentId)
              .single();
            const agCfg = (agentRow?.config || {}) as Record<string, any>;
            const cwUrl = agCfg.chatwoot_url;
            const cwToken = agCfg.chatwoot_api_token;
            const cwAccountId = agCfg.chatwoot_account_id;

            if (!cwUrl || !cwToken || !cwAccountId) {
              result = {
                error: "Chatwoot não configurado no agente vinculado",
                agent_id: agentId,
              };
              break;
            }

            const baseUrl = cwUrl.replace(/\/+$/, "");
            const msgUrl = `${baseUrl}/api/v1/accounts/${cwAccountId}/conversations/${targetConvId}/messages`;

            const msgResp = await fetch(msgUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", api_access_token: cwToken },
              body: JSON.stringify({
                content: message,
                message_type: "outgoing",
                private: false,
              }),
            });

            const msgRespText = await msgResp.text();
            if (!msgResp.ok) {
              result = { error: `Falha ao enviar: ${msgResp.status}`, detail: msgRespText };
            } else {
              let parsed: any;
              try {
                parsed = JSON.parse(msgRespText);
              } catch {
                parsed = msgRespText;
              }
              result = {
                status: "enviado",
                channel: "chatwoot_message",
                conversation_id: targetConvId,
                chatwoot_response: parsed,
              };
            }
          } else if (channel === "webhook") {
            const webhookUrl = execCfg.webhook_url;
            if (!webhookUrl) {
              result = { error: "webhook_url não configurado na execution_config" };
              break;
            }
            const resp = await fetch(webhookUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message,
                timestamp: new Date().toISOString(),
              }),
            });
            const respText = await resp.text();
            result = {
              status: resp.ok ? "enviado" : "erro",
              channel: "webhook",
              http_status: resp.status,
              response: respText.slice(0, 2000),
            };
          } else {
            result = { error: `Canal desconhecido: ${channel}` };
          }
          break;
        }

        default:
          result = { error: `Unknown tool type: ${tool.tool_type}` };
      }

      return reply.send({
        result,
        tool_name: tool.name,
        tool_type: tool.tool_type,
      });
    }
  );
}
