/**
 * Divino Chalé: "de amanhã para sábado" vira uma estadia check_in/check_out.
 * O dispatcher às vezes não chama a tool, ou manda start_date/end_date.
 */

export type DivinoStay = { check_in: string; check_out: string };

const WEEKDAY: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const DATE_TOKEN =
  "hoje|amanha|depois de amanha|domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado|\\d{1,2}/\\d{1,2}(?:/\\d{2,4})?";

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function todayIsoSaoPaulo(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function nextWeekday(fromIso: string, target: number, exclusive: boolean): string {
  let iso = exclusive ? addDays(fromIso, 1) : fromIso;
  for (let i = 0; i < 8; i++) {
    if (weekdayOf(iso) === target) return iso;
    iso = addDays(iso, 1);
  }
  return iso;
}

function resolveToken(token: string, today: string, notBefore?: string): string | null {
  const t = stripAccents(token).replace(/-feira$/, "").trim();
  if (t === "hoje") return today;
  if (t === "amanha") return addDays(today, 1);
  if (t === "depois de amanha") return addDays(today, 2);
  if (WEEKDAY[t] !== undefined) {
    return nextWeekday(notBefore ?? today, WEEKDAY[t], Boolean(notBefore));
  }
  const dm = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (!dm) return null;
  const day = Number(dm[1]);
  const month = Number(dm[2]);
  let year = dm[3] ? Number(dm[3]) : Number(today.slice(0, 4));
  if (year < 100) year += 2000;
  let iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (!dm[3] && iso < today) {
    year += 1;
    iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return iso;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** 31.01.02 no fim do ano = noites de 31/12, 01/01 e 02/01. Saída na manhã do dia 3. */
function parseYearEndStay(raw: string, today: string): DivinoStay | null {
  const listed = raw.match(/\b(\d{1,2})[.\s,]+(\d{1,2})[.\s,]+(\d{1,2})\b/);
  const nums = listed ? [Number(listed[1]), Number(listed[2]), Number(listed[3])] : [];
  const yearEndShape = nums.length === 3 && nums[0] >= 28 && nums[0] <= 31 && nums[1] <= 7 && nums[2] <= 7;
  const mentionsYearEnd = /final do ano|ano novo|reveillon|virada/.test(raw);
  if (!yearEndShape && !mentionsYearEnd) return null;

  const year = Number(today.slice(0, 4));
  if (yearEndShape) {
    const isos = nums.map((n) => (n >= 28 ? isoDate(year, 12, n) : isoDate(year + 1, 1, n)));
    isos.sort();
    let checkIn = isos[0];
    let last = isos[isos.length - 1];
    if (checkIn < today) {
      checkIn = addDays(checkIn, 365);
      last = addDays(last, 365);
    }
    return { check_in: checkIn, check_out: addDays(last, 1) };
  }

  let checkIn = isoDate(year, 12, 31);
  if (checkIn < today) checkIn = isoDate(year + 1, 12, 31);
  return { check_in: checkIn, check_out: addDays(checkIn, 1) };
}

function looksLikeDateReply(raw: string): boolean {
  return (
    /final do ano|ano novo|reveillon|virada/.test(raw) ||
    /\d{1,2}[./]\d{1,2}(?:[./]\d{1,2,4})?/.test(raw) ||
    new RegExp(`\\b(?:${DATE_TOKEN})\\b`).test(raw)
  );
}

/** Uma estadia quando o cliente pede vaga/valor com data, ou responde com a data. Sem data, null. */
export function extractDivinoLodgingStay(text: string, now: Date = new Date()): DivinoStay | null {
  const raw = stripAccents(text).replace(/(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, "$1/$2/$3");
  const today = todayIsoSaoPaulo(now);
  const yearEnd = parseYearEndStay(raw, today);
  if (yearEnd) return yearEnd;

  const dotted = raw.replace(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\b/g, (_m, d, mo, y) =>
    y ? `${d}/${mo}/${y}` : `${d}/${mo}`,
  );
  const dated = dotted;
  if (!/disponib|vaga|reserv|alug|hosped|chale|diaria|valor|quanto/.test(dated) && !looksLikeDateReply(dated)) {
    return null;
  }
  const rawForDates = dated;

  const range = rawForDates.match(
    new RegExp(
      `\\b(?:de|do)\\s+(${DATE_TOKEN})\\s+(?:para|pra|ate|pro)\\s+(${DATE_TOKEN})`,
    ),
  );
  if (range) {
    const checkIn = resolveToken(range[1], today);
    if (!checkIn) return null;
    let checkOut = resolveToken(range[2], today);
    if (!checkOut) return null;
    if (checkOut === checkIn) checkOut = addDays(checkIn, 1);
    else if (checkOut < checkIn) {
      const later = resolveToken(range[2], today, checkIn);
      checkOut = later && later > checkIn ? later : addDays(checkIn, 1);
    }
    return { check_in: checkIn, check_out: checkOut };
  }

  const single = rawForDates.match(new RegExp(`\\b(${DATE_TOKEN})\\b`));
  if (!single) return null;
  const checkIn = resolveToken(single[1], today);
  if (!checkIn) return null;
  return { check_in: checkIn, check_out: addDays(checkIn, 1) };
}

type ToolCall = { id: string; function: { name: string; arguments: string } };

function isCalendarName(name: string, calendarToolName: string): boolean {
  const n = name.toLowerCase();
  return n === calendarToolName.toLowerCase() || n === "consultar_evento" || n === "calendar_query";
}

/**
 * Se o cliente pediu data e o dispatcher não chamou o calendário (ou chamou sem estadia),
 * injeta check_lodging com check_in/check_out.
 */
export function ensureDivinoCheckLodgingCall(params: {
  isDivino: boolean;
  calls: ToolCall[];
  userText: string;
  calendarToolName: string;
  now?: Date;
}): ToolCall[] {
  if (!params.isDivino) return params.calls;
  const stay = extractDivinoLodgingStay(params.userText, params.now);
  if (!stay) {
    if (params.calls.length > 0) return params.calls;
    const open = stripAccents(params.userText);
    if (/gostaria dessas datas|qualquer data|qualquer dia|pode ser qualquer/.test(open)) {
      return [
        {
          id: "call_divino_sugerir",
          function: {
            name: params.calendarToolName || "consultar_evento",
            arguments: JSON.stringify({ action: "sugerir_datas", preference: "any", limit: 3 }),
          },
        },
      ];
    }
    return params.calls;
  }

  const idx = params.calls.findIndex((tc) => isCalendarName(tc.function.name, params.calendarToolName));
  const payload = JSON.stringify({
    action: "check_lodging",
    check_in: stay.check_in,
    check_out: stay.check_out,
  });

  if (idx === -1) {
    if (params.calls.length > 0) return params.calls;
    return [
      ...params.calls,
      {
        id: `call_divino_lodging_${stay.check_in}`,
        function: { name: params.calendarToolName || "consultar_evento", arguments: payload },
      },
    ];
  }

  let args: Record<string, unknown> = {};
  try {
    args = JSON.parse(params.calls[idx].function.arguments || "{}") as Record<string, unknown>;
  } catch {
    args = {};
  }
  const action = String(args.action || "check_lodging").toLowerCase();
  if (action === "excluir" || action === "sugerir_datas" || action === "cancelar") return params.calls;
  const hasStay = Boolean(args.check_in || args.start_date || args.data_entrada || args.date);
  if (hasStay) return params.calls;

  const next = params.calls.slice();
  next[idx] = {
    ...params.calls[idx],
    function: { ...params.calls[idx].function, arguments: payload },
  };
  return next;
}
