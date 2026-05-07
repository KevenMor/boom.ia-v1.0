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
      }>;
      message: string;
    }
  | {
      status: "park_closed";
      check_in: string;
      check_out: string;
      message: string;
      suggestions: string[];
    };

export type LodgingConsultaErr = { error: string; detail?: string };

/**
 * Consulta interna: calendário do parque + tarifas (módulo hospedagem).
 * Usada pela rota HTTP e pela tool `lodging_consulta` (sem URL externa).
 */
export async function runLodgingConsulta(
  supabase: ReturnType<typeof createNexusClient>,
  params: {
    tenant_id: string;
    check_in: string;
    check_out: string;
    guests: LodgingGuestInput[];
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
              suggestions.push(`Parque aberto: ${lastOpen} a ${d.calendar_date}`);
              lastOpen = null;
            }
          }
        }
        if (lastOpen) {
          suggestions.push(`Parque aberto a partir de: ${lastOpen}`);
        }
      }

      const data: LodgingConsultaOk = {
        status: "park_closed",
        check_in,
        check_out,
        message: `O parque estará fechado em ${closedDates.join(", ")}. Não conseguimos confirmar hospedagem nessas datas.`,
        suggestions,
      };
      return { ok: true, data };
    }

    const { data: rates, error: ratesError } = await supabase
      .from("lodging_rate_items")
      .select("*, lodging_accommodation_types (id, name)")
      .eq("tenant_id", tenant_id)
      .eq("guests", guestsForPricing)
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
      return guestsForPricing >= minGuests;
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

    const accommodations = uniqueRates.map((rate) => ({
      id: rate.id,
      name: rate.lodging_accommodation_types?.name ?? "Acomodação",
      guests: rate.guests,
      nights: rate.nights,
      price_per_night: Number(rate.price) / nights,
      total_price: parseFloat(String(rate.price)),
      currency: rate.currency,
      notes: rate.notes,
    }));

    const messageKids =
      childrenUnder12.length > 0
        ? `${childrenUnder12.length === 1 ? "1 criança até 12 anos em cortesia" : `${childrenUnder12.length} crianças até 12 anos em cortesia`} (colchão${childrenUnder12.length > 1 ? "ões" : ""} adicional${childrenUnder12.length > 1 ? "is" : ""} inclusos).`
        : "";

    const optWord = uniqueRates.length === 1 ? "opção" : "opções";
    const message =
      `Encontramos ${uniqueRates.length} ${optWord} de hospedagem para ${guestsForPricing} pessoa${guestsForPricing === 1 ? "" : "s"}` +
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
