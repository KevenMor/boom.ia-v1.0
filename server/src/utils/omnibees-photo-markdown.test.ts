import { describe, it, expect } from "vitest";
import {
  collectOmnibeesRoomPhotosFromToolResults,
  injectOmnibeesQuotePhotosIfMissing,
} from "./omnibees-photo-markdown.js";

const OMNIBEES_TOOL = JSON.stringify({
  summaryText:
    "Período desta consulta: entrada 15/05/2026, saída 17/05/2026 (2 noite(s)).\n" +
    "![Foto - LOFT](https://cdn.example/loft.jpg)\n" +
    "LOFT: TOTAL para 2 noite(s): R$ 6.463,80 (A Vista - Depósito Bancário).\n" +
    "![Foto - Suíte Vip](https://cdn.example/vip.jpg)\n" +
    "Suíte Vip: TOTAL para 2 noite(s): R$ 5.200,00 (A Vista - Depósito Bancário).",
  rooms: [
    { roomName: "LOFT", imageUrl: "https://cdn.example/loft.jpg" },
    { roomName: "Suíte Vip", imageUrl: "https://cdn.example/vip.jpg" },
  ],
});

describe("omnibees-photo-markdown", () => {
  it("coalesce capas de rooms e summaryText", () => {
    expect(collectOmnibeesRoomPhotosFromToolResults([OMNIBEES_TOOL])).toEqual([
      { roomName: "LOFT", imageUrl: "https://cdn.example/loft.jpg" },
      { roomName: "Suíte Vip", imageUrl: "https://cdn.example/vip.jpg" },
    ]);
  });

  it("injeta markdown antes de cada linha de orçamento sem foto", () => {
    const assistantText =
      "Período de 15 a 17 de maio.\n" +
      "LOFT: TOTAL para 2 noite(s): R$ 6.463,80 (à vista).\n" +
      "Suíte Vip: TOTAL para 2 noite(s): R$ 5.200,00 (à vista).";

    const result = injectOmnibeesQuotePhotosIfMissing(assistantText, [OMNIBEES_TOOL]);
    expect(result).not.toBeNull();
    expect(result!.fullText).toContain("![Foto - LOFT](https://cdn.example/loft.jpg)");
    expect(result!.fullText).toContain("![Foto - Suíte Vip](https://cdn.example/vip.jpg)");
    expect(result!.fullText.indexOf("![Foto - LOFT]")).toBeLessThan(result!.fullText.indexOf("LOFT: TOTAL"));
    expect(result!.fullText.indexOf("![Foto - Suíte Vip]")).toBeLessThan(result!.fullText.indexOf("Suíte Vip: TOTAL"));
  });

  it("não injeta quando o orçamento já traz as fotos", () => {
    const assistantText =
      "![Foto - LOFT](https://cdn.example/loft.jpg)\n" +
      "LOFT: TOTAL para 2 noite(s): R$ 6.463,80.\n" +
      "![Foto - Suíte Vip](https://cdn.example/vip.jpg)\n" +
      "Suíte Vip: TOTAL para 2 noite(s): R$ 5.200,00.";

    expect(injectOmnibeesQuotePhotosIfMissing(assistantText, [OMNIBEES_TOOL])).toBeNull();
  });
});
