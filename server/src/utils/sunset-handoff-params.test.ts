import { describe, expect, it } from "vitest";
import {
  assistantAnnouncesSunsetHandoff,
  buildSunsetHandoffToolArgs,
  messageDeclaresHumanAgentRequest,
  messageDeclaresOutOfScopeTopic,
  resolveSunsetHandoffReason,
  resolveSunsetHandoffReasonFromAssistantText,
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

  it("confirmação curta após interesse em reservar dispara handoff", () => {
    const messages = [
      { role: "user", content: "quero reservar a suíte luxo" },
      { role: "assistant", content: "Perfeito, valor R$ 586" },
      { role: "user", content: "sim" },
    ];
    expect(resolveSunsetHandoffReason(messages)).toBe("setor_reservas");
    expect(shouldAutoInvokeSunsetHandoff(messages)).toBe(true);
  });

  it("detecta anúncio de encaminhamento da Julia no texto", () => {
    expect(
      assistantAnnouncesSunsetHandoff(
        "Vou encaminhar para o setor de reservas dar continuidade por aqui. Eles confirmam a disponibilidade."
      )
    ).toBe(true);
    expect(resolveSunsetHandoffReasonFromAssistantText("vou encaminhar ao setor de reservas")).toBe(
      "setor_reservas"
    );
    expect(assistantAnnouncesSunsetHandoff("Quer ver a próxima opção?")).toBe(false);
  });

  it("resolve motivo de handoff para excursão", () => {
    const messages = [{ role: "user", content: "vocês fazem excursão escolar?" }];
    expect(resolveSunsetHandoffReason(messages)).toBe("excursao");
    expect(buildSunsetHandoffToolArgs("excursao")).toEqual({ reason: "Excursões" });
  });

  it("não trata 'N famílias' em hospedagem como excursão", () => {
    const messages = [
      { role: "user", content: "quero hospedagem" },
      { role: "assistant", content: "Quantas pessoas?" },
      { role: "user", content: "Então estamos procurando um destino para umas 6 ou 7 famílias" },
    ];
    expect(resolveSunsetHandoffReason(messages)).toBeNull();
  });

  it("não dispara handoff em agradecimento", () => {
    const messages = [{ role: "user", content: "obrigadoo" }];
    expect(shouldAutoInvokeSunsetHandoff(messages)).toBe(false);
  });
});
