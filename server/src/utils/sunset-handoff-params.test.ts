import { describe, expect, it } from "vitest";
import {
  buildSunsetHandoffToolArgs,
  messageDeclaresHumanAgentRequest,
  messageDeclaresOutOfScopeTopic,
  resolveSunsetHandoffReason,
  shouldAutoInvokeSunsetHandoff,
} from "./sunset-handoff-params.js";

describe("sunset-handoff-params", () => {
  it("detecta pedido de atendimento humano", () => {
    expect(messageDeclaresHumanAgentRequest("quero falar com um atendente")).toBe(true);
    expect(messageDeclaresHumanAgentRequest("me transfere para alguém")).toBe(true);
    expect(messageDeclaresHumanAgentRequest("quanto fica o chalé?")).toBe(false);
  });

  it("detecta assuntos fora do escopo", () => {
    expect(messageDeclaresOutOfScopeTopic("quero cancelar minha reserva")).toBe(true);
    expect(messageDeclaresOutOfScopeTopic("tenho uma reclamação")).toBe(true);
    expect(messageDeclaresOutOfScopeTopic("quero reservar hospedagem")).toBe(false);
  });

  it("resolve motivo de handoff para reserva", () => {
    const messages = [
      { role: "user", content: "quero hospedagem" },
      { role: "assistant", content: "Standart R$ 1.104" },
      { role: "user", content: "quero reservar o standart" },
    ];
    expect(resolveSunsetHandoffReason(messages)).toBe("setor_reservas");
    expect(buildSunsetHandoffToolArgs("setor_reservas")).toEqual({
      reason: "Setor de reservas",
    });
    expect(shouldAutoInvokeSunsetHandoff(messages)).toBe(true);
  });

  it("resolve motivo de handoff para excursão", () => {
    const messages = [{ role: "user", content: "vocês fazem excursão escolar?" }];
    expect(resolveSunsetHandoffReason(messages)).toBe("excursao");
    expect(buildSunsetHandoffToolArgs("excursao")).toEqual({ reason: "Excursões" });
  });

  it("não dispara handoff em agradecimento", () => {
    const messages = [{ role: "user", content: "obrigadoo" }];
    expect(shouldAutoInvokeSunsetHandoff(messages)).toBe(false);
  });
});
