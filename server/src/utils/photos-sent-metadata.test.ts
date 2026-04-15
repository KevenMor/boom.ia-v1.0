import { describe, it, expect } from "vitest";
import {
  buildPhotosSentMeta,
  buildFotosJaEnviadasSystemSuffix,
} from "./photos-sent-metadata.js";
import { sanitizeLLMOutput, filterCommandLinesFromStream } from "./sanitize.js";

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

describe("sanitizeLLMOutput — placeholders de mídia", () => {
  it("remove marcadores internos para não vazar ao cliente", () => {
    const out = sanitizeLLMOutput("Confirma a placa? [Mídia enviada pelo atendente]");
    expect(out).not.toMatch(/Mídia enviada/);
    expect(out.toLowerCase()).toContain("placa");
  });
});

describe("sanitizeLLMOutput — vazamento de comandos internos", () => {
  it("remove marcar_lead colado após pontuação", () => {
    const out = sanitizeLLMOutput("Oi! Sou a Bia. Como posso te chamar?marcar_lead");
    expect(out).not.toMatch(/marcar_lead/i);
    expect(out).toMatch(/chamar\?/);
  });

  it("remove linha só com ENVIAR_FOTOS_VEICULO e id", () => {
    const raw = "ENVIAR_FOTOS_VEICULO: CHERY TIGGO | id: 5784c76d-c494-4318-9f43-05be937f3d40";
    expect(sanitizeLLMOutput(raw).trim()).toBe("");
  });

  it("no stream, linha de comando não segue texto legítimo", () => {
    const { toSend } = filterCommandLinesFromStream(
      "",
      "Olá!\nENVIAR_FOTOS_VEICULO: x | id: 5784c76d-c494-4318-9f43-05be937f3d40\n"
    );
    expect(toSend).not.toMatch(/ENVIAR_FOTOS/i);
    expect(toSend).toMatch(/Olá/);
  });
});
