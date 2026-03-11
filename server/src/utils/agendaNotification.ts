/**
 * Utilitarios para notificacao de agendamento.
 * Usado por chat-local ao criar/cancelar eventos.
 */

/**
 * Converte data/hora para ISO com fuso de Brasília (-03:00).
 * Usado ao gravar em colunas TIMESTAMPTZ para que o instante armazenado seja o correto (ex.: 14:00 BRT).
 * Entrada sem fuso ou com +00:00 é tratada como horário local de Brasília.
 */
export function toBrasiliaISO(isoDate: string): string {
  if (!isoDate) return "";
  let s = isoDate.trim();
  if (/\+00:00$/.test(s)) s = s.replace(/\+00:00$/, "") + "-03:00";
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\s|$)/.test(s) && !/Z|[+-]\d{2}:?\d{2}$/.test(s))
    s = s.replace(/\s*$/, "") + "-03:00";
  return s;
}

/**
 * Formata data/hora em padrao brasileiro: seg., DD/MM/AAAA, HH:MM (America/Sao_Paulo).
 * Se isoDate nao tiver fuso (ex.: 2026-03-10T10:00:00), e tratado como horario de Brasilia (-03:00),
 * para nao exibir 07:00 quando o agendamento foi salvo como 10:00 local.
 */
export function formatDateBR(isoDate: string): string {
  if (!isoDate) return "";
  try {
    let toParse = isoDate.trim();
    // Z ou +00:00 = UTC correto; não alterar (ex.: 17:00Z = 14:00 BRT)
    // Se não tem timezone (ex.: 2026-03-10T10:00:00), adicionar -03:00 (tratar como Brasília)
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
 * Verifica se o cliente já informou o nome nas mensagens (ex.: "Eu sou a Maria", "Me chamo João").
 * Usado para NÃO injetar "Como posso te chamar?" quando o nome já foi dado.
 */
export function userHasProvidedNameInMessages(messages: Array<{ role: string; content: string }>): boolean {
  const patterns = [
    /(?:eu\s+)?sou\s+(?:a\s+|o\s+)?([A-Za-zÀ-ÿ]{2,30})/i,
    /(?:me\s+)?chamo\s+([A-Za-zÀ-ÿ]{2,30})/i,
    /(?:pode\s+me\s+chamar\s+de|me\s+chame\s+de)\s+([A-Za-zÀ-ÿ]{2,30})/i,
    /(?:meu\s+)?nome\s+(?:e|eh|é)\s+([A-Za-zÀ-ÿ]{2,30})/i,
  ];
  for (const m of messages) {
    if (m?.role !== "user") continue;
    const text = (m.content || "").trim();
    if (!text) continue;
    for (const re of patterns) {
      if (re.test(text)) return true;
    }
  }
  return false;
}

/**
 * Extrai nome do cliente das ultimas mensagens (ex.: apos pergunta "Como posso te chamar?" ou junto com CPF/dados).
 */
export function extractClientNameFromMessages(messages: Array<{ role: string; content: string }>): string | undefined {
  const recent = messages.slice(-15);
  const cpfPattern = /\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*[-.]?\s*\d{2}/;
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m?.role !== "user") continue;
    const text = (m.content || "").trim();
    if (!text || text.length < 3) continue;
    const line = text.split(/\n/)[0];
    if (cpfPattern.test(line)) {
    const beforeCpf = line.split(cpfPattern)[0].trim();
    const words = beforeCpf.split(/\s+/).filter((w) => w.length > 1 && !/^\d+$/.test(w));
    if (words.length >= 2 && words.length <= 4) {
      const name = words.length >= 3 ? words.slice(-2).join(" ") : words.join(" ");
      return name.replace(/[,.]/g, "").trim();
    }
    }
    if (line.length >= 2 && line.length <= 60 && !cpfPattern.test(line) && !/^\d+$/.test(line)) {
      const words = line.split(/\s+/).filter((w) => w.length > 0);
      if (words.length >= 1 && words.length <= 4 && words.every((w) => /^[A-Za-zÀ-ÿ]+$/.test(w))) return line.trim();
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

/**
 * Monta notificacao de HANDOFF para time comercial (cliente aguardando atendimento).
 * Mesmo padrao do agendamento: nome, telefone, veiculo de interesse.
 * Formato:
 *   Cliente aguardando atendimento:
 *   Nome
 *   +55...
 *   Interesse: ...
 *   Encaminhado automaticamente pela IA
 */
export function buildHandoffNotification(
  nomeCliente: string,
  telefoneCliente?: string,
  veiculoInteresse?: string,
  messages?: Array<{ role: string; content: string }>
): string {
  const nome = (nomeCliente || "").trim() || "Cliente";
  const telefone = telefoneCliente?.trim() ? formatPhone(telefoneCliente.trim()) : undefined;
  const veiculo = veiculoInteresse?.trim() || (messages ? extractVeiculoFromMessages(messages) : undefined);

  const lines: string[] = [
    "Cliente aguardando atendimento:",
    nome,
  ];
  if (telefone) lines.push(`📞 ${telefone}`);
  if (veiculo) lines.push(`🚗 Interesse: ${veiculo}`);
  lines.push("✅ Encaminhado automaticamente pela IA");
  return lines.join("\n");
}
