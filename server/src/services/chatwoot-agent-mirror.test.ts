import { describe, expect, it } from "vitest";
import {
  buildAgentMirrorPayload,
  configChatwootAccountId,
  maskSecret,
  matchesChatwootAccount,
  sanitizeConfigForMirror,
} from "./chatwoot-agent-mirror.js";

describe("chatwoot-agent-mirror", () => {
  it("mascara segredos no config", () => {
    const out = sanitizeConfigForMirror({
      chatwoot_url: "https://cw.example.com",
      chatwoot_api_token: "abc123456789",
      waha_api_key: "secret",
    });
    expect(out.chatwoot_url).toBe("https://cw.example.com");
    expect(out.chatwoot_api_token).toBe("••••6789");
    expect(out.waha_api_key).toBe("••••cret");
  });

  it("associa agente pelo chatwoot_account_id", () => {
    expect(matchesChatwootAccount({ chatwoot_account_id: 12 }, "12")).toBe(true);
    expect(matchesChatwootAccount({ chatwoot_account_id: "99" }, "100")).toBe(false);
    expect(configChatwootAccountId({ chatwoot_account_id: 7 })).toBe("7");
  });

  it("monta payload espelho sem expor token bruto", () => {
    const payload = buildAgentMirrorPayload(
      {
        id: "agent-1",
        name: "Bia",
        description: "Atendimento",
        status: "active",
        avatar_url: null,
        tenant_id: "t1",
        provider_id: "p1",
        model: "gpt-4o-mini",
        temperature: 0.7,
        system_prompt: "Olá",
        webhook_token: "whsec",
        config: { chatwoot_account_id: "5", chatwoot_api_token: "tok1234567890" },
        updated_at: "2026-01-01T00:00:00Z",
        tenants: { name: "Sunset", slug: "sunset-thermas" },
        providers: { name: "OpenAI" },
      },
      [{ id: "tool1", name: "Estoque", tool_type: "inventory_query", description: null }],
      "https://api.example.com/api",
    );

    expect(payload.name).toBe("Bia");
    expect(payload.webhook_url).toContain("agent-1");
    expect(payload.config.chatwoot_api_token).toBe("••••7890");
    expect(payload.tools).toHaveLength(1);
    expect(maskSecret("ab")).toBe("••••");
  });
});
