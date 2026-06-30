import { describe, expect, it } from "vitest";
import { enumerateIsoDateRange } from "../services/park-day-consulta.js";
import {
  extractParkVisitDateRange,
  extractSunsetParkParams,
  userAsksSunsetParkConsultation,
} from "./sunset-park-params.js";
import { formatParkDayConsultaForLlm } from "./park-day-consulta-summary.js";

describe("enumerateIsoDateRange", () => {
  it("lista dias inclusive", () => {
    expect(enumerateIsoDateRange("2026-07-01", "2026-07-03")).toEqual([
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
    ]);
  });
});

describe("extractParkVisitDateRange", () => {
  const ref = new Date("2026-06-30T15:00:00Z");

  it("extrai 01 a 03 de julho do histórico", () => {
    const range = extractParkVisitDateRange(
      [
        { role: "assistant", content: "Período de 01 a 03 de julho para duas pessoas." },
        { role: "user", content: "01 a 03 esta aberto o parque?" },
      ],
      ref
    );
    expect(range).toEqual({ date: "2026-07-01", date_to: "2026-07-03" });
  });
});

describe("extractSunsetParkParams", () => {
  const ref = new Date("2026-06-30T15:00:00Z");

  it("retorna intervalo para pergunta de abertura no período", () => {
    expect(
      userAsksSunsetParkConsultation([{ role: "user", content: "01 a 03 esta aberto o parque?" }])
    ).toBe(true);
    const params = extractSunsetParkParams(
      [
        { role: "assistant", content: "Datas 01 a 03 de julho." },
        { role: "user", content: "01 a 03 esta aberto o parque?" },
      ],
      ref
    );
    expect(params).toEqual({ date: "2026-07-01", date_to: "2026-07-03" });
  });
});

describe("formatParkDayConsultaForLlm range", () => {
  it("proíbe inventar abertura fora de days[]", () => {
    const text = formatParkDayConsultaForLlm({
      status: "success",
      mode: "range",
      date_from: "2026-07-01",
      date_to: "2026-07-03",
      all_park_open: false,
      closed_dates: ["2026-07-01"],
      open_dates: ["2026-07-02", "2026-07-03"],
      days: [
        { date: "2026-07-01", day_kind: "fechado", park_open: false },
        { date: "2026-07-02", day_kind: "aberto", park_open: true },
        { date: "2026-07-03", day_kind: "aberto", park_open: true },
      ],
      message: "ok",
    });
    expect(text).toMatch(/2026-07-01.*fechado/i);
    expect(text).toMatch(/2026-07-02.*aberto: sim/);
    expect(text).toMatch(/PROIBIDO afirmar abertura/);
  });
});
