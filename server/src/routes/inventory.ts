import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { probeVideoUrl } from "../services/video-url-probe.js";
import { isTenantModuleEnabled } from "../services/tenant-modules.js";
import { canAccessTenant, canManageTenant, requireAuthenticated } from "../services/authorization.js";

const LISTING_URL = "https://pplmotors.com.br/Veiculos";
const PPL_MOTORS_TENANT_ID = "bc4a1dc9-a205-4b4b-9b6c-47bf677a2728";
const INVENTORY_MODULE_KEY = "inventory";

async function denyIfInventoryDisabled(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string | undefined,
  reply: FastifyReply
): Promise<boolean> {
  if (!tenantId) return false;
  const enabled = await isTenantModuleEnabled(supabase, tenantId, INVENTORY_MODULE_KEY);
  if (enabled) return false;
  reply.status(403).send({ error: "module_disabled", module_key: INVENTORY_MODULE_KEY });
  return true;
}

interface InventoryRecord {
  id?: string;
  external_id?: string | null;
  tenant_id: string;
  brand: string;
  model: string;
  version?: string | null;
  year?: number | null;
  price?: number | null;
  mileage?: number | null;
  color?: string | null;
  transmission?: string | null;
  fuel_type?: string | null;
  photo_url?: string | null;
  photos?: string | unknown;
  detail_url?: string | null;
  description?: string | null;
  status?: string;
  video_details?: string | null;
  raw_data?: unknown;
}

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

/** Decodifica entidades HTML (&#225; → á, &#231; → ç) para exibição limpa */
function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&copy;/g, "©");
}

