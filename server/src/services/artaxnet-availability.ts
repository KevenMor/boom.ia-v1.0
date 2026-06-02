/**
 * Consulta read-only de disponibilidade/preços no motor Artaxnet (GET /api/rooms).
 */
const DEFAULT_BASE_URL = "https://pousada-flores-do-lazaro.artaxnet.com";
const CACHE_TTL_MS = 10 * 60 * 1000;

export interface ArtaxnetOtaComparisonRow {
  otaName: string;
  commissionPercent: number;
  approximateTotal: number;
}

export interface ArtaxnetRateRow {
  board: string;
  payment: string;
  minimumNights: number | null;
  cancellationPolicy: string;
  totalPrice: number;
  currency: string;
}

export interface ArtaxnetRoomRow {
  roomName: string;
  imageUrl: string | null;
  description: string | null;
  directTotal: number;
  cheapestRate: ArtaxnetRateRow;
  otaComparison?: ArtaxnetOtaComparisonRow[];
}

export interface ArtaxnetAvailabilityResult {
  hotel: string;
  checkIn: string;
  checkOut: string;
  checkInTime: string | null;
  checkOutTime: string | null;
  nights: number;
  adults: number;
  children: number;
  currency: string;
  rooms: ArtaxnetRoomRow[];
  roomCount: number;
  summaryText: string;
  bookingUrl: string;
  cartId: string | null;
  otaComparisonEnabled: boolean;
  otas: Array<{ otaName: string; commissionPercent: number }>;
}

interface CacheEntry {
  at: number;
  data: ArtaxnetAvailabilityResult;
}

interface ArtaxnetOtaMeta {
  ota_name: string;
  commission: number;
  logo?: string;
}

interface ArtaxnetRoomOffer {
  price: number;
  rejected?: boolean;
  room_type?: {
    name?: string;
    description?: string;
    files?: Array<{ uri?: string }>;
  };
  rateplan?: {
    board?: { name?: string };
    mn?: number;
    label?: string;
  };
  cancellation_policy?: Record<string, string>;
  property?: {
    name?: string;
    checkin?: string;
    checkout?: string;
    profile?: { active_otas_comparation?: number };
  };
}

interface ArtaxnetRoomsResponse {
  rooms?: Record<string, ArtaxnetRoomOffer[]>;
  roomsUnavailable?: Record<string, ArtaxnetRoomOffer[]>;
  cart?: { id?: string };
  otas?: ArtaxnetOtaMeta[];
}

const cache = new Map<string, CacheEntry>();

function mergeConfig(exec?: Record<string, unknown> | null): { baseUrl: string } {
  const e = exec || {};
  const baseUrl =
    typeof e.base_url === "string" && e.base_url.trim()
      ? e.base_url.trim().replace(/\/+$/, "")
      : DEFAULT_BASE_URL;
  return { baseUrl };
}

function parseDdMmYyyy(s: string): Date {
  if (!/^\d{8}$/.test(s)) throw new Error(`Data inválida (esperado DDMMYYYY): ${s}`);
  const dd = s.slice(0, 2);
  const mm = s.slice(2, 4);
  const yyyy = s.slice(4, 8);
  return new Date(`${yyyy}-${mm}-${dd}T12:00:00`);
}

