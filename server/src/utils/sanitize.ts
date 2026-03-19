export function sanitizeLLMOutput(content: string): string {
  let text = content;

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (
        parsed.action ||
        parsed.action_input ||
        parsed.tool ||
        parsed.function ||
        parsed.consultar_estoque ||
        parsed.query
      ) {
        console.warn("[Sanitize] Detected full-JSON action object response — stripping entirely");
        return "";
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  text = text.replace(/^.*ENVIAR_FOTOS?_VEICULOS?[:\s].*$/gim, "");
  text = text.replace(/^.*ENVIAR_VIDEO_DETALHES[:\s].*$/gim, "");
  text = text.replace(/^.*HANDOFF_COMERCIAL.*$/gim, "");
  text = text.replace(/^.*\b(TOOL_CALL|FUNCTION_CALL|ACTION_OUTPUT)[:\s].*$/gim, "");
  text = text.replace(
    /^\s*\{[\s\S]*?"(action|action_input|modelo|marca|tool|function|query|search|consultar_estoque)"[\s\S]*?\}\s*$/gim,
    ""
  );
  text = text.replace(
    /\{\s*"(action|action_input|modelo|marca|tool_name|function_name|consultar_estoque)"[^}]*\}/gi,
    ""
  );
  text = text.replace(
    /^.*(?:vou (?:verificar|consultar|checar|buscar)|verificando|consultando|buscando).*(?:sistema|estoque|banco).*[:]\s*$/gim,
    ""
  );
  text = text.replace(
    /^.*(?:Chamada da ferramenta|Consultando a ferramenta|Vou consultar a ferramenta)\s+(?:consultar_estoque|consultar_agenda|inventory_query)[:\s].*$/gim,
    ""
  );
  text = text.replace(
    /\b(consultar_estoque|consultar_agenda|consultar_base_conhecimento|inventory_query|calendar_query|rag_search)\s*[:\s]*\s*\{[^}]*\}/gim,
    ""
  );
  // Linhas que contêm chamada de ferramenta no formato nome(...) — remover a linha inteira
  text = text
    .split("\n")
    .filter((line) => !/\b(consultar_estoque|consultar_agenda|consultar_base_conhecimento|inventory_query|calendar_query|rag_search)\s*\(/.test(line))
    .join("\n");
  // Blocos JSON de memória (ex.: {"memory":{"nome_cliente":"..."}})
  text = text.replace(/\s*\{\s*"memory"\s*:\s*\{[^}]*\}\s*\}\s*/g, "");
  // Tool call vazando como texto (horario_periodo = tool(...))
  text = text.replace(/\bhorario_periodo\s*=\s*tool\s*\([^)]*\)\s*/gim, "");
  // consultar_base_conhecimento(pergunta="...") vazando como texto
  text = text.replace(/\bconsultar_base_conhecimento\s*\([^)]*\)\s*/gim, "");
  // tool_code / assign_agent / chatwoot_assign vazando como texto (ex.: tool_code print(json.dumps(...)))
  text = text.replace(/\*\*?tool_code[\s\S]*?\)\s*\)\*\*?/gim, "");
  text = text.replace(/tool_code[\s\S]*?\)\s*\)(?=\s|$|\.|,|;)/gim, "");
  text = text.replace(/\b(assign_agent|atribuir_agente|chatwoot_assign)\s*\(\s*[^)]*\)/gim, "");
  text = text.replace(/\bprint\s*\(\s*(?:json\.dumps\s*)?\([^)]*assign_agent[^)]*\)\s*\)/gim, "");
  // Marcador explícito de dispatcher/tool vazando para o cliente (ex.: [CHAMAR FERRAMENTA marcar_lead])
  text = text.replace(/\[\s*CHAMAR\s+FERRAMENTA[^\]]*\]/gim, "");
  // Sentinel interno do dispatcher não deve aparecer para o cliente
  text = text.replace(/\bNO_TOOLS_NEEDED\b/gim, "");
  // Guard interno de follow-up jamais deve vazar para o cliente
  text = text.replace(/^\s*\[SISTEMA\s+INTERNO\s*[-—]\s*FOLLOW-UP\s+GUARD\]\s*$/gim, "");
  text = text.replace(/^.*Responda\s+APENAS\s+com\s+uma\s+destas\s+palavras:.*$/gim, "");
  text = text.replace(/^\s*[-•]?\s*SEND\s*=\s*.*$/gim, "");
  text = text.replace(/^\s*[-•]?\s*SKIP\s*=\s*.*$/gim, "");
  text = text.replace(/^.*Analise\s+o\s+hist[óo]rico\s+desta\s+conversa\..*$/gim, "");
  text = text.replace(/^.*O\s+cliente\s+deixou\s+claro\s+que\s+N[ÃA]O\s+quer\s+prosseguir.*$/gim, "");
  // Resposta do guard isolada também não deve ir ao cliente
  if (/^\s*(SEND|SKIP)\s*$/im.test(text.trim())) return "";
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  // Remove pergunta duplicada de nome (ambas perguntam a mesma coisa — "Com quem eu falo?" e "Como posso te chamar?")
  if (/\bCom quem eu falo\?/i.test(text) && /\bComo posso te chamar\?/i.test(text)) {
    text = text.replace(/\s+Como posso te chamar\?\s*/gi, " ").trim();
  }

  // Restauração de acentuação em português (Gemini 2.0 Flash costuma omitir)
  text = restorePortugueseAccents(text);

  // Remove conteúdo repetido (ex.: mesmo texto 2x ou 3x — bug no painel ao exibir)
  text = deduplicateRepeatedContent(text);

  return text;
}

