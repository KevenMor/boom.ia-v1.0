import { describe, expect, it } from "vitest";
import {
  applyEmbedTheme,
  parseEmbedThemeFromMessage,
  readEmbedThemeFromLocation,
} from "./embed-theme";

describe("readEmbedThemeFromLocation", () => {
  it("lê theme da query string", () => {
    expect(
      readEmbedThemeFromLocation({
        search: "?theme=dark&key=x",
        hash: "",
        pathname: "/embed/chatwoot/inventory",
      } as Location),
    ).toBe("dark");
  });

  it("lê theme do hash", () => {
    expect(
      readEmbedThemeFromLocation({
        search: "",
        hash: "#key=x&account_id=9&theme=light",
        pathname: "/embed/chatwoot/inventory",
      } as Location),
    ).toBe("light");
  });

  it("padrão light quando ausente", () => {
    expect(
      readEmbedThemeFromLocation({
        search: "",
        hash: "#key=x",
        pathname: "/embed/chatwoot/inventory",
      } as Location),
    ).toBe("light");
  });
});

describe("parseEmbedThemeFromMessage", () => {
  it("aceita boom-ia-embed:theme", () => {
    expect(
      parseEmbedThemeFromMessage({
        type: "boom-ia-embed:theme",
        theme: "light",
        colors: { bg: "#ffffff" },
      }),
    ).toEqual({ theme: "light", colors: { bg: "#ffffff", surface: null, surface2: null, border: null, text: null, muted: null, brand: null } });
  });

  it("aceita theme no init", () => {
    expect(
      parseEmbedThemeFromMessage({
        type: "boom-ia-embed:init",
        theme: "dark",
      }),
    ).toEqual({ theme: "dark", colors: undefined });
  });
});

describe("applyEmbedTheme", () => {
  it("aplica classe dark no documentElement", () => {
    document.documentElement.className = "";
    applyEmbedTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    applyEmbedTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
