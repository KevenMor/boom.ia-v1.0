# prompts

## Contexto rápido
Prompts de IA por tenant — cada cliente tem personalidade, regras e comportamento próprios definidos em arquivos TS.

## Stack e ferramentas
- TypeScript (constantes string)
- Vitest para testes de prompt
- Sem dependências externas

## Como modificar

### Adicionar uma feature (novo tenant)
1. Criar `server/src/services/prompts/nome-tenant.ts`
2. Exportar: `SYSTEM_PROMPT`, `COMMUNICATION_RULES`, `DISPATCHER_PROMPT`, `FOLLOWUP_PROMPT`
3. Importar no `registry.ts` e adicionar entrada(s) no `TENANT_PROMPTS`
4. Criar teste `nome-tenant.prompt.test.ts`
5. Redeploy do server

### Corrigir um bug
1. Identificar o tenant pelo slug (verificar aliases no registry)
2. Editar o arquivo do tenant específico
3. Rodar `npx vitest run src/services/prompts/`
4. Verificar se o encoding está UTF-8 sem BOM

### Refatorar
1. Não mover prompts para o banco sem migração planejada
2. Não alterar a interface `TenantPromptConfig` sem atualizar todos os tenants
3. Não remover aliases de slug — podem estar em uso no banco de produção

## Comandos úteis
```bash
# rodar testes de prompts
cd server && npx vitest run src/services/prompts/

# verificar encoding
file server/src/services/prompts/*.ts

# buscar tenant por slug
grep -n "slug" server/src/services/prompts/registry.ts
```

## Regras invioláveis
- Nunca citar números de telefone nos prompts
- Nunca alterar BASE_GREETING sem testar todos os tenants
- Sempre manter encoding UTF-8 sem BOM
- Sempre adicionar aliases para variações conhecidas do slug
- Nunca remover um slug do registry sem verificar o banco de produção

## Mapa de dependências
```
prompts/
├── consome → ./base.ts (BASE_GREETING, DEFAULT_DISPATCHER_PROMPT)
├── expõe para → ../routes/chat-local.ts (buildSystemPrompt, getDispatcherPrompt)
├── expõe para → ../workers/followup-worker.ts (getFollowupPrompt)
├── expõe para → ../routes/prompts-read.ts (getAllPromptConfigs)
└── depende de env → nenhuma (pure data)
```
