import { describe, expect, it, beforeEach } from "vitest";
import {
  EMBED_CREDS_STORAGE_KEY,
  parseEmbedCredentialsFromLocation,
  parseEmbedInitMessage,
  persistEmbedCredentials,
} from "./embed-credentials";

describe("embed-credentials", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("lê key e account_id do hash", () => {
    const loc = {
      search: "",
      hash: "#key=abc&account_id=9",
    } as Location;
    expect(parseEmbedCredentialsFromLocation(loc)).toEqual({ key: "abc", accountId: "9" });
  });

  it("lê credenciais do sessionStorage após bootstrap", () => {
    sessionStorage.setItem(EMBED_CREDS_STORAGE_KEY, JSON.stringify({ key: "stored", accountId: "9" }));
    const loc = { search: "", hash: "" } as Location;
    expect(parseEmbedCredentialsFromLocation(loc)).toEqual({ key: "stored", accountId: "9" });
  });

  it("persiste credenciais parciais", () => {
    persistEmbedCredentials({ key: "k1" });
    persistEmbedCredentials({ accountId: "9" });
    const loc = { search: "", hash: "" } as Location;
    expect(parseEmbedCredentialsFromLocation(loc)).toEqual({ key: "k1", accountId: "9" });
  });

  it("parseia postMessage init", () => {
    expect(
      parseEmbedInitMessage({ type: "boom-ia-embed:init", key: "k", account_id: "9" }),
    ).toEqual({ key: "k", accountId: "9" });
  });
});
