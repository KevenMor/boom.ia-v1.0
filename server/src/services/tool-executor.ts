import { createNexusClient } from "./supabase.js";
import { isTenantModuleEnabled } from "./tenant-modules.js";
import { runFipeQuery } from "./fipe.js";
import { runOmnibeesAvailabilityQuery } from "./omnibees-availability.js";
import { runFindNearestUnit } from "./find-nearest-unit.js";
import { buildHandoffNotification, containsInstitutionNameToken, isBlockedAsName } from "../utils/agendaNotification.js";
import { sendNotificationToGroup } from "../utils/sendNotification.js";
import { addLeadLabelToConversation } from "./chatwoot-labels.js";

export interface ToolExecutionResult {
  success: boolean;
  result: unknown;
  error?: string;
}

function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/**
 * Remove fragmentos de frase que o LLM às vezes inclui ao extrair marca/modelo.
 * Ex: "Cruze e queria", "Cruze e ", "Accord e" → "Cruze"/"Accord" (conjunção "e" + resto é removida).
 */
function sanitizeVehicleParam(val: string | undefined): string | undefined {
  if (val == null || typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  // Remove " e " ou " e" + resto da frase (ex: "Cruze e queria", "Accord e")
  const cleaned = trimmed.replace(/\s+e\s*.*$/i, "").trim();
  return cleaned || undefined;
}

/** Decodifica entidades HTML para exibição limpa (&#225; → á, &copy; → ©) */
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

const COLOR_SYNONYM_GROUPS: string[][] = [
  ["cinza", "prata", "grafite", "chumbo", "gray", "grey", "silver"],
  ["branco", "white", "perola", "perolizado"],
  ["preto", "black", "onix"],
  ["vermelho", "red", "rubi", "bordo", "vinho"],
  ["azul", "blue", "marinho"],
  ["bege", "champagne", "dourado", "gold", "areia"],
  ["marrom", "bronze", "brown", "terra"],
  ["verde", "green"],
];

function getColorSynonyms(cor: string): string[] {
  const norm = normalizeForSearch(cor);
  for (const group of COLOR_SYNONYM_GROUPS) {
    if (group.some((c) => norm.includes(c) || c.includes(norm))) {
      return group;
    }
  }
  return [norm];
}

async function executeInventoryQuery(
  supabase: ReturnType<typeof createNexusClient>,
  agentId: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  try {
    const { data: agent } = await supabase
      .from("agents")
      .select("tenant_id")
      .eq("id", agentId)
      .single();

    const tenantId = agent?.tenant_id;
    if (!tenantId) {
      return { success: false, result: null, error: "Agent tenant not found" };
    }
    const inventoryEnabled = await isTenantModuleEnabled(supabase, tenantId, "inventory");
    if (!inventoryEnabled) {
      return { success: false, result: null, error: "module_disabled: inventory" };
    }

    let query = supabase
      .from("inventory")
      .select("id, external_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photo_url, photos, detail_url, description, raw_data, video_details")
      .eq("tenant_id", tenantId)
      .eq("status", "available")
      .limit(50);

    const marca = sanitizeVehicleParam((args.marca || args.brand) as string | undefined);
    const modelo = sanitizeVehicleParam((args.modelo || args.model) as string | undefined);
    const cor = args.cor as string | undefined;
    const ano = args.ano as number | string | undefined;
    const faixaPreco = (args.faixa_preco || args.faixaPreco) as string | undefined;
    const precoMin = args.preco_min ?? args.precoMin;
    const precoMax = args.preco_max ?? args.precoMax;
    const tipoRaw = sanitizeVehicleParam((args.tipo || args.modelo || args.model) as string | undefined) ?? undefined;
    const cambio = (args.cambio || args.transmission) as string | undefined;
    const motorizacao = (args.motorizacao || args.engine) as string | undefined;

    const MOTORIZACAO_KEYWORDS = ["turbo", "aspirado", "tsi", "tfsi", "tdi", "gdi", "mpi"];
    let motorizacaoFinal = motorizacao;
    if (!motorizacaoFinal && modelo) {
      const modeloNorm = normalizeForSearch(modelo);
      if (MOTORIZACAO_KEYWORDS.some((k) => modeloNorm.includes(k))) {
        motorizacaoFinal = modelo;
      }
    }
    if (!motorizacaoFinal && cambio) {
      const cambioNorm = normalizeForSearch(cambio);
      if (MOTORIZACAO_KEYWORDS.some((k) => cambioNorm.includes(k))) {
        motorizacaoFinal = cambio;
      }
    }

    // #region agent log
    const colorSynonyms = cor ? getColorSynonyms(cor) : [];
    fetch("http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ad5eb6" },
      body: JSON.stringify({
        sessionId: "ad5eb6",
        location: "tool-executor.ts:executeInventoryQuery:entry",
        message: "consultar_estoque args parsed",
        data: { argsKeys: Object.keys(args), marca, modelo, cor, colorSynonyms, tipoRaw, ano, cambio },
        timestamp: Date.now(),
        hypothesisId: "H_COLOR",
      }),
    }).catch(() => {});
    // #endregion
    // Normaliza pickup/picape/pikup → camionete (termo em português)
    const PICKUP_TO_CAMIONETE = ["pickup", "picape", "pikup"];
    const tipo =
      tipoRaw && PICKUP_TO_CAMIONETE.includes(normalizeForSearch(tipoRaw))
        ? "camionete"
        : tipoRaw;

    // Normaliza valor numérico: se for número pequeno (< 1000) e o texto tiver "mil", trata como milhares
    function parsePriceValue(val: number | string, strContext?: string): number {
      const n = typeof val === "string" ? parseInt(val.replace(/\D/g, ""), 10) : Number(val);
      if (Number.isNaN(n)) return 0;
      const asThousands = (strContext && /mil|k\b/i.test(strContext)) || n < 1000;
      return asThousands ? n * 1000 : n;
    }

    // Parse faixa de preço ANTES da query para aplicar filtro no banco
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    if (precoMin != null && precoMin !== "") {
      const n = parsePriceValue(precoMin as number | string, String(faixaPreco || ""));
      if (n > 0) minPrice = n;
    }
    if (precoMax != null && precoMax !== "") {
      const n = parsePriceValue(precoMax as number | string, String(faixaPreco || ""));
      if (n > 0) maxPrice = n;
    }
    if (faixaPreco && minPrice == null && maxPrice == null) {
      const s = String(faixaPreco).trim();
      const ateMatch = s.match(/(?:ate|até)\s*(\d+)\s*(mil)?/i);
      if (ateMatch) {
        maxPrice = parsePriceValue(ateMatch[1], ateMatch[2] || "");
      } else {
        const rangeMatch = s.match(/(?:entre\s+)?(\d+)\s*(?:a|e|até)\s*(\d+)\s*(mil)?/i) || s.match(/(\d+)\s*[-–]\s*(\d+)\s*(mil)?/i);
        if (rangeMatch) {
          minPrice = parsePriceValue(rangeMatch[1], rangeMatch[3] || "");
          maxPrice = parsePriceValue(rangeMatch[2], rangeMatch[3] || "");
        } else {
          const singleNum = s.match(/(\d+)/);
          if (singleNum) {
            const val = parsePriceValue(singleNum[1], s);
            if (val > 0) maxPrice = val;
          }
        }
      }
    }

    const PICKUP_SYNONYMS = ["camionete", "caminhonete", "picape", "pickup", "pikup"];
    const skipModelFilter = ["suv", "sedan", "hatch", ...PICKUP_SYNONYMS, ...MOTORIZACAO_KEYWORDS];
    const hasMarca = Boolean(marca?.trim());
    const hasModelo = Boolean(modelo?.trim() && !skipModelFilter.some((k) => normalizeForSearch(modelo!).includes(k)));

    // Quando há apenas um termo (marca OU modelo), buscar em brand E model (OR) para cobrir casos como Haval,
    // que pode estar em brand ou em model no inventário. Assim "tem haval?" encontra em qualquer coluna.
    // Quando há marca E modelo: buscar ambos em brand OU model, pois marcas como Haval (sub-marca da GWM)
    // podem estar em model (ex: brand=GWM, model=Haval H6). Exige que AMBOS os termos apareçam em brand+model.
    if (hasMarca && !hasModelo) {
      const term = marca!.trim();
      const orParts = [`brand.ilike.*${term}*`, `model.ilike.*${term}*`];
      query = query.or(orParts.join(","));
    } else if (hasModelo && !hasMarca) {
      const term = modelo!.trim();
      const orParts = [`brand.ilike.*${term}*`, `model.ilike.*${term}*`];
      query = query.or(orParts.join(","));
    } else if (hasMarca && hasModelo) {
      const orMarca = [`brand.ilike.*${marca!.trim()}*`, `model.ilike.*${marca!.trim()}*`].join(",");
      const orModelo = [`brand.ilike.*${modelo!.trim()}*`, `model.ilike.*${modelo!.trim()}*`].join(",");
      query = query.or(orMarca).or(orModelo);
    }
    if (ano) {
      const yearNum = typeof ano === "string" ? parseInt(ano, 10) : ano;
      if (!isNaN(yearNum)) {
        query = query.eq("year", yearNum);
      }
    }
    const cambioIsMotorizacao = cambio && MOTORIZACAO_KEYWORDS.some((k) => normalizeForSearch(cambio).includes(k));
    if (cambio && !cambioIsMotorizacao) {
      query = query.ilike("transmission", `%${cambio}%`);
    }

    // Tipo de carro: busca na coluna description (onde o tipo está) + model e version
    // PostgREST usa * como wildcard (alias de %)
    if (tipo && String(tipo).trim()) {
      const tipoNorm = normalizeForSearch(tipo);
      const termos =
        PICKUP_SYNONYMS.includes(tipoNorm)
          ? PICKUP_SYNONYMS
          : [tipoNorm];
      const orParts = termos.flatMap((t) => [
        `model.ilike.*${t}*`,
        `version.ilike.*${t}*`,
        `description.ilike.*${t}*`,
      ]);
      query = query.or(orParts.join(","));
    }

    // Motorização (turbo, TSI, etc.): filtro na query via model/version
    // Para "turbo": expandir para TSI, TFSI, TDI (motores turbo comuns)
    if (motorizacaoFinal) {
      const motNorm = normalizeForSearch(motorizacaoFinal);
      const turboPatterns =
        motNorm === "turbo" ? ["*turbo*", "*tsi*", "*tfsi*", "*tdi*"] : [`*${motNorm}*`];
      const orParts = turboPatterns.flatMap((p) => [
        `model.ilike.${p}`,
        `version.ilike.${p}`,
      ]);
      query = query.or(orParts.join(","));
    }

    // Faixa de preço na query
    if (maxPrice != null && maxPrice > 0) {
      query = query.lte("price", maxPrice);
    }
    if (minPrice != null && minPrice > 0) {
      query = query.gte("price", minPrice);
    }

    const { data: rows, error } = await query;

    if (error) {
      return { success: false, result: null, error: error.message };
    }

    let vehicles = (rows || []) as Array<{
      id: string;
      brand: string;
      model: string;
      version: string;
      year: number | null;
      price: number | null;
      mileage: number | null;
      color: string;
      transmission: string;
      photo_url: string;
      photos: string | unknown;
      detail_url: string;
      description?: string;
      video_details?: string | null;
      raw_data?: { photos?: string[]; features?: string[]; optionals?: string[] };
    }>;

    let corFallbackUsed = false;
    const corOriginal = cor;
    if (cor) {
      const synonyms = getColorSynonyms(cor);
      const colorFiltered = vehicles.filter((v) => {
        const vColorNorm = normalizeForSearch(v.color || "");
        return synonyms.some((s) => vColorNorm.includes(s) || s.includes(vColorNorm));
      });
      if (colorFiltered.length > 0) {
        vehicles = colorFiltered;
      } else if (vehicles.length > 0) {
        corFallbackUsed = true;
      } else {
        vehicles = [];
      }
    }

    // #region agent log
    fetch("http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "ad5eb6" },
      body: JSON.stringify({
        sessionId: "ad5eb6",
        location: "tool-executor.ts:executeInventoryQuery:afterColorFilter",
        message: "After color filter",
        data: { corFallbackUsed, corOriginal: cor, vehicleCount: vehicles.length, vehicleColors: vehicles.map((v) => v.color).slice(0, 10) },
        timestamp: Date.now(),
        hypothesisId: "H_COLOR_FALLBACK",
      }),
    }).catch(() => {});
    // #endregion

    const formatted = vehicles.map((v) => {
      let photos: string[] = [];
      if (v.photos) {
        if (typeof v.photos === "string") {
          try {
            photos = JSON.parse(v.photos) as string[];
          } catch {
            photos = v.photo_url ? [v.photo_url] : [];
          }
        } else if (Array.isArray(v.photos)) {
          photos = v.photos as string[];
        }
      }
      if (photos.length === 0 && v.photo_url) {
        photos = [v.photo_url];
      }

      const vehiclePhotosMarkdown = (photos.length ? photos : [v.photo_url].filter(Boolean))
        .map((url) => `![foto](${url})`)
        .join("\n");

      const fullName = [v.brand, v.model, v.version].filter(Boolean).join(" ");
      const precoFormatado =
        v.price != null ? v.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : undefined;
      const raw = v.raw_data as { features?: string[]; optionals?: string[] } | undefined;
      const features = (raw?.features ?? []).map(decodeHtmlEntities);
      const optionals = (raw?.optionals ?? []).map(decodeHtmlEntities);
      return {
        id: v.id,
        external_id: (v as { external_id?: string }).external_id,
        nome_completo: fullName.trim(),
        marca: v.brand,
        modelo: v.model,
        versao: v.version,
        ano: v.year,
        preco: v.price,
        preco_formatado: precoFormatado,
        km: v.mileage,
        cor: v.color ? decodeHtmlEntities(v.color) : v.color,
        cambio: v.transmission ? decodeHtmlEntities(v.transmission) : v.transmission,
        photo_url: v.photo_url,
        photos,
        detail_url: v.detail_url,
        photos_markdown: vehiclePhotosMarkdown || undefined,
        descricao: (() => {
          const d = v.description ? decodeHtmlEntities(v.description) : "";
          if (!d || /^(&copy;|©)\s*PPL Motors|pplmotors\.(co|com\.br)\s*$/i.test(d) || /^EMPTY$/i.test(d)) return undefined;
          return d;
        })(),
        caracteristicas: features,
        opcionais: optionals,
        video_details: v.video_details ?? null,
      };
    });

    // Um único blob só quando há 1 veículo; com 2+ veículos não enviamos blob global para evitar enviar fotos de todos
    const photosMarkdown =
      formatted.length === 1 && formatted[0].photos_markdown
        ? formatted[0].photos_markdown
        : formatted.length > 1
          ? null
          : formatted
              .flatMap((v) => (v.photos && v.photos.length ? v.photos : v.photo_url ? [v.photo_url] : []))
              .filter(Boolean)
              .map((url) => `![foto](${url})`)
              .join("\n");

    const hasVideoDetails = vehicles.some((v) => v.video_details);
    let hint: string;
    if (formatted.length > 0) {
      let baseHint =
        formatted.length > 1
          ? `ESTOQUE ATUAL (${formatted.length} veículo(s)). Cada veículo tem seu próprio bloco "Fotos do veículo ... (id: ...)" abaixo. NÃO inclua fotos agora. Liste APENAS dados em texto (modelo, ano, km, preço, cor) e pergunte se o cliente quer ver fotos. Quando o cliente PEDIR ou ACEITAR ver fotos de UM veículo, inclua na sua resposta APENAS o bloco de fotos DESSE veículo (o que tiver o id indicado em ENVIAR_FOTOS_VEICULO: nome | id: uuid) e a linha ENVIAR_FOTOS_VEICULO. Nunca inclua fotos de outros veículos.`
          : `ESTOQUE ATUAL (${formatted.length} veículo(s)). Fotos disponíveis em photos_markdown — NÃO inclua fotos agora. Liste APENAS dados em texto (modelo, ano, km, preço, cor) e pergunte se o cliente quer ver fotos. Quando o cliente PEDIR ou ACEITAR ver fotos, aí sim inclua o conteúdo de photos_markdown na resposta junto com ENVIAR_FOTOS_VEICULO.`;
      if (hasVideoDetails) {
        baseHint += ` Alguns veículos têm vídeo detalhado. Quando o cliente pedir "vídeo do carro", "tour virtual" ou similar, use ENVIAR_VIDEO_DETALHES: nome do veículo | id: uuid (apenas para veículos que tenham video_details).`;
      }
      if (corFallbackUsed && corOriginal) {
        const availableColors = [...new Set(formatted.map((v) => v.cor).filter(Boolean))];
        hint = `${baseHint}\nNOTA: O cliente pediu na cor "${corOriginal}", mas não temos nessa cor exata. Temos o mesmo modelo nas cores: ${availableColors.join(", ")}. Informe o cliente que não há na cor "${corOriginal}" mas apresente as opções disponíveis com entusiasmo.`;
      } else {
        hint = baseHint;
      }
    } else {
      hint = "Nenhum veículo encontrado com os filtros informados.";
    }

    // #region agent log
    fetch('http://127.0.0.1:7548/ingest/03d040d2-be13-440a-b98b-a3afe43b18d4',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ad5eb6'},body:JSON.stringify({sessionId:'ad5eb6',location:'tool-executor.ts:consultar_estoque_result',message:'photos_markdown: global vs per-vehicle',data:{vehicleCount:formatted.length,hasGlobalPhotosMarkdown:!!photosMarkdown,perVehiclePhotosMarkdown:formatted.map(v=>({id:v.id,hasMarkdown:!!v.photos_markdown}))},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    return {
      success: true,
      result: {
        vehicles: formatted,
        total: formatted.length,
        ...(photosMarkdown && { photos_markdown: photosMarkdown }),
        _hint: hint,
      },
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, result: null, error: err?.message || "Inventory query failed" };
  }
}

