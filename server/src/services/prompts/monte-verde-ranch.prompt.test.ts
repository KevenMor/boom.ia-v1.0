import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT,
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
} from "./monte-verde-ranch.js";

describe("Monte Verde Ranch — SYSTEM_PROMPT (contratos de negócio)", () => {
  it("define a identidade como Cleide da Monte Verde Ranch", () => {
    expect(SYSTEM_PROMPT).toMatch(/Voce e a Cleide/i);
    expect(SYSTEM_PROMPT).toMatch(/atendente da Monte Verde Ranch/i);
  });

  it("proíbe menção a IA, robô ou bot", () => {
    expect(SYSTEM_PROMPT).toMatch(/Evite mencionar IA, robo, bot, assistente virtual/i);
  });

  it("regra de saudação simples obrigatória (Oi! Aqui e a Cleide...)", () => {
    expect(SYSTEM_PROMPT).toMatch(/SAUDACAO SIMPLES/i);
    expect(SYSTEM_PROMPT).toMatch(/Oi! Aqui e a Cleide, da Monte Verde Ranch/i);
  });

  it("regra de ouro: máximo 1 ponto de interrogação", () => {
    expect(SYSTEM_PROMPT).toMatch(/Maximo 1 ponto de interrogacao por mensagem/i);
  });

  it("proíbe inventar consulta ao sistema/calendário", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA use frases como "vou consultar no sistema"/i);
    expect(SYSTEM_PROMPT).toMatch(/NAO FINGIR CONSULTA AO SISTEMA DE DISPONIBILIDADE/i);
  });

  it("define preços de gastronomia (R$ 89,90 adulto)", () => {
    expect(SYSTEM_PROMPT).toMatch(/R\$ 89,90\/adulto/i);
    expect(SYSTEM_PROMPT).toMatch(/Criancas 6 a 12 anos: R\$ 44,90/i);
  });

  it("define passeio a cavalo (R$ 120 / 30 min)", () => {
    expect(SYSTEM_PROMPT).toMatch(/R\$ 120,00 por pessoa \(30 minutos\)/i);
  });

  it("regra crítica de trilhas: visitante traz o próprio veículo", () => {
    expect(SYSTEM_PROMPT).toMatch(/visitante traz o proprio veiculo/i);
    expect(SYSTEM_PROMPT).toMatch(/fazenda NAO aluga UTV, quadriciclo ou 4x4/i);
  });

  it("proíbe markdown (texto puro)", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA use formatacao markdown/i);
    expect(SYSTEM_PROMPT).toMatch(/Texto puro/i);
  });
});

describe("Monte Verde Ranch — COMMUNICATION_RULES", () => {
  it("reforça brevidade e blocos de 1-2 frases", () => {
    expect(COMMUNICATION_RULES).toMatch(/Cada bloco de texto = 1-2 frases/i);
  });

  it("reforça separação com linha em branco", () => {
    expect(COMMUNICATION_RULES).toMatch(/Separe blocos com linha em branco/i);
  });
});

describe("Monte Verde Ranch — DISPATCHER_PROMPT", () => {
  it("inclui handoff para eventos e clube do cavalo", () => {
    expect(DISPATCHER_PROMPT).toMatch(/handoff/i);
    expect(DISPATCHER_PROMPT).toMatch(/PRIVATE EVENT/i);
    expect(DISPATCHER_PROMPT).toMatch(/SUBSCRIBE to Clube do Cavalo/i);
  });
});

describe("Monte Verde Ranch — FOLLOWUP_PROMPT", () => {
  it("define tom informal e curto", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/informal, curta, calorosa/i);
  });
});
