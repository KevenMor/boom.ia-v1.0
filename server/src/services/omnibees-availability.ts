/**
 * Consulta read-only de disponibilidade/preços na página Omnibees (HTML).
 */
import { load } from "cheerio";

const DEFAULT_BASE_URL = "https://book.omnibees.com/hotelresults";
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface OmnibeesRateRow {
  rateName: string;
  /** `data-rate-id` ou `data-rateplanid` no HTML — necessário para deep link `/extras?...&rateuids=`. */
  ratePlanId: string | null;
  board: string;
  cancellationPolicy: string;
  payment: string;
  totalPrice: number;
  currency: string;
  hasRestrictions: boolean;
  restrictions: string | null;
  dailyPrices: { date: string; price: string }[];
}

export interface OmnibeesRoomRow {
  roomId: string | null;
  roomName: string;
  /** Capa do quarto na Omnibees (útil para Markdown na resposta / WhatsApp). */
  imageUrl: string | null;
  maxOccupancy: number | null;
  view: string;
  size: string;
  rates: OmnibeesRateRow[];
  cheapestRate: OmnibeesRateRow;
}

export interface OmnibeesAvailabilityResult {
  hotel: string;
  checkIn: string;
  checkOut: string;
  /** Horário de entrada exibido na página Omnibees (ex.: "17h"), quando extraído do HTML. */
  checkInTime: string | null;
  /** Horário de saída exibido na página Omnibees (ex.: "14h"), quando extraído do HTML. */
  checkOutTime: string | null;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  rooms: OmnibeesRoomRow[];
  summaryText: string;
  /**
   * URL da listagem de resultados (`/hotelresults`) — abre corretamente a partir do WhatsApp.
   * Não usar `/extras?...&roomuids=...` sem `sid` de sessão: a Omnibees responde página em branco em abertura direta.
   */
  bookingUrl: string;
  /** Mesma URL da listagem (alias explícito para integrações). */
  hotelListingUrl: string;
}

interface CacheEntry {
  at: number;
  data: OmnibeesAvailabilityResult;
}

const cache = new Map<string, CacheEntry>();

function mergeConfig(exec?: Record<string, unknown> | null): Required<Record<string, string>> & { baseUrl: string } {
  const e = exec || {};
  return {
    baseUrl: typeof e.base_url === "string" && e.base_url ? e.base_url : DEFAULT_BASE_URL,
    base_url: typeof e.base_url === "string" && e.base_url ? e.base_url : DEFAULT_BASE_URL,
    chain_id: String(e.chain_id ?? e.chainId ?? "4486"),
    hotel_id: String(e.hotel_id ?? e.hotelId ?? "8164"),
    currency_id: String(e.currency_id ?? e.currencyId ?? "16"),
    lang: String(e.lang ?? "pt-BR"),
  };
}

function parseDdMmYyyy(s: string): Date {
  if (!/^\d{8}$/.test(s)) throw new Error(`Data inválida (esperado DDMMYYYY): ${s}`);
  const dd = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const yyyy = s.slice(4, 8);
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
}

export function normalizeToOmnibeesDate(input: string): string {
  const t = input.trim();
  if (/^\d{8}$/.test(t)) return t;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}${m}${y}`;
  }
  throw new Error(`Formato de data não reconhecido: ${input}. Use DDMMYYYY ou YYYY-MM-DD.`);
}

function calcNights(checkInDdmmyyyy: string, checkOutDdmmyyyy: string): number {
  const a = parseDdMmYyyy(checkInDdmmyyyy).getTime();
  const b = parseDdMmYyyy(checkOutDdmmyyyy).getTime();
  const n = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return n > 0 ? n : 0;
}

function formatBrDisplay(ddmmyyyy: string): string {
  return `${ddmmyyyy.slice(0, 2)}/${ddmmyyyy.slice(2, 4)}/${ddmmyyyy.slice(4, 8)}`;
}

/** URL absoluta https para imagem de quarto (data-src / src do HTML Omnibees). */
function normalizeRoomImageUrl(raw: string | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t || t === "#" || /^data:/i.test(t)) return null;
  if (t.startsWith("//")) return `https:${t}`;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("/")) return `https://book.omnibees.com${t}`;
  return null;
}

