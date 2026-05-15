# services

## Contexto rápido
Lógica de negócio do backend — tools do agente IA, integrações externas (FIPE, Omnibees, WAHA, Chatwoot), criptografia e delivery de mensagens.

## Stack e ferramentas
- TypeScript, Node.js
- @supabase/supabase-js
- BullMQ (Redis) para filas
- undici/fetch para HTTP externo
- crypto (Node) para AES
- Vitest para testes

## Como modificar

### Adicionar uma feature (nova tool)
1. Implementar função em `server/src/services/nova-tool.ts`
2. Adicionar case no switch de `tool-executor.ts`
3. Registrar tool_type no banco (tabela `tools`)
4. Criar teste `nova-tool.test.ts`
5. Documentar no prompt do tenant se necessário

### Corrigir um bug
1. Identificar a tool/serviço pelo `tool_type` nos logs
2. Verificar se é problema de dados (Supabase) ou integração externa
3. Rodar teste específico: `npx vitest run src/services/arquivo.test.ts`
4. Para bugs de delivery: verificar config Chatwoot do agente

### Refatorar
1. Não quebrar a interface `ToolExecutionResult { success, result, error }`
2. Não mover lógica de `tool-executor.ts` para routes
3. Manter serviços independentes entre si (sem imports circulares)

## Comandos úteis
```bash
# rodar testes de services
cd server && npx vitest run src/services/

# testar tool-executor
cd server && npx vitest run src/services/tool-executor.test.ts

# testar omnibees
cd server && npx vitest run src/services/omnibees-availability.test.ts
```

## Regras invioláveis
- Nunca logar API keys descriptografadas
- Nunca retornar dados sensíveis no ToolExecutionResult
- Sempre usar createNexusClient() (nunca instanciar Supabase diretamente)
- Nunca fazer fetch sem timeout para APIs externas
- Sempre retornar { success: false, error } em vez de throw em tools

## Mapa de dependências
```
services/
├── consome → ../utils/ (agendaNotification, sendNotification, brasiliaTime)
├── consome → ../config/env.ts
├── consome → ../lib/supabase-storage-public-url.ts
├── consome → ./prompts/registry.ts (buildSystemPrompt)
├── expõe para → ../routes/ (tool-executor, delivery, supabase, crypto)
├── expõe para → ../workers/ (followup-queue, financeiro-campaign-*)
└── depende de env → NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY, ENCRYPTION_KEY, GOOGLE_MAPS_API_KEY, WAHA_API_URL
```
