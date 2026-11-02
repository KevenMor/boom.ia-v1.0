import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import * as cheerio from "cheerio";
import { createNexusClient } from "../services/supabase.js";
import { filterValidInventoryPhotoUrls } from "../lib/inventory-photo-url.js";
import { decodeHtmlEntities } from "../lib/html-entities.js";

export const AS_VEICULOS_TENANT_ID = "7a93ade5-2d07-4913-b5a0-bb74e1dae392";
const WP_API_BASE = "https://asveiculosmultimarcas.com.br/wp-json/wp/v2";

interface ASVeiculoCard {
  external_id: string;
  title: string;
  detail_url: string;
}

interface ASVeiculoDetail {
  brand: string;
  model: string;
  version: string;
  price: number | null;
  year: number | null;
  year_model: number | null;
  mileage: number | null;
  color: string;
  transmission: string;
  fuel_type: string;
  optionals: string[];
  photos: string[];
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseDetailPage(html: string): ASVeiculoDetail {
  const $ = cheerio.load(html);

  // Titulo da pagina
  const titleText = decodeHtmlEntities(
    $("title").text().replace(/[–-].*$/, "").trim()
  );
  const parts = titleText.split("/");
  const brand = (parts[0] || "").trim();
  const rest = (parts.slice(1).join("/") || parts[0] || "").trim();
  const modelParts = rest.split(/\s+/);
  const model = modelParts[0] || "";
  const version = modelParts.slice(1).join(" ") || "";

  // Preco
  const priceMatch = html.match(/R\$\s*[\d.]+(?:,\d{2})?/i);
  const price = priceMatch ? parsePrice(priceMatch[0]) : null;

  // Anos, Cambio, Combustivel, Motor
  const years: number[] = [];
  let transmission = "";
  let fuel_type = "";

  $(".elementor-widget").each((_, el) => {
    const t = $(el).text().trim();
    if (/^(19\d\d|20\d\d)$/.test(t)) {
      const y = parseInt(t, 10);
      if (!years.includes(y)) years.push(y);
    }
    if (/^(AUTOMATICO|AUTOMÁTICO)$/i.test(t)) transmission = "Automático";
    if (/^MANUAL$/i.test(t)) transmission = "Manual";
    if (/^(FLEX|GASOLINA|DIESEL|ALCOOL|ÁLCOOL)$/i.test(t)) {
      fuel_type = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
    }
  });

  // KM
  let mileage: number | null = null;
  $(".elementor-widget").each((_, el) => {
    if ($(el).text().trim().toUpperCase() === "KM") {
      const nextW = $(el).next(".elementor-widget");
      if (nextW.length) {
        const kmRaw = nextW.text().replace(/\D/g, "");
        if (kmRaw) mileage = parseInt(kmRaw, 10);
      }
    }
  });

  // Cor
  let color = "";
  const colorMatch = html.match(
    /\b(PRETA|PRETO|BRANCA|BRANCO|PRATA|CINZA|VERMELHA|VERMELHO|AZUL|VERDE|AMARELA|AMARELO|BEGE)\b/i
  );
  if (colorMatch) {
    color = colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1).toLowerCase();
  }

  // Itens do veiculo / Opcionais
  const optionals: string[] = [];
  $("*").each((_, el) => {
    if ($(el).text().trim() === "Itens do veículo:") {
      const sibling = $(el).closest(".elementor-widget").next(".elementor-widget");
      if (sibling.length) {
        const text = sibling.text().replace(/\s+/g, " ").trim();
        if (text) {
          // Normaliza itens conhecidos
          const known = [
            "Ar-condicionado",
            "Direção Hidráulica",
            "Vidros Elétricos",
            "Travas Elétricas",
            "Rodas de Liga Leve",
            "Airbag",
            "Freios ABS",
            "Alarme",
            "Sensor de Estacionamento",
            "Câmera de Ré",
            "Bancos de Couro",
            "Central Multimídia",
            "Controle de Tração",
            "Piloto Automático",
            "Teto Solar",
          ];
          for (const item of known) {
            if (new RegExp(item, "i").test(text) && !optionals.includes(item)) {
              optionals.push(item);
            }
          }
          if (optionals.length === 0 && text) {
            optionals.push(text);
          }
        }
      }
    }
  });

