import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { upsertCrmContact } from "../services/crm-contact-sync.js";

interface ContactRecord {
  id?: string;
  tenant_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  cpf_cnpj?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  notes?: string | null;
  metadata?: unknown;
}

export async function crmContactsRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  fastify.get(
    "/crm-contacts",
    async (
      req: FastifyRequest<{
        Querystring: { tenant_id?: string; limit?: string; offset?: string; search?: string; order_by?: string; order_dir?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { tenant_id, limit = "100", offset = "0", search, order_by = "updated_at", order_dir = "desc" } = req.query;
        const orderCol = order_by === "name" ? "name" : "updated_at";
        const orderAsc = order_dir === "asc";
        let query = supabase
          .from("contacts")
          .select("id, tenant_id, name, email, phone, cpf_cnpj, address, city, state, zip_code, notes, metadata, avatar_url, created_at, updated_at, tenants(name)", { count: "exact" })
          .order(orderCol, { ascending: orderAsc });

        if (tenant_id) query = query.eq("tenant_id", tenant_id);
        if (search && search.trim()) {
          const term = `%${search.trim()}%`;
          query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
        }

        const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
        query = query.range(offsetNum, offsetNum + limitNum - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        return reply.send({ data: data ?? [], total: count ?? 0 });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts list error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.post(
    "/crm-contacts",
    async (
      req: FastifyRequest<{ Body: Partial<ContactRecord> }>,
      reply: FastifyReply
    ) => {
      try {
        const body = req.body as Record<string, unknown>;
        const record: Record<string, unknown> = {
          tenant_id: body.tenant_id,
          name: body.name ?? "",
          email: body.email ?? null,
          phone: body.phone ?? null,
          cpf_cnpj: body.cpf_cnpj ?? null,
          address: body.address ?? null,
          city: body.city ?? null,
          state: body.state ?? null,
          zip_code: body.zip_code ?? null,
          notes: body.notes ?? null,
          metadata: typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata ?? {}),
        };

        if (!record.tenant_id || !record.name) {
          return reply.status(400).send({ error: "tenant_id e name são obrigatórios" });
        }

        const { data, error } = await supabase.from("contacts").insert(record).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts create error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.patch(
    "/crm-contacts/:id",
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: Partial<ContactRecord> }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = req.params;
        const body = req.body as Record<string, unknown>;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const allowed = ["name", "email", "phone", "cpf_cnpj", "address", "city", "state", "zip_code", "notes", "metadata", "avatar_url"];
        for (const key of allowed) {
          if (body[key] !== undefined) {
            updates[key] = key === "metadata" && typeof body[key] !== "string"
              ? JSON.stringify(body[key] ?? {})
              : body[key];
          }
        }

        const { data, error } = await supabase.from("contacts").update(updates).eq("id", id).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts update error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.delete(
    "/crm-contacts/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = req.params;
        const { error } = await supabase.from("contacts").delete().eq("id", id);
        if (error) throw error;
        return reply.send({ success: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts delete error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.get(
    "/crm-contacts/:id/conversation-preview",
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = req.params;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .select("id, tenant_id, name, phone")
          .eq("id", id)
          .maybeSingle();

        if (contactErr || !contact) {
          return reply.status(404).send({ error: "Contato não encontrado" });
        }

        const phoneRaw = (contact.phone || "").trim();
        const phoneDigits = phoneRaw.replace(/\D/g, "");
        if (phoneDigits.length < 10) {
          return reply.send({
            messages: [],
            chatwoot_url: null,
            agent_name: null,
          });
        }

        const phoneNorm = phoneDigits.startsWith("55") && phoneDigits.length >= 12
          ? phoneDigits
          : "55" + phoneDigits;

        const { data: agents } = await supabase
          .from("agents")
          .select("id, name, avatar_url, config")
          .eq("tenant_id", contact.tenant_id);

        const agentsList = (agents ?? []) as Array<{ id: string; name: string; avatar_url: string | null; config: Record<string, unknown> | null }>;
        let bestConv: { id: string; agent_id: string; agent_name: string; agent_avatar_url: string | null; chatwoot_conversation_id: number | null; config: Record<string, unknown> } | null = null;

        for (const agent of agentsList) {
          const { data: convs } = await supabase.rpc("list_agent_conversations", {
            p_agent_id: agent.id,
            p_limit: 200,
          });
          const list = (convs ?? []) as Array<{
            id: string;
            external_user_id: string | null;
            chatwoot_conversation_id: number | null;
            started_at: string;
          }>;
          for (const c of list) {
            const ext = (c.external_user_id || "").replace(/\D/g, "");
            const extNorm = ext.length >= 10
              ? (ext.startsWith("55") && ext.length >= 12 ? ext : "55" + ext)
              : "";
            if (extNorm !== phoneNorm) continue;

            const hasCw = c.chatwoot_conversation_id != null;
            const cfg = (agent.config || {}) as Record<string, unknown>;
            const hasCwConfig = !!(cfg.chatwoot_url && cfg.chatwoot_account_id);

            if (!bestConv) {
              bestConv = {
                id: c.id,
                agent_id: agent.id,
                agent_name: agent.name,
                agent_avatar_url: agent.avatar_url ?? null,
                chatwoot_conversation_id: c.chatwoot_conversation_id,
                config: cfg,
              };
              continue;
            }
            if (hasCw && hasCwConfig && !bestConv.chatwoot_conversation_id) {
              bestConv = {
                id: c.id,
                agent_id: agent.id,
                agent_name: agent.name,
                agent_avatar_url: agent.avatar_url ?? null,
                chatwoot_conversation_id: c.chatwoot_conversation_id,
                config: cfg,
              };
            }
          }
        }

        if (!bestConv) {
          return reply.send({
            messages: [],
            chatwoot_url: null,
            agent_name: null,
            agent_avatar_url: null,
          });
        }

        const { data: msgs } = await supabase.rpc("load_conversation_messages", {
          p_agent_id: bestConv.agent_id,
          p_conversation_id: bestConv.id,
        });

        const rawMsgs = (msgs ?? []) as Array<{
          id: string;
          role: string;
          content: string;
          created_at: string;
          model?: string | null;
          metadata?: Record<string, unknown> | null;
        }>;
        const messages = rawMsgs.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content ?? "",
          created_at: m.created_at,
          model: m.model ?? null,
          metadata: m.metadata ?? null,
        }));

        let chatwootUrl: string | null = null;
        if (
          bestConv.chatwoot_conversation_id &&
          bestConv.config.chatwoot_url &&
          bestConv.config.chatwoot_account_id
        ) {
          const base = String(bestConv.config.chatwoot_url).replace(/\/+$/, "");
          const accountId = bestConv.config.chatwoot_account_id;
          chatwootUrl = `${base}/app/accounts/${accountId}/conversations/${bestConv.chatwoot_conversation_id}`;
        }

        return reply.send({
          messages,
          chatwoot_url: chatwootUrl,
          agent_name: bestConv.agent_name,
          agent_avatar_url: bestConv.agent_avatar_url,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts conversation-preview error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.post(
    "/crm-contacts/sync-from-conversations",
    async (
      req: FastifyRequest<{ Body: { tenant_id?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tenantIdFilter = (req.body as { tenant_id?: string })?.tenant_id;
        const { data: agents } = await supabase
          .from("agents")
          .select("id, tenant_id")
          .order("tenant_id");
        const agentsList = (agents ?? []).filter(
          (a: { tenant_id: string }) => !tenantIdFilter || a.tenant_id === tenantIdFilter
        );

        const seen = new Map<string, { name: string | null; avatar_url: string | null }>();

        for (const agent of agentsList) {
          const { data: convs } = await supabase.rpc("list_agent_conversations", {
            p_agent_id: agent.id,
            p_limit: 500,
          });
          const list = (convs ?? []) as Array<{
            external_user_id: string | null;
            contact_name: string | null;
            contact_avatar_url: string | null;
          }>;
          for (const c of list) {
            const ext = (c.external_user_id || "").trim();
            if (!ext || ext === "anonymous") continue;
            const key = `${agent.tenant_id}::${ext}`;
            const contactName = (c.contact_name || "").trim() || null;
            const avatarUrl = (c.contact_avatar_url || "").trim() || null;
            const prev = seen.get(key);
            if (!prev) {
              seen.set(key, { name: contactName, avatar_url: avatarUrl });
            } else {
              if (contactName && !prev.name) prev.name = contactName;
              if (avatarUrl && !prev.avatar_url) prev.avatar_url = avatarUrl;
            }
          }
        }

        let synced = 0;
        for (const [key, info] of seen) {
          const [tenantId, ...parts] = key.split("::");
          const ext = parts.join("::");
          if (tenantId && ext) {
            await upsertCrmContact(supabase, tenantId, ext, info.name, info.avatar_url);
            synced++;
          }
        }

        return reply.send({
          success: true,
          synced,
          total_unique: seen.size,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts sync-from-conversations error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );
}
