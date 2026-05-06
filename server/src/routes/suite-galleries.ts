import type { FastifyInstance } from "fastify";
import { fixSuiteGalleryStorageUrls } from "../lib/supabase-storage-public-url.js";
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

const SUITE_GALLERY_MAX_MEDIA = 30;

/** Compara URLs de mídia ignorando query string (ex.: ?t=timestamp). */
function canonicalMediaUrlKey(url: string): string {
  try {
    const u = new URL(url.trim());
    u.search = "";
    u.hash = "";
    return u.pathname.toLowerCase();
  } catch {
    return url.split("?")[0]?.trim().toLowerCase() ?? "";
  }
}

function findMediaIndexByUrl(parsed: object[], mediaUrl: string): number {
  const key = canonicalMediaUrlKey(mediaUrl);
  return parsed.findIndex((row) => {
    if (!row || typeof row !== "object") return false;
    const u = (row as Record<string, unknown>).url;
    return typeof u === "string" && canonicalMediaUrlKey(u) === key;
  });
}

function isSuiteGalleryMediaRow(row: unknown): row is Record<string, unknown> {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return typeof r.url === "string" && (r.type === "photo" || r.type === "video");
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

    const rows = (data ?? []).map((row) => fixSuiteGalleryStorageUrls(row as Record<string, unknown>));
    return reply.send({ data: rows, total: count ?? 0 });
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

    return reply.send(fixSuiteGalleryStorageUrls(data as Record<string, unknown>));
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
    return reply.send(fixSuiteGalleryStorageUrls(data as Record<string, unknown>));
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
    return reply.send(fixSuiteGalleryStorageUrls(data as Record<string, unknown>));
  });

  // POST /api/suite-galleries/:id/move-media — transfere um item de media_urls para outra galeria do mesmo tenant
  fastify.post("/suite-galleries/:id/move-media", async (req, reply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const { id: sourceId } = req.params as { id: string };
    const body = req.body as { target_gallery_id?: string; media_url?: string };

    const targetId = body.target_gallery_id?.trim() ?? "";
    const mediaUrl = body.media_url?.trim() ?? "";
    if (!targetId) return reply.status(400).send({ error: "target_gallery_id is required" });
    if (!mediaUrl) return reply.status(400).send({ error: "media_url is required" });
    if (targetId === sourceId) return reply.status(400).send({ error: "source_and_target_same" });

    const { data: sourceRow, error: srcErr } = await supabase
      .from("suite_galleries")
      .select("*")
      .eq("id", sourceId)
      .maybeSingle();

    if (srcErr) throw srcErr;
    if (!sourceRow) return reply.status(404).send({ error: "source_not_found" });

    const { data: targetRow, error: tgtErr } = await supabase
      .from("suite_galleries")
      .select("*")
      .eq("id", targetId)
      .maybeSingle();

    if (tgtErr) throw tgtErr;
    if (!targetRow) return reply.status(404).send({ error: "target_not_found" });

    const sourceTenant = (sourceRow as { tenant_id: string }).tenant_id;
    const targetTenant = (targetRow as { tenant_id: string }).tenant_id;
    if (sourceTenant !== targetTenant) {
      return reply.status(400).send({ error: "tenants_must_match" });
    }

    if (!canManageTenant(auth, sourceTenant)) {
      return reply.status(403).send({ error: "forbidden_tenant_access" });
    }

    const sourceParsed = parseMediaUrls((sourceRow as { media_urls?: unknown }).media_urls);
    const idx = findMediaIndexByUrl(sourceParsed, mediaUrl);
    if (idx < 0) return reply.status(404).send({ error: "media_not_in_source" });

    const item = sourceParsed[idx];
    if (!isSuiteGalleryMediaRow(item)) {
      return reply.status(400).send({ error: "invalid_media_item" });
    }

    const targetParsed = parseMediaUrls((targetRow as { media_urls?: unknown }).media_urls);
    if (targetParsed.length >= SUITE_GALLERY_MAX_MEDIA) {
      return reply.status(400).send({ error: "target_gallery_full", max: SUITE_GALLERY_MAX_MEDIA });
    }

    const newSourceMedia = sourceParsed.filter((_, i) => i !== idx);
    const newTargetMedia = [...targetParsed, item];

    const sourceCover = firstPhotoUrlFromMedia(newSourceMedia);
    const targetCover = firstPhotoUrlFromMedia(newTargetMedia);

    const now = new Date().toISOString();
    const sourceSnapshot = {
      media_urls: (sourceRow as { media_urls: unknown }).media_urls,
      cover_image_url: (sourceRow as { cover_image_url: string | null }).cover_image_url,
    };

    const { error: upSrcErr } = await supabase
      .from("suite_galleries")
      .update({
        media_urls: newSourceMedia,
        cover_image_url: sourceCover,
        updated_at: now,
      })
      .eq("id", sourceId);

    if (upSrcErr) throw upSrcErr;

    const { data: updatedTarget, error: upTgtErr } = await supabase
      .from("suite_galleries")
      .update({
        media_urls: newTargetMedia,
        cover_image_url: targetCover,
        updated_at: now,
      })
      .eq("id", targetId)
      .select()
      .single();

    if (upTgtErr) {
      await supabase
        .from("suite_galleries")
        .update({
          media_urls: sourceSnapshot.media_urls,
          cover_image_url: sourceSnapshot.cover_image_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sourceId);
      throw upTgtErr;
    }

    const { data: updatedSource, error: reloadErr } = await supabase
      .from("suite_galleries")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (reloadErr) throw reloadErr;

    return reply.send({
      source: fixSuiteGalleryStorageUrls(updatedSource as Record<string, unknown>),
      target: fixSuiteGalleryStorageUrls(updatedTarget as Record<string, unknown>),
    });
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
