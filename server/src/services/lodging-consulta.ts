import { createNexusClient } from "./supabase.js";
import { isTenantModuleEnabled } from "./tenant-modules.js";

export type LodgingGuestInput = { type: string; age?: number };

export type LodgingConsultaOk =
  | {
      status: "success";
      check_in: string;
      check_out: string;
      nights: number;
      guests_in_family: number;
      guests_for_pricing: number;
      kids_under_12: Array<{ age: number }>;
      available_accommodations: Array<{
        id: string;
        name: string;
        guests: number;
        nights: number;
        price_per_night: number;
        total_price: number;
        currency: string;
        notes: string | null;
        /** Ocupação usada na tarifa quando difere da família (ex.: Loft cotado para 6 pessoas). */
        quoted_for_occupancy?: number;
        /** Grupos acima de 4 pessoas: nº de unidades no orçamento. */
        rooms_count?: number;
      }>;
      message: string;
      /** Quando > 1, cotação multi-quarto (ex.: 8 pessoas = 2× até 4). */
      rooms_in_quote?: number;
    }
  | {
      status: "park_closed";
      check_in: string;
      check_out: string;
      nights: number;
      closed_dates: string[];
      message: string;
      suggestions: string[];
      /** Primeira janela com parque aberto em todos os dias da estadia (mesmo nº de noites). */
      nearest_open_window?: { check_in: string; check_out: string; nights: number };
    };

export type LodgingConsultaErr = { error: string; detail?: string };

/**
 * Consulta interna: calendário do parque + tarifas (módulo hospedagem).
 * Usada pela rota HTTP e pela tool `lodging_consulta` (sem URL externa).
 */
const LOFT_MIN_GUESTS_FOR_RATE = 6;
/** Máximo de hóspedes por unidade nas tarifas padrão (Chalé/Suítes). Acima disso: multi-quarto. */
const MAX_GUESTS_PER_STANDARD_ROOM = 4;

type LodgingAccommodationRow = Extract<LodgingConsultaOk, { status: "success" }>["available_accommodations"][number];

export type ParkDayRow = { calendar_date: string; day_kind: string };

function addDaysIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateIsoBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/**
 * Primeira janela de hospedagem em que todos os dias [check_in, check_out) estão com parque aberto.
 */
export function findNearestOpenLodgingWindowFromRows(
  rows: ParkDayRow[],
  nights: number,
  searchFrom: string
): { check_in: string; check_out: string; nights: number } | null {
  if (nights < 1 || rows.length === 0) return null;

  const byDate = new Map(rows.map((r) => [r.calendar_date, r.day_kind]));
  const candidateStarts = rows
    .filter((r) => r.calendar_date >= searchFrom && r.day_kind === "aberto")
    .map((r) => r.calendar_date)
    .sort();

  for (const checkIn of candidateStarts) {
    let windowOpen = true;
    for (let n = 0; n < nights; n++) {
      const day = addDaysIso(checkIn, n);
      if (byDate.get(day) !== "aberto") {
        windowOpen = false;
        break;
      }
    }
    if (windowOpen) {
      return { check_in: checkIn, check_out: addDaysIso(checkIn, nights), nights };
    }
  }
  return null;
}

async function fetchNearestOpenLodgingWindow(
  supabase: ReturnType<typeof createNexusClient>,
  tenant_id: string,
  nights: number,
  searchFrom: string
): Promise<{ check_in: string; check_out: string; nights: number } | null> {
  const horizon = Math.max(nights * 14, 45);
  const { data: days, error } = await supabase
    .from("lodging_park_days")
    .select("calendar_date, day_kind")
    .eq("tenant_id", tenant_id)
    .gte("calendar_date", searchFrom)
    .order("calendar_date", { ascending: true })
    .limit(horizon);

  if (error) throw error;
  return findNearestOpenLodgingWindowFromRows(days ?? [], nights, searchFrom);
}

