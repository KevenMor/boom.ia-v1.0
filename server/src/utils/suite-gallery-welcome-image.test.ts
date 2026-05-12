import { describe, expect, it } from "vitest";
import {
  responseAlreadyIncludesWelcomeImage,
  welcomeConversationImageUrlFromMarkdown,
} from "./suite-gallery-welcome-image.js";

describe("welcomeConversationImageUrlFromMarkdown", () => {
  it("extrai URL do markdown de abertura", () => {
    const md = "![Vale Suíço Resort](https://cdn.example/capa.jpg)\n\n";
    expect(welcomeConversationImageUrlFromMarkdown(md)).toBe("https://cdn.example/capa.jpg");
  });
});

describe("responseAlreadyIncludesWelcomeImage", () => {
  const welcomeMd = "![Vale Suíço Resort](https://cdn.example/capa.jpg)\n\n";

  it("detecta prefixo idêntico", () => {
    const content = `${welcomeMd}Boa tarde! Aqui é a Vitória.`;
    expect(responseAlreadyIncludesWelcomeImage(content, welcomeMd)).toBe(true);
  });

  it("detecta mesma URL em outro ponto do texto", () => {
    const content = `**Vitória:**\n\n![Vale Suíço Resort](https://cdn.example/capa.jpg)\n\nBoa tarde!`;
    expect(responseAlreadyIncludesWelcomeImage(content, welcomeMd)).toBe(true);
  });

  it("retorna false quando a capa ainda não está no conteúdo", () => {
    expect(responseAlreadyIncludesWelcomeImage("Boa tarde! Aqui é a Vitória.", welcomeMd)).toBe(false);
  });
});
