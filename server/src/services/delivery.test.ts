import { describe, expect, it } from "vitest";
import {
  extractVideoUrlsFromText,
  consolidateImageParts,
  expandDeliveryParts,
  shouldPromoteTextToImageCaption,
} from "./delivery.js";

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

describe("mergeAdjacentImageAndTextBlocks", () => {
  it("promove texto curto para legenda da foto", () => {
    expect(shouldPromoteTextToImageCaption("Olha essa opção." )).toBe(true);
  });

  it("não promove texto longo pós-foto para legenda", () => {
    expect(
      shouldPromoteTextToImageCaption(
        "Recebi seu interesse nesse modelo. Me confirma se você quer fotos, valor de entrada ou simulação para eu seguir do jeito certo com você."
      )
    ).toBe(false);
  });

  it("não promove texto com múltiplas linhas para legenda", () => {
    expect(shouldPromoteTextToImageCaption("Linha 1\n\nLinha 2" )).toBe(false);
  });

  it("consolida galeria multi-foto + texto curto em blocos separados (sem legenda)", () => {
    const parts = [
      "![foto](https://example.com/1.jpg)\n![foto](https://example.com/2.jpg)",
      "Dá uma olhada!",
    ];
    const blocks = consolidateImageParts(parts);
    expect(blocks).toEqual([
      { type: "images", imageUrls: ["https://example.com/1.jpg", "https://example.com/2.jpg"] },
      { type: "text", content: "Dá uma olhada!" },
    ]);
  });
});

describe("POST_IMAGES delay otimizado — fotos com legenda", () => {
  // Testa a lógica de delay reduzido (5s) quando ambos os blocos são `images` com `content`.
  // A implementação real está em replyToChatwoot, mas testamos a lógica de decisão aqui.

  function pickPostImagesDelay(
    currentBlock: { type: string; content?: string },
    nextBlock?: { type: string; content?: string }
  ): number {
    const POST_IMAGES_DELAY_MS = 15000;
    const POST_IMAGES_WITH_CAPTION_DELAY_MS = 5000;

    if (!nextBlock) return POST_IMAGES_DELAY_MS;

    const useShortDelay =
      currentBlock.content?.trim() &&
      nextBlock.type === "images" &&
      nextBlock.content?.trim();

    return useShortDelay ? POST_IMAGES_WITH_CAPTION_DELAY_MS : POST_IMAGES_DELAY_MS;
  }

  it("2 blocos images consecutivos com content → 5s", () => {
    const current = { type: "images", content: "Suíte Vip: R$ 1.200,00" };
    const next = { type: "images", content: "LOFT: R$ 1.500,00" };
    expect(pickPostImagesDelay(current, next)).toBe(5000);
  });

  it("bloco images com content seguido de text → 15s", () => {
    const current = { type: "images", content: "Suíte Vip: R$ 1.200,00" };
    const next = { type: "text", content: "Qual você prefere?" };
    expect(pickPostImagesDelay(current, next)).toBe(15000);
  });

  it("bloco images sem content seguido de images com content → 15s", () => {
    const current = { type: "images" }; // sem legenda
    const next = { type: "images", content: "LOFT: R$ 1.500,00" };
    expect(pickPostImagesDelay(current, next)).toBe(15000);
  });

  it("bloco images com content seguido de images sem content → 15s", () => {
    const current = { type: "images", content: "Suíte Vip: R$ 1.200,00" };
    const next = { type: "images" }; // sem legenda
    expect(pickPostImagesDelay(current, next)).toBe(15000);
  });

  it("último bloco (sem next) → 15s (não importa, mas retorna padrão)", () => {
    const current = { type: "images", content: "Suíte Vip: R$ 1.200,00" };
    expect(pickPostImagesDelay(current, undefined)).toBe(15000);
  });
});

describe("expandDeliveryParts", () => {
  it("não separa bloco foto+preço do orçamento Sunset em bolhas distintas", () => {
    const lodgingBlock =
      "![Suíte Luxo](https://cdn.example/luxo.jpg)\n*Suíte Luxo* — R$ 586,50";
    const intro = "Segue o orçamento.\n\n*Resumo*\n• 2 pessoas\n\n• 1 pernoite";
    const parts = expandDeliveryParts([intro, lodgingBlock]);
    const lodgingPart = parts.find((p) => p.includes("![Suíte Luxo]"));
    expect(lodgingPart).toBeDefined();
    expect(lodgingPart).toContain("*Suíte Luxo* — R$ 586,50");
    expect(parts.filter((p) => p.includes("R$ 586,50"))).toHaveLength(1);
  });

  it("consolida bloco foto+preço com legenda na imagem", () => {
    const block =
      "![Chalé](https://cdn.example/chale.jpg)\n*Chalé* — R$ 414,00";
    const expanded = expandDeliveryParts([block]);
    const consolidated = consolidateImageParts(expanded);
    expect(consolidated).toHaveLength(1);
    expect(consolidated[0].type).toBe("images");
    expect(consolidated[0].imageUrls).toHaveLength(1);
    expect(consolidated[0].content).toContain("*Chalé* — R$ 414,00");
  });

  // Regressão 2026-07-06: usuário viu foto+preço em 2 balões separados
  // quando o LLM deixou linha em branco entre eles.
  it("une foto+preço com linha em branco entre eles antes de split", () => {
    const block =
      "![Chalé](https://cdn.example/chale.jpg)\n\n*Chalé* — R$ 414,00";
    const expanded = expandDeliveryParts([block]);
    expect(expanded).toHaveLength(1);
    expect(expanded[0]).toMatch(/!\[Chalé\][\s\S]*\*Chalé\* — R\$ 414,00/);
    expect(expanded[0]).not.toContain("\n\n");
    const consolidated = consolidateImageParts(expanded);
    expect(consolidated).toHaveLength(1);
    expect(consolidated[0].type).toBe("images");
    expect(consolidated[0].content).toContain("*Chalé* — R$ 414,00");
  });

  it("não agrupa indevidamente quando só tem preço sem foto", () => {
    const block = "Chalé — R$ 414,00";
    const expanded = expandDeliveryParts([block]);
    expect(expanded).toEqual(["Chalé — R$ 414,00"]);
  });
});