  // Fotos reais do veiculo
  const photosSet = new Set<string>();
  $("a[href*='.jpeg'], a[href*='.jpg'], a[href*='.png'], img").each((_, el) => {
    const src =
      $(el).attr("href") ||
      $(el).attr("src") ||
      $(el).attr("data-src") ||
      $(el).attr("data-lazy-src");
    if (
      src &&
      src.includes("/uploads/") &&
      !src.includes("5693ba8b") && // Logo AS Veiculos
      !src.includes("logo")
    ) {
      const clean = src.replace(/\.webp$/, "").trim();
      if (clean.startsWith("http")) photosSet.add(clean);
    }
  });

  return {
    brand,
    model,
    version,
    price,
    year: years[1] || years[0] || null, // ex: fabricacao
    year_model: years[0] || null, // ex: modelo
    mileage,
    color,
    transmission: transmission || "Não informado",
    fuel_type: fuel_type || "Flex",
    optionals,
    photos: Array.from(photosSet),
  };
}

export async function inventorySyncASVeiculosRoutes(fastify: FastifyInstance) {
  /**
   * Endpoint de Sincronização do Estoque AS Veículos
   * Aceita GET ou POST para ser acionado diretamente por cron-job (cron-job.org, EasyPanel, etc)
   */
  const handleSync = async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { tenant_id?: string };
    const tenant_id = query?.tenant_id || AS_VEICULOS_TENANT_ID;

    const supabase = createNexusClient();

    try {
      // 1. Lista os carros da API oficial do WordPress (17 posts atuais)
      const listResp = await fetch(`${WP_API_BASE}/carros?per_page=100`, {
        headers: { "User-Agent": "NexusAI-Bot/1.0" },
      });

      if (!listResp.ok) {
        throw new Error(`Falha ao consultar API WordPress: HTTP ${listResp.status}`);
      }

      const wpPosts = (await listResp.json()) as Array<{
        id: number;
        link: string;
        title?: { rendered?: string };
      }>;

      if (!Array.isArray(wpPosts) || wpPosts.length === 0) {
        return reply.send({ success: false, error: "Nenhum veículo encontrado no site" });
      }

      const vehicles: ASVeiculoCard[] = wpPosts.map((p) => ({
        external_id: `as-${p.id}`,
        title: decodeHtmlEntities(p.title?.rendered || ""),
        detail_url: p.link,
      }));

      const results = { synced: 0, errors: 0, total: vehicles.length };
      const BATCH_SIZE = 4;

      async function processVehicle(v: ASVeiculoCard) {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);

          const detailResp = await fetch(v.detail_url, {
            headers: { "User-Agent": "NexusAI-Bot/1.0" },
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!detailResp.ok) {
            results.errors++;
            return;
          }

          const detailHtml = await detailResp.text();
          const detail = parseDetailPage(detailHtml);

          const validPhotos = filterValidInventoryPhotoUrls(detail.photos);

          const record = {
            external_id: v.external_id,
            tenant_id,
            brand: detail.brand || "AS Veículos",
            model: detail.model || v.title,
            version: detail.version || "",
            year: detail.year,
            price: detail.price,
            mileage: detail.mileage,
            color: detail.color || "Não informada",
            transmission: detail.transmission,
            fuel_type: detail.fuel_type,
            photo_url: validPhotos[0] || null,
            photos: JSON.stringify(validPhotos),
            detail_url: v.detail_url,
            description: detail.optionals.join(", "),
            status: "available",
            raw_data: JSON.stringify({
              titulo_completo: v.title,
              ano_modelo: detail.year_model,
              opcionais: detail.optionals,
              fotos: validPhotos,
            }),
            last_synced_at: new Date().toISOString(),
          };

          const { error: upsertErr } = await supabase
            .from("inventory")
            .upsert(record, { onConflict: "external_id" });

          if (upsertErr) {
            console.error(`Erro ao salvar ${v.external_id}:`, upsertErr);
            results.errors++;
          } else {
            results.synced++;
          }
        } catch (e) {
          console.error(`Erro ao processar ${v.external_id}:`, e);
          results.errors++;
        }
      }

      for (let i = 0; i < vehicles.length; i += BATCH_SIZE) {
        const batch = vehicles.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(processVehicle));
      }

      // 2. Marca como "sold" carros que saíram do site
      const syncedIds = vehicles.map((v) => v.external_id);
      await supabase
        .from("inventory")
        .update({ status: "sold", last_synced_at: new Date().toISOString() })
        .eq("tenant_id", tenant_id)
        .eq("status", "available")
        .not("external_id", "in", `(${syncedIds.join(",")})`);

      return reply.send({ success: true, ...results });
    } catch (err: any) {
      console.error("sync-as-veiculos error:", err);
      return reply.status(500).send({ error: err.message });
    }
  };

  fastify.post("/inventory/sync-as-veiculos", handleSync);
  fastify.get("/inventory/sync-as-veiculos", handleSync);

  /**
   * Endpoint de Consulta de Estoque para o Captain (Tânia)
   * GET /api/captain-tools/as-veiculos/estoque?search={termo}
   * Devolve JSON enxuto, formatado e completo para a LLM apresentar sem inventar nada.
   */
  fastify.get(
    "/captain-tools/as-veiculos/estoque",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const query = req.query as { search?: string; limit?: string };
      const search = (query.search || "").trim();
      const limit = parseInt(query.limit || "6", 10);

      const supabase = createNexusClient();

      let dbQuery = supabase
        .from("inventory")
        .select(
          "external_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photos, detail_url, description, raw_data"
        )
        .eq("tenant_id", AS_VEICULOS_TENANT_ID)
        .eq("status", "available")
        .order("price", { ascending: true })
        .limit(limit);

      if (search) {
        dbQuery = dbQuery.or(
          `brand.ilike.%${search}%,model.ilike.%${search}%,version.ilike.%${search}%,description.ilike.%${search}%`
        );
      }

      const { data, error } = await dbQuery;

      if (error) {
        return reply.status(500).send({ error: error.message });
      }

      const formatted = (data || []).map((car: any) => {
        let photos: string[] = [];
        try {
          photos = typeof car.photos === "string" ? JSON.parse(car.photos) : car.photos || [];
        } catch {}

        let raw: any = {};
        try {
          raw = typeof car.raw_data === "string" ? JSON.parse(car.raw_data) : car.raw_data || {};
        } catch {}

        const precoFormatado = car.price
          ? `R$ ${Number(car.price).toLocaleString("pt-BR")}`
          : "Consulte";
        const kmFormatado =
          car.mileage !== null && car.mileage !== undefined
            ? `${Number(car.mileage).toLocaleString("pt-BR")} km`
            : "Consulte";
        const anoFormatado =
          car.year && raw.ano_modelo && car.year !== raw.ano_modelo
            ? `${car.year}/${raw.ano_modelo}`
            : car.year ? String(car.year) : "Consulte";

        return {
          id: car.external_id,
          titulo: raw.titulo_completo || `${car.brand} ${car.model} ${car.version}`.trim(),
          preco: precoFormatado,
          ano: anoFormatado,
          km: kmFormatado,
          cambio: car.transmission || "Não informado",
          combustivel: car.fuel_type || "Flex",
          cor: car.color || "Não informada",
          opcionais: car.description || "Consulte opcionais",
          link: car.detail_url,
          fotos_destaque: photos.slice(0, 5),
        };
      });

      return reply.send({
        total: formatted.length,
        veiculos: formatted,
      });
    }
  );
}
