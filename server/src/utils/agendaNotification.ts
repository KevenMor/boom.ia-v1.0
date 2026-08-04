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
 * Prefere mensagens do cliente e modelos citados; evita fragmentos da fala da IA
 * (bug clássico: `moto` casava dentro de "Motors" e virava "rs de Sorocaba…").
 */
const VEHICLE_MODEL_HINTS = [
  "camaro", "maverick", "corolla", "civic", "hilux", "s10", "onix", "tracker",
  "compass", "renegade", "toro", "strada", "argo", "mobi", "polo", "virtus",
  "jetta", "golf", "t-cross", "tcross", "nivus", "hr-v", "hrv", "creta", "hb20",
  "kwid", "kicks", "versa", "sentra", "frontier", "ranger", "amarok", "sw4",
  "sw-4", "pajero", "l200", "saveiro", "gol", "voyage", "a3", "a4", "q3", "q5",
  "x1", "x3", "320i", "glc", "gla", "c180", "lander", "xtz", "fazer", "factor",
  "bros", "cg ", "pop ", "nmax", "pcx", "biz ", "mt-03", "mt03", "cb 500", "cb500",
  "r1250", "gsx", "ninja", "z400", "duke",
];

const INTEREST_JUNK =
  /\b(lgpd|prote[cç][aã]o de dados|processo [eé] bem|normas da|vou cuidar|como posso te chamar|sou a ana|ppl motors|atendimento por aqui|outra op[cç][aã]o pra voc[eê]|falar com (um )?atendente|quero falar|humano|atendente)\b/i;

function cleanInterestCandidate(raw: string): string | undefined {
  let s = raw
    .replace(/\s+/g, " ")
    .replace(/^[\s:.\-–—]+/, "")
    .replace(/[.!?,;:]+$/g, "")
    .trim();

  // Corta prosa longa da IA após o modelo (primeira sentença curta)
  const sentenceBreak = s.search(/[.!?](?:\s|$)/);
  if (sentenceBreak > 8 && sentenceBreak < 70) {
    s = s.slice(0, sentenceBreak).trim();
  }
  if (s.length > 72) s = s.slice(0, 72).replace(/\s+\S*$/, "").trim();

  if (s.length < 3 || s.length > 80) return undefined;
  if (INTEREST_JUNK.test(s)) return undefined;
  // Fragmentos que começam com conector / resto de palavra ("rs de Sorocaba", "ou se temos")
  if (/^(rs|ou|e|de|da|do|na|no|em|pra|para|aqui|segue|com|sem|falar)\b/i.test(s)) return undefined;
  if (/^(já|ja)\s+vi\b/i.test(s)) return undefined;
  return s;
}

function extractModelMention(text: string): string | undefined {
  for (const hint of VEHICLE_MODEL_HINTS) {
    const escaped = hint.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Boundary: evita "versa" dentro de "conversa", "gol" dentro de palavras, etc.
    const re = new RegExp(`(?:^|[^A-Za-z0-9À-ÿ])(${escaped}[A-Za-z0-9À-ÿ\\s\\-.]{0,28})`, "i");
    const orig = text.match(re);
    if (!orig?.[1]) continue;
    let chunk = orig[1].trim();
    // Inclui token anterior se parecer marca (Ford, Chevrolet…)
    const before = text.slice(Math.max(0, (orig.index ?? 0) - 16), orig.index ?? 0);
    const brand = before.match(/\b([A-Za-zÀ-ÿ]{2,12})\s*$/);
    if (brand && !/^(seu|uma|um|o|a|na|no|em|de|da|do|e|já|ja|vi|meu|minha)$/i.test(brand[1])) {
      chunk = `${brand[1]} ${chunk}`.trim();
    }
    const cleaned = cleanInterestCandidate(
      chunk.replace(/\s+(e|e vou|vou|já|ja|como|qual|você|voce|pra|para|fica|segue)\b[\s\S]*$/i, "").trim(),
    );
    if (cleaned && /[A-Za-zÀ-ÿ]/.test(cleaned)) return cleaned;
  }
  return undefined;
}

