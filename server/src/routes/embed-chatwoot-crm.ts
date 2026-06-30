import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  assertContactBelongsToTenant,
  findContactByPhone,
  getContactSummary,
  lookupState,
  normalizePhoneFromChatwoot,
  promoteOrCreateClient,
  resolveTenantFromChatwootAccount,
} from "../services/chatwoot-crm-embed.js";
import { applyEmbedHeaders, assertEmbedKey } from "./embed-auth.js";

const PATCH_ALLOWED = [
  "name",
  "email",
  "phone",
  "cpf_cnpj",
  "address",
  "city",
  "state",
  "zip_code",
  "notes",
  "metadata",
  "avatar_url",
] as const;

export async function embedChatwootCrmRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/embed/chatwoot/crm/lookup",
    async (
      req: FastifyRequest<{ Querystring: { account_id?: string; phone?: string; key?: string } }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      const phoneRaw = req.query.phone?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });
      if (!phoneRaw) return reply.status(400).send({ error: "phone é obrigatório" });

      const phoneDigits = normalizePhoneFromChatwoot(phoneRaw);
      if (!phoneDigits) {
        return reply.send({
          state: "missing" as const,
          contact: null,
          tenant_id: null,
          message: "Telefone inválido",
        });
      }

      try {
        const supabase = createNexusClient();
        const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
        if (!resolved) {
          return reply.status(404).send({
            error: "Nenhum agente Boom IA vinculado a este chatwoot_account_id",
          });
        }

        const contact = await findContactByPhone(supabase, resolved.tenantId, phoneDigits);
        return reply.send({
          state: lookupState(contact),
          contact,
          tenant_id: resolved.tenantId,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        fastify.log.error({ err: e }, "[embed-crm] lookup error");
        return reply.status(500).send({ error: msg });
      }
    },
  );

  fastify.post(
    "/embed/chatwoot/crm/promote",
    async (
      req: FastifyRequest<{
        Querystring: { account_id?: string; key?: string };
        Body: { phone?: string; name?: string; email?: string };
      }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

      const body = req.body ?? {};
      const phoneDigits = normalizePhoneFromChatwoot(body.phone);
      if (!phoneDigits) return reply.status(400).send({ error: "Telefone inválido" });

      try {
        const supabase = createNexusClient();
        const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
        if (!resolved) {
          return reply.status(404).send({
            error: "Nenhum agente Boom IA vinculado a este chatwoot_account_id",
          });
        }

        const contact = await promoteOrCreateClient(supabase, {
          tenantId: resolved.tenantId,
          phoneDigits,
          name: body.name,
          email: body.email,
        });

        return reply.send({
          state: "client" as const,
          contact,
          tenant_id: resolved.tenantId,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        fastify.log.error({ err: e }, "[embed-crm] promote error");
        return reply.status(500).send({ error: msg });
      }
    },
  );

  fastify.get(
    "/embed/chatwoot/crm/contacts/:id",
    async (
      req: FastifyRequest<{ Params: { id: string }; Querystring: { account_id?: string; key?: string } }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

      try {
        const supabase = createNexusClient();
        const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
        if (!resolved) return reply.status(404).send({ error: "Conta Chatwoot não vinculada" });

        const contact = await assertContactBelongsToTenant(supabase, req.params.id, resolved.tenantId);
        return reply.send(contact);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = msg.includes("não encontrado") ? 404 : msg.includes("não pertence") ? 403 : 500;
        return reply.status(status).send({ error: msg });
      }
    },
  );

  fastify.patch(
    "/embed/chatwoot/crm/contacts/:id",
    async (
      req: FastifyRequest<{
        Params: { id: string };
        Querystring: { account_id?: string; key?: string };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

      try {
        const supabase = createNexusClient();
        const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
        if (!resolved) return reply.status(404).send({ error: "Conta Chatwoot não vinculada" });

        await assertContactBelongsToTenant(supabase, req.params.id, resolved.tenantId);

        const body = req.body ?? {};
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const key of PATCH_ALLOWED) {
          if (body[key] !== undefined) {
            updates[key] =
              key === "metadata" && typeof body[key] !== "string"
                ? JSON.stringify(body[key] ?? {})
                : body[key];
          }
        }

        const { data, error } = await supabase
          .from("contacts")
          .update(updates)
          .eq("id", req.params.id)
          .select(
            "id, tenant_id, name, email, phone, cpf_cnpj, address, city, state, zip_code, notes, metadata, avatar_url, contact_type, created_at, updated_at, tenants(name)",
          )
          .single();

        if (error) throw error;
        return reply.send(data);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = msg.includes("não encontrado") ? 404 : msg.includes("não pertence") ? 403 : 500;
        return reply.status(status).send({ error: msg });
      }
    },
  );

  fastify.get(
    "/embed/chatwoot/crm/contacts/:id/summary",
    async (
      req: FastifyRequest<{ Params: { id: string }; Querystring: { account_id?: string; key?: string } }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

      try {
        const supabase = createNexusClient();
        const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
        if (!resolved) return reply.status(404).send({ error: "Conta Chatwoot não vinculada" });

        await assertContactBelongsToTenant(supabase, req.params.id, resolved.tenantId);
        const summary = await getContactSummary(supabase, req.params.id);
        return reply.send(summary);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const status = msg.includes("não encontrado") ? 404 : msg.includes("não pertence") ? 403 : 500;
        return reply.status(status).send({ error: msg });
      }
    },
  );
}