async function executeFipeQuery(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  try {
    const fipeArgs: Record<string, unknown> = {};
    if (args.marca || args.brand) fipeArgs.marca = args.marca || args.brand;
    if (args.modelo || args.model) fipeArgs.modelo = args.modelo || args.model;
    if (args.ano || args.year) fipeArgs.ano = args.ano || args.year;
    if (args.codigo_fipe) fipeArgs.codigo_fipe = args.codigo_fipe;
    if (args.tipo) fipeArgs.tipo = args.tipo;

    const data = await runFipeQuery(fipeArgs);
    return { success: true, result: data };
  } catch (e: unknown) {
    const err = e as { message?: string; status?: number };
    return {
      success: false,
      result: null,
      error: err?.message || "FIPE query failed",
    };
  }
}

async function executeOmnibeesAvailability(
  supabase: ReturnType<typeof createNexusClient>,
  tool: ToolDef,
  args: Record<string, unknown>,
  agentId: string
): Promise<ToolExecutionResult> {
  try {
    if (tool.tenant_id) {
      const { data: agent } = await supabase.from("agents").select("tenant_id").eq("id", agentId).maybeSingle();
      if (agent?.tenant_id && agent.tenant_id !== tool.tenant_id) {
        return {
          success: false,
          result: null,
          error: "Ferramenta não autorizada para o tenant deste agente.",
        };
      }
    }
    const checkIn = args.checkIn ?? args.check_in ?? args.CheckIn;
    const checkOut = args.checkOut ?? args.check_out ?? args.CheckOut;
    if (checkIn == null || checkOut == null || String(checkIn).trim() === "" || String(checkOut).trim() === "") {
      return { success: false, result: null, error: "Parâmetros checkIn e checkOut são obrigatórios." };
    }
    const childAgesRaw = args.childAges ?? args.child_ages ?? args.ag;
    const data = await runOmnibeesAvailabilityQuery(
      {
        checkIn: String(checkIn),
        checkOut: String(checkOut),
        adults: args.adults != null ? Number(args.adults) : undefined,
        children: args.children != null ? Number(args.children) : undefined,
        childAges: childAgesRaw != null ? String(childAgesRaw) : undefined,
        rooms: args.rooms != null ? Number(args.rooms) : args.NRooms != null ? Number(args.NRooms) : undefined,
      },
      (tool.execution_config || null) as Record<string, unknown> | null
    );
    return {
      success: true,
      result: {
        summaryText: data.summaryText,
        bookingUrl: data.bookingUrl,
        hotel: data.hotel,
        checkIn: data.checkIn,
        checkOut: data.checkOut,
        checkInTime: data.checkInTime,
        checkOutTime: data.checkOutTime,
        nights: data.nights,
        adults: data.adults,
        children: data.children,
        rooms: data.rooms,
      },
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, result: null, error: err?.message || "Consulta Omnibees falhou" };
  }
}


