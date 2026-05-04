import { describe, it, expect } from "vitest";
import { appendMediaIdsFromSseEvent } from "./merge-sse-media-ids.js";

describe("appendMediaIdsFromSseEvent", () => {
  it("acumula fotos e vídeos do primeiro evento", () => {
    const p: string[] = [];
    const v: string[] = [];
    appendMediaIdsFromSseEvent(p, v, {
      photo_inventory_ids: ["a1", "a2"],
      video_inventory_ids: ["v1"],
    });
    expect(p).toEqual(["a1", "a2"]);
    expect(v).toEqual(["v1"]);
  });

  it("funde segundo evento sem substituir o primeiro", () => {
    const p: string[] = [];
    const v: string[] = [];
    appendMediaIdsFromSseEvent(p, v, { photo_inventory_ids: ["car-1"], video_inventory_ids: [] });
    appendMediaIdsFromSseEvent(p, v, { photo_inventory_ids: ["car-2"], video_inventory_ids: [] });
    expect(p).toEqual(["car-1", "car-2"]);
  });

  it("não duplica o mesmo id", () => {
    const p: string[] = [];
    const v: string[] = [];
    appendMediaIdsFromSseEvent(p, v, { photo_inventory_ids: ["x"], video_inventory_ids: [] });
    appendMediaIdsFromSseEvent(p, v, { photo_inventory_ids: ["x"], video_inventory_ids: [] });
    expect(p).toEqual(["x"]);
  });

  it("ignora entradas não-string e strings vazias", () => {
    const p: string[] = [];
    const v: string[] = [];
    appendMediaIdsFromSseEvent(p, v, {
      photo_inventory_ids: ["ok", "", null, 42, "  ok2  "] as unknown as string[],
      video_inventory_ids: undefined,
    });
    expect(p).toEqual(["ok", "ok2"]);
  });
});
