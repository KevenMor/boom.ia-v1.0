import { describe, it, expect } from "vitest";
import {
  assistantAskedGuestComposition,
  conversationHasCompleteGuestComposition,
  conversationNeedsChildrenConfirmation,
  conversationNeedsChildAgesConfirmation,
  conversationHasDeclaredLodgingDates,
  detectSunsetLodgingInterestKeywords,
  extractSunsetClientNameFromMessages,
  extractSunsetLodgingParams,
  extractSunsetFormAccommodationFromMessages,
  shouldIncludeDefaultLoftInterestKeywords,
  SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS,
  messageDeclaresGuestCompositionComplete,
  messageDeclaresLodgingReservationInterest,
  messageDeclaresLodgingAmenityFaq,
  messageDeclaresLodgingPriceOrAvailabilityInquiry,
  messageDeclaresLodgingQuoteReadiness,
  userNeedsSunsetLodgingToolCall,
  conversationAlreadyDeliveredLodgingQuote,
  messageUsesVagueGuestCountOnly,
  parseExplicitGuestCount,
  shouldReinvokeSunsetLodging,
  userAsksSunsetLodgingCategoryOrPrice,
} from "./sunset-lodging-params.js";

describe("parseExplicitGuestCount", () => {
  it("interpreta 'duas apenas' como 2", () => {
    expect(parseExplicitGuestCount("duas apenas")).toBe(2);
  });

  it("interpreta '2 pessoas' como 2", () => {
    expect(parseExplicitGuestCount("hospedagem para 2 pessoas")).toBe(2);
  });

  it("não infere de contexto vago", () => {
    expect(parseExplicitGuestCount("dia dos namorados")).toBeNull();
  });
});

describe("extractSunsetLodgingParams — caso Dia dos Namorados + duas pessoas", () => {
  const ref = new Date("2026-06-10T12:00:00Z");

  const messages = [
    { role: "user", content: "ola" },
    { role: "assistant", content: "Como prefere ser chamado?" },
    { role: "user", content: "keven" },
    { role: "assistant", content: "Prazer, Keven. Você quer saber sobre parque, hospedagem ou os dois?" },
    { role: "user", content: "hospedagem para o dia dos namorados" },
    {
      role: "assistant",
      content: "Ótima pedida! O Dia dos Namorados é 12/06. Para a hospedagem, quantas pessoas vão?",
    },
    { role: "user", content: "duas apenas" },
  ];

  it("extrai check-in 12/06, checkout domingo 14/06 e 2 adultos após composição completa", () => {
    expect(assistantAskedGuestComposition(messages)).toBe(true);
    expect(extractSunsetLodgingParams(messages, ref)).toBeNull();
    const withChildren = [
      ...messages,
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "nao, so adultos" },
    ];
    const params = extractSunsetLodgingParams(withChildren, ref);
    expect(params).toEqual({
      check_in: "2026-06-12",
      check_out: "2026-06-14",
      guests: [{ type: "adult" }, { type: "adult" }],
      interest_keywords: [...SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS],
    });
  });

  it("retorna null sem composição explícita", () => {
    const withoutGuests = messages.slice(0, -1);
    expect(extractSunsetLodgingParams(withoutGuests, ref)).toBeNull();
  });
});

