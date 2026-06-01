import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, decodeInventoryRecord } from "./html-entities.js";

describe("decodeHtmlEntities", () => {
  it("decodifica entidade numérica decimal", () => {
    expect(decodeHtmlEntities("Autom&#225;tico")).toBe("Automático");
  });

  it("decodifica múltiplas entidades na mesma string", () => {
    expect(decodeHtmlEntities("LOTA&#199;&#195;O")).toBe("LOTAÇÃO");
  });

  it("decodifica entidade hex", () => {
    expect(decodeHtmlEntities("Autom&#xE1;tico")).toBe("Automático");
  });

  it("decodifica &amp; encadeado", () => {
    expect(decodeHtmlEntities("Autom&amp;#225;tico")).toBe("Automático");
  });

  it("mantém texto sem entidades", () => {
    expect(decodeHtmlEntities("Manual")).toBe("Manual");
  });
});

describe("decodeInventoryRecord", () => {
  it("decodifica transmission e version no registro", () => {
    const row = decodeInventoryRecord({
      brand: "Honda",
      model: "Fit",
      version: "EXL 1.5 AUTOM&#193;TICO",
      transmission: "Autom&#225;tico",
      color: "Branco",
    });
    expect(row.version).toBe("EXL 1.5 AUTOMÁTICO");
    expect(row.transmission).toBe("Automático");
  });
});
