import { describe, expect, it } from "vitest";
import {
  extractSunsetParkParams,
  extractSunsetParkParamsForThermasCard,
  messageDeclaresParkTicketPriceQuestion,
  messageDeclaresGratitudeOrConversationClose,
  shouldAutoInvokeParkForThermasCard,
  userAsksSunsetParkConsultation,
  userAsksThermasCardPricing,
  userConfirmsThermasCardCompositionOnly,
} from "./sunset-park-params.js";

describe("sunset-park-params", () => {
  const ref = new Date("2026-06-12T15:00:00Z");
  const refJul6 = new Date("2026-07-06T15:00:00Z");

  it("detecta pergunta de valor do parque hoje (typo park)", () => {
    const q = "qual valor hoje para ir ao park?";
    expect(messageDeclaresParkTicketPriceQuestion(q)).toBe(true);
    expect(userAsksSunsetParkConsultation([{ role: "user", content: q }])).toBe(true);
  });

  it("extrai data hoje para pergunta de ingresso", () => {
    const params = extractSunsetParkParams(
      [{ role: "user", content: "qual valor hoje para ir ao park?" }],
      ref
    );
    expect(params).toEqual({ date: "2026-06-12" });
  });

  it("não confunde com hospedagem", () => {
    const q = "quero hospedagem para duas pessoas";
    expect(messageDeclaresParkTicketPriceQuestion(q)).toBe(false);
    expect(extractSunsetParkParams([{ role: "user", content: q }], ref)).toBeNull();
  });

  it("Thermas Card + objeção de preço dispara auto consulta de ingresso (hoje)", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o Thermas Card" },
      { role: "assistant", content: "O cartão sai R$ 135,90/mês..." },
      { role: "user", content: "mas achei meio caro" },
    ];
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(true);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toEqual({
      date: "2026-07-06",
    });
    expect(userAsksSunsetParkConsultation(messages)).toBe(false);
  });

  it("Thermas Card sem composição nem objeção não dispara auto consulta", () => {
    const messages = [{ role: "user", content: "o que é o Thermas Card?" }];
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toBeNull();
  });

  it("Thermas Card + confirmação de 5 pessoas (qualificação) não dispara consulta de ingresso", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o thermas card" },
      { role: "assistant", content: "Quantas pessoas entrariam no plano?" },
      { role: "user", content: "seria 5 pessoas mesmo" },
    ];
    expect(userConfirmsThermasCardCompositionOnly(messages)).toBe(true);
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toBeNull();
  });

  it("Thermas Card + fluxo nunca fui + 5 pessoas não dispara consulta de ingresso", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o thermas card" },
      { role: "assistant", content: "Com que frequência vocês costumam vir?" },
      { role: "user", content: "nunca fui" },
      {
        role: "assistant",
        content: "Quantas pessoas entrariam no plano? São R$ 135,90/mês para até 5.",
      },
      { role: "user", content: "seria 5 pessoas mesmo" },
    ];
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toBeNull();
  });

  it("Thermas Card + 'qual valor?' não dispara consulta de ingresso", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o thermas card" },
      {
        role: "assistant",
        content: "O Thermas Card dá acesso ilimitado ao parque por 5 anos. Com que frequência vocês costumam vir?",
      },
      { role: "user", content: "qual valor?" },
    ];
    expect(userAsksThermasCardPricing(messages)).toBe(true);
    expect(userAsksSunsetParkConsultation(messages)).toBe(false);
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParams(messages, refJul6)).toBeNull();
  });

  it("detecta agradecimento puro", () => {
    expect(messageDeclaresGratitudeOrConversationClose("obrigadoo")).toBe(true);
    expect(messageDeclaresGratitudeOrConversationClose("muito obrigado")).toBe(true);
    expect(messageDeclaresGratitudeOrConversationClose("legal, muito obrigado")).toBe(true);
    expect(messageDeclaresGratitudeOrConversationClose("quanto custa o cartão?")).toBe(false);
  });

  it("Thermas Card após compra + obrigado não dispara consulta de ingresso", () => {
    const messages = [
      { role: "user", content: "quero saber sobre o thermas card" },
      { role: "assistant", content: "O Thermas Card dá acesso ilimitado por 5 anos..." },
      { role: "user", content: "pensando assim vale a pena, como compro?" },
      { role: "assistant", content: "Cadastro em https://socio.grupothermas.com.br/cadastro" },
      {
        role: "user",
        content: "legal, muito obrigado. assim que eu fechar, consigo ja reservar hotel com desconto?",
      },
      {
        role: "assistant",
        content: "Sim! Com o cartão ativo você tem 20% na hospedagem. Me chama quando ativar.",
      },
      { role: "user", content: "obrigadoo" },
    ];
    expect(messageDeclaresGratitudeOrConversationClose("obrigadoo")).toBe(true);
    expect(shouldAutoInvokeParkForThermasCard(messages)).toBe(false);
    expect(extractSunsetParkParamsForThermasCard(messages, refJul6)).toBeNull();
    expect(userAsksSunsetParkConsultation(messages)).toBe(false);
  });

  it("'Sábado agora' em terça 14/07 → visita no sábado 18/07 (não domingo 19)", () => {
    const refTue = new Date("2026-07-14T15:00:00.000Z");
    const messages = [
      { role: "user", content: "qual valor do ingresso do parque?" },
      { role: "assistant", content: "Para qual dia você pretende ir?" },
      { role: "user", content: "Sábado agora" },
    ];
    expect(extractSunsetParkParams(messages, refTue)).toEqual({ date: "2026-07-18" });
  });

  it("'agora' sozinho ainda é hoje", () => {
    const refTue = new Date("2026-07-14T15:00:00.000Z");
    const messages = [{ role: "user", content: "qual valor do parque agora?" }];
    expect(extractSunsetParkParams(messages, refTue)).toEqual({ date: "2026-07-14" });
  });
});
