import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";

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
        const titleText = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const parts = titleText.split(/\s+/);
        brand = parts[0] || "";
        model = parts.slice(1).join(" ") || "";
      }

      const versionMatch = item.match(/versaoVeiculo[^>]*>([^<]+)/);
      const version = versionMatch ? versionMatch[1].trim() : "";

      const priceMatch = item.match(/class="price"[^>]*>[\s\S]*?<\/span>\s*([^<]+)/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : null;

      const fuelMatch = item.match(/vehicle-age[^>]*>([^<]+)/);
      const fuel_type = fuelMatch ? fuelMatch[1].trim() : "";

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
        color: colorMatch ? colorMatch[1].trim() : "",
        transmission: transMatch ? transMatch[1].trim() : "",
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
      features.push(fm[1].trim());
    }
  }

  const optSection = html.match(/Opcionais<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (optSection) {
    const optRegex = /fa-check"><\/i>\s*([^<]+)/g;
    let om;
    while ((om = optRegex.exec(optSection[1])) !== null) {
      optionals.push(om[1].trim());
    }
  }

  return { photos, features, optionals };
}

export async function inventoryRoutes(fastify: FastifyInstance) {
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
