import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { upsertCrmContact } from "../services/crm-contact-sync.js";
import { canAccessTenant, canManageTenant, requireAuthenticated } from "../services/authorization.js";

type ContactType = "lead" | "client";

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
  contact_type?: ContactType;
}

export async function crmContactsRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  fastify.get(
    "/crm-contacts",
    async (
      req: FastifyRequest<{
        Querystring: { tenant_id?: string; limit?: string; offset?: string; search?: string; order_by?: string; order_dir?: string; type?: ContactType };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { tenant_id, limit = "100", offset = "0", search, order_by = "updated_at", order_dir = "desc", type } = req.query;
        if (tenant_id && !canAccessTenant(auth, tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        const orderCol = order_by === "name" ? "name" : "updated_at";
        const orderAsc = order_dir === "asc";
        let query = supabase
          .from("contacts")
          .select("id, tenant_id, name, email, phone, cpf_cnpj, address, city, state, zip_code, notes, metadata, avatar_url, contact_type, created_at, updated_at, tenants(name)", { count: "exact" })
          .order(orderCol, { ascending: orderAsc });

        if (tenant_id) query = query.eq("tenant_id", tenant_id);
        if (type === "lead" || type === "client") query = query.eq("contact_type", type);
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
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const body = req.body as Record<string, unknown>;
        const contactType = (body.contact_type === "client" ? "client" : "lead") as ContactType;
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
          contact_type: contactType,
        };

        if (!record.tenant_id || !record.name) {
          return reply.status(400).send({ error: "tenant_id e name são obrigatórios" });
        }
        if (!canManageTenant(auth, String(record.tenant_id))) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
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

  fastify.post(
    "/crm-contacts/import",
    async (
      req: FastifyRequest<{
        Body: {
          tenant_id: string;
          rows: Array<{
            name: string;
            email?: string | null;
            phone?: string | null;
            cpf_cnpj?: string | null;
            address?: string | null;
            city?: string | null;
            state?: string | null;
            zip_code?: string | null;
            notes?: string | null;
          }>;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { tenant_id, rows } = req.body as { tenant_id: string; rows: unknown[] };
        if (!tenant_id || !Array.isArray(rows) || rows.length === 0) {
          return reply.status(400).send({ error: "tenant_id e rows (array) são obrigatórios" });
        }
        if (!canManageTenant(auth, tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }

        const toInsert = rows
          .map((r) => {
            const name = (r as Record<string, unknown>).name;
            if (!name || typeof name !== "string" || !name.trim()) return null;
            return {
              tenant_id,
              name: String(name).trim(),
              email: (r as Record<string, unknown>).email ? String((r as Record<string, unknown>).email) : null,
              phone: (r as Record<string, unknown>).phone ? String((r as Record<string, unknown>).phone) : null,
              cpf_cnpj: (r as Record<string, unknown>).cpf_cnpj ? String((r as Record<string, unknown>).cpf_cnpj) : null,
              address: (r as Record<string, unknown>).address ? String((r as Record<string, unknown>).address) : null,
              city: (r as Record<string, unknown>).city ? String((r as Record<string, unknown>).city) : null,
              state: (r as Record<string, unknown>).state ? String((r as Record<string, unknown>).state) : null,
              zip_code: (r as Record<string, unknown>).zip_code ? String((r as Record<string, unknown>).zip_code) : null,
              notes: (r as Record<string, unknown>).notes ? String((r as Record<string, unknown>).notes) : null,
              contact_type: "client" as const,
            };
          })
          .filter(Boolean) as Array<Record<string, unknown>>;

        if (toInsert.length === 0) {
          return reply.status(400).send({ error: "Nenhuma linha válida (nome obrigatório)" });
        }

        const { data: inserted, error } = await supabase.from("contacts").insert(toInsert).select("id");
        if (error) throw error;
        return reply.send({
          success: true,
          imported: inserted?.length ?? 0,
          total_rows: rows.length,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts import error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.get(
    "/crm-contacts/:id",
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;
        const { data, error } = await supabase
          .from("contacts")
          .select("id, tenant_id, name, email, phone, cpf_cnpj, address, city, state, zip_code, notes, metadata, avatar_url, contact_type, created_at, updated_at, tenants(name)")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canAccessTenant(auth, data.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        return reply.send(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts get by id error:", msg);
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
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("tenant_id")
          .eq("id", id)
          .maybeSingle();
        if (!existingContact) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canManageTenant(auth, existingContact.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        const body = req.body as Record<string, unknown>;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const allowed = ["name", "email", "phone", "cpf_cnpj", "address", "city", "state", "zip_code", "notes", "metadata", "avatar_url", "contact_type"];
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
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;
        const { data: existingContact } = await supabase
          .from("contacts")
          .select("tenant_id")
          .eq("id", id)
          .maybeSingle();
        if (!existingContact) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canManageTenant(auth, existingContact.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
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

  // --- Faturas ---
  type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";
  interface InvoiceRecord {
    id?: string;
    contact_id: string;
    tenant_id: string;
    amount: number;
    due_date: string;
    paid_at?: string | null;
    status: InvoiceStatus;
    description?: string | null;
    metadata?: unknown;
  }

  fastify.get(
    "/crm-contacts/:id/invoices",
    async (
      req: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id: contactId } = req.params;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .select("id, tenant_id")
          .eq("id", contactId)
          .maybeSingle();
        if (contactErr || !contact) {
          return reply.status(404).send({ error: "Contato não encontrado" });
        }
        if (!canAccessTenant(auth, contact.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        const { data, error } = await supabase
          .from("contact_invoices")
          .select("*")
          .eq("contact_id", contactId)
          .order("due_date", { ascending: false });
        if (error) throw error;
        return reply.send({ data: data ?? [] });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts invoices list error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.post(
    "/crm-contacts/:id/invoices",
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id: contactId } = req.params;
        const body = req.body as Record<string, unknown>;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .select("id, tenant_id")
          .eq("id", contactId)
          .maybeSingle();
        if (contactErr || !contact) {
          return reply.status(404).send({ error: "Contato não encontrado" });
        }
        if (!canManageTenant(auth, contact.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        const amount = Number(body.amount);
        const dueDate = String(body.due_date || "").trim();
        if (!dueDate || isNaN(amount) || amount < 0) {
          return reply.status(400).send({ error: "amount e due_date são obrigatórios" });
        }
        let status: InvoiceStatus = "pending";
        if (["pending", "paid", "overdue", "cancelled"].includes(String(body.status || ""))) {
          status = body.status as InvoiceStatus;
        }
        const record: Record<string, unknown> = {
          contact_id: contactId,
          tenant_id: contact.tenant_id,
          amount,
          due_date: dueDate,
          status,
          description: body.description ?? null,
          metadata: typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata ?? {}),
        };
        if (status === "paid" && body.paid_at) {
          record.paid_at = body.paid_at;
        }
        const { data, error } = await supabase.from("contact_invoices").insert(record).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts invoice create error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.patch(
    "/crm-contacts/:contactId/invoices/:invoiceId",
    async (
      req: FastifyRequest<{ Params: { contactId: string; invoiceId: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { contactId, invoiceId } = req.params;
        const body = req.body as Record<string, unknown>;
        const { data: existing, error: fetchErr } = await supabase
          .from("contact_invoices")
          .select("id")
          .eq("id", invoiceId)
          .eq("contact_id", contactId)
          .maybeSingle();
        if (fetchErr || !existing) {
          return reply.status(404).send({ error: "Fatura não encontrada" });
        }
        const { data: contact } = await supabase
          .from("contacts")
          .select("tenant_id")
          .eq("id", contactId)
          .maybeSingle();
        if (!contact || !canManageTenant(auth, contact.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        const allowed = ["amount", "due_date", "paid_at", "status", "description", "metadata"];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
          if (body[key] !== undefined) {
            updates[key] = key === "metadata" && typeof body[key] !== "string"
              ? JSON.stringify(body[key] ?? {})
              : body[key];
          }
        }
        const { data, error } = await supabase
          .from("contact_invoices")
          .update(updates)
          .eq("id", invoiceId)
          .select()
          .single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts invoice update error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  fastify.delete(
    "/crm-contacts/:contactId/invoices/:invoiceId",
    async (
      req: FastifyRequest<{ Params: { contactId: string; invoiceId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { contactId, invoiceId } = req.params;
        const { data: contact } = await supabase
          .from("contacts")
          .select("tenant_id")
          .eq("id", contactId)
          .maybeSingle();
        if (!contact || !canManageTenant(auth, contact.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        const { error } = await supabase
          .from("contact_invoices")
          .delete()
          .eq("id", invoiceId)
          .eq("contact_id", contactId);
        if (error) throw error;
        return reply.send({ success: true });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts invoice delete error:", msg);
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
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .select("id, tenant_id, name, phone")
          .eq("id", id)
          .maybeSingle();

        if (contactErr || !contact) {
          return reply.status(404).send({ error: "Contato não encontrado" });
        }
        if (!canAccessTenant(auth, contact.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
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
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const tenantIdFilter = (req.body as { tenant_id?: string })?.tenant_id;
        if (tenantIdFilter && !canManageTenant(auth, tenantIdFilter)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        const { data: agents } = await supabase
          .from("agents")
          .select("id, tenant_id")
          .order("tenant_id");
        const agentsList = (agents ?? []).filter(
          (a: { tenant_id: string }) => !tenantIdFilter || a.tenant_id === tenantIdFilter
        );

        const seen = new Map<string, { ext: string; name: string | null; avatar_url: string | null }>();
        const digitsOnly = (s: string) => (s || "").replace(/\D/g, "");
        const isPhoneLike = (s: string) => {
          const d = digitsOnly(s);
          return d.length >= 10 && d.length <= 15;
        };

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
            const contactName = (c.contact_name || "").trim() || null;
            const avatarUrl = (c.contact_avatar_url || "").trim() || null;
            // Contato de grupo: ext é ID longo — deduplica por (tenant, nome)
            const key = isPhoneLike(ext)
              ? `${agent.tenant_id}::${ext}`
              : `${agent.tenant_id}::group::${(contactName || "unknown").toLowerCase()}`;
            const prev = seen.get(key);
            if (!prev) {
              seen.set(key, { ext, name: contactName, avatar_url: avatarUrl });
            } else {
              if (contactName && !prev.name) prev.name = contactName;
              if (avatarUrl && !prev.avatar_url) prev.avatar_url = avatarUrl;
            }
          }
        }

        let synced = 0;
        for (const [key, info] of seen) {
          const parts = key.split("::");
          const tenantId = parts[0];
          const isGroup = parts[1] === "group";
          const ext = isGroup ? "group-placeholder" : parts.slice(1).join("::");
          if (tenantId && (ext || info.name)) {
            if (isGroup && !info.name) continue; // Contato de grupo sem nome — não criar "unknown"
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

  // --- Resumo do contato ---
  fastify.get(
    "/crm-contacts/:id/summary",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id: contactId } = req.params;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts")
          .select("id, tenant_id")
          .eq("id", contactId)
          .maybeSingle();
        if (contactErr || !contact) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canAccessTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });

        const now = new Date().toISOString();
        const [invoicesRes, packagesRes, appointmentsRes] = await Promise.all([
          supabase.from("contact_invoices").select("amount, status").eq("contact_id", contactId),
          supabase.from("contact_packages").select("id").eq("contact_id", contactId).eq("status", "active"),
          supabase.from("calendar_events").select("id").eq("contact_id", contactId).gte("start_at", now),
        ]);

        const invoices = (invoicesRes.data ?? []) as Array<{ amount: number; status: string }>;
        const total_invoiced = invoices.reduce((s, i) => s + Number(i.amount), 0);
        const total_paid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
        const total_overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + Number(i.amount), 0);

        return reply.send({
          total_invoiced,
          total_paid,
          total_overdue,
          invoice_count: invoices.length,
          active_packages: (packagesRes.data ?? []).length,
          upcoming_appointments: (appointmentsRes.data ?? []).length,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return reply.status(500).send({ error: msg });
      }
    }
  );

  // --- Pacotes / Serviços Contratados ---
  fastify.get(
    "/crm-contacts/:id/packages",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id: contactId } = req.params;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts").select("id, tenant_id").eq("id", contactId).maybeSingle();
        if (contactErr || !contact) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canAccessTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
        const { data, error } = await supabase
          .from("contact_packages").select("*").eq("contact_id", contactId).order("created_at", { ascending: false });
        if (error) throw error;
        return reply.send({ data: data ?? [] });
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  fastify.post(
    "/crm-contacts/:id/packages",
    async (req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id: contactId } = req.params;
        const body = req.body as Record<string, unknown>;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts").select("id, tenant_id").eq("id", contactId).maybeSingle();
        if (contactErr || !contact) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canManageTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
        if (!body.name || typeof body.name !== "string") return reply.status(400).send({ error: "name é obrigatório" });
        const validStatuses = ["active", "paused", "completed", "cancelled"];
        const status = validStatuses.includes(String(body.status || "")) ? String(body.status) : "active";
        const record: Record<string, unknown> = {
          contact_id: contactId,
          tenant_id: contact.tenant_id,
          name: String(body.name).trim(),
          description: body.description ?? null,
          status,
          price: body.price != null ? Number(body.price) : null,
          start_date: body.start_date ?? null,
          end_date: body.end_date ?? null,
          sessions_total: body.sessions_total != null ? Number(body.sessions_total) : null,
          sessions_used: 0,
          metadata: typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata ?? {}),
        };
        const { data, error } = await supabase.from("contact_packages").insert(record).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  fastify.patch(
    "/crm-contacts/:contactId/packages/:packageId",
    async (req: FastifyRequest<{ Params: { contactId: string; packageId: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { contactId, packageId } = req.params;
        const body = req.body as Record<string, unknown>;
        const { data: contact } = await supabase.from("contacts").select("tenant_id").eq("id", contactId).maybeSingle();
        if (!contact || !canManageTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
        const allowed = ["name", "description", "status", "price", "start_date", "end_date", "sessions_total", "sessions_used", "metadata"];
        const updates: Record<string, unknown> = {};
        for (const key of allowed) {
          if (body[key] !== undefined) {
            updates[key] = key === "metadata" && typeof body[key] !== "string" ? JSON.stringify(body[key] ?? {}) : body[key];
          }
        }
        const { data, error } = await supabase
          .from("contact_packages").update(updates).eq("id", packageId).eq("contact_id", contactId).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  fastify.delete(
    "/crm-contacts/:contactId/packages/:packageId",
    async (req: FastifyRequest<{ Params: { contactId: string; packageId: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { contactId, packageId } = req.params;
        const { data: contact } = await supabase.from("contacts").select("tenant_id").eq("id", contactId).maybeSingle();
        if (!contact || !canManageTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
        const { error } = await supabase.from("contact_packages").delete().eq("id", packageId).eq("contact_id", contactId);
        if (error) throw error;
        return reply.send({ success: true });
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // --- Agendamentos (vínculo com calendar_events) ---
  fastify.get(
    "/crm-contacts/:id/appointments",
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: { upcoming?: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id: contactId } = req.params;
        const { upcoming } = req.query;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts").select("id, tenant_id").eq("id", contactId).maybeSingle();
        if (contactErr || !contact) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canAccessTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
        let query = supabase
          .from("calendar_events").select("*").eq("contact_id", contactId).order("start_at", { ascending: true });
        if (upcoming === "true") query = query.gte("start_at", new Date().toISOString());
        const { data, error } = await query;
        if (error) throw error;
        return reply.send({ data: data ?? [] });
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  fastify.post(
    "/crm-contacts/:id/appointments",
    async (req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id: contactId } = req.params;
        const body = req.body as Record<string, unknown>;
        const { data: contact, error: contactErr } = await supabase
          .from("contacts").select("id, tenant_id").eq("id", contactId).maybeSingle();
        if (contactErr || !contact) return reply.status(404).send({ error: "Contato não encontrado" });
        if (!canManageTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
        if (!body.title || !body.start_at || !body.calendar_id) {
          return reply.status(400).send({ error: "title, start_at e calendar_id são obrigatórios" });
        }
        const record: Record<string, unknown> = {
          calendar_id: String(body.calendar_id),
          tenant_id: contact.tenant_id,
          contact_id: contactId,
          title: String(body.title).trim(),
          description: body.description ?? null,
          start_at: String(body.start_at),
          end_at: body.end_at ?? null,
          all_day: body.all_day ?? false,
          color: body.color ?? "#3B82F6",
          metadata: typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata ?? {}),
        };
        const { data, error } = await supabase.from("calendar_events").insert(record).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  fastify.delete(
    "/crm-contacts/:contactId/appointments/:eventId",
    async (req: FastifyRequest<{ Params: { contactId: string; eventId: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { contactId, eventId } = req.params;
        const { data: contact } = await supabase.from("contacts").select("tenant_id").eq("id", contactId).maybeSingle();
        if (!contact || !canManageTenant(auth, contact.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });
        // Apenas desvincula — não deleta o evento do calendário
        const { error } = await supabase.from("calendar_events").update({ contact_id: null }).eq("id", eventId);
        if (error) throw error;
        return reply.send({ success: true });
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  fastify.post(
    "/crm-contacts/merge-duplicates",
    async (
      req: FastifyRequest<{ Body: { tenant_id?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const tenantIdFilter = (req.body as { tenant_id?: string })?.tenant_id;
        if (tenantIdFilter && !canManageTenant(auth, tenantIdFilter)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        let query = supabase
          .from("contacts")
          .select("id, tenant_id, name, phone, updated_at");
        if (tenantIdFilter) query = query.eq("tenant_id", tenantIdFilter);
        const { data: contacts, error } = await query;
        if (error) throw error;
        const list = (contacts ?? []) as Array<{ id: string; tenant_id: string; name: string; phone: string | null; updated_at: string }>;

        const digitsOnly = (s: string) => (s || "").replace(/\D/g, "");
        const isPhoneLike = (p: string | null) => {
          if (!p) return false;
          const d = digitsOnly(p);
          return d.length >= 10 && d.length <= 15;
        };

        const groups = new Map<string, typeof list>();
        for (const c of list) {
          const key = `${c.tenant_id}::${(c.name || "").trim().toLowerCase()}`;
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(c);
        }

        const toDelete: string[] = [];
        let mergedGroups = 0;
        for (const [, group] of groups) {
          if (group.length <= 1) continue;
          mergedGroups++;
          const withPhone = group.filter((c) => isPhoneLike(c.phone));
          const toKeep = withPhone.length > 0
            ? withPhone.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0]
            : group.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
          for (const c of group) {
            if (c.id !== toKeep.id) toDelete.push(c.id);
          }
        }

        let deleted = 0;
        for (const id of toDelete) {
          const { error: delErr } = await supabase.from("contacts").delete().eq("id", id);
          if (!delErr) deleted++;
        }

        return reply.send({
          success: true,
          deleted,
          merged_groups: mergedGroups,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("crm-contacts merge-duplicates error:", msg);
        return reply.status(500).send({ error: msg });
      }
    }
  );
}
