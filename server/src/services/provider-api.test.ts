import { describe, expect, it } from "vitest";
import { resolveDispatcherModel } from "./provider-api.js";

describe("resolveDispatcherModel", () => {
  it("usa model_default do provider quando agente/tenant vazios", () => {
    expect(
      resolveDispatcherModel(undefined, undefined, {
        name: "Anthropic",
        model_default: "claude-sonnet-4-20250514",
        base_url: "https://api.anthropic.com/v1",
      }),
    ).toBe("claude-sonnet-4-20250514");
  });

  it("prioriza dispatcher_model do agente", () => {
    expect(
      resolveDispatcherModel("gpt-4o", undefined, {
        model_default: "claude-sonnet-4-20250514",
        base_url: "https://api.anthropic.com/v1",
      }),
    ).toBe("gpt-4o");
  });

  it("infere Claude quando base_url é Anthropic e sem defaults", () => {
    expect(
      resolveDispatcherModel("", "", { base_url: "https://codeflow-gateway.example/v1" }),
    ).toBe("gpt-4o");
    expect(
      resolveDispatcherModel("", "", { base_url: "https://api.anthropic.com/v1" }),
    ).toBe("claude-sonnet-4-20250514");
  });
});
