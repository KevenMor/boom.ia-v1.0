import { describe, expect, it } from "vitest";
import {
  buildSunsetQualificationDirective,
  computeSunsetQualificationMode,
  detectSunsetSiteFormMessage,
} from "./sunset-thermas.js";

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

  it("cita promoção só em modos lodging-related", () => {
    expect(buildSunsetQualificationDirective("first_open_qualification")).toMatch(
      /N[AÃ]O mencionar promo[cç][ãa]o 25% OFF/i
    );
    expect(buildSunsetQualificationDirective("lodging_intent_seen_no_form")).toMatch(/25% OFF/i);
    expect(buildSunsetQualificationDirective("structured_form")).toMatch(/25% OFF/i);
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
