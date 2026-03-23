import {
  SYSTEM_PROMPT as IVM_SYSTEM_PROMPT,
  COMMUNICATION_RULES as IVM_COMMUNICATION_RULES,
  DISPATCHER_PROMPT as IVM_DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT as IVM_FOLLOWUP_PROMPT,
} from "./instituto-vicentim-maekawa.js";

function adaptFromVicentim(base: string): string {
  return base
    .replaceAll("MARIANA", "JULIANA")
    .replaceAll("Mariana", "Juliana")
    .replaceAll("PERSONA MARIANA", "PERSONA JULIANA")
    .replaceAll("Instituto Vicentim Maekawa", "Clinica Odontologica Durce Vita")
    .replaceAll("instituto Vicentim Maekawa", "Clinica Odontologica Durce Vita")
    .replaceAll("INSTITUTO VICENTIM MAEKAWA", "CLINICA ODONTOLOGICA DURCE VITA")
    .replaceAll("em Sorocaba/SP", "em Sao Paulo/SP")
    .replaceAll(
      "Rua Newton Prado, 449 - Ed. Santa Maria Offices, Sala 310 - Vila Hortência, Sorocaba – SP",
      "Rua Clélia, 2208, complemento Conj. 401 - Lapa, São Paulo - SP - CEP 05042-001",
    )
    .replaceAll(
      "Rua Newton Prado, 449 - Ed. Santa Maria Offices, Sala 310 - Vila Hortencia, Sorocaba/SP",
      "Rua Clelia, 2208, complemento Conj. 401 - Lapa, Sao Paulo - SP - CEP 05042-001",
    );
}

export const SYSTEM_PROMPT = adaptFromVicentim(IVM_SYSTEM_PROMPT)
  .replace("v1.2.0", "v1.2.1")
  .replace(
    "Instagram: https://www.instagram.com/institutovicentimmaekawa/",
    "Instagram: nao informado",
  );

export const COMMUNICATION_RULES = IVM_COMMUNICATION_RULES;

export const DISPATCHER_PROMPT = adaptFromVicentim(IVM_DISPATCHER_PROMPT);

export const FOLLOWUP_PROMPT = adaptFromVicentim(IVM_FOLLOWUP_PROMPT);
