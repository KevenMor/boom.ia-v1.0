# workers

## Contexto rápido
Workers BullMQ — processam follow-ups agendados e campanhas financeiras de forma assíncrona via Redis.

## Stack e ferramentas
- TypeScript, BullMQ, ioredis
- Supabase JS para persistência
- Vitest (sem testes dedicados — cobertos por testes de integração)

## Como modificar

### Adicionar uma feature (novo worker)
1. Criar `server/src/workers/novo-worker.ts`
2. Exportar `startNovoWorker(): Worker | null`
3. Registrar em `server/src/index.ts` (chamar no bootstrap)
4. Implementar fallback cron se Redis pode estar ausente

### Corrigir um bug
1. Verificar se Redis está acessível (`REDIS_URL`)
2. Verificar status do job no Redis (BullMQ dashboard ou CLI)
3. Verificar tabela correspondente no Supabase (ex: `follow_up_queue`)

### Refatorar
1. Não remover fallback cron sem garantir Redis em produção
2. Não alterar interface de job data sem atualizar quem enfileira

## Comandos úteis
```bash
# verificar conexão Redis
cd server && node -e "const {createClient}=require('redis');const c=createClient({url:process.env.REDIS_URL});c.connect().then(()=>console.log('ok')).catch(console.error)"

# rodar server com Redis
REDIS_URL=redis://localhost:6379 npm run dev
```

## Regras invioláveis
- Sempre retornar null se REDIS_URL ausente (nunca crashar)
- Sempre ter fallback cron equivalente em index.ts
- Nunca processar item com status != "pending"
- Nunca aumentar concurrency sem análise de race conditions

## Mapa de dependências
```
workers/
├── consome → ../services/supabase.ts (createNexusClient)
├── consome → ../services/followup-queue.ts (addFollowUpJob)
├── consome → ../services/financeiro-campaign-runner.ts
├── consome → ../services/financeiro-campaign-persist.ts
├── consome → ../routes/queue.ts (processFollowUpItem)
└── depende de env → REDIS_URL, NEXUS_SERVICE_ROLE_KEY, API_BASE_URL
```
