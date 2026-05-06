import { describe, it, expect } from "vitest";
import {
  galleryRotuloParaCliente,
  isGalleryExcludedFromClientCatalog,
} from "./suite-gallery-llm-labels.js";

describe("suite-gallery-llm-labels", () => {
  it("exclui galeria de imagem inicial / conversa", () => {
    expect(isGalleryExcludedFromClientCatalog("Imagem inicial conversa")).toBe(true);
    expect(isGalleryExcludedFromClientCatalog("imagem inicial")).toBe(true);
    expect(galleryRotuloParaCliente("Imagem inicial conversa", null)).toBeNull();
  });

  it("mantém galerias de acomodação com nome do painel quando não há descrição", () => {
    expect(isGalleryExcludedFromClientCatalog("LOFT")).toBe(false);
    expect(galleryRotuloParaCliente("LOFT", null)).toBe("LOFT");
  });

  it("prioriza primeira linha da descrição como rótulo", () => {
    expect(galleryRotuloParaCliente("Cat1", "Suíte família — andar térreo\nMais texto")).toBe(
      "Suíte família — andar térreo"
    );
  });

  it("rotula institucional de forma única", () => {
    expect(galleryRotuloParaCliente("Institucional", null)).toBe("Apresentação do resort (fotos e vídeo)");
  });
});
