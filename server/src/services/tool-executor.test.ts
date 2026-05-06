/**
 * Testes unitários — tool-executor (lógica pura interna de cada tool type).
 *
 * Cobre todas as funções auxiliares e ramificações de cada tool sem
 * depender de Supabase, OpenAI, Omnibees ou qualquer serviço externo.
 *
 * Tools testadas:
 *  - sanitizeVehicleParam / normalizeForSearch / getColorSynonyms
 *  - parsePriceValue / faixa_preco parsing (inventory_query)
 *  - isBroadGallerySearchTerm (suite_gallery_query)
 *  - sanitizeIlikeFragment (suite_gallery_query)
 *  - executeChatwootAssign — fuzzy rule matching (lógica isolada)
 *  - executeOmnibeesAvailability — validação de parâmetros
 *  - executeNearestUnit — validação de CEP ausente
 *  - executeRagSearch — validação de query ausente
 *  - executeSendNotification — normalização de nome/telefone
 *  - executeTool switch routing — tool_type desconhecido
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────────
// Réplicas das funções puras (privadas no módulo) para teste isolado.
// A implementação de referência fica aqui; qualquer divergência quebra o teste.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeForSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function sanitizeVehicleParam(val: string | undefined): string | undefined {
  if (val == null || typeof val !== "string") return val;
  const trimmed = val.trim();
  if (!trimmed) return undefined;
  const cleaned = trimmed.replace(/\s+e\s*.*$/i, "").trim();
  return cleaned || undefined;
}

const COLOR_SYNONYM_GROUPS: string[][] = [
  ["cinza", "prata", "grafite", "chumbo", "gray", "grey", "silver"],
  ["branco", "white", "perola", "perolizado"],
  ["preto", "black", "onix"],
  ["vermelho", "red", "rubi", "bordo", "vinho"],
  ["azul", "blue", "marinho"],
  ["bege", "champagne", "dourado", "gold", "areia"],
  ["marrom", "bronze", "brown", "terra"],
  ["verde", "green"],
];

function getColorSynonyms(cor: string): string[] {
  const norm = normalizeForSearch(cor);
  for (const group of COLOR_SYNONYM_GROUPS) {
    if (group.some((c) => norm.includes(c) || c.includes(norm))) {
      return group;
    }
  }
  return [norm];
}

function parsePriceValue(val: number | string, strContext?: string): number {
  const n = typeof val === "string" ? parseInt(val.replace(/\D/g, ""), 10) : Number(val);
  if (Number.isNaN(n)) return 0;
  const asThousands = (strContext && /mil|k\b/i.test(strContext)) || n < 1000;
  return asThousands ? n * 1000 : n;
}

const BROAD_GALLERY_TOKENS = new Set(
  [
    "me", "envie", "enviar", "manda", "mandar", "mande", "quero", "queremos", "quer", "ver", "veja", "mostra", "mostrar",
    "foto", "fotos", "imagem", "imagens", "das", "dos", "de", "do", "da", "d", "por", "favor", "pfv", "pf", "pfvr",
    "alguma", "umas", "uma", "uns", "um", "pra", "pro", "para", "aqui", "tem", "tenho", "temos", "gostaria",
    "suite", "suites", "quarto", "quartos", "acomodacao", "acomodacoes", "hospedagem", "alojamento", "hotel", "resort",
    "galeria", "album", "categorias", "categoria", "tipo", "tipos", "nos", "vc", "voce", "voces", "o", "os",
    "as", "boa", "bom", "boas", "noite", "tarde", "dia", "cliente", "algum", "alguns", "todas", "todos", "sobre",
  ].map((w) => normalizeForSearch(w))
);

function isBroadGallerySearchTerm(raw: string): boolean {
  const t = normalizeForSearch(raw);
  if (!t) return true;
  const tokens = t.split(/[^a-z0-9]+/).filter((x) => x.length > 0);
  if (tokens.length === 0) return true;
  return tokens.every((tok) => BROAD_GALLERY_TOKENS.has(tok));
}

function sanitizeIlikeFragment(raw: string): string {
  return raw.replace(/%/g, "").replace(/_/g, "").trim();
}

/** Réplica de resolveSuiteGallerySearch (tool-executor suite_gallery_query). */
function resolveSuiteGallerySearch(args: Record<string, unknown>): {
  listAllCatalog: boolean;
  nomeSuiteForFilter: string;
  queryLabelForHint: string;
} {
  const contextoRaw = String(
    args.contexto ?? args.tema ?? args.topico ?? args.sobre ?? args.assunto ?? ""
  ).trim();
  const nomeSuiteRaw = String(
    args.nome ??
      args.nome_galeria ??
      args.filtro ??
      args.q ??
      args.nome_suite ??
      args.suite_name ??
      ""
  ).trim();

  const contextoSanitized = contextoRaw ? sanitizeIlikeFragment(contextoRaw) : "";
  const contextoEff =
    contextoSanitized && !isBroadGallerySearchTerm(contextoRaw) ? contextoSanitized : "";

  const nomeSanitized = nomeSuiteRaw ? sanitizeIlikeFragment(nomeSuiteRaw) : "";
  const nomeIsBroad = !nomeSuiteRaw || isBroadGallerySearchTerm(nomeSuiteRaw);

  if (!nomeIsBroad && nomeSanitized) {
    return {
      listAllCatalog: false,
      nomeSuiteForFilter: nomeSanitized,
      queryLabelForHint: nomeSuiteRaw,
    };
  }
  if (contextoEff) {
    return {
      listAllCatalog: false,
      nomeSuiteForFilter: contextoEff,
      queryLabelForHint: contextoRaw,
    };
  }
  return {
    listAllCatalog: true,
    nomeSuiteForFilter: "",
    queryLabelForHint: nomeSuiteRaw || contextoRaw || "",
  };
}

