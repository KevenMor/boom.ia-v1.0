/** Formata resultado de consultar_parque_sunset para o LLM conversacional. */
export function formatParkDayConsultaForLlm(obj: Record<string, unknown>): string | null {
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
    ? (obj.ticket_lines as Array<{ label?: string; value?: string }>)
    : [];

  const lines: string[] = [];
  lines.push(
    `CONSULTA PARQUE — data ${date}. OBRIGATÓRIO usar estes dados ao responder sobre ingresso/abertura neste turno.`
  );
  lines.push(`Status do dia: ${dayKind}${eventLabel ? ` (${eventLabel})` : ""}.`);
  lines.push(`Parque aberto para visita: ${parkOpen ? "sim" : "não"}.`);

  if (!parkOpen) {
    lines.push("Comunique gentilmente que o parque não está aberto nesta data. PROIBIDO citar valores de ingresso.");
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
    lines.push("PROIBIDO substituir por link genérico do site quando estes valores existem.");
  } else {
    lines.push(
      "Sem valores de ingresso cadastrados para esta data. Pode orientar à área de ingressos em https://sunsetthermaspark.com.br/ sem inventar R$."
    );
  }

  return lines.join("\n");
}
