import { createNexusClient } from "./supabase.js";
import { runFipeQuery } from "./fipe.js";
import { runFindNearestUnit } from "./find-nearest-unit.js";
import { buildHandoffNotification, isBlockedAsName } from "../utils/agendaNotification.js";
import { sendNotificationToGroup } from "../utils/sendNotification.js";

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
 * Ex: "Cruze e queria" ou "Cruze e " → "Cruze" (a conjunção "e" + resto da frase é removida).
 */
function sanitizeVehicleParam(val: string | undefined): string | undefined {
  if (val == null || typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  // Remove " e " ou " e" + resto da frase (ex: "Cruze e ", "Cruze e", "Cruze e queria")
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

    let query = supabase
      .from("inventory")
      .select("id, external_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photo_url, photos, detail_url, description, raw_data")
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
    const tipoRaw = (args.tipo || args.modelo || args.model) as string | undefined;
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
      raw_data?: { photos?: string[]; features?: string[]; optionals?: string[] };
    }>;

    let corFallbackUsed = false;
    let corOriginal = cor;
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

    let hint: string;
    if (formatted.length > 0) {
      const baseHint =
        formatted.length > 1
          ? `ESTOQUE ATUAL (${formatted.length} veículo(s)). Cada veículo tem seu próprio bloco "Fotos do veículo ... (id: ...)" abaixo. NÃO inclua fotos agora. Liste APENAS dados em texto (modelo, ano, km, preço, cor) e pergunte se o cliente quer ver fotos. Quando o cliente PEDIR ou ACEITAR ver fotos de UM veículo, inclua na sua resposta APENAS o bloco de fotos DESSE veículo (o que tiver o id indicado em ENVIAR_FOTOS_VEICULO: nome | id: uuid) e a linha ENVIAR_FOTOS_VEICULO. Nunca inclua fotos de outros veículos.`
          : `ESTOQUE ATUAL (${formatted.length} veículo(s)). Fotos disponíveis em photos_markdown — NÃO inclua fotos agora. Liste APENAS dados em texto (modelo, ano, km, preço, cor) e pergunte se o cliente quer ver fotos. Quando o cliente PEDIR ou ACEITAR ver fotos, aí sim inclua o conteúdo de photos_markdown na resposta junto com ENVIAR_FOTOS_VEICULO.`;
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
      const date = (calendarArgs.date as string) || new Date().toISOString().slice(0, 10);
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

      const startDate = new Date(date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + daysAhead);

      const calendarIds = calendars.map((c: { id: string }) => c.id);
      const { data: events, error: evErr } = await supabase
        .from("calendar_events")
        .select("*")
        .in("calendar_id", calendarIds)
        .gte("start_at", startDate.toISOString())
        .lte("start_at", endDate.toISOString())
        .order("start_at", { ascending: true });

      const availableSlots: Record<string, string[]> = {};
      for (let d = 0; d < daysAhead; d++) {
        const current = new Date(startDate);
        current.setDate(current.getDate() + d);
        const dayOfWeek = current.getDay();
        if (dayOfWeek === 0) continue; // domingo fechado

        const businessStart = 9;
        const businessEnd = dayOfWeek === 6 ? 13 : 18.5; // sab 9-13, seg-sex 9-18:30

        const dayStr = current.toISOString().slice(0, 10);
        const dayEvents = (events || []).filter(
          (e: { start_at?: string }) => e.start_at?.slice(0, 10) === dayStr
        );
        const slots: string[] = [];

        for (let h = businessStart; h < businessEnd; h++) {
          for (let m = 0; m < 60; m += slotDuration) {
            if (h + m / 60 >= businessEnd) break;
            const slotStart = new Date(
              `${dayStr}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`
            );
            const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);

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
          date_range: { from: startDate.toISOString().slice(0, 10), to: endDate.toISOString().slice(0, 10) },
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

      const durationMin = (calendarArgs.duration_minutes as number) || 60;

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

      const { data: created, error: insErr } = await supabase
        .from("calendar_events")
        .insert({
          calendar_id: calendarId,
          tenant_id: calendarArgs.tenant_id,
          title,
          start_at: startAtBR,
          end_at: endAtBR,
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
        const tokens = labelNorm.split(/\s+/).filter((t: string) => t.length >= 3);
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

    const baseUrl = (cwUrl as string).replace(/\/+$/, "");
    const assignUrl = `${baseUrl}/api/v1/accounts/${cwAccountId}/conversations/${cwConvId}/assignments`;
    const assignBody: Record<string, number> = {};
    if (assigneeId != null) assignBody.assignee_id = assigneeId;
    if (teamId != null) assignBody.team_id = teamId;

    const { getChatwootAuthHeaders } = await import("./delivery.js");
    const cwAuth = getChatwootAuthHeaders(cwToken as string, agCfg);

    const assignResp = await fetch(assignUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cwAuth },
      body: JSON.stringify(assignBody),
    });

    const assignRespText = await assignResp.text();
    if (!assignResp.ok) {
      return {
        success: false,
        result: null,
        error: `Falha na atribuição Chatwoot: ${assignResp.status} - ${assignRespText.slice(0, 200)}`,
      };
    }

    let parsedResp: unknown;
    try {
      parsedResp = JSON.parse(assignRespText);
    } catch {
      parsedResp = assignRespText;
    }

    return {
      success: true,
      result: {
        status: "atribuido",
        chatwoot_conversation_id: cwConvId,
        assignee_id: assigneeId ?? null,
        team_id: teamId ?? null,
        matched_rule: matchedRule || null,
        chatwoot_response: parsedResp,
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

    case "calendar_query":
      return executeCalendarQuery(supabase, tool, args, agentId);

    case "nearest_unit":
    case "consultar_unidade":
      return executeNearestUnit(args);

    case "chatwoot_assign":
      return executeChatwootAssign(supabase, tool, args, agentId);

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
  let nome = String(args?.nome ?? args?.nome_cliente ?? args?.name ?? "").trim() || "Cliente";
  if (isBlockedAsName(nome)) nome = "Cliente";
  const telefone = String(
    args?.telefone ?? args?.telefone_cliente ?? args?.phone ?? args?.numero ?? ""
  ).trim();
  const message = buildHandoffNotification(nome, telefone || undefined);
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
