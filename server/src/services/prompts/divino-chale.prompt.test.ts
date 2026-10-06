import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT,
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
} from "./divino-chale.js";
import { buildSystemPrompt, getPromptConfig } from "./registry.js";

describe("Divino Chalé — SYSTEM_PROMPT", () => {
  it("identifica Lara e Divino Chalé", () => {
    expect(SYSTEM_PROMPT).toMatch(/Lara/i);
    expect(SYSTEM_PROMPT).toMatch(/Divino Chalé/i);
    expect(SYSTEM_PROMPT).toMatch(/v1\.3\.9/);
  });

  it("guia conversa natural e evita formulário", () => {
    expect(SYSTEM_PROMPT).toMatch(/Regra de ouro|perguntou|WhatsApp/i);
    expect(SYSTEM_PROMPT).toMatch(/Data de entrada/i);
    expect(SYSTEM_PROMPT).toMatch(/formulário|formulario|soa robô|Evite/i);
  });

  it("pedido genérico de info: teaser curto, sem despejar catálogo", () => {
    expect(SYSTEM_PROMPT).toMatch(/Pedido genérico de informação|quero mais informações/i);
    expect(SYSTEM_PROMPT).toMatch(/teaser|NÃO despeje|nao despeje/i);
    expect(COMMUNICATION_RULES).toMatch(/teaser|genérico|catalogo|catálogo/i);
  });

  it("escrita humanizada sem hífen/travessão e sem recomendar delivery", () => {
    expect(SYSTEM_PROMPT).toMatch(/Escrita humanizada/i);
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO usar hífen|sem hífen/i);
    expect(SYSTEM_PROMPT).toMatch(/travessão/i);
    expect(SYSTEM_PROMPT).toMatch(/NÃO recomende delivery|NUNCA recomende delivery/i);
    expect(SYSTEM_PROMPT).toMatch(/Comida\?.*"Alimentação não vem inclusa/i);
    expect(COMMUNICATION_RULES).toMatch(/hífen|travessão/i);
    expect(COMMUNICATION_RULES).toMatch(/delivery/i);
  });

  it("valores sempre por diária para não parecer pacote", () => {
    expect(SYSTEM_PROMPT).toMatch(/por diária|a diária/i);
    expect(SYSTEM_PROMPT).toMatch(/449,99 a diária/i);
    expect(SYSTEM_PROMPT).toMatch(/399,99 a diária/i);
    expect(SYSTEM_PROMPT).toMatch(/NÃO pode achar|não pacote|ambíguo/i);
    expect(COMMUNICATION_RULES).toMatch(/por diária|a diária/i);
  });

  it("fotos sob demanda via suite_gallery_query, sem handoff só por foto", () => {
    expect(SYSTEM_PROMPT).toMatch(/suite_gallery_query|consultar_galeria/i);
    expect(SYSTEM_PROMPT).toMatch(/photos_markdown/i);
    expect(SYSTEM_PROMPT).toMatch(/NÃO diga que vai passar pra equipe só por causa de foto/i);
    expect(DISPATCHER_PROMPT).toMatch(/suite_gallery_query/i);
    expect(COMMUNICATION_RULES).toMatch(/suite_gallery_query|Fotos pedidas/i);
  });

  it("define tabela oficial e extras", () => {
    expect(SYSTEM_PROMPT).toMatch(/399,99/);
    expect(SYSTEM_PROMPT).toMatch(/449,99/);
    expect(SYSTEM_PROMPT).toMatch(/\+ R\$ 100,00|100,00 por hóspede/i);
    expect(SYSTEM_PROMPT).toMatch(/7 anos/);
    expect(SYSTEM_PROMPT).toMatch(/4 pessoas/);
  });

  it("nome do cliente no máximo uma vez na conversa", () => {
    expect(SYSTEM_PROMPT).toMatch(/Nome do cliente/i);
    expect(SYSTEM_PROMPT).toMatch(/no máximo UMA vez|máximo UMA vez/i);
    expect(COMMUNICATION_RULES).toMatch(/Nome do cliente no máximo 1 vez/i);
  });

  it("não reperguntar data já mencionada", () => {
    expect(SYSTEM_PROMPT).toMatch(/Data já mencionada|já deu a data/i);
    expect(SYSTEM_PROMPT).toMatch(/NÃO pergunte de novo|não pergunte de novo/i);
    expect(COMMUNICATION_RULES).toMatch(/Data já dita|não pergunte de novo/i);
  });

  it("nunca anuncia verificação — tool imediata", () => {
    expect(SYSTEM_PROMPT).toMatch(/vou verificar|deixa eu checar/i);
    expect(SYSTEM_PROMPT).toMatch(/IMEDIATA|invisível/i);
    expect(COMMUNICATION_RULES).toMatch(/vou verificar|deixa eu checar/i);
    expect(DISPATCHER_PROMPT).toMatch(/IMMEDIATE/i);
  });

  it("sem vaga: pergunta final de semana ou durante a semana", () => {
    expect(SYSTEM_PROMPT).toMatch(/available=false|SEM VAGA/i);
    expect(SYSTEM_PROMPT).toMatch(/final de semana/i);
    expect(SYSTEM_PROMPT).toMatch(/durante a semana/i);
    expect(COMMUNICATION_RULES).toMatch(/available=false/i);
    expect(COMMUNICATION_RULES).toMatch(/final de semana/i);
  });

  it("sugerir_datas devolve no máximo 3 datas sem varrer dia a dia", () => {
    expect(SYSTEM_PROMPT).toMatch(/sugerir_datas/i);
    expect(SYSTEM_PROMPT).toMatch(/máx\. 3|no máx\. 3|até 3/i);
    expect(DISPATCHER_PROMPT).toMatch(/sugerir_datas/i);
    expect(DISPATCHER_PROMPT).toMatch(/NEVER loop|At most ONE tool call|limit ALWAYS <= 3/i);
    expect(COMMUNICATION_RULES).toMatch(/sugerir_datas/i);
  });

  it("pergunta idade da criança antes de fechar orçamento", () => {
    expect(SYSTEM_PROMPT).toMatch(/Criança na reserva|idade/i);
    expect(SYSTEM_PROMPT).toMatch(/Qual a idade/i);
    expect(SYSTEM_PROMPT).toMatch(/se tiver menos de 7/i);
    expect(COMMUNICATION_RULES).toMatch(/perguntar a idade/i);
  });

  it("usa consultar_evento para disponibilidade de diárias", () => {
    expect(SYSTEM_PROMPT).toMatch(/consultar_evento/i);
    expect(SYSTEM_PROMPT).toMatch(/available/i);
    expect(DISPATCHER_PROMPT).toMatch(/check_in/);
    expect(DISPATCHER_PROMPT).toMatch(/check_out/);
    expect(DISPATCHER_PROMPT).toMatch(/NEVER empty args|NEVER call with empty args/i);
    expect(DISPATCHER_PROMPT).toMatch(/excluir/i);
    expect(COMMUNICATION_RULES).toMatch(/tool check_lodging|excluir/i);
  });

  it("pets não permitidos e cancelamento via handoff", () => {
    expect(SYSTEM_PROMPT).toMatch(/Pets: NÃO permitidos|não permitidos/i);
    expect(SYSTEM_PROMPT).toMatch(/Cancelamento|cancelamento|reembolso/i);
    expect(SYSTEM_PROMPT).toMatch(/handoff|passar pra (nossa )?equipe|passar para|encaminhar_atendente/i);
  });

  it("handoff chama encaminhar_atendente e notifica grupo automaticamente", () => {
    expect(SYSTEM_PROMPT).toMatch(/encaminhar_atendente/i);
    expect(SYSTEM_PROMPT).toMatch(/enviar_notificacao/i);
    expect(DISPATCHER_PROMPT).toMatch(/encaminhar_atendente/i);
    expect(DISPATCHER_PROMPT).toMatch(/chatwoot_assign/i);
    expect(DISPATCHER_PROMPT).toMatch(/Pagamento|Reserva|Reclamação/i);
  });

  it("máximo uma pergunta e saudação progressiva", () => {
    expect(SYSTEM_PROMPT).toMatch(/Uma pergunta por vez|uma pergunta/i);
    expect(SYSTEM_PROMPT).toMatch(/Saudação simples|SAUDAÇÃO SIMPLES/i);
  });

  it("Vitória da Conquista / Lagoa das Flores", () => {
    expect(SYSTEM_PROMPT).toMatch(/Vitória da Conquista/i);
    expect(SYSTEM_PROMPT).toMatch(/Lagoa das Flores/i);
  });

  it("pagamento: Pix, link de cartão e acréscimo no parcelamento", () => {
    expect(SYSTEM_PROMPT).toMatch(/PAGAMENTO/i);
    expect(SYSTEM_PROMPT).toMatch(/Pix/i);
    expect(SYSTEM_PROMPT).toMatch(/link de pagamento/i);
    expect(SYSTEM_PROMPT).toMatch(/cartão de crédito|cartao de credito/i);
    expect(SYSTEM_PROMPT).toMatch(/parcelamento/i);
    expect(SYSTEM_PROMPT).toMatch(/pequeno acréscimo|pequeno acrescimo/i);
    expect(SYSTEM_PROMPT).toMatch(/ato do pagamento/i);
    expect(SYSTEM_PROMPT).toMatch(/NUNCA inventar valores de parcelamento|inventa.*parcela/i);
    expect(COMMUNICATION_RULES).toMatch(/NUNCA inventar valor de parcela|Pix ou link/i);
  });
});

