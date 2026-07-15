/**
 * Regressões dos prints jul/2026 (Mariana, Felipe, Ariane) — Julia Sunset.
 * Trava: anti-reenvio de orçamento após dúvida + "N famílias" ≠ excursão.
 */
import { describe, expect, it } from "vitest";
import {
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  SYSTEM_PROMPT,
} from "../services/prompts/sunset-thermas.js";
import {
  messageDeclaresExcursionIntent,
  resolveSunsetHandoffReason,
  shouldAutoInvokeSunsetHandoff,
} from "./sunset-handoff-params.js";
import {
  conversationAlreadyDeliveredLodgingQuote,
  messageDeclaresMultiFamilyLodgingGroup,
  messageDeclaresPostLodgingQuoteClarification,
  userNeedsSunsetLodgingToolCall,
} from "./sunset-lodging-params.js";
import {
  formatSunsetLodgingQuoteForDelivery,
  shouldRebuildSunsetQuoteFromTool,
} from "./sunset-lodging-quote-format.js";

const SAMPLE_QUOTE = `Segue o orçamento para 4 pessoas. Os valores já incluem 25% OFF e o pacote fechado (pernoite + jantar + café + acesso ao parque).

*Chalé* — R$ 586,50 o pacote de 1 noite
*Suíte Luxo* — R$ 759,00 o pacote de 1 noite
*Suíte com Varanda* — R$ 796,50 o pacote de 1 noite
*Apartamento Vista Piscina* — R$ 845,25 o pacote de 1 noite`;

const TOOL_JSON = JSON.stringify({
  status: "success",
  nights: 1,
  available_accommodations: [
    { name: "STANDART", total_price: 586.5 },
    { name: "LUXO DUPLO", total_price: 759 },
    { name: "LUXO COM VARANDA", total_price: 796.5 },
    { name: "APARTAMENTO VISTA", total_price: 845.25 },
  ],
});

function threadAfterQuote(lastUser: string) {
  return [
    { role: "user", content: "Hospedagem" },
    { role: "assistant", content: "Tem alguma data em mente?" },
    { role: "user", content: "17 e 18 de julho" },
    { role: "assistant", content: "Quantas pessoas?" },
    { role: "user", content: "Dois adultos e duas crianças 1 ano e 12 anos" },
    { role: "assistant", content: SAMPLE_QUOTE },
    { role: "user", content: lastUser },
  ];
}

describe("Regressão prints Sunset (Mariana) — anti-reenvio de orçamento", () => {
  const marianaClarifications = [
    "Essa tem vista para represa?",
    "Qual horário de entrada e de saída",
    "Então entra na sexta 10h e sai no sábado as 13h podendo permanecer no parque até 18h?",
    "Se a entrada for no sábado e a saída no domingo o valor é o mesmo?",
    "Pode enviar fotos desse?",
  ];

  it.each(marianaClarifications)(
    "após orçamento, '%s' NÃO dispara tool de hospedagem",
    (msg) => {
      expect(conversationAlreadyDeliveredLodgingQuote(threadAfterQuote(msg))).toBe(true);
      expect(messageDeclaresPostLodgingQuoteClarification(msg) || /vista|fotos?/i.test(msg)).toBe(
        true
      );
      expect(userNeedsSunsetLodgingToolCall(threadAfterQuote(msg))).toBe(false);
    }
  );

  it("resposta curta de horário NÃO reconstrói lista de preços (mesmo com tool no turno)", () => {
    const short =
      "O check-in é a partir das 10h e o check-out é às 13h. A permanência no parque é até às 18h.";
    expect(
      shouldRebuildSunsetQuoteFromTool(short, {
        accommodations: [{ name: "STANDART" }, { name: "LUXO" }],
      })
    ).toBe(false);
    const formatted = formatSunsetLodgingQuoteForDelivery(short, [TOOL_JSON], {
      lastUserMessage: "Qual horário de entrada e de saída",
    });
    expect(formatted).toBe(short);
    expect(formatted).not.toMatch(/Segue o orçamento/i);
    expect(formatted).not.toContain("<<MSG_SPLIT>>");
  });

  it("confirmação de check-in NÃO reconstrói orçamento", () => {
    const short = "Isso mesmo — check-in sexta às 10h e check-out sábado às 13h, com parque até 18h.";
    expect(shouldRebuildSunsetQuoteFromTool(short, { accommodations: [{ name: "A" }] })).toBe(
      false
    );
    expect(
      formatSunsetLodgingQuoteForDelivery(short, [TOOL_JSON], {
        lastUserMessage:
          "Então entra na sexta 10h e sai no sábado as 13h podendo permanecer no parque até 18h?",
      })
    ).toBe(short);
  });
});

