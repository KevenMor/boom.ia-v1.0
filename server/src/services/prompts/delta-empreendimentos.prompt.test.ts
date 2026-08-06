import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  getPromptConfig,
} from "./registry.js";
import {
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
  SYSTEM_PROMPT,
} from "./delta-empreendimentos.js";

describe("Delta Empreendimentos — SYSTEM_PROMPT", () => {
  it("versão do prompt", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.5\.13/);
  });

  it("anti-loop nome: proíbe 'Prazer, Keven' + 'Como posso te chamar' na mesma bolha", () => {
    expect(SYSTEM_PROMPT).toMatch(/loop de nome/i);
    expect(SYSTEM_PROMPT).toMatch(/Prazer, Keven! Vi que você tem interesse/);
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO ABSOLUTO.*Como posso te chamar/i);
    expect(COMMUNICATION_RULES).toMatch(/v1\.5\.10|somente.*ainda n[aã]o.*disse o nome/i);
  });

  it("handoff via tool encaminhar_atendente", () => {
    expect(SYSTEM_PROMPT).toMatch(/encaminhar_atendente/);
    expect(SYSTEM_PROMPT).toMatch(/Equipe comercial/);
    expect(SYSTEM_PROMPT).toMatch(/TOOL OBRIGATÓRIA|chame a tool no mesmo turno/i);
    expect(COMMUNICATION_RULES).toMatch(/encaminhar_atendente/);
    expect(DISPATCHER_PROMPT).toMatch(/encaminhar_atendente/);
    expect(DISPATCHER_PROMPT).toMatch(/Equipe comercial/);
    expect(DISPATCHER_PROMPT).toMatch(/Financeiro/);
    expect(DISPATCHER_PROMPT).toMatch(/Setor responsável/);
  });

  it("funil SDR pede cidade de origem depois da intenção", () => {
    expect(SYSTEM_PROMPT).toMatch(/Cidade de origem/);
    expect(SYSTEM_PROMPT).toMatch(/Inten[cç][aã]o de uso/);
    expect(SYSTEM_PROMPT).toMatch(/funil do cliente/i);
  });

  it("anti-loop: não repetir intenção já respondida ao falar de valor", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA REPETIR PERGUNTA JÁ RESPONDIDA/i);
    expect(SYSTEM_PROMPT).toMatch(/loop de intenção/i);
    expect(SYSTEM_PROMPT).toMatch(/intenção \*\*já\*\* foi respondida|intenção \*\*já\*\* foi|já foi respondida/i);
    expect(SYSTEM_PROMPT).toMatch(/Quando NÃO transferir ainda/i);
    expect(COMMUNICATION_RULES).toMatch(/nunca.*reenvie.*morar, investir/i);
  });

  it("apresentação progressiva do empreendimento", () => {
    expect(SYSTEM_PROMPT).toMatch(/COMO APRESENTAR O EMPREENDIMENTO/i);
    expect(SYSTEM_PROMPT).toMatch(/Camadas/i);
    expect(SYSTEM_PROMPT).toMatch(/Adapte à intenção/i);
    expect(SYSTEM_PROMPT).toMatch(/Gostaria de saber mais/i);
    expect(COMMUNICATION_RULES).toMatch(/Apresente o empreendimento/i);
  });

  it("inclui links Google Maps do empreendimento e do plantão", () => {
    expect(SYSTEM_PROMPT).toMatch(/google\.com\/maps/i);
    expect(SYSTEM_PROMPT).toMatch(/-23\.4921389/);
    expect(SYSTEM_PROMPT).toMatch(/Delta\+Empreendimentos|plantão de vendas \(Como chegar\)/i);
  });

  it("inclui tour virtual e galeria InstaCasa", () => {
    expect(SYSTEM_PROMPT).toMatch(/tour\.instacasa\.com\.br\/reservas-do-brasil/i);
    expect(SYSTEM_PROMPT).toMatch(/site\.instacasa\.com\.br\/empreendimentos\/reservas-do-brasil/i);
    expect(SYSTEM_PROMPT).toMatch(/Galeria de fotos/i);
  });

  it("Reservas do Brasil com dados InstaCasa", () => {
    expect(SYSTEM_PROMPT).toMatch(/145 lotes/i);
    expect(SYSTEM_PROMPT).toMatch(/1\.442,84/);
    expect(SYSTEM_PROMPT).toMatch(/SP-268/);
    expect(SYSTEM_PROMPT).toMatch(/Playground/i);
    expect(SYSTEM_PROMPT).toMatch(/InstaCasa/i);
    expect(SYSTEM_PROMPT).toMatch(/30 meses/i);
  });

  it("identidade Manu e empresa", () => {
    expect(SYSTEM_PROMPT).toMatch(/Manu/i);
    expect(SYSTEM_PROMPT).not.toMatch(/Sara/);
    expect(SYSTEM_PROMPT).toMatch(/Delta Empreendimentos/i);
    expect(SYSTEM_PROMPT).toMatch(/Araçoiaba da Serra/i);
  });

  it("proíbe inventar nome e uso artificial do nome", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA INVENTAR/i);
    expect(SYSTEM_PROMPT).toMatch(/moderação/i);
    expect(SYSTEM_PROMPT).toMatch(/Proibido.*cada.*mensagem|cada.*frase/i);
  });

  it("exige tom humano com no máximo uma pergunta", () => {
    expect(SYSTEM_PROMPT).toMatch(/FALE COMO HUMANO/i);
    expect(SYSTEM_PROMPT).toMatch(/Máximo 1 ponto de interrogação|Máximo 1 "\?"/i);
    expect(SYSTEM_PROMPT).toMatch(/Para começar,/);
  });

  it("proíbe emoji e IA/robô", () => {
    expect(SYSTEM_PROMPT).toMatch(/ZERO EMOJI|Zero emoji/i);
    expect(SYSTEM_PROMPT).toMatch(/rob[oô]|IA/i);
  });

  it("regra 00 — não inventar preço ou disponibilidade", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA INVENTAR DADOS COMERCIAIS/i);
    expect(SYSTEM_PROMPT).toMatch(/disponibilidade/i);
  });

  it("prioriza leads de anúncio", () => {
    expect(SYSTEM_PROMPT).toMatch(/anúncio/i);
    expect(SYSTEM_PROMPT).toMatch(/Regra de ouro/i);
    expect(SYSTEM_PROMPT).toMatch(/Cenário B/i);
  });

  it("cita empreendimentos do portfólio", () => {
    expect(SYSTEM_PROMPT).toMatch(/Reservas do Brasil/i);
    expect(SYSTEM_PROMPT).toMatch(/Dallas/i);
    expect(SYSTEM_PROMPT).toMatch(/Vista Alegre/i);
    expect(SYSTEM_PROMPT).toMatch(/Vale dos Cervos 5/i);
  });

  it("conhecimento do Vale dos Cervos 5", () => {
    expect(SYSTEM_PROMPT).toContain("Vale dos Cervos 5");
    expect(SYSTEM_PROMPT).toContain("50.000,00");
    expect(SYSTEM_PROMPT).toContain("80x");
    expect(SYSTEM_PROMPT).toContain("matrícula individual");
    expect(SYSTEM_PROMPT).toContain("guia, sarjeta e cascalho compactado");
    expect(SYSTEM_PROMPT).toContain("permuta");
    expect(SYSTEM_PROMPT).toMatch(/APENAS SOB DEMANDA EXPLÍCITA|Valores sob Demanda/i);
    expect(SYSTEM_PROMPT).toMatch(/qual cidade atualmente/i);
    expect(SYSTEM_PROMPT).toMatch(/busca um lote pra construir ou está pensando em investimento/i);
  });

  it("sem telefone hardcoded no prompt", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\+55\s*\(?\d{2}\)?/);
    expect(SYSTEM_PROMPT).not.toMatch(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/);
  });
});

