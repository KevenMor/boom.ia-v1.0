import { describe, it, expect } from "vitest";
import { sanitizeLLMOutput, filterCommandLinesFromStream, stripToolNameLeakage } from "./sanitize.js";

describe("sanitizeLLMOutput — regressão vazamento para cliente", () => {
  it("remove placeholder [Mídia enviada…] do histórico", () => {
    const out = sanitizeLLMOutput("Confirma a placa? [Mídia enviada pelo atendente]");
    expect(out).not.toMatch(/Mídia enviada/);
    expect(out.toLowerCase()).toContain("placa");
  });

  it("remove marcar_lead colado após pontuação (Autoescola Ideal)", () => {
    const out = sanitizeLLMOutput("Oi! Sou a Bia. Como posso te chamar?marcar_lead");
    expect(out).not.toMatch(/marcar_lead/i);
    expect(out).toMatch(/chamar\?/);
  });

  it("remove marcar_lead em várias formas", () => {
    expect(sanitizeLLMOutput("Texto marcar_lead")).not.toMatch(/marcar_lead/);
    expect(sanitizeLLMOutput("marcar_lead()")).not.toMatch(/marcar_lead/);
    expect(sanitizeLLMOutput("MARCAR LEAD: foo")).not.toMatch(/MARCAR\s+LEAD/i);
  });

  it("remove placeholder de nome [Nome] copiado do prompt (PPL Motors)", () => {
    const raw = "Muito prazer, **[Nome]**! A Audi A5 Performance é espetacular.";
    const out = sanitizeLLMOutput(raw);
    expect(out).not.toMatch(/\[Nome\]/i);
    expect(out).not.toMatch(/\*\*/);
    expect(out.toLowerCase()).toContain("audi");
    expect(out).toMatch(/Muito prazer!/i);
  });

  it("remove bloco [INSTRUÇÃO]…[/INSTRUÇÃO] (follow-up / lead)", () => {
    const raw =
      "[INSTRUÇÃO]\nVocê deve marcar todos os leads chamando a função.\n[/INSTRUÇÃO]\n\nOlá! Passando para lembrar do orçamento.";
    const out = sanitizeLLMOutput(raw);
    expect(out).not.toMatch(/INSTRU/i);
    expect(out).not.toMatch(/marcar.*lead/i);
    expect(out.toLowerCase()).toContain("orçamento");
  });

  it("remove NO_TOOLS_NEEDED", () => {
    const out = sanitizeLLMOutput("Oi!\n\nNO_TOOLS_NEEDED\n\nTudo bem?");
    expect(out).not.toMatch(/NO_TOOLS_NEEDED/);
    expect(out.toLowerCase()).toContain("tudo bem");
  });

  it("remove linhas ENVIAR_FOTOS / ENVIAR_VIDEO / HANDOFF em bloco misto", () => {
    const raw = [
      "ENVIAR_FOTOS_VEICULO: Honda | id: 672dbfea-662d-4781-8abc-c99fb4ec546f",
      "Opa, segue o Honda!",
      "",
      "ENVIAR_VIDEO_DETALHES: Tour | id: aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      "HANDOFF_COMERCIAL",
      "Mais alguma dúvida?",
    ].join("\n");
    const out = sanitizeLLMOutput(raw);
    expect(out).not.toMatch(/ENVIAR_FOTOS/i);
    expect(out).not.toMatch(/ENVIAR_VIDEO/i);
    expect(out).not.toMatch(/HANDOFF_COMERCIAL/i);
    expect(out).toMatch(/Honda/);
    expect(out).toMatch(/dúvida/i);
  });

  it("remove linha inteira que contém só comando de foto (produção PPL)", () => {
    const line =
      "ENVIAR_FOTOS_VEICULO: CHERY TIGGO 2 1.5 MPFI | id: 5784c76d-c494-4318-9f43-05be937f3d40";
    expect(sanitizeLLMOutput(line).trim()).toBe("");
  });

  it("stripToolNameLeakage remove token colado após ?", () => {
    expect(stripToolNameLeakage("Como posso te chamar?marcar_lead")).toBe("Como posso te chamar?");
  });
});

describe("filterCommandLinesFromStream — regressão", () => {
  it("linha só com ENVIAR não vai para toSend", () => {
    const { toSend, newBuffer } = filterCommandLinesFromStream("", "X\nENVIAR_FOTOS_VEICULO: a | id: 5784c76d-c494-4318-9f43-05be937f3d40\n");
    expect(toSend).toMatch(/^X\n$/);
    expect(toSend).not.toMatch(/ENVIAR/);
    expect(newBuffer).toBe("");
  });

  it("mantém parágrafo vazio entre linhas (só whitespace vira newline)", () => {
    const { toSend } = filterCommandLinesFromStream("", "A\n\nB\n");
    expect(toSend).toContain("A");
    expect(toSend).toContain("B");
  });

  it("remove marcar_lead da linha conversacional no stream", () => {
    const { toSend } = filterCommandLinesFromStream("", "Oi! Tudo bem?\nmarcar_lead\n");
    expect(toSend).not.toMatch(/marcar_lead/);
    expect(toSend).toMatch(/Tudo bem/);
  });

  it("buffer final sem \\n: próximo chunk completa; comando em linha isolada é removida", () => {
    let buf = "";
    let acc = "";
    const push = (chunk: string) => {
      const r = filterCommandLinesFromStream(buf, chunk);
      acc += r.toSend;
      buf = r.newBuffer;
    };
    push("Linha ok\n");
    push("ENVIAR_FOTOS_VEICULO: z | id: 5784c76d-c494-4318-9f43-05be937f3d40");
    expect(acc).toMatch(/Linha ok/);
    expect(acc).not.toMatch(/ENVIAR/);
    push("\n");
    expect(acc).not.toMatch(/ENVIAR/);
  });
});
