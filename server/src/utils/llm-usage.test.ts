import { describe, expect, it } from "vitest";
import { mergeLlmStreamUsage, parseOpenAIStreamUsage } from "./llm-usage.js";

describe("parseOpenAIStreamUsage", () => {
  it("retorna null para usage inválido", () => {
    expect(parseOpenAIStreamUsage(null)).toBeNull();
    expect(parseOpenAIStreamUsage("x")).toBeNull();
  });

  it("extrai tokens básicos", () => {
    expect(
      parseOpenAIStreamUsage({ prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 }),
    ).toEqual({
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    });
  });

  it("extrai cached_tokens do Gemini (prompt_tokens_details)", () => {
    expect(
      parseOpenAIStreamUsage({
        prompt_tokens: 3000,
        completion_tokens: 50,
        total_tokens: 3050,
        prompt_tokens_details: { cached_tokens: 2500 },
      }),
    ).toEqual({
      prompt_tokens: 3000,
      completion_tokens: 50,
      total_tokens: 3050,
      cached_tokens: 2500,
    });
  });

  it("ignora cached_tokens zero", () => {
    const u = parseOpenAIStreamUsage({
      prompt_tokens: 500,
      completion_tokens: 10,
      total_tokens: 510,
      prompt_tokens_details: { cached_tokens: 0 },
    });
    expect(u?.cached_tokens).toBeUndefined();
  });
});

describe("mergeLlmStreamUsage", () => {
  it("soma cached_tokens entre iterações", () => {
    const base = { prompt_tokens: 100, completion_tokens: 10, total_tokens: 110, cached_tokens: 50 };
    const next = { prompt_tokens: 200, completion_tokens: 20, total_tokens: 220, cached_tokens: 80 };
    expect(mergeLlmStreamUsage(base, next)).toEqual({
      prompt_tokens: 300,
      completion_tokens: 30,
      total_tokens: 330,
      cached_tokens: 130,
    });
  });
});
