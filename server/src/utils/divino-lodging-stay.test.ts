import { describe, expect, it } from "vitest";
import { ensureDivinoCheckLodgingCall, extractDivinoLodgingStay } from "./divino-lodging-stay.js";

const thursday = new Date("2026-10-15T15:00:00-03:00");
const friday = new Date("2026-10-16T15:00:00-03:00");

describe("extractDivinoLodgingStay", () => {
  it("de amanhã para sábado na quinta vira sexta a sábado", () => {
    expect(
      extractDivinoLodgingStay(
        "Gostaria de saber valores e disponibilidade para aluguel do chalé de amanhã para sábado",
        thursday,
      ),
    ).toEqual({ check_in: "2026-10-16", check_out: "2026-10-17" });
  });

  it("se amanhã já é sábado, a saída é o dia seguinte", () => {
    expect(
      extractDivinoLodgingStay("disponibilidade de amanhã para sábado", friday),
    ).toEqual({ check_in: "2026-10-17", check_out: "2026-10-18" });
  });

  it("uma noite só com amanhã", () => {
    expect(extractDivinoLodgingStay("tem vaga amanhã?", thursday)).toEqual({
      check_in: "2026-10-16",
      check_out: "2026-10-17",
    });
  });

  it("31.01.02 no final do ano é 31/12 a 03/01", () => {
    expect(extractDivinoLodgingStay("Sim\nFinal do ano\n31.01.02", friday)).toEqual({
      check_in: "2026-12-31",
      check_out: "2027-01-03",
    });
  });

  it("preço sem data não chama calendário", () => {
    expect(extractDivinoLodgingStay("quanto custa a diária?", friday)).toBeNull();
    expect(extractDivinoLodgingStay("Um casal", friday)).toBeNull();
    expect(extractDivinoLodgingStay("Que pena", friday)).toBeNull();
  });
});

describe("ensureDivinoCheckLodgingCall", () => {
  it("injeta check_lodging quando o dispatcher não chamou nada", () => {
    const calls = ensureDivinoCheckLodgingCall({
      isDivino: true,
      calls: [],
      userText: "valores e disponibilidade de amanhã para sábado",
      calendarToolName: "consultar_evento",
      now: thursday,
    });
    expect(JSON.parse(calls[0].function.arguments)).toEqual({
      action: "check_lodging",
      check_in: "2026-10-16",
      check_out: "2026-10-17",
    });
  });

  it("não sobrescreve uma chamada que já tem datas", () => {
    const calls = ensureDivinoCheckLodgingCall({
      isDivino: true,
      calls: [
        {
          id: "a",
          function: {
            name: "consultar_evento",
            arguments: JSON.stringify({ action: "check_lodging", start_date: "2026-10-16", end_date: "2026-10-17" }),
          },
        },
      ],
      userText: "disponibilidade amanhã",
      calendarToolName: "consultar_evento",
      now: thursday,
    });
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0].function.arguments).start_date).toBe("2026-10-16");
  });

  it("sem data concreta, 'gostaria dessas datas' pede sugestão", () => {
    const calls = ensureDivinoCheckLodgingCall({
      isDivino: true,
      calls: [],
      userText: "Gostaria dessas datas",
      calendarToolName: "consultar_evento",
      now: friday,
    });
    expect(JSON.parse(calls[0].function.arguments).action).toBe("sugerir_datas");
  });

  it("completa chamada de calendário sem datas", () => {
    const calls = ensureDivinoCheckLodgingCall({
      isDivino: true,
      calls: [{ id: "a", function: { name: "consultar_evento", arguments: "{}" } }],
      userText: "tem vaga amanhã?",
      calendarToolName: "consultar_evento",
      now: thursday,
    });
    expect(JSON.parse(calls[0].function.arguments).check_in).toBe("2026-10-16");
  });
});
