import { afterEach, describe, expect, it, vi } from "vitest";
import { executeTool } from "./tool-executor.js";

describe("executeTool api_rest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("POSTs JSON args to endpoint and returns parsed body", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          ok: true,
          rooms: [{ name: "Standard", from_price: 400 }],
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await executeTool(
      {
        id: "t1",
        name: "hotel_consultar_disponibilidade",
        tool_type: "api_rest",
        endpoint: "https://crm.example/hotel/ai/v1/demo/availability",
        execution_config: { method: "POST" },
      },
      { check_in: "2026-10-10", check_out: "2026-10-12", adults: 2 },
      "agent-1"
    );

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("https://crm.example/hotel/ai/v1/demo/availability");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({
      check_in: "2026-10-10",
      check_out: "2026-10-12",
      adults: 2,
    });
    expect((result.result as { data: { ok: boolean } }).data.ok).toBe(true);
  });

  it("fails clearly when endpoint missing", async () => {
    const result = await executeTool(
      {
        id: "t2",
        name: "broken",
        tool_type: "api_rest",
        endpoint: "",
        execution_config: {},
      },
      {},
      "agent-1"
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/endpoint|url_template/i);
  });
});
