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

function normalizeNameToken(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Frases que nunca devem ser usadas como nome do cliente. */
const BLOCKLIST_NOME = new Set([
  "aguardar para followup",
  "aguardar",
  "followup",
  "como posso te chamar",
  "como posso te ajudar",
  "oi",
  "olá",
  "ola",
  "bom dia",
  "boa tarde",
  "boa noite",
  "ok",
  "tudo bem",
  "obrigado",
  "obrigada",
  "sim",
  "não",
  "nao",
  "cliente",
  "quero falar",
  "quero falar com um atendente",
  "atendente",
  "humano",
]);

/**
 * Verifica se o candidato não deve ser usado como nome do cliente.
 * Bloqueia frases de agradecimento/confirmação (ex.: "Ok obrigada", "ah simm obrigada")
 * que o extractClientNameFromMessages erroneamente capturava da última mensagem do usuário.
 */
export function isBlockedAsName(candidate: string): boolean {
  const norm = candidate.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (BLOCKLIST_NOME.has(norm)) return true;
  if (/\b(aguardar|followup|follow.?up)\b/i.test(norm)) return true;
  if (/\b(obrigad[oa]|obrigad[oa]s?)\b/i.test(norm)) return true;
  if (/^(ok|ah)\s+/i.test(norm) && norm.split(/\s+/).length <= 4) return true;
  return false;
}

/**
 * Bancos, financeiras e marcas frequentes em conversas de veículos — não usar como nome da pessoa.
 */
const INSTITUTION_NAME_TOKENS = new Set(
  [
    "sicred",
    "sicredi",
    "bradesco",
    "itau",
    "santander",
    "nubank",
    "caixa",
    "cef",
    "banco",
    "inter",
    "c6",
    "neon",
    "original",
    "safra",
    "pan",
    "bv",
    "btg",
    "mercadopago",
    "picpay",
    "bancodobrasil",
    "financiamento",
    "financeira",
    "credsystem",
    "omni",
    "yamaha",
    "honda",
    "bmw",
    "fiat",
    "vw",
    "volkswagen",
    "chevrolet",
    "toyota",
    "renault",
    "jeep",
    "hyundai",
  ].map((t) => normalizeNameToken(t))
);

/** Texto exibido na notificação de handoff quando o nome não foi inferido do histórico. */
export const HANDOFF_NAME_NOT_IDENTIFIED = "Nome não foi identificado";

export function containsInstitutionNameToken(candidate: string): boolean {
  const words = candidate.trim().split(/\s+/).filter((w) => w.length > 0);
  for (const w of words) {
    const base = w.replace(/^[.,]+|[.,]+$/g, "");
    if (base.length < 2) continue;
    const n = normalizeNameToken(base);
    if (INSTITUTION_NAME_TOKENS.has(n)) return true;
  }
  return false;
}

const EXPLICIT_NAME_CAPTURES: RegExp[] = [
  /(?:eu\s+)?sou\s+(?:a\s+|o\s+)?([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i,
  /(?:me\s+)?chamo\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i,
  /(?:pode\s+me\s+chamar\s+de|me\s+chame\s+de)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i,
  /(?:meu\s+)?nome\s+(?:e|eh|é)\s+([A-Za-zÀ-ÿ]+(?:\s+[A-Za-zÀ-ÿ]+){0,3})/i,
];

function tryExtractExplicitNameFromText(text: string): string | undefined {
  const t = text.trim();
  if (!t) return undefined;
  for (const re of EXPLICIT_NAME_CAPTURES) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const raw = m[1].replace(/[,.;:!?]+$/g, "").trim();
    if (raw.length < 2 || raw.length > 80) continue;
    if (isBlockedAsName(raw)) continue;
    if (containsInstitutionNameToken(raw)) continue;
    return raw;
  }
  return undefined;
}

function isValidHistoryPersonName(candidate: string): boolean {
  if (!candidate.trim()) return false;
  if (isBlockedAsName(candidate)) return false;
  if (containsInstitutionNameToken(candidate)) return false;
  return true;
}

/**
 * Verifica se o cliente já informou o nome nas mensagens (ex.: "Eu sou a Maria", "Me chamo João").
 * Usado para NÃO injetar "Como posso te chamar?" quando o nome já foi dado.
 */
export function userHasProvidedNameInMessages(messages: Array<{ role: string; content: string }>): boolean {
  for (const m of messages) {
    if (m?.role !== "user") continue;
    const text = (m.content || "").trim();
    if (!text) continue;
    if (tryExtractExplicitNameFromText(text)) return true;
    const line = text.split(/\n/)[0];
    const words = line.split(/\s+/).filter((w) => w.length > 0);
    if (words.length >= 1 && words.length <= 4 && words.every((w) => /^[A-Za-zÀ-ÿ]+$/.test(w))) {
      if (isValidHistoryPersonName(line.trim())) return true;
    }
  }
  return false;
}

/**
 * Extrai nome do cliente das ultimas mensagens (ex.: apos pergunta "Como posso te chamar?" ou junto com CPF/dados).
 * Ordem: frases explicitas ("me chamo..."), linha com CPF, linha 2-4 palavras só letras, uma palavra só se não for instituição.
 */
export function extractClientNameFromMessages(messages: Array<{ role: string; content: string }>): string | undefined {
  const recent = messages.slice(-15);
  const cpfPattern = /\d{3}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*[-.]?\s*\d{2}/;

  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m?.role !== "user") continue;
    const text = (m.content || "").trim();
    if (!text || text.length < 2) continue;
    const explicit = tryExtractExplicitNameFromText(text);
    if (explicit) return explicit;
  }

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
        const cleaned = name.replace(/[,.]/g, "").trim();
        if (cleaned && isValidHistoryPersonName(cleaned)) return cleaned;
      }
    }
    if (line.length >= 2 && line.length <= 60 && !cpfPattern.test(line) && !/^\d+$/.test(line)) {
      const words = line.split(/\s+/).filter((w) => w.length > 0);
      if (words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Za-zÀ-ÿ]+$/.test(w))) {
        const candidate = line.trim();
        if (isValidHistoryPersonName(candidate)) return candidate;
      }
      if (words.length === 1 && words.every((w) => /^[A-Za-zÀ-ÿ]+$/.test(w))) {
        const candidate = line.trim();
        if (isValidHistoryPersonName(candidate)) return candidate;
      }
    }
  }
  return undefined;
}

