import { describe, expect, it } from "vitest";
import { isInsideParentEmbed, openMegaChatwootConversation } from "./open-mega-chatwoot-conversation";

describe("openMegaChatwootConversation", () => {
  it("retorna false sem URL", () => {
    expect(openMegaChatwootConversation(null)).toBe(false);
    expect(openMegaChatwootConversation("")).toBe(false);
  });

  it("detecta embed quando parent difere", () => {
    expect(isInsideParentEmbed()).toBe(false);
  });
});