/**
 * Preserva o horário local ao salvar no banco.
 * Se vem "2026-03-09T09:00:00-03:00", salva "2026-03-09T09:00:00" (sem offset) — o calendário exibe 09:00.
 * Evita que toISOString() converta para UTC (+3h no caso de BRT).
 */
function toLocalIso(startAt: string, durationMin: number): { start: string; end: string } {
  const offsetMatch = startAt.match(/([+-]\d{2}):?(\d{2})$/);
  let localStr: string;
  if (offsetMatch) {
    localStr = startAt.replace(/([+-]\d{2}):?(\d{2})$/, "");
  } else if (startAt.endsWith("Z")) {
    localStr = startAt.replace("Z", "");
  } else {
    localStr = startAt.includes("T") ? startAt : `${startAt}T09:00:00`;
  }
  if (!localStr.includes("T")) localStr += "T09:00:00";
  const parts = localStr.split("T");
  const datePart = parts[0];
  const timePart = parts[1] || "09:00:00";
  const [hh, mm, ss] = timePart.split(":").map(Number);
  const totalMinEnd = (hh || 0) * 60 + (mm || 0) + durationMin;
  const endH = Math.floor(totalMinEnd / 60) % 24;
  const endM = totalMinEnd % 60;
  const startIso = `${datePart}T${String(hh || 0).padStart(2, "0")}:${String(mm || 0).padStart(2, "0")}:${String(ss || 0).padStart(2, "0")}`;
  const endIso = `${datePart}T${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}:00`;
  return { start: startIso, end: endIso };
}

