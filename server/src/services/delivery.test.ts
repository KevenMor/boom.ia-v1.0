import { describe, expect, it } from "vitest";
import { extractVideoUrlsFromText } from "./delivery.js";

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
});