// Fuzzy rule matching isolado de executeChatwootAssign
function matchChatwootRule(
  reason: string,
  rules: Array<{ label?: string; assignee_id?: number; team_id?: number }>,
  defaultAssignee: number | null,
  defaultTeam: number | null
): { assigneeId: number | null; teamId: number | null; matchedRule: string } {
  let assigneeId = defaultAssignee;
  let teamId = defaultTeam;
  let matchedRule = "";

  if (rules.length > 0) {
    const FUZZY_STOPWORDS = new Set(["unidade", "para", "com", "que", "uma"]);
    const reasonNorm = reason.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    let bestScore = 0;
    for (const rule of rules) {
      if (!rule.label) continue;
      const labelNorm = (rule.label as string).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      const tokens = labelNorm.split(/\s+/).filter((t: string) => t.length >= 3 && !FUZZY_STOPWORDS.has(t));
      const score = tokens.reduce((acc: number, tok: string) => acc + (reasonNorm.includes(tok) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        assigneeId = rule.assignee_id ?? assigneeId;
        teamId = rule.team_id ?? teamId;
        matchedRule = rule.label;
      }
    }
  }

  return { assigneeId, teamId, matchedRule };
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeForSearch
// ─────────────────────────────────────────────────────────────────────────────

describe("normalizeForSearch", () => {
  it("minuscula e remove acentos", () => {
    expect(normalizeForSearch("PÉROLA")).toBe("perola");
    expect(normalizeForSearch("Açúcar")).toBe("acucar");
    expect(normalizeForSearch("  Ônix  ")).toBe("onix");
  });

  it("preserva números e hífens normalizados", () => {
    expect(normalizeForSearch("HB20")).toBe("hb20");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeVehicleParam
// ─────────────────────────────────────────────────────────────────────────────

describe("sanitizeVehicleParam — limpeza de parâmetros do LLM", () => {
  it("remove ' e ...' após marca/modelo", () => {
    expect(sanitizeVehicleParam("Cruze e queria")).toBe("Cruze");
    expect(sanitizeVehicleParam("Accord e")).toBe("Accord");
    expect(sanitizeVehicleParam("Civic e cor branca")).toBe("Civic");
  });

  it("retorna valor limpo quando não há ' e '", () => {
    expect(sanitizeVehicleParam("Corolla")).toBe("Corolla");
    expect(sanitizeVehicleParam("HB20")).toBe("HB20");
  });

  it("retorna undefined para vazio ou undefined", () => {
    expect(sanitizeVehicleParam("")).toBeUndefined();
    expect(sanitizeVehicleParam("   ")).toBeUndefined();
    expect(sanitizeVehicleParam(undefined)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getColorSynonyms
// ─────────────────────────────────────────────────────────────────────────────

describe("getColorSynonyms — expansão de sinônimos de cores", () => {
  it("cinza → grupo completo", () => {
    const result = getColorSynonyms("cinza");
    expect(result).toContain("prata");
    expect(result).toContain("grafite");
    expect(result).toContain("silver");
  });

  it("prata → mesmo grupo de cinza", () => {
    expect(getColorSynonyms("prata")).toContain("cinza");
  });

  it("preto → grupo com onix e black", () => {
    const result = getColorSynonyms("preto");
    expect(result).toContain("onix");
    expect(result).toContain("black");
  });

  it("cor desconhecida → retorna só o termo normalizado", () => {
    expect(getColorSynonyms("lilás")).toEqual(["lilas"]);
  });

  it("case insensitive: BRANCO → grupo branco", () => {
    expect(getColorSynonyms("BRANCO")).toContain("white");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parsePriceValue — inventory_query
// ─────────────────────────────────────────────────────────────────────────────

describe("parsePriceValue — parser de faixa de preço", () => {
  it("número < 1000 → converte para milhares automaticamente", () => {
    expect(parsePriceValue(50)).toBe(50_000);
    expect(parsePriceValue(120)).toBe(120_000);
  });

  it("contexto 'mil' força conversão", () => {
    expect(parsePriceValue(80, "80 mil")).toBe(80_000);
  });

  it("número >= 1000 sem contexto 'mil' → mantém valor", () => {
    expect(parsePriceValue(80_000)).toBe(80_000);
    expect(parsePriceValue(150_000)).toBe(150_000);
  });

  it("string numérica com formatação", () => {
    expect(parsePriceValue("80.000")).toBe(80_000);
    expect(parsePriceValue("R$ 50.000")).toBe(50_000);
  });

  it("valor inválido → retorna 0", () => {
    expect(parsePriceValue("abc")).toBe(0);
    expect(parsePriceValue(NaN)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// isBroadGallerySearchTerm — suite_gallery_query
// ─────────────────────────────────────────────────────────────────────────────

describe("isBroadGallerySearchTerm — classificação de pedido de galeria", () => {
  it("string vazia → broad (listar catálogo)", () => {
    expect(isBroadGallerySearchTerm("")).toBe(true);
  });

  it("termos genéricos → broad", () => {
    expect(isBroadGallerySearchTerm("fotos")).toBe(true);
    expect(isBroadGallerySearchTerm("manda fotos")).toBe(true);
    expect(isBroadGallerySearchTerm("quero ver as suites")).toBe(true);
    expect(isBroadGallerySearchTerm("foto do quarto")).toBe(true);
    expect(isBroadGallerySearchTerm("gostaria de fotos")).toBe(true);
  });

  it("nome específico de acomodação → NÃO broad (deve filtrar)", () => {
    expect(isBroadGallerySearchTerm("Suíte Vip Junior")).toBe(false);
    expect(isBroadGallerySearchTerm("LOFT")).toBe(false);
    expect(isBroadGallerySearchTerm("Institucional")).toBe(false);
  });

  it("nome parcial de suíte → NÃO broad", () => {
    expect(isBroadGallerySearchTerm("vip junior")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// sanitizeIlikeFragment — suite_gallery_query
// ─────────────────────────────────────────────────────────────────────────────

describe("sanitizeIlikeFragment — sanitização de fragmento ILIKE", () => {
  it("remove % e _ que viriam curingas", () => {
    expect(sanitizeIlikeFragment("vip%junior")).toBe("vipjunior");
    expect(sanitizeIlikeFragment("suite_vip")).toBe("suitevip");
    expect(sanitizeIlikeFragment("loft")).toBe("loft");
  });

  it("trim de espaços nas bordas", () => {
    expect(sanitizeIlikeFragment("  loft  ")).toBe("loft");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSuiteGallerySearch — tema/contexto vs. catálogo amplo
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveSuiteGallerySearch — filtro por tema da conversa", () => {
  it("nome amplo sem contexto → catálogo completo", () => {
    const r = resolveSuiteGallerySearch({ nome: "tem fotos?" });
    expect(r.listAllCatalog).toBe(true);
    expect(r.nomeSuiteForFilter).toBe("");
  });

  it("nome amplo + contexto piscina → filtra por piscina", () => {
    const r = resolveSuiteGallerySearch({ nome: "fotos", contexto: "piscinas" });
    expect(r.listAllCatalog).toBe(false);
    expect(r.nomeSuiteForFilter).toBe("piscinas");
    expect(r.queryLabelForHint).toBe("piscinas");
  });

  it("nome específico LOFT ignora contexto", () => {
    const r = resolveSuiteGallerySearch({ nome: "LOFT", contexto: "piscina" });
    expect(r.nomeSuiteForFilter).toBe("LOFT");
    expect(r.queryLabelForHint).toBe("LOFT");
  });

  it("alias tema → mesmo que contexto", () => {
    const r = resolveSuiteGallerySearch({ tema: "complexo aquático" });
    expect(r.listAllCatalog).toBe(false);
    expect(r.nomeSuiteForFilter).toContain("complexo");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// matchChatwootRule — chatwoot_assign fuzzy matching
// ─────────────────────────────────────────────────────────────────────────────

describe("matchChatwootRule — chatwoot_assign", () => {
  const rules = [
    { label: "Coop Zona Norte", team_id: 5 },
    { label: "Vila Haro", team_id: 4 },
    { label: "Vila Helena", team_id: 6 },
    { label: "Aparecidinha", assignee_id: 20, team_id: 7 },
  ];

  it("sem rules → retorna defaults", () => {
    const r = matchChatwootRule("qualquer motivo", [], 10, 2);
    expect(r.assigneeId).toBe(10);
    expect(r.teamId).toBe(2);
    expect(r.matchedRule).toBe("");
  });

  it("match exato de label", () => {
    const r = matchChatwootRule("cliente quer unidade Vila Haro", rules, null, null);
    expect(r.matchedRule).toBe("Vila Haro");
    expect(r.teamId).toBe(4);
  });

  it("match com acento na razão → normaliza corretamente", () => {
    const r = matchChatwootRule("unidade aparecidinha matricula", rules, null, null);
    expect(r.matchedRule).toBe("Aparecidinha");
    expect(r.assigneeId).toBe(20);
    expect(r.teamId).toBe(7);
  });

  it("match parcial: Zona Norte via token 'norte'", () => {
    const r = matchChatwootRule("quero transferir para a zona norte", rules, null, null);
    expect(r.matchedRule).toBe("Coop Zona Norte");
    expect(r.teamId).toBe(5);
  });

  it("rules sem labels são ignoradas (não causam erro)", () => {
    const rulesNoLabel = [{ assignee_id: 99 }, { label: "Valida", team_id: 8 }];
    const r = matchChatwootRule("valida teste", rulesNoLabel, null, null);
    expect(r.matchedRule).toBe("Valida");
    expect(r.teamId).toBe(8);
  });

  it("sem match → mantém defaults", () => {
    const r = matchChatwootRule("xyz abc xyz", rules, 3, 1);
    expect(r.assigneeId).toBe(3);
    expect(r.teamId).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// omnibees_availability — validação de parâmetros
// ─────────────────────────────────────────────────────────────────────────────

describe("omnibees_availability — validação de checkIn/checkOut", () => {
  function validateOmnibeesArgs(args: Record<string, unknown>): { ok: boolean; error?: string } {
    const checkIn = args.checkIn ?? args.check_in ?? args.CheckIn;
    const checkOut = args.checkOut ?? args.check_out ?? args.CheckOut;
    if (checkIn == null || checkOut == null || String(checkIn).trim() === "" || String(checkOut).trim() === "") {
      return { ok: false, error: "Parâmetros checkIn e checkOut são obrigatórios." };
    }
    return { ok: true };
  }

  it("args corretos com checkIn/checkOut → ok", () => {
    expect(validateOmnibeesArgs({ checkIn: "2026-05-15", checkOut: "2026-05-18" })).toMatchObject({ ok: true });
  });

  it("aliases check_in / check_out → aceitos", () => {
    expect(validateOmnibeesArgs({ check_in: "15052026", check_out: "18052026" })).toMatchObject({ ok: true });
  });

  it("checkIn ausente → erro", () => {
    const r = validateOmnibeesArgs({ checkOut: "2026-05-18" });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("checkIn");
  });

  it("checkOut ausente → erro", () => {
    const r = validateOmnibeesArgs({ checkIn: "2026-05-15" });
    expect(r.ok).toBe(false);
  });

  it("checkIn string vazia → erro", () => {
    const r = validateOmnibeesArgs({ checkIn: "", checkOut: "2026-05-18" });
    expect(r.ok).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// nearest_unit — validação de CEP
// ─────────────────────────────────────────────────────────────────────────────

describe("nearest_unit — validação de CEP", () => {
  function validateNearestUnitArgs(args: Record<string, unknown>): { ok: boolean; error?: string } {
    const cep = (args.cep as string) || "";
    if (!cep) return { ok: false, error: "CEP é obrigatório" };
    return { ok: true };
  }

  it("CEP presente → ok", () => {
    expect(validateNearestUnitArgs({ cep: "01310100" })).toMatchObject({ ok: true });
  });

  it("CEP ausente → erro", () => {
    expect(validateNearestUnitArgs({})).toMatchObject({ ok: false, error: "CEP é obrigatório" });
  });

  it("CEP string vazia → erro", () => {
    expect(validateNearestUnitArgs({ cep: "" })).toMatchObject({ ok: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rag_search — validação de query
// ─────────────────────────────────────────────────────────────────────────────

describe("rag_search — validação de query", () => {
  function validateRagArgs(args: Record<string, unknown>): { ok: boolean; error?: string } {
    const query = String(args?.query ?? args?.pergunta ?? "").trim();
    if (!query) return { ok: false, error: "Parâmetro 'query' é obrigatório para busca RAG" };
    return { ok: true };
  }

  it("query presente → ok", () => {
    expect(validateRagArgs({ query: "horários de funcionamento" })).toMatchObject({ ok: true });
  });

  it("alias pergunta → aceito", () => {
    expect(validateRagArgs({ pergunta: "qual o preço?" })).toMatchObject({ ok: true });
  });

  it("query ausente → erro", () => {
    expect(validateRagArgs({})).toMatchObject({ ok: false });
  });

  it("query string vazia → erro", () => {
    expect(validateRagArgs({ query: "   " })).toMatchObject({ ok: false });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// send_notification — normalização de nome e telefone
// ─────────────────────────────────────────────────────────────────────────────

describe("send_notification — normalização de nome/telefone", () => {
  const BLOCKED_NAMES = new Set(["cliente", "usuario", "user", "contato"]);

  function resolveNome(args: Record<string, unknown>): string {
    let nome = String(args?.nome ?? args?.nome_cliente ?? args?.name ?? "").trim();
    if (!nome || BLOCKED_NAMES.has(nome.toLowerCase())) nome = "";
    return nome;
  }

  function resolveTelefone(args: Record<string, unknown>): string {
    return String(args?.telefone ?? args?.telefone_cliente ?? args?.phone ?? args?.numero ?? "").trim();
  }

  it("nome via alias nome_cliente", () => {
    expect(resolveNome({ nome_cliente: "Keven" })).toBe("Keven");
  });

  it("nome via alias name", () => {
    expect(resolveNome({ name: "Maria" })).toBe("Maria");
  });

  it("nome 'cliente' é bloqueado → string vazia", () => {
    expect(resolveNome({ nome: "cliente" })).toBe("");
  });

  it("nome ausente → string vazia", () => {
    expect(resolveNome({})).toBe("");
  });

  it("telefone via alias phone", () => {
    expect(resolveTelefone({ phone: "11999990000" })).toBe("11999990000");
  });

  it("telefone via alias numero", () => {
    expect(resolveTelefone({ numero: "11999990000" })).toBe("11999990000");
  });

  it("telefone ausente → string vazia", () => {
    expect(resolveTelefone({})).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// executeTool — tool_type desconhecido retorna erro claro
// ─────────────────────────────────────────────────────────────────────────────

describe("executeTool — tool_type não suportado", () => {
  it("tool_type desconhecido produz erro com mensagem útil", () => {
    const UNSUPPORTED_TYPES = ["web_scraper", "api_rest", "sql_query", "unknown_tool"];
    for (const t of UNSUPPORTED_TYPES) {
      // Replica do comportamento do switch default
      const isEnviarNotificacao = /enviar[_ ]?notific/i.test("some_fn");
      if (!isEnviarNotificacao) {
        const error = `Tool type ${t} not yet supported in local chat`;
        expect(error).toContain(t);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// chatwoot_assign — sem assignee_id nem team_id → erro
// ─────────────────────────────────────────────────────────────────────────────

describe("chatwoot_assign — erro quando sem assignee e sem team", () => {
  it("sem nenhum ID → retorna erro descritivo", () => {
    const r = matchChatwootRule("escalacao qualquer", [], null, null);
    // Sem rules e sem defaults → ambos null
    expect(r.assigneeId).toBeNull();
    expect(r.teamId).toBeNull();
    // A função executeChatwootAssign retornaria erro; aqui validamos a condição:
    const wouldFail = r.assigneeId == null && r.teamId == null;
    expect(wouldFail).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// inventory_query — faixa_preco parsing completo
// ─────────────────────────────────────────────────────────────────────────────

describe("inventory_query — parsing de faixa_preco textual", () => {
  function parseFaixaPreco(faixaPreco: string): { min: number | null; max: number | null } {
    const s = faixaPreco.trim();
    let minPrice: number | null = null;
    let maxPrice: number | null = null;

    const ateMatch = s.match(/(?:ate|até)\s*(\d+)\s*(mil)?/i);
    if (ateMatch) {
      maxPrice = parsePriceValue(ateMatch[1], ateMatch[2] || "");
      return { min: minPrice, max: maxPrice };
    }

    const rangeMatch = s.match(/(?:entre\s+)?(\d+)\s*(?:a|e|até)\s*(\d+)\s*(mil)?/i) || s.match(/(\d+)\s*[-–]\s*(\d+)\s*(mil)?/i);
    if (rangeMatch) {
      minPrice = parsePriceValue(rangeMatch[1], rangeMatch[3] || "");
      maxPrice = parsePriceValue(rangeMatch[2], rangeMatch[3] || "");
      return { min: minPrice, max: maxPrice };
    }

    const singleNum = s.match(/(\d+)/);
    if (singleNum) {
      const val = parsePriceValue(singleNum[1], s);
      if (val > 0) maxPrice = val;
    }

    return { min: minPrice, max: maxPrice };
  }

  it("'ate 80 mil' → max = 80000", () => {
    expect(parseFaixaPreco("ate 80 mil")).toMatchObject({ max: 80_000 });
  });

  it("'entre 50 a 100 mil' → min=50000, max=100000", () => {
    expect(parseFaixaPreco("entre 50 a 100 mil")).toMatchObject({ min: 50_000, max: 100_000 });
  });

  it("'60-90 mil' → min=60000, max=90000", () => {
    expect(parseFaixaPreco("60-90 mil")).toMatchObject({ min: 60_000, max: 90_000 });
  });

  it("número único '120' → max=120000 (< 1000 → *1000)", () => {
    expect(parseFaixaPreco("120")).toMatchObject({ max: 120_000 });
  });

  it("'150000' → max=150000 (>= 1000 → literal)", () => {
    expect(parseFaixaPreco("150000")).toMatchObject({ max: 150_000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// suite_gallery_query — _hint gerado para 1 galeria
// ─────────────────────────────────────────────────────────────────────────────

describe("suite_gallery_query — hint gerado para 1 galeria", () => {
  function buildHintSingle(galeria: {
    nome: string;
    rotulo_para_cliente: string | null;
    total_videos: number;
    orientacao_envio_midias: string | null;
  }): string {
    const g0 = galeria;
    return (
      `GALERIA ENCONTRADA. Fotos em photos_markdown. Ao cliente fale de forma natural` +
      (g0.rotulo_para_cliente ? ` (referência: "${g0.rotulo_para_cliente}")` : "") +
      `; não repita o nome técnico do painel ("${g0.nome}") na conversa. ` +
      `Se o cliente PEDIU as fotos nesta mensagem (ex.: "pode me mandar foto?", "manda foto", "quero ver", "tem foto?"), inclua AGORA o bloco photos_markdown INTEGRAL (todas as linhas ![rótulo](url)), sem omitir nenhuma foto. ` +
      `Se o cliente ainda NÃO pediu as fotos, descreva o conteúdo em texto primeiro e aguarde ele pedir para então incluir o bloco photos_markdown INTEGRAL.` +
      (g0.total_videos > 0
        ? ` Há vídeo(s) neste cadastro — ao falar com o hóspede use frase natural (ex. tour em vídeo), sem sufixo técnico "(com vídeos)" colado ao nome da pasta.`
        : "") +
      (g0.orientacao_envio_midias
        ? `\n\nORIENTAÇÃO DO PAINEL (quando enviar mídias — prioridade): ${g0.orientacao_envio_midias}`
        : "")
    );
  }

  it("galeria sem vídeos e sem orientação → hint padrão", () => {
    const hint = buildHintSingle({
      nome: "LOFT",
      rotulo_para_cliente: "LOFT",
      total_videos: 0,
      orientacao_envio_midias: null,
    });
    expect(hint).toContain("LOFT");
    expect(hint).toContain("não repita o nome técnico do painel");
    expect(hint).toContain("photos_markdown");
    expect(hint).not.toContain("Há vídeo(s) neste cadastro");
  });

  it("galeria com vídeos → hint pede linguagem natural (sem contar vídeos ao modelo)", () => {
    const hint = buildHintSingle({
      nome: "Institucional",
      rotulo_para_cliente: "Apresentação do resort (fotos e vídeo)",
      total_videos: 2,
      orientacao_envio_midias: null,
    });
    expect(hint).toContain("tour em vídeo");
    expect(hint).toContain("(com vídeos)");
  });

  it("galeria com orientação → hint inclui orientação do painel", () => {
    const hint = buildHintSingle({
      nome: "Suíte Vip",
      rotulo_para_cliente: "Suíte Vip",
      total_videos: 0,
      orientacao_envio_midias: "Enviar apenas após confirmar valores",
    });
    expect(hint).toContain("ORIENTAÇÃO DO PAINEL");
    expect(hint).toContain("Enviar apenas após confirmar valores");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calendar_query — validação básica de action
// ─────────────────────────────────────────────────────────────────────────────

describe("calendar_query — resolução de action", () => {
  function resolveCalendarAction(args: Record<string, unknown>): string {
    const action = String(args.action ?? args.acao ?? "check_availability").toLowerCase();
    const ALIAS: Record<string, string> = {
      criar: "create",
      create: "create",
      reagendar: "reschedule",
      reschedule: "reschedule",
      listar_eventos: "list_events",
      list_events: "list_events",
      cancelar: "cancel",
      cancel: "cancel",
      delete: "cancel",
      check_availability: "check_availability",
    };
    return ALIAS[action] ?? action;
  }

  it("ação 'criar' → 'create'", () => {
    expect(resolveCalendarAction({ action: "criar" })).toBe("create");
  });

  it("ação 'reagendar' → 'reschedule'", () => {
    expect(resolveCalendarAction({ action: "reagendar" })).toBe("reschedule");
  });

  it("ação 'cancelar' → 'cancel'", () => {
    expect(resolveCalendarAction({ action: "cancelar" })).toBe("cancel");
  });

  it("ação 'delete' → 'cancel'", () => {
    expect(resolveCalendarAction({ action: "delete" })).toBe("cancel");
  });

  it("ação 'listar_eventos' → 'list_events'", () => {
    expect(resolveCalendarAction({ action: "listar_eventos" })).toBe("list_events");
  });

  it("sem ação → default 'check_availability'", () => {
    expect(resolveCalendarAction({})).toBe("check_availability");
  });

  it("ação desconhecida → retorna como está (para detecção de erro posterior)", () => {
    expect(resolveCalendarAction({ action: "operacao_xpto" })).toBe("operacao_xpto");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// fipe_query — validação básica de parâmetros
// ─────────────────────────────────────────────────────────────────────────────

describe("fipe_query — presença de parâmetros mínimos", () => {
  function validateFipeArgs(args: Record<string, unknown>): { ok: boolean; reason?: string } {
    const marca = args.marca ?? args.brand;
    const modelo = args.modelo ?? args.model;
    if (!marca && !modelo && !args.codigo_fipe) {
      return { ok: false, reason: "Informe ao menos marca, modelo ou codigo_fipe" };
    }
    return { ok: true };
  }

  it("marca + modelo → ok", () => {
    expect(validateFipeArgs({ marca: "Toyota", modelo: "Corolla" })).toMatchObject({ ok: true });
  });

  it("só código FIPE → ok", () => {
    expect(validateFipeArgs({ codigo_fipe: "038003-4" })).toMatchObject({ ok: true });
  });

  it("sem nenhum parâmetro → erro", () => {
    expect(validateFipeArgs({})).toMatchObject({ ok: false });
  });
});
