/** Linha de acomodação retornada por `runLodgingConsulta` / consultar_hospedagem_sunset. */
export type LodgingAccommodationLine = {
  name?: string;
  total_price?: number;
  price_per_night?: number;
  nights?: number;
  notes?: string | null;
  quoted_for_occupancy?: number;
  rooms_count?: number;
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
    const nearest = obj.nearest_open_window as
      | { check_in?: string; check_out?: string; nights?: number }
      | undefined;
    const lines = [
      "CONSULTA HOSPEDAGEM — PARQUE FECHADO na janela pedida. GATE OBRIGATÓRIO: parque precisa estar aberto para cotar hospedagem.",
      message,
      "PROIBIDO citar valores de hospedagem para a janela original.",
      "OBRIGATÓRIO neste turno: avisar o cliente que o parque estará fechado na(s) data(s) pedida(s) e que hospedagem não faz sentido nesse período.",
    ];
    if (nearest?.check_in && nearest?.check_out) {
      const nights =
        nearest.nights != null
          ? ` (${nearest.nights} noite${nearest.nights === 1 ? "" : "s"})`
          : "";
      lines.push(
        `JANELA ALTERNATIVA MAIS PRÓXIMA (parque aberto): check-in ${nearest.check_in} → check-out ${nearest.check_out}${nights}.`
      );
      lines.push(
        "OFEREÇA essa data ao cliente e pergunte se quer o orçamento de hospedagem para esse período. Se aceitar, o dispatcher deve chamar consultar_hospedagem_sunset de novo com essas datas e os mesmos guests."
      );
    } else if (suggestions) {
      lines.push(`Sugestões de calendário: ${suggestions}`);
      lines.push(
        "OFEREÇA a data aberta mais próxima ao cliente e pergunte se quer orçamento de hospedagem para esse período."
      );
    } else {
      lines.push("Sem janela alternativa cadastrada — encaminhe ao setor de reservas sem inventar valor.");
    }
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
    lines.push(`Pessoas no grupo: ${guestsPricing}.`);
  }
  const roomsInQuote = obj.rooms_in_quote;
  if (typeof roomsInQuote === "number" && roomsInQuote > 1) {
    const guestsTotal = guestsPricing ?? "?";
    lines.push(
      `ORÇAMENTO MULTI-QUARTO (${roomsInQuote} quartos/unidades para ${guestsTotal} hóspedes): total_price abaixo já é a SOMA de todas as unidades.`
    );
    lines.push(
      `TOM OBRIGATÓRIO (§3b-grupos-tom): ANTES de listar preços, escreva UMA frase natural explicando que, pelo nº de hóspedes, são necessários ${roomsInQuote} quartos (até ${Math.ceil(Number(guestsTotal) / roomsInQuote) || 4} pessoas por unidade). Ex.: "Como vocês são ${guestsTotal}, organizamos em ${roomsInQuote} quartos — o valor de cada opção já é o total do pacote para o grupo."`
    );
    lines.push(
      `PROIBIDO listar só "*CATEGORIA* — R$ X (para ${roomsInQuote} unidades)" sem essa frase introdutória.`
    );
  }
  lines.push(
    "FORMATO AO CLIENTE: §3b-formato — sem emoji; seções *Resumo*, *Opções*, *Incluso*, *Horários*, *Pagamento*; cada acomodação em UMA linha (*Nome amigável* — R$ total_price). Mapear STANDART→Chalé, LUXO DUPLO→Suíte Luxo, LUXO COM VARANDA→Suíte com Varanda. PROIBIDO STANDART/LUXO DUPLO crus."
  );
  for (const acc of sorted) {
    const name = acc.name ?? "Acomodação";
    const total = acc.total_price != null ? formatCurrencyBR(acc.total_price) : "?";
    const roomsHint =
      acc.rooms_count != null && acc.rooms_count > 1 ? ` (${acc.rooms_count} unidades)` : "";
    const occupancyHint =
      acc.quoted_for_occupancy != null
        ? ` [tarifa base até ${acc.quoted_for_occupancy} pessoas/unidade — total_price já inclui todas as unidades]`
        : "";
    const note = acc.notes?.trim() ? ` (${acc.notes.trim()})` : "";
    lines.push(`- *${name}* — ${total}${roomsHint}${occupancyHint}${note}`);
  }

  return lines.join("\n");
}
