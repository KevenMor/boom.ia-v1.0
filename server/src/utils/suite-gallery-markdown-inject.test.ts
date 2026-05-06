import { describe, it, expect } from "vitest";
import {
  collectSuiteGalleryMarkdownFromToolResults,
  hasAtLeastOneCompleteMarkdownHttpImage,
  injectSuiteGalleryMarkdownIfMissing,
  shouldInjectSuiteGalleryMarkdown,
  stripBrokenMarkdownImageLines,
} from "./suite-gallery-markdown-inject.js";

const SAMPLE_TOOL = JSON.stringify({
  galleries: [
    {
      nome: "LOFT",
      photos_markdown: "![LOFT](https://cdn.example/1.jpg)",
    },
    {
      nome: "VIP",
      photos_markdown: "![VIP](https://cdn.example/2.jpg)",
    },
  ],
});

describe("suite-gallery-markdown-inject", () => {
  it("coalesce markdown de várias galerias", () => {
    expect(collectSuiteGalleryMarkdownFromToolResults([SAMPLE_TOOL])).toContain("https://cdn.example/1.jpg");
    expect(collectSuiteGalleryMarkdownFromToolResults([SAMPLE_TOOL])).toContain("https://cdn.example/2.jpg");
  });

  it("injeta quando o assistente promete fotos mas não manda markdown", () => {
    const r = injectSuiteGalleryMarkdownIfMissing({
      assistantText: "Keven, aqui estão as fotos das acomodações: Suíte Vip Junior: Suíte Vip:",
      toolResultStrings: [SAMPLE_TOOL],
      lastUserMessage: "todas",
    });
    expect(r).not.toBeNull();
    expect(r!.fullText).toMatch(/!\[.*\]\(https:\/\/cdn\.example/);
  });

  it("não injeta se já houver imagem markdown", () => {
    const r = injectSuiteGalleryMarkdownIfMissing({
      assistantText: "Veja ![x](https://a/b.jpg)",
      toolResultStrings: [SAMPLE_TOOL],
      lastUserMessage: "quero foto",
    });
    expect(r).toBeNull();
  });

  it("injeta quando há só markdown de imagem truncado (stream cortou o URL)", () => {
    const r = injectSuiteGalleryMarkdownIfMissing({
      assistantText:
        "Oi Keven, tudo bem? Segue uma foto da nossa Suite Loft:\n\n![Loft](https://ia.agboom.com.br/api/x/465c1",
      toolResultStrings: [SAMPLE_TOOL],
      lastUserMessage: "manda foto da suite",
    });
    expect(r).not.toBeNull();
    expect(r!.fullText).toMatch(/https:\/\/cdn\.example\/1\.jpg/);
    expect(r!.fullText).not.toContain("465c1");
  });

  it("hasAtLeastOneCompleteMarkdownHttpImage ignora abertura sem fecho )", () => {
    expect(
      hasAtLeastOneCompleteMarkdownHttpImage("![L](https://x.com/a")
    ).toBe(false);
    expect(hasAtLeastOneCompleteMarkdownHttpImage("![L](https://x.com/a.jpg)")).toBe(true);
  });

  it("stripBrokenMarkdownImageLines remove linha incompleta e preserva a seguinte", () => {
    expect(
      stripBrokenMarkdownImageLines("Intro\n\n![L](https://x.com/z\n\nComo posso te chamar?")
    ).toBe("Intro\n\nComo posso te chamar?");
  });

  it("injeta quando o usuário pede foto no estilo \"primeira vez, quero foto\"", () => {
    const r = injectSuiteGalleryMarkdownIfMissing({
      assistantText: "Que legal! Como posso te ajudar com as suítes?",
      toolResultStrings: [SAMPLE_TOOL],
      lastUserMessage: "primeira vez, quero foto",
    });
    expect(r).not.toBeNull();
    expect(r!.appended).toMatch(/https:\/\/cdn\.example/);
  });

  it("shouldInject respeita última mensagem do usuário", () => {
    expect(
      shouldInjectSuiteGalleryMarkdown({
        assistantText: "Olá, temos ótimas suítes.",
        galleryMarkdown: "![a](https://x/y.jpg)",
        lastUserMessage: "quais horários?",
      })
    ).toBe(false);
    expect(
      shouldInjectSuiteGalleryMarkdown({
        assistantText: "aqui estão as fotos",
        galleryMarkdown: "![a](https://x/y.jpg)",
        lastUserMessage: "ok",
      })
    ).toBe(true);
  });
});
