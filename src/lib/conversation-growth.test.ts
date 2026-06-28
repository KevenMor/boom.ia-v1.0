import { describe, expect, it } from "vitest";
import { buildConversationGrowthChart, buildConversationGrowthSeries } from "./conversation-growth";

const NOW = new Date("2026-01-15T15:00:00.000Z");

describe("buildConversationGrowthChart", () => {
  it("conta conversas novas por mês com base na primeira atividade", () => {
    const rows = [
      { conversation_id: "a", created_at: "2026-01-10T12:00:00.000Z" },
      { conversation_id: "a", created_at: "2026-01-11T12:00:00.000Z" },
      { conversation_id: "b", created_at: "2025-12-20T12:00:00.000Z" },
      { conversation_id: null, created_at: "2026-01-09T12:00:00.000Z" },
    ];

    const chart = buildConversationGrowthChart(rows, "month", 7, NOW);
    const jan = chart.find((point) => point.periodKey === "2026-01");
    const dez = chart.find((point) => point.periodKey === "2025-12");

    expect(jan?.conversas).toBe(1);
    expect(dez?.conversas).toBe(1);
    expect(chart).toHaveLength(7);
  });

  it("agrupa por ano no modo anual", () => {
    const rows = [
      { conversation_id: "a", created_at: "2026-01-10T12:00:00.000Z" },
      { conversation_id: "b", created_at: "2025-06-10T12:00:00.000Z" },
      { conversation_id: "c", created_at: "2024-03-10T12:00:00.000Z" },
    ];

    const chart = buildConversationGrowthChart(rows, "year", 4, NOW);

    expect(chart.find((point) => point.periodKey === "2026")?.conversas).toBe(1);
    expect(chart.find((point) => point.periodKey === "2025")?.conversas).toBe(1);
    expect(chart.find((point) => point.periodKey === "2024")?.conversas).toBe(1);
  });
});

describe("buildConversationGrowthSeries", () => {
  it("retorna séries mensal e anual", () => {
    const series = buildConversationGrowthSeries([], NOW);
    expect(series.monthly).toHaveLength(7);
    expect(series.annual).toHaveLength(4);
  });
});
