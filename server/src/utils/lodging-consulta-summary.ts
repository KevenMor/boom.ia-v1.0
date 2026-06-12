/** Linha de acomodação retornada por `runLodgingConsulta` / consultar_hospedagem_sunset. */
export type LodgingAccommodationLine = {
  name?: string;
  total_price?: number;
  price_per_night?: number;
  nights?: number;
  notes?: string | null;
  quoted_for_occupancy?: number;
};

function formatCurrencyBR(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateIsoBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/**
 * Converte resultado de lodging_consulta em texto para o LLM conversacional.
 * Retorna null se o objeto não for uma consulta de hospedagem reconhecida.
 */
export function formatLodgingConsultaForLlm(obj: Record<string, unknown>): string | null {
  const status = obj.status;

  if (status === "park_closed") {
    const message = typeof obj.message === "string" ? obj.message : "Parque fechado no período.";
    const suggestions = Array.isArray(obj.suggestions)
      ? (obj.suggestions as unknown[]).map(String).filter(Boolean).join("; ")
      : "";
    const lines = ["CONSULTA HOSPEDAGEM — parque fechado na janela.", message];
    if (suggestions) lines.push(`Sugestões: ${suggestions}`);
    lines.push("PROIBIDO citar valores de hospedagem para esta janela.");
    return lines.join("\n");
  }

  if (status !== "success" || !Array.isArray(obj.available_accommodations)) {
    return null;
  }

  const accommodations = obj.available_accommodations as LodgingAccommodationLine[];
  if (accommodations.length === 0) {
    return "CONSULTA HOSPEDAGEM — nenhuma tarifa encontrada para este período/ocupação. PROIBIDO inventar valores.";
  }

  const checkIn = typeof obj.check_in === "string" ? obj.check_in : "";
  const checkOut = typeof obj.check_out === "string" ? obj.check_out : "";
  const nights = obj.nights;
  const guestsPricing = obj.guests_for_pricing;

  const sorted = [...accommodations].sort((a, b) => (a.total_price ?? 0) - (b.total_price ?? 0));

  const lines: string[] = [];
  lines.push(
    `CONSULTA HOSPEDAGEM — ${accommodations.length} opção(ões) com tarifa. OBRIGATÓRIO citar TODAS ao cliente (uma linha por categoria com preço total do pacote).`
  );
  lines.push(
    "PROIBIDO dizer que 'só há uma opção' ou listar apenas uma acomodação quando existem várias abaixo."
  );
  if (checkIn && checkOut) {
    const nightsSuffix = nights != null ? ` (${nights} noite(s))` : "";
    lines.push(
      `Período: check-in ${formatDateIsoBR(checkIn)} → check-out ${formatDateIsoBR(checkOut)}${nightsSuffix}.`
    );
  }
  if (guestsPricing != null) {
    lines.push(`Pessoas para tarifa: ${guestsPricing}.`);
  }
  lines.push("ACOMODAÇÕES (use nome + total_price em R$ na resposta):");
  for (const acc of sorted) {
    const name = acc.name ?? "Acomodação";
    const total = acc.total_price != null ? formatCurrencyBR(acc.total_price) : "?";
    const occupancyHint =
      acc.quoted_for_occupancy != null
        ? ` [tarifa para até ${acc.quoted_for_occupancy} pessoas — use total_price do pacote, NÃO confundir com diária única]`
        : "";
    const note = acc.notes?.trim() ? ` (${acc.notes.trim()})` : "";
    lines.push(`- *${name}* — ${total}${occupancyHint}${note}`);
  }

  return lines.join("\n");
}
