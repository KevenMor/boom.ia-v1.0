/**
 * Utilitarios para notificacao de agendamento.
 * Usado por chat-local ao criar/cancelar eventos.
 */

const WEEKDAYS_PT: Record<number, string> = {
  0: "dom.",
  1: "seg.",
  2: "ter.",
  3: "qua.",
  4: "qui.",
  5: "sex.",
  6: "sáb.",
};

/** Formata data/hora em padrao brasileiro: seg., DD/MM/AAAA, HH:MM (America/Sao_Paulo) */
export function formatDateBR(isoDate: string): string {
  if (!isoDate) return "";
  try {
    const d = new Date(isoDate);
    const brStr = d.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" });
    const br = new Date(brStr);

    const weekday = WEEKDAYS_PT[br.getDay()] || "";
    const day = String(br.getDate()).padStart(2, "0");
    const month = String(br.getMonth() + 1).padStart(2, "0");
    const year = br.getFullYear();
    const hour = String(br.getHours()).padStart(2, "0");
    const min = String(br.getMinutes()).padStart(2, "0");

    return `${weekday} ${day}/${month}/${year}, ${hour}:${min}`;
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