describe("Loft / hidromassagem — reconsulta", () => {
  const priorToolResult = JSON.stringify({
    status: "success",
    available_accommodations: [
      { name: "STANDART", total_price: 1104 },
      { name: "LUXO DUPLO", total_price: 1564 },
    ],
  });

  const messagesWithLoftQuestion = [
    { role: "user", content: "hospedagem para o dia dos namorados" },
    {
      role: "assistant",
      content: "Ótima pedida! O Dia dos Namorados é 12/06. Para a hospedagem, quantas pessoas vão?",
    },
    { role: "user", content: "final de semana todo e para duas pessoas apenas" },
    { role: "assistant", content: "Alguma criança vai junto?" },
    { role: "user", content: "nao, so adultos" },
    { role: "assistant", content: "Opções: Standart, Luxo Duplo..." },
    { role: "user", content: "gostei, tem algum suite que tem hidromassagem?" },
  ];

  it("detecta interesse loft/hidromassagem", () => {
    expect(detectSunsetLodgingInterestKeywords("tem suite com hidromassagem?")).toContain("hidromassagem");
  });

  it("exige reconsulta quando Loft não estava no resultado anterior", () => {
    expect(userAsksSunsetLodgingCategoryOrPrice(messagesWithLoftQuestion)).toBe(true);
    expect(shouldReinvokeSunsetLodging(messagesWithLoftQuestion, [priorToolResult])).toBe(true);
  });

  it("inclui interest_keywords nos params quando cliente pergunta loft", () => {
    const params = extractSunsetLodgingParams(messagesWithLoftQuestion, new Date("2026-06-10T12:00:00Z"));
    expect(params).not.toBeNull();
    expect(params!.interest_keywords).toContain("hidromassagem");
  });
});

describe("extractSunsetLodgingParams — hoje até amanhã", () => {
  const ref = new Date("2026-06-13T15:00:00.000Z");

  it("extrai check-in hoje e check-out amanhã", () => {
    const params = extractSunsetLodgingParams(
      [{ role: "user", content: "keven, quero hospedagem para o dia de hoje ate amanha" }],
      ref
    );
    expect(params).toBeNull();
  });

  it("com composição completa, monta params completos", () => {
    const messages = [
      { role: "user", content: "keven, quero hospedagem para o dia de hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas vão na estadia?" },
      { role: "user", content: "8 pessoas" },
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "nao, so adultos" },
    ];
    const params = extractSunsetLodgingParams(messages, ref);
    expect(params).toEqual({
      check_in: "2026-06-13",
      check_out: "2026-06-14",
      guests: Array.from({ length: 8 }, () => ({ type: "adult" })),
      interest_keywords: [...SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS],
    });
  });

  it("não confunde hoje com dia dos namorados", () => {
    const msgs = [{ role: "user", content: "hospedagem de hoje ate amanha" }];
    expect(conversationHasDeclaredLodgingDates(msgs, ref)).toBe(true);
  });
});

describe("extractSunsetLodgingParams — datas explícitas", () => {
  it("usa check-in e check-out informados", () => {
    const params = extractSunsetLodgingParams(
      [
        { role: "user", content: "quero hospedagem de 16/05/2026 a 17/05/2026 para 2 adultos" },
      ],
      new Date("2026-05-01T12:00:00Z")
    );
    expect(params).toEqual({
      check_in: "2026-05-16",
      check_out: "2026-05-17",
      guests: [{ type: "adult" }, { type: "adult" }],
      interest_keywords: [...SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS],
    });
  });
});

describe("extractSunsetLodgingParams — Loft interest_keywords padrão (v1.5.36)", () => {
  const FORM_NO_CATEGORY =
    "Olá! Gostaria de verificar disponibilidade para hospedagem no Hotel Sunset Thermas. Check-in: 18/07/2026 Check-out: 19/07/2026 Total de noites: 1 noite Adultos: 2";

  it("inclui interest_keywords padrão quando cliente confirma 'sim' (sem categoria no formulário)", () => {
    const messages = [
      { role: "user", content: FORM_NO_CATEGORY },
      { role: "assistant", content: "Como posso te chamar?" },
      { role: "user", content: "Keven" },
      { role: "assistant", content: "Prazer! Posso te passar o pacote?" },
      { role: "user", content: "sim" },
    ];
    const params = extractSunsetLodgingParams(messages, new Date("2026-07-01T12:00:00Z"));
    expect(params).not.toBeNull();
    expect(params!.guests).toHaveLength(2);
    expect(params!.interest_keywords).toEqual([...SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS]);
  });

  it("NÃO inclui interest_keywords padrão quando formulário trouxe Acomodação específica", () => {
    const messages = [
      {
        role: "user",
        content:
          "Olá! Gostaria de verificar disponibilidade. Acomodação: Chalé Aconchegante Check-in: 16/05/2026 Check-out: 17/05/2026 Adultos: 2",
      },
      { role: "assistant", content: "Como posso te chamar?" },
      { role: "user", content: "Maria" },
      { role: "assistant", content: "Posso te passar o pacote?" },
      { role: "user", content: "sim" },
    ];
    expect(extractSunsetFormAccommodationFromMessages(messages)).toBe("Chalé Aconchegante");
    expect(shouldIncludeDefaultLoftInterestKeywords(messages)).toBe(false);
    const params = extractSunsetLodgingParams(messages, new Date("2026-05-01T12:00:00Z"));
    expect(params?.interest_keywords).toBeUndefined();
  });
});

