import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  assertContactBelongsToTenant,
  getContactSummary,
  resolveTenantFromChatwootAccount,
} from "../services/chatwoot-crm-embed.js";
import { applyEmbedHeaders, assertEmbedKey } from "./embed-auth.js";
import { buildContactConversationPreview } from "../services/contact-conversation-resolve.js";

type InvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";

async function embedContactContext(
  accountId: string,
  contactId: string,
): Promise<{ tenantId: string }> {
  const supabase = createNexusClient();
  const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
  if (!resolved) throw Object.assign(new Error("Conta Chatwoot não vinculada"), { status: 404 });
  await assertContactBelongsToTenant(supabase, contactId, resolved.tenantId);
  return { tenantId: resolved.tenantId };
}

function parseSubPath(wildcard: string | undefined): { resource: string; resourceId?: string } {
  const parts = (wildcard ?? "").split("/").filter(Boolean);
  return { resource: parts[0] ?? "", resourceId: parts[1] };
}

function sendErr(reply: FastifyReply, e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  const status = (e as { status?: number }).status ?? (msg.includes("não encontrado") ? 404 : 500);
  return reply.status(status).send({ error: msg });
}

function contactFilesPublicUrl(storagePath: string): string {
  const base = (process.env.NEXUS_DB_URL || "").replace(/\/+$/, "");
  return `${base}/storage/v1/object/public/contact-files/${storagePath}`;
}

