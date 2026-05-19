import { describe, it, expect } from "vitest";
import { injectInventoryPhotosIfMissing } from "./inventory-photo-inject.js";

const toolResult = JSON.stringify({
  _hint: "ESTOQUE ATUAL...",
  total: 1,
  vehicles: [
    {
      id: "9032b933-d637-43fd-a04c-0d0bbfbc9ade",
      nome_completo: "FIAT FASTBACK 1.0 TURBO 200 HYBRID IMPETUS CVT",
      photos_markdown: "![foto](https://example.com/1.jpg)\n![foto](https://example.com/2.jpg)\n![foto](https://example.com/3.jpg)",
    },
  ],
  photos_markdown: "![foto](https://example.com/1.jpg)\n![foto](https://example.com/2.jpg)\n![foto](https://example.com/3.jpg)",
});

describe("injectInventoryPhotosIfMissing", () => {
  it("injects photos when ENVIAR_FOTOS_VEICULO present but no images in text", () => {
    const assistantText = "ENVIAR_FOTOS_VEICULO: FIAT FASTBACK 1.0 TURBO 200 HYBRID IMPETUS CVT | id: 9032b933-d637-43fd-a04c-0d0bbfbc9ade\n\nOlha só as fotos dele!";
    const result = injectInventoryPhotosIfMissing({
      assistantText,
      toolResultStrings: [toolResult],
    });
    expect(result).not.toBeNull();
    expect(result!.fullText).toContain("![foto](https://example.com/1.jpg)");
    expect(result!.fullText).toContain("Olha só as fotos dele!");
    expect(result!.fullText).not.toContain("ENVIAR_FOTOS_VEICULO");
  });

  it("does not inject when images already present", () => {
    const assistantText = "ENVIAR_FOTOS_VEICULO: FIAT FASTBACK | id: 9032b933-d637-43fd-a04c-0d0bbfbc9ade\n\n![foto](https://example.com/1.jpg)\nOlha!";
    const result = injectInventoryPhotosIfMissing({
      assistantText,
      toolResultStrings: [toolResult],
    });
    expect(result).toBeNull();
  });

  it("does not inject when no ENVIAR_FOTOS command", () => {
    const assistantText = "Temos um Fiat Fastback disponível! Quer ver fotos?";
    const result = injectInventoryPhotosIfMissing({
      assistantText,
      toolResultStrings: [toolResult],
    });
    expect(result).toBeNull();
  });

  it("respects max photos limit", () => {
    const assistantText = "ENVIAR_FOTOS_VEICULO: FIAT FASTBACK 1.0 TURBO 200 HYBRID IMPETUS CVT | id: 9032b933-d637-43fd-a04c-0d0bbfbc9ade | 2\n\nAqui estão!";
    const result = injectInventoryPhotosIfMissing({
      assistantText,
      toolResultStrings: [toolResult],
    });
    expect(result).not.toBeNull();
    const imageLines = result!.fullText.split("\n").filter((l) => l.startsWith("!["));
    expect(imageLines).toHaveLength(2);
  });

  it("matches by name when no id provided", () => {
    const assistantText = "ENVIAR_FOTOS_VEICULO: FIAT FASTBACK 1.0 TURBO 200 HYBRID IMPETUS CVT\n\nConfira!";
    const result = injectInventoryPhotosIfMissing({
      assistantText,
      toolResultStrings: [toolResult],
    });
    expect(result).not.toBeNull();
    expect(result!.fullText).toContain("![foto](https://example.com/1.jpg)");
  });

  it("falls back to single vehicle when name does not match exactly", () => {
    const assistantText = "ENVIAR_FOTOS_VEICULO: Fastback Turbo\n\nVeja!";
    const result = injectInventoryPhotosIfMissing({
      assistantText,
      toolResultStrings: [toolResult],
    });
    expect(result).not.toBeNull();
    expect(result!.fullText).toContain("![foto](https://example.com/1.jpg)");
  });
});