async function fetchLoftSupplementalAccommodation(
  supabase: ReturnType<typeof createNexusClient>,
  tenant_id: string,
  nights: number,
  guestsForPricing: number
): Promise<LodgingAccommodationRow | null> {
  const { data: types, error: typesError } = await supabase
    .from("lodging_accommodation_types")
    .select("id, name")
    .eq("tenant_id", tenant_id)
    .ilike("name", "%LOFT%")
    .limit(1);

  if (typesError || !types?.length) return null;

  const typeId = types[0].id as string;
  const typeName = (types[0].name as string) ?? "LOFT";

  const { data: rates, error: ratesError } = await supabase
    .from("lodging_rate_items")
    .select("id, guests, nights, price, currency, notes")
    .eq("tenant_id", tenant_id)
    .eq("accommodation_type_id", typeId)
    .eq("guests", LOFT_MIN_GUESTS_FOR_RATE)
    .eq("nights", nights)
    .limit(1);

  if (ratesError || !rates?.length) return null;

  const rate = rates[0];
  const total = parseFloat(String(rate.price));
  const occupancyNote =
    `Tarifa cadastrada para até ${LOFT_MIN_GUESTS_FOR_RATE} pessoas (hidromassagem/SPA). ` +
    `Para ${guestsForPricing} pessoa${guestsForPricing === 1 ? "" : "s"}, confirmar condição com a equipe antes de fechar.`;

  return {
    id: String(rate.id),
    name: typeName,
    guests: LOFT_MIN_GUESTS_FOR_RATE,
    nights,
    price_per_night: total / nights,
    total_price: total,
    currency: String(rate.currency ?? "BRL"),
    notes: rate.notes ? `${rate.notes} ${occupancyNote}` : occupancyNote,
    quoted_for_occupancy: LOFT_MIN_GUESTS_FOR_RATE,
  };
}

function wantsLoftOrSpaInterest(interest_keywords: string[] | undefined): boolean {
  if (!interest_keywords?.length) return false;
  return interest_keywords.some((k) => {
    const n = k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return n.includes("loft") || n.includes("spa") || n.includes("hidro");
  });
}

