import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-nexus-auth",
};

const NEXUS_URL = "https://boomsolution-supabase.kgn6uc.easypanel.host";
const NEXUS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE";

const LISTING_URL = "https://pplmotors.com.br/Veiculos";
const PPL_MOTORS_TENANT_ID = "bc4a1dc9-a205-4b4b-9b6c-47bf677a2728";

// ── Parse helpers ──────────────────────────────────────────

function extractText(html: string, regex: RegExp, group = 1): string {
  const m = html.match(regex);
  return m ? m[group].trim() : "";
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
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

function parseListingPage(html: string): VehicleCard[] {
  const vehicles: VehicleCard[] = [];
  // Split by result-item blocks
  const items = html.split('<div class="result-item">').slice(1);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i === 0) {
      console.log("First item (500 chars):", item.substring(0, 500));
    }
    try {
      // External ID from detail link — handle both full and relative URLs
      const detailMatch = item.match(/href="([^"]*(?:Veiculo|veiculo)[^"]*\/(\d+)\/detalhes)"/i);
      if (!detailMatch) {
        if (i === 0) console.log("No detail match in first item");
        continue;
      }
      let detail_url = detailMatch[1];
      if (!detail_url.startsWith("http")) {
        detail_url = detail_url.startsWith("/")
          ? "https://pplmotors.com.br" + detail_url
          : "https://pplmotors.com.br/" + detail_url;
      }
      const external_id = detailMatch[2];

      // Photo
      const photoMatch = item.match(/<img\s+src="([^"]+)"\s+alt=""/);
      const photo_url = photoMatch ? photoMatch[1] : "";

      // Brand + Model from title — try multiple patterns
      let brand = "";
      let model = "";
      const titleMatch = item.match(/result-item-title[^>]*>[\s\S]*?<a[^>]*>\s*([\s\S]*?)<\/a>/i);
      if (titleMatch) {
        // Remove HTML tags and get clean text
        const titleText = titleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const parts = titleText.split(/\s+/);
        brand = parts[0] || "";
        model = parts.slice(1).join(" ") || "";
      }

      // Version
      const versionMatch = item.match(/versaoVeiculo[^>]*>([^<]+)/);
      const version = versionMatch ? versionMatch[1].trim() : "";

      // Price
      const priceMatch = item.match(/class="price"[^>]*>[\s\S]*?<\/span>\s*([^<]+)/);
      const price = priceMatch ? parsePrice(priceMatch[1]) : null;

      // Fuel type
      const fuelMatch = item.match(/vehicle-age[^>]*>([^<]+)/);
      const fuel_type = fuelMatch ? fuelMatch[1].trim() : "";

      // Specs from listaEspecificacoes
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

  // Extract all photos from owl-carousel
  const photoRegex = /class="fotoSlide"[^>]*src="([^"]+)"|src="([^"]+)"[^>]*class="fotoSlide"/g;
  let pm;
  while ((pm = photoRegex.exec(html)) !== null) {
    const url = pm[1] || pm[2];
    if (url && !photos.includes(url)) photos.push(url);
  }

  // Also check featured image
  const featuredMatch = html.match(/featured-image[^>]*>[\s\S]*?<img\s+src="([^"]+)"/);
  if (featuredMatch && !photos.includes(featuredMatch[1])) {
    photos.unshift(featuredMatch[1]);
  }

  // Extract features (Características)
  const featSection = html.match(/Características<\/strong>\s*<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (featSection) {
    const featRegex = /fa-check"><\/i>\s*([^<]+)/g;
    let fm;
    while ((fm = featRegex.exec(featSection[1])) !== null) {
      features.push(fm[1].trim());
    }
  }

  // Extract optionals (Opcionais)
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

// ── Main handler ───────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const nexusUrl = Deno.env.get("NEXUS_DB_URL") || NEXUS_URL;
    const nexusKey = Deno.env.get("NEXUS_DB_ANON_KEY") || NEXUS_ANON_KEY;

    // Forward auth if available
    const nexusAuth = req.headers.get("x-nexus-auth");
    const supabase = createClient(nexusUrl, nexusKey, {
      global: {
        headers: nexusAuth ? { Authorization: `Bearer ${nexusAuth}` } : {},
      },
    });

    // Fixed tenant_id for PPL Motors
    const tenant_id: string = PPL_MOTORS_TENANT_ID;

    console.log("Starting inventory sync from", LISTING_URL, "tenant_id:", tenant_id);

    // 1. Fetch listing page
    const listResp = await fetch(LISTING_URL, {
      headers: { "User-Agent": "NexusAI-Bot/1.0" },
    });
    if (!listResp.ok) {
      throw new Error(`Failed to fetch listing page: HTTP ${listResp.status}`);
    }
    const listHtml = await listResp.text();
    const vehicles = parseListingPage(listHtml);
    console.log(`Found ${vehicles.length} vehicles on listing page`);

    if (vehicles.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "No vehicles found on page" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. For each vehicle, fetch detail page for photos + features
    const results = { synced: 0, errors: 0, total: vehicles.length };

    for (const vehicle of vehicles) {
      try {
        // Skip detail page fetch to avoid timeout — use listing data only
        const photos: string[] = vehicle.photo_url ? [vehicle.photo_url] : [];

        // Upsert into inventory
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
          status: "available",
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
      } catch (e) {
        console.error(`Error processing vehicle ${vehicle.external_id}:`, e);
        results.errors++;
      }
    }

    // 4. Mark vehicles NOT in this sync as potentially sold
    const syncedIds = vehicles.map((v) => v.external_id);
    const { error: markErr } = await supabase
      .from("inventory")
      .update({ status: "sold", last_synced_at: new Date().toISOString() })
      .eq("status", "available")
      .not("external_id", "in", `(${syncedIds.join(",")})`);

    if (markErr) {
      console.warn("Error marking sold vehicles:", markErr.message);
    }

    console.log(`Sync complete: ${results.synced}/${results.total} synced, ${results.errors} errors`);

    return new Response(JSON.stringify({ success: true, ...results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("sync-inventory error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
