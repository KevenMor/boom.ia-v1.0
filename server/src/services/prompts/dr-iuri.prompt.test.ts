import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT,
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
} from "./dr-iuri.js";
import { getPromptConfig } from "./registry.js";

describe("Dr. Iuri — SYSTEM_PROMPT (Camila v1.1)", () => {
  it("define preços oficiais à vista R$ 2.200 e 10x R$ 250", () => {
    expect(SYSTEM_PROMPT).toMatch(/R\$ 2\.200/);
    expect(SYSTEM_PROMPT).toMatch(/10x.*R\$ 250|R\$ 250.*10x/i);
  });

  it("proíbe agendamento direto pela IA", () => {
    expect(SYSTEM_PROMPT).toMatch(/NÃO marca horário|NUNCA propõe datas ou horários/i);
    expect(SYSTEM_PROMPT).toMatch(/NÃO coleta dados de reserva/i);
  });

  it("proíbe envio de fotos de resultados / prova social visual", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA.*fotos de resultados|antes\/depois/i);
  });

  it("mantém pré-avaliação por foto do cliente", () => {
    expect(SYSTEM_PROMPT).toMatch(/pré-avaliação.*foto|pre-avaliacao.*foto/i);
    expect(SYSTEM_PROMPT).toMatch(/frente.*costas|costas.*frente/i);
  });

  it("inclui roteiro comercial adaptativo e FAQ de objeções", () => {
    expect(SYSTEM_PROMPT).toMatch(/Roteiro Comercial|roteiro comercial/i);
    expect(SYSTEM_PROMPT).toMatch(/FAQ.*Objeções|Contorno de Objeções/i);
    expect(SYSTEM_PROMPT).toMatch(/O procedimento dói\?/);
    expect(SYSTEM_PROMPT).toMatch(/Tá caro/i);
  });

  it("endereço completo com SL 608 e link Maps", () => {
    expect(SYSTEM_PROMPT).toMatch(/Luís Viana Filho, 6462/);
    expect(SYSTEM_PROMPT).toMatch(/SL 608/);
    expect(SYSTEM_PROMPT).toMatch(/x\.gd\/5RBDE/);
  });

  it("encaminhamento para equipe humana como CTA principal", () => {
    expect(SYSTEM_PROMPT).toMatch(/equipe responsável/i);
  });

  it("informa formação oficial do Dr. Iuri quando perguntarem", () => {
    expect(SYSTEM_PROMPT).toMatch(/Formação do Dr\. Iuri/i);
    expect(SYSTEM_PROMPT).toMatch(/Farmacêutico, pós-graduado em estética com foco em otomodelação/i);
    expect(SYSTEM_PROMPT).toMatch(/Qual a formação do Dr\. Iuri/i);
  });
});

describe("Dr. Iuri — COMMUNICATION_RULES", () => {
  it("reforça handoff, restrições de agenda e formação do Dr. Iuri", () => {
    expect(COMMUNICATION_RULES).toMatch(/encaminhar para equipe/i);
    expect(COMMUNICATION_RULES).toMatch(/Sem agendamento IA/i);
    expect(COMMUNICATION_RULES).toMatch(/R\$ 2\.200/);
    expect(COMMUNICATION_RULES).toMatch(/Farmacêutico, pós-graduado em estética com foco em otomodelação/i);
  });
});

describe("Dr. Iuri — DISPATCHER_PROMPT", () => {
  it("dispara transferência em interesse confirmado ou fotos enviadas", () => {
    expect(DISPATCHER_PROMPT).toMatch(/sent photos for pré-avaliacao|confirmed interest/i);
    expect(DISPATCHER_PROMPT).toMatch(/enviar_notificacao.*atribuir_agente/is);
  });
});

describe("Dr. Iuri — registry", () => {
  it("registra slug dr-iuri na versão v1.1.1", () => {
    const bundle = getPromptConfig("dr-iuri");
    expect(bundle?.version).toBe("v1.1.1");
    expect(bundle?.systemPrompt).toContain("Camila");
  });
});

describe("Dr. Iuri — FOLLOWUP_PROMPT", () => {
  it("não propõe agendamento direto nos exemplos", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/equipe responsável/i);
    expect(FOLLOWUP_PROMPT).not.toMatch(/agendar sua avaliação/i);
  });
});
