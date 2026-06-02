import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
  SYSTEM_PROMPT,
} from "./pousada-flores-do-lazaro.js";

describe("Pousada Flores do Lázaro — SYSTEM_PROMPT", () => {
  it("versão do prompt", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.0\.0/);
  });

  it("identidade Marina e empreendimento", () => {
    expect(SYSTEM_PROMPT).toMatch(/Marina/i);
    expect(SYSTEM_PROMPT).toMatch(/Pousada Flores do L[aá]zaro/i);
    expect(SYSTEM_PROMPT).toMatch(/Ubatuba/i);
  });

  it("proíbe IA/robô/emoji", () => {
    expect(SYSTEM_PROMPT).toMatch(/Zero emoji|zero emoji/i);
    expect(SYSTEM_PROMPT).toMatch(/rob[oô]|IA/i);
  });

  it("declara tool consultar_disponibilidade_flores_lazaro", () => {
    expect(SYSTEM_PROMPT).toMatch(/consultar_disponibilidade_flores_lazaro/);
  });

  it("regra 00 — não inventar preço", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA.*inventa|n[aã]o.*inventa/i);
    expect(SYSTEM_PROMPT).toMatch(/NESTE MESMO TURNO/i);
  });

  it("boas-vindas 00d", () => {
    expect(SYSTEM_PROMPT).toMatch(/00d\)/);
    expect(SYSTEM_PROMPT).toMatch(/Bom dia|Boa tarde|Boa noite/i);
  });

  it("café da manhã — não pensão completa genérica", () => {
    expect(SYSTEM_PROMPT).toMatch(/café da manhã/i);
    expect(SYSTEM_PROMPT).not.toMatch(/Pensão Completa/i);
  });

  it("§4c OTA só em hesitação com aproximado", () => {
    expect(SYSTEM_PROMPT).toMatch(/4c\)/);
    expect(SYSTEM_PROMPT).toMatch(/hesitar|Booking|Expedia/i);
    expect(SYSTEM_PROMPT).toMatch(/aproximad/i);
  });

  it("sem telefone hardcoded no prompt", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/\+55\s*\(?\d{2}\)?/);
    expect(SYSTEM_PROMPT).not.toMatch(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/);
  });
});

describe("Pousada Flores do Lázaro — DISPATCHER", () => {
  it("referencia consultar_disponibilidade_flores_lazaro", () => {
    expect(DISPATCHER_PROMPT).toMatch(/consultar_disponibilidade_flores_lazaro/);
  });

  it("exige adultos explícitos", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Never pass adults=2|never assume 2 adults/i);
  });
});

describe("Pousada Flores do Lázaro — COMM e FOLLOWUP", () => {
  it("communication rules proíbem emoji", () => {
    expect(COMMUNICATION_RULES).toMatch(/Zero emoji/i);
  });

  it("follow-up sem preço inventado", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/Proibido.*R\$/i);
  });
});
