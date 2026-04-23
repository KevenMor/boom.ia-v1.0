import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { requireSuperadmin } from "../services/authorization.js";

export async function auditRoutes(fastify: FastifyInstance) {
  // GET /api/audit?tenant_id=&resource=&action=&user_id=&from=&to=&limit=&offset=
  fastify.get(
    "/audit",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant_id?: string;
          resource?: string;
          action?: string;
          user_id?: string;
          from?: string;
          to?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const auth = await requireSuperadmin(req, reply);
      if (!auth) return;

      const supabase = createNexusClient();
      const { tenant_id, resource, action, user_id, from, to, limit = "50", offset = "0" } = req.query;

      const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
      const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

      let query = supabase
        .from("audit_logs")
        .select(
          `id, tenant_id, user_id, user_email, user_name, resource, resource_id, resource_label, action, metadata, created_at,
           tenants!audit_logs_tenant_id_fkey(name)`,
          { count: "exact" }
        )
        .order("created_at", { ascending: false })
        .range(offsetNum, offsetNum + limitNum - 1);

      if (tenant_id) query = query.eq("tenant_id", tenant_id);
      if (resource) query = query.eq("resource", resource);
      if (action) query = query.eq("action", action);
      if (user_id) query = query.eq("user_id", user_id);
      if (from) query = query.gte("created_at", from);
      if (to) query = query.lte("created_at", to);

      const { data, error, count } = await query;
      if (error) return reply.status(500).send({ error: error.message });

      return reply.send({ data: data ?? [], total: count ?? 0 });
    }
  );
}
