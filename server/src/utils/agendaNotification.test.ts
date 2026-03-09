import { describe, it, expect } from "vitest";
import { formatDateBR, buildFallbackAgendaNotification } from "./agendaNotification.js";

describe("formatDateBR", () => {
  it("formata ISO para DD/MM/AAAA HH:MM", () => {
    const result = formatDateBR("2026-03-09T15:00:00-03:00");
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(result).toMatch(/\d{2}:\d{2}/);
  });

  it("retorna string vazia para input vazio", () => {
    expect(formatDateBR("")).toBe("");
  });
});

describe("buildFallbackAgendaNotification", () => {
  it("inclui nome, telefone, data BR e veiculo de interesse", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Keven - Audi A3",
      "2026-03-09T15:00:00-03:00",
      "11999999999",
      "Audi A3 Sedan 2020"
    );

    expect(result).toContain("Keven");
    expect(result).toContain("11999999999");
    expect(result).toContain("Audi A3 Sedan 2020");
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(result).toContain("Agendado automaticamente pela IA");
  });

  it("extrai nome do titulo no formato Visita - Nome", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Maria Silva",
      "2026-03-10T10:00:00-03:00"
    );
    expect(result).toContain("Maria Silva");
  });

  it("usa titulo completo quando nao segue padrao Visita - Nome", () => {
    const result = buildFallbackAgendaNotification(
      "Reuniao geral",
      "2026-03-11T14:00:00-03:00"
    );
    expect(result).toContain("Reuniao geral");
  });

  it("sempre inclui telefone e veiculo (nao informado quando vazio)", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Joao",
      "2026-03-12T09:00:00-03:00"
    );
    expect(result).toContain("Joao");
    expect(result).toContain("📞");
    expect(result).toContain("🚗");
    expect(result).toContain("(nao informado)");
  });

  it("extrai veiculo das mensagens quando nao informado no tool", () => {
    const messages = [
      { role: "user", content: "Quero ver um Corolla 2022" },
      { role: "assistant", content: "Ok, vou agendar" },
    ];
    const result = buildFallbackAgendaNotification(
      "Visita - Maria",
      "2026-03-12T10:00:00-03:00",
      undefined,
      undefined,
      messages
    );
    expect(result).toContain("Corolla 2022");
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });
});