export async function runLodgingConsulta(
  supabase: ReturnType<typeof createNexusClient>,
  params: {
    tenant_id: string;
    check_in: string;
    check_out: string;
    guests: LodgingGuestInput[];
    interest_keywords?: string[];
  }
): Promise<{ ok: true; data: LodgingConsultaOk } | { ok: false; status: number; body: LodgingConsultaErr }> {
  const tenant_id = params.tenant_id.trim();
  const check_in = params.check_in.trim();
  const check_out = params.check_out.trim();
  const guests = params.guests ?? [];

  if (!tenant_id || !check_in || !check_out) {
    return { ok: false, status: 400, body: { error: "tenant_id, check_in, check_out required" } };
  }

  if (check_out <= check_in) {
    return { ok: false, status: 400, body: { error: "check_out_must_be_after_check_in" } };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(check_in) || !/^\d{4}-\d{2}-\d{2}$/.test(check_out)) {
    return { ok: false, status: 400, body: { error: "invalid_date_format", detail: "YYYY-MM-DD required" } };
  }

  const hospedagemEnabled = await isTenantModuleEnabled(supabase, tenant_id, "hospedagem");
  if (!hospedagemEnabled) {
    return { ok: false, status: 403, body: { error: "module_disabled", detail: "hospedagem" } };
  }

  try {
    const adults = guests.filter((g) => g.type === "adult").length;
    const childrenUnder12 = guests
      .filter((g) => g.type === "child" && (g.age ?? 0) <= 12)
      .map((g) => ({ age: g.age! }));

    const childrenAgesSum = childrenUnder12.reduce((sum, c) => sum + c.age, 0);
    const allChildrenCourtesy = childrenAgesSum <= 12 && childrenUnder12.length > 0;

    let guestsForPricing = adults;
    if (!allChildrenCourtesy && childrenUnder12.length > 0) {
      guestsForPricing += 1;
    }

    const guestsFamilyTotal = guests.length;

    const checkInDate = new Date(check_in + "T00:00:00Z");
    const checkOutDate = new Date(check_out + "T00:00:00Z");
    const nights = Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

    let rateGuestCount = guestsForPricing;
    let roomsInQuote = 1;
    if (guestsForPricing > MAX_GUESTS_PER_STANDARD_ROOM) {
      rateGuestCount = MAX_GUESTS_PER_STANDARD_ROOM;
      roomsInQuote = Math.ceil(guestsForPricing / MAX_GUESTS_PER_STANDARD_ROOM);
    }

    const { data: parkDays, error: parkError } = await supabase
      .from("lodging_park_days")
      .select("calendar_date, day_kind")
      .eq("tenant_id", tenant_id)
      .gte("calendar_date", check_in)
      .lt("calendar_date", check_out)
      .order("calendar_date", { ascending: true });

    if (parkError) throw parkError;

    const closedDates = (parkDays ?? [])
      .filter((d: { day_kind: string }) => d.day_kind !== "aberto")
      .map((d: { calendar_date: string }) => d.calendar_date);

    if (closedDates.length > 0) {
      const suggestions: string[] = [];
      const nearestOpenWindow = await fetchNearestOpenLodgingWindow(
        supabase,
        tenant_id,
        nights,
        check_in
      );

      if (nearestOpenWindow) {
        const fromBR = formatDateIsoBR(nearestOpenWindow.check_in);
        const toBR = formatDateIsoBR(nearestOpenWindow.check_out);
        const nightsLabel = nearestOpenWindow.nights === 1 ? "1 noite" : `${nearestOpenWindow.nights} noites`;
        suggestions.push(
          `Hospedagem com parque aberto: check-in ${fromBR} → check-out ${toBR} (${nightsLabel})`
        );
      }

      const { data: allDays } = await supabase
        .from("lodging_park_days")
        .select("calendar_date, day_kind")
        .eq("tenant_id", tenant_id)
        .gte("calendar_date", check_out)
        .order("calendar_date", { ascending: true })
        .limit(30);

      if (allDays && allDays.length > 0) {
        let lastOpen: string | null = null;
        for (const d of allDays) {
          if (d.day_kind === "aberto") {
            if (!lastOpen) {
              lastOpen = d.calendar_date;
            }
          } else {
            if (lastOpen) {
              suggestions.push(
                `Parque aberto: ${formatDateIsoBR(lastOpen)} a ${formatDateIsoBR(d.calendar_date)}`
              );
              lastOpen = null;
            }
          }
        }
        if (lastOpen) {
          suggestions.push(`Parque aberto a partir de: ${formatDateIsoBR(lastOpen)}`);
        }
      }

      const closedBR = closedDates.map(formatDateIsoBR).join(", ");
      const data: LodgingConsultaOk = {
        status: "park_closed",
        check_in,
        check_out,
        nights,
        closed_dates: closedDates,
        message: `O parque estará fechado em ${closedBR}. Não é possível cotar hospedagem para essas datas.`,
        suggestions,
        ...(nearestOpenWindow ? { nearest_open_window: nearestOpenWindow } : {}),
      };
      return { ok: true, data };
    }

    const { data: rates, error: ratesError } = await supabase
      .from("lodging_rate_items")
      .select("*, lodging_accommodation_types (id, name)")
      .eq("tenant_id", tenant_id)
      .eq("guests", rateGuestCount)
      .eq("nights", nights)
      .order("accommodation_type_id", { ascending: true });

    if (ratesError) throw ratesError;

    const availableRates = (rates ?? []).filter((rate: { lodging_accommodation_types?: { name?: string } | null }) => {
      const typeName = rate.lodging_accommodation_types?.name ?? "";
      const minGuestsMap: Record<string, number> = {
        "LUXO VISTA PISCINA": 3,
        "LUXO COM VARANDA": 2,
        "LUXO DUPLO": 2,
        "MASTER COM VARANDA": 4,
        STANDART: 2,
        LOFT: 6,
      };

      const minGuests = minGuestsMap[typeName] ?? 2;
      return rateGuestCount >= minGuests;
    });

    /** Uma linha por categoria de acomodação: evita duplicatas (ex.: BRL + USD ou seeds repetidos). */
    function dedupeRatesByAccommodationType<
      T extends {
        accommodation_type_id: string;
        price: string | number;
        currency: string;
      },
    >(rows: T[]): T[] {
      const byType = new Map<string, T>();
      const brlScore = (c: string) => (String(c).toUpperCase() === "BRL" ? 1 : 0);
      for (const row of rows) {
        const key = row.accommodation_type_id;
        const existing = byType.get(key);
        if (!existing) {
          byType.set(key, row);
          continue;
        }
        const sNew = brlScore(row.currency);
        const sOld = brlScore(existing.currency);
        if (sNew > sOld) {
          byType.set(key, row);
        } else if (sNew === sOld && Number(row.price) < Number(existing.price)) {
          byType.set(key, row);
        }
      }
      return Array.from(byType.values());
    }

    const uniqueRates = dedupeRatesByAccommodationType(
      availableRates as Array<{
        accommodation_type_id: string;
        id: string;
        guests: number;
        nights: number;
        price: string | number;
        currency: string;
        notes: string | null;
        lodging_accommodation_types?: { name?: string } | null;
      }>
    );

    const accommodations = uniqueRates.map((rate) => {
      const unitTotal = parseFloat(String(rate.price));
      const totalForGroup = unitTotal * roomsInQuote;
      const multiRoomNote =
        roomsInQuote > 1
          ? `${roomsInQuote} unidades (até ${rateGuestCount} pessoas cada) — referência para ${guestsForPricing} hóspedes no total.`
          : null;
      const mergedNotes = [multiRoomNote, rate.notes?.trim()].filter(Boolean).join(" ") || null;
      return {
        id: rate.id,
        name: rate.lodging_accommodation_types?.name ?? "Acomodação",
        guests: rate.guests,
        nights: rate.nights,
        price_per_night: unitTotal / nights,
        total_price: totalForGroup,
        currency: rate.currency,
        notes: mergedNotes,
        ...(roomsInQuote > 1
          ? { rooms_count: roomsInQuote, quoted_for_occupancy: rateGuestCount }
          : {}),
      };
    });

    const loftInterest = wantsLoftOrSpaInterest(params.interest_keywords);
    const hasLoftInList = accommodations.some((a) => /loft|spa/i.test(a.name));
    if (loftInterest && !hasLoftInList) {
      const supplemental = await fetchLoftSupplementalAccommodation(
        supabase,
        tenant_id,
        nights,
        guestsForPricing
      );
      if (supplemental) accommodations.push(supplemental);
    }

    const messageKids =
      childrenUnder12.length > 0
        ? `${childrenUnder12.length === 1 ? "1 criança até 12 anos em cortesia" : `${childrenUnder12.length} crianças até 12 anos em cortesia`} (colchão${childrenUnder12.length > 1 ? "ões" : ""} adicional${childrenUnder12.length > 1 ? "is" : ""} inclusos).`
        : "";

    const optWord = uniqueRates.length === 1 ? "opção" : "opções";
    const groupRoomHint =
      roomsInQuote > 1
        ? ` (orçamento com ${roomsInQuote} unidades de até ${rateGuestCount} pessoas cada para acomodar ${guestsForPricing} hóspedes)`
        : "";
    const message =
      `Encontramos ${uniqueRates.length} ${optWord} de hospedagem para ${guestsForPricing} pessoa${guestsForPricing === 1 ? "" : "s"}${groupRoomHint}` +
      (guestsFamilyTotal > guestsForPricing
        ? ` (sua família tem ${guestsFamilyTotal} pessoa${guestsFamilyTotal === 1 ? "" : "s"}), `
        : `, `) +
      `de ${new Date(check_in).toLocaleDateString("pt-BR")} a ${new Date(check_out).toLocaleDateString("pt-BR")} (${nights} noite${nights === 1 ? "" : "s"}). ` +
      (messageKids ? messageKids : "");

    const data: LodgingConsultaOk = {
      status: "success",
      check_in,
      check_out,
      nights,
      guests_in_family: guestsFamilyTotal,
      guests_for_pricing: guestsForPricing,
      kids_under_12: childrenUnder12,
      available_accommodations: accommodations,
      message,
      ...(roomsInQuote > 1 ? { rooms_in_quote: roomsInQuote } : {}),
    };
    return { ok: true, data };
  } catch (e) {
    console.error("runLodgingConsulta:", e);
    return {
      ok: false,
      status: 500,
      body: { error: "internal_error", detail: String(e) },
    };
  }
}