/**
 * Omnibees: no mesmo quarto, várias idades usam `;` (ex.: ch=2&ag=5;10).
 * Vírgula entre idades é interpretada de outra forma; normalizamos vírgula → `;` quando NRooms=1.
 * Vários quartos: `ag` pode usar `,` entre quartos (ex.: 5;10,5) — não alterar nesse caso.
 * @see https://omnibees.gitbook.io/portugues-br/motor-de-reserva/parametros
 */
function formatChildAgesQueryParam(childAges: string, rooms: number): string {
  const t = childAges.trim();
  if (!t) return t;
  if (rooms <= 1) {
    return t.replace(/\s*,\s*/g, ";");
  }
  return t;
}

function buildBookingUrl(
  cfg: ReturnType<typeof mergeConfig>,
  checkIn: string,
  checkOut: string,
  adults: number,
  children: number,
  childAges: string,
  rooms: number
): URL {
  const url = new URL(cfg.baseUrl);
  url.searchParams.set("c", cfg.chain_id);
  url.searchParams.set("q", cfg.hotel_id);
  url.searchParams.set("currencyId", cfg.currency_id);
  url.searchParams.set("lang", cfg.lang);
  url.searchParams.set("NRooms", String(rooms));
  url.searchParams.set("CheckIn", checkIn);
  url.searchParams.set("CheckOut", checkOut);
  url.searchParams.set("ad", String(adults));
  url.searchParams.set("ch", String(children));
  if (childAges) {
    url.searchParams.set("ag", formatChildAgesQueryParam(childAges, rooms));
  }
  return url;
}

/**
 * Extrai o total em BRL de um bloco `.rate_plan` (ex.: R$ 9.096,00 com milhar por ponto).
 * O HTML costuma ser: `<span class="price-total"><span class="currency_symbol_price">R$</span> 9.096,<span class="decimal_value_price">00</span></span>`
 * — a lógica antiga (remover filhos e juntar partes) falhava em alguns casos e descartava a tarifa inteira (ex.: LOFT).
 */
