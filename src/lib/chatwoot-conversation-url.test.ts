import { describe, expect, it } from "vitest";
import { resolveMegaConversationNavigateUrl } from "./chatwoot-conversation-url";

describe("resolveMegaConversationNavigateUrl", () => {
  it("usa account_id do embed e conversation id da API", () => {
    expect(
      resolveMegaConversationNavigateUrl(
        { chatwoot_conversation_id: 99, chatwoot_url: "https://ia.agboom.com.br/app/accounts/9/conversations/99" },
        "9",
      ),
    ).toBe("/app/accounts/9/conversations/99");
  });

  it("extrai path de URL absoluta errada (host boom)", () => {
    expect(
      resolveMegaConversationNavigateUrl({
        chatwoot_url: "https://ia.agboom.com.br/app/accounts/9/conversations/55",
      }),
    ).toBe("/app/accounts/9/conversations/55");
  });
});