export function normalizeToArtaxnetQueryDate(input: string): string {
  const t = input.trim();
  if (/^\d{8}$/.test(t)) {
    return `${t.slice(4, 8)}/${t.slice(2, 4)}/${t.slice(0, 2)}`;
  }
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}/${mm}/${dd}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}/${m}/${d}`;
  }
  throw new Error(`Formato de data não reconhecido: ${input}. Use DDMMYYYY, DD/MM/YYYY ou YYYY-MM-DD.`);
}

export function normalizeToIsoDate(input: string): string {
  const t = input.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  if (/^\d{8}$/.test(t)) {
    return `${t.slice(4, 8)}-${t.slice(2, 4)}-${t.slice(0, 2)}`;
  }
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) {
    const [, dd, mm, yyyy] = br;
    return `${yyyy}-${mm}-${dd}`;
  }
  throw new Error(`Formato de data não reconhecido: ${input}`);
}

function calcNights(checkInIso: string, checkOutIso: string): number {
  const a = new Date(`${checkInIso}T12:00:00`).getTime();
  const b = new Date(`${checkOutIso}T12:00:00`).getTime();
  const n = Math.round((b - a) / (1000 * 60 * 60 * 24));
  return n > 0 ? n : 0;
}

function formatBrDisplayFromIso(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/** "02:00 PM" → "14h" */
export function normalizeArtaxnetCheckTime(raw: string | undefined | null): string | null {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const ampm = m12[3].toUpperCase();
    if (ampm === "PM" && h < 12) h += 12;
    if (ampm === "AM" && h === 12) h = 0;
    return `${h}h`;
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return `${parseInt(m24[1], 10)}h`;
  return t;
}

/** Mesma fórmula do frontend Artaxnet EBE (`otaCotation`). */
export function computeOtaApproximatePrice(directPrice: number, commissionPercent: number): number {
  const approx = directPrice + (directPrice * commissionPercent) / 100;
  return Math.round(approx * 100) / 100;
}

function buildOtaComparisonRows(
  directPrice: number,
  otas: ArtaxnetOtaMeta[]
): ArtaxnetOtaComparisonRow[] {
  return otas.map((ota) => ({
    otaName: ota.ota_name,
    commissionPercent: ota.commission,
    approximateTotal: computeOtaApproximatePrice(directPrice, ota.commission),
  }));
}

function pickBestOffer(offers: ArtaxnetRoomOffer[]): ArtaxnetRoomOffer | null {
  const valid = offers.filter((o) => o && o.rejected !== true && typeof o.price === "number" && o.price > 0);
  if (valid.length === 0) return null;
  return valid.reduce((min, o) => (o.price < min.price ? o : min), valid[0]);
}

export function parseArtaxnetRoomsResponse(
  json: ArtaxnetRoomsResponse,
  params: {
    checkInIso: string;
    checkOutIso: string;
    adults: number;
    children: number;
    baseUrl: string;
  }
): Omit<ArtaxnetAvailabilityResult, "summaryText"> {
  const roomsMap = json.rooms || {};
  const otas = (json.otas || []).map((o) => ({
    otaName: o.ota_name,
    commissionPercent: o.commission,
  }));

  const byName = new Map<string, ArtaxnetRoomOffer[]>();
  for (const offers of Object.values(roomsMap)) {
    if (!Array.isArray(offers)) continue;
    for (const offer of offers) {
      const name = (offer.room_type?.name || "").trim();
      if (!name) continue;
      const list = byName.get(name) || [];
      list.push(offer);
      byName.set(name, list);
    }
  }

  let hotel = "Pousada";
  let checkInTime: string | null = null;
  let checkOutTime: string | null = null;
  let otaComparisonEnabled = false;

  const rooms: ArtaxnetRoomRow[] = [];
  for (const [roomName, offers] of byName.entries()) {
    const best = pickBestOffer(offers);
    if (!best) continue;

    if (best.property?.name) hotel = best.property.name;
    if (!checkInTime) checkInTime = normalizeArtaxnetCheckTime(best.property?.checkin);
    if (!checkOutTime) checkOutTime = normalizeArtaxnetCheckTime(best.property?.checkout);
    if (best.property?.profile?.active_otas_comparation === 1) otaComparisonEnabled = true;

    const board = best.rateplan?.board?.name?.trim() || "Café da manhã";
    const payment = best.rateplan?.label?.trim() || "";
    const mn = typeof best.rateplan?.mn === "number" ? best.rateplan.mn : null;
    const cancellationPolicy =
      best.cancellation_policy?.["pt-BR"] ||
      best.cancellation_policy?.["pt"] ||
      Object.values(best.cancellation_policy || {})[0] ||
      "";

    const imageUrl = best.room_type?.files?.[0]?.uri?.trim() || null;
    const directTotal = best.price;
    const cheapestRate: ArtaxnetRateRow = {
      board,
      payment,
      minimumNights: mn,
      cancellationPolicy,
      totalPrice: directTotal,
      currency: "R$",
    };

    const row: ArtaxnetRoomRow = {
      roomName,
      imageUrl,
      description: best.room_type?.description?.trim() || null,
      directTotal,
      cheapestRate,
    };

    if (otaComparisonEnabled && otas.length > 0) {
      row.otaComparison = buildOtaComparisonRows(directTotal, json.otas || []);
    }

    rooms.push(row);
  }

  rooms.sort((a, b) => a.roomName.localeCompare(b.roomName, "pt-BR"));

  const nights = calcNights(params.checkInIso, params.checkOutIso);
  const cartId = json.cart?.id?.trim() || null;
  const bookingUrl = cartId
    ? `${params.baseUrl}/?cart_id=${encodeURIComponent(cartId)}`
    : params.baseUrl;

  return {
    hotel,
    checkIn: formatBrDisplayFromIso(params.checkInIso),
    checkOut: formatBrDisplayFromIso(params.checkOutIso),
    checkInTime,
    checkOutTime,
    nights,
    adults: params.adults,
    children: params.children,
    currency: "BRL",
    rooms,
    roomCount: rooms.length,
    bookingUrl,
    cartId,
    otaComparisonEnabled,
    otas,
  };
}

export function buildSummaryText(
  data: Omit<ArtaxnetAvailabilityResult, "summaryText">,
  options?: { includeOtaComparison?: boolean }
): string {
  if (data.rooms.length === 0) {
    return `Nenhuma acomodação com tarifa encontrada para ${data.checkIn} a ${data.checkOut} (${data.nights} noites, ${data.adults} adultos${data.children ? `, ${data.children} crianças` : ""}).`;
  }

  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const periodAnchor = `Período desta consulta: entrada ${data.checkIn}, saída ${data.checkOut} (${data.nights} noite(s)). Cada valor abaixo vale somente para estas datas.`;
  const lines: string[] = [periodAnchor];

  for (const r of data.rooms) {
    const c = r.cheapestRate;
    const photoPrefix = r.imageUrl ? `![Foto - ${r.roomName}](${r.imageUrl})\n` : "";
    const payPart = c.payment ? ` ${c.payment}.` : "";
    const mnPart =
      c.minimumNights && c.minimumNights > 1
        ? ` Mínimo de ${c.minimumNights} noite(s) nesta tarifa.`
        : "";
    lines.push(
      `${photoPrefix}${r.roomName}: TOTAL para ${data.nights} noite(s): R$ ${fmt(c.totalPrice)} (${c.board}).${payPart}${mnPart}`
    );
  }

  if (data.checkInTime && data.checkOutTime) {
    lines.push(
      `Horários nesta página da reserva (Artaxnet): check-in a partir das ${data.checkInTime}, check-out até ${data.checkOutTime}.`
    );
  }

  const showOta = options?.includeOtaComparison !== false && data.otaComparisonEnabled && data.otas.length > 0;
  if (showOta && data.rooms.length > 0) {
    const ref = data.rooms[0];
    lines.push(
      "Comparação estimada (mesma lógica do site — valores aproximados nas OTAs; usar só se o cliente hesitar ou citar Booking/Expedia):"
    );
    lines.push(`Tarifa direta (referência ${ref.roomName}): R$ ${fmt(ref.directTotal)}`);
    for (const ota of ref.otaComparison || []) {
      lines.push(`${ota.otaName} (aprox. +${ota.commissionPercent}%): R$ ${fmt(ota.approximateTotal)}`);
    }
  }

  return lines.join("\n");
}

export interface RunArtaxnetQueryInput {
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
  kids?: number;
  coupon?: string;
}

export async function runArtaxnetAvailabilityQuery(
  input: RunArtaxnetQueryInput,
  executionConfig?: Record<string, unknown> | null
): Promise<ArtaxnetAvailabilityResult> {
  const cfg = mergeConfig(executionConfig);
  const checkInIso = normalizeToIsoDate(String(input.checkIn));
  const checkOutIso = normalizeToIsoDate(String(input.checkOut));
  const adults = Math.max(1, Number(input.adults ?? 2));
  const children = Math.max(0, Number(input.children ?? input.kids ?? 0));
  const coupon = String(input.coupon ?? "").trim();

  if (calcNights(checkInIso, checkOutIso) < 1) {
    throw new Error("Check-out deve ser posterior ao check-in.");
  }

  const cacheKey = JSON.stringify({
    checkInIso,
    checkOutIso,
    adults,
    children,
    coupon,
    base: cfg.baseUrl,
  });

  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (hit && now - hit.at < CACHE_TTL_MS) {
    return hit.data;
  }

  const start = normalizeToArtaxnetQueryDate(String(input.checkIn));
  const end = normalizeToArtaxnetQueryDate(String(input.checkOut));
  const url = new URL(`${cfg.baseUrl}/api/rooms`);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);
  url.searchParams.set("adults", String(adults));
  url.searchParams.set("kids", String(children));
  url.searchParams.set("coupon", coupon);

  const resp = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (compatible; BoomIA/1.0)",
    },
  });

  if (!resp.ok) {
    throw new Error(`Artaxnet API HTTP ${resp.status}`);
  }

  const json = (await resp.json()) as ArtaxnetRoomsResponse;
  const parsed = parseArtaxnetRoomsResponse(json, {
    checkInIso,
    checkOutIso,
    adults,
    children,
    baseUrl: cfg.baseUrl,
  });
  const summaryText = buildSummaryText(parsed);
  const result: ArtaxnetAvailabilityResult = { ...parsed, summaryText };

  cache.set(cacheKey, { at: now, data: result });
  return result;
}
