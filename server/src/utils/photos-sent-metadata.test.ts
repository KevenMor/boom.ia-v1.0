import { describe, it, expect } from "vitest";
import {
  buildPhotosSentMeta,
  buildFotosJaEnviadasSystemSuffix,
} from "./photos-sent-metadata.js";

describe("buildPhotosSentMeta", () => {
  it("monta nome a partir de brand/model/version na ordem dos ids", () => {
    const ids = ["b", "a"];
    const rows = [
      { id: "a", brand: "Chevrolet", model: "Cruze", version: "LTZ" },
      { id: "b", brand: "Ford", model: "Fusion", version: null },
    ];
    const meta = buildPhotosSentMeta(ids, rows);
    expect(meta).toEqual([
      { id: "b", name: "Ford Fusion" },
      { id: "a", name: "Chevrolet Cruze LTZ" },
    ]);
  });

  it("deduplica ids repetidos e usa fallback quando linha não existe", () => {
    const meta = buildPhotosSentMeta(
      ["x", "x", "y"],
      [{ id: "x", brand: "VW", model: "Gol", version: null }]
    );
    expect(meta).toEqual([
      { id: "x", name: "VW Gol" },
      { id: "y", name: "Veículo" },
    ]);
  });
});

describe("buildFotosJaEnviadasSystemSuffix", () => {
  it("retorna vazio sem mensagens ou sem photos_sent", () => {
    expect(buildFotosJaEnviadasSystemSuffix(null)).toBe("");
    expect(buildFotosJaEnviadasSystemSuffix([])).toBe("");
    expect(buildFotosJaEnviadasSystemSuffix([{ role: "user", metadata: {} }])).toBe("");
  });

  it("agrega por id de estoque a partir de mensagens assistant e inclui instrução de reenvio só com pedido explícito", () => {
    const suffix = buildFotosJaEnviadasSystemSuffix([
      { role: "assistant", metadata: { photos_sent: [{ id: "u1", name: "Cruze Branco" }] } },
      { role: "assistant", metadata: { photos_sent: [{ id: "u1", name: "Cruze Branco" }] } },
      { role: "assistant", metadata: { photos_sent: [{ id: "u2", name: "Fusion" }] } },
    ]);
    expect(suffix).toContain("FOTOS JÁ ENVIADAS NESTA CONVERSA:");
    expect(suffix).toContain("Cruze Branco (id: u1)");
    expect(suffix).toContain("Fusion (id: u2)");
    expect(suffix).toMatch(/pedido explícito/i);
    expect(suffix).toContain("ENVIAR_FOTOS_VEICULO");
  });
});

