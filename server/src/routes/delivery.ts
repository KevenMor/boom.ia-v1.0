import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { msgLog } from "../utils/flow-logger.js";
import { isThinkingAboutIt, getThinkingDelayMinutes } from "../utils/followup-utils.js";
import {
  getChatwootAuthHeaders,
  sendChatwootTextMessage,
  sendChatwootImageMessage,
  sendChatwootImagesBatch,
  sendChatwootMediaMessage,
  sendChatwootVideoMessage,
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
          video_inventory_ids?: string[];
          photo_inventory_ids?: string[];
          assignee_id?: number;
          team_id?: number;
          user_message?: string;
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
        video_inventory_ids,
        photo_inventory_ids,
        assignee_id: handoff_assignee_id,
        team_id: handoff_team_id,
        user_message,
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

        // Se a conversa já tem um assignee diferente do bot, não enviar mensagem nem atribuir
        try {
          const convUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwoot_conversation_id}`;
          const convResp = await fetch(convUrl, { headers: cwAuth, signal: AbortSignal.timeout(10_000) });
          if (convResp.ok) {
            const raw = (await convResp.json()) as Record<string, unknown>;
            const convData = ((raw.payload as Record<string, unknown>) || raw) as Record<string, unknown>;
            const meta = (convData.meta || convData) as Record<string, unknown>;
            const assignee = (meta.assignee || convData.assignee) as { id?: number | string } | null;
            const currentAssigneeId = assignee?.id != null ? Number(assignee.id) : null;

            const isAgentOwnConversation = agentAssigneeId != null && currentAssigneeId === agentAssigneeId;
            const hasHumanAssigned = currentAssigneeId != null && !isAgentOwnConversation;

            if (hasHumanAssigned) {
              console.log(`[Deliver] SKIPPED human_assigned | conv=${chatwoot_conversation_id} currentAssignee=${currentAssigneeId} agentAssignee=${agentAssigneeId ?? "—"}`);
              return reply.send({
                status: "skipped",
                reason: "human_assigned",
                conversation_id,
                message: "Conversa já atribuída a outro agente; mensagem não enviada",
              });
            }
          }
        } catch (e: unknown) {
          console.warn("[Deliver] Chatwoot assignee check failed:", (e as Error)?.message);
        }

        // Só atribuir ANTES do envio quando for o agente (bot). Em handoff, atribuímos APÓS o envio
        // para evitar que o Chatwoot desvincule o humano quando a IA envia a mensagem.
        if (handoff_assignee_id == null && agentAssigneeId != null) {
          try {
            const assignUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwoot_conversation_id}/assignments`;
            const assignResp = await fetch(assignUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...cwAuth },
              body: JSON.stringify({ assignee_id: agentAssigneeId }),
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

          await sendChatwootVideoMessage(
            msgUrl,
            cwAuth,
            welcome_video_url,
            sendChatwootTextMessage
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
            : "Opa, tive um problema na última mensagem enviada, pode me reenviar?";
          const partsToSend = hasContent ? (response_parts || []) : [];

          if (Array.isArray(photo_inventory_ids) && photo_inventory_ids.length > 0) {
            const { data: photoRows } = await supabase
              .from("inventory")
              .select("id, photos, photo_url")
              .in("id", photo_inventory_ids);
            for (const row of photoRows ?? []) {
              const photoUrls: string[] = [];
              if (row.photos) {
                try {
                  const parsed = typeof row.photos === "string" ? JSON.parse(row.photos) : row.photos;
                  if (Array.isArray(parsed)) photoUrls.push(...(parsed as string[]).filter(Boolean));
                } catch { /* ignore */ }
              }
              if (photoUrls.length === 0 && row.photo_url) photoUrls.push(row.photo_url);
              if (photoUrls.length > 0) {
                await sendChatwootImagesBatch(msgUrl, cwAuth, photoUrls);
                await new Promise((r) => setTimeout(r, applyJitter(2000)));
              }
            }
          }

          if (Array.isArray(video_inventory_ids) && video_inventory_ids.length > 0) {
            const { data: inventoryRows } = await supabase
              .from("inventory")
              .select("id, video_details")
              .in("id", video_inventory_ids);
            const videoUrls = (inventoryRows ?? [])
              .filter((r: { video_details?: string | null }) => r.video_details && r.video_details.trim())
              .map((r: { video_details: string }) => r.video_details);
            for (const videoUrl of videoUrls) {
              await sendChatwootVideoMessage(msgUrl, cwAuth, videoUrl, sendChatwootTextMessage);
              await new Promise((r) => setTimeout(r, applyJitter(3000)));
            }
          }

          if (hasContent) {
            msgLog.deliveryOk(agent_id, conversation_id ?? null);
          } else if (!video_inventory_ids?.length) {
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
        // Atribuição APÓS envio da mensagem — evita que o Chatwoot desvincule o humano quando a IA envia.
        if (handoff_assignee_id != null || handoff_team_id != null) {
          try {
            const assignUrl = `${baseUrl}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwoot_conversation_id}/assignments`;
            const assignBody: Record<string, number> = {};
            if (handoff_assignee_id != null) assignBody.assignee_id = Number(handoff_assignee_id);
            if (handoff_team_id != null) assignBody.team_id = Number(handoff_team_id);
            const assignResp = await fetch(assignUrl, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...cwAuth },
              body: JSON.stringify(assignBody),
            });
            if (!assignResp.ok) {
              console.warn("[Deliver] Falha ao atribuir após envio (handoff):", assignResp.status, await assignResp.text().catch(() => ""));
            }
          } catch (e: any) {
            console.warn("[Deliver] Assign handoff após envio falhou:", e?.message);
          }
        }
      }

      const followupEnabled = cfg.followup_enabled === true || cfg.followup_enabled === "true";

      if (followupEnabled && conversation_id && chatwoot_conversation_id) {
        const intervals: number[] = Array.isArray(cfg.followup_intervals)
          ? cfg.followup_intervals
          : [10, 20, 30];
        const maxAttempts = Math.max(intervals.length, Number(cfg.followup_max_attempts) || 0);
        const firstDelay = isThinkingAboutIt(user_message)
          ? getThinkingDelayMinutes(cfg)
          : intervals[0] || 10;

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
          // Fallback: garantir cancel_reason em itens cancelados (se migração schedule_followup não aplicada)
          await supabase
            .from("follow_up_queue")
            .update({ cancel_reason: "superseded", updated_at: new Date().toISOString() })
            .eq("agent_id", agent_id)
            .eq("conversation_id", conversation_id)
            .eq("status", "cancelled")
            .is("cancel_reason", null);
          if (followupId) {
            const { addFollowUpJob } = await import("../services/followup-queue.js");
            await addFollowUpJob(followupId, firstDelay * 60 * 1000);
          }
          const delayLabel = isThinkingAboutIt(user_message) ? `${firstDelay}min (vou pensar → D+2)` : `${firstDelay}min`;
          console.log(`[FollowUp] Agendado 1/${maxAttempts} | conv=${conversation_id?.slice(0, 8)}… | delay=${delayLabel} | id=${followupId ?? "—"}`);
        } catch (e: any) {
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
