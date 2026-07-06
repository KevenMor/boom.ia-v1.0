import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { syncChargeByChargeId } from "../services/asaas-charges.js";

interface AsaasWebhookBody {
  event: string;
  payment?: {
    id?: string;
    externalReference?: string;
    status?: string;
  };
  charge?: {
    id?: string;
    externalReference?: string;
  };
}

// Em produção, a URL pública (ex: https://ia.agboom.com.br/api/webhooks/asaas)
// precisa estar acessível pelo Asaas. Em dev, use ngrok/cloudflare como já
// é feito para outros webhooks do projeto (WAHA, Chatwoot).
// Configure o token no painel Asaas (Integrações > Webhooks) igual ao
// salvo em tenant_asaas_config.webhook_token OU, se não houver, o Asaas
// envia um token que você cola aqui (uma vez por tenant).

export async function webhooksAsaasRoutes(fastify: FastifyInstance) {
  fastify.post("/webhooks/asaas", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as AsaasWebhookBody;
    if (!body?.event) return reply.status(400).send({ error: "event required" });

    const chargeId = body.payment?.id ?? body.charge?.id;
    if (!chargeId) {
      fastify.log.warn({ event: body.event }, "[Asaas webhook] no charge id");
      return reply.status(200).send({ ignored: true });
    }

    try {
      await syncChargeByChargeId(chargeId);
      return reply.send({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err, event: body.event, chargeId }, "[Asaas webhook] sync failed");
      return reply.status(200).send({ error: msg });
    }
  });

  fastify.post("/webhooks/asaas/:tenantId", async (req: FastifyRequest, reply: FastifyReply) => {
    const params = req.params as { tenantId: string };
    const body = req.body as AsaasWebhookBody;
    if (!body?.event) return reply.status(400).send({ error: "event required" });

    const accessToken = (req.headers["asaas-access-token"] as string | undefined)?.trim();
    if (!accessToken) return reply.status(401).send({ error: "missing access token" });

    const supabase = createNexusClient();
    const { data: cfg, error: cfgErr } = await supabase
      .from("tenant_asaas_config")
      .select("webhook_token")
      .eq("tenant_id", params.tenantId)
      .maybeSingle<{ webhook_token: string | null }>();
    if (cfgErr || !cfg?.webhook_token) return reply.status(401).send({ error: "tenant webhook not configured" });
    if (cfg.webhook_token !== accessToken) return reply.status(401).send({ error: "invalid access token" });

    const chargeId = body.payment?.id ?? body.charge?.id;
    if (!chargeId) return reply.status(200).send({ ignored: true });

    try {
      await syncChargeByChargeId(chargeId);
      return reply.send({ success: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fastify.log.error({ err, event: body.event, chargeId }, "[Asaas webhook] sync failed");
      return reply.status(200).send({ error: msg });
    }
  });
}