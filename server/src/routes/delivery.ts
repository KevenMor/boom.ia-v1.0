import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  sendChatwootTextMessage,
  sendChatwootImageMessage,
  sendChatwootMediaMessage,
  getHumanizationConfig,
  replyToChatwoot,
  applyJitter,
  MEDIA_DELIVERY_FAILED_PT,
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
        const WELCOME_PRE_VIDEO_GAP_MS = 350;
        const WELCOME_POST_VIDEO_DELAY_MS = 15000;
        const WELCOME_TEXT_GAP_MS = 2000;

        if (welcome_video_url) {
          const greetingParts: string[] =
            Array.isArray(response_parts) && response_parts.length > 0
              ? response_parts.filter((p: string) => p?.trim())
              : response_text?.trim()
                ? [response_text.trim()]
                : [];

          const [firstGreetingPart, ...postVideoGreetingParts] = greetingParts;
          const sendGreetingPart = async (part: string) => {
            const trimmed = part.trim();
            if (!trimmed) return;

            const imageRegex = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
            const imageUrls: string[] = [];
            let match: RegExpExecArray | null;
            while ((match = imageRegex.exec(trimmed)) !== null) {
              if (match[1]) imageUrls.push(match[1].trim());
            }
            const textOnly = trimmed.replace(imageRegex, "").replace(/\n{3,}/g, "\n\n").trim();

            if (textOnly.trim()) {
              await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, textOnly.trim());
            }
            for (const imageUrl of imageUrls) {
              await sendChatwootImageMessage(msgUrl, cfg.chatwoot_api_token, imageUrl, "");
            }
          };

          // Envia somente a primeira mensagem antes do vídeo (ordem correta no WhatsApp).
          if (firstGreetingPart?.trim()) {
            await sendGreetingPart(firstGreetingPart);
            await new Promise((r) => setTimeout(r, applyJitter(WELCOME_PRE_VIDEO_GAP_MS)));
          }

          const welcomeVideoSent = await sendChatwootMediaMessage(
            msgUrl,
            cfg.chatwoot_api_token,
            welcome_video_url,
            "video/mp4",
            ""
          );
          if (!welcomeVideoSent) {
            await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, MEDIA_DELIVERY_FAILED_PT);
          }

          // Após o vídeo, aguarda mais tempo para Chatwoot/WhatsApp concluir envio de mídia.
          await new Promise((r) => setTimeout(r, WELCOME_POST_VIDEO_DELAY_MS));

          for (let i = 0; i < postVideoGreetingParts.length; i++) {
            await sendGreetingPart(postVideoGreetingParts[i]);
            if (i < postVideoGreetingParts.length - 1) {
              await new Promise((r) => setTimeout(r, applyJitter(WELCOME_TEXT_GAP_MS)));
            }
          }

          const nameQuestion = cfg.welcome_name_question || "Como posso te chamar?";
          await sendChatwootTextMessage(msgUrl, cfg.chatwoot_api_token, nameQuestion);

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
          await replyToChatwoot(
            cfg.chatwoot_url,
            cfg.chatwoot_api_token,
            cfg.chatwoot_account_id,
            chatwoot_conversation_id,
            (response_text || "").trim(),
            response_parts || [],
            humanization
          );
        }
      }

      const followupEnabled = cfg.followup_enabled === true || cfg.followup_enabled === "true";

      if (followupEnabled && conversation_id && chatwoot_conversation_id) {
        const intervals: number[] = Array.isArray(cfg.followup_intervals)
          ? cfg.followup_intervals
          : [10, 20, 30];
        const maxAttempts = Number(cfg.followup_max_attempts) || intervals.length;
        const firstDelay = intervals[0] || 10;

        try {
          await supabase.rpc("schedule_followup", {
            p_agent_id: agent_id,
            p_conversation_id: conversation_id,
            p_external_user_id: external_user_id,
            p_channel: channel,
            p_chatwoot_conversation_id: chatwoot_conversation_id,
            p_attempt: 1,
            p_max_attempts: maxAttempts,
            p_intervals_minutes: JSON.stringify(intervals),
            p_delay_minutes: firstDelay,
          });
        } catch (e: any) {
          console.warn("[Deliver] Schedule follow-up failed:", e.message);
        }
      }

      return reply.send({
        status: "delivered",
        conversation_id,
        parts: (response_parts || []).length,
      });
    }
  );
}