/** Remove conteúdo repetido (ex.: mesmo texto 2x ou 3x na mesma mensagem) */
function deduplicateRepeatedContent(text: string): string {
  const t = text.trim();
  if (t.length < 60) return t;
  const len = t.length;
  // 2x: primeira metade = segunda metade
  const half = Math.floor(len / 2);
  const first = t.slice(0, half).trim();
  const second = t.slice(half).trim();
  if (first.length > 30 && first === second) return first;
  // 3x: primeiro terço repetido
  const third = Math.floor(len / 3);
  const unit = t.slice(0, third).trim();
  if (unit.length > 20) {
    const r2 = t.slice(third, 2 * third).trim();
    const r3 = t.slice(2 * third).trim();
    if (unit === r2 && unit === r3) return unit;
  }
  // Sufixo repetido 2x ou 3x (ex.: "Intro. Pergunta?Pergunta?Pergunta?")
  const minUnit = 20;
  for (let L = Math.min(Math.floor(len / 3), 500); L >= minUnit; L--) {
    const suffix = t.slice(-L);
    if (t.endsWith(suffix + suffix + suffix)) return t.slice(0, -2 * L).trim();
    if (t.endsWith(suffix + suffix)) return t.slice(0, -L).trim();
  }
  return t;
}

/** Corrige palavras comuns em português que modelos como Gemini costumam retornar sem acento. Exportada para uso no stream. */
export function restorePortugueseAccents(text: string): string {
  const replacements: [RegExp, string][] = [
    [/\bvoce\b/gi, "você"],
    [/\bnao\b/gi, "não"],
    [/\botimo\b/gi, "ótimo"],
    [/\botima\b/gi, "ótima"],
    [/\bhospede\b/gi, "hóspede"],
    [/\bhospedes\b/gi, "hóspedes"],
    [/\bfamilia\b/gi, "família"],
    [/\btambem\b/gi, "também"],
    [/\btera\b/gi, "terá"],
    [/\batencao\b/gi, "atenção"],
    [/\bpreocupacao\b/gi, "preocupação"],
    [/\bseguranca\b/gi, "segurança"],
    [/\bcastracao\b/gi, "castração"],
    [/\bmarcacao\b/gi, "marcação"],
    [/\balem\b/gi, "além"],
    [/\bdoencas\b/gi, "doenças"],
    [/\bserias\b/gi, "sérias"],
    [/\bobrigatoria\b/gi, "obrigatória"],
    [/\bobrigatorio\b/gi, "obrigatório"],
    [/\bsocializacao\b/gi, "socialização"],
    [/\badaptacao\b/gi, "adaptação"],
    [/\bcompativel\b/gi, "compatível"],
    [/\bcompativeis\b/gi, "compatíveis"],
    [/\bcaes\b/gi, "cães"],
    [/\bcae\b/gi, "cão"],
    [/\brecebera\b/gi, "receberá"],
    [/\bnoticias\b/gi, "notícias"],
    [/\bcameras\b/gi, "câmeras"],
    [/\bcamera\b/gi, "câmera"],
    [/\braca\b/gi, "raça"],
    [/\bracas\b/gi, "raças"],
    [/\brapida\b/gi, "rápida"],
    [/\brapido\b/gi, "rápido"],
    [/\binformacao\b/gi, "informação"],
    [/\binformacoes\b/gi, "informações"],
    [/\boperacao\b/gi, "operação"],
    [/\bavaliacao\b/gi, "avaliação"],
    [/\bconexao\b/gi, "conexão"],
  ];
  let result = text;
  for (const [regex, replacement] of replacements) {
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * Fallback quando sanitizeLLMOutput retorna vazio mas o conteúdo parece texto conversacional.
 * Remove apenas linhas de comando explícitas e retorna o resto, ou "" se não sobrar nada útil.
 */
export function fallbackSanitizeForRetry(content: string): string {
  const t = (content || "").trim();
  if (!t) return "";
  if (t.startsWith("{") && t.endsWith("}")) return "";
  const lines = t.split("\n");
  const kept = lines.filter((line) => !isCommandLine(line + "\n"));
  const result = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return result || "";
}

/** Retorna true se a linha é uma linha de comando interno (ex.: ENVIAR_FOTOS_VEICULO: ...) que não deve ser exibida ao usuário. */
export function isCommandLine(line: string): boolean {
  const t = (line || "").trim();
  if (!t) return false;
  return (
    /^.*ENVIAR_FOTOS?_VEICULOS?[:\s].*$/im.test(t) ||
    /^.*ENVIAR_VIDEO_DETALHES[:\s].*$/im.test(t) ||
    /^.*HANDOFF_COMERCIAL.*$/im.test(t) ||
    /^.*\b(TOOL_CALL|FUNCTION_CALL|ACTION_OUTPUT)[:\s].*$/im.test(t) ||
    /\[\s*CHAMAR\s+FERRAMENTA[^\]]*\]/im.test(t) ||
    /^\s*NO_TOOLS_NEEDED\s*$/im.test(t) ||
    /^\s*\[SISTEMA\s+INTERNO\s*[-—]\s*FOLLOW-UP\s+GUARD\]\s*$/im.test(t) ||
    /^.*Responda\s+APENAS\s+com\s+uma\s+destas\s+palavras:.*$/im.test(t) ||
    /^\s*[-•]?\s*SEND\s*=\s*.*$/im.test(t) ||
    /^\s*[-•]?\s*SKIP\s*=\s*.*$/im.test(t) ||
    /^\s*(SEND|SKIP)\s*$/im.test(t) ||
    /^.*Analise\s+o\s+hist[óo]rico\s+desta\s+conversa\..*$/im.test(t) ||
    /^.*O\s+cliente\s+deixou\s+claro\s+que\s+N[ÃA]O\s+quer\s+prosseguir.*$/im.test(t) ||
    /^.*(?:Chamada da ferramenta|Consultando a ferramenta|Vou consultar a ferramenta)\s+(?:consultar_estoque|consultar_agenda|consultar_base_conhecimento|inventory_query)/im.test(t) ||
    /^.*\b(consultar_estoque|consultar_agenda|consultar_base_conhecimento|inventory_query|calendar_query|rag_search)\s*[:\s]\s*\{/im.test(t) ||
    /\b(consultar_estoque|consultar_agenda|consultar_base_conhecimento|inventory_query|calendar_query|rag_search)\s*\(/im.test(t) ||
    // Tool call vazando como texto (horario_periodo, busca_contexto, etc.)
    /\bhorario_periodo\s*=\s*tool\s*\(/im.test(t) ||
    /\btool\s*\(\s*["']horario_periodo["']/im.test(t) ||
    /\b(horario_periodo|busca_contexto|buscacontexto)\s*\(/im.test(t) ||
    // JSON de memória vazando
    /^\s*["']?memory["']?\s*:\s*\{/im.test(t) ||
    /^\s*["']?nome_cliente["']?\s*:\s*["']/im.test(t) ||
    /^\s*["']?ts["']?\s*:\s*["']\d{4}-\d{2}-\d{2}T/im.test(t)
  );
}

/** Dado um buffer de texto e um novo chunk, retorna { toSend, newBuffer }: conteúdo filtrado para enviar e o novo buffer. */
export function filterCommandLinesFromStream(buffer: string, chunk: string): { toSend: string; newBuffer: string } {
  let acc = buffer + chunk;
  let toSend = "";
  let idx: number;
  while ((idx = acc.indexOf("\n")) !== -1) {
    const line = acc.slice(0, idx + 1);
    acc = acc.slice(idx + 1);
    if (!isCommandLine(line)) toSend += line;
  }
  return { toSend, newBuffer: acc };
}

export function stripEmojis(content: string): string {
  return content
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "")
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .replace(/[\u{20E3}]/gu, "")
    .replace(/[\u{E0020}-\u{E007F}]/gu, "")
    .replace(/  +/g, " ")
    .trim();
}

/** Remove prefixo "*Nome:*" do Chatwoot para normalizar conteúdo e evitar duplicata ao salvar (webhook + queue). */
export function stripChatwootNamePrefix(content: string): string {
  return (content || "").replace(/^\*{1,2}[^*\n]+:\*{1,2}\s*\n?/gm, "").trim();
}
