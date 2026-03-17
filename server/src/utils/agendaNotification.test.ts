import { describe, it, expect } from "vitest";
import { formatDateBR, toBrasiliaISO, buildFallbackAgendaNotification, buildCancelNotification, buildHandoffNotification, extractClientNameFromMessages } from "./agendaNotification.js";

describe("formatDateBR", () => {
  it("formata ISO com offset para dia_semana DD/MM/AAAA, HH:MM", () => {
    const result = formatDateBR("2026-03-09T15:00:00-03:00");
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}.*\d{2}:\d{2}/);
    expect(result).toContain("09/03/2026");
    expect(result).toContain("15:00");
  });

  it("trata ISO sem timezone como Brasilia (evita 07:00 quando salvo 10:00)", () => {
    const result = formatDateBR("2026-03-10T10:00:00");
    expect(result).toContain("10/03/2026");
    expect(result).toContain("10:00");
  });

  it("trata +00:00 como UTC (17:00 UTC = 14:00 BRT)", () => {
    const result = formatDateBR("2026-03-10T17:00:00+00:00");
    expect(result).toContain("10/03/2026");
    expect(result).toContain("14:00");
  });

  it("formata ISO com Z (UTC correto) em horário de São Paulo", () => {
    const result = formatDateBR("2026-03-10T17:00:00.000Z");
    expect(result).toContain("10/03/2026");
    expect(result).toContain("14:00");
  });

  it("retorna string vazia para input vazio", () => {
    expect(formatDateBR("")).toBe("");
  });
});

describe("toBrasiliaISO", () => {
  it("adiciona -03:00 quando não há timezone", () => {
    expect(toBrasiliaISO("2026-03-10T14:00:00")).toBe("2026-03-10T14:00:00-03:00");
  });
  it("substitui +00:00 por -03:00", () => {
    expect(toBrasiliaISO("2026-03-10T14:00:00+00:00")).toBe("2026-03-10T14:00:00-03:00");
  });
  it("retorna vazio para string vazia", () => {
    expect(toBrasiliaISO("")).toBe("");
  });
  it("não altera string que já tem -03:00", () => {
    const s = "2026-03-10T14:00:00-03:00";
    expect(toBrasiliaISO(s)).toBe(s);
  });
});

describe("buildFallbackAgendaNotification", () => {
  it("formata notificacao multiline com nome, data BR, telefone e veiculo", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Keven",
      "2026-03-09T15:00:00-03:00",
      "15998023871",
      "Yamaha XTZ Lander 250 azul"
    );

    expect(result).toContain("📅 Agendamento criado:");
    expect(result).toContain("Keven");
    expect(result).toContain("09/03/2026");
    expect(result).toContain("15:00");
    expect(result).toContain("📞 +5515998023871");
    expect(result).toContain("🚗 Interesse: Yamaha XTZ Lander 250 azul");
    expect(result).toContain("✅ Agendado automaticamente pela IA");

    const lines = result.split("\n");
    expect(lines[0]).toBe("📅 Agendamento criado:");
    expect(lines[1]).toBe("Keven");
    expect(lines[lines.length - 1]).toBe("✅ Agendado automaticamente pela IA");
  });

  it("formata telefone com +55", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Maria",
      "2026-03-10T10:00:00-03:00",
      "5515999887766"
    );
    expect(result).toContain("📞 +5515999887766");
  });

  it("omite telefone e veiculo quando nao informados", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Joao",
      "2026-03-12T09:00:00-03:00"
    );
    expect(result).toContain("Joao");
    expect(result).not.toContain("📞");
    expect(result).not.toContain("🚗");
  });

  it("nao contem formato americano YYYY-MM-DD", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Keven",
      "2026-03-09T17:00:00-03:00",
      "15998023871"
    );
    expect(result).not.toContain("2026-03-09");
    expect(result).toContain("09/03/2026");
  });
});

describe("buildHandoffNotification", () => {
  it("formata notificacao com titulo padrao, nome e telefone", () => {
    const result = buildHandoffNotification(
      "Henrique Carvalho",
      "159998023871"
    );
    expect(result).toContain("Aguarda um atendimento humano");
    expect(result).toContain("Nome: Henrique Carvalho");
    expect(result).toContain("Telefone:");
    expect(result).not.toContain("Data e hora:");
  });
});

describe("extractClientNameFromMessages", () => {
  it("extrai nome antes do CPF", () => {
    const messages = [
      { role: "user", content: "Itau Henrique Carvalho 000.001.001-45 05/03/1997" },
    ];
    expect(extractClientNameFromMessages(messages)).toBe("Henrique Carvalho");
  });
});

describe("buildCancelNotification", () => {
  it("formata cancelamento multiline com nome e data BR", () => {
    const result = buildCancelNotification(
      "Visita - Keven",
      "2026-03-09T15:00:00-03:00"
    );

    expect(result).toContain("❌ Agendamento cancelado:");
    expect(result).toContain("Keven");
    expect(result).toContain("09/03/2026");
    expect(result).toContain("15:00");
    expect(result).not.toContain("2026-03-09");
  });
});
