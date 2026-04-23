import { describe, it, expect } from "vitest";
import {
  formatDateBR,
  toBrasiliaISO,
  buildFallbackAgendaNotification,
  buildCancelNotification,
  buildHandoffNotification,
  extractClientNameFromMessages,
  userHasProvidedNameInMessages,
  extractPhoneFromMessages,
  resolveHandoffPhone,
  isBlockedAsName,
} from "./agendaNotification.js";

describe("formatDateBR", () => {
  it("formata ISO com offset para dia_semana DD/MM/AAAA, HH:MM", () => {
    const result = formatDateBR("2026-03-09T15:00:00-03:00");
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}.*\d{2}:\d{2}/);
    expect(result).toContain("09/03/2026");
    expect(result).toContain("15:00");
  });

  it("trata ISO sem timezone como Brasilia (evita 07:00 quando salvo 10:00)", () => {
    const result = formatDateBR("2026-03-10T10:00:00");
    expect(result).toContain("10/03/2026");
    expect(result).toContain("10:00");
  });

  it("trata +00:00 como UTC (17:00 UTC = 14:00 BRT)", () => {
    const result = formatDateBR("2026-03-10T17:00:00+00:00");
    expect(result).toContain("10/03/2026");
    expect(result).toContain("14:00");
  });

  it("formata ISO com Z (UTC correto) em horário de São Paulo", () => {
    const result = formatDateBR("2026-03-10T17:00:00.000Z");
    expect(result).toContain("10/03/2026");
    expect(result).toContain("14:00");
  });

  it("retorna string vazia para input vazio", () => {
    expect(formatDateBR("")).toBe("");
  });
});

describe("toBrasiliaISO", () => {
  it("adiciona -03:00 quando não há timezone", () => {
    expect(toBrasiliaISO("2026-03-10T14:00:00")).toBe("2026-03-10T14:00:00-03:00");
  });
  it("substitui +00:00 por -03:00", () => {
    expect(toBrasiliaISO("2026-03-10T14:00:00+00:00")).toBe("2026-03-10T14:00:00-03:00");
  });
  it("retorna vazio para string vazia", () => {
    expect(toBrasiliaISO("")).toBe("");
  });
  it("não altera string que já tem -03:00", () => {
    const s = "2026-03-10T14:00:00-03:00";
    expect(toBrasiliaISO(s)).toBe(s);
  });
});

describe("buildFallbackAgendaNotification", () => {
  it("formata notificacao multiline com nome, data BR, telefone e veiculo", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Keven",
      "2026-03-09T15:00:00-03:00",
      "15998023871",
      "Yamaha XTZ Lander 250 azul"
    );

    expect(result).toContain("📅 Agendamento criado:");
    expect(result).toContain("Keven");
    expect(result).toContain("09/03/2026");
    expect(result).toContain("15:00");
    expect(result).toContain("📞 +5515998023871");
    expect(result).toContain("🚗 Interesse: Yamaha XTZ Lander 250 azul");
    expect(result).toContain("✅ Agendado automaticamente pela IA");

    const lines = result.split("\n");
    expect(lines[0]).toBe("📅 Agendamento criado:");
    expect(lines[1]).toBe("Keven");
    expect(lines[lines.length - 1]).toBe("✅ Agendado automaticamente pela IA");
  });

  it("formata telefone com +55", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Maria",
      "2026-03-10T10:00:00-03:00",
      "5515999887766"
    );
    expect(result).toContain("📞 +5515999887766");
  });

  it("omite telefone e veiculo quando nao informados", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Joao",
      "2026-03-12T09:00:00-03:00"
    );
    expect(result).toContain("Joao");
    expect(result).not.toContain("📞");
    expect(result).not.toContain("🚗");
  });

  it("nao contem formato americano YYYY-MM-DD", () => {
    const result = buildFallbackAgendaNotification(
      "Visita - Keven",
      "2026-03-09T17:00:00-03:00",
      "15998023871"
    );
    expect(result).not.toContain("2026-03-09");
    expect(result).toContain("09/03/2026");
  });
});

describe("buildHandoffNotification", () => {
  it("formata notificacao com titulo padrao e telefone", () => {
    const result = buildHandoffNotification(
      "Henrique Carvalho",
      "159998023871"
    );
    expect(result).toContain("Aguarda um atendimento humano");
    expect(result).toContain("Telefone:");
    expect(result).toMatch(/Telefone:\s*\+/);
    expect(result).not.toContain("Data e hora:");
    expect(result).not.toContain("Nome:");
  });

  it("mantém telefone quando nome vazio", () => {
    const r = buildHandoffNotification("", "159998023871");
    expect(r).toContain("Aguarda um atendimento humano");
    expect(r).toContain("Telefone:");
    expect(r).not.toContain("Nome:");
  });

  it("Telefone Não informado quando valor sem dígitos suficientes", () => {
    const result = buildHandoffNotification("Maria", "abc");
    expect(result).toContain("Telefone: Não informado");
    expect(result).not.toContain("Nome:");
  });
});

