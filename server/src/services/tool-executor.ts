import { createNexusClient } from "./supabase.js";
import { runFipeQuery } from "./fipe.js";
import { runFindNearestUnit } from "./find-nearest-unit.js";

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
      .select("id, external_id, brand, model, version, year, price, mileage, color, transmission, fuel_type, photo_url, photos, detail_url, description")
      .eq("tenant_id", tenantId)
      .eq("status", "available")
      .limit(20);

    const marca = (args.marca || args.brand) as string | undefined;
    const modelo = (args.modelo || args.model) as string | undefined;
    const cor = args.cor as string | undefined;
    const ano = args.ano as number | string | undefined;
    const faixaPreco = (args.faixa_preco || args.faixaPreco) as string | undefined;
    const precoMin = args.preco_min ?? args.precoMin;
    const precoMax = args.preco_max ?? args.precoMax;
    const tipo = (args.tipo || args.modelo || args.model) as string | undefined;
    const cambio = (args.cambio || args.transmission) as string | undefined;

    // Normaliza valor numérico: se for número pequeno (< 1000) e o texto tiver "mil", trata como milhares
    function parsePriceValue(val: number | string, strContext?: string): number {
      const n = typeof val === "string" ? parseInt(val.replace(/\D/g, ""), 10) : Number(val);
      if (Number.isNaN(n)) return 0;
      const asThousands = (strContext && /mil|k\b/i.test(strContext)) || n < 1000;
      return asThousands ? n * 1000 : n;
    }

    if (marca) {
      query = query.ilike("brand", `%${marca}%`);
    }
    if (modelo && !["suv", "sedan", "hatch", "pickup"].includes(normalizeForSearch(modelo))) {
      query = query.ilike("model", `%${modelo}%`);
    }
    if (cor) {
      query = query.ilike("color", `%${cor}%`);
    }
    if (ano) {
      const yearNum = typeof ano === "string" ? parseInt(ano, 10) : ano;
      if (!isNaN(yearNum)) {
        query = query.eq("year", yearNum);
      }
    }
    if (cambio) {
      query = query.ilike("transmission", `%${cambio}%`);
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
    }>;

    // Faixa de preço: preco_min/preco_max (numéricos) ou faixa_preco (string "até X", "X a Y", "entre X e Y mil")
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
      // "até 150000" ou "até 150 mil"
      const ateMatch = s.match(/(?:ate|até)\s*(\d+)\s*(mil)?/i);
      if (ateMatch) {
        maxPrice = parsePriceValue(ateMatch[1], ateMatch[2] || "");
      } else {
        // "100 a 130", "100 a 130 mil", "entre 100 e 130 mil"
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
    if (minPrice != null || maxPrice != null) {
      vehicles = vehicles.filter((v) => {
        if (v.price == null) return false;
        if (minPrice != null && v.price < minPrice) return false;
        if (maxPrice != null && v.price > maxPrice) return false;
        return true;
      });
    }

    if (tipo && ["suv", "sedan", "hatch", "pickup"].includes(normalizeForSearch(tipo))) {
      const tipoNorm = normalizeForSearch(tipo);
      vehicles = vehicles.filter((v) => {
        const modelNorm = normalizeForSearch(v.model);
        const versionNorm = normalizeForSearch(v.version || "");
        return modelNorm.includes(tipoNorm) || versionNorm.includes(tipoNorm);
      });
    }

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

      const fullName = [v.brand, v.model, v.version].filter(Boolean).join(" ");
      return {
        id: v.id,
        external_id: (v as { external_id?: string }).external_id,
        nome_completo: fullName.trim(),
        marca: v.brand,
        modelo: v.model,
        versao: v.version,
        ano: v.year,
        preco: v.price,
        km: v.mileage,
        cor: v.color,
        cambio: v.transmission,
        photo_url: v.photo_url,
        photos,
        detail_url: v.detail_url,
      };
    });

    const photosMarkdown = formatted
      .flatMap((v) => (v.photos && v.photos.length ? v.photos : v.photo_url ? [v.photo_url] : []))
      .filter(Boolean)
      .map((url) => `![foto](${url})`)
      .join("\n");

    return {
      success: true,
      result: {
        vehicles: formatted,
        total: formatted.length,
        ...(photosMarkdown && { photos_markdown: photosMarkdown }),
        _hint: formatted.length > 0
          ? photosMarkdown
            ? `ESTOQUE ATUAL (${formatted.length} veículo(s)). O cliente pediu fotos: inclua na sua resposta EXATAMENTE o conteúdo de photos_markdown (as imagens em markdown).`
            : `ESTOQUE ATUAL (${formatted.length} veículo(s)): Use os dados acima. Para fotos, inclua na resposta markdown: ![foto](URL) para cada URL em photos.`
          : "Nenhum veículo encontrado com os filtros informados.",
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
      const businessStart = 8;
      const businessEnd = 18;

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
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

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

      let startDt: Date;
      const normalized = startAt.includes("T") ? startAt : `${startAt}T09:00:00`;
      startDt = new Date(normalized);
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

      const endDt = new Date(startDt.getTime() + durationMin * 60000);

      const { data: created, error: insErr } = await supabase
        .from("calendar_events")
        .insert({
          calendar_id: calendarId,
          tenant_id: calendarArgs.tenant_id,
          title,
          start_at: startDt.toISOString(),
          end_at: endDt.toISOString(),
        })
        .select()
        .maybeSingle();

      if (insErr) {
        return { success: false, result: null, error: insErr.message };
      }
      return { success: true, result: { action: "created", event: created } };
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

  switch (tool.tool_type) {
    case "inventory_query":
      return executeInventoryQuery(supabase, agentId, args);

    case "fipe_query":
      return executeFipeQuery(args);

    case "calendar_query":
      return executeCalendarQuery(supabase, tool, args, agentId);

    case "nearest_unit":
      return executeNearestUnit(args);

    case "web_scraper":
    case "api_rest":
    case "sql_query":
    case "rag_search":
    case "chatwoot_assign":
    case "send_notification":
    default:
      return {
        success: false,
        result: null,
        error: `Tool type ${tool.tool_type} not yet supported in local chat`,
      };
  }
}