describe("composição com crianças (v1.5.9)", () => {
  it("detecta contagem vaga sem crianças", () => {
    expect(messageUsesVagueGuestCountOnly("duas pessoas")).toBe(true);
    expect(messageUsesVagueGuestCountOnly("3")).toBe(true);
    expect(messageUsesVagueGuestCountOnly("na verdade tres pessoas")).toBe(true);
    expect(messageUsesVagueGuestCountOnly("nao, so adultos")).toBe(false);
    expect(messageUsesVagueGuestCountOnly("2 adultos e 1 crianca de 5")).toBe(false);
  });

  it("conversationNeedsChildrenConfirmation após número solto", () => {
    const msgs = [
      { role: "user", content: "orcamento hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas vão na estadia?" },
      { role: "user", content: "3" },
    ];
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(true);
    expect(extractSunsetLodgingParams(msgs, new Date("2026-06-13T12:00:00Z"))).toBeNull();
  });

  it("não considera composição completa só com X pessoas", () => {
    const msgs = [
      { role: "user", content: "hospedagem hoje ate amanha" },
      { role: "user", content: "duas pessoas" },
    ];
    expect(conversationHasCompleteGuestComposition(msgs)).toBe(false);
    expect(extractSunsetLodgingParams(msgs, new Date("2026-06-13T12:00:00Z"))).toBeNull();
  });
});

describe("idade de criança obrigatória (v1.5.13)", () => {
  const ref = new Date("2026-06-13T12:00:00Z");

  it("não considera completo criança sem idade", () => {
    expect(messageDeclaresGuestCompositionComplete("2 adultos e 1 criança")).toBe(false);
    expect(messageDeclaresGuestCompositionComplete("sim, 1 criança")).toBe(false);
    expect(messageDeclaresGuestCompositionComplete("2 adultos e 1 criança de 5 anos")).toBe(true);
  });

  it("conversationNeedsChildAgesConfirmation quando falta idade", () => {
    const msgs = [
      { role: "user", content: "hospedagem hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas vão na estadia?" },
      { role: "user", content: "3" },
      { role: "assistant", content: "Alguma criança vai junto? Se sim, quantas e com quantos anos?" },
      { role: "user", content: "sim, 1 criança" },
    ];
    expect(conversationNeedsChildAgesConfirmation(msgs)).toBe(true);
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(false);
    expect(conversationHasCompleteGuestComposition(msgs)).toBe(false);
    expect(extractSunsetLodgingParams(msgs, ref)).toBeNull();
  });

  it("libera cotação após idade informada", () => {
    const msgs = [
      { role: "user", content: "hospedagem hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas vão na estadia?" },
      { role: "user", content: "3" },
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "sim, 1 criança de 4 anos" },
    ];
    expect(conversationNeedsChildAgesConfirmation(msgs)).toBe(false);
    expect(conversationHasCompleteGuestComposition(msgs)).toBe(true);
  });

  it("detecta resposta curta sim à pergunta de crianças", () => {
    const msgs = [
      { role: "user", content: "hospedagem hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas vão?" },
      { role: "user", content: "3" },
      { role: "assistant", content: "Tem criança na composição?" },
      { role: "user", content: "sim" },
    ];
    expect(conversationNeedsChildAgesConfirmation(msgs)).toBe(true);
  });
});

