import { describe, expect, it } from "vitest";
import {
  lookupState,
  normalizePhoneFromChatwoot,
} from "./chatwoot-crm-embed.js";
import {
  crmPhoneMatches,
  formatPhoneForStorage,
  isValidCrmPhone,
  normalizeBrazilPhoneDigits,
} from "../utils/crm-phone-match.js";

describe("crm-phone-match (server)", () => {
  it("normaliza telefone BR com DDI 55", () => {
    expect(normalizeBrazilPhoneDigits("11999998888")).toBe("5511999998888");
    expect(normalizeBrazilPhoneDigits("5511999998888")).toBe("5511999998888");
  });

  it("compara telefones equivalentes", () => {
    expect(crmPhoneMatches("5511999998888", "+55 11 99999-8888")).toBe(true);
    expect(crmPhoneMatches("5511999998888", "11888887777")).toBe(false);
  });
});

describe("chatwoot-crm-embed helpers", () => {
  it("valida telefone CRM", () => {
    expect(isValidCrmPhone("5511999998888")).toBe(true);
    expect(isValidCrmPhone("123")).toBe(false);
  });

  it("formata telefone para storage", () => {
    expect(formatPhoneForStorage("11999998888")).toBe("+5511999998888");
  });

  it("lookupState reflete contact_type", () => {
    expect(lookupState(null)).toBe("missing");
    expect(lookupState({ contact_type: "lead" } as never)).toBe("lead");
    expect(lookupState({ contact_type: "client" } as never)).toBe("client");
  });

  it("normalizePhoneFromChatwoot aceita phone_number Chatwoot", () => {
    expect(normalizePhoneFromChatwoot("+55 11 99999-8888")).toBe("5511999998888");
    expect(normalizePhoneFromChatwoot("abc")).toBeNull();
  });

  it("crmPhoneMatches alinha dígitos", () => {
    expect(crmPhoneMatches("5511999998888", "+5511999998888")).toBe(true);
  });
});
