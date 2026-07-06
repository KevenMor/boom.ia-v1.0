import { describe, expect, it } from "vitest";
import { formatParkDayConsultaForLlm } from "./park-day-consulta-summary.js";

describe("formatParkDayConsultaForLlm", () => {
  it("formata ingressos cadastrados", () => {
    const text = formatParkDayConsultaForLlm({
      status: "success",
      date: "2026-06-12",
      day_kind: "aberto",
      park_open: true,
      ticket_lines: [{ label: "Adulto", value: "R$ 89,90" }],
    });
    expect(text).toMatch(/CONSULTA PARQUE/);
    expect(text).toMatch(/Adulto: R\$ 89,90/);
    expect(text).toMatch(/Thermas Card.*5 pessoas|5 pessoas.*Thermas Card/i);
    expect(text).toMatch(/PROIBIDO substituir por link genérico/);
  });

  it("formata parque fechado com próxima data aberta", () => {
    const text = formatParkDayConsultaForLlm({
      status: "success",
      date: "2026-06-12",
      day_kind: "fechado",
      park_open: false,
      ticket_lines: [],
      next_open_date: "2026-06-14",
    });
    expect(text).toMatch(/Parque aberto para visita: não/);
    expect(text).toMatch(/PROIBIDO citar valores de ingresso/);
    expect(text).toMatch(/PRÓXIMA DATA COM PARQUE ABERTO.*2026-06-14/);
  });
});