describe("Delta Empreendimentos — DISPATCHER, COMM e FOLLOWUP", () => {
  it("dispatcher sem tools obrigatórias", () => {
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED/);
    expect(DISPATCHER_PROMPT).toMatch(/Manu/);
  });

  it("communication rules proíbem emoji, inventar nome e várias perguntas", () => {
    expect(COMMUNICATION_RULES).toMatch(/Zero emoji/i);
    expect(COMMUNICATION_RULES).toMatch(/Nunca inventar nome/i);
    expect(COMMUNICATION_RULES).toMatch(/Máximo 1 "\?"/);
    expect(COMMUNICATION_RULES).toMatch(/Manu/);
  });

  it("follow-up sem preço inventado e com Manu", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/Proibido.*R\$|Sem preço inventado/i);
    expect(FOLLOWUP_PROMPT).toMatch(/Manu/);
    expect(FOLLOWUP_PROMPT).not.toMatch(/Sara/);
  });
});

describe("Delta Empreendimentos — registry", () => {
  it("resolve slug delta-empreendimentos", () => {
    const cfg = getPromptConfig("delta-empreendimentos");
    expect(cfg).not.toBeNull();
    expect(cfg!.version).toBe("v1.5.13");
    expect(cfg!.description).toMatch(/Manu/i);
  });

  it("buildSystemPrompt ignora prompt do banco e injeta Manu", () => {
    const prompt = buildSystemPrompt("PROMPT_BANCO_IGNORAR", "delta-empreendimentos", false);
    expect(prompt).toContain("Manu");
    expect(prompt).toContain("v1.5.13");
    expect(prompt).not.toContain("Sara");
    expect(prompt).not.toContain("PROMPT_BANCO_IGNORAR");
    expect(prompt).not.toContain("COMPORTAMENTO DE SAUDAÇÃO:");
  });

  it("resolve alias delta_empreendimentos", () => {
    const prompt = buildSystemPrompt("BANCO", "delta_empreendimentos", false);
    expect(prompt).toContain("Manu");
    expect(prompt).not.toContain("BANCO");
  });
});
