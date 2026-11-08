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
import {
  sendChatwootImagesBatch,
  sendChatwootTextMessage,
} from "../services/delivery.js";

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

  /**
   * Transferência com Rodízio Infalível para o Comercial (ou Despachante) via Captain.
   * POST /api/captain-tools/as-veiculos/transferir
   *
   * Rodízio estrito entre Rafael (67) e Eduardo (70):
   * - Se último foi Rafael -> próximo é Eduardo
   * - Se último foi Eduardo -> próximo é Rafael
   * - Se departamento for "despachante" -> vai direto para Nicoly (69)
   */
  fastify.post(
    "/captain-tools/as-veiculos/transferir",
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

      const body = (req.body || {}) as {
        conversation_id?: number | string;
        departamento?: "comercial" | "despachante";
        nome_cliente?: string;
        veiculo_interesse?: string;
        resumo?: string;
        motivo?: string;
      };

      const headerConvId = req.headers["x-chatwoot-conversation-id"];
      const convIdRaw = body.conversation_id || headerConvId;
      const conversationId = convIdRaw ? Number(convIdRaw) : null;

      const supabase = createNexusClient();
      const departamento = (body.departamento || "comercial").toLowerCase();

      const VENDEDORES_COMERCIAL = [
        { id: 67, nome: "Rafael" },
        { id: 70, nome: "Eduardo" },
      ];
      const ATENDENTE_DESPACHANTE = { id: 69, nome: "Nicoly" };

      let consultorEscolhido: { id: number; nome: string };

      if (departamento === "despachante") {
        consultorEscolhido = ATENDENTE_DESPACHANTE;
      } else {
        const RODIZIO_EXTERNAL_ID = "as-system-rodizio-comercial";
        const { data: estadoRow } = await supabase
          .from("inventory")
          .select("raw_data")
          .eq("external_id", RODIZIO_EXTERNAL_ID)
          .maybeSingle();

        let lastId = 70; // Começa com Rafael (67)
        let totalCount = 0;
        if (estadoRow?.raw_data) {
          try {
            const parsed = typeof estadoRow.raw_data === "string" ? JSON.parse(estadoRow.raw_data) : estadoRow.raw_data;
            if (parsed.last_id) lastId = Number(parsed.last_id);
            if (parsed.total_count) totalCount = Number(parsed.total_count);
          } catch {
            // fallback
          }
        }

        if (lastId === 67) {
          consultorEscolhido = VENDEDORES_COMERCIAL[1]; // Eduardo (70)
        } else {
          consultorEscolhido = VENDEDORES_COMERCIAL[0]; // Rafael (67)
        }

        await supabase.from("inventory").upsert(
          {
            external_id: RODIZIO_EXTERNAL_ID,
            tenant_id: AS_VEICULOS_TENANT_ID,
            brand: "System",
            model: "Rodizio Comercial",
            status: "system",
            raw_data: JSON.stringify({
              last_id: consultorEscolhido.id,
              last_nome: consultorEscolhido.nome,
              total_count: totalCount + 1,
              updated_at: new Date().toISOString(),
            }),
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "external_id" },
        );
      }

      const chatwootBaseUrl = (process.env.CHATWOOT_BASE_URL || "https://mega.atendai.app").replace(/\/+$/, "");
      const chatwootToken = process.env.AS_VEICULOS_CHATWOOT_TOKEN || process.env.CHATWOOT_API_TOKEN;

      if (conversationId && chatwootToken) {
        try {
          await fetch(`${chatwootBaseUrl}/api/v1/accounts/20/conversations/${conversationId}/assignments`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              api_access_token: chatwootToken,
            },
            body: JSON.stringify({ assignee_id: consultorEscolhido.id }),
          });

          const nomeCli = body.nome_cliente || "Cliente";
          const veiculo = body.veiculo_interesse || "Não especificado";
          const resumo = body.resumo || body.motivo || "Cliente qualificado pela Tânia e transferido via rodízio.";
          const notaInterna = [
            "🤖 *LEAD QUALIFICADO PELA TÂNIA (IA)*",
            `👤 *Cliente:* ${nomeCli}`,
            `🚗 *Veículo:* ${veiculo}`,
            `📋 *Detalhes / Resumo:* ${resumo}`,
            `🎯 *Atribuído via rodízio para:* ${consultorEscolhido.nome}`,
          ].join("\n");

          await fetch(`${chatwootBaseUrl}/api/v1/accounts/20/conversations/${conversationId}/messages`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              api_access_token: chatwootToken,
            },
            body: JSON.stringify({
              content: notaInterna,
              private: true,
            }),
          });
        } catch (cwErr) {
          console.error("[AS Veículos] Erro ao atualizar conversa no Chatwoot:", cwErr);
        }
      }

      return reply.send({
        success: true,
        consultor_id: consultorEscolhido.id,
        consultor_nome: consultorEscolhido.nome,
        departamento,
        instrucao_ia: `Lead transferido com sucesso para o consultor ${consultorEscolhido.nome}. Agora avise o cliente com muita simpatia e naturalidade que você já passou o caso dele para o consultor ${consultorEscolhido.nome}, e que ele já está assumindo a conversa aqui no WhatsApp para continuar o atendimento!`,
      });
    },
  );

  /**
   * Envia fotos reais (anexo WhatsApp) via Chatwoot/Mega.
   * POST /api/captain-tools/as-veiculos/enviar-fotos
   *
   * Body: { conversation_id, fotos: string[], caption?: string }
   * Nunca devolve URL crua para a IA colar no chat — a tool sobe attachments[].
   */
  fastify.post(
    "/captain-tools/as-veiculos/enviar-fotos",
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

      const body = (req.body || {}) as {
        conversation_id?: number | string;
        fotos?: string[] | string;
        photo_urls?: string[] | string;
        caption?: string;
        veiculo?: string;
      };

      const headerConvId = req.headers["x-chatwoot-conversation-id"];
      const bodyConv = body.conversation_id != null ? Number(body.conversation_id) : 0;
      const headerConv = headerConvId ? Number(headerConvId) : 0;
      const conversationId =
        bodyConv > 0 && !Number.isNaN(bodyConv)
          ? bodyConv
          : headerConv > 0 && !Number.isNaN(headerConv)
            ? headerConv
            : null;
      if (!conversationId) {
        return reply.status(400).send({
          error: "conversation_id obrigatório",
          instrucao_ia:
            "Passe conversation_id da conversa atual. Não cole URL de foto no chat.",
        });
      }

      const rawFotos = body.fotos ?? body.photo_urls ?? [];
      const lista =
        typeof rawFotos === "string"
          ? rawFotos
              .split(/[\n,]+/)
              .map((s) => s.trim())
              .filter(Boolean)
          : Array.isArray(rawFotos)
            ? rawFotos.map((s) => String(s).trim()).filter(Boolean)
            : [];

      const fotos = filterValidInventoryPhotoUrls(lista).slice(0, 8);
      if (!fotos.length) {
        return reply.status(400).send({
          error: "nenhuma foto válida",
          instrucao_ia:
            "Não há fotos válidas para enviar. Informe o cliente que você confirma com o pátio e ofereça visita ou falar com o consultor. Nunca cole URL no chat.",
        });
      }

      const chatwootBaseUrl = (process.env.CHATWOOT_BASE_URL || "https://mega.atendai.app").replace(
        /\/+$/,
        "",
      );
      const chatwootToken =
        process.env.AS_VEICULOS_CHATWOOT_TOKEN || process.env.CHATWOOT_API_TOKEN;
      if (!chatwootToken) {
        return reply.status(500).send({
          error: "token Chatwoot ausente",
          instrucao_ia:
            "Falha técnica ao enviar fotos. Peça desculpas em 1 frase e ofereça que o consultor manda as imagens em seguida.",
        });
      }

      const msgUrl = `${chatwootBaseUrl}/api/v1/accounts/20/conversations/${conversationId}/messages`;
      const veiculoLabel = (body.veiculo || "").trim();
      const caption =
        (body.caption || "").trim() ||
        (veiculoLabel
          ? `Olha só as fotos do ${veiculoLabel}! Se quiser, te ajudo a simular o financiamento ou a agendar uma visita na loja.`
          : "Olha só as fotos! Se quiser, te ajudo a simular o financiamento ou a agendar uma visita na loja.");

      const enviadas = await sendChatwootImagesBatch(msgUrl, chatwootToken, fotos, caption);

      if (enviadas === 0) {
        await sendChatwootTextMessage(
          msgUrl,
          chatwootToken,
          "Tive uma travada pra mandar as fotos agora. Posso te ligar o consultor pra enviar as imagens e seguir com você, ou prefere que eu tente de novo?",
        );
        return reply.send({
          success: false,
          enviadas: 0,
          instrucao_ia:
            "As fotos não subiram. NÃO cole URL. Ofereça tentar de novo ou transferir para o consultor.",
        });
      }

      return reply.send({
        success: true,
        enviadas,
        total_solicitadas: fotos.length,
        instrucao_ia:
          "Fotos já foram enviadas como imagem no WhatsApp. NÃO cole URL nem markdown. NÃO diga 'ficou com alguma dúvida?'. Faça UMA pergunta comercial leve (financiamento, visita ou carro na troca).",
      });
    },
  );
}
