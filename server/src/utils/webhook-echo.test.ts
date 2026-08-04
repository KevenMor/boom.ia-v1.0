import { describe, expect, it } from "vitest";
import {
  isAssistantMessageFromHumanAgent,
  isLikelyEchoAgainstHistory,
  isLikelyEchoContent,
} from "./webhook-echo.js";

describe("isAssistantMessageFromHumanAgent", () => {
  it("detecta source chatwoot_human", () => {
    expect(isAssistantMessageFromHumanAgent({ source: "chatwoot_human" })).toBe(true);
    expect(isAssistantMessageFromHumanAgent({ source: "ai" })).toBe(false);
    expect(isAssistantMessageFromHumanAgent(null)).toBe(false);
  });
});

describe("isLikelyEchoContent", () => {
  it("marca strings idênticas", () => {
    expect(isLikelyEchoContent("pode me transferir para equipe?", "pode me transferir para equipe?")).toBe(
      true,
    );
  });

  it("não marca citação curta do cliente", () => {
    const bot =
      "Você já conhece o Vale Suíço ou seria a primeira vez por aqui? Posso te ajudar com hospedagem.";
    expect(isLikelyEchoContent("seria a primeira vez", bot)).toBe(false);
  });
});

describe("isLikelyEchoAgainstHistory", () => {
  const now = Date.parse("2026-08-04T23:22:00.000Z");

  it("NÃO ignora mensagem do cliente só porque um humano repetiu o mesmo texto", () => {
    const history = [
      {
        role: "user",
        content: "reservas do brasil",
        created_at: "2026-08-04T22:35:00.000Z",
      },
      {
        role: "assistant",
        content: "Perfeito! Vou te passar agora mesmo para a nossa equipe comercial.",
        created_at: "2026-08-04T23:16:00.000Z",
        metadata: {},
      },
      {
        role: "assistant",
        content: "pode me transferir para equipe?",
        created_at: "2026-08-04T23:20:00.000Z",
        metadata: { source: "chatwoot_human", sender_name: "Gabriella" },
      },
    ];
    expect(
      isLikelyEchoAgainstHistory("pode me transferir para equipe?", history, 300, now),
    ).toBe(false);
  });

  it("ainda detecta eco real da IA", () => {
    const botText =
      "Perfeito! Vou te passar agora mesmo para a nossa equipe comercial para te darem todo o suporte.";
    const history = [
      {
        role: "assistant",
        content: botText,
        created_at: "2026-08-04T23:20:00.000Z",
        metadata: {},
      },
    ];
    expect(isLikelyEchoAgainstHistory(botText, history, 300, now)).toBe(true);
  });
});