export async function embedChatwootCrmResourceRoutes(fastify: FastifyInstance) {
  fastify.route({
    method: ["GET", "POST", "PATCH", "DELETE"],
    url: "/embed/chatwoot/crm/contacts/:contactId/*",
    handler: async (
      req: FastifyRequest<{
        Params: { contactId: string; "*"?: string };
        Querystring: { account_id?: string; key?: string; upcoming?: string };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

      const contactId = req.params.contactId;
      const { resource, resourceId } = parseSubPath(req.params["*"]);
      const method = req.method;
      const supabase = createNexusClient();

      try {
        const { tenantId } = await embedContactContext(accountId, contactId);

        if (resource === "summary" && method === "GET") {
          const summary = await getContactSummary(supabase, contactId);
          return reply.send(summary);
        }

        if (resource === "invoices") {
          if (method === "GET" && !resourceId) {
            const { data, error } = await supabase
              .from("contact_invoices")
              .select("*")
              .eq("contact_id", contactId)
              .order("due_date", { ascending: false });
            if (error) throw error;
            return reply.send({ data: data ?? [] });
          }
          if (method === "POST" && !resourceId) {
            const body = req.body ?? {};
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
              tenant_id: tenantId,
              amount,
              due_date: dueDate,
              status,
              description: body.description ?? null,
              metadata: typeof body.metadata === "string" ? body.metadata : JSON.stringify(body.metadata ?? {}),
            };
            if (status === "paid" && body.paid_at) record.paid_at = body.paid_at;
            const { data, error } = await supabase.from("contact_invoices").insert(record).select().single();
            if (error) throw error;
            return reply.send(data);
          }
          if (method === "PATCH" && resourceId) {
            const body = req.body ?? {};
            const allowed = ["amount", "due_date", "paid_at", "status", "description", "metadata"];
            const updates: Record<string, unknown> = {};
            for (const key of allowed) {
              if (body[key] !== undefined) {
                updates[key] =
                  key === "metadata" && typeof body[key] !== "string"
                    ? JSON.stringify(body[key] ?? {})
                    : body[key];
              }
            }
            const { data, error } = await supabase
              .from("contact_invoices")
              .update(updates)
              .eq("id", resourceId)
              .eq("contact_id", contactId)
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (method === "DELETE" && resourceId) {
            const { error } = await supabase
              .from("contact_invoices")
              .delete()
              .eq("id", resourceId)
              .eq("contact_id", contactId);
            if (error) throw error;
            return reply.send({ success: true });
          }
        }

        if (resource === "packages" && method === "GET" && !resourceId) {
          const { data, error } = await supabase
            .from("contact_packages")
            .select("*")
            .eq("contact_id", contactId)
            .order("created_at", { ascending: false });
          if (error) throw error;
          return reply.send({ data: data ?? [] });
        }

        if (resource === "packages" && method === "POST" && !resourceId) {
          const body = req.body ?? {};
          const { data, error } = await supabase
            .from("contact_packages")
            .insert({ ...body, contact_id: contactId, tenant_id: tenantId })
            .select()
            .single();
          if (error) throw error;
          return reply.send(data);
        }

        if (resource === "packages" && resourceId) {
          if (method === "PATCH") {
            const { data, error } = await supabase
              .from("contact_packages")
              .update(req.body ?? {})
              .eq("id", resourceId)
              .eq("contact_id", contactId)
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (method === "DELETE") {
            const { error } = await supabase
              .from("contact_packages")
              .delete()
              .eq("id", resourceId)
              .eq("contact_id", contactId);
            if (error) throw error;
            return reply.send({ success: true });
          }
        }

        if (resource === "appointments") {
          if (method === "GET" && !resourceId) {
            const upcoming = req.query.upcoming === "true";
            let q = supabase.from("calendar_events").select("*").eq("contact_id", contactId);
            if (upcoming) q = q.gte("start_at", new Date().toISOString());
            const { data, error } = await q.order("start_at", { ascending: true });
            if (error) throw error;
            return reply.send({ data: data ?? [] });
          }
          if (method === "POST" && !resourceId) {
            const body = req.body ?? {};
            const { data, error } = await supabase
              .from("calendar_events")
              .insert({ ...body, contact_id: contactId, tenant_id: tenantId })
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (method === "PATCH" && resourceId) {
            const body = req.body ?? {};
            const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
            for (const key of [
              "title",
              "description",
              "start_at",
              "end_at",
              "all_day",
              "color",
              "calendar_id",
              "metadata",
            ]) {
              if (body[key] !== undefined) {
                updates[key] =
                  key === "metadata" && typeof body[key] !== "string"
                    ? JSON.stringify(body[key] ?? {})
                    : body[key];
              }
            }
            const { data, error } = await supabase
              .from("calendar_events")
              .update(updates)
              .eq("id", resourceId)
              .eq("contact_id", contactId)
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (method === "DELETE" && resourceId) {
            const { error } = await supabase
              .from("calendar_events")
              .update({ contact_id: null })
              .eq("id", resourceId)
              .eq("contact_id", contactId);
            if (error) throw error;
            return reply.send({ success: true });
          }
        }

        if (resource === "calendars" && method === "GET" && !resourceId) {
          const { data, error } = await supabase
            .from("calendars")
            .select("id, name, color")
            .eq("tenant_id", tenantId)
            .order("name");
          if (error) throw error;
          return reply.send({ data: data ?? [] });
        }

        if (resource === "documents" && resourceId === "upload" && method === "POST") {
          const body = req.body ?? {};
          const rawB64 = String(body.file_base64 || "").replace(/^data:[^;]+;base64,/, "");
          if (!rawB64) return reply.status(400).send({ error: "file_base64 é obrigatório" });
          const buf = Buffer.from(rawB64, "base64");
          if (buf.length > 50 * 1024 * 1024) {
            return reply.status(400).send({ error: "Arquivo deve ter no máximo 50 MB" });
          }
          const fileName = String(body.file_name || "arquivo").trim() || "arquivo";
          const ext = fileName.includes(".") ? (fileName.split(".").pop() || "bin") : "bin";
          const storagePath = `${tenantId}/${contactId}/${randomUUID()}.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from("contact-files")
            .upload(storagePath, buf, {
              contentType: String(body.file_type || "application/octet-stream"),
              upsert: false,
            });
          if (uploadError) throw uploadError;
          const record = {
            contact_id: contactId,
            tenant_id: tenantId,
            name: String(body.name || fileName).trim() || fileName,
            category: String(body.category || "geral"),
            file_url: contactFilesPublicUrl(storagePath),
            file_type: (body.file_type as string) || null,
            file_size: buf.length,
            notes: (body.notes as string) || null,
          };
          const { data, error } = await supabase.from("contact_documents").insert(record).select().single();
          if (error) throw error;
          return reply.send(data);
        }

        if (resource === "documents") {
          if (method === "GET" && !resourceId) {
            const { data, error } = await supabase
              .from("contact_documents")
              .select("*")
              .eq("contact_id", contactId)
              .order("created_at", { ascending: false });
            if (error) throw error;
            return reply.send({ data: data ?? [] });
          }
          if (method === "POST" && !resourceId) {
            const body = req.body ?? {};
            const { data, error } = await supabase
              .from("contact_documents")
              .insert({ ...body, contact_id: contactId, tenant_id: tenantId })
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (resourceId && method === "PATCH") {
            const { data, error } = await supabase
              .from("contact_documents")
              .update(req.body ?? {})
              .eq("id", resourceId)
              .eq("contact_id", contactId)
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (resourceId && method === "DELETE") {
            const { error } = await supabase
              .from("contact_documents")
              .delete()
              .eq("id", resourceId)
              .eq("contact_id", contactId);
            if (error) throw error;
            return reply.send({ success: true });
          }
        }

        if (resource === "contracts") {
          if (method === "GET" && !resourceId) {
            const { data, error } = await supabase
              .from("contact_contracts")
              .select("*")
              .eq("contact_id", contactId)
              .order("created_at", { ascending: false });
            if (error) throw error;
            return reply.send({ data: data ?? [] });
          }
          if (method === "POST" && !resourceId) {
            const body = req.body ?? {};
            const { data, error } = await supabase
              .from("contact_contracts")
              .insert({ ...body, contact_id: contactId, tenant_id: tenantId })
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (resourceId && method === "PATCH") {
            const { data, error } = await supabase
              .from("contact_contracts")
              .update(req.body ?? {})
              .eq("id", resourceId)
              .eq("contact_id", contactId)
              .select()
              .single();
            if (error) throw error;
            return reply.send(data);
          }
          if (resourceId && method === "DELETE") {
            const { error } = await supabase
              .from("contact_contracts")
              .delete()
              .eq("id", resourceId)
              .eq("contact_id", contactId);
            if (error) throw error;
            return reply.send({ success: true });
          }
        }

        if (resource === "conversation-preview" && method === "GET") {
          const { data: contact } = await supabase
            .from("contacts")
            .select("id, tenant_id, name, phone")
            .eq("id", contactId)
            .single();

          if (!contact) {
            return reply.send({
              messages: [],
              chatwoot_url: null,
              chatwoot_conversation_id: null,
              chatwoot_account_id: accountId,
              agent_name: null,
              agent_avatar_url: null,
            });
          }

          const preview = await buildContactConversationPreview(supabase, contact, {
            preferredAccountId: accountId,
            relativeChatwootUrl: true,
          });
          return reply.send(preview);
        }

        return reply.status(404).send({ error: `Recurso embed não suportado: ${resource}` });
      } catch (e) {
        fastify.log.error({ err: e }, "[embed-crm] resource error");
        return sendErr(reply, e);
      }
    },
  });
}
