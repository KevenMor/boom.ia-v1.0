import { describe, expect, it } from "vitest";
import {
  buildInventoryPhotosMarkdown,
  filterValidInventoryPhotoUrls,
  isDeliverableImageContentType,
  isLikelyDirectVehicleImageUrl,
} from "./inventory-photo-url.js";

describe("isLikelyDirectVehicleImageUrl", () => {
  it("aceita URL direta de imagem", () => {
    expect(isLikelyDirectVehicleImageUrl("https://referency.com.br/galeria/veiculos-1029-001.jpeg")).toBe(true);
  });

  it("rejeita diretório /galeria/ (index HTML)", () => {
    expect(isLikelyDirectVehicleImageUrl("https://referency.com.br/galeria/")).toBe(false);
    expect(isLikelyDirectVehicleImageUrl("https://referency.com.br/galeria")).toBe(false);
  });

  it("rejeita URL sem extensão de imagem", () => {
    expect(isLikelyDirectVehicleImageUrl("https://example.com/foto-do-carro")).toBe(false);
  });
});

describe("filterValidInventoryPhotoUrls", () => {
  it("remove URLs inválidas e deduplica", () => {
    const out = filterValidInventoryPhotoUrls([
      "https://referency.com.br/galeria/",
      "https://referency.com.br/galeria/veiculos-1029-001.jpeg",
      "https://referency.com.br/galeria/veiculos-1029-001.jpeg",
    ]);
    expect(out).toEqual(["https://referency.com.br/galeria/veiculos-1029-001.jpeg"]);
  });
});

describe("buildInventoryPhotosMarkdown", () => {
  it("retorna vazio quando só há diretório inválido", () => {
    expect(buildInventoryPhotosMarkdown(["https://referency.com.br/galeria/"])).toBe("");
  });
});

describe("isDeliverableImageContentType", () => {
  it("rejeita text/html", () => {
    expect(isDeliverableImageContentType("text/html")).toBe(false);
  });

  it("aceita image/jpeg", () => {
    expect(isDeliverableImageContentType("image/jpeg")).toBe(true);
  });
});
