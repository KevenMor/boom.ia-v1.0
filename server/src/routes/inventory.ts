import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import {
  requireAuthenticated,
  canAccessTenant,
  canManageTenant,
} from "../services/authorization.js";
import { probeVideoUrl } from "../services/video-url-probe.js";
import { decodeHtmlEntities, decodeInventoryRecord } from "../lib/html-entities.js";

const LISTING_URL = "https://pplmotors.com.br/Veiculos";
const PPL_MOTORS_TENANT_ID = "bc4a1dc9-a205-4b4b-9b6c-47bf677a2728";

interface VehicleCard {
  external_id: string;
  brand: string;
  model: string;
  version: string;
  price: number | null;
  year: number | null;
  mileage: number | null;
  color: string;
  transmission: string;
  fuel_type: string;
  photo_url: string;
  detail_url: string;
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseListingPage(html: string): VehicleCard[] {
  const vehicles: VehicleCard[] = [];
  const items = html.split('<div class="result-item">').slice(1);

  for (const item of items) {
    try {
      const detailMatch = item.match(/href="([^"]*(?:Veiculo|veiculo)[^"]*\/(\d+)\/detalhes)"/i);
      if (!detailMatch) continue;

      let detail_url = detailMatch[1];
      if (!detail_url.startsWith("http")) {
        detail_url = detail_url.startsWith("/")
          ? "https://pplmotors.com.br" + detail_url
          : "https://pplmotors.com.br/" + detail_url;
      }
      const external_id = detailMatch[2];

      const photoMatch = item.match(/<img\s+src="([^"]+)"\s+alt=""/);
      const photo_url = photoMatch ? photoMatch[1] : "";

      let brand = "";
      let model = "";
      const titleMatch = item.match(/result-item-title[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)<\/a>/i);
      if (titleMatch) {
        const titleText = decodeHtmlEntities(
          titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
        );
        const parts = titleText.split(/\s+/);
        brand = parts[0] || "";
        model = parts.slice(1).join(" ") || "";
      }

      const versionMatch = item.match(/versaoVeiculo[^>]*>([^<]+)/);
      const version = versionMatch ? decodeHtmlEntities(versionMatch[1].trim()) : "";

      const priceMatch = item.match(/class="price"[^>]*>[\s\S]*?<\/span>\s*([^<]+)/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : null;

      const fuelMatch = item.match(/vehicle-age[^>]*>([^<]+)/);
      const fuel_type = fuelMatch ? decodeHtmlEntities(fuelMatch[1].trim()) : "";

      const yearMatch = item.match(/<span>Ano<\/span>\s*<p>(\d+)<\/p>/);
      const kmMatch = item.match(/<span>Km<\/span>\s*<p>(\d+)<\/p>/);
      const colorMatch = item.match(/<span>Cor<\/span>\s*<p>([^<]+)<\/p>/);
      const transMatch = item.match(/<span>Câmbio<\/span>\s*<p>([^<]+)<\/p>/);

      vehicles.push({
        external_id,
        brand,
        model,
        version,
        price,
        year: yearMatch ? parseInt(yearMatch[1]) : null,
        mileage: kmMatch ? parseInt(kmMatch[1]) : null,
        color: colorMatch ? decodeHtmlEntities(colorMatch[1].trim()) : "",
        transmission: transMatch ? decodeHtmlEntities(transMatch[1].trim()) : "",
        fuel_type,
        photo_url,
        detail_url,
      });
    } catch (e) {
      console.error("Error parsing vehicle card:", e);
    }
  }
  return vehicles;
}

function parseDetailPage(html: string): { photos: string[]; features: string[]; optionals: string[] } {
  const photos: string[] = [];
  const features: string[] = [];
  const optionals: string[] = [];

  const photoRegex = /class="fotoSlide"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*class="fotoSlide"/g;
  let pm;
  while ((pm = photoRegex.exec(html)) !== null) {
    const url = pm[1] || pm[2];
    if (url && !photos.includes(url)) photos.push(url);
  }

  const featuredMatch = html.match(/featured-image[^>]*>[\s\S]*?<img\s+src="([^"]+)"/);
  if (featuredMatch && !photos.includes(featuredMatch[1])) {
    photos.unshift(featuredMatch[1]);
  }

