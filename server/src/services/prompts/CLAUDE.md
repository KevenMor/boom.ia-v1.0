# prompts

## Propósito
Sistema de prompts por tenant — cada cliente tem seu próprio system prompt, regras de comunicação, dispatcher e follow-up hardcoded em TypeScript.

## Arquitetura
- Padrão: um arquivo TS por tenant exportando constantes (`SYSTEM_PROMPT`, `COMMUNICATION_RULES`, `DISPATCHER_PROMPT`, `FOLLOWUP_PROMPT`).
- `registry.ts` mapeia slugs → configs via `TENANT_PROMPTS` (Record). Suporta aliases e normalização de slug (typos, hífens, underscores).
- `base.ts` contém `BASE_GREETING` e `DEFAULT_DISPATCHER_PROMPT` compartilhados.
- `buildSystemPrompt()` compõe: prompt do tenant + communication rules + greeting + contexto temporal (Brasília).
- Dependências internas: nenhuma (pasta isolada).
- Dependências externas: nenhuma.

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| registry.ts | Mapa slug→config, buildSystemPrompt(), getDispatcherPrompt(), getFollowupPrompt(), getAllPromptConfigs() |
| base.ts | BASE_GREETING, DEFAULT_DISPATCHER_PROMPT |
| ppl-motors.ts | Prompt Ana Júlia — SDR concessionária |
| pet-home.ts | Prompt Tia Ana — hotel/creche para cães |
| vale-suico.ts | Prompt Vitória — consultora Vale Suíço Resort |
| sunset-thermas.ts | Prompt Julia — consultora Sunset Thermas Park |
| autoescola-ideal.ts | Prompt Bia — SDR Autoescola Ideal |
| biazini.ts | Prompt Bia — secretária veterinária |
| instituto-vicentim-maekawa.ts | Prompt Mariana — recepcionista odontologia |
| imperio-cfc.ts | Prompt Roberta — SDR autoescola |
| dr-iuri.ts | Prompt Camila — assistente otomodelação |
| durce-vita.ts | Prompt Juliana — recepcionista odontologia |
| contabilidade-ideal.ts | Prompt Vitória — contabilidade |
| clinica-odonto.ts | Template genérico clínica odontológica |

## Decisões técnicas
- Prompts em código TS (não em DB) — garante versionamento e review em PR, mas exige redeploy para alterar.
- Registry suporta múltiplos slugs por tenant (aliases para typos no banco).
- `alwaysInjectCommRules: true` — força injeção de regras mesmo sem tool de inventário.
- Contexto temporal injetado automaticamente (data/hora Brasília) para o LLM saber "hoje"/"amanhã".

## Convenções
- Um arquivo por tenant, nomeado pelo slug principal.
- Exports padronizados: `SYSTEM_PROMPT`, `COMMUNICATION_RULES`, `DISPATCHER_PROMPT`, `FOLLOWUP_PROMPT`.
- Testes: `*.prompt.test.ts` — validam estrutura e conteúdo crítico.
- Versão semântica no campo `version` do registry.

## Fluxos críticos
1. `chat-local.ts → buildSystemPrompt(agentPrompt, tenantSlug, hasInventoryTool) → prompt completo para LLM`
2. `chat-local.ts → getDispatcherPrompt(tenantSlug) → prompt de classificação/dispatch`
3. `followup-worker → getFollowupPrompt(tenantSlug) → prompt para mensagem de follow-up`

## Cuidados ao modificar
- Antes de editar prompt de tenant, rodar teste correspondente (`*.prompt.test.ts`).
- Não alterar `BASE_GREETING` sem verificar impacto em todos os tenants.
- Encoding UTF-8 sem BOM — histórico de corrupção (commits cb51a1a, 31b6e85).
- Não citar números de telefone em prompts (regra de compliance).
- Adicionar novo tenant exige: criar arquivo + registrar no registry + redeploy.