describe("extractSunsetClientNameFromMessages", () => {
  it("não extrai nome de frase de hospedagem", () => {
    const msgs = [
      { role: "user", content: "ola" },
      { role: "assistant", content: "Como prefere ser chamado(a)?" },
      { role: "user", content: "hospedagem para o dia de hoje ate amanha" },
    ];
    expect(extractSunsetClientNameFromMessages(msgs)).toBeUndefined();
  });

  it("extrai nome quando cliente responde só o nome após pergunta", () => {
    const msgs = [
      { role: "user", content: "ola" },
      { role: "assistant", content: "Como prefere ser chamado(a)?" },
      { role: "user", content: "Maria" },
    ];
    expect(extractSunsetClientNameFromMessages(msgs)).toBe("Maria");
  });

  it("extrai de me chamo", () => {
    expect(
      extractSunsetClientNameFromMessages([{ role: "user", content: "me chamo joão, quero hospedagem" }])
    ).toBe("João");
  });
});

describe("messageDeclaresLodgingReservationInterest", () => {
  it("detecta pedido explícito de reserva", () => {
    expect(messageDeclaresLodgingReservationInterest("quero reservar")).toBe(true);
    expect(messageDeclaresLodgingReservationInterest("como faço pra reservar?")).toBe(true);
    expect(messageDeclaresLodgingReservationInterest("manda o link")).toBe(true);
  });

  it("detecta escolha de categoria", () => {
    expect(messageDeclaresLodgingReservationInterest("gostei do Standart")).toBe(true);
    expect(messageDeclaresLodgingReservationInterest("vamos no chalé")).toBe(true);
  });

  it("não confunde pergunta genérica com interesse", () => {
    expect(messageDeclaresLodgingReservationInterest("quanto fica?")).toBe(false);
    expect(messageDeclaresLodgingReservationInterest("8 pessoas")).toBe(false);
  });
});

describe("dúvida de amenidade pós-orçamento (v1.5.36)", () => {
  it("messageDeclaresLodgingAmenityFaq detecta 'spa é aquecido?'", () => {
    expect(messageDeclaresLodgingAmenityFaq("spa é aquecido?")).toBe(true);
    expect(messageDeclaresLodgingAmenityFaq("quanto fica o loft?")).toBe(false);
  });

  it("userNeedsSunsetLodgingToolCall é false após orçamento para dúvida de amenidade", () => {
    const messages = [
      { role: "user", content: "form..." },
      { role: "assistant", content: "*Chalé* — R$ 414,00\n*Suíte Luxo* — R$ 586,50" },
      { role: "user", content: "spa é aquecido?" },
    ];
    expect(conversationAlreadyDeliveredLodgingQuote(messages)).toBe(true);
    expect(userNeedsSunsetLodgingToolCall(messages)).toBe(false);
  });

  it("userNeedsSunsetLodgingToolCall é true quando ainda não houve orçamento", () => {
    const messages = [
      { role: "user", content: "check-in 18/07 adultos 2" },
      { role: "user", content: "sim, pode passar" },
    ];
    expect(userNeedsSunsetLodgingToolCall(messages)).toBe(true);
  });

  it("userNeedsSunsetLodgingToolCall é false só com nome ou composição (sem pedido de valor)", () => {
    const FORM_MSG =
      "Check-in: 18/07/2026 Check-out: 19/07/2026 Adultos: 2";
    expect(
      userNeedsSunsetLodgingToolCall([
        { role: "user", content: FORM_MSG },
        { role: "assistant", content: "Como posso te chamar?" },
        { role: "user", content: "Keven" },
      ])
    ).toBe(false);
    expect(
      userNeedsSunsetLodgingToolCall([
        { role: "user", content: "hospedagem 18 a 19 julho" },
        { role: "assistant", content: "Quantas pessoas?" },
        { role: "user", content: "2 adultos" },
      ])
    ).toBe(false);
  });

  it("messageDeclaresLodgingPriceOrAvailabilityInquiry exige pedido explícito", () => {
    expect(messageDeclaresLodgingPriceOrAvailabilityInquiry("quanto fica?")).toBe(true);
    expect(messageDeclaresLodgingPriceOrAvailabilityInquiry("Keven")).toBe(false);
    expect(messageDeclaresLodgingPriceOrAvailabilityInquiry("2 adultos")).toBe(false);
  });
});
