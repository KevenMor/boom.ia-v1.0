import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  formatExtractedForMessage,
  isImageOrPdfAttachment,
  extractDocument,
  type ExtractedDocumentData,
} from "./extractDocument.js";

describe("formatExtractedForMessage", () => {
  it("formata dados completos", () => {
    const data: ExtractedDocumentData = {
      nome_completo: "Gabriella Lustosa",
      cpf: "123.456.789-00",
      rg_numero: "12.345.678-9",
      rg_orgao_emissor: "SSP/SP",
      endereco_completo: "Rua Exemplo, 200, apto 156, Sorocaba - SP",
    };
    const result = formatExtractedForMessage(data);
    expect(result).toContain("nome_completo: Gabriella Lustosa");
    expect(result).toContain("cpf: 123.456.789-00");
    expect(result).toContain("rg_numero: 12.345.678-9");
    expect(result).toContain("[Dados extraídos do documento]");
  });

  it("retorna vazio quando não há dados", () => {
    expect(formatExtractedForMessage({})).toBe("");
    expect(formatExtractedForMessage({ nome_completo: null, cpf: null })).toBe("");
  });

  it("inclui apenas campos preenchidos", () => {
    const result = formatExtractedForMessage({
      nome_completo: "João Silva",
      cpf: "111.222.333-44",
    });
    expect(result).toContain("nome_completo: João Silva");
    expect(result).toContain("cpf: 111.222.333-44");
    expect(result).not.toContain("rg_numero");
  });
});

describe("isImageOrPdfAttachment", () => {
  it("identifica imagem por file_type", () => {
    expect(isImageOrPdfAttachment({ file_type: "image", data_url: "data:image/jpeg;base64,abc" })).toBe(true);
    expect(isImageOrPdfAttachment({ file_type: "jpg", data_url: "x" })).toBe(true);
    expect(isImageOrPdfAttachment({ file_type: "png", data_url: "x" })).toBe(true);
  });

  it("identifica PDF por file_type", () => {
    expect(isImageOrPdfAttachment({ file_type: "pdf", data_url: "data:application/pdf;base64,xyz" })).toBe(true);
    expect(isImageOrPdfAttachment({ file_type: "file", data_url: "x" })).toBe(true);
  });

  it("identifica por data_url quando file_type é genérico", () => {
    expect(isImageOrPdfAttachment({ file_type: "file", data_url: "data:image/jpeg;base64,abc" })).toBe(true);
    expect(isImageOrPdfAttachment({ file_type: "file", data_url: "data:application/pdf;base64,xyz" })).toBe(true);
  });

  it("rejeita áudio", () => {
    expect(isImageOrPdfAttachment({ file_type: "audio", data_url: "data:audio/webm;base64,abc" })).toBe(false);
  });

  it("rejeita sem data_url", () => {
    expect(isImageOrPdfAttachment({ file_type: "image" })).toBe(false);
  });
});

describe("extractDocument", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("retorna erro quando GEMINI_API_KEY não está configurada", async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const result = await extractDocument("data:image/jpeg;base64,/9j/4AAQ");
    expect(result.error).toContain("GEMINI_API_KEY");
    expect(result.data).toEqual({});
  });
});