describe("Regressão prints Sunset (Felipe) — 'não entendi os valores'", () => {
  const felipeClarifications = [
    "Esses valores já com o desconto da campanha",
    "Não entendi os valores",
    "Os primeiros valores mencionado refere se a que",
    "Esse valor divide?",
  ];

  it.each(felipeClarifications)("após orçamento, '%s' NÃO dispara tool", (msg) => {
    expect(messageDeclaresPostLodgingQuoteClarification(msg)).toBe(true);
    expect(userNeedsSunsetLodgingToolCall(threadAfterQuote(msg))).toBe(false);
  });

  it("explicação curta dos valores NÃO vira lista completa via rebuild", () => {
    const explain =
      "Cada linha é o total do pacote para o período e o número de pessoas que combinamos — já com o 25% OFF.";
    expect(
      shouldRebuildSunsetQuoteFromTool(
        explain,
        { accommodations: [{ name: "A" }, { name: "B" }] },
        { lastUserMessage: "Não entendi os valores" }
      )
    ).toBe(false);
    expect(
      formatSunsetLodgingQuoteForDelivery(explain, [TOOL_JSON], {
        lastUserMessage: "Não entendi os valores",
      })
    ).toBe(explain);
  });

  it("pedido explícito de repetir valores NÃO é tratado como só esclarecimento", () => {
    expect(messageDeclaresPostLodgingQuoteClarification("pode repetir os valores")).toBe(false);
    expect(messageDeclaresPostLodgingQuoteClarification("manda o orçamento de novo")).toBe(false);
  });
});

describe("Regressão prints Sunset (Ariane) — 6 ou 7 famílias ≠ excursão", () => {
  const familyMsgs = [
    "Então estamos procurando um destino para umas 6 ou 7 famílias",
    "somos 6 ou 7 famílias",
    "quero hospedagem para várias famílias",
  ];

  it.each(familyMsgs)("'%s' é grupo de hospedagem, não excursão", (msg) => {
    expect(messageDeclaresMultiFamilyLodgingGroup(msg)).toBe(true);
    expect(messageDeclaresExcursionIntent(msg)).toBe(false);
  });

  it("fio Ariane: hospedagem + datas + '6 ou 7 famílias' → sem handoff Excursões", () => {
    const messages = [
      { role: "user", content: "Olá, gostaria de maiores informações" },
      {
        role: "assistant",
        content: "Boa noite! Você quer saber sobre o parque, hospedagem ou Thermas Card?",
      },
      { role: "user", content: "Sobre o parque e hospedagem" },
      {
        role: "assistant",
        content: "Entendido! Você tem alguma data em mente para a sua visita?",
      },
      { role: "user", content: "19, 20, 21 com saida 22/11" },
      {
        role: "assistant",
        content: "Para essa estadia de 19 a 22 de novembro, com 3 noites, quantas pessoas vão na hospedagem?",
      },
      {
        role: "user",
        content: "Então estamos procurando um destino para umas 6 ou 7 famílias",
      },
    ];

    expect(resolveSunsetHandoffReason(messages)).toBeNull();
    expect(shouldAutoInvokeSunsetHandoff(messages)).toBe(false);
    expect(userNeedsSunsetLodgingToolCall(messages)).toBe(false);
  });

  it("excursão escolar continua sendo handoff Excursões", () => {
    expect(
      resolveSunsetHandoffReason([{ role: "user", content: "quero informações sobre excursão escolar" }])
    ).toBe("excursao");
  });
});

describe("Regressão prints Sunset — prompt §3d-anti-repetição / §3b-grupos", () => {
  it("prompt proíbe reenviar 'Segue o orçamento' após FAQ", () => {
    expect(SYSTEM_PROMPT).toMatch(/3d-anti-repeti/);
    expect(SYSTEM_PROMPT).toMatch(/Qual horário de entrada e de saída/);
    expect(SYSTEM_PROMPT).toMatch(/[Nn][aã]o entendi os valores/);
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO.*Segue o orçamento|Segue o orçamento…/i);
  });

  it("prompt e dispatcher tratam N famílias como multi-quarto, não Excursões", () => {
    expect(SYSTEM_PROMPT).toMatch(/6 ou 7 fam[ií]lias/i);
    expect(SYSTEM_PROMPT).toMatch(/N[AÃ]O [eé] excurs|[≠].*excurs/i);
    expect(DISPATCHER_PROMPT).toMatch(/6 ou 7 fam[ií]lias|N fam[ií]lias/i);
    expect(DISPATCHER_PROMPT).toMatch(/NO.*handoff Excurs|NOT.*Excurs/i);
    expect(COMMUNICATION_RULES).toMatch(/Anti-reenvio de or[cç]amento|3d-anti-repeti/i);
  });
});
