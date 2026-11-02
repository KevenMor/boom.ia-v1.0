import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { createNexusClient } from "../services/supabase.js";
import { filterValidInventoryPhotoUrls } from "../lib/inventory-photo-url.js";
import {
  AS_VEICULOS_BASE_URL,
  carregarPaginaDetalhe,
  listarCarros,
  listarFotos,
  montarFicha,
} from "../lib/as-veiculos-scraper.js";

export const AS_VEICULOS_TENANT_ID = "7a93ade5-2d07-4913-b5a0-bb74e1dae392";

function formatarPreco(valor: number | null): string {
  if (valor == null) return "Consulte";
  return `R$ ${valor.toLocaleString("pt-BR")}`;
}

function formatarKm(valor: number | null): string {
  if (valor == null) return "Consulte";
  return `${valor.toLocaleString("pt-BR")} km`;
}

export async function inventorySyncASVeiculosRoutes(fastify: FastifyInstance) {
  /**
   * Sincroniza o estoque da AS Veículos (site oficial) para a tabela `inventory` do Supabase.
   * Aceita GET e POST para ser acionado por cron-job sem configuração extra.
   *
   * GET/POST /api/inventory/sync-as-veiculos[?tenant_id=uuid]
   */
  const handleSync = async (req: FastifyRequest, reply: FastifyReply) => {
    // Isolamento estrito: esta rota SEMPRE opera única e exclusivamente no tenant AS Veículos.
    const tenant_id = AS_VEICULOS_TENANT_ID;
    const supabase = createNexusClient();

    try {
      const posts = await listarCarros();
      if (posts.length === 0) {
        return reply.send({ success: false, error: "Nenhum veículo encontrado no site" });
      }

      const results = { synced: 0, errors: 0, total: posts.length };
      const BATCH_SIZE = 4;

      const processVehicle = async (post: (typeof posts)[number]) => {
        try {
          const [html, fotosMedia] = await Promise.all([
            carregarPaginaDetalhe(post.link),
            listarFotos(post.id),
          ]);
          const ficha = montarFicha(post, html, fotosMedia);
          const fotos = filterValidInventoryPhotoUrls(ficha.fotos);

          const record = {
            external_id: ficha.external_id,
            tenant_id,
            brand: ficha.brand || "AS Veículos",
            model: ficha.model || ficha.titulo,
            version: [ficha.version, ficha.motor].filter(Boolean).join(" "),
            year: ficha.ano,
            price: ficha.preco,
            mileage: ficha.km,
            color: ficha.cor || "Não informada",
            transmission: ficha.cambio,
            fuel_type: ficha.combustivel,
            photo_url: fotos[0] || null,
            photos: JSON.stringify(fotos),
            detail_url: ficha.link,
            description: ficha.opcionais.join(", "),
            status: "available",
            raw_data: JSON.stringify({
              titulo_completo: ficha.titulo,
              ano_modelo: ficha.ano_modelo,
              motorizacao: ficha.motor,
              opcionais: ficha.opcionais,
              fotos: fotos,
            }),
            last_synced_at: new Date().toISOString(),
          };

          const { error: upsertErr } = await supabase
            .from("inventory")
            .upsert(record, { onConflict: "external_id" });

          if (upsertErr) {
            console.error(`[AS Veículos] Erro ao salvar ${ficha.external_id}:`, upsertErr);
            results.errors++;
          } else {
            results.synced++;
          }
        } catch (e) {
          console.error(`[AS Veículos] Erro ao processar ${post.id}:`, (e as Error).message);
          results.errors++;
        }
      };

      for (let i = 0; i < posts.length; i += BATCH_SIZE) {
        await Promise.all(posts.slice(i, i + BATCH_SIZE).map(processVehicle));
      }

      // Veículos que saíram do site deixam de estar disponíveis.
      const syncedIds = posts.map((p) => `as-${p.id}`);
      await supabase
        .from("inventory")
        .update({ status: "sold", last_synced_at: new Date().toISOString() })
        .eq("tenant_id", tenant_id)
        .eq("status", "available")
        .not("external_id", "in", `(${syncedIds.join(",")})`);

      return reply.send({ success: true, ...results });
    } catch (err) {
      console.error("[AS Veículos] sync error:", err);
      return reply.status(500).send({ error: (err as Error).message });
    }
  };

  fastify.post("/inventory/sync-as-veiculos", handleSync);
  fastify.get("/inventory/sync-as-veiculos", handleSync);

  /**
   * Consulta de estoque para o Captain (Tânia).
   * GET /api/captain-tools/as-veiculos/estoque?search={termo}&limit={n}
   *
   * Devolve a ficha completa (preço, ano, KM, câmbio, combustível, cor, opcionais)
   * e as URLs das fotos, sempre com o link canônico do site.
   */
  fastify.get(
    "/captain-tools/as-veiculos/estoque",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const expected = process.env.CAPTAIN_TOOLS_TOKEN;
      if (!expected) {
        return reply
          .status(500)
          .send({ error: "CAPTAIN_TOOLS_TOKEN não configurado no servidor" });
      }
      const auth = String(req.headers.authorization || "");
      if (auth !== `Bearer ${expected}`) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const query = req.query as { search?: string; limit?: string };
      const search = (query.search || "").trim();
      const limit = Math.min(Math.max(Number.parseInt(query.limit || "6", 10) || 6, 1), 20);
      const supabase = createNexusClient();

      let dbQuery = supabase
        .from("inventory")
        .select(
          "external_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photos, detail_url, description, raw_data",
        )
        .eq("tenant_id", AS_VEICULOS_TENANT_ID)
        .eq("status", "available")
        .order("price", { ascending: true })
        .limit(limit);

      if (search) {
        const termo = search.replace(/[%,()]/g, " ").trim();
        if (termo) {
          // Pega a palavra principal (ex: "EcoSport" de "EcoSport XLT 2.0 Preta automática")
          const palavras = termo.split(/\s+/).filter((w) => w.length >= 3);
          const palavraPrincipal = palavras[0] || termo;
          dbQuery = dbQuery.or(
            `brand.ilike.%${termo}%,model.ilike.%${termo}%,version.ilike.%${termo}%,description.ilike.%${termo}%,model.ilike.%${palavraPrincipal}%,brand.ilike.%${palavraPrincipal}%`,
          );
        }
      }

      const { data, error } = await dbQuery;
      if (error) return reply.status(500).send({ error: error.message });

      const veiculos = (data || []).map((car: any) => {
        let fotos: string[] = [];
        try {
          fotos = typeof car.photos === "string" ? JSON.parse(car.photos) : car.photos || [];
        } catch {
          fotos = [];
        }
        fotos = filterValidInventoryPhotoUrls(fotos);

        let raw: any = {};
        try {
          raw = typeof car.raw_data === "string" ? JSON.parse(car.raw_data) : car.raw_data || {};
        } catch {
          raw = {};
        }

        const ano = car.year ? String(car.year) : "Consulte";
        const anoModelo = raw.ano_modelo && raw.ano_modelo !== car.year ? raw.ano_modelo : null;
        const titulo = raw.titulo_completo || `${car.brand} ${car.model} ${car.version}`.trim();
        const fotosValidas = fotos.slice(0, 8);
        const photosMarkdown = fotosValidas.map((url) => `![${titulo}](${url})`).join("\n");

        return {
          id: car.external_id,
          titulo,
          preco: formatarPreco(car.price),
          ano: anoModelo ? `${anoModelo}/${ano}` : ano,
          motorizacao: raw.motorizacao || "",
          cambio: car.transmission || "Não informado",
          combustivel: car.fuel_type || "Flex",
          cor: car.color || "Não informada",
          opcionais: car.description || "Consulte opcionais",
          link: car.detail_url || `${AS_VEICULOS_BASE_URL}/carros/`,
          fotos: fotosValidas,
          photos_markdown: photosMarkdown,
        };
      });

      return reply.send({
        total: veiculos.length,
        veiculos,
      });
    },
  );
}