describe("isBlockedAsName", () => {
  it("bloqueia frases de agradecimento que vazavam como nome (bug Geovana)", () => {
    expect(isBlockedAsName("Ok obrigada")).toBe(true);
    expect(isBlockedAsName("ah simm obrigada")).toBe(true);
    expect(isBlockedAsName("obrigada")).toBe(true);
    expect(isBlockedAsName("obrigado")).toBe(true);
    expect(isBlockedAsName("ah sim")).toBe(true);
  });
  it("permite nomes válidos", () => {
    expect(isBlockedAsName("Geovana Proença")).toBe(false);
    expect(isBlockedAsName("Henrique Carvalho")).toBe(false);
    expect(isBlockedAsName("Vila Helena")).toBe(false);
  });
});

describe("extractClientNameFromMessages", () => {
  it("extrai nome antes do CPF", () => {
    const messages = [
      { role: "user", content: "Itau Henrique Carvalho 000.001.001-45 05/03/1997" },
    ];
    expect(extractClientNameFromMessages(messages)).toBe("Henrique Carvalho");
  });
  it("não retorna agradecimentos como nome (bug Geovana — notificações com Nome: Ok obrigada)", () => {
    const messages = [
      { role: "assistant", content: "Perfeito! Aguarde um momento que vou encaminhar para o time." },
      { role: "user", content: "Ok obrigada" },
    ];
    expect(extractClientNameFromMessages(messages)).toBeUndefined();
  });
  it("não retorna 'ah simm obrigada' como nome", () => {
    const messages = [
      { role: "assistant", content: "Vou encaminhar para o time da unidade." },
      { role: "user", content: "ah simm obrigada" },
    ];
    expect(extractClientNameFromMessages(messages)).toBeUndefined();
  });
  it("retorna nome real quando há agradecimento como última mensagem (prioriza nome anterior)", () => {
    const messages = [
      { role: "user", content: "Geovana Proença" },
      { role: "assistant", content: "Prazer! Qual unidade prefere?" },
      { role: "user", content: "Ok obrigada" },
    ];
    expect(extractClientNameFromMessages(messages)).toBe("Geovana Proença");
  });

  it("não retorna Sicred (banco) como nome", () => {
    expect(
      extractClientNameFromMessages([{ role: "user", content: "Sicred" }])
    ).toBeUndefined();
    expect(
      extractClientNameFromMessages([{ role: "user", content: "financiei pelo Sicred" }])
    ).toBeUndefined();
  });

  it("extrai nome explícito me chamo / nome é", () => {
    expect(
      extractClientNameFromMessages([{ role: "user", content: "me chamo João Silva" }])
    ).toBe("João Silva");
    expect(
      extractClientNameFromMessages([{ role: "user", content: "meu nome é Ana Júlia" }])
    ).toBe("Ana Júlia");
  });

  it("não infere nome por frase curta sem pergunta prévia de nome", () => {
    const messages = [
      { role: "assistant", content: "Como funciona pra tirar CNH?" },
      { role: "user", content: "nunca dirigi" },
    ];
    expect(extractClientNameFromMessages(messages)).toBeUndefined();
  });

  it("aceita nome quando foi resposta direta a pergunta de nome", () => {
    const messages = [
      { role: "assistant", content: "Como posso te chamar?" },
      { role: "user", content: "João" },
    ];
    expect(extractClientNameFromMessages(messages)).toBe("João");
  });
});

describe("userHasProvidedNameInMessages", () => {
  it("não marca frases curtas como nome sem contexto de pergunta", () => {
    const messages = [{ role: "user", content: "tenho interesse" }];
    expect(userHasProvidedNameInMessages(messages)).toBe(false);
  });

  it("marca nome quando o cliente responde após pergunta de nome", () => {
    const messages = [
      { role: "assistant", content: "Como posso te chamar?" },
      { role: "user", content: "Maria" },
    ];
    expect(userHasProvidedNameInMessages(messages)).toBe(true);
  });
});

describe("extractPhoneFromMessages e resolveHandoffPhone", () => {
  it("extrai telefone do texto do usuário", () => {
    const messages = [{ role: "user", content: "meu cel é (19) 99778-9482" }];
    const p = extractPhoneFromMessages(messages);
    expect(p).toBeTruthy();
    expect(p!.replace(/\D/g, "").length).toBeGreaterThanOrEqual(10);
  });

  it("resolveHandoffPhone usa histórico quando external_user_id não é telefone", () => {
    const messages = [{ role: "user", content: "pode ligar no 15 99694-3416" }];
    expect(resolveHandoffPhone("chatwoot-user", messages)).toBeTruthy();
  });
});

describe("buildCancelNotification", () => {
  it("formata cancelamento multiline com nome e data BR", () => {
    const result = buildCancelNotification(
      "Visita - Keven",
      "2026-03-09T15:00:00-03:00"
    );

    expect(result).toContain("❌ Agendamento cancelado:");
    expect(result).toContain("Keven");
    expect(result).toContain("09/03/2026");
    expect(result).toContain("15:00");
    expect(result).not.toContain("2026-03-09");
  });
});