describe("Divino Chalé — registry", () => {
  it("resolve slug divino-chale com skipGreeting", () => {
    const cfg = getPromptConfig("divino-chale");
    expect(cfg?.version).toBe("v1.3.9");
    expect(cfg?.skipGreeting).toBe(true);
    expect(cfg?.alwaysInjectCommRules).toBe(true);
  });

  it("buildSystemPrompt não injeta BASE_GREETING genérico", () => {
    const out = buildSystemPrompt("", "divino-chale", false);
    expect(out).toContain("LARA | DIVINO CHALÉ");
    expect(out).not.toMatch(/COMPORTAMENTO DE SAUDAÇÃO/);
    expect(out).toMatch(/REGRAS DE COMUNICAÇÃO — LARA/i);
  });

  it("override no banco usa prompt do agente", () => {
    const custom = "PROMPT OVERRIDE TESTE DIVINO";
    const out = buildSystemPrompt(custom, "divino-chale", false, { overridePrompts: true });
    expect(out).toContain(custom);
    expect(out).not.toContain("LARA | DIVINO CHALÉ — v1.3.9");
  });
});

describe("Divino Chalé — demais exports", () => {
  it("dispatcher chama consultar_evento com datas", () => {
    expect(DISPATCHER_PROMPT).toMatch(/consultar_evento/);
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED/);
  });

  it("followup e comm rules existem", () => {
    expect(COMMUNICATION_RULES.length).toBeGreaterThan(40);
    expect(FOLLOWUP_PROMPT).toMatch(/Lara/i);
    expect(FOLLOWUP_PROMPT).toMatch(/\{attempt\}/);
    expect(FOLLOWUP_PROMPT).toMatch(/Tentativa 1|tentativa \{attempt\}/i);
  });
});
