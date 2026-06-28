import { describe, expect, it } from "vitest";
import { parseEmbedCredentialsFromLocation, parseEmbedInitMessage } from "./embed-credentials";

describe("embed-credentials", () => {
  it("lê key e account_id do hash", () => {
    const loc = {
      search: "",
      hash: "#key=abc&account_id=9",
    } as Location;
    expect(parseEmbedCredentialsFromLocation(loc)).toEqual({ key: "abc", accountId: "9" });
  });

  it("prioriza query string sobre hash", () => {
    const loc = {
      search: "?key=query&account_id=1",
      hash: "#key=hash&account_id=2",
    } as Location;
    expect(parseEmbedCredentialsFromLocation(loc)).toEqual({ key: "query", accountId: "1" });
  });

  it("parseia postMessage init", () => {
    expect(
      parseEmbedInitMessage({ type: "boom-ia-embed:init", key: "k", account_id: "9" }),
    ).toEqual({ key: "k", accountId: "9" });
  });
});
