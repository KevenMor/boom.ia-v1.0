import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createClient } from "@supabase/supabase-js";
import { sendViaWaha } from "../services/waha.js";
import { getChatwootAuthHeaders } from "../services/delivery.js";

async function sendViaChatwoot(
  cfg: Record<string, any>,
  phone: string,
  name: string | undefined,
  message: string
): Promise<{ ok: boolean; contactId?: number; chatwootConvId?: number; error?: string }> {
  const baseUrl = (cfg.chatwoot_url as string).replace(/\/+$/, "");
  const accountId = cfg.chatwoot_account_id;
  const apiToken = cfg.chatwoot_api_token;
  const inboxId = cfg.chatwoot_inbox_id;
  const phoneWithPlus = "+" + phone;
  const cwAuth = getChatwootAuthHeaders(apiToken, cfg);

  let contactId: number | null = null;
  try {
    const searchResp = await fetch(
      `${baseUrl}/api/v1/accounts/${accountId}/contacts/search?q=${encodeURIComponent(phoneWithPlus)}`,
      { headers: cwAuth }
    );
    if (searchResp.ok) {
      const searchData = await searchResp.json();
      const payload = searchData.payload || [];
      if (payload.length > 0) contactId = payload[0].id;
    }
  } catch {}

  if (!contactId) {
    try {
      const createResp = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...cwAuth },
        body: JSON.stringify({
          name: name?.trim() || phoneWithPlus,
          phone_number: phoneWithPlus,
          ...(inboxId ? { inbox_id: Number(inboxId) } : {}),
        }),
      });
      if (createResp.ok) {
        const createData = await createResp.json();
        contactId = createData.payload?.contact?.id || createData.payload?.id || createData.id;
      } else {
        return { ok: false, error: await createResp.text() };
      }
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  if (!contactId) return { ok: false, error: "Failed to find or create contact" };

  let chatwootConvId: number | null = null;
  try {
    const convBody: Record<string, any> = {
      contact_id: contactId,
      message: { content: message.trim() },
      status: "open",
    };
    if (inboxId) convBody.inbox_id = Number(inboxId);
    const convResp = await fetch(`${baseUrl}/api/v1/accounts/${accountId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cwAuth },
      body: JSON.stringify(convBody),
    });
    if (convResp.ok) {
      const convData = await convResp.json();
      chatwootConvId = convData.id || convData.payload?.id;
    } else {
      return { ok: false, error: await convResp.text() };
    }
  } catch (e: any) {
    return { ok: false, error: e.message };
  }

  return { ok: true, contactId, chatwootConvId: chatwootConvId ?? undefined };
}

export async function contactsRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/contacts/new",
    async (
      req: FastifyRequest<{ Body: { agent_id: string; phone: string; name?: string; message: string } }>,
      reply: FastifyReply
    ) => {
      const nexusUrl = process.env.NEXUS_DB_URL;
      const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
      if (!nexusUrl || !nexusKey) {
        return reply.status(500).send({ error: "Missing server config" });
      }

      const { agent_id, phone, name, message } = req.body;
      if (!agent_id || !phone?.trim() || !message?.trim()) {
        return reply.status(400).send({ error: "Missing agent_id, phone, or message" });
      }

      const supabase = createClient(nexusUrl, nexusKey);
      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("id, name, config")
        .eq("id", agent_id)
        .maybeSingle();

      if (agentErr || !agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const cfg = (agent.config || {}) as Record<string, any>;
      let normalizedPhone = phone.replace(/\D/g, "");
      if (!normalizedPhone.startsWith("55") && normalizedPhone.length <= 11) {
        normalizedPhone = "55" + normalizedPhone;
      }

      const hasWaha = !!(cfg.waha_url && cfg.waha_api_key);
      const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id);

      let delivered = false;
      let deliveryMethod = "none";
      let chatwootConvId: number | undefined;
      let contactId: number | undefined;

      if (hasWaha) {
        const result = await sendViaWaha(
          cfg.waha_url,
          cfg.waha_api_key,
          cfg.waha_session || "default",
          normalizedPhone,
          message.trim()
        );
        delivered = result.ok;
        deliveryMethod = "waha";
        if (!result.ok && hasChatwoot) {
          const cwResult = await sendViaChatwoot(cfg, normalizedPhone, name, message.trim());
          delivered = cwResult.ok;
          deliveryMethod = "chatwoot_fallback";
          chatwootConvId = cwResult.chatwootConvId;
          contactId = cwResult.contactId;
        }
      } else if (hasChatwoot) {
        const cwResult = await sendViaChatwoot(cfg, normalizedPhone, name, message.trim());
        delivered = cwResult.ok;
        deliveryMethod = "chatwoot";
        chatwootConvId = cwResult.chatwootConvId;
        contactId = cwResult.contactId;
      } else {
        return reply.status(400).send({ error: "Agent has no WAHA or Chatwoot configuration" });
      }

      let convId: string | null = null;
      try {
        const { data } = await supabase.rpc("create_conversation", {
          p_agent_id: agent_id,
          p_channel: "whatsapp",
          p_external_user_id: normalizedPhone,
          p_contact_name: name?.trim() || null,
          p_contact_avatar_url: null,
        });
        convId = data;
      } catch {}

      if (convId) {
        try {
          await supabase.rpc("save_message", {
            p_agent_id: agent_id,
            p_conversation_id: convId,
            p_role: "assistant",
            p_content: message.trim(),
            p_model: "operator",
            p_tokens_input: 0,
            p_tokens_output: 0,
            p_latency_ms: 0,
            p_metadata: null,
          });
        } catch {}
      }

      return reply.send({
        status: "created",
        delivered,
        delivery_method: deliveryMethod,
        contact_id: contactId,
        chatwoot_conversation_id: chatwootConvId,
        conversation_id: convId,
      });
    }
  );

  fastify.post(
    "/contacts/send-operator-message",
    async (
      req: FastifyRequest<{ Body: { agent_id: string; conversation_id: string; content: string } }>,
      reply: FastifyReply
    ) => {
      const nexusUrl = process.env.NEXUS_DB_URL;
      const nexusKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
      if (!nexusUrl || !nexusKey) {
        return reply.status(500).send({ error: "Missing server config" });
      }

      const { agent_id, conversation_id, content } = req.body;
      if (!agent_id || !conversation_id || !content?.trim()) {
        return reply.status(400).send({ error: "Missing agent_id, conversation_id, or content" });
      }

      const supabase = createClient(nexusUrl, nexusKey);
      const { data: agent, error: agentErr } = await supabase
        .from("agents")
        .select("id, name, config")
        .eq("id", agent_id)
        .maybeSingle();

      if (agentErr || !agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }

      const cfg = (agent.config || {}) as Record<string, any>;
      let chatwootConvId: number | null = null;
      let externalUserId: string | null = null;

      try {
        const { data: convList } = await supabase.rpc("list_agent_conversations", {
          p_agent_id: agent_id,
          p_limit: 200,
        });
        if (Array.isArray(convList)) {
          const match = convList.find((c: any) => c.id === conversation_id);
          if (match) {
            chatwootConvId = match.chatwoot_conversation_id ?? null;
            externalUserId = match.external_user_id ?? null;
          }
        }
      } catch {}

      const hasChatwoot = !!(cfg.chatwoot_url && cfg.chatwoot_api_token && cfg.chatwoot_account_id && chatwootConvId);
      const hasWaha = !!(cfg.waha_url && cfg.waha_api_key);

      let delivered = false;
      let deliveryMethod = "none";

      if (hasChatwoot) {
        const msgUrl = `${(cfg.chatwoot_url as string).replace(/\/+$/, "")}/api/v1/accounts/${cfg.chatwoot_account_id}/conversations/${chatwootConvId}/messages`;
        const cwAuth = getChatwootAuthHeaders(cfg.chatwoot_api_token, cfg);
        try {
          const resp = await fetch(msgUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...cwAuth },
            body: JSON.stringify({ content: content.trim(), message_type: "outgoing", private: false }),
          });
          if (resp.ok) {
            delivered = true;
            deliveryMethod = "chatwoot";
          }
        } catch {}
      } else if (hasWaha && externalUserId) {
        const phone = externalUserId.replace(/\D/g, "");
        if (phone.length >= 10) {
          const result = await sendViaWaha(
            cfg.waha_url as string,
            cfg.waha_api_key || "",
            cfg.waha_session || "default",
            phone,
            content.trim()
          );
          if (result.ok) {
            delivered = true;
            deliveryMethod = "waha";
          }
        }
      }

      try {
        await supabase.rpc("save_message", {
          p_agent_id: agent_id,
          p_conversation_id: conversation_id,
          p_role: "assistant",
          p_content: content.trim(),
          p_model: "operator",
          p_tokens_input: 0,
          p_tokens_output: 0,
          p_latency_ms: 0,
          p_metadata: null,
        });
      } catch {}

      return reply.send({
        status: "sent",
        delivered,
        delivery_method: deliveryMethod,
        chatwoot_conversation_id: chatwootConvId,
      });
    }
  );
}
