import { describe, expect, it } from "vitest";
import { inferImageContentTypeForUpload, isImageFileByMimeOrExtension } from "./image-file-guards";

function mockFile(name: string, type: string): File {
  return new File([""], name, { type });
}

describe("isImageFileByMimeOrExtension", () => {
  it("aceita JPEG com MIME vazio (comum no Windows)", () => {
    expect(isImageFileByMimeOrExtension(mockFile("foto.jpg", ""))).toBe(true);
    expect(isImageFileByMimeOrExtension(mockFile("foto.jpeg", ""))).toBe(true);
  });

  it("aceita image/jpeg normalmente", () => {
    expect(isImageFileByMimeOrExtension(mockFile("x.bin", "image/jpeg"))).toBe(true);
  });

  it("rejeita sem MIME nem extensão de imagem", () => {
    expect(isImageFileByMimeOrExtension(mockFile("doc.pdf", ""))).toBe(false);
    expect(isImageFileByMimeOrExtension(mockFile("x", "application/pdf"))).toBe(false);
  });
});

describe("inferImageContentTypeForUpload", () => {
  it("infere image/jpeg a partir da extensão quando type vazio", () => {
    expect(inferImageContentTypeForUpload(mockFile("a.jpg", ""))).toBe("image/jpeg");
    expect(inferImageContentTypeForUpload(mockFile("a.jpeg", ""))).toBe("image/jpeg");
  });

  it("preserva MIME quando já vem preenchido", () => {
    expect(inferImageContentTypeForUpload(mockFile("a", "image/png"))).toBe("image/png");
  });
});