/**
 * Resolve working hours for a specific day of week.
 * Uses calendar's working_hours if configured, otherwise falls back to defaults.
 */
function resolveWorkingHours(
  calendarWorkingHours: Record<string, unknown> | null | undefined,
  dayOfWeek: number // 0=Sun, 1=Mon, ..., 6=Sat
): { enabled: boolean; startH: number; endH: number } {
  const DAY_INDEX_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
  const key = DAY_INDEX_TO_KEY[dayOfWeek];

  if (calendarWorkingHours && typeof calendarWorkingHours === "object" && key in calendarWorkingHours) {
    const day = (calendarWorkingHours as Record<string, any>)[key] as {
      enabled?: boolean;
      start?: string;
      end?: string;
    };
    if (!day.enabled) {
      return { enabled: false, startH: 0, endH: 0 };
    }
    const [sh, sm] = (day.start || "09:00").split(":").map(Number);
    const [eh, em] = (day.end || "18:00").split(":").map(Number);
    return { enabled: true, startH: sh + sm / 60, endH: eh + em / 60 };
  }

  // Fallback: hardcoded defaults (preserves current behavior)
  if (dayOfWeek === 0) return { enabled: false, startH: 0, endH: 0 }; // Sunday closed
  if (dayOfWeek === 6) return { enabled: true, startH: 9, endH: 13 }; // Saturday 9-13
  return { enabled: true, startH: 9, endH: 18.5 }; // Mon-Fri 9-18:30
}

