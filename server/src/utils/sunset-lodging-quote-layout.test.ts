import { describe, expect, it } from "vitest";
import {
  expandDenseListLine,
  extractLodgingQuoteClosingQuestion,
  polishSunsetLodgingQuoteReadableText,
} from "./sunset-lodging-quote-layout.js";

describe("sunset-lodging-quote-layout", () => {
  it("expandDenseListLine quebra linha com · em bullets", () => {
    expect(expandDenseListLine("2 pessoas · 2 pernoites + 3 dias de parque · promoção 25% OFF")).toEqual([
      "• 2 pessoas",
      "• 2 pernoites + 3 dias de parque",
      "• promoção 25% OFF",
    ]);
  });

  it("expandDenseListLine quebra linha com ; em bullets", () => {
    expect(expandDenseListLine("Jantar e café; Acesso ao parque; Atrações à parte")).toEqual([
      "• Jantar e café",
      "• Acesso ao parque",
      "• Atrações à parte",
    ]);
  });

  it("polishSunsetLodgingQuoteReadableText formata rodapé legível", () => {
    const raw = `Valores sujeitos à data solicitada.

*Incluso no pacote*
Jantar e café; Acesso gratuito ao parque; Atrações pagas à parte

*Horários*
Check-in: 10h; Check-out: 13h; Parque até 18h

*Pagamento*
Pix 40%; Cartão 5x

Das opções, qual combina mais com vocês?`;

    const out = polishSunsetLodgingQuoteReadableText(raw);
    expect(out).toContain("*Incluso no pacote*");
    expect(out).toContain("• Jantar e café");
    expect(out).toContain("• Acesso gratuito ao parque");
    expect(out).toContain("• Check-in: 10h");
    expect(out).toContain("• Pix 40%");
    expect(out).toMatch(/\n\n\*Horários\*/);
  });

  it("extractLodgingQuoteClosingQuestion separa pergunta final", () => {
    const { body, question } = extractLodgingQuoteClosingQuestion(
      "*Pagamento*\n• Pix\n\nDas opções, qual combina mais com vocês?"
    );
    expect(question).toBe("Das opções, qual combina mais com vocês?");
    expect(body).not.toContain("Das opções");
  });
});
