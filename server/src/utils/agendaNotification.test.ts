import { describe, it, expect } from "vitest";
import {
  formatDateBR,
  toBrasiliaISO,
  buildFallbackAgendaNotification,
  buildCancelNotification,
  buildHandoffNotification,
  buildHandoffPrivateNote,
  extractClientNameFromMessages,
  extractVeiculoFromMessages,
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
  it("formata notificacao com nome, telefone e interesse", () => {
    const result = buildHandoffNotification(
      "Henrique Carvalho",
      "159998023871",
      "Chevrolet Onix Joy"
    );
    expect(result).toContain("Cliente aguardando atendimento:");
    expect(result).toContain("Henrique Carvalho");
    expect(result).toContain("📞");
    expect(result).toContain("Interesse: Chevrolet Onix Joy");
    expect(result).toContain("Encaminhado automaticamente pela IA");
  });

  it("extrai Camaro do histórico sem fragmentar 'Motors'", () => {
    const messages = [
      {
        role: "assistant",
        content:
          "Olá! Sou a Ana Júlia, da PPL Motors de Sorocaba. Já vi seu interesse no Camaro SS V8 e vou cuidar do seu atendimento por aqui. Como posso te chamar?",
      },
      { role: "user", content: "Sim" },
    ];
    const result = buildHandoffNotification("Cliente", "5515999999999", undefined, messages);
    expect(result).toContain("Interesse:");
    expect(result).toMatch(/Camaro/i);
    expect(result).not.toMatch(/rs de Sorocaba/i);
    expect(result).not.toMatch(/vou cuidar/i);
  });

  it("não usa trecho de LGPD / processo como interesse", () => {
    const messages = [
      {
        role: "assistant",
        content:
          "Aqui na PPL Motors, o processo é bem simples e a gente segue todas as normas da LGPD (Lei Geral de Proteção de Dados) e esta conversa fica registrada.",
      },
      { role: "user", content: "quero falar com atendente" },
    ];
    const result = buildHandoffNotification("Cliente", "5515999999999", undefined, messages);
    expect(result).not.toContain("Interesse:");
  });
});

describe("buildHandoffPrivateNote", () => {
  it("monta resumo interno com nome, interesse, urgência e assinatura", () => {
    const note = buildHandoffPrivateNote({
      nomeCliente: "Gabriella Lustosa",
      telefoneCliente: "5511999990000",
      veiculoInteresse: "gestão de redes sociais",
      motivo: "pediu proposta comercial",
      messages: [
        { role: "user", content: "Quero valores e uma proposta personalizada" },
        { role: "assistant", content: "Claro! Vou te ajudar." },
      ],
      agentName: "Manu",
    });
    expect(note).toContain("Resumo do atendimento");
    expect(note).toContain("Nome: Gabriella Lustosa");
    expect(note).toContain("Interesse: gestão de redes sociais");
    expect(note).toContain("Urgência:");
    expect(note).toContain("Gerado automaticamente por Manu");
    expect(note).toMatch(/proposta|valores/i);
  });
});

describe("extractVeiculoFromMessages", () => {
  it("prioriza modelo citado pelo cliente", () => {
    const messages = [
      { role: "user", content: "Tenho interesse na Ford Maverick" },
      { role: "assistant", content: "Ótimo! Vou te passar os detalhes da Maverick." },
    ];
    expect(extractVeiculoFromMessages(messages)).toMatch(/Maverick/i);
  });

  it("não casa 'moto' dentro de Motors", () => {
    const messages = [
      {
        role: "assistant",
        content: "Sou a Ana Júlia, da PPL Motors de Sorocaba. Já vi seu interesse na S10.",
      },
    ];
    const v = extractVeiculoFromMessages(messages);
    expect(v).toMatch(/S10/i);
    expect(v).not.toMatch(/^rs\b/i);
  });
});

describe("extractClientNameFromMessages", () => {
  it("extrai nome antes do CPF", () => {
    const messages = [
      { role: "user", content: "Itau Henrique Carvalho 000.001.001-45 05/03/1997" },
    ];
    expect(extractClientNameFromMessages(messages)).toBe("Henrique Carvalho");
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
