import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { filterValidInventoryPhotoUrls } from "../lib/inventory-photo-url.js";

const BASE_URL = "https://www.referency.com.br";
const LISTING_URL = `${BASE_URL}/estoque`;

interface ReferencyVehicleCard {
  external_id: string;
  brand: string;
  model: string;
  price: number | null;
  year: number | null;
  mileage: number | null;
  photo_url: string;
  detail_url: string;
}

interface ReferencyVehicleDetail {
  version: string;
  transmission: string;
  fuel_type: string;
  color: string;
  motor: string;
  photos: string[];
  description: string;
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function normalizeUrl(relative: string): string {
  const cleaned = relative.replace(/^\.\.\//, "").replace(/^\.\//, "");
  return `${BASE_URL}/${cleaned}`;
}

export function parseReferencyListingPage(html: string): ReferencyVehicleCard[] {
  const vehicles: ReferencyVehicleCard[] = [];
  const blocks = html.split('<div class="cardEstoque">').slice(1);

  for (let i = 0; i < blocks.length; i++) {
    try {
      const card = blocks[i];

      // The <a href> wrapping the card is in the preceding text
      const allParts = html.split('<div class="cardEstoque">');
      const preceding = allParts[i]; // text before this card
      const slugMatch = preceding.match(/href="[^"]*\/veiculo\/([^"]+)"\s*>\s*$/i);
      if (!slugMatch) continue;

      const slug = slugMatch[1].trim();
      const external_id = slug;
      const detail_url = `${BASE_URL}/veiculo/${slug}`;

      const photoMatch = card.match(/background-image:\s*url\(['"]?(.+?\.\w{3,4})['"]?\)/);
      const photo_url = photoMatch ? normalizeUrl(photoMatch[1]) : "";

      const brandMatch = card.match(/<span class="fabricante">([^<]+)<\/span>/);
      const brand = brandMatch ? brandMatch[1].trim() : "";

      const modelMatch = card.match(/<span class="fabricante">[^<]+<\/span>\s*([^<]+)<\/span>/);
      const model = modelMatch ? modelMatch[1].trim() : "";

      const yearMatch = card.match(/<div class="col-4">(\d{4})\s*\|\s*(\d{4})<\/div>/);
      const year = yearMatch ? parseInt(yearMatch[2]) : null;

      const kmMatch = card.match(/([\d]+)\s*km/);
      const mileage = kmMatch ? parseInt(kmMatch[1]) : null;

      const priceMatch = card.match(/class="[^"]*valor[^"]*">([^<]+)/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : null;

      vehicles.push({ external_id, brand, model, price, year, mileage, photo_url, detail_url });
    } catch (e) {
      console.error("Error parsing Referency vehicle card:", e);
    }
  }
  return vehicles;
}

export function parseReferencyDetailPage(html: string): ReferencyVehicleDetail {
  let version = "";
  let transmission = "";
  let fuel_type = "";
  let color = "";
  let motor = "";
  const photos: string[] = [];
  let description = "";

  const infsMatch = html.match(/<p class="infs[^"]*">([\s\S]*?)<\/p>/);
  if (infsMatch) {
    const infs = infsMatch[1];
    const versionM = infs.match(/VERSÃO:\s*<\/b>([^<]+)/i);
    if (versionM) version = versionM[1].trim();

    const transM = infs.match(/TRANSMISSÃO:\s*<\/b>([^<]+)/i);
    if (transM) transmission = transM[1].trim();

    const fuelM = infs.match(/COMBUSTÍVEL:\s*<\/b>([^<]+)/i);
    if (fuelM) fuel_type = fuelM[1].trim();

    const colorM = infs.match(/COR EXTERNA:\s*<\/b>([^<]+)/i);
    if (colorM) color = colorM[1].trim();

    const motorM = infs.match(/MOTOR:\s*<\/b>([^<]+)/i);
    if (motorM) motor = motorM[1].trim();
  }

  const photoRegex = /data-fancybox="galeria"[^>]*>\s*<img\s+src="([^"]+)"/g;
  let pm;
  const seen = new Set<string>();
  while ((pm = photoRegex.exec(html)) !== null) {
    const url = normalizeUrl(pm[1]);
    if (!seen.has(url)) {
      seen.add(url);
      photos.push(url);
    }
  }

  const validPhotos = filterValidInventoryPhotoUrls(photos);

  const detailMatch = html.match(/DETALHES DO VEÍCULO<\/p>\s*([\s\S]*?)<\/div>/);
  if (detailMatch) {
    const items = detailMatch[1].match(/<p>-\s*([^<]+)<\/p>/g);
    if (items) {
      description = items
        .map((i) => i.replace(/<\/?p>/g, "").replace(/^-\s*/, "").trim())
        .join(", ");
    }
  }

  return { version, transmission, fuel_type, color, motor, photos: validPhotos, description };
}

export async function inventorySyncReferencyRoutes(fastify: FastifyInstance) {
  fastify.post("/inventory/sync-referency", async (req: FastifyRequest, reply: FastifyReply) => {
    const nexusAuth = (req.headers["x-nexus-auth"] as string) || "";
    const supabase = createNexusClient(nexusAuth);

    const body = req.body as { tenant_id?: string } | null;
    const tenant_id = body?.tenant_id?.trim();

    if (!tenant_id) {
      return reply.status(400).send({ error: "tenant_id is required" });
    }

    try {
      const listResp = await fetch(LISTING_URL, {
        headers: { "User-Agent": "NexusAI-Bot/1.0" },
      });
      if (!listResp.ok) {
        throw new Error(`Failed to fetch listing page: HTTP ${listResp.status}`);
      }
      const listHtml = await listResp.text();
      const vehicles = parseReferencyListingPage(listHtml);

      if (vehicles.length === 0) {
        return reply.send({ success: false, error: "No vehicles found on page" });
      }

      const results = { synced: 0, errors: 0, total: vehicles.length };
      const BATCH_SIZE = 4;

      async function processVehicle(vehicle: ReferencyVehicleCard) {
        let detail: ReferencyVehicleDetail = {
          version: "",
          transmission: "",
          fuel_type: "",
          color: "",
          motor: "",
          photos: vehicle.photo_url ? [vehicle.photo_url] : [],
          description: "",
        };

        try {
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 8000);
          const detailResp = await fetch(vehicle.detail_url, {
            headers: { "User-Agent": "NexusAI-Bot/1.0" },
            signal: controller.signal,
          });
          if (detailResp.ok) {
            const detailHtml = await detailResp.text();
            detail = parseReferencyDetailPage(detailHtml);
            if (detail.photos.length === 0 && vehicle.photo_url) {
              detail.photos = filterValidInventoryPhotoUrls([vehicle.photo_url]);
            }
          }
        } catch (e) {
          console.warn(`Detail fetch timeout/error for ${vehicle.external_id}`);
        }

        const syncedPhotos = filterValidInventoryPhotoUrls(
          detail.photos.length > 0 ? detail.photos : vehicle.photo_url ? [vehicle.photo_url] : []
        );

        const record = {
          external_id: `referency-${vehicle.external_id}`,
          tenant_id,
          brand: vehicle.brand,
          model: vehicle.model,
          version: detail.version,
          year: vehicle.year,
          price: vehicle.price,
          mileage: vehicle.mileage,
          color: detail.color,
          transmission: detail.transmission,
          fuel_type: detail.fuel_type,
          photo_url: syncedPhotos[0] || null,
          photos: JSON.stringify(syncedPhotos),
          detail_url: vehicle.detail_url,
          description: [detail.motor, detail.description].filter(Boolean).join(" | "),
          status: "available",
          raw_data: JSON.stringify({ motor: detail.motor, photos: syncedPhotos }),
          last_synced_at: new Date().toISOString(),
        };

        const { error: upsertErr } = await supabase
          .from("inventory")
          .upsert(record, { onConflict: "external_id" });

        if (upsertErr) {
          console.error(`Upsert error for ${vehicle.external_id}:`, upsertErr.message);
          results.errors++;
        } else {
          results.synced++;
        }
      }

      for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
        const batch = vehicles.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(processVehicle));
      }

      const syncedIds = vehicles.map((v) => `referency-${v.external_id}`);
      await supabase
        .from("inventory")
        .update({ status: "sold", last_synced_at: new Date().toISOString() })
        .eq("tenant_id", tenant_id)
        .eq("status", "available")
        .not("external_id", "in", `(${syncedIds.join(",")})`);

      return reply.send({ success: true, ...results });
    } catch (err: any) {
      console.error("sync-referency error:", err);
      return reply.status(500).send({ error: err.message });
    }
  });
}
