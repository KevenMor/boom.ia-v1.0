export interface FinancialTemplate {
  id: string;
  name: string;
  body: string;
}

export interface FinancialTemplateVars {
  nome: string;
  valor: string;
  vencimento: string;
}

export const FINANCIAL_TEMPLATES: FinancialTemplate[] = [
  {
    id: "friendly-charge",
    name: "Cobranca amigavel",
    body: "Ola {nome}, temos uma pendencia de R$ {valor} com vencimento em {vencimento}. Podemos regularizar?",
  },
  {
    id: "expired-boleto",
    name: "Boleto vencido",
    body: "Oi {nome}! Seu boleto de R$ {valor} venceu em {vencimento}. Acesse o link para 2a via.",
  },
  {
    id: "preventive-reminder",
    name: "Lembrete preventivo",
    body: "Ola {nome}, lembrando que seu pagamento de R$ {valor} vence em {vencimento}.",
  },
];

export function renderFinancialTemplate(template: string, vars: FinancialTemplateVars): string {
  return template
    .replaceAll("{nome}", vars.nome)
    .replaceAll("{valor}", vars.valor)
    .replaceAll("{vencimento}", vars.vencimento);
}