/** Bloco `.rate_plan` (sub-árvore cheerio). */
function parseTotalBrlFromRatePlan(re: { find: (s: string) => { first: () => { text: () => string } } }): number {
  const compact = (s: string) => s.replace(/\s+/g, "").trim();
  const totalEl = re.find(".price-total").first();
  const fromTotal = compact(totalEl.text());
  let m = fromTotal.match(/R\$\s*([\d.]+),(\d{2})/);
  if (!m) {
    m = fromTotal.match(/^([\d.]+),(\d{2})$/);
  }
  if (m) {
    const intPart = m[1].replace(/\./g, "");
    const n = parseFloat(`${intPart}.${m[2]}`);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  const fallback = compact(re.find(".date-holder-total-value").first().text());
  m = fallback.match(/R\$\s*([\d.]+),(\d{2})/);
  if (m) {
    const intPart = m[1].replace(/\./g, "");
    const n = parseFloat(`${intPart}.${m[2]}`);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return NaN;
}

/**
 * Extrai da Omnibees o texto tipo "Check-In 17hs e Check-Out 14hs" (span.icon_text na listagem).
 */
function extractHotelCheckTimes($: ReturnType<typeof load>): { checkInTime: string | null; checkOutTime: string | null } {
  for (const el of $("span.icon_text").toArray()) {
    const raw = $(el).text().replace(/\s+/g, " ").trim();
    const m = raw.match(/Check-In\s*(\d{1,2})\s*hs?\s+e\s+Check-Out\s*(\d{1,2})\s*hs?/i);
    if (m) {
      return { checkInTime: `${m[1]}h`, checkOutTime: `${m[2]}h` };
    }
  }
  return { checkInTime: null, checkOutTime: null };
}

/** Tarifa parcelada/cartão na Omnibees, quando existe além da opção mais barata (ex.: depósito vs cartão em até 10x). */
function findInstallmentCompanionRate(rates: OmnibeesRateRow[], cheapest: OmnibeesRateRow): OmnibeesRateRow | null {
  const blob = (rate: OmnibeesRateRow) => `${rate.rateName} ${rate.payment}`.toLowerCase();
  const looksInstallment = (rate: OmnibeesRateRow) =>
    /parcel|parcelad|cart[aã]o|cr[eé]dito/.test(blob(rate));
  const candidates = rates.filter((rate) => looksInstallment(rate) && rate.totalPrice > 0 && !Number.isNaN(rate.totalPrice));
  if (candidates.length === 0) return null;
  const pricier = candidates.filter((rate) => rate.totalPrice > cheapest.totalPrice + 0.01);
  if (pricier.length > 0) {
    return pricier.reduce((a, b) => (a.totalPrice <= b.totalPrice ? a : b));
  }
  const differentName = candidates.find((rate) => rate.rateName.trim() !== cheapest.rateName.trim());
  return differentName ?? null;
}

function buildSummaryText(data: Omit<OmnibeesAvailabilityResult, "summaryText" | "bookingUrl" | "hotelListingUrl">): string {
  if (data.rooms.length === 0) {
    return `Nenhuma acomodação com tarifa encontrada para ${data.checkIn} a ${data.checkOut} (${data.nights} noites, ${data.adults} adultos${data.children ? `, ${data.children} crianças` : ""}).`;
  }
  const lines = data.rooms.map((r) => {
    const c = r.cheapestRate;
    const priceStr = c.totalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rest = c.hasRestrictions && c.restrictions ? ` Restrições: ${c.restrictions}.` : "";
    const inst = findInstallmentCompanionRate(r.rates, c);
    const instPart = inst
      ? ` Opção parcelada no cartão: ${inst.currency} ${inst.totalPrice.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} (${inst.rateName}).`
      : "";
    return `${r.roomName}: a partir de ${c.currency} ${priceStr} (${c.rateName}).${instPart}${rest}`;
  });
  if (data.checkInTime && data.checkOutTime) {
    lines.push(
      `Horários nesta página da reserva (Omnibees): check-in a partir das ${data.checkInTime}, check-out até ${data.checkOutTime}.`
    );
  }
  return lines.join("\n");
}

function parseAvailability(
  html: string,
  params: { checkIn: string; checkOut: string; adults: number; children: number }
): Omit<OmnibeesAvailabilityResult, "summaryText" | "bookingUrl" | "hotelListingUrl"> {
  const $ = load(html);
  const { checkInTime, checkOutTime } = extractHotelCheckTimes($);
  const rooms: OmnibeesRoomRow[] = [];

  $(".roomrate").each((_, roomEl) => {
    const el = $(roomEl);
    const roomId = el.attr("data-roomid") ?? null;
    let roomName = el.find(".hotel_name.room-popup-modal").first().text().trim();
    if (!roomName) {
      const fromImg = el.find(".room-image-container img[alt]").first().attr("alt")?.trim();
      roomName = fromImg || "";
    }
    if (!roomName) return;

    const rates: OmnibeesRateRow[] = [];

    el.find(".rate_plan").each((__, rateEl) => {
      const re = $(rateEl);
      let rateName = re.find(".rate_name").attr("data-rate-name") || "";
      if (!rateName.trim()) {
        rateName = re.find(".rate_name").first().text().replace(/\s+/g, " ").trim();
      }
      const board = re.attr("data-board") || "";
      const policy = re.attr("data-policy") || "";

      const rawPlanId = (re.attr("data-rate-id") ?? re.attr("data-rateplanid"))?.trim() ?? "";
      const ratePlanId = /^\d+$/.test(rawPlanId) ? rawPlanId : null;

      const priceSymbol = re.find(".currency_symbol_price").first().text().trim() || "R$";
      const priceNumber = parseTotalBrlFromRatePlan(re);

      const hasRestrictions = re.find(".los_restricted").length > 0;
      const restrictionText = hasRestrictions
        ? re.find(".los_restricted .t-tip__text").text().replace(/\s+/g, " ").trim()
        : null;

      const paymentText = re.find(".payment_methods_bar").text().replace(/\s+/g, " ").trim();

      const dailyPrices: { date: string; price: string }[] = [];
      re.find(".price-date-container").each((___, dayEl) => {
        const de = $(dayEl);
        const date = de.find("span").first().text().trim();
        const price = de.find(".t-tip__text__price").text().trim();
        if (date && price) dailyPrices.push({ date, price });
      });

      if (rateName && !Number.isNaN(priceNumber) && priceNumber > 0) {
        rates.push({
          rateName,
          ratePlanId,
          board,
          cancellationPolicy: policy,
          payment: paymentText,
          totalPrice: priceNumber,
          currency: priceSymbol || "R$",
          hasRestrictions,
          restrictions: restrictionText,
          dailyPrices,
        });
      }
    });

    if (rates.length > 0) {
      const maxOccText = el.find(".room-max-occupancy").first().text().trim();
      const maxOcc = maxOccText ? parseInt(maxOccText, 10) : NaN;
      const view = el.find(".view-bed-type .room-bed-name").first().text().trim();
      const size = el
        .find(".room-bed-name")
        .filter((_, bed) => $(bed).text().includes("m2"))
        .text()
        .trim();

      const imgEl = el.find(".room-image-container img").first();
      const imageUrl = normalizeRoomImageUrl(imgEl.attr("data-src") || imgEl.attr("src") || undefined);

      const cheapestRate = rates.reduce((min, r) => (r.totalPrice < min.totalPrice ? r : min), rates[0]);
      rooms.push({
        roomId,
        roomName,
        imageUrl,
        maxOccupancy: Number.isFinite(maxOcc) ? maxOcc : null,
        view,
        size,
        rates,
        cheapestRate,
      });
    }
  });

  const hotelName = $("#hotel_name").text().trim() || $("title").text().trim() || "Hotel";
  const nights = calcNights(params.checkIn, params.checkOut);

  return {
    hotel: hotelName,
    checkIn: formatBrDisplay(params.checkIn),
    checkOut: formatBrDisplay(params.checkOut),
    checkInTime,
    checkOutTime,
    nights,
    adults: params.adults,
    children: params.children,
    currency: "BRL",
    rooms,
  };
}

export interface RunOmnibeesQueryInput {
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  childAges?: string;
  rooms?: number;
}

export async function runOmnibeesAvailabilityQuery(
  input: RunOmnibeesQueryInput,
  executionConfig?: Record<string, unknown> | null
): Promise<OmnibeesAvailabilityResult> {
  const cfg = mergeConfig(executionConfig);
  const checkIn = normalizeToOmnibeesDate(String(input.checkIn));
  const checkOut = normalizeToOmnibeesDate(String(input.checkOut));
  const adults = Math.max(1, Number(input.adults ?? 2));
  const children = Math.max(0, Number(input.children ?? 0));
  const rooms = Math.max(1, Number(input.rooms ?? 1));
  const childAges = String(input.childAges ?? "").trim();

  if (calcNights(checkIn, checkOut) < 1) {
    throw new Error("Check-out deve ser posterior ao check-in.");
  }

  const cacheKey = JSON.stringify({
    checkIn,
    checkOut,
    adults,
    children,
    childAges,
    rooms,
    c: cfg.chain_id,
    q: cfg.hotel_id,
    cur: cfg.currency_id,
    lang: cfg.lang,
    base: cfg.baseUrl,
  });

  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }

  const url = buildBookingUrl(cfg, checkIn, checkOut, adults, children, childAges, rooms);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`Omnibees HTTP ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const parsed = parseAvailability(html, { checkIn, checkOut, adults, children });
  const listingUrl = buildBookingUrl(cfg, checkIn, checkOut, adults, children, childAges, rooms).toString();
  const data: OmnibeesAvailabilityResult = {
    ...parsed,
    summaryText: buildSummaryText(parsed),
    bookingUrl: listingUrl,
    hotelListingUrl: listingUrl,
  };

  cache.set(cacheKey, { at: now, data });
  return data;
}