async function executeCalendarQuery(
  supabase: ReturnType<typeof createNexusClient>,
  tool: { tenant_id?: string; execution_config?: Record<string, unknown> },
  args: Record<string, unknown>,
  agentId: string
): Promise<ToolExecutionResult> {
  try {
    let tenantId = tool.tenant_id;
    if (!tenantId && agentId) {
      const { data: agent } = await supabase
        .from("agents")
        .select("tenant_id")
        .eq("id", agentId)
        .single();
      tenantId = agent?.tenant_id ?? undefined;
    }
    if (!tenantId) {
      return { success: false, result: null, error: "tenant_id não disponível (configure na ferramenta ou no agente)" };
    }

    const calendarArgs: Record<string, unknown> = { ...args, tenant_id: tenantId };
    const action = (calendarArgs.action || "check_availability") as string;

    if (action === "check_availability") {
      // Compute today's date in BRT (UTC-3), not UTC
      const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
      const todayBRT = new Date(Date.now() - BRT_OFFSET_MS).toISOString().slice(0, 10);
      const date = (calendarArgs.date as string) || todayBRT;
      const daysAhead = (calendarArgs.days_ahead as number) || 3;
      const slotDuration = (calendarArgs.slot_duration_minutes as number) || 60;

      const { data: calendars, error: calErr } = await supabase
        .from("calendars")
        .select("*")
        .eq("tenant_id", tenantId)
        .limit(10);

      if (calErr) {
        return { success: false, result: null, error: calErr.message };
      }
      if (!calendars || calendars.length === 0) {
        return {
          success: true,
          result: { error: "No calendars found", tenant_id: tenantId },
        };
      }

      // Parse date as BRT midnight (not UTC)
      const startDate = new Date(`${date}T00:00:00-03:00`);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + daysAhead);

      const calendarIds = calendars.map((c: { id: string }) => c.id);
      // Busca eventos que INTERSECTAM o período (não apenas os que começam dentro)
      const { data: events, error: evErr } = await supabase
        .from("calendar_events")
        .select("*")
        .in("calendar_id", calendarIds)
        .lt("start_at", endDate.toISOString())
        .gt("end_at", startDate.toISOString())
        .order("start_at", { ascending: true });

      const availableSlots: Record<string, string[]> = {};
      const nowMs = Date.now();

      for (let d = 0; d < daysAhead; d++) {
        const current = new Date(startDate);
        current.setDate(current.getDate() + d);
        const dayOfWeek = current.getDay();

        // Resolve working hours for this day (use calendar's config if available)
        const workingHours = resolveWorkingHours(calendars[0]?.working_hours, dayOfWeek);
        if (!workingHours.enabled) continue; // Day is closed

        const businessStart = workingHours.startH;
        const businessEnd = workingHours.endH;

        // dayStr em BRT: subtrai 3h para obter a data local do negócio
        const brtDate = new Date(current.getTime() - BRT_OFFSET_MS);
        const dayStr = brtDate.toISOString().slice(0, 10);

        // Filtra eventos pelo dia BRT (slice dos 10 primeiros chars do start_at em BRT)
        const dayEvents = (events || []).filter((e: { start_at?: string }) => {
          if (!e.start_at) return false;
          const evBrt = new Date(new Date(e.start_at).getTime() - BRT_OFFSET_MS);
          return evBrt.toISOString().slice(0, 10) === dayStr;
        });
        const slots: string[] = [];

        for (let h = businessStart; h < businessEnd; h++) {
          for (let m = 0; m < 60; m += slotDuration) {
            if (h + m / 60 >= businessEnd) break;
            // Cria slotStart com offset BRT explícito para comparar corretamente com eventos UTC
            const slotStart = new Date(
              `${dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`
            );
            const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

            // Skip past slots (only relevant for today)
            if (dayStr === todayBRT && slotStart.getTime() <= nowMs) continue;

            const conflict = dayEvents.some((ev: { start_at?: string; end_at?: string }) => {
              const evStart = new Date(ev.start_at || 0).getTime();
              const evEnd = new Date(ev.end_at || 0).getTime();
              return slotStart.getTime() < evEnd && slotEnd.getTime() > evStart;
            });

            if (!conflict) {
              slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
            }
          }
        }
        availableSlots[dayStr] = slots;
      }

      return {
        success: true,
        result: {
          action: "check_availability",
          available_slots: availableSlots,
          date_range: { from: date, to: new Date(endDate.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10) },
          note: evErr ? `Warning: ${evErr.message}` : undefined,
        },
      };
    }

    if (action === "criar" || action === "create") {
      const title = String(calendarArgs.title || calendarArgs.titulo || "").trim();
      const startAtRaw = calendarArgs.start_at ?? calendarArgs.start ?? calendarArgs.date_time;
      const startAt = typeof startAtRaw === "string" ? startAtRaw.trim() : "";

      if (!title) {
        console.warn("[Tool] consultar_agenda criar: falta title/titulo. Recebido:", Object.keys(calendarArgs).filter((k) => k !== "tenant_id").join(", "));
        return { success: false, result: null, error: "Falta o título do agendamento (title ou titulo). Ex.: title=\"Visita - Nome do cliente\"." };
      }
      if (!startAt) {
        console.warn("[Tool] consultar_agenda criar: falta start_at. Recebido:", Object.keys(calendarArgs).filter((k) => k !== "tenant_id").join(", "));
        return { success: false, result: null, error: "Falta data/hora de início (start_at). Use formato ISO: YYYY-MM-DDTHH:mm:ss ou YYYY-MM-DDTHH:mm:ss-03:00. Ex.: start_at=\"2026-03-09T13:00:00-03:00\"." };
      }

      const normalized = startAt.includes("T") ? startAt : `${startAt}T09:00:00`;
      const startDt = new Date(normalized);
      if (Number.isNaN(startDt.getTime())) {
        return { success: false, result: null, error: `Data/hora inválida: "${startAt.slice(0, 30)}...". Use formato: YYYY-MM-DDTHH:mm:ss ou YYYY-MM-DDTHH:mm:ss-03:00.` };
      }
      const now = new Date();
      if (startDt.getTime() < now.getTime() - 60000) {
        return { success: false, result: null, error: `Data/hora no passado (${startDt.toISOString().slice(0, 16)}). Use uma data e horário futuros no formato YYYY-MM-DDTHH:mm:ss-03:00.` };
      }

      let durationMin = (calendarArgs.duration_minutes as number) || 0;

      // Fallback: buscar duração do banco pelo nome do serviço quando não informado pelo agente
      if (!durationMin && calendarArgs.tenant_id) {
        const serviceName = (calendarArgs.procedure_type as string) || title;
        const { data: svcMatch } = await supabase
          .from("calendar_service_types")
          .select("duration_minutes")
          .eq("tenant_id", calendarArgs.tenant_id)
          .eq("active", true)
          .ilike("name", `%${serviceName.split("—")[0].split("-")[0].trim()}%`)
          .limit(1)
          .maybeSingle();
        durationMin = svcMatch?.duration_minutes || 60;
      }

      const { data: cals } = await supabase
        .from("calendars")
        .select("id")
        .eq("tenant_id", calendarArgs.tenant_id)
        .limit(1);

      const calendarId = (calendarArgs.calendar_id as string) || cals?.[0]?.id;
      if (!calendarId) {
        return { success: false, result: null, error: "No calendar found" };
      }

      const localIso = toLocalIso(startAt, durationMin);
      const startAtBR = localIso.start + "-03:00";
      const endAtBR = localIso.end + "-03:00";

      const { data: conflicting } = await supabase
        .from("calendar_events")
        .select("id, title, start_at")
        .eq("calendar_id", calendarId)
        .lt("start_at", endAtBR)
        .gt("end_at", startAtBR);
      if (conflicting && conflicting.length > 0) {
        return {
          success: false,
          result: null,
          error: "Horário já ocupado. Use check_availability para ver slots livres.",
        };
      }

      // Build metadata from optional procedure fields
      const procedureType = calendarArgs.procedure_type as string | undefined;
      const professionalName = calendarArgs.professional_name as string | undefined;
      const patientNotes = calendarArgs.patient_notes as string | undefined;
      const contactId = calendarArgs.contact_id as string | undefined;

      const metadata: Record<string, unknown> = {};
      if (procedureType) metadata.procedure_type = procedureType;
      if (professionalName) metadata.professional_name = professionalName;
      if (calendarArgs.duration_minutes) metadata.duration_minutes = calendarArgs.duration_minutes;
      if (patientNotes) metadata.patient_notes = patientNotes;

      const { data: created, error: insErr } = await supabase
        .from("calendar_events")
        .insert({
          calendar_id: calendarId,
          tenant_id: calendarArgs.tenant_id,
          title,
          start_at: startAtBR,
          end_at: endAtBR,
          ...(Object.keys(metadata).length > 0 && { metadata }),
          ...(contactId && { contact_id: contactId }),
        })
        .select()
        .maybeSingle();

      if (insErr) {
        return { success: false, result: null, error: insErr.message };
      }
      const telefoneCliente = calendarArgs.telefone_cliente != null ? String(calendarArgs.telefone_cliente).trim() : undefined;
      const veiculoInteresse = calendarArgs.veiculo_interesse != null ? String(calendarArgs.veiculo_interesse).trim() : undefined;
      return {
        success: true,
        result: {
          action: "created",
          event: created,
          ...(telefoneCliente && { telefone_cliente: telefoneCliente }),
          ...(veiculoInteresse && { veiculo_interesse: veiculoInteresse }),
        },
      };
    }

    if (action === "reagendar" || action === "reschedule") {
      const startAtRaw = calendarArgs.start_at ?? calendarArgs.start ?? calendarArgs.date_time;
      const clientName = String(calendarArgs.client_name || calendarArgs.titulo || calendarArgs.title || "").trim().toLowerCase();
      const eventId = calendarArgs.event_id as string | undefined;
      const newStartAtRaw = calendarArgs.new_start_at ?? calendarArgs.new_start;
      const newStartAt = typeof newStartAtRaw === "string" ? newStartAtRaw.trim() : "";

      if (!newStartAt) {
        return {
          success: false,
          result: null,
          error: "Falta nova data/hora (new_start_at). Use formato ISO: YYYY-MM-DDTHH:mm:ss ou YYYY-MM-DDTHH:mm:ss-03:00.",
        };
      }

      // Find old event
      const { data: calendarsForReschedule } = await supabase
        .from("calendars")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(10);
      const calendarIds = (calendarsForReschedule || []).map((c: { id: string }) => c.id);
      if (calendarIds.length === 0) {
        return { success: false, result: null, error: "No calendars found for tenant" };
      }

      let matchedEvent: {
        id: string;
        title?: string;
        start_at?: string;
        end_at?: string;
        calendar_id?: string;
      } | null = null;

      // Try to find by event_id first
      if (eventId) {
        const { data } = await supabase
          .from("calendar_events")
          .select("id, title, start_at, end_at, calendar_id")
          .eq("id", eventId)
          .in("calendar_id", calendarIds)
          .maybeSingle();
        matchedEvent = data;
      }

      // Try to find by start_at + client_name
      if (!matchedEvent && startAtRaw) {
        const startStr = typeof startAtRaw === "string" ? startAtRaw.trim() : "";
        if (startStr) {
          const localStart = toLocalIso(startStr, 0).start;
          const startDate = localStart.slice(0, 10);
          const startHour = localStart.slice(11, 16);
          const { data: dayEvents } = await supabase
            .from("calendar_events")
            .select("id, title, start_at, end_at, calendar_id")
            .in("calendar_id", calendarIds)
            .gte("start_at", `${startDate}T00:00:00`)
            .lte("start_at", `${startDate}T23:59:59`)
            .order("start_at", { ascending: true });

          if (dayEvents && dayEvents.length > 0) {
            matchedEvent = dayEvents.find((e: any) => {
              const evHour = (e.start_at || "").slice(11, 16);
              if (evHour === startHour) return true;
              if (clientName && (e.title || "").toLowerCase().includes(clientName)) return true;
              return false;
            }) || null;
            if (!matchedEvent && clientName) {
              matchedEvent = dayEvents.find((e: any) =>
                (e.title || "").toLowerCase().includes(clientName)
              ) || null;
            }
          }
        }
      }

      if (!matchedEvent) {
        return {
          success: false,
          result: null,
          error: "Evento não encontrado na agenda. Informe start_at (data/hora do agendamento atual) ou event_id para remarcar.",
        };
      }

      // Validate new datetime
      const normalized = newStartAt.includes("T") ? newStartAt : `${newStartAt}T09:00:00`;
      const newStartDt = new Date(normalized);
      if (Number.isNaN(newStartDt.getTime())) {
        return {
          success: false,
          result: null,
          error: `Nova data/hora inválida: "${newStartAt.slice(0, 30)}...". Use formato: YYYY-MM-DDTHH:mm:ss ou YYYY-MM-DDTHH:mm:ss-03:00.`,
        };
      }
      const now = new Date();
      if (newStartDt.getTime() < now.getTime() - 60000) {
        return {
          success: false,
          result: null,
          error: `Nova data/hora no passado (${newStartDt.toISOString().slice(0, 16)}). Use uma data e horário futuros.`,
        };
      }

      // Calculate duration from old event
      const oldStart = new Date(matchedEvent.start_at || "");
      const oldEnd = new Date(matchedEvent.end_at || "");
      const durationMs = oldEnd.getTime() - oldStart.getTime();
      const durationMin = Math.round(durationMs / 60000) || 60;

      const localIso = toLocalIso(newStartAt, durationMin);
      const newStartAtBR = localIso.start + "-03:00";
      const newEndAtBR = localIso.end + "-03:00";

      // Check for conflicts (excluding this event)
      const { data: conflicting } = await supabase
        .from("calendar_events")
        .select("id, title, start_at")
        .eq("calendar_id", matchedEvent.calendar_id)
        .neq("id", matchedEvent.id)
        .lt("start_at", newEndAtBR)
        .gt("end_at", newStartAtBR);

      if (conflicting && conflicting.length > 0) {
        return {
          success: false,
          result: null,
          error: "Novo horário já está ocupado. Use check_availability para ver slots livres.",
        };
      }

      // Update event in place
      const { data: updated, error: updateErr } = await supabase
        .from("calendar_events")
        .update({ start_at: newStartAtBR, end_at: newEndAtBR })
        .eq("id", matchedEvent.id)
        .select()
        .maybeSingle();

      if (updateErr) {
        return { success: false, result: null, error: updateErr.message };
      }

      // Update appointment reminders if they exist
      const { data: reminders } = await supabase
        .from("appointment_reminders")
        .select("id, remind_at")
        .eq("calendar_event_id", matchedEvent.id);

      if (reminders && reminders.length > 0) {
        // Recalculate remind_at based on new start_at (e.g., 24h before)
        const newStartDate = new Date(newStartAtBR);
        const remindTime = new Date(newStartDate.getTime() - 24 * 60 * 60 * 1000); // 24h before

        const { error: reminderUpdateErr } = await supabase
          .from("appointment_reminders")
          .update({ event_start_at: newStartAtBR, remind_at: remindTime.toISOString() })
          .eq("calendar_event_id", matchedEvent.id);

        if (reminderUpdateErr) {
          console.warn("[Tool] Failed to update appointment reminders:", reminderUpdateErr.message);
        }
      }

      console.log(
        "[Tool] consultar_agenda reagendar: evento remarcado",
        matchedEvent.id,
        "de",
        matchedEvent.start_at,
        "para",
        newStartAtBR
      );

      return {
        success: true,
        result: {
          action: "rescheduled",
          old_start_at: matchedEvent.start_at,
          event: updated,
        },
      };
    }

    if (action === "listar_eventos" || action === "list_events") {
      const clientName = String(calendarArgs.client_name || calendarArgs.titulo || calendarArgs.title || "").trim().toLowerCase();

      if (!clientName) {
        return {
          success: false,
          result: null,
          error: "Falta client_name para buscar agendamentos. Informe o nome do cliente.",
        };
      }

      const { data: calendars } = await supabase
        .from("calendars")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(10);

      const calendarIds = (calendars || []).map((c: { id: string }) => c.id);
      if (calendarIds.length === 0) {
        return {
          success: true,
          result: {
            action: "list_events",
            events: [],
            note: "No calendars found for tenant",
          },
        };
      }

      const today = new Date().toISOString().slice(0, 10);
      let { data: events, error: evErr } = await supabase
        .from("calendar_events")
        .select("id, title, start_at, end_at")
        .in("calendar_id", calendarIds)
        .gte("start_at", `${today}T00:00:00`)
        .ilike("title", `%${clientName}%`)
        .order("start_at", { ascending: true })
        .limit(20);

      if (evErr) {
        return {
          success: false,
          result: null,
          error: evErr.message,
        };
      }

      if (!events || events.length === 0) {
        // Fallback: busca todos os eventos futuros e filtra em JS
        // (mesmo padrão usado pela action "cancelar")
        const { data: allFuture } = await supabase
          .from("calendar_events")
          .select("id, title, start_at, end_at")
          .in("calendar_id", calendarIds)
          .gte("start_at", `${today}T00:00:00`)
          .order("start_at", { ascending: true })
          .limit(50);

        const matched = (allFuture || []).filter((e: any) =>
          (e.title || "").toLowerCase().includes(clientName)
        );

        if (matched.length === 0) {
          return {
            success: true,
            result: {
              action: "list_events",
              events: [],
              note: `Nenhum agendamento futuro encontrado para "${clientName}".`,
            },
          };
        }

        events = matched;
      }

      const formattedEvents = events.map((e: any) => ({
        event_id: e.id,
        title: e.title,
        start_at: e.start_at,
        end_at: e.end_at,
      }));

      return {
        success: true,
        result: {
          action: "list_events",
          events: formattedEvents,
          count: formattedEvents.length,
        },
      };
    }

    if (action === "cancelar" || action === "cancel" || action === "delete") {
      const startAtRaw = calendarArgs.start_at ?? calendarArgs.start ?? calendarArgs.date_time;
      const clientName = String(calendarArgs.client_name || calendarArgs.titulo || calendarArgs.title || "").trim().toLowerCase();
      const eventId = calendarArgs.event_id as string | undefined;

      const { data: calendars } = await supabase
        .from("calendars")
        .select("id")
        .eq("tenant_id", tenantId)
        .limit(10);
      const calendarIds = (calendars || []).map((c: { id: string }) => c.id);
      if (calendarIds.length === 0) {
        return { success: false, result: null, error: "No calendars found for tenant" };
      }

      let matchedEvent: { id: string; title?: string; start_at?: string } | null = null;

      if (eventId) {
        const { data } = await supabase
          .from("calendar_events")
          .select("id, title, start_at")
          .eq("id", eventId)
          .in("calendar_id", calendarIds)
          .maybeSingle();
        matchedEvent = data;
      }

      if (!matchedEvent && startAtRaw) {
        const startStr = typeof startAtRaw === "string" ? startAtRaw.trim() : "";
        if (startStr) {
          const localStart = toLocalIso(startStr, 0).start;
          const startDate = localStart.slice(0, 10);
          const startHour = localStart.slice(11, 16);
          const { data: dayEvents } = await supabase
            .from("calendar_events")
            .select("id, title, start_at")
            .in("calendar_id", calendarIds)
            .gte("start_at", `${startDate}T00:00:00`)
            .lte("start_at", `${startDate}T23:59:59`)
            .order("start_at", { ascending: true });

          if (dayEvents && dayEvents.length > 0) {
            matchedEvent = dayEvents.find((e: { start_at?: string; title?: string }) => {
              const evHour = (e.start_at || "").slice(11, 16);
              if (evHour === startHour) return true;
              if (clientName && (e.title || "").toLowerCase().includes(clientName)) return true;
              return false;
            }) || null;
            if (!matchedEvent && clientName) {
              matchedEvent = dayEvents.find((e: { title?: string }) =>
                (e.title || "").toLowerCase().includes(clientName)
              ) || null;
            }
          }
        }
      }

      if (!matchedEvent && clientName) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: futureEvents } = await supabase
          .from("calendar_events")
          .select("id, title, start_at")
          .in("calendar_id", calendarIds)
          .gte("start_at", `${today}T00:00:00`)
          .order("start_at", { ascending: true })
          .limit(50);
        if (futureEvents) {
          matchedEvent = futureEvents.find((e: { title?: string }) =>
            (e.title || "").toLowerCase().includes(clientName)
          ) || null;
        }
      }

      if (!matchedEvent) {
        console.warn("[Tool] consultar_agenda cancelar: evento não encontrado. Args:", JSON.stringify({ startAtRaw, clientName, eventId }));
        return { success: false, result: null, error: "Evento não encontrado na agenda. Informe start_at (data/hora exata do agendamento) ou event_id para cancelar." };
      }

      const { error: delErr } = await supabase
        .from("calendar_events")
        .delete()
        .eq("id", matchedEvent.id);

      if (delErr) {
        return { success: false, result: null, error: delErr.message };
      }
      console.log("[Tool] consultar_agenda cancelar: removido evento", matchedEvent.id, matchedEvent.title, matchedEvent.start_at);
      return { success: true, result: { action: "cancelled", deleted_event: matchedEvent } };
    }

    return {
      success: false,
      result: null,
      error: `Unknown calendar action: ${action}`,
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, result: null, error: err?.message || "Calendar query failed" };
  }
}