/** Normaliza string para comparação (lowercase, sem acentos) */
function normalizeForMatch(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

/** Infere o tipo do veículo (hatch, sedan, SUV, camionete) a partir de brand/model/version */
function inferVehicleType(brand: string, model: string, version: string): string {
  const m = normalizeForMatch(model);
  const v = normalizeForMatch(version);
  const combined = `${m} ${v}`;

  // Ordem: camionete → SUV → hatch → sedan (evitar conflito: Duster = SUV)
  const CAMIONETE_MODELS = [
    "s10", "hilux", "saveiro", "strada", "amarok", "ranger", "l200", "montana", "toro",
    "frontier", "navara", "l200", "colorado", "sierra", "d-max", "triton",
  ];
  if (CAMIONETE_MODELS.some((x) => m.includes(x) || combined.includes(x))) return "camionete";

  const SUV_MODELS = [
    "tracker", "tiguan", "q5", "q3", "q7", "duster", "kicks", "compass", "renegade",
    "creta", "hr-v", "hrv", "pulse", "taos", "t-cross", "tcross", "nivus", "kick",
    "haval", "eclipse", "glb",
  ];
  if (SUV_MODELS.some((x) => m.includes(x) || combined.includes(x))) return "SUV";

  const HATCH_MODELS = [
    "fox", "onix", "hb20", "208", "gol", "up", "sandero", "prisma", "march",
    "ka", "fiesta", "focus", "polo", "golf", "cruze hatch", "celer",
  ];
  if (HATCH_MODELS.some((x) => m.includes(x) || combined.includes(x))) return "hatch";
  if (/hatch|hatchback|compacto/i.test(combined)) return "hatch";

  const SEDAN_MODELS = [
    "virtus", "a3", "civic", "corolla", "accord", "320i", "118i", "c 180",
    "jetta", "passat", "vento", "fusion", "mondeo", "cruze", "malibu", "camry",
    "sentra", "altima", "fluence", "logan",
  ];
  if (SEDAN_MODELS.some((x) => m.includes(x) || combined.includes(x))) return "sedan";
  if (/sedan/i.test(combined) || /\b4p\b|4 portas/i.test(combined)) return "sedan";

  return "";
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
        const titleText = decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
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

function parseDetailPage(html: string): {
  photos: string[];
  description: string;
  features: string[];
  optionals: string[];
} {
  const photos: string[] = [];
  let description = "";
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

  // Descrição: texto em "Informações do Veículo"
  // Estrutura real do site: </strong><br />Texto aqui...</p>
  const descMatch =
    html.match(/Informa[çc][oõ]es do Ve[ií]culo<\/strong>\s*<br\s*\/?>\s*([^<]+?)\s*<\/p>/i) ||
    html.match(/Informações do Veículo[\s\S]*?<p>\s*"?([^"]*)"?\s*<\/p>/i) ||
    html.match(/Informações do Veículo[\s\S]*?<p>([^<]*)<\/p>/i) ||
    html.match(/Informa[çc][oõ]es do Ve[ií]culo<\/strong>[\s\S]*?>([^<]+)</) ||
    html.match(/Informa[çc][oõ]es do Ve[ií]culo<\/strong>\s*([^<]{15,})/);
  if (descMatch) {
    description = decodeHtmlEntities(
      (descMatch[1] || "")
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, " ")
        .trim()
    );
  }

  // Características: <ul> com itens (fa-check ou <li>)
  const featSection = html.match(/Características<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (featSection) {
    extractListItems(featSection[1], features);
  }

  // Opcionais: <ul> com itens (fa-check ou <li>)
  const optSection = html.match(/Opcionais<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (optSection) {
    extractListItems(optSection[1], optionals);
  }

  return { photos, description, features, optionals };
}

function extractListItems(html: string, out: string[]): void {
  const add = (t: string) => {
    const decoded = decodeHtmlEntities(t);
    if (decoded && !out.includes(decoded)) out.push(decoded);
  };
  // Padrão 1: fa-check"></i> texto
  const checkRegex = /fa-check"><\/i>\s*([^<]+)/g;
  let m;
  while ((m = checkRegex.exec(html)) !== null) {
    add(m[1].trim());
  }
  // Padrão 2: <li>texto</li> (fallback se não encontrou fa-check)
  if (out.length === 0) {
    const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/g;
    while ((m = liRegex.exec(html)) !== null) {
      add(m[1].replace(/<[^>]+>/g, "").trim());
    }
  }
}

export async function inventoryRoutes(fastify: FastifyInstance) {
  const supabase = createNexusClient();

  // GET /api/inventory — lista veículos
  fastify.get(
    "/inventory",
    async (
      req: FastifyRequest<{
        Querystring: { tenant_id?: string; status?: string; limit?: string; offset?: string; search?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { tenant_id, status, limit = "100", offset = "0", search } = req.query;
        if (tenant_id && !canAccessTenant(auth, tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfInventoryDisabled(supabase, tenant_id, reply)) return;
        let query = supabase
          .from("inventory")
          .select("id, external_id, tenant_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photo_url, photos, detail_url, description, status, video_details, raw_data, last_synced_at, created_at, updated_at, tenants(name)", { count: "exact" })
          .order("updated_at", { ascending: false });

        if (tenant_id) query = query.eq("tenant_id", tenant_id);
        if (status) query = query.eq("status", status);
        if (search && search.trim()) {
          const term = `%${search.trim()}%`;
          query = query.or(`brand.ilike.${term},model.ilike.${term},version.ilike.${term}`);
        }

        const limitNum = Math.min(parseInt(limit, 10) || 100, 500);
        const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
        query = query.range(offsetNum, offsetNum + limitNum - 1);

        const { data, error, count } = await query;
        if (error) throw error;
        return reply.send({ data: data ?? [], total: count ?? 0 });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("inventory list error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  // POST /api/inventory — cria veículo manual
  fastify.post(
    "/inventory",
    async (
      req: FastifyRequest<{ Body: Partial<InventoryRecord> }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const body = req.body as Record<string, unknown>;
        const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "";
        if (!tenantId) {
          return reply.status(400).send({ error: "tenant_id is required" });
        }
        if (!canManageTenant(auth, tenantId)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfInventoryDisabled(supabase, tenantId, reply)) return;
        const record: Record<string, unknown> = {
          tenant_id: tenantId,
          brand: body.brand ?? "",
          model: body.model ?? "",
          version: body.version ?? null,
          year: body.year ?? null,
          price: body.price ?? null,
          mileage: body.mileage ?? null,
          color: body.color ?? null,
          transmission: body.transmission ?? null,
          fuel_type: body.fuel_type ?? null,
          photo_url: body.photo_url ?? null,
          photos: typeof body.photos === "string" ? body.photos : JSON.stringify(body.photos ?? []),
          detail_url: body.detail_url ?? null,
          description: body.description ?? null,
          status: body.status ?? "available",
          video_details: body.video_details ?? null,
          raw_data: typeof body.raw_data === "string" ? body.raw_data : JSON.stringify(body.raw_data ?? {}),
        };
        if (body.external_id) record.external_id = body.external_id;

        const { data, error } = await supabase.from("inventory").insert(record).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("inventory create error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  // POST /api/inventory/video-probe — estima tamanho e modo de envio WhatsApp (HEAD/Range)
  fastify.post(
    "/inventory/video-probe",
    async (req: FastifyRequest<{ Body: { url?: string; tenant_id?: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const tenantId = req.body?.tenant_id;
        if (tenantId && !canAccessTenant(auth, tenantId)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfInventoryDisabled(supabase, tenantId, reply)) return;
        const url = typeof req.body?.url === "string" ? req.body.url : "";
        if (!url.trim()) {
          return reply.status(400).send({
            ok: false,
            sizeBytes: null,
            deliveryMode: "unknown",
            humanLabelPt: "Informe uma URL.",
            error: "empty_url",
          });
        }
        const result = await probeVideoUrl(url);
        return reply.send(result);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("inventory video-probe error:", msg);
        return reply.status(500).send({
          ok: false,
          sizeBytes: null,
          deliveryMode: "unknown",
          humanLabelPt: "Não foi possível verificar agora. Tente de novo.",
          error: msg,
        });
      }
    }
  );

  // PATCH /api/inventory/:id — atualiza veículo
  fastify.patch(
    "/inventory/:id",
    async (
      req: FastifyRequest<{ Params: { id: string }; Body: Partial<InventoryRecord> }>,
      reply: FastifyReply
    ) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;
        const body = req.body as Record<string, unknown>;
        const { data: existing, error: existingErr } = await supabase
          .from("inventory")
          .select("tenant_id")
          .eq("id", id)
          .maybeSingle();
        if (existingErr) throw existingErr;
        if (!existing) return reply.status(404).send({ error: "Inventory item not found" });
        if (!canManageTenant(auth, existing.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfInventoryDisabled(supabase, existing.tenant_id, reply)) return;
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const allowed = ["brand", "model", "version", "year", "price", "mileage", "color", "transmission", "fuel_type", "photo_url", "photos", "detail_url", "description", "status", "video_details", "external_id"];
        for (const key of allowed) {
          if (body[key] !== undefined) {
            if (key === "photos") updates[key] = typeof body[key] === "string" ? body[key] : JSON.stringify(body[key] ?? []);
            else updates[key] = body[key];
          }
        }

        const { data, error } = await supabase.from("inventory").update(updates).eq("id", id).select().single();
        if (error) throw error;
        return reply.send(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("inventory update error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  // DELETE /api/inventory/:id — remove veículo
  fastify.delete(
    "/inventory/:id",
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const auth = await requireAuthenticated(req, reply);
        if (!auth) return;
        const { id } = req.params;
        const { data: existing, error: existingErr } = await supabase
          .from("inventory")
          .select("tenant_id")
          .eq("id", id)
          .maybeSingle();
        if (existingErr) throw existingErr;
        if (!existing) return reply.status(404).send({ error: "Inventory item not found" });
        if (!canManageTenant(auth, existing.tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfInventoryDisabled(supabase, existing.tenant_id, reply)) return;
        const { error } = await supabase.from("inventory").delete().eq("id", id);
        if (error) throw error;
        return reply.send({ success: true });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("inventory delete error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );

  // POST /api/inventory/sync — sync via scraping
  fastify.post(
    "/inventory/sync",
    async (
      req: FastifyRequest<{ Body: { tenant_id?: string } }>,
      reply: FastifyReply
    ) => {
      const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
      const supabase = createNexusClient(nexusAuth);
      const auth = await requireAuthenticated(req, reply);
      if (!auth) return;

      const bodyTenantId = (req.body as { tenant_id?: string })?.tenant_id;
      let tenant_id: string;
      let listingUrl: string;

      if (bodyTenantId) {
        if (!canManageTenant(auth, bodyTenantId)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfInventoryDisabled(supabase, bodyTenantId, reply)) return;
        const { data: tenant, error: tenantErr } = await supabase
          .from("tenants")
          .select("id, settings")
          .eq("id", bodyTenantId)
          .maybeSingle();
        if (tenantErr || !tenant) {
          return reply.status(400).send({ error: "Tenant não encontrado" });
        }
        const syncUrl = (tenant.settings as { sync_url?: string })?.sync_url;
        tenant_id = tenant.id;
        if (syncUrl && syncUrl.trim()) {
          listingUrl = syncUrl.trim();
        } else if (tenant_id === PPL_MOTORS_TENANT_ID) {
          listingUrl = LISTING_URL;
        } else {
          return reply.status(400).send({
            error: "Tenant não tem sync_url configurada. Configure em Editar Tenant.",
          });
        }
      } else {
        tenant_id = PPL_MOTORS_TENANT_ID;
        if (!canManageTenant(auth, tenant_id)) {
          return reply.status(403).send({ error: "forbidden_tenant_access" });
        }
        if (await denyIfInventoryDisabled(supabase, tenant_id, reply)) return;
        listingUrl = LISTING_URL;
      }

      try {
        const listResp = await fetch(listingUrl, {
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
          const features: string[] = [];
          const optionals: string[] = [];

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
              features.push(...detail.features);
              optionals.push(...detail.optionals);
            }
          } catch (e) {
            console.warn(`Detail fetch timeout/error for ${vehicle.external_id}`);
          }

          const description = inferVehicleType(vehicle.brand, vehicle.model, vehicle.version);

          // Preservar video_details editado manualmente no sistema — sync não deve sobrescrever
          const { data: existing } = await supabase
            .from("inventory")
            .select("video_details")
            .eq("external_id", vehicle.external_id)
            .eq("tenant_id", tenant_id)
            .maybeSingle();

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
            raw_data: JSON.stringify({ photos, features, optionals }),
            last_synced_at: new Date().toISOString(),
            ...(existing?.video_details != null && String(existing.video_details).trim() !== ""
              ? { video_details: existing.video_details }
              : {}),
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
          .eq("tenant_id", tenant_id)
          .eq("status", "available")
          .not("external_id", "in", `(${syncedIds.join(",")})`);

        return reply.send({ success: true, ...results });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("sync-inventory error:", err);
        return reply.status(500).send({ error: message });
      }
    }
  );
}
