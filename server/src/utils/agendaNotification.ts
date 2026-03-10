/**
 * Utilitarios para notificacao de agendamento.
 * Usado por chat-local ao criar/cancelar eventos.
 */

/**
 * Formata data/hora em padrao brasileiro: seg., DD/MM/AAAA, HH:MM (America/Sao_Paulo).
 * Se isoDate nao tiver fuso (ex.: 2026-03-10T10:00:00), e tratado como horario de Brasilia (-03:00),
 * para nao exibir 07:00 quando o agendamento foi salvo como 10:00 local.
 */
export function formatDateBR(isoDate: string): string {
  if (!isoDate) return "";
  try {
    let toParse = isoDate.trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\s|$)/.test(toParse) && !/Z|[+-]\d{2}:?\d{2}$/.test(toParse)) {
      toParse = toParse.replace(/\s*$/, "") + "-03:00";
    }
    const d = new Date(toParse);
    return new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return isoDate;
  }
}

/**
 * Extrai veiculo de interesse do historico de mensagens.
 * Procura por nomes de veiculos conhecidos (carros e motos) nas ultimas mensagens.
 */
function extractVeiculoFromMessages(messages: Array<{ role: string; content: string }>): string | undefined {
  const recent = messages.slice(-20);

  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    const text = (m?.content || "").trim();
    if (!text) continue;

    const vehiclePattern = /(?:interesse|veículo|veiculo|carro|moto|modelo|procurando|quer ver|olhar)[:\s]*(.{3,80})/i;
    const match = text.match(vehiclePattern);
    if (match) {
      return match[1].replace(/[.!?,;]+$/, "").trim();
    }
  }

  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m?.role !== "assistant") continue;
    const text = (m.content || "").trim();

    const stockMatch = text.match(/(?:Temos uma|Encontrei|temos o|temos a|Confira)[:\s]*(.{5,100})/i);
    if (stockMatch) {
      const cleaned = stockMatch[1].split("\n")[0].replace(/[.!?,;]+$/, "").trim();
      if (cleaned.length > 3) return cleaned;
    }
  }

  return undefined;
}

/**
 * Formata telefone com +55 se necessario.
 */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return phone;
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  if (digits.length >= 10 && digits.length <= 11) return `+55${digits}`;
  return `+${digits}`;
}

/**
 * Monta notificacao de agendamento CRIADO.
 * Formato:
 *   📅 Agendamento criado:
 *   Nome
 *   seg., DD/MM/AAAA, HH:MM
 *   📞 +5515998023871
 *   🚗 Interesse: Yamaha XTZ Lander 250 azul
 *   ✅ Agendado automaticamente pela IA
 */
export function buildFallbackAgendaNotification(
  title: string,
  startAt: string,
  telefoneCliente?: string,
  veiculoInteresse?: string,
  messages?: Array<{ role: string; content: string }>
): string {
  const dataHoraBR = formatDateBR(startAt);
  const telefone = telefoneCliente?.trim() ? formatPhone(telefoneCliente.trim()) : undefined;
  const veiculo = veiculoInteresse?.trim() || (messages ? extractVeiculoFromMessages(messages) : undefined);

  const nomeMatch = title.match(/^Visita\s*[-–]\s*(.+?)(?:\s*[-–]|$)/i);
  const nomeCliente = nomeMatch ? nomeMatch[1].trim() : title;

  const lines: string[] = [
    "📅 Agendamento criado:",
    nomeCliente,
    dataHoraBR || startAt,
  ];
  if (telefone) lines.push(`📞 ${telefone}`);
  if (veiculo) lines.push(`🚗 Interesse: ${veiculo}`);
  lines.push("✅ Agendado automaticamente pela IA");
  return lines.join("\n");
}

/**
 * Monta notificacao de agendamento CANCELADO.
 * Formato:
 *   ❌ Agendamento cancelado:
 *   Nome
 *   seg., DD/MM/AAAA, HH:MM
 */
export function buildCancelNotification(
  title: string,
  startAt: string
): string {
  const dataHoraBR = formatDateBR(startAt);
  const nomeMatch = title.match(/^Visita\s*[-–]\s*(.+?)(?:\s*[-–]|$)/i);
  const nomeCliente = nomeMatch ? nomeMatch[1].trim() : title;

  const lines: string[] = [
    "❌ Agendamento cancelado:",
    nomeCliente,
    dataHoraBR || startAt,
  ];
  return lines.join("\n");
}
