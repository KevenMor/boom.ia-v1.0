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
 * Extrai mencao de veiculo (marca + modelo) das ultimas mensagens.
 */
function extractVeiculoFromMessages(messages: Array<{ role: string; content: string }>): string | undefined {
  const recent = messages.slice(-10);
  const knownModels = /\b(A3|A4|Corolla|Civic|Onix|Cruze|HB20|Virtus|T-Cross|Compass|Renegade|S10|Hilux|Ranger|Tracker|Kicks|Sentra|Kombi|Gol|Polo|Jetta|Tiguan|Argo|Cronos|Mobi|Strada|Toro)\b/i;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const text = (m?.content || "").trim();
    const match = text.match(knownModels);
    if (match) {
      const yearMatch = text.match(/\b(19\d{2}|20[0-3]\d)\b/);
      const year = yearMatch ? yearMatch[1] : "";
      return year ? `${match[1]} ${year}` : match[1];
    }
  }
  return undefined;
}

/**
 * Monta notificacao de fallback com formato organizado: nome, telefone, data BR, veiculo.
 * SEMPRE em formato brasileiro (DD/MM/AAAA HH:MM). Sempre inclui telefone e veiculo.
 */
export function buildFallbackAgendaNotification(
  title: string,
  startAt: string,
  telefoneCliente?: string,
  veiculoInteresse?: string,
  messages?: Array<{ role: string; content: string }>
): string {
  const dataHoraBR = formatDateBR(startAt);
  const telefone = telefoneCliente?.trim() || "(nao informado)";
  const veiculo = veiculoInteresse?.trim() || (messages ? extractVeiculoFromMessages(messages) : undefined) || "(nao informado)";

  const nomeMatch = title.match(/^Visita\s*[-–]\s*(.+?)(?:\s*[-–]|$)/i);
  const nomeCliente = nomeMatch ? nomeMatch[1].trim() : title;

  const lines: string[] = [
    `📅 Agendamento criado: ${nomeCliente} - ${dataHoraBR || startAt}`,
    `📞 ${telefone}`,
    `🚗 Interesse: ${veiculo}`,
    "✅ Agendado automaticamente pela IA",
  ];
  return lines.join("\n");
}
