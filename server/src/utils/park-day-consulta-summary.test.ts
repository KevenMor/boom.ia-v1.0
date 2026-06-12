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
    expect(text).toMatch(/PROIBIDO substituir por link genérico/);
  });

  it("formata parque fechado", () => {
    const text = formatParkDayConsultaForLlm({
      status: "success",
      date: "2026-06-12",
      day_kind: "fechado",
      park_open: false,
      ticket_lines: [],
    });
    expect(text).toMatch(/Parque aberto para visita: não/);
    expect(text).toMatch(/PROIBIDO citar valores de ingresso/);
  });
});
