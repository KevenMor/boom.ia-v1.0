export type ConversationGrowthGranularity = "month" | "year";

export interface ConversationUsageRow {
  conversation_id: string | null;
  created_at: string;
}

export interface ConversationGrowthPoint {
  label: string;
  periodKey: string;
  conversas: number;
}

const TZ = "America/Sao_Paulo";

function toLocalDateKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ });
}

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function yearKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 4);
}

function buildMonthBuckets(count: number, now = new Date()): string[] {
  const buckets: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(1);
    d.setHours(12, 0, 0, 0);
    d.setMonth(d.getMonth() - i);
    buckets.push(d.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 7));
  }
  return buckets;
}

function buildYearBuckets(count: number, now = new Date()): string[] {
  const currentYear = Number(now.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 4));
  return Array.from({ length: count }, (_, idx) => String(currentYear - (count - 1 - idx)));
}

function formatMonthLabel(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short" });
}

function firstActivityByConversation(rows: ConversationUsageRow[]): Map<string, string> {
  const firstSeen = new Map<string, string>();
  for (const row of rows) {
    if (!row.conversation_id) continue;
    const dateKey = toLocalDateKey(row.created_at);
    const existing = firstSeen.get(row.conversation_id);
    if (!existing || dateKey < existing) {
      firstSeen.set(row.conversation_id, dateKey);
    }
  }
  return firstSeen;
}

export function buildConversationGrowthChart(
  rows: ConversationUsageRow[],
  granularity: ConversationGrowthGranularity,
  bucketCount: number,
  now = new Date(),
): ConversationGrowthPoint[] {
  const buckets =
    granularity === "month" ? buildMonthBuckets(bucketCount, now) : buildYearBuckets(bucketCount, now);
  const counts = new Map<string, number>(buckets.map((key) => [key, 0]));
  const firstSeen = firstActivityByConversation(rows);

  for (const dateKey of firstSeen.values()) {
    const periodKey = granularity === "month" ? monthKeyFromDateKey(dateKey) : yearKeyFromDateKey(dateKey);
    if (!counts.has(periodKey)) continue;
    counts.set(periodKey, (counts.get(periodKey) ?? 0) + 1);
  }

  return buckets.map((periodKey) => ({
    periodKey,
    label: granularity === "month" ? formatMonthLabel(periodKey) : periodKey,
    conversas: counts.get(periodKey) ?? 0,
  }));
}

export function buildConversationGrowthSeries(rows: ConversationUsageRow[], now = new Date()) {
  return {
    monthly: buildConversationGrowthChart(rows, "month", 7, now),
    annual: buildConversationGrowthChart(rows, "year", 4, now),
  };
}
