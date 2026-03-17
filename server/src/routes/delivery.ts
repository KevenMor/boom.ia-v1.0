import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { msgLog } from "../utils/flow-logger.js";
import {
  getChatwootAuthHeaders,
  sendChatwootTextMessage,
  sendChatwootImageMessage,
  sendChatwootMediaMessage,
  getHumanizationConfig,
  replyToChatwoot,
  applyJitter,
} from "../services/delivery.js";

export async function deliveryRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/delivery/send",
    async (
      req: FastifyRequest<{
        Body: {
          agent_id: string;
          conversation_id?: string;
          external_user_id?: string;
          channel?: string;
          chatwoot_conversation_id?: number;
          response_text?: string;
          response_parts?: string[];
          welcome_video_url?: string;
          assignee_id?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const nexusUrl = process.env.NEXUS_DB_URL;
      const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;

      if (!nexusUrl || !nexusKey) {
        return reply.status(500).send({ error: "Missing server config" });
      }

      const supabase = createNexusClient();
      const {
        agent_id,
        conversation_id,
        external_user_id,
        channel,
        chatwoot_conversation_id,
        response_text,
        response_parts,
        welcome_video_url,
        assignee_id: handoff_assignee_id,
      } = req.body;

      let agent: any = null;
      let agentErr: any = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const res = await supabase
          .from("agents")
          .select("id, name, tenant_id, config")
          .eq("id", agent_id)
          .maybeSingle();
        agent = res.data;
        agentErr = res.error;
        if (agent) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 500));
      }

      if (agentErr || !agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const cfg = (agent.config || {}) as Record<string, any>;
      const hasChatwootConfig = !!(
        cfg.chatwoot_url &&
        cfg.chatwoot_api_token &&
        cfg.chatwoot_account_id
      );

      if (chatwoot_conversation_id && hasChatwootConfig) {
        const baseUrl = cfg.chatwoot_url.replace(/\/+$/, "");
        const msgUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwoot_conversation_id}/messages`;
        const humanization = getHumanizationConfig(cfg);
        const cwAuth = getChatwootAuthHeaders(cfg.chatwoot_api_token, cfg);

        const agentAssigneeId = cfg.agent_assignee_id != null ? Number(cfg.agent_assignee_id) : null;
        const assigneeId = handoff_assignee_id != null ? Number(handoff_assignee_id) : agentAssigneeId;
        if (assigneeId != null) {
          try {
            const assignUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwoot_conversation_id}/assignments`;
            const assignResp = await fetch(assignUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...cwAuth },
              body: JSON.stringify({ assignee_id: assigneeId }),
            });
            if (!assignResp.ok) {
              console.warn("[Deliver] Failed to assign conversation to agent:", assignResp.status, await assignResp.text().catch(() => ""));
            }
          } catch (e: any) {
            console.warn("[Deliver] Assign to agent failed:", e.message);
          }
        }

        if (welcome_video_url) {
          const greetingParts: string[] =
            Array.isArray(response_parts) && response_parts.length > 0
              ? response_parts.filter((p: string) => p?.trim())
              : response_text?.trim()
                ? [response_text.trim()]
                : [];

          if (greetingParts.length > 0) {
            for (let i = 0; i < greetingParts.length; i++) {
              const part = greetingParts[i].trim();
              if (!part) continue;

              const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
              const imageUrls: string[] = [];
              let match: RegExpExecArray | null;
              while ((match = imageRegex.exec(part)) !== null) {
                if (match[1]) imageUrls.push(match[1].trim());
              }
              const textOnly = part.replace(imageRegex, "").replace(/\n{3,}/g, "\n\n").trim();

              if (textOnly.trim()) {
                await sendChatwootTextMessage(msgUrl, cwAuth, textOnly.trim());
              }
              for (const imageUrl of imageUrls) {
                await sendChatwootImageMessage(msgUrl, cwAuth, imageUrl, "");
              }
              if (i < greetingParts.length - 1) {
                await new Promise((r) => setTimeout(r, applyJitter(2000)));
              }
            }
            await new Promise((r) => setTimeout(r, 2000));
          }

          await sendChatwootMediaMessage(
            msgUrl,
            cwAuth,
            welcome_video_url,
            "video/mp4",
            ""
          );
          await new Promise((r) => setTimeout(r, 8000));

          const nameQuestion = cfg.welcome_name_question || "Como posso te chamar?";
          await sendChatwootTextMessage(msgUrl, cwAuth, nameQuestion);

          if (conversation_id) {
            try {
              await supabase.rpc("save_message", {
                p_agent_id: agent_id,
                p_conversation_id: conversation_id,
                p_role: "assistant",
                p_content: "[Vídeo institucional enviado]",
                p_model: "system",
                p_latency_ms: null,
                p_metadata: { type: "welcome_video", video_url: welcome_video_url },
              });
              await supabase.rpc("save_message", {
                p_agent_id: agent_id,
                p_conversation_id: conversation_id,
                p_role: "assistant",
                p_content: nameQuestion,
                p_model: "system",
                p_latency_ms: null,
                p_metadata: { type: "welcome_name_question" },
              });
            } catch (e: any) {
              console.warn(`[Deliver] Failed to save welcome messages:`, e.message);
            }
          }
        } else {
          const hasContent = (response_text || "").trim() || (response_parts || []).some((p: string) => (p || "").trim());
          const contentToSend = hasContent
            ? (response_text || "").trim()
            : "Desculpe, tive um problema ao processar sua mensagem. Pode repetir, por favor?";
          const partsToSend = hasContent ? (response_parts || []) : [];
          if (hasContent) {
            msgLog.deliveryOk(agent_id, conversation_id ?? null);
          } else {
            msgLog.deliveryFallback(agent_id);
          }
          await replyToChatwoot(
            cfg.chatwoot_url,
            cwAuth,
            cfg.chatwoot_account_id,
            chatwoot_conversation_id,
            contentToSend,
            partsToSend,
            humanization
          );
        }
        if (handoff_assignee_id != null) {
          try {
            const assignUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwoot_conversation_id}/assignments`;
            await fetch(assignUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...cwAuth },
              body: JSON.stringify({ assignee_id: Number(handoff_assignee_id) }),
            });
          } catch {
            /* re-assign após envio para evitar que Chatwoot reassigne ao bot */
          }
        }
      }

      const followupEnabled = cfg.followup_enabled === true || cfg.followup_enabled === "true";

      // #region agent log
      fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4bd6f5'},body:JSON.stringify({sessionId:'4bd6f5',location:'delivery.ts:followup-check',message:'Delivery followup check',data:{followupEnabled,conversation_id:!!conversation_id,chatwoot_conversation_id:!!chatwoot_conversation_id,agent_id},timestamp:Date.now(),hypothesisId:'H1,H5'})}).catch(()=>{});
      // #endregion

      if (followupEnabled && conversation_id && chatwoot_conversation_id) {
        const intervals: number[] = Array.isArray(cfg.followup_intervals)
          ? cfg.followup_intervals
          : [10, 20, 30];
        const maxAttempts = Math.max(intervals.length, Number(cfg.followup_max_attempts) || 0);
        const firstDelay = intervals[0] || 10;

        try {
          const { data: followupId } = await supabase.rpc("schedule_followup", {
            p_agent_id: agent_id,
            p_conversation_id: conversation_id,
            p_external_user_id: external_user_id,
            p_channel: channel,
            p_chatwoot_conversation_id: chatwoot_conversation_id,
            p_attempt: 1,
            p_max_attempts: maxAttempts,
            p_intervals_minutes: intervals,
            p_delay_minutes: firstDelay,
          });
          console.log(`[FollowUp] Agendado 1/${maxAttempts} | conv=${conversation_id?.slice(0, 8)}… | delay=${firstDelay}min | id=${followupId ?? "—"}`);
          // #region agent log
          fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4bd6f5'},body:JSON.stringify({sessionId:'4bd6f5',location:'delivery.ts:schedule_followup-success',message:'schedule_followup OK',data:{agent_id,conversation_id,firstDelay},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
        } catch (e: any) {
          // #region agent log
          fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'4bd6f5'},body:JSON.stringify({sessionId:'4bd6f5',location:'delivery.ts:schedule_followup-fail',message:'schedule_followup FAILED',data:{agent_id,error:e?.message},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
          // #endregion
          console.warn("[Deliver] Schedule follow-up failed:", e.message);
        }
      } else {
        const reason = !followupEnabled ? "followup_enabled=false" : !conversation_id ? "conversation_id ausente" : "chatwoot_conversation_id ausente";
        console.warn("[Deliver] Follow-up não agendado:", reason, "agent_id=" + agent_id);
      }

      return reply.send({
        status: "delivered",
        conversation_id,
        parts: (response_parts || []).length,
      });
    }
  );
}
