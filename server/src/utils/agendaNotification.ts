/**
 * Utilitarios para notificacao de agendamento.
 * Usado por chat-local ao criar/cancelar eventos.
 */

/** Formata data/hora em padrao brasileiro DD/MM/AAAA HH:MM (America/Sao_Paulo) */
export function formatDateBR(isoDate: string): string {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    });
  } catch {
    return isoDate;
  }
}

/**
 * Monta notificacao de fallback (sem LLM) com formato organizado: nome, telefone, data BR, veiculo.
 * Extrai nome do titulo quando no formato "Visita - Nome" ou "Visita - Nome - ...".
 */
export function buildFallbackAgendaNotification(
  title: string,
  startAt: string,
  telefoneCliente?: string,
  veiculoInteresse?: string
): string {
  const dataHoraBR = formatDateBR(startAt);
  const lines: string[] = [];
  const nomeMatch = title.match(/^Visita\s*[-–]\s*(.+?)(?:\s*[-–]|$)/i);
  const nomeCliente = nomeMatch ? nomeMatch[1].trim() : title;
  lines.push(`📅 Agendamento criado: ${nomeCliente}${dataHoraBR ? ` - ${dataHoraBR}` : ""}`);
  if (telefoneCliente) lines.push(`📞 ${telefoneCliente}`);
  if (veiculoInteresse) lines.push(`🚗 Interesse: ${veiculoInteresse}`);
  lines.push("✅ Agendado automaticamente pela IA");
  return lines.join("\n");
}
