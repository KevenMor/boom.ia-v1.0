import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { encrypt } from "../services/crypto.js";
import { requireAuthenticated, canManageTenant } from "../services/authorization.js";
import {
  asaasRequest,
  getAsaasConfigRow,
  type AsaasEnvironment,
} from "../services/asaas-client.js";
import { createChargeFromInvoice } from "../services/asaas-charges.js";

interface SaveConfigBody {
  tenant_id: string;
  environment: AsaasEnvironment;
  api_key?: string;
  webhook_token?: string | null;
}

async function requireTenantAdmin(req: FastifyRequest, reply: FastifyReply, tenantId: string) {
  const ctx = await requireAuthenticated(req, reply);
  if (!ctx) return null;
  if (!canManageTenant(ctx, tenantId)) {
    reply.status(403).send({ error: "forbidden_tenant_access" });
    return null;
  }
  return ctx;
}

export async function paymentsAsaasRoutes(fastify: FastifyInstance) {
  fastify.get("/payments/asaas/config", async (req, reply) => {
    const tenantId = (req.query as { tenant_id?: string }).tenant_id;
    if (!tenantId) return reply.status(400).send({ error: "tenant_id required" });
    const ctx = await requireTenantAdmin(req, reply, tenantId);
    if (!ctx) return;

    const row = await getAsaasConfigRow(tenantId);
    return reply.send({ data: row });
  });

  fastify.put("/payments/asaas/config", async (req, reply) => {
    const body = req.body as SaveConfigBody;
    if (!body?.tenant_id) return reply.status(400).send({ error: "tenant_id required" });
    const env: AsaasEnvironment = body.environment === "production" ? "production" : "sandbox";

    const ctx = await requireTenantAdmin(req, reply, body.tenant_id);
    if (!ctx) return;

    const encryptionKey = process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET;
    if (!encryptionKey) return reply.status(500).send({ error: "ENCRYPTION_KEY not configured" });

    const supabase = createNexusClient();
    const update: Record<string, unknown> = {
      environment: env,
      updated_at: new Date().toISOString(),
    };

    if (body.api_key && body.api_key.trim().length > 0) {
      update.api_key_encrypted = await encrypt(body.api_key.trim(), encryptionKey);
    }
    if (body.webhook_token !== undefined) {
      update.webhook_token = body.webhook_token || null;
    }

    const { error } = await supabase
      .from("tenant_asaas_config")
      .upsert({ tenant_id: body.tenant_id, ...update, created_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    if (error) return reply.status(500).send({ error: error.message });
    return reply.send({ success: true });
  });

  fastify.post("/payments/asaas/test", async (req, reply) => {
    const body = req.body as { tenant_id?: string };
    if (!body?.tenant_id) return reply.status(400).send({ error: "tenant_id required" });

    const ctx = await requireTenantAdmin(req, reply, body.tenant_id);
    if (!ctx) return;

    const res = await asaasRequest<{ walletId?: string; name?: string }>({
      tenantId: body.tenant_id,
      path: "/finance/balance",
    });

    const supabase = createNexusClient();
    const update: Record<string, unknown> = {
      last_tested_at: new Date().toISOString(),
    };

    if (res.ok) {
      update.last_test_status = "ok";
      update.last_test_error = null;
    } else {
      update.last_test_status = "error";
      update.last_test_error = res.error;
    }

    await supabase.from("tenant_asaas_config").update(update).eq("tenant_id", body.tenant_id);

    if (!res.ok) {
      return reply.status(200).send({ ok: false, error: res.error });
    }

    const me = await asaasRequest<{ name?: string; walletId?: string }>({
      tenantId: body.tenant_id,
      path: "/myAccount/isEnabled",
    });
    if (me.ok && me.data) {
      await supabase
        .from("tenant_asaas_config")
        .update({
          account_name: me.data.name ?? null,
          wallet_id: me.data.walletId ?? null,
        })
        .eq("tenant_id", body.tenant_id);
    }

    return reply.send({ ok: true });
  });

  fastify.post(
    "/payments/asaas/invoices/:invoiceId/sync",
    async (req, reply) => {
      const params = req.params as { invoiceId: string };
      const body = req.body as { tenant_id?: string };
      if (!body?.tenant_id) return reply.status(400).send({ error: "tenant_id required" });

      const ctx = await requireTenantAdmin(req, reply, body.tenant_id);
      if (!ctx) return;

      try {
        await createChargeFromInvoice(params.invoiceId, body.tenant_id);
        return reply.send({ success: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    }
  );
}