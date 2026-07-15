import { createNexusClient } from "./supabase.js";
import { isTenantModuleEnabled } from "./tenant-modules.js";
import {
  applySunsetLodgingPromoPrice,
  buildSunsetLodgingPromotionInfo,
  isSunsetLodgingPromoEligibleForStay,
  type SunsetLodgingPromotionInfo,
} from "../utils/sunset-lodging-promo.js";

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
        /** Preço de tabela antes do desconto promocional (quando promotion ativa). */
        list_total_price?: number;
        /** Ocupação usada na tarifa quando difere da família (ex.: Loft cotado para 6 pessoas). */
        quoted_for_occupancy?: number;
        /** Grupos acima de 4 pessoas: nº de unidades no orçamento. */
        rooms_count?: number;
      }>;
      message: string;
      /** Promoção 25% OFF hospedagem quando elegível (reserva até 31/07/26, estadia até 31/12/26). */
      promotion?: SunsetLodgingPromotionInfo;
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
      /** Dias sem linha no calendário (tratados como bloqueio, fail-closed). */
      missing_calendar_dates?: string[];
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
export const MAX_GUESTS_PER_STANDARD_ROOM = 4;

export type SunsetLodgingGuestPricing = {
  adults: number;
  childrenUnder12: Array<{ age: number }>;
  childrenAgesSum: number;
  allChildrenCourtesy: boolean;
  childrenCourtesyCount: number;
  guestsFamilyTotal: number;
  guestsForPricing: number;
  rateGuestCount: number;
  roomsInQuote: number;
};

/**
 * Regra oficial de pagantes:
 * - Criança/adolescente com idade **> 12** sempre paga (conta como pagante).
 * - Crianças ≤12: se soma das idades ≤12 → todas cortesia; senão 1 cortesia + demais pagam.
 */
export function computeSunsetLodgingGuestPricing(
  guests: LodgingGuestInput[],
  maxGuestsPerRoom: number = MAX_GUESTS_PER_STANDARD_ROOM,
): SunsetLodgingGuestPricing {
  const adults = guests.filter((g) => g.type === "adult").length;
  const childrenUnder12 = guests
    .filter((g) => g.type === "child" && (g.age ?? 0) <= 12)
    .map((g) => ({ age: g.age! }));
  const childrenOver12Count = guests.filter(
    (g) => g.type === "child" && (g.age ?? 0) > 12,
  ).length;

  const childrenAgesSum = childrenUnder12.reduce((sum, c) => sum + c.age, 0);
  const allChildrenCourtesy = childrenAgesSum <= 12 && childrenUnder12.length > 0;
  const childrenCourtesyCount = allChildrenCourtesy
    ? childrenUnder12.length
    : childrenUnder12.length > 0
      ? 1
      : 0;

  // Adolescentes (>12) sempre pagam; cortesia só vale para ≤12.
  let guestsForPricing = adults + childrenOver12Count;
  if (childrenUnder12.length > 0 && !allChildrenCourtesy) {
    guestsForPricing += childrenUnder12.length - childrenCourtesyCount;
  }

  const guestsFamilyTotal = guests.length;
  let rateGuestCount = guestsForPricing;
  let roomsInQuote = 1;
  if (guestsForPricing > maxGuestsPerRoom) {
    rateGuestCount = maxGuestsPerRoom;
    roomsInQuote = Math.ceil(guestsForPricing / maxGuestsPerRoom);
  }

  return {
    adults,
    childrenUnder12,
    childrenAgesSum,
    allChildrenCourtesy,
    childrenCourtesyCount,
    guestsFamilyTotal,
    guestsForPricing,
    rateGuestCount,
    roomsInQuote,
  };
}

export function formatSunsetChildrenCourtesyMessage(pricing: Pick<
  SunsetLodgingGuestPricing,
  "childrenUnder12" | "allChildrenCourtesy" | "childrenAgesSum" | "childrenCourtesyCount"
>): string {
  if (pricing.childrenUnder12.length === 0) return "";
  if (pricing.allChildrenCourtesy) {
    const n = pricing.childrenUnder12.length;
    return n === 1
      ? "1 criança até 12 anos em cortesia (colchão adicional incluso)."
      : `${n} crianças até 12 anos em cortesia — soma das idades ${pricing.childrenAgesSum} anos (colchões adicionais inclusos).`;
  }
  return "1 criança até 12 anos em cortesia (soma das idades das crianças passa de 12 anos — apenas uma cortesia por grupo; colchão adicional incluso).";
}

type LodgingAccommodationRow = Extract<LodgingConsultaOk, { status: "success" }>["available_accommodations"][number];

/** Preço de grupo = tarifa cadastrada por unidade × nº de quartos necessários. */
export function computeLodgingGroupPrice(
  unitListPrice: number,
  roomsInQuote: number,
  nights: number,
  applyPromo: boolean,
): {
  listTotal: number;
  promoTotal: number;
  listUnitTotal: number;
  promoUnitTotal: number;
  pricePerUnitPerNight: number;
} {
  const rooms = Math.max(1, roomsInQuote);
  const listUnitTotal = unitListPrice;
  const listTotal = Math.round(listUnitTotal * rooms * 100) / 100;
  const promoTotal = applyPromo ? applySunsetLodgingPromoPrice(listTotal) : listTotal;
  const promoUnitTotal = applyPromo ? applySunsetLodgingPromoPrice(listUnitTotal) : listUnitTotal;
  const pricePerUnitPerNight = Math.round((promoUnitTotal / Math.max(1, nights)) * 100) / 100;
  return { listTotal, promoTotal, listUnitTotal, promoUnitTotal, pricePerUnitPerNight };
}

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

/** Dias em que o parque precisa estar aberto numa estadia [check_in, check_out). */
export function listParkDaysDuringLodgingStay(checkIn: string, checkOut: string): string[] {
  const days: string[] = [];
  let cursor = checkIn;
  while (cursor < checkOut) {
    days.push(cursor);
    cursor = addDaysIso(cursor, 1);
  }
  return days;
}

/**
 * Gate fail-closed: cotação só se **todos** os dias [check_in, check_out) tiverem
 * `day_kind === "aberto"` no calendário. Dia ausente no cadastro = bloqueio (não assumir aberto).
 */
export type LodgingStayParkGate = {
  blocked: boolean;
  /** Dias com day_kind explícito ≠ aberto */
  closedDates: string[];
  /** Dias sem linha em lodging_park_days */
  missingDates: string[];
  /** União ordenada de closed + missing (para `closed_dates` da resposta) */
  blockedDates: string[];
};

export function evaluateLodgingStayParkGate(
  checkIn: string,
  checkOut: string,
  parkDays: Array<{ calendar_date: string; day_kind: string }>,
): LodgingStayParkGate {
  const needed = listParkDaysDuringLodgingStay(checkIn, checkOut);
  const byDate = new Map(parkDays.map((d) => [d.calendar_date, d.day_kind]));
  const closedDates: string[] = [];
  const missingDates: string[] = [];
  for (const day of needed) {
    const kind = byDate.get(day);
    if (kind == null) missingDates.push(day);
    else if (kind !== "aberto") closedDates.push(day);
  }
  const blockedDates = [...closedDates, ...missingDates].sort();
  return {
    blocked: blockedDates.length > 0,
    closedDates,
    missingDates,
    blockedDates,
  };
}

export function formatLodgingParkClosedMessage(gate: LodgingStayParkGate): string {
  const closedBR = gate.closedDates.map(formatDateIsoBR);
  const missingBR = gate.missingDates.map(formatDateIsoBR);
  if (closedBR.length > 0 && missingBR.length > 0) {
    return (
      `O parque estará fechado em ${closedBR.join(", ")} e não há calendário cadastrado para ` +
      `${missingBR.join(", ")}. Não é possível cotar hospedagem para essas datas.`
    );
  }
  if (missingBR.length > 0) {
    return (
      `Não há calendário do parque cadastrado para ${missingBR.join(", ")}. ` +
      `Não é possível cotar hospedagem até a equipe confirmar abertura nessas datas.`
    );
  }
  return (
    `O parque estará fechado em ${closedBR.join(", ")}. ` +
    `Não é possível cotar hospedagem para essas datas.`
  );
}

function formatParkDaysListBR(dates: string[]): string {
  const formatted = dates.map(formatDateIsoBR);
  if (formatted.length <= 1) return formatted[0] ?? "";
  if (formatted.length === 2) return `${formatted[0]} e ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")} e ${formatted[formatted.length - 1]}`;
}

/**
 * Agrupa dias consecutivos abertos no calendário.
 * O fim do intervalo é o **último dia aberto**, não o dia fechado seguinte.
 */
export function buildOpenParkRangeSuggestions(rows: ParkDayRow[]): string[] {
  const suggestions: string[] = [];
  let rangeStart: string | null = null;
  let lastOpen: string | null = null;

  const flushRange = () => {
    if (!rangeStart || !lastOpen) return;
    if (rangeStart === lastOpen) {
      suggestions.push(`Parque aberto: ${formatDateIsoBR(rangeStart)}`);
    } else {
      suggestions.push(
        `Parque aberto: ${formatDateIsoBR(rangeStart)} a ${formatDateIsoBR(lastOpen)}`
      );
    }
    rangeStart = null;
    lastOpen = null;
  };

  for (const d of rows) {
    if (d.day_kind === "aberto") {
      if (!rangeStart) rangeStart = d.calendar_date;
      lastOpen = d.calendar_date;
    } else {
      flushRange();
    }
  }
  if (rangeStart && lastOpen) {
    suggestions.push(`Parque aberto a partir de: ${formatDateIsoBR(rangeStart)}`);
  }
  return suggestions;
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
  guestsForPricing: number,
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
  const unitList = parseFloat(String(rate.price));
  const loftUnitsNeeded =
    guestsForPricing > LOFT_MIN_GUESTS_FOR_RATE
      ? Math.ceil(guestsForPricing / LOFT_MIN_GUESTS_FOR_RATE)
      : 1;
  const priced = computeLodgingGroupPrice(unitList, loftUnitsNeeded, nights, false);
  const occupancyNote =
    guestsForPricing > LOFT_MIN_GUESTS_FOR_RATE
      ? `${loftUnitsNeeded} unidade(s) Loft (até ${LOFT_MIN_GUESTS_FOR_RATE} pessoas cada) — referência para ${guestsForPricing} hóspedes. Confirmar condição com a equipe antes de fechar.`
      : `Tarifa cadastrada para até ${LOFT_MIN_GUESTS_FOR_RATE} pessoas (hidromassagem/SPA).`;

  return {
    id: String(rate.id),
    name: typeName,
    guests: LOFT_MIN_GUESTS_FOR_RATE,
    nights,
    price_per_night: priced.pricePerUnitPerNight,
    total_price: priced.listTotal,
    currency: String(rate.currency ?? "BRL"),
    notes: rate.notes ? `${rate.notes} ${occupancyNote}` : occupancyNote,
    ...(guestsForPricing > LOFT_MIN_GUESTS_FOR_RATE
      ? { quoted_for_occupancy: LOFT_MIN_GUESTS_FOR_RATE }
      : {}),
    ...(loftUnitsNeeded > 1 ? { rooms_count: loftUnitsNeeded } : {}),
  };
}

/** Lista de acomodações ainda não inclui Loft/SPA (tarifa mínima 6 hóspedes). */
export function accommodationListNeedsLoftSupplement(
  accommodations: Array<{ name?: string }>,
): boolean {
  return !accommodations.some((a) => /loft|spa/i.test(String(a.name ?? "")));
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
    const pricing = computeSunsetLodgingGuestPricing(guests);
    const {
      childrenUnder12,
      guestsForPricing,
      guestsFamilyTotal,
      rateGuestCount,
      roomsInQuote,
    } = pricing;

    const checkInDate = new Date(check_in + "T00:00:00Z");
    const checkOutDate = new Date(check_out + "T00:00:00Z");
    const nights = Math.floor((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

    const { data: parkDays, error: parkError } = await supabase
      .from("lodging_park_days")
      .select("calendar_date, day_kind")
      .eq("tenant_id", tenant_id)
      .gte("calendar_date", check_in)
      .lt("calendar_date", check_out)
      .order("calendar_date", { ascending: true });

    if (parkError) throw parkError;

    const parkGate = evaluateLodgingStayParkGate(check_in, check_out, parkDays ?? []);

    if (parkGate.blocked) {
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
        const parkOpenDays = formatParkDaysListBR(
          listParkDaysDuringLodgingStay(nearestOpenWindow.check_in, nearestOpenWindow.check_out)
        );
        suggestions.push(
          `Hospedagem com parque aberto: check-in ${fromBR} → check-out ${toBR} (${nightsLabel}; parque aberto em ${parkOpenDays})`
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
        suggestions.push(...buildOpenParkRangeSuggestions(allDays));
      }

      const data: LodgingConsultaOk = {
        status: "park_closed",
        check_in,
        check_out,
        nights,
        closed_dates: parkGate.blockedDates,
        message: formatLodgingParkClosedMessage(parkGate),
        suggestions,
        ...(nearestOpenWindow ? { nearest_open_window: nearestOpenWindow } : {}),
        ...(parkGate.missingDates.length > 0
          ? { missing_calendar_dates: parkGate.missingDates }
          : {}),
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
      const unitList = parseFloat(String(rate.price));
      const priced = computeLodgingGroupPrice(unitList, roomsInQuote, nights, false);
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
        price_per_night: priced.pricePerUnitPerNight,
        total_price: priced.listTotal,
        currency: rate.currency,
        notes: mergedNotes,
        ...(roomsInQuote > 1
          ? { rooms_count: roomsInQuote, quoted_for_occupancy: rateGuestCount }
          : {}),
      };
    });

    if (accommodationListNeedsLoftSupplement(accommodations)) {
      const supplemental = await fetchLoftSupplementalAccommodation(
        supabase,
        tenant_id,
        nights,
        guestsForPricing,
      );
      if (supplemental) accommodations.push(supplemental);
    }

    const promoEligible = isSunsetLodgingPromoEligibleForStay(check_in);
    const pricedAccommodations = (promoEligible
      ? accommodations.map((acc) => {
          const rooms = acc.rooms_count ?? 1;
          const listTotal = acc.total_price;
          const promoTotal = applySunsetLodgingPromoPrice(listTotal);
          const promoUnitTotal = applySunsetLodgingPromoPrice(listTotal / rooms);
          return {
            ...acc,
            list_total_price: listTotal,
            total_price: promoTotal,
            price_per_night: Math.round((promoUnitTotal / nights) * 100) / 100,
          };
        })
      : [...accommodations]
    ).sort((a, b) => a.total_price - b.total_price);

    const messageKids = formatSunsetChildrenCourtesyMessage(pricing);

    const accCount = pricedAccommodations.length;
    const optWord = accCount === 1 ? "opção" : "opções";
    const groupRoomHint =
      roomsInQuote > 1
        ? ` (orçamento com ${roomsInQuote} unidades de até ${rateGuestCount} pessoas cada para acomodar ${guestsForPricing} hóspedes)`
        : "";
    const promoHint = promoEligible ? " Valores com 25% OFF da promoção vigente." : "";
    const message =
      `Encontramos ${accCount} ${optWord} de hospedagem para ${guestsForPricing} pessoa${guestsForPricing === 1 ? "" : "s"}${groupRoomHint}` +
      (guestsFamilyTotal > guestsForPricing
        ? ` (sua família tem ${guestsFamilyTotal} pessoa${guestsFamilyTotal === 1 ? "" : "s"}), `
        : `, `) +
      `de ${formatDateIsoBR(check_in)} a ${formatDateIsoBR(check_out)} (${nights} noite${nights === 1 ? "" : "s"}). ` +
      (messageKids ? messageKids : "") +
      promoHint;

    const data: LodgingConsultaOk = {
      status: "success",
      check_in,
      check_out,
      nights,
      guests_in_family: guestsFamilyTotal,
      guests_for_pricing: guestsForPricing,
      kids_under_12: childrenUnder12,
      available_accommodations: pricedAccommodations,
      message,
      ...(roomsInQuote > 1 ? { rooms_in_quote: roomsInQuote } : {}),
      ...(promoEligible ? { promotion: buildSunsetLodgingPromotionInfo() } : {}),
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