async function executeNearestUnit(args: Record<string, unknown>): Promise<ToolExecutionResult> {
  try {
    const cep = (args.cep as string) || "";
    const tenantId = args.tenant_id as string | undefined;

    if (!cep) {
      return { success: false, result: null, error: "CEP é obrigatório" };
    }

    const result = await runFindNearestUnit(
      cep,
      tenantId,
      process.env.NEXUS_DB_URL,
      process.env.NEXUS_DB_ANON_KEY,
      process.env.GOOGLE_MAPS_API_KEY
    );
    return { success: true, result };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, result: null, error: err?.message || "Nearest unit query failed" };
  }
}

async function executeMarcarLead(
  supabase: ReturnType<typeof createNexusClient>,
  args: Record<string, unknown>,
  agentId: string
): Promise<ToolExecutionResult> {
  try {
    const { data: agentCfgRow } = await supabase
      .from("agents")
      .select("config")
      .eq("id", agentId)
      .single();
    const agCfg = (agentCfgRow?.config || {}) as Record<string, unknown>;

    if (!agCfg.lead_label_enabled) {
      return {
        success: false,
        result: null,
        error: "Etiquetagem de lead não está habilitada neste agente",
      };
    }

    const cwUrl = agCfg.chatwoot_url as string | undefined;
    const cwToken = agCfg.chatwoot_api_token as string | undefined;
    const cwAccountId = agCfg.chatwoot_account_id as string | number | undefined;

    if (!cwUrl || !cwToken || !cwAccountId) {
      return {
        success: false,
        result: null,
        error: "Chatwoot não configurado neste agente",
      };
    }

    let cwConvId: number | null = null;
    if (args?.chatwoot_conversation_id != null) {
      cwConvId = Number(args.chatwoot_conversation_id);
    }
    if (cwConvId == null && args?.conversation_id) {
      const { data: convRow } = await supabase
        .from("conversations")
        .select("chatwoot_conversation_id")
        .eq("agent_id", agentId)
        .eq("id", args.conversation_id)
        .single();
      cwConvId = convRow?.chatwoot_conversation_id != null ? Number(convRow.chatwoot_conversation_id) : null;
    }
    if (cwConvId == null) {
      const { data: cwConvRows } = await supabase
        .from("conversations")
        .select("chatwoot_conversation_id")
        .eq("agent_id", agentId)
        .not("chatwoot_conversation_id", "is", null)
        .order("started_at", { ascending: false })
        .limit(1);
      cwConvId = cwConvRows?.[0]?.chatwoot_conversation_id != null ? Number(cwConvRows[0].chatwoot_conversation_id) : null;
    }

    if (cwConvId == null) {
      return {
        success: false,
        result: null,
        error: "chatwoot_conversation_id é obrigatório. A conversa precisa estar vinculada ao Chatwoot.",
      };
    }

    const labelTitle = await addLeadLabelToConversation(
      {
        chatwoot_url: cwUrl,
        chatwoot_api_token: cwToken,
        chatwoot_account_id: cwAccountId,
      },
      cwConvId
    );

    let convId: string | null = (args.conversation_id as string) ?? null;
    if (!convId) {
      const { data: convRow } = await supabase
        .from("conversations")
        .select("id")
        .eq("agent_id", agentId)
        .eq("chatwoot_conversation_id", cwConvId)
        .single();
      convId = convRow?.id ?? null;
    }
    if (convId) {
      await supabase.rpc("append_conversation_label", {
        p_agent_id: agentId,
        p_conversation_id: convId,
        p_label: labelTitle,
      });
    }

    return {
      success: true,
      result: { message: "Lead etiquetado com sucesso" },
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, result: null, error: err?.message || "Falha ao etiquetar lead" };
  }
}

