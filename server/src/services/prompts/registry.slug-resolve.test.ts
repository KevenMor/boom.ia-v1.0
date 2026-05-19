import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  getDispatcherPrompt,
  getPromptConfig,
  normalizeTenantSlugForLookup,
} from "./registry.js";

describe("registry — slug aliases (hífen / underscore)", () => {
  it("normaliza equivalentes", () => {
    expect(normalizeTenantSlugForLookup("auto-escola-ideal")).toBe("autoescolaideal");
    expect(normalizeTenantSlugForLookup("autoescola-ideal")).toBe("autoescolaideal");
    expect(normalizeTenantSlugForLookup("AUTO_ESCOLA_IDEAL")).toBe("autoescolaideal");
  });

  it("resolve Auto Escola Ideal com slug do banco (variantes com hífen)", () => {
    const prompt = buildSystemPrompt("PROMPT_DO_BANCO_QUE_NAO_DEVE_APARECER", "auto-escola-ideal", false);
    expect(prompt).toContain("v8.11");
    expect(prompt).not.toContain("PROMPT_DO_BANCO_QUE_NAO_DEVE_APARECER");
    expect(prompt).toMatch(/R\$ 90,00/);
  });

  it("getPromptConfig resolve alias", () => {
    const cfg = getPromptConfig("auto-escola-ideal");
    expect(cfg).not.toBeNull();
    expect(cfg!.version).toBe("v8.8");
    expect(cfg!.slug).toBe("auto-escola-ideal");
  });

  it("getDispatcherPrompt usa o mesmo resolve", () => {
    const d = getDispatcherPrompt("auto-escola-ideal");
    expect(d.length).toBeGreaterThan(100);
    expect(d.toLowerCase()).toMatch(/tool|dispatcher|ideal/i);
  });

  it("slug canônico ideal ignora prompt do banco", () => {
    const prompt = buildSystemPrompt("TEXTO_SOMENTE_BANCO_NAO_USAR", "ideal", false);
    expect(prompt).not.toContain("TEXTO_SOMENTE_BANCO_NAO_USAR");
    expect(prompt).toContain("v8.11");
  });

  it("tenant fora do registry usa system prompt do banco", () => {
    const db = "Sou um agente customizado só no Supabase.";
    const prompt = buildSystemPrompt(db, "tenant-sem-registry-xyz-12345", false);
    expect(prompt).toContain(db);
  });
});
