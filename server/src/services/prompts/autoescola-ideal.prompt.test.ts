import { describe, expect, it } from "vitest";
import { FOLLOWUP_PROMPT, SYSTEM_PROMPT } from "./autoescola-ideal.js";

describe("Autoescola Ideal — SYSTEM_PROMPT (contratos de negócio)", () => {
  it("define exame prático de moto na Alameda do Horto, 144, e não na pista", () => {
    expect(SYSTEM_PROMPT).toMatch(/Alameda do Horto,\s*144/i);
    expect(SYSTEM_PROMPT).toMatch(/exame pr[aá]tico de moto|exame de moto/i);
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o[^.\n]{0,80}na pista|n[aã]o [eé] na pista/i);
  });

  it("mantém pista Elias Abud Dib apenas para treino / aulas de moto", () => {
    expect(SYSTEM_PROMPT).toMatch(/Elias Abud Dib,\s*131/i);
    expect(SYSTEM_PROMPT).toMatch(/treino|aulas? pr[aá]ticas? de moto|pista de \*\*treino\*\*/i);
  });

  it("exige que a Bia não invente agenda de aulas (sem tool)", () => {
    expect(SYSTEM_PROMPT).toMatch(/sem consulta [àa] agenda|n[aã]o tem ferramenta|n[aã]o.*ferramenta.*agenda/i);
    expect(SYSTEM_PROMPT).toMatch(/equipe da unidade/i);
    expect(SYSTEM_PROMPT).toMatch(/hor[aá]rios livres|datas espec[ií]ficas|vagas em dia\/hora/i);
  });

  it("versão do prompt atualizada (rastreio de deploy)", () => {
    expect(SYSTEM_PROMPT).toMatch(/v8\.5/);
  });

  it("proíbe conselho sobre RG/polícia e exige encaminhar dúvida regulatória à unidade", () => {
    expect(SYSTEM_PROMPT).toMatch(/RG|pol[ií]cia|Detran/i);
    expect(SYSTEM_PROMPT).toMatch(/matriculado|mais perto|mais pr[oó]xim/i);
    expect(SYSTEM_PROMPT).toMatch(/atendente humana|time da unidade/i);
    expect(SYSTEM_PROMPT).toMatch(/INADMISS[IÍ]VEL INVENTAR|n[aã]o invente/i);
  });
});

describe("Autoescola Ideal — FOLLOWUP_PROMPT", () => {
  it("não incentiva prometer horários de aula no follow-up", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/N[aã]o.*prometa.*hor[aá]rios|datas espec[ií]ficas de aula/i);
  });
});
