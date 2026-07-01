import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { resolveTenantFromChatwootAccount } from "../services/chatwoot-crm-embed.js";
import { applyEmbedHeaders, assertEmbedKey, getEmbedKey } from "./embed-auth.js";

function publicFrontendBase(): string {
  return (
    process.env.PUBLIC_FRONTEND_URL?.trim() ||
    process.env.VITE_PUBLIC_URL?.trim() ||
    "https://ia.agboom.com.br"
  ).replace(/\/+$/, "");
}

function renderClientsEmbedViewHtml(
  frontendBase: string,
  embedKey: string,
  accountId: string,
  theme: "dark" | "light",
): string {
  const safeFrontend = JSON.stringify(frontendBase.replace(/\/+$/, ""));
  const safeKey = JSON.stringify(embedKey);
  const safeAccountId = JSON.stringify(accountId);
  const safeTheme = JSON.stringify(theme);

  return `<!DOCTYPE html>
<html lang="pt-BR" data-theme="${theme}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>Clientes</title>
  <style>
    html,body{height:100%;margin:0;background:#fff;color:#111827;font:14px/1.5 system-ui,sans-serif}
    [data-theme="dark"]{background:#0f1419;color:#f3f4f6}
    .loading{display:flex;height:100%;align-items:center;justify-content:center;gap:10px;color:#6b7280}
  </style>
</head>
<body data-theme="${theme}">
  <div class="loading" id="msg">Carregando clientes…</div>
  <script>
    (function(){
      var frontend=${safeFrontend};
      var hash=new URLSearchParams();
      hash.set("key",${safeKey});
      hash.set("account_id",${safeAccountId});
      hash.set("theme",${safeTheme});
      var target=frontend+"/embed/chatwoot/clients#"+hash.toString();
      try{location.replace(target);}catch(e){
        document.getElementById("msg").textContent="Abra: "+target;
      }
    })();
  </script>
</body>
</html>`;
}

export async function embedChatwootClientsRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/embed/chatwoot/clients/view",
    async (
      req: FastifyRequest<{ Querystring: { account_id?: string; key?: string; theme?: string } }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) {
        return reply.status(400).type("text/html").send(
          "<!DOCTYPE html><html><body><p>Parâmetro <code>account_id</code> ausente na URL.</p></body></html>",
        );
      }

      const rawTheme = req.query.theme?.trim().toLowerCase();
      const theme: "dark" | "light" = rawTheme === "dark" ? "dark" : "light";
      const key = getEmbedKey(req)!;
      return reply
        .type("text/html; charset=utf-8")
        .send(renderClientsEmbedViewHtml(publicFrontendBase(), key, accountId, theme));
    },
  );

  fastify.get(
    "/embed/chatwoot/clients/bootstrap",
    async (req: FastifyRequest<{ Querystring: { account_id?: string; key?: string } }>, reply: FastifyReply) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

      const supabase = createNexusClient();
      const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
      if (!resolved) {
        return reply.status(404).send({
          error: "Nenhum agente Boom IA vinculado a este chatwoot_account_id",
        });
      }

      const { data: tenant, error } = await supabase
        .from("tenants")
        .select("id, name, slug")
        .eq("id", resolved.tenantId)
        .maybeSingle();

      if (error) return reply.status(500).send({ error: error.message });
      if (!tenant) return reply.status(404).send({ error: "Tenant não encontrado" });

      return reply.send({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        tenant_slug: tenant.slug,
        account_id: accountId,
      });
    },
  );

  fastify.get(
    "/embed/chatwoot/clients",
    async (
      req: FastifyRequest<{
        Querystring: {
          account_id?: string;
          key?: string;
          limit?: string;
          offset?: string;
          search?: string;
          order_by?: string;
          order_dir?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      applyEmbedHeaders(reply);
      if (!assertEmbedKey(req, reply)) return;

      const accountId = req.query.account_id?.trim();
      if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

      const { limit = "100", offset = "0", search, order_by = "updated_at", order_dir = "desc" } = req.query;

      try {
        const supabase = createNexusClient();
        const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
        if (!resolved) {
          return reply.status(404).send({
            error: "Nenhum agente Boom IA vinculado a este chatwoot_account_id",
          });
        }

        const orderCol = order_by === "name" ? "name" : "updated_at";
        const orderAsc = order_dir === "asc";
        let query = supabase
          .from("contacts")
          .select(
            "id, tenant_id, name, email, phone, cpf_cnpj, address, city, state, zip_code, notes, metadata, avatar_url, contact_type, created_at, updated_at, tenants(name)",
            { count: "exact" },
          )
          .eq("tenant_id", resolved.tenantId)
          .eq("contact_type", "client")
          .order(orderCol, { ascending: orderAsc });

        if (search?.trim()) {
          const term = `%${search.trim()}%`;
          query = query.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term}`);
        }

        const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
        query = query.range(offsetNum, offsetNum + limitNum - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        return reply.send({ data: data ?? [], total: count ?? 0 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        fastify.log.error({ err: e }, "[embed-clients] list error");
        return reply.status(500).send({ error: msg });
      }
    },
  );
}
