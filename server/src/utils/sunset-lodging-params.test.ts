import { describe, it, expect } from "vitest";
import {
  assistantAskedGuestComposition,
  conversationHasCompleteGuestComposition,
  conversationNeedsChildrenConfirmation,
  conversationNeedsChildAgesConfirmation,
  conversationHasDeclaredLodgingDates,
  conversationHasDeclaredGuestCount,
  detectSunsetLodgingInterestKeywords,
  extractSunsetClientNameFromMessages,
  extractSunsetLodgingParams,
  extractSunsetLodgingDateRange,
  extractSunsetFormAccommodationFromMessages,
  shouldIncludeDefaultLoftInterestKeywords,
  SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS,
  messageDeclaresGuestCompositionComplete,
  messageDeclaresCoupleAsTwoAdults,
  messageDeclaresNoChildren,
  messageDeclaresLodgingReservationInterest,
  messageDeclaresLodgingAmenityFaq,
  messageDeclaresLodgingPriceOrAvailabilityInquiry,
  messageDeclaresLodgingQuoteReadiness,
  messageDeclaresLodgingInfoWithoutFixedDates,
  userNeedsSunsetLodgingToolCall,
  resolveGuestCountFromAnswer,
  messageUsesVagueGuestCountOnly,
  conversationHasPendingLodgingQuote,
  conversationHadLodgingQuoteRequest,
  shouldAutoInvokeSunsetLodgingTool,
  shouldBlockSunsetLodgingToolCall,
  getSunsetLodgingToolBlockInstruction,
  conversationRequiresLodgingCompositionGate,
  buildSunsetChildrenConfirmationReply,
  messageDeclaresExplicitLodgingDates,
  messageDeclaresNewLodgingQuoteIntent,
  sliceActiveLodgingQuoteMessages,
  lodgingQuoteNeedsFreshToolResult,
  conversationAlreadyDeliveredLodgingQuote,
  parseExplicitGuestCount,
  shouldReinvokeSunsetLodging,
  userAsksSunsetLodgingCategoryOrPrice,
  userMessageIsPhotoRequestOnly,
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

  it("'Sábado agora' em terça 14/07 → check-in sábado 18/07 (não hoje nem domingo 19)", () => {
    const refTue = new Date("2026-07-14T15:00:00.000Z");
    const messages = [
      { role: "user", content: "quero hospedagem" },
      { role: "assistant", content: "Para qual data?" },
      { role: "user", content: "Sábado agora" },
      { role: "assistant", content: "Quantas pessoas?" },
      { role: "user", content: "2 adultos" },
      { role: "assistant", content: "Alguma criança?" },
      { role: "user", content: "não" },
    ];
    expect(conversationHasDeclaredLodgingDates(messages, refTue)).toBe(true);
    const params = extractSunsetLodgingParams(messages, refTue);
    expect(params?.check_in).toBe("2026-07-18");
    expect(params?.check_out).toBe("2026-07-19");
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

  it("'Para 2 pessoas' declara contagem — ainda pede crianças (não casal)", () => {
    const msgs = [
      { role: "user", content: "gostaria de saber sobre a hospedagem Para 2 pessoas" },
    ];
    expect(conversationHasDeclaredGuestCount(msgs)).toBe(true);
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(true);
    expect(conversationHasCompleteGuestComposition(msgs)).toBe(false);
  });

  it("'apenas um casal' = 2 adultos sem criança (composição completa)", () => {
    const msgs = [
      { role: "user", content: "gostaria de saber sobre a hospedagem Para 2 pessoas" },
      { role: "assistant", content: "Quantas pessoas vão? Alguma criança?" },
      { role: "user", content: "São apenas um casal" },
    ];
    expect(resolveGuestCountFromAnswer("São apenas um casal", msgs)).toBe(2);
    expect(messageDeclaresCoupleAsTwoAdults("São apenas um casal")).toBe(true);
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(false);
    expect(conversationHasCompleteGuestComposition(msgs)).toBe(true);
  });

  it("não trata casal com filho como só adultos", () => {
    expect(messageDeclaresCoupleAsTwoAdults("casal com 1 filho")).toBe(false);
    expect(messageDeclaresNoChildren("casal com 1 filho")).toBe(false);
  });

  it("detecta pedido de info/valor sem data fechada", () => {
    expect(
      messageDeclaresLodgingInfoWithoutFixedDates(
        "Não tem data. Só quero informações por enquanto. De qual o valor, o que é incluso"
      )
    ).toBe(true);
    expect(messageDeclaresLodgingInfoWithoutFixedDates("quero hospedagem sábado")).toBe(false);
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
    expect(messageDeclaresLodgingPriceOrAvailabilityInquiry("Faz um orçamento para 10 pessoas")).toBe(true);
  });
});

describe("orçamento 10 pessoas + data única (18/7)", () => {
  const ref = new Date("2026-07-11T12:00:00Z");

  const messagesAfterDate = [
    { role: "user", content: "Faz um orçamento para 10 pessoas" },
    { role: "assistant", content: "Para qual período você gostaria do orçamento para 10 pessoas?" },
    { role: "user", content: "25/7" },
    {
      role: "assistant",
      content:
        "Para 25/7, o parque estará fechado. A próxima data em que o parque estará aberto é em 26 de julho. Gostaria de verificar a disponibilidade para esse período?",
    },
    { role: "user", content: "18/7" },
  ];

  it("10 pessoas exige confirmar crianças antes de cotar", () => {
    expect(conversationHasCompleteGuestComposition(messagesAfterDate)).toBe(false);
    expect(conversationNeedsChildrenConfirmation(messagesAfterDate)).toBe(true);
    expect(extractSunsetLodgingParams(messagesAfterDate, ref)).toBeNull();
    expect(userNeedsSunsetLodgingToolCall(messagesAfterDate)).toBe(false);
    expect(shouldAutoInvokeSunsetLodgingTool(messagesAfterDate)).toBe(false);
  });

  it("10 pessoas + sem crianças declaradas libera orçamento com datas", () => {
    const msgs = [
      ...messagesAfterDate,
      { role: "assistant", content: "Alguma criança vai junto? Se sim, quantas e com quantos anos?" },
      { role: "user", content: "nao, so adultos" },
    ];
    expect(conversationHasCompleteGuestComposition(msgs)).toBe(true);
    expect(extractSunsetLodgingParams(msgs, ref)?.guests).toHaveLength(10);
    expect(userNeedsSunsetLodgingToolCall(msgs)).toBe(true);
  });

  it("pedido único com 10 pessoas e datas ainda pergunta crianças", () => {
    const msgs = [
      {
        role: "user",
        content: "Faz um orçamento para 10 pessoas para o dia 18 e 19/07",
      },
    ];
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(true);
    expect(extractSunsetLodgingDateRange(msgs, ref)).toEqual({
      check_in: "2026-07-18",
      check_out: "2026-07-19",
    });
    expect(extractSunsetLodgingParams(msgs, ref)).toBeNull();
    expect(shouldAutoInvokeSunsetLodgingTool(msgs)).toBe(false);
  });

  it("após informar idades das crianças libera orçamento e não repete pergunta", () => {
    const msgs = [
      { role: "user", content: "Faz um orçamento para 10 pessoas para o dia 18 e 19/07" },
      { role: "assistant", content: "Perfeito, 10 pessoas! Alguma criança vai junto? Se sim, quantas e com quantos anos?" },
      { role: "user", content: "apenas duas, sendo uma de 3 anos e uma de 10" },
    ];
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(false);
    expect(shouldBlockSunsetLodgingToolCall(msgs)).toBe(false);
    expect(extractSunsetLodgingParams(msgs, ref)?.guests).toEqual([
      ...Array.from({ length: 8 }, () => ({ type: "adult" })),
      { type: "child", age: 3 },
      { type: "child", age: 10 },
    ]);
    expect(shouldAutoInvokeSunsetLodgingTool(msgs)).toBe(true);
  });

  it("novo orçamento 10 pessoas após sem criancas em ciclo anterior ainda pergunta crianças", () => {
    const msgs = [
      { role: "user", content: "Faz orçamento 2 pessoas dia 01/08 a 02/08" },
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "nao, so adultos" },
      { role: "assistant", content: "Chalé R$ 500 Loft R$ 800" },
      { role: "user", content: "Faz um orçamento para 10 pessoas para o dia 18 e 19/07" },
    ];
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(true);
    expect(conversationHasCompleteGuestComposition(sliceActiveLodgingQuoteMessages(msgs))).toBe(false);
    expect(shouldBlockSunsetLodgingToolCall(msgs)).toBe(true);
    expect(buildSunsetChildrenConfirmationReply(msgs)).toMatch(/10 pessoas.*criança/i);
  });

  it("pedido único dia 18 e 19/07 não pede período de novo após repetir mensagem", () => {
    const msgs = [
      { role: "user", content: "Faz um orçamento para 10 pessoas para o dia 18 e 19/07" },
      { role: "assistant", content: "Para qual período você gostaria do orçamento para 10 pessoas?" },
      { role: "user", content: "Faz um orçamento para 10 pessoas para o dia 18 e 19/07" },
    ];
    expect(conversationHasDeclaredLodgingDates(msgs, ref)).toBe(true);
    expect(conversationNeedsChildrenConfirmation(msgs)).toBe(true);
    expect(extractSunsetLodgingParams(msgs, ref)).toBeNull();
    expect(shouldBlockSunsetLodgingToolCall(msgs)).toBe(true);
    expect(getSunsetLodgingToolBlockInstruction(msgs)).toMatch(/Alguma criança vai junto/i);
    expect(shouldAutoInvokeSunsetLodgingTool(msgs)).toBe(false);
  });

  it("regressão Diego: 'Os chalés sai que valores' sem composição → gate + bloqueio de tool", () => {
    const msgs = [
      { role: "user", content: "quero saber de hospedagem em setembro" },
      { role: "assistant", content: "Para cada data, me confirma quantas pessoas vão (adultos e crianças com idades)?" },
      { role: "user", content: "Os chalés sai que valores" },
    ];
    expect(conversationRequiresLodgingCompositionGate(msgs)).toBe(true);
    expect(shouldBlockSunsetLodgingToolCall(msgs)).toBe(true);
    expect(conversationHasCompleteGuestComposition(msgs)).toBe(false);
    expect(getSunsetLodgingToolBlockInstruction(msgs)).toMatch(/crian[cç]a|COMPOSI[CÇ][AÃ]O|PROIBIDO citar preços/i);
  });

  it("extrai check-in 18/07, check-out +1 noite e 10 hóspedes após confirmar adultos", () => {
    const msgs = [
      ...messagesAfterDate,
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "sem criancas" },
    ];
    const params = extractSunsetLodgingParams(msgs, ref);
    expect(params).toEqual({
      check_in: "2026-07-18",
      check_out: "2026-07-19",
      guests: Array.from({ length: 10 }, () => ({ type: "adult" })),
      interest_keywords: [...SUNSET_DEFAULT_LOFT_INTEREST_KEYWORDS],
    });
  });

  it("dispara tool quando cliente informa data e confirma composição", () => {
    const msgs = [
      ...messagesAfterDate,
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "nao, todos adultos" },
    ];
    expect(conversationHasPendingLodgingQuote(msgs)).toBe(true);
    expect(userNeedsSunsetLodgingToolCall(msgs)).toBe(true);
  });

  it("não dispara tool só com pedido de período (sem data ainda)", () => {
    const msgs = messagesAfterDate.slice(0, 2);
    expect(conversationHasPendingLodgingQuote(msgs)).toBe(true);
    expect(extractSunsetLodgingParams(msgs, ref)).toBeNull();
    expect(userNeedsSunsetLodgingToolCall(msgs)).toBe(false);
  });

  it("pedido só com 10 pessoas (sem datas) é orçamento pendente", () => {
    const msgs = [{ role: "user", content: "Faz um orçamento para 10 pessoas" }];
    expect(conversationHasPendingLodgingQuote(msgs)).toBe(true);
    expect(extractSunsetLodgingParams(msgs, ref)).toBeNull();
    expect(userNeedsSunsetLodgingToolCall(msgs)).toBe(false);
  });

  it("recota após orçamento anterior errado quando cliente informa novas datas", () => {
    const msgs = [
      { role: "user", content: "Faz um orçamento para 10 pessoas" },
      { role: "assistant", content: "Para qual período?" },
      { role: "user", content: "18/07" },
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "nao, so adultos" },
      {
        role: "assistant",
        content: "Chalé — R$ 2.070,00 o pacote. Loft — R$ 3.500,00 o pacote.",
      },
      { role: "user", content: "dia 18/07 a 19/07" },
    ];
    expect(conversationAlreadyDeliveredLodgingQuote(msgs)).toBe(true);
    expect(conversationHasPendingLodgingQuote(msgs)).toBe(true);
    expect(extractSunsetLodgingParams(msgs, ref)?.guests).toHaveLength(10);
    expect(userNeedsSunsetLodgingToolCall(msgs)).toBe(true);
    expect(shouldAutoInvokeSunsetLodgingTool(msgs)).toBe(true);
  });

  it("sandbox longo: novo pedido 10 pessoas após orçamentos antigos no histórico", () => {
    const msgs = [
      { role: "user", content: "quero hospedagem" },
      { role: "assistant", content: "Chalé R$ 2.070 e Loft R$ 3.500 para 2 pessoas." },
      { role: "user", content: "Faz um orçamento para 10 pessoas" },
      { role: "assistant", content: "Para qual período você gostaria do orçamento para 10 pessoas?" },
      { role: "user", content: "dia 18/07 a 19/07" },
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "sem criancas" },
    ];
    expect(conversationHadLodgingQuoteRequest(msgs)).toBe(true);
    expect(conversationHasPendingLodgingQuote(msgs)).toBe(true);
    expect(userNeedsSunsetLodgingToolCall(msgs)).toBe(true);
    expect(shouldAutoInvokeSunsetLodgingTool(msgs)).toBe(true);
    expect(lodgingQuoteNeedsFreshToolResult(msgs)).toBe(true);
    expect(messageDeclaresExplicitLodgingDates("dia 18/07 a 19/07")).toBe(true);
    const params = extractSunsetLodgingParams(msgs, ref);
    expect(params?.guests).toHaveLength(10);
    expect(params?.check_in).toBe("2026-07-18");
    expect(params?.check_out).toBe("2026-07-19");
  });

  it("não mistura datas/composição de orçamento anterior no histórico longo", () => {
    const msgs = [
      { role: "user", content: "orçamento para 2 pessoas, 15/6 a 16/6" },
      {
        role: "assistant",
        content: "Chalé — R$ 900,00 o pacote. Loft — R$ 1.200,00 o pacote.",
      },
      { role: "user", content: "obrigado, depois vejo" },
      { role: "assistant", content: "Combinado! Estou à disposição." },
      { role: "user", content: "Faz um orçamento para 10 pessoas" },
      { role: "assistant", content: "Para qual período?" },
      { role: "user", content: "18/07 a 19/07" },
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "nao, todos adultos" },
    ];
    const params = extractSunsetLodgingParams(msgs, ref);
    expect(params?.guests).toHaveLength(10);
    expect(params?.check_in).toBe("2026-07-18");
    expect(params?.check_out).toBe("2026-07-19");
    expect(params?.check_in).not.toBe("2026-06-15");
    expect(shouldAutoInvokeSunsetLodgingTool(msgs)).toBe(true);
  });

  it("outro orçamento totalmente diferente após conversa longa", () => {
    const msgs = [
      { role: "user", content: "oi" },
      { role: "assistant", content: "Olá! Sou a Julia." },
      { role: "user", content: "quero orçamento 4 pessoas 10/8 a 11/8" },
      {
        role: "assistant",
        content: "Chalé — R$ 1.600. Loft — R$ 2.100.",
      },
      { role: "user", content: "e ingresso do parque?" },
      { role: "assistant", content: "Ingresso adulto R$ 50." },
      { role: "user", content: "outro orçamento: 8 adultos, 20/12 a 22/12" },
    ];
    expect(messageDeclaresNewLodgingQuoteIntent("outro orçamento: 8 adultos, 20/12 a 22/12")).toBe(true);
    expect(sliceActiveLodgingQuoteMessages(msgs).length).toBe(1);
    const params = extractSunsetLodgingParams(msgs, ref);
    expect(params?.guests).toHaveLength(8);
    expect(params?.check_in).toBe("2026-12-20");
    expect(params?.check_out).toBe("2026-12-22");
    expect(shouldAutoInvokeSunsetLodgingTool(msgs)).toBe(true);
  });
});

describe("pedido de fotos após orçamento — não re-cotar", () => {
  const quotedThread = [
    { role: "user", content: "orçamento 10 pessoas, dia 18 e 19/07" },
    { role: "assistant", content: "Alguma criança vai junto?" },
    { role: "user", content: "apenas duas, uma de 3 anos e uma de 10" },
    {
      role: "assistant",
      content:
        "Como vocês são 10, organizamos em 3 quartos. Chalé — R$ 2.277,00. Loft — R$ 4.050,00.",
    },
    { role: "user", content: "tem foto do loft?" },
  ];

  it("detecta pedido só de fotos", () => {
    expect(userMessageIsPhotoRequestOnly("tem foto do loft?")).toBe(true);
    expect(userMessageIsPhotoRequestOnly("quanto fica o loft?")).toBe(false);
  });

  it("não trata pedido de foto como pergunta de categoria/preço", () => {
    expect(userAsksSunsetLodgingCategoryOrPrice(quotedThread)).toBe(false);
  });

  it("não auto-invoca lodging_consulta após pedido de foto", () => {
    expect(shouldAutoInvokeSunsetLodgingTool(quotedThread)).toBe(false);
    expect(userNeedsSunsetLodgingToolCall(quotedThread)).toBe(false);
  });
});