export function extractVeiculoFromMessages(
  messages: Array<{ role: string; content: string }>
): string | undefined {
  const recent = messages.slice(-24);

  // 1) Mensagens do cliente — menção explícita a modelo
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m?.role !== "user") continue;
    const text = (m.content || "").trim();
    if (!text || text.length < 2) continue;
    const fromModel = extractModelMention(text);
    if (fromModel) return fromModel;

    const userInterest = text.match(
      /\b(?:interesse|interessado|procurando|olhando|buscando)\b(?:\s+(?:n[oa]|em|por|um[a]?|o|a))?\s+(.{2,60})/i,
    );
    if (userInterest) {
      const cleaned = cleanInterestCandidate(userInterest[1]);
      if (cleaned) return cleaned;
    }
    const queroVeiculo = text.match(
      /\bquero\s+(?:ver|conhecer|olhar)?\s*(?:um[a]?\s+)?([A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s\-.]{1,40})/i,
    );
    if (queroVeiculo && !/\batendente\b|\bhumano\b/i.test(queroVeiculo[1])) {
      const cleaned = cleanInterestCandidate(queroVeiculo[1]);
      if (cleaned && extractModelMention(cleaned)) return cleaned;
    }
  }

  // 2) Assistente — só padrões explícitos de interesse/apresentação de estoque
  for (let i = recent.length - 1; i >= 0; i--) {
    const m = recent[i];
    if (m?.role !== "assistant") continue;
    const text = (m.content || "").trim();
    if (!text) continue;
    // Ignora mensagens institucionais (LGPD, processo, etc.)
    if (INTEREST_JUNK.test(text) && !/\binteresse\s+(?:n[oa]|em|pelo?|pela)\s+/i.test(text)) {
      continue;
    }

    const interestIn = text.match(
      /\b(?:seu\s+)?interesse\s+(?:n[oa]|em|pelo?|pela)\s+(.{3,55})/i,
    );
    if (interestIn) {
      const cleaned = cleanInterestCandidate(interestIn[1]);
      if (cleaned) return cleaned;
    }

    const fromModel = extractModelMention(text);
    if (fromModel) return fromModel;

    const stockMatch = text.match(
      /\b(?:Temos uma|Encontrei|temos o|temos a|Confira)\s+(.{5,55})/i,
    );
    if (stockMatch) {
      const cleaned = cleanInterestCandidate(stockMatch[1].split("\n")[0]);
      if (cleaned) return cleaned;
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
 * Bloqueia frases de agradecimento/confirmação (ex.: "Ok obrigada", "ah simm obrigada").
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
 * Bancos, financeiras e marcas frequentes em conversas — não usar como nome da pessoa.
 */
const INSTITUTION_NAME_TOKENS = new Set(
  [
    "sicred", "sicredi", "bradesco", "itau", "santander", "nubank",
    "caixa", "cef", "banco", "inter", "c6", "neon", "original", "safra",
    "pan", "bv", "btg", "mercadopago", "picpay", "bancodobrasil",
    "financiamento", "financeira", "credsystem", "omni",
    "yamaha", "honda", "bmw", "fiat", "vw", "volkswagen", "chevrolet",
    "toyota", "renault", "jeep", "hyundai",
    "vale", "suico", "suiço", "valesuico", "resort",
  ].map((t) => normalizeNameToken(t))
);

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
  messages?: Array<{ role: string; content: string }>,
  motivo?: string
): string {
  const nome = (nomeCliente || "").trim() || "Cliente";
  const telefone = telefoneCliente?.trim() ? formatPhone(telefoneCliente.trim()) : undefined;
  const veiculo = veiculoInteresse?.trim() || (messages ? extractVeiculoFromMessages(messages) : undefined);
  const motivoTrim = motivo?.trim();

  const lines: string[] = [
    "Cliente aguardando atendimento:",
    nome,
  ];
  if (telefone) lines.push(`📞 ${telefone}`);
  if (veiculo) lines.push(`🚗 Interesse: ${veiculo}`);
  if (motivoTrim) lines.push(`📝 Motivo: ${motivoTrim}`);
  lines.push("✅ Encaminhado automaticamente pela IA");
  return lines.join("\n");
}

/** Pedidos / intenções recentes do cliente (heurística, sem LLM). */
export function extractClientRequestsFromMessages(
  messages: Array<{ role: string; content: string }>,
): string | undefined {
  const userTexts = messages
    .filter((m) => m.role === "user")
    .map((m) => (m.content || "").replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 8 && t.length <= 220)
    .slice(-6);

  if (userTexts.length === 0) return undefined;

  const intentRe =
    /\b(valor|pre[cç]o|or[cç]amento|proposta|financi|parcela|visita|agendar|agendamento|fotos?|dispon|quero|gostaria|preciso|informa[cç][oõ]es?|detalhe|condi[cç][oõ]es)\b/i;

  const hits = userTexts.filter((t) => intentRe.test(t));
  const picks = (hits.length > 0 ? hits : userTexts).slice(-3);
  const joined = picks.join(" · ");
  if (joined.length > 280) return `${joined.slice(0, 277).trim()}…`;
  return joined;
}

export function inferHandoffUrgency(
  messages: Array<{ role: string; content: string }>,
  motivo?: string,
): string {
  const blob = `${motivo || ""}\n${messages
    .slice(-12)
    .map((m) => m.content || "")
    .join("\n")}`.toLowerCase();

  if (/\b(urg[eê]nte|hoje|agora|imediato|o mais r[aá]pido)\b/.test(blob)) {
    return "Alta — pediu atendimento rápido / hoje";
  }
  if (/\b(proposta|fechar|fechar neg[oó]cio|comprar|fechar o neg[oó]cio|pronto para)\b/.test(blob)) {
    return "Lead qualificado — pronto para conversa comercial";
  }
  if (/\b(valor|pre[cç]o|or[cç]amento|financi)\b/.test(blob)) {
    return "Média — pediu valores / condições";
  }
  return "Normal — aguardando continuidade humana";
}

/**
 * Nota privada no Chatwoot (só a equipe vê) após transferir o atendimento.
 * Estilo “resumo completo” para o agente humano assumir o contexto.
 */
export function buildHandoffPrivateNote(opts: {
  nomeCliente?: string;
  telefoneCliente?: string;
  veiculoInteresse?: string;
  motivo?: string;
  messages?: Array<{ role: string; content: string }>;
  agentName?: string;
}): string {
  const messages = opts.messages ?? [];
  const nome =
    (opts.nomeCliente || "").trim() ||
    extractClientNameFromMessages(messages) ||
    "Cliente";
  const telefone = opts.telefoneCliente?.trim()
    ? formatPhone(opts.telefoneCliente.trim())
    : undefined;
  const interesse =
    opts.veiculoInteresse?.trim() ||
    (messages.length ? extractVeiculoFromMessages(messages) : undefined);
  const pedidos = messages.length ? extractClientRequestsFromMessages(messages) : undefined;
  const urgencia = inferHandoffUrgency(messages, opts.motivo);
  const motivo = opts.motivo?.trim();
  const geradoPor = opts.agentName?.trim() || "Boom IA";

  const lines: string[] = [
    "📋 Resumo do atendimento (interno)",
    "",
    `Nome: ${nome}`,
  ];
  if (telefone) lines.push(`Telefone: ${telefone}`);
  if (interesse) lines.push(`Interesse: ${interesse}`);
  if (pedidos) lines.push(`Pedidos recentes: ${pedidos}`);
  lines.push(`Urgência: ${urgencia}`);
  if (motivo) lines.push(`Motivo do handoff: ${motivo}`);
  lines.push("");
  lines.push(`✨ Gerado automaticamente por ${geradoPor}`);
  return lines.join("\n");
}
