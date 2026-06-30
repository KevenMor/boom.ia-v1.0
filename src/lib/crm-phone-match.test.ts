import { describe, expect, it } from "vitest";
import {
  crmPhoneMatchesConversation,
  extractPhoneDigitsFromChatwootContact,
  normalizeBrazilPhoneDigits,
} from "./crm-phone-match";

describe("crm-phone-match (frontend)", () => {
  it("normaliza telefone BR", () => {
    expect(normalizeBrazilPhoneDigits("11988887777")).toBe("5511988887777");
  });

  it("extrai telefone do contato Chatwoot", () => {
    expect(
      extractPhoneDigitsFromChatwootContact({ phone_number: "+55 11 98888-7777", name: "Ana" }),
    ).toBe("5511988887777");
  });

  it("crmPhoneMatchesConversation", () => {
    expect(crmPhoneMatchesConversation("5511988887777", "+55 11 98888-7777")).toBe(true);
  });
});
