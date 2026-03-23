import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { requireAuthenticated, type AccessContext } from "../services/authorization.js";
import {
  getAllPromptConfigs,
  getPromptConfig,
  buildSystemPrompt,
  getDispatcherPrompt,
  getFollowupPrompt,
} from "../services/prompts/registry.js";

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s-]/g, "");
}

/** Alinha com o filtro do PromptsPage (slug do registry vs slug do tenant no banco). */
function promptSlugAllowedForDbSlugs(promptSlug: string, dbSlugs: Set<string>): boolean {
  const promptLower = promptSlug.toLowerCase();
  const nPrompt = norm(promptSlug);
  for (const raw of dbSlugs) {
    const t = raw.toLowerCase();
    if (!t) continue;
    if (promptLower === t || promptLower.startsWith(t) || t.startsWith(promptLower)) return true;
    const nTenant = norm(raw);
    if (nPrompt === nTenant || nPrompt.includes(nTenant) || nTenant.includes(nPrompt)) return true;
  }
  return false;
}

async function loadDbSlugsForUser(ctx: AccessContext): Promise<Set<string>> {
  if (ctx.role === "superadmin") {
    return new Set(["*"]);
  }
  if (ctx.tenantIds.length === 0) {
    return new Set();
  }
  // Usa client server-side para resolver slug por tenant_id já autorizado.
  const supabase = createNexusClient();
  const { data, error } = await supabase.from("tenants").select("slug").in("id", ctx.tenantIds);
  if (error || !data?.length) {
    return new Set();
  }
  return new Set(
    (data as { slug?: string | null }[])
      .map((r) => String(r.slug ?? "").trim())
      .filter(Boolean)
  );
}

/**
 * GET /admin/prompts — leitura do registry em código.
 * Autenticado: superadmin vê tudo; tenant_user/admin vê só prompts cujo slug casa com o slug do tenant no banco.
 * (Fora do plugin admin para não exigir superadmin.)
 */
export async function promptReadRoutes(fastify: FastifyInstance) {
  fastify.get<{ Querystring: { slug?: string } }>(
    "/admin/prompts",
    async (req: FastifyRequest<{ Querystring: { slug?: string } }>, reply: FastifyReply) => {
      const ctx = await requireAuthenticated(req, reply);
      if (!ctx) return;

      const dbSlugs = await loadDbSlugsForUser(ctx);
      const allAllowed = dbSlugs.has("*");

      if (!allAllowed && dbSlugs.size === 0) {
        return reply.send({ tenants: [] as unknown[] });
      }

      const slug = req.query?.slug;

      if (slug) {
        const config = getPromptConfig(slug);
        if (!config) {
          return reply.status(404).send({ error: "Tenant not found in prompt registry" });
        }
        if (!allAllowed && !promptSlugAllowedForDbSlugs(config.slug, dbSlugs)) {
          return reply.status(403).send({ error: "forbidden" });
        }
        const fullSystemPrompt = buildSystemPrompt("", slug, true);
        const dispatcherPrompt = getDispatcherPrompt(slug);
        const followupPrompt = getFollowupPrompt(slug);

        return reply.send({
          slug: config.slug,
          version: config.version,
          description: config.description,
          systemPrompt: config.systemPrompt || "(uses agent's database prompt)",
          communicationRules: config.communicationRules || "(none)",
          dispatcherPrompt,
          followupPrompt: followupPrompt || "(usa prompt padrão do sistema)",
          fullComposedPrompt: fullSystemPrompt,
          fullPromptLength: fullSystemPrompt.length,
        });
      }

      const allConfigs = getAllPromptConfigs();
      const entries = Object.entries(allConfigs).filter(([, config]) =>
        allAllowed || promptSlugAllowedForDbSlugs(config.slug, dbSlugs)
      );
      const summary = entries.map(([, config]) => ({
        slug: config.slug,
        version: config.version,
        description: config.description,
        systemPromptLength: (config.systemPrompt || "").length,
        communicationRulesLength: (config.communicationRules || "").length,
        dispatcherPromptLength: config.dispatcherPrompt.length,
        followupPromptLength: (config.followupPrompt || "").length,
      }));

      return reply.send({ tenants: summary });
    }
  );
}