/** Dígitos do telefone (BR / WhatsApp): pelo menos 10 para considerar válido. */
export function isPhoneLikeDigits(value: string): boolean {
  const d = value.replace(/\D/g, "");
  return d.length >= 10;
}

/**
 * Extrai número de telefone nas últimas mensagens do usuário (padrões comuns BR).
 */
export function extractPhoneFromMessages(messages: Array<{ role: string; content: string }>): string | undefined {
  const recent = messages.slice(-20);
  const patterns: RegExp[] = [
    /\+?55\s*\(?\d{2}\)?\s*\d{4,5}\s*[-.\s]?\d{4}\b/g,
    /\(?\d{2}\)?\s*\d{4,5}\s*[-.\s]?\d{4}\b/g,
    /\b\d{2}\s+\d{8,9}\b/g,
    /\b(?:whatsapp|zap|cel|fone|telefone)\s*[:\s]?\s*(\+?55?\s*\d[\d\s().-]{8,18}\d)/gi,
  ];

  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m?.role !== "user") continue;
    const text = m.content || "";
    if (!text.trim()) continue;

    for (const re of patterns) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      const matches: string[] = [];
      while ((match = re.exec(text)) !== null) {
        const g = (match[1] || match[0]).trim();
        if (g) matches.push(g);
      }
      for (const raw of matches.reverse()) {
        if (isPhoneLikeDigits(raw)) return raw;
      }
    }

    const digitRuns = text.match(/\d[\d\s().-]{8,22}\d/g);
    if (digitRuns) {
      for (const run of digitRuns.reverse()) {
        if (isPhoneLikeDigits(run)) return run.trim();
      }
    }
  }
  return undefined;
}

/**
 * Telefone para notificação: prioriza external_user_id se tiver dígitos suficientes; senão extrai do histórico.
 */
export function resolveHandoffPhone(
  externalUserId?: string | null,
  messages?: Array<{ role: string; content: string }>
): string | undefined {
  const ext = externalUserId?.trim() ?? "";
  if (ext && isPhoneLikeDigits(ext)) return ext;
  if (messages && messages.length > 0) {
    const fromMsg = extractPhoneFromMessages(messages);
    if (fromMsg) return fromMsg;
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
 * Monta notificacao de agendamento REMARCADO.
 * Formato:
 *   🔄 Agendamento remarcado:
 *   Nome
 *   De: seg., DD/MM/AAAA, HH:MM
 *   Para: seg., DD/MM/AAAA, HH:MM
 *   ✅ Remarcado automaticamente pela IA
 */
export function buildRescheduleNotification(
  title: string,
  oldStartAt: string,
  newStartAt: string
): string {
  const oldDataHoraBR = formatDateBR(oldStartAt);
  const newDataHoraBR = formatDateBR(newStartAt);
  const nomeMatch = title.match(/^Visita\s*[-–]\s*(.+?)(?:\s*[-–]|$)/i);
  const nomeCliente = nomeMatch ? nomeMatch[1].trim() : title;

  const lines: string[] = [
    "🔄 Agendamento remarcado:",
    nomeCliente,
    `De: ${oldDataHoraBR || oldStartAt}`,
    `Para: ${newDataHoraBR || newStartAt}`,
    "✅ Remarcado automaticamente pela IA",
  ];
  return lines.join("\n");
}

/**
 * Formata data/hora atual em padrão brasileiro (DD/MM/AAAA, HH:MM).
 */
function formatNowBR(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

/**
 * Monta notificacao de HANDOFF para time (cliente aguardando atendimento humano).
 * Formato padrao (v2.1.0):
 *   Aguarda um atendimento humano
 *   Telefone: ...
 *
 * Removido: Nome do cliente (capturado incorretamente muitas vezes pelo agente)
 */
export function buildHandoffNotification(
  nomeCliente: string,
  telefoneCliente?: string,
  _veiculoInteresse?: string,
  _messages?: Array<{ role: string; content: string }>,
  motivo?: string
): string {
  let telefone = "Não informado";
  const rawTel = telefoneCliente?.trim();
  if (rawTel && isPhoneLikeDigits(rawTel)) {
    telefone = formatPhone(rawTel);
  }

  const header = motivo?.trim() ? motivo.trim() : "Aguarda um atendimento humano";
  const lines: string[] = [
    header,
    "",
    `Telefone: ${telefone}`,
  ];
  return lines.join("\n");
}
