import { describe, expect, it } from "vitest";
import {
  buildSunsetQualificationDirective,
  computeSunsetQualificationMode,
  detectSunsetSiteFormMessage,
  shouldDeferSunsetLodgingQuote,
} from "./sunset-thermas.js";
import {
  messageDeclaresLodgingQuoteReadiness,
} from "../../utils/sunset-lodging-params.js";

describe("Sunset — computeSunsetQualificationMode (v1.5.31)", () => {
  it("first_open_qualification: cliente só diz 'oi' sem histórico de atendente", () => {
    expect(computeSunsetQualificationMode("oi", [{ role: "user" }])).toBe(
      "first_open_qualification"
    );
  });

  it("first_open_qualification: cliente só diz 'boa tarde' sem mais contexto", () => {
    expect(
      computeSunsetQualificationMode("boa tarde", [{ role: "user" }])
    ).toBe("first_open_qualification");
  });

  it("lodging_intent_seen_no_form: cliente fala de hospedagem sem datas completas", () => {
    expect(
      computeSunsetQualificationMode(
        "quero hospedagem com 2 adultos, mas sem data certa",
        [{ role: "user" }]
      )
    ).toBe("lodging_intent_seen_no_form");
  });

  it("lodging_intent_seen_no_form: cliente fala em 'reservar uma diária'", () => {
    expect(
      computeSunsetQualificationMode(
        "Oi! Quero reservar uma diária no parque.",
        [{ role: "user" }]
      )
    ).toBe("lodging_intent_seen_no_form");
  });

  it("structured_form: formulário do site detectado (3+ sinais)", () => {
    expect(
      computeSunsetQualificationMode(
        "Olá! Gostaria de verificar disponibilidade para hospedagem no Hotel Sunset Thermas. Acomodação: Chalé Aconchegante Check-in: 16/05/2026",
        [{ role: "user" }]
      )
    ).toBe("structured_form");
  });

  it("mid_flow: conversa já tem resposta da Julia", () => {
    expect(
      computeSunsetQualificationMode("oi", [
        { role: "user" },
        { role: "assistant" },
      ])
    ).toBe("mid_flow");
  });

  it("mid_flow: conversa tem mais de uma mensagem da Julia", () => {
    expect(
      computeSunsetQualificationMode("Quero o Chalé", [
        { role: "user" },
        { role: "assistant" },
        { role: "user" },
        { role: "assistant" },
      ])
    ).toBe("mid_flow");
  });

  it("first_open_qualification: mensagem vazia cai no fallback", () => {
    expect(
      computeSunsetQualificationMode("", [{ role: "user" }])
    ).toBe("first_open_qualification");
  });

  it("parque sem hospedagem não cai em lodging_intent_seen_no_form", () => {
    // Mensagem só sobre parque — não cita hospedagem
    expect(
      computeSunsetQualificationMode(
        "Quanto custa o ingresso do parque amanhã?",
        [{ role: "user" }]
      )
    ).toBe("first_open_qualification");
  });
});

describe("Sunset — detectSunsetSiteFormMessage (helper base)", () => {
  it("detecta formulário do site com 3 sinais (frase + rótulo + data)", () => {
    expect(
      detectSunsetSiteFormMessage(
        "Olá! Gostaria de verificar disponibilidade. Acomodação: Chalé Aconchegante. Check-in: 16/05/2026"
      )
    ).toBe(true);
  });

  it("não detecta 'oi' como formulário", () => {
    expect(detectSunsetSiteFormMessage("oi")).toBe(false);
  });
});

describe("Sunset — buildSunsetQualificationDirective", () => {
  it("produz diretiva formatada com modo + comportamento esperado", () => {
    const directive = buildSunsetQualificationDirective("first_open_qualification");
    expect(directive).toContain("[MODO QUALIFICAÇÃO ATUAL] = first_open_qualification");
    expect(directive).toMatch(/Comportamento esperado no Turno 1/);
  });

  it("cita promoção só após o nome (não no Turno 1)", () => {
    expect(buildSunsetQualificationDirective("first_open_qualification")).toMatch(
      /N[AÃ]O mencionar promo[cç][ãa]o 25% OFF/i
    );
    expect(buildSunsetQualificationDirective("lodging_intent_seen_no_form")).toMatch(
      /N[AÃ]O mencionar promo[cç][ãa]o 25% OFF/i
    );
    expect(buildSunsetQualificationDirective("structured_form")).toMatch(
      /N[AÃ]O mencionar promo[cç][ãa]o 25% OFF/i
    );
    expect(buildSunsetQualificationDirective("mid_flow")).toMatch(/padr[aã]o/i);
  });

  it("pede nome em todos os modos que envolvem Turno 1", () => {
    expect(buildSunsetQualificationDirective("first_open_qualification")).toMatch(
      /(pedir|perguntar).*nome/i
    );
    expect(buildSunsetQualificationDirective("lodging_intent_seen_no_form")).toMatch(
      /(pedir|perguntar).*nome/i
    );
    expect(buildSunsetQualificationDirective("structured_form")).toMatch(/(pedir|perguntar).*nome/i);
  });
});

const FORM_MSG =
  "Olá! Gostaria de verificar disponibilidade para hospedagem no Hotel Sunset Thermas. Check-in: 18/07/2026 Check-out: 19/07/2026 Total de noites: 1 noite Adultos: 2";

describe("Sunset — shouldDeferSunsetLodgingQuote (v1.5.36)", () => {
  it("adiar no Turno 1 do formulário (só mensagem do site)", () => {
    expect(shouldDeferSunsetLodgingQuote([{ role: "user", content: FORM_MSG }])).toBe(true);
  });

  it("adiar no Turno 2 (cliente respondeu só o nome)", () => {
    expect(
      shouldDeferSunsetLodgingQuote([
        { role: "user", content: FORM_MSG },
        { role: "assistant", content: "Boa noite! Como posso te chamar?" },
        { role: "user", content: "Maria" },
      ])
    ).toBe(true);
  });

  it("liberar orçamento quando cliente aceita ('sim, pode passar')", () => {
    expect(
      shouldDeferSunsetLodgingQuote([
        { role: "user", content: FORM_MSG },
        { role: "assistant", content: "Prazer, Maria! Posso te passar o pacote?" },
        { role: "user", content: "sim, pode passar" },
      ])
    ).toBe(false);
  });

  it("messageDeclaresLodgingQuoteReadiness detecta pedido de valor", () => {
    expect(messageDeclaresLodgingQuoteReadiness("sim, pode passar")).toBe(true);
    expect(messageDeclaresLodgingQuoteReadiness("quanto fica?")).toBe(true);
    expect(messageDeclaresLodgingQuoteReadiness("Maria")).toBe(false);
  });
});
