import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { canAccessTenant, canManageTenant, requireAuthenticated } from "../services/authorization.js";

export async function calendarServicesRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  // GET /calendar-services?tenant_id=xxx — listar serviços do tenant
  fastify.get(
    "/calendar-services",
    async (req: FastifyRequest<{ Querystring: { tenant_id?: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;

        const { tenant_id } = req.query;
        if (!tenant_id) return reply.status(400).send({ error: "tenant_id é obrigatório" });
        if (!canAccessTenant(auth, tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });

        const { data, error } = await supabase
          .from("calendar_service_types")
          .select("id, name, duration_minutes, description, active, created_at, updated_at")
          .eq("tenant_id", tenant_id)
          .order("name");

        if (error) throw error;
        return reply.send({ data: data ?? [] });
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // POST /calendar-services — criar serviço
  fastify.post(
    "/calendar-services",
    async (req: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;

        const body = req.body as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
        if (!tenantId) return reply.status(400).send({ error: "tenant_id é obrigatório" });
        if (!canManageTenant(auth, tenantId)) return reply.status(403).send({ error: "forbidden_tenant_access" });

        if (!body.name || !String(body.name).trim()) {
          return reply.status(400).send({ error: "name é obrigatório" });
        }
        const durationMinutes = Number(body.duration_minutes);
        if (!durationMinutes || durationMinutes <= 0) {
          return reply.status(400).send({ error: "duration_minutes deve ser um número positivo" });
        }

        const { data, error } = await supabase
          .from("calendar_service_types")
          .insert({
            tenant_id: tenantId,
            name: String(body.name).trim(),
            duration_minutes: durationMinutes,
            description: body.description ? String(body.description).trim() : null,
            active: true,
          })
          .select()
          .single();

        if (error) throw error;
        return reply.status(201).send(data);
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // PUT /calendar-services/:id — editar serviço
  fastify.put(
    "/calendar-services/:id",
    async (req: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;

        const { id } = req.params;
        const body = req.body as Record<string, unknown>;

        const { data: existing } = await supabase
          .from("calendar_service_types")
          .select("tenant_id")
          .eq("id", id)
          .maybeSingle();

        if (!existing) return reply.status(404).send({ error: "Serviço não encontrado" });
        if (!canManageTenant(auth, existing.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) updates.name = String(body.name).trim();
        if (body.duration_minutes !== undefined) {
          const dur = Number(body.duration_minutes);
          if (dur <= 0) return reply.status(400).send({ error: "duration_minutes deve ser positivo" });
          updates.duration_minutes = dur;
        }
        if (body.description !== undefined) updates.description = body.description ? String(body.description).trim() : null;
        if (body.active !== undefined) updates.active = Boolean(body.active);

        const { data, error } = await supabase
          .from("calendar_service_types")
          .update(updates)
          .eq("id", id)
          .select()
          .single();

        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // DELETE /calendar-services/:id — desativar serviço (soft delete)
  fastify.delete(
    "/calendar-services/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;

        const { id } = req.params;

        const { data: existing } = await supabase
          .from("calendar_service_types")
          .select("tenant_id")
          .eq("id", id)
          .maybeSingle();

        if (!existing) return reply.status(404).send({ error: "Serviço não encontrado" });
        if (!canManageTenant(auth, existing.tenant_id)) return reply.status(403).send({ error: "forbidden_tenant_access" });

        const { error } = await supabase
          .from("calendar_service_types")
          .update({ active: false, updated_at: new Date().toISOString() })
          .eq("id", id);

        if (error) throw error;
        return reply.send({ success: true });
      } catch (err: unknown) {
        return reply.status(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );
}
