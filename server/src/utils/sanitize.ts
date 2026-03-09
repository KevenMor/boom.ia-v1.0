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
    /\b(consultar_estoque|consultar_agenda|inventory_query|calendar_query)\s*[:\s]*\s*\{[^}]*\}/gim,
    ""
  );
  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return text;
}

/** Retorna true se a linha é uma linha de comando interno (ex.: ENVIAR_FOTOS_VEICULO: ...) que não deve ser exibida ao usuário. */
export function isCommandLine(line: string): boolean {
  const t = (line || "").trim();
  if (!t) return false;
  return (
    /^.*ENVIAR_FOTOS?_VEICULOS?[:\s].*$/im.test(t) ||
    /^.*HANDOFF_COMERCIAL.*$/im.test(t) ||
    /^.*\b(TOOL_CALL|FUNCTION_CALL|ACTION_OUTPUT)[:\s].*$/im.test(t) ||
    /^.*(?:Chamada da ferramenta|Consultando a ferramenta|Vou consultar a ferramenta)\s+(?:consultar_estoque|consultar_agenda|inventory_query)/im.test(t) ||
    /^.*\b(consultar_estoque|consultar_agenda|inventory_query|calendar_query)\s*[:\s]\s*\{/im.test(t)
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