  const featSection = html.match(/Características<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (featSection) {
    const featRegex = /fa-check"><\/i>\s*([^<]+)/g;
    let fm;
    while ((fm = featRegex.exec(featSection[1])) !== null) {
      features.push(decodeHtmlEntities(fm[1].trim()));
    }
  }

  const optSection = html.match(/Opcionais<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (optSection) {
    const optRegex = /fa-check"><\/i>\s*([^<]+)/g;
    let om;
    while ((om = optRegex.exec(optSection[1])) !== null) {
      optionals.push(decodeHtmlEntities(om[1].trim()));
    }
  }

  return { photos, features, optionals };
}

/** Superadmin ou tenant_admin do tenant do recurso. */
function canManageInventoryTenant(
  auth: NonNullable<Awaited<ReturnType<typeof requireAuthenticated>>>,
  tenantId: string
): boolean {
  if (auth.role === "superadmin") return true;
  return canManageTenant(auth, tenantId);
}

export async function inventoryRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  fastify.get(
    "/inventory",
    async (
      req: FastifyRequest<{
        Querystring: {
          tenant_id?: string;
          status?: string;
          limit?: string;
          offset?: string;
          search?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;

        const { tenant_id, status, limit = "100", offset = "0", search } = req.query;

        if (auth.role !== "superadmin" && !tenant_id) {
          return reply.status(400).send({ error: "tenant_id is required" });
        }

        if (tenant_id && !canAccessTenant(auth, tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }

        let query = supabase
          .from("inventory")
          .select(
            "id, external_id, tenant_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photo_url, photos, detail_url, description, status, video_details, raw_data, last_synced_at, created_at, updated_at, tenants(name)",
            { count: "exact" }
          )
          .order("created_at", { ascending: false });

        if (tenant_id) query = query.eq("tenant_id", tenant_id);
        if (status && status !== "all") query = query.eq("status", status);

        if (search?.trim()) {
          const safe = search.trim().replace(/,/g, " ");
          const term = `%${safe}%`;
          query = query.or(`brand.ilike.${term},model.ilike.${term},version.ilike.${term}`);
        }

        const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
        query = query.range(offsetNum, offsetNum + limitNum - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return reply.send({
          data: (data ?? []).map((row) => decodeInventoryRecord(row as Record<string, unknown>)),
          total: count ?? 0,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("inventory list error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  fastify.post("/inventory/video-probe", async (req: FastifyRequest, reply: FastifyReply) => {
    const auth = await requireAuthenticated(req, reply);
    if (!auth) return;

    const body = req.body as { url?: string; tenant_id?: string };
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
    if (tenantId && !canAccessTenant(auth, tenantId)) {
      return reply.status(403).send({ error: "forbidden_tenant_access" });
    }

    const result = await probeVideoUrl(url);
    return reply.send(result);
  });

  fastify.post("/inventory", async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const body = req.body as Record<string, unknown>;
      const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : "";
      if (!tenantId) {
        return reply.status(400).send({ error: "tenant_id is required" });
      }
      if (!canAccessTenant(auth, tenantId)) {
        return reply.status(403).send({ error: "forbidden_tenant_access" });
      }
      if (!canManageInventoryTenant(auth, tenantId)) {
        return reply.status(403).send({ error: "forbidden", detail: "manage_required" });
      }

      const brand = String(body.brand ?? "").trim();
      const model = String(body.model ?? "").trim();
      if (!brand || !model) {
        return reply.status(400).send({ error: "brand and model are required" });
      }

      const status =
        typeof body.status === "string" && ["available", "sold", "reserved"].includes(body.status)
          ? body.status
          : "available";

      const insert = {
        tenant_id: tenantId,
        external_id: `manual-${randomUUID()}`,
        brand,
        model,
        version: body.version != null && body.version !== "" ? String(body.version).trim() : null,
        year: body.year != null && body.year !== "" ? Number(body.year) : null,
        price: body.price != null && body.price !== "" ? Number(body.price) : null,
        mileage: body.mileage != null && body.mileage !== "" ? Number(body.mileage) : null,
        color: body.color != null && body.color !== "" ? String(body.color).trim() : null,
        transmission:
          body.transmission != null && body.transmission !== ""
            ? String(body.transmission).trim()
            : null,
        fuel_type:
          body.fuel_type != null && body.fuel_type !== "" ? String(body.fuel_type).trim() : null,
        photo_url:
          body.photo_url != null && body.photo_url !== "" ? String(body.photo_url).trim() : null,
        detail_url:
          body.detail_url != null && body.detail_url !== "" ? String(body.detail_url).trim() : null,
        description:
          body.description != null && body.description !== ""
            ? String(body.description).trim()
            : null,
        status,
        photos: null,
        raw_data: null,
        last_synced_at: null,
      };

      const { data, error } = await supabase
        .from("inventory")
        .insert(insert)
        .select(
          "id, external_id, tenant_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photo_url, photos, detail_url, description, status, video_details, raw_data, last_synced_at, created_at, updated_at"
        )
        .single();

      if (error) throw error;
      return reply.status(201).send(decodeInventoryRecord(data as Record<string, unknown>));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("inventory create error:", err);
      return reply.status(500).send({ error: message });
    }
  });

  fastify.patch("/inventory/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const id = req.params.id?.trim();
      if (!id) return reply.status(400).send({ error: "id is required" });

      const { data: existing, error: fetchErr } = await supabase
        .from("inventory")
        .select("tenant_id")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!existing?.tenant_id) {
        return reply.status(404).send({ error: "not_found" });
      }

      if (!canAccessTenant(auth, existing.tenant_id)) {
        return reply.status(403).send({ error: "forbidden_tenant_access" });
      }
      if (!canManageInventoryTenant(auth, existing.tenant_id)) {
        return reply.status(403).send({ error: "forbidden", detail: "manage_required" });
      }

      const body = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = {};

      if (body.brand !== undefined) updates.brand = String(body.brand ?? "").trim();
      if (body.model !== undefined) updates.model = String(body.model ?? "").trim();
      if (body.version !== undefined) {
        updates.version = body.version === null || body.version === "" ? null : String(body.version).trim();
      }
      if (body.year !== undefined) {
        updates.year = body.year === null || body.year === "" ? null : Number(body.year);
      }
      if (body.price !== undefined) {
        updates.price = body.price === null || body.price === "" ? null : Number(body.price);
      }
      if (body.mileage !== undefined) {
        updates.mileage = body.mileage === null || body.mileage === "" ? null : Number(body.mileage);
      }
      if (body.color !== undefined) {
        updates.color = body.color === null || body.color === "" ? null : String(body.color).trim();
      }
      if (body.transmission !== undefined) {
        updates.transmission =
          body.transmission === null || body.transmission === ""
            ? null
            : String(body.transmission).trim();
      }
      if (body.fuel_type !== undefined) {
        updates.fuel_type =
          body.fuel_type === null || body.fuel_type === "" ? null : String(body.fuel_type).trim();
      }
      if (body.photo_url !== undefined) {
        updates.photo_url =
          body.photo_url === null || body.photo_url === "" ? null : String(body.photo_url).trim();
      }
      if (body.detail_url !== undefined) {
        updates.detail_url =
          body.detail_url === null || body.detail_url === "" ? null : String(body.detail_url).trim();
      }
      if (body.description !== undefined) {
        updates.description =
          body.description === null || body.description === ""
            ? null
            : String(body.description).trim();
      }
      if (body.status !== undefined) {
        const s = String(body.status ?? "").trim();
        if (!["available", "sold", "reserved"].includes(s)) {
          return reply.status(400).send({ error: "invalid status" });
        }
        updates.status = s;
      }
      if (body.video_details !== undefined) {
        updates.video_details =
          body.video_details === null || body.video_details === ""
            ? null
            : String(body.video_details).trim();
      }

      updates.updated_at = new Date().toISOString();

      const { data, error } = await supabase
        .from("inventory")
        .update(updates)
        .eq("id", id)
        .select(
          "id, external_id, tenant_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photo_url, photos, detail_url, description, status, video_details, raw_data, last_synced_at, created_at, updated_at"
        )
        .single();

      if (error) throw error;
      return reply.send(decodeInventoryRecord(data as Record<string, unknown>));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("inventory patch error:", err);
      return reply.status(500).send({ error: message });
    }
  });

  fastify.delete("/inventory/:id", async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const id = req.params.id?.trim();
      if (!id) return reply.status(400).send({ error: "id is required" });

      const { data: existing, error: fetchErr } = await supabase
        .from("inventory")
        .select("tenant_id")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!existing?.tenant_id) {
        return reply.status(404).send({ error: "not_found" });
      }

      if (!canAccessTenant(auth, existing.tenant_id)) {
        return reply.status(403).send({ error: "forbidden_tenant_access" });
      }
      if (!canManageInventoryTenant(auth, existing.tenant_id)) {
        return reply.status(403).send({ error: "forbidden", detail: "manage_required" });
      }

      const { error } = await supabase.from("inventory").delete().eq("id", id);
      if (error) throw error;

      return reply.status(204).send();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("inventory delete error:", err);
      return reply.status(500).send({ error: message });
    }
  });

