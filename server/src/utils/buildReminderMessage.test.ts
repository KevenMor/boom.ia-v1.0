import { describe, it, expect } from "vitest";
import { buildReminderMessage } from "./buildReminderMessage.js";

describe("buildReminderMessage", () => {
  it("substitui {titulo}, {horario}, {data} e {hora} no template", () => {
    const template = "Lembrete: {titulo} em {data} as {horario}.";
    const eventTitle = "Visita - Keven - Audi A3";
    const eventStartAt = "2026-03-09T15:00:00-03:00"; // 15h em SP

    const result = buildReminderMessage(template, eventTitle, eventStartAt);

    expect(result).toContain("Visita - Keven - Audi A3");
    expect(result).toContain("15:00");
    expect(result).toMatch(/março|marco/); // formato pt-BR
  });

  it("usa formato pt-BR para data e horario", () => {
    const template = "{data} - {horario}";
    const eventStartAt = "2026-03-09T14:30:00-03:00";

    const result = buildReminderMessage(template, "Evento", eventStartAt);

    expect(result).toMatch(/segunda|terça|quarta|quinta|sexta|sábado|domingo/i);
    expect(result).toContain("14:30");
  });

  it("substitui {hora} igual a {horario}", () => {
    const template = "Horario: {hora}";
    const eventStartAt = "2026-03-10T09:00:00-03:00";

    const result = buildReminderMessage(template, "X", eventStartAt);

    expect(result).toBe("Horario: 09:00");
  });

  it("template padrao do processo de lembretes", () => {
    const defaultTemplate =
      "Ola! Passando para lembrar do seu agendamento de {titulo} hoje as {horario}. Te esperamos!";
    const eventTitle = "Visita - Maria - Corolla";
    const eventStartAt = "2026-03-09T10:00:00-03:00";

    const result = buildReminderMessage(defaultTemplate, eventTitle, eventStartAt);

    expect(result).toContain("Visita - Maria - Corolla");
    expect(result).toContain("10:00");
    expect(result).toContain("agendamento");
    expect(result).toContain("lembrar");
  });
});
