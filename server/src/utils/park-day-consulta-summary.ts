/** Formata resultado de consultar_parque_sunset para o LLM conversacional. */

type ParkDayLine = { label?: string; value?: string };
type ParkDayRow = {
  date?: string;
  day_kind?: string;
  park_open?: boolean;
  event_label?: string | null;
  ticket_lines?: ParkDayLine[];
};

function formatSingleDayForLlm(obj: Record<string, unknown>): string | null {
  const status = obj.status;
  const date = typeof obj.date === "string" ? obj.date : "";

  if (status === "no_data") {
    const message = typeof obj.message === "string" ? obj.message : "Sem registro no calendário.";
    return [
      "CONSULTA PARQUE — sem registro cadastrado para esta data.",
      message,
      "PROIBIDO inventar valores de ingresso. Pode orientar à área de ingressos do site oficial.",
    ].join("\n");
  }

  if (status !== "success") return null;

  const dayKind = typeof obj.day_kind === "string" ? obj.day_kind : "aberto";
  const parkOpen = obj.park_open === true;
  const eventLabel = typeof obj.event_label === "string" ? obj.event_label : null;
  const ticketLines = Array.isArray(obj.ticket_lines)
    ? (obj.ticket_lines as ParkDayLine[])
    : [];

  const lines: string[] = [];
  lines.push(
    `CONSULTA PARQUE — data ${date}. OBRIGATÓRIO usar estes dados ao responder sobre ingresso/abertura neste turno.`
  );
  lines.push(`Status do dia: ${dayKind}${eventLabel ? ` (${eventLabel})` : ""}.`);
  lines.push(`Parque aberto para visita: ${parkOpen ? "sim" : "não"}.`);

  if (!parkOpen) {
    lines.push("Comunique gentilmente que o parque não está aberto nesta data. PROIBIDO citar valores de ingresso.");
    const nextOpen =
      typeof obj.next_open_date === "string" && obj.next_open_date.trim()
        ? obj.next_open_date.trim()
        : null;
    if (nextOpen) {
      lines.push(`PRÓXIMA DATA COM PARQUE ABERTO no calendário: ${nextOpen}. Informe ao cliente e ofereça essa data se fizer sentido.`);
    }
    return lines.join("\n");
  }

  if (ticketLines.length > 0) {
    lines.push("INGRESSOS CADASTRADOS (cite ao cliente — use label + value literalmente):");
    for (const line of ticketLines) {
      const label = line.label?.trim() ?? "";
      const value = line.value?.trim() ?? "";
      if (label && value) lines.push(`- ${label}: ${value}`);
      else if (value) lines.push(`- ${value}`);
      else if (label) lines.push(`- ${label}`);
    }
    lines.push(
      "Some os valores de ticket_lines conforme faixa etária e quantidade de pessoas do cliente — cite o total exato da soma, sem arredondar nem inventar."
    );
    lines.push(
      "Comparação Thermas Card (§3g-compare): calcule ingresso avulso para **5 pessoas** (titular + 4 dependentes) — multiplique o valor unitário × 5 e mostre a conta."
    );
    lines.push("PROIBIDO substituir por link genérico do site quando estes valores existem.");
  } else {
    lines.push(
      "Sem valores de ingresso cadastrados para esta data. Pode orientar à área de ingressos em https://sunsetthermaspark.com.br/ sem inventar R$."
    );
  }

  return lines.join("\n");
}

function formatRangeForLlm(obj: Record<string, unknown>): string {
  const dateFrom = typeof obj.date_from === "string" ? obj.date_from : "";
  const dateTo = typeof obj.date_to === "string" ? obj.date_to : "";
  const days = Array.isArray(obj.days) ? (obj.days as ParkDayRow[]) : [];
  const closedDates = Array.isArray(obj.closed_dates)
    ? (obj.closed_dates as string[]).filter(Boolean)
    : [];
  const openDates = Array.isArray(obj.open_dates)
    ? (obj.open_dates as string[]).filter(Boolean)
    : [];

  const lines: string[] = [];
  lines.push(
    `CONSULTA PARQUE — período ${dateFrom} a ${dateTo}. OBRIGATÓRIO usar SOMENTE os dias abaixo ao responder.`
  );
  lines.push(`Todos os dias abertos: ${obj.all_park_open === true ? "sim" : "não"}.`);

  for (const day of days) {
    const d = day.date ?? "?";
    const kind = day.day_kind ?? "no_data";
    const open = day.park_open === true;
    lines.push(`- ${d}: ${kind} — parque aberto: ${open ? "sim" : "não"}.`);
  }

  if (closedDates.length > 0) {
    lines.push(`DIAS FECHADOS/SEM OPERAÇÃO: ${closedDates.join(", ")}.`);
  }
  if (openDates.length > 0) {
    lines.push(`DIAS ABERTOS: ${openDates.join(", ")}.`);
  }

  lines.push(
    "PROIBIDO afirmar abertura ou fechamento de qualquer data que não esteja listada acima. PROIBIDO inventar que um dia está aberto só porque outro dia do período está fechado."
  );

  const nextOpen =
    typeof obj.next_open_date === "string" && obj.next_open_date.trim()
      ? obj.next_open_date.trim()
      : null;
  if (nextOpen && closedDates.length > 0) {
    lines.push(`PRÓXIMA DATA COM PARQUE ABERTO após o período: ${nextOpen}.`);
  }

  const message = typeof obj.message === "string" ? obj.message : "";
  if (message) lines.push(message);

  return lines.join("\n");
}

export function formatParkDayConsultaForLlm(obj: Record<string, unknown>): string | null {
  if (obj.mode === "range" && obj.status === "success") {
    return formatRangeForLlm(obj);
  }
  return formatSingleDayForLlm(obj);
}
