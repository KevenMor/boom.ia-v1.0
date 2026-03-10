import { describe, it, expect } from "vitest";
import { formatDateBR, buildFallbackAgendaNotification, buildCancelNotification, buildHandoffNotification, extractClientNameFromMessages } from "./agendaNotification.js";

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

  it("trata ISO com +00:00 (UTC) como Brasilia (evita 07:00 quando era 10:00 local)", () => {
    const result = formatDateBR("2026-03-10T10:00:00+00:00");
    expect(result).toContain("10/03/2026");
    expect(result).toContain("10:00");
  });

  it("retorna string vazia para input vazio", () => {
    expect(formatDateBR("")).toBe("");
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
  it("formata notificacao com nome, telefone e interesse", () => {
    const result = buildHandoffNotification(
      "Henrique Carvalho",
      "159998023871",
      "Chevrolet Onix Joy"
    );
    expect(result).toContain("Cliente aguardando atendimento:");
    expect(result).toContain("Henrique Carvalho");
    expect(result).toContain("📞");
    expect(result).toContain("Interesse: Chevrolet Onix Joy");
    expect(result).toContain("Encaminhado automaticamente pela IA");
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
