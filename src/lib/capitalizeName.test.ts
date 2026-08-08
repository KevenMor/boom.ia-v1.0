import { describe, it, expect } from "vitest";
import { capitalizeName, capitalizeAsYouType } from "./capitalizeName";

describe("capitalizeName", () => {
  it("capitaliza as primeiras letras de cada palavra", () => {
    expect(capitalizeName("keven moreira")).toBe("Keven Moreira");
    expect(capitalizeName("josé silva")).toBe("José Silva");
  });

  it("remove espaços extras nas pontas e internos", () => {
    expect(capitalizeName("   keven   moreira   ")).toBe("Keven Moreira");
  });

  it("trata valores vazios ou inválidos", () => {
    expect(capitalizeName("")).toBe("");
  });
});

describe("capitalizeAsYouType", () => {
  it("capitaliza as palavras em tempo real sem remover os espaços da digitação", () => {
    expect(capitalizeAsYouType("k")).toBe("K");
    expect(capitalizeAsYouType("ke")).toBe("Ke");
    expect(capitalizeAsYouType("keven")).toBe("Keven");
    expect(capitalizeAsYouType("keven ")).toBe("Keven ");
    expect(capitalizeAsYouType("keven m")).toBe("Keven M");
    expect(capitalizeAsYouType("keven mo")).toBe("Keven Mo");
    expect(capitalizeAsYouType("keven moreira")).toBe("Keven Moreira");
  });

  it("lida com múltiplas palavras e caixa alta", () => {
    expect(capitalizeAsYouType("KEVEN")).toBe("Keven");
    expect(capitalizeAsYouType("KEVEN MOREIRA")).toBe("Keven Moreira");
  });
});