  fastify.post("/inventory/sync", async (req: FastifyRequest, reply: FastifyReply) => {
    const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
    const supabase = createNexusClient(nexusAuth);

    const tenant_id = PPL_MOTORS_TENANT_ID;

    try {
      const listResp = await fetch(LISTING_URL, {
        headers: { "User-Agent": "NexusAI-Bot/1.0" },
      });
      if (!listResp.ok) {
        throw new Error(`Failed to fetch listing page: HTTP ${listResp.status}`);
      }
      const listHtml = await listResp.text();
      const vehicles = parseListingPage(listHtml);

      if (vehicles.length === 0) {
        return reply.send({ success: false, error: "No vehicles found on page" });
      }

      const results = { synced: 0, errors: 0, total: vehicles.length };
      const BATCH_SIZE = 6;

      async function processVehicle(vehicle: VehicleCard) {
        let photos: string[] = vehicle.photo_url ? [vehicle.photo_url] : [];
        let description = "";

        try {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 5000);
          const detailResp = await fetch(vehicle.detail_url, {
            headers: { "User-Agent": "NexusAI-Bot/1.0" },
            signal: controller.signal,
          });
          if (detailResp.ok) {
            const detailHtml = await detailResp.text();
            const detail = parseDetailPage(detailHtml);
            if (detail.photos.length > 0) photos = detail.photos;
            description = [...detail.features, ...detail.optionals].join(", ");
          }
        } catch (e) {
          console.warn(`Detail fetch timeout/error for ${vehicle.external_id}`);
        }

        const record = {
          external_id: vehicle.external_id,
          tenant_id,
          brand: vehicle.brand,
          model: vehicle.model,
          version: vehicle.version,
          year: vehicle.year,
          price: vehicle.price,
          mileage: vehicle.mileage,
          color: vehicle.color,
          transmission: vehicle.transmission,
          fuel_type: vehicle.fuel_type,
          photo_url: vehicle.photo_url,
          photos: JSON.stringify(photos),
          detail_url: vehicle.detail_url,
          description,
          status: "available",
          raw_data: JSON.stringify({ photos }),
          last_synced_at: new Date().toISOString(),
        };

        const { error: upsertErr } = await supabase
          .from("inventory")
          .upsert(record, { onConflict: "external_id" });

        if (upsertErr) {
          results.errors++;
        } else {
          results.synced++;
        }
      }

      for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
        const batch = vehicles.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(processVehicle));
      }

      const syncedIds = vehicles.map((v) => v.external_id);
      await supabase
        .from("inventory")
        .update({ status: "sold", last_synced_at: new Date().toISOString() })
        .eq("status", "available")
        .not("external_id", "in", `(${syncedIds.join(",")})`);

      return reply.send({ success: true, ...results });
    } catch (err: any) {
      console.error("sync-inventory error:", err);
      return reply.status(500).send({ error: err.message });
    }
  });
}