async function executeChatwootAssign(
  supabase: ReturnType<typeof createNexusClient>,
  tool: ToolDef,
  args: Record<string, unknown>,
  agentId: string
): Promise<ToolExecutionResult> {
  try {
    const reason = String(args?.reason || "escalation");
    const execCfg = (tool.execution_config || {}) as Record<string, unknown>;
    const rules = Array.isArray(execCfg.rules) ? execCfg.rules : [] as Array<{ label?: string; assignee_id?: number; team_id?: number }>;

    let assigneeId = (args?.assignee_id != null ? Number(args.assignee_id) : null) ?? (execCfg.assignee_id != null ? Number(execCfg.assignee_id) : null);
    let teamId = (args?.team_id != null ? Number(args.team_id) : null) ?? (execCfg.team_id != null ? Number(execCfg.team_id) : null);
    let matchedRule = "";

    // Sempre tentar casar regras quando existirem — permite reconhecer unidade específica (ex: "unidade aparecidinha") mesmo com assignee padrão
    if (rules.length > 0) {
      const reasonNorm = reason
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      let bestScore = 0;
      for (const rule of rules) {
        if (!rule.label) continue;
        const labelNorm = (rule.label as string)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const FUZZY_STOPWORDS = new Set(["unidade", "para", "com", "que", "uma"]);
        const tokens = labelNorm.split(/\s+/).filter((t: string) => t.length >= 3 && !FUZZY_STOPWORDS.has(t));
        const score = tokens.reduce(
          (acc: number, tok: string) => acc + (reasonNorm.includes(tok) ? 1 : 0),
          0
        );
        if (score > bestScore) {
          bestScore = score;
          assigneeId = rule.assignee_id ?? assigneeId;
          teamId = rule.team_id ?? teamId;
          matchedRule = rule.label;
        }
      }
    }

    // Quando não há assignee_id, team_id é essencial para atribuir ao time (Chatwoot aceita só team_id)
    if (assigneeId == null && teamId == null) {
      return {
        success: false,
        result: null,
        error:
          "Configure assignee_id ou team_id na ferramenta (Padrão ou Regras). Sem assignee, o team_id é obrigatório para atribuir ao time.",
      };
    }

    const { data: agentCfgRow } = await supabase
      .from("agents")
      .select("config")
      .eq("id", agentId)
      .single();
    const agCfg = (agentCfgRow?.config || {}) as Record<string, unknown>;
    const cwUrl = agCfg.chatwoot_url as string | undefined;
    const cwToken = agCfg.chatwoot_api_token as string | undefined;
    const cwAccountId = agCfg.chatwoot_account_id as string | number | undefined;

    if (!cwUrl || !cwToken || !cwAccountId) {
      return {
        success: false,
        result: null,
        error: "Chatwoot não configurado neste agente",
      };
    }

    let cwConvId: number | null = null;
    if (args?.chatwoot_conversation_id != null) {
      cwConvId = Number(args.chatwoot_conversation_id);
    }
    if (cwConvId == null && args?.conversation_id) {
      const { data: convRow } = await supabase
        .from("conversations")
        .select("chatwoot_conversation_id")
        .eq("agent_id", agentId)
        .eq("id", args.conversation_id)
        .single();
      cwConvId = convRow?.chatwoot_conversation_id != null ? Number(convRow.chatwoot_conversation_id) : null;
    }
    if (cwConvId == null) {
      const { data: cwConvRows } = await supabase
        .from("conversations")
        .select("chatwoot_conversation_id")
        .eq("agent_id", agentId)
        .not("chatwoot_conversation_id", "is", null)
        .order("started_at", { ascending: false })
        .limit(1);
      cwConvId = cwConvRows?.[0]?.chatwoot_conversation_id != null ? Number(cwConvRows[0].chatwoot_conversation_id) : null;
    }

    if (cwConvId == null) {
      return {
        success: false,
        result: null,
        error: "chatwoot_conversation_id é obrigatório. A conversa precisa estar vinculada ao Chatwoot.",
      };
    }

    // A atribuição é feita pelo delivery APÓS o envio da mensagem, para evitar que o Chatwoot
    // desvincule o agente humano quando a IA envia a resposta. Retornamos assignee_id/team_id
    // para o chat-local repassar ao delivery.
    return {
      success: true,
      result: {
        status: "deferred",
        chatwoot_conversation_id: cwConvId,
        assignee_id: assigneeId ?? null,
        team_id: teamId ?? null,
        matched_rule: matchedRule || null,
      },
    };
  } catch (e: unknown) {
    const err = e as Error;
    return { success: false, result: null, error: err?.message || "Chatwoot assign failed" };
  }
}

