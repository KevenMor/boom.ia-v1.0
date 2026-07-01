import { describe, expect, it } from "vitest";
import { buildChatwootConversationPath, buildChatwootConversationUrl } from "./chatwoot-conversation-url.js";

describe("buildChatwootConversationUrl", () => {
  it("monta path relativo para embed Mega", () => {
    expect(buildChatwootConversationUrl("https://ia.agboom.com.br", 9, 42, { relative: true })).toBe(
      "/app/accounts/9/conversations/42",
    );
  });

  it("monta URL absoluta para painel admin", () => {
    expect(buildChatwootConversationUrl("https://mega.atendai.app", 9, 42)).toBe(
      "https://mega.atendai.app/app/accounts/9/conversations/42",
    );
  });
});
