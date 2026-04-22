import type { FastifyInstance } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  canAccessTenant,
  canManageTenant,
  requireAuthenticated,
} from "../services/authorization.js";

interface SuiteGalleryBody {
  tenant_id?: string;
  name?: string;
  description?: string | null;
  llm_media_guidance?: string | null;
  cover_image_url?: string | null;
  media_urls?: unknown;
  display_order?: number;
}

function parseMediaUrls(raw: unknown): object[] {
  if (Array.isArray(raw)) return raw as object[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as object[]; } catch { return []; }
  }
  return [];
}

function firstPhotoUrlFromMedia(parsed: object[]): string | null {
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (r.type === "photo" && typeof r.url === "string" && r.url.trim()) return r.url.trim();
  }
  for (const row of parsed) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.url === "string" && r.url.trim() && r.type !== "video") return r.url.trim();
  }
  return null;
}

export async function suiteGalleriesRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  // GET /api/suite-galleries?tenant_id=X
  fastify.get("/suite-galleries", async (req, reply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const { tenant_id } = req.query as { tenant_id?: string };

    if (tenant_id && !canAccessTenant(auth, tenant_id)) {
      return reply.status(403).send({ error: "forbidden_tenant_access" });
    }

    let query = supabase
      .from("suite_galleries")
      .select("*, tenants(name)", { count: "exact" })
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (tenant_id) query = query.eq("tenant_id", tenant_id);

    const { data, error, count } = await query;
    if (error) throw error;

    return reply.send({ data: data ?? [], total: count ?? 0 });
  });

  // GET /api/suite-galleries/:id
  fastify.get("/suite-galleries/:id", async (req, reply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const { id } = req.params as { id: string };

    const { data, error } = await supabase
      .from("suite_galleries")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return reply.status(404).send({ error: "Not found" });

    if (!canAccessTenant(auth, (data as { tenant_id: string }).tenant_id)) {
      return reply.status(403).send({ error: "forbidden_tenant_access" });
    }

    return reply.send(data);
  });

  // POST /api/suite-galleries
  fastify.post("/suite-galleries", async (req, reply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const body = req.body as SuiteGalleryBody;
    const tenantId = body.tenant_id ?? "";

    if (!tenantId) return reply.status(400).send({ error: "tenant_id is required" });
    if (!body.name?.trim()) return reply.status(400).send({ error: "name is required" });

    if (!canManageTenant(auth, tenantId)) {
      return reply.status(403).send({ error: "forbidden_tenant_access" });
    }

    const parsedMedia = parseMediaUrls(body.media_urls);

    const record = {
      tenant_id: tenantId,
      name: body.name.trim(),
      description: body.description ?? null,
      llm_media_guidance: body.llm_media_guidance !== undefined ? body.llm_media_guidance : null,
      cover_image_url:
        body.cover_image_url !== undefined ? body.cover_image_url : firstPhotoUrlFromMedia(parsedMedia) ?? null,
      media_urls: parsedMedia,
      display_order: body.display_order ?? 0,
    };

    const { data, error } = await supabase
      .from("suite_galleries")
      .insert(record)
      .select()
      .single();

    if (error) throw error;
    return reply.send(data);
  });

  // PATCH /api/suite-galleries/:id
  fastify.patch("/suite-galleries/:id", async (req, reply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const { id } = req.params as { id: string };
    const body = req.body as SuiteGalleryBody;

    const { data: existing, error: existErr } = await supabase
      .from("suite_galleries")
      .select("tenant_id")
      .eq("id", id)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) return reply.status(404).send({ error: "Not found" });

    if (!canManageTenant(auth, (existing as { tenant_id: string }).tenant_id)) {
      return reply.status(403).send({ error: "forbidden_tenant_access" });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.llm_media_guidance !== undefined) updates.llm_media_guidance = body.llm_media_guidance;
    if (body.media_urls !== undefined) {
      const parsed = parseMediaUrls(body.media_urls);
      updates.media_urls = parsed;
      if (body.cover_image_url !== undefined) {
        updates.cover_image_url = body.cover_image_url;
      } else {
        updates.cover_image_url = firstPhotoUrlFromMedia(parsed);
      }
    } else if (body.cover_image_url !== undefined) {
      updates.cover_image_url = body.cover_image_url;
    }
    if (body.display_order !== undefined) updates.display_order = body.display_order;

    const { data, error } = await supabase
      .from("suite_galleries")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return reply.send(data);
  });

  // DELETE /api/suite-galleries/:id
  fastify.delete("/suite-galleries/:id", async (req, reply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const { id } = req.params as { id: string };

    const { data: existing, error: existErr } = await supabase
      .from("suite_galleries")
      .select("tenant_id")
      .eq("id", id)
      .maybeSingle();

    if (existErr) throw existErr;
    if (!existing) return reply.status(404).send({ error: "Not found" });

    if (!canManageTenant(auth, (existing as { tenant_id: string }).tenant_id)) {
      return reply.status(403).send({ error: "forbidden_tenant_access" });
    }

    const { error } = await supabase.from("suite_galleries").delete().eq("id", id);
    if (error) throw error;

    return reply.send({ success: true });
  });
}
