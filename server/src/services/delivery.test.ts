import { describe, expect, it } from "vitest";
import { extractVideoUrlsFromText, consolidateImageParts } from "./delivery.js";

describe("extractVideoUrlsFromText", () => {
  it("remove linha só com URL .mp4 e query string", () => {
    const raw =
      "Olha o vídeo:\n\nhttps://host/storage/v1/object/public/b/x/video.mp4?t=1777316782678\n\nPróximo passo";
    const { textOnly, videoUrls } = extractVideoUrlsFromText(raw);
    expect(videoUrls).toEqual([
      "https://host/storage/v1/object/public/b/x/video.mp4?t=1777316782678",
    ]);
    expect(textOnly).toContain("Olha o vídeo:");
    expect(textOnly).toContain("Próximo passo");
    expect(textOnly).not.toMatch(/https:\/\//);
  });

  it("extrai markdown [texto](url.mp4)", () => {
    const { textOnly, videoUrls } = extractVideoUrlsFromText(
      'Veja [neste link](https://cdn.example.com/a.mp4) por favor.'
    );
    expect(videoUrls).toEqual(["https://cdn.example.com/a.mp4"]);
    expect(textOnly).toBe("Veja  por favor.");
  });

  it("extrai ![alt](url.webm)", () => {
    const { videoUrls } = extractVideoUrlsFromText("Antes\n\n![tour](https://x.webm)\n\nDepois");
    expect(videoUrls).toEqual(["https://x.webm"]);
  });

  it("remove parênteses externos em volta da URL", () => {
    const { textOnly, videoUrls } = extractVideoUrlsFromText(
      "(https://files.test/clipe.mov)\n\nOk?"
    );
    expect(videoUrls).toEqual(["https://files.test/clipe.mov"]);
    expect(textOnly).toContain("Ok?");
  });

  // Regressão — bug Vale Suíço (Vitória) 2026-05:
  // LLM escreveu intro + URL na mesma linha. Antes do fix, a URL vazava como texto cru
  // ao cliente porque a regex de linha inteira (/^...$/) não casava.
  it("extrai URL de vídeo inline com texto antes (caso Vale Suíço)", () => {
    const raw =
      "Que legal, Gabriella! Esse vídeo mostra um pouco da estrutura do resort. " +
      "https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/" +
      "suite-galleries/a0a818f4-af11-49fa-b3e1-9c898b9e3578/ad6dcf8e-344c-47f3-8dc1-caffdafcfdec/" +
      "video-6dee9daf-41b6-4a2d-aa86-0c7d1b8011cc.mp4?t=1777316782678";
    const { textOnly, videoUrls } = extractVideoUrlsFromText(raw);
    expect(videoUrls).toHaveLength(1);
    expect(videoUrls[0]).toBe(
      "https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/" +
        "suite-galleries/a0a818f4-af11-49fa-b3e1-9c898b9e3578/ad6dcf8e-344c-47f3-8dc1-caffdafcfdec/" +
        "video-6dee9daf-41b6-4a2d-aa86-0c7d1b8011cc.mp4?t=1777316782678"
    );
    expect(textOnly).toContain("Que legal, Gabriella!");
    expect(textOnly).toContain("estrutura do resort");
    expect(textOnly).not.toMatch(/https?:\/\//);
  });

  it("extrai URL de vídeo inline com texto antes E depois", () => {
    const raw = "Olha: https://cdn.example.com/clip.mp4 vale ver antes de falarmos de datas.";
    const { textOnly, videoUrls } = extractVideoUrlsFromText(raw);
    expect(videoUrls).toEqual(["https://cdn.example.com/clip.mp4"]);
    expect(textOnly).toContain("Olha:");
    expect(textOnly).toContain("vale ver antes de falarmos de datas.");
    expect(textOnly).not.toMatch(/https?:\/\//);
  });

  it("strip de pontuação final que pertence à prosa", () => {
    const raw = "Vídeo aqui: https://x.com/v.mp4.";
    const { textOnly, videoUrls } = extractVideoUrlsFromText(raw);
    expect(videoUrls).toEqual(["https://x.com/v.mp4"]);
    expect(textOnly).toContain("Vídeo aqui:");
    expect(textOnly).not.toMatch(/https?:\/\//);
  });

  it("captura URL com fragmento #t=0", () => {
    const raw = "Assista: https://x.com/tour.mp4#t=10 :)";
    const { videoUrls } = extractVideoUrlsFromText(raw);
    expect(videoUrls).toEqual(["https://x.com/tour.mp4#t=10"]);
  });

  it("captura múltiplas URLs inline na mesma linha", () => {
    const raw = "Dois clipes: https://a.com/1.mp4 e https://b.com/2.mp4 — escolha!";
    const { textOnly, videoUrls } = extractVideoUrlsFromText(raw);
    expect(videoUrls).toEqual(["https://a.com/1.mp4", "https://b.com/2.mp4"]);
    expect(textOnly).not.toMatch(/https?:\/\//);
  });
});

describe("consolidateImageParts — múltiplos vídeos", () => {
  it("emite um bloco video por URL (WhatsApp um anexo por mensagem)", () => {
    const parts = ["Veja:\n\nhttps://a.example.com/1.mp4\n\nhttps://b.example.com/2.mp4"];
    const blocks = consolidateImageParts(parts);
    const vids = blocks.filter((b) => b.type === "video");
    expect(vids.length).toBe(2);
    expect(vids[0].videoUrl).toContain("1.mp4");
    expect(vids[1].videoUrl).toContain("2.mp4");
  });

  it("deduplica a mesma URL de vídeo", () => {
    const parts = ["https://x.com/a.mp4\n\nhttps://x.com/a.mp4"];
    expect(consolidateImageParts(parts).filter((b) => b.type === "video").length).toBe(1);
  });
});