export interface ToolDef {
  id: string;
  name: string;
  tool_type: string;
  tenant_id?: string;
  execution_config?: Record<string, unknown>;
  function_def?: Record<string, unknown>;
}

export async function executeTool(
  tool: ToolDef,
  args: Record<string, unknown>,
  agentId: string
): Promise<ToolExecutionResult> {
  const supabase = createNexusClient();

  const fnName = (tool.function_def as Record<string, unknown>)?.name as string;
  const isEnviarNotificacao = /enviar[_ ]?notific(a|a[cç])[oõ]a?/i.test(fnName || "");

  switch (tool.tool_type) {
    case "inventory_query":
      return executeInventoryQuery(supabase, agentId, args);

    case "fipe_query":
      return executeFipeQuery(args);

    case "omnibees_availability":
      return executeOmnibeesAvailability(supabase, tool, args, agentId);

    case "calendar_query":
      return executeCalendarQuery(supabase, tool, args, agentId);

    case "nearest_unit":
    case "consultar_unidade":
      return executeNearestUnit(args);

    case "chatwoot_assign":
      return executeChatwootAssign(supabase, tool, args, agentId);

    case "marcar_lead":
      return executeMarcarLead(supabase, args, agentId);

    case "send_notification":
      return executeSendNotification(agentId, args);

    case "rag_search":
      return executeRagSearch(supabase, tool, args, agentId);

    case "web_scraper":
    case "api_rest":
    case "sql_query":
    default:
      if (isEnviarNotificacao) {
        return executeSendNotification(agentId, args);
      }
      return {
        success: false,
        result: null,
        error: `Tool type ${tool.tool_type} not yet supported in local chat`,
      };
  }
}

async function executeSendNotification(
  agentId: string,
  args: Record<string, unknown>
): Promise<ToolExecutionResult> {
  let nome = String(args?.nome ?? args?.nome_cliente ?? args?.name ?? "").trim();
  if (!nome || /^cliente$/i.test(nome) || isBlockedAsName(nome) || containsInstitutionNameToken(nome)) {
    nome = "";
  }
  const telefone = String(
    args?.telefone ?? args?.telefone_cliente ?? args?.phone ?? args?.numero ?? ""
  ).trim();
  const motivo = String(args?.motivo ?? "").trim() || undefined;
  const message = buildHandoffNotification(nome, telefone || undefined, undefined, undefined, motivo);
  const { success, error } = await sendNotificationToGroup(agentId, message);
  if (!success) {
    return { success: false, result: null, error: error || "Falha ao enviar notificação" };
  }
  return { success: true, result: { message: "Notificação enviada com sucesso" } };
}

async function getEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurado para RAG");
  }
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: text.slice(0, 8000),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function executeRagSearch(
  supabase: ReturnType<typeof createNexusClient>,
  tool: ToolDef,
  args: Record<string, unknown>,
  agentId: string
): Promise<ToolExecutionResult> {
  try {
    const query = String(args?.query ?? args?.pergunta ?? "").trim();
    if (!query) {
      return {
        success: false,
        result: null,
        error: "Parâmetro 'query' é obrigatório para busca RAG",
      };
    }

    const execCfg = (tool.execution_config || {}) as Record<string, unknown>;
    const limit = Math.min(Math.max(Number(execCfg.limit) || 5, 1), 20);

    const embedding = await getEmbedding(query);

    const { data: rows, error } = await supabase.rpc("rag_search_chunks", {
      p_agent_id: agentId,
      p_query_embedding: embedding,
      p_limit: limit,
    });

    if (error) {
      return {
        success: false,
        result: null,
        error: `RAG search failed: ${error.message}`,
      };
    }

    const results = (rows || []).map((r: { content?: string; source_url?: string; title?: string }) => ({
      content: r.content || "",
      source_url: r.source_url || null,
      title: r.title || null,
    }));

    const textForLlm = results
      .map((r: { content?: string; source_url?: string; title?: string }, i: number) => `[${i + 1}] ${r.title ? `(${r.title}) ` : ""}${r.content}`)
      .join("\n\n---\n\n");

    return {
      success: true,
      result: {
        results,
        text: textForLlm,
      },
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      success: false,
      result: null,
      error: err?.message || "RAG search failed",
    };
  }
}
