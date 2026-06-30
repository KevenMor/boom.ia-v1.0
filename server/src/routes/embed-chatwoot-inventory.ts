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

function renderInventoryEmbedViewHtml(
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
  <title>Inventário</title>
  <style>
    html,body{height:100%;margin:0;background:#fff;color:#111827;font:14px/1.5 system-ui,sans-serif}
    [data-theme="dark"]{background:#0f1419;color:#f3f4f6}
    .loading{display:flex;height:100%;align-items:center;justify-content:center;gap:10px;color:#6b7280}
  </style>
</head>
<body data-theme="${theme}">
  <div class="loading" id="msg">Carregando inventário…</div>
  <script>
    (function(){
      var frontend=${safeFrontend};
      var hash=new URLSearchParams();
      hash.set("key",${safeKey});
      hash.set("account_id",${safeAccountId});
      hash.set("theme",${safeTheme});
      var target=frontend+"/embed/chatwoot/inventory#"+hash.toString();
      try{location.replace(target);}catch(e){
        document.getElementById("msg").textContent="Abra: "+target;
      }
    })();
  </script>
</body>
</html>`;
}

export async function embedChatwootInventoryRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/embed/chatwoot/inventory/view",
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
        .send(renderInventoryEmbedViewHtml(publicFrontendBase(), key, accountId, theme));
    },
  );

  fastify.get(
    "/embed/chatwoot/inventory/bootstrap",
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

  fastify.route({
    method: ["GET", "POST", "PATCH", "DELETE"],
    url: "/embed/chatwoot/inventory",
    handler: proxyEmbedInventory(fastify, ""),
  });

  fastify.route({
    method: ["GET", "POST", "PATCH", "DELETE"],
    url: "/embed/chatwoot/inventory/*",
    handler: proxyEmbedInventory(fastify),
  });
}

function proxyEmbedInventory(fastify: FastifyInstance, fixedSubPath?: string) {
  return async (
    req: FastifyRequest<{
      Params: { "*"?: string };
      Querystring: Record<string, string | undefined>;
      Body: unknown;
    }>,
    reply: FastifyReply,
  ) => {
    applyEmbedHeaders(reply);
    if (!assertEmbedKey(req, reply)) return;

    const accountId = req.query.account_id?.trim();
    if (!accountId) return reply.status(400).send({ error: "account_id é obrigatório" });

    const subPath = (fixedSubPath ?? req.params["*"] ?? "").replace(/^\/+/, "");
    if (subPath === "bootstrap" || subPath === "view") {
      return reply.status(404).send({ error: "not_found" });
    }

    const supabase = createNexusClient();
    const resolved = await resolveTenantFromChatwootAccount(supabase, accountId);
    if (!resolved) {
      return reply.status(404).send({
        error: "Nenhum agente Boom IA vinculado a este chatwoot_account_id",
      });
    }

    const embedKey = getEmbedKey(req)!;
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (v == null || k === "key" || k === "account_id") continue;
      qs.set(k, v);
    }
    qs.set("tenant_id", resolved.tenantId);

    const inventoryPath = subPath ? `/api/inventory/${subPath}` : "/api/inventory";
    const targetUrl = `${inventoryPath}${qs.toString() ? `?${qs.toString()}` : ""}`;
    const headers: Record<string, string> = {
      "x-nexus-embed-inventory": embedKey,
      "x-embed-tenant-id": resolved.tenantId,
    };

    let payload: string | undefined;
    if (req.method !== "GET" && req.method !== "DELETE" && req.body !== undefined) {
      headers["content-type"] = "application/json";
      const body =
        typeof req.body === "object" && req.body !== null
          ? { ...(req.body as Record<string, unknown>), tenant_id: resolved.tenantId }
          : req.body;
      payload = typeof body === "string" ? body : JSON.stringify(body);
    }

    const injectRes = (await fastify.inject({
      method: req.method as "GET" | "POST" | "PATCH" | "DELETE",
      url: targetUrl,
      headers,
      payload,
    })) as { statusCode: number; headers: Record<string, string | string[] | undefined>; payload: string };

    const contentTypeRaw = injectRes.headers["content-type"];
    const contentType = Array.isArray(contentTypeRaw) ? contentTypeRaw[0] : contentTypeRaw;
    if (contentType) reply.header("content-type", contentType);
    reply.status(injectRes.statusCode);

    if (injectRes.statusCode === 204) return reply.send();

    if (contentType?.includes("application/json")) {
      try {
        return reply.send(JSON.parse(injectRes.payload));
      } catch {
        return reply.send(injectRes.payload);
      }
    }
    return reply.send(injectRes.payload);
  };
}
