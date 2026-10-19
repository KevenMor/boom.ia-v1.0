# prompts

## Propósito
System prompts por tenant em TypeScript. `registry.ts` mapeia slug → config (aliases + typos). `buildSystemPrompt()` junta prompt + regras + greeting + horário Brasília.

## Arquivos
`base.ts` · `registry.ts` · um `.ts` por tenant · `*.prompt.test.ts`.

| Arquivo / slug | Versão | Agente |
|----------------|--------|--------|
| ppl-motors.ts | v2.3.1 | Ana Júlia |
| referency.ts | v1.6.4 | Amanda |
| pousada-flores-do-lazaro.ts | v1.0.0 | Marina |
| instituto-vicentim-maekawa.ts | v1.2.0 | Mariana |
| pet-home.ts | v1.2.1 | Tia Ana |
| vale-suico.ts | v1.2.46 | Vitória |
| sunset-thermas.ts (`sunset-thermas-park`) | **v1.5.58** | Julia |
| durce-vita.ts | v1.2.1 | Juliana |
| contabilidade-ideal.ts | v1.0 | Vitória |
| clinica-odonto.ts | v1.0.0 | template |
| imperio-cfc.ts | v2.0 | Roberta |
| autoescola-ideal.ts | v8.16 | Bia |
| dr-iuri.ts | v1.1.1 | Camila |
| biazini.ts | v1.0.1 | Bia |
| monte-verde-ranch.ts | v1.2.1 | Cleide |
| delta-empreendimentos.ts | v1.5.18 | Paula |

Exports: `SYSTEM_PROMPT`, `COMMUNICATION_RULES`, `DISPATCHER_PROMPT`, `FOLLOWUP_PROMPT`.

## Decisões
- Código, não DB → versionamento em PR, **redeploy** para mudar
- `alwaysInjectCommRules` comum
- Sunset: qualificação §00d também em `chat-local.ts` + `sunset-lodging-params.ts` — bump `version` ao mudar

## Cuidados
- UTF-8 sem BOM
- Sem telefones
- Não remover alias sem checar o slug no banco
- Novo tenant: arquivo + registry + teste + redeploy
