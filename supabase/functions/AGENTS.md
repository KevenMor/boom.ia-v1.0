# functions (Supabase Edge Functions)

## Contexto rápido
Edge Functions Deno no Supabase — endpoints serverless para conversas, contatos e operações administrativas.

## Stack e ferramentas
- Deno (runtime Supabase Edge Functions)
- @supabase/supabase-js (via esm.sh)
- Supabase CLI para deploy

## Como modificar

### Adicionar uma feature (nova function)
1. Criar pasta `supabase/functions/nome-funcao/`
2. Criar `index.ts` com `Deno.serve(async (req) => { ... })`
3. Adicionar CORS headers
4. Usar `createClient(Deno.env.get("NEXUS_DB_URL"), Deno.env.get("NEXUS_SERVICE_ROLE_KEY"))`
5. Deploy: `npx supabase functions deploy nome-funcao`

### Corrigir um bug
1. Verificar logs no dashboard Supabase (Edge Functions → Logs)
2. Testar localmente: `npx supabase functions serve nome-funcao`
3. Verificar env vars no dashboard

### Refatorar
1. Não compartilhar código entre functions (cada uma é isolada)
2. Não usar imports de Node.js
3. Manter CORS headers em todas as respostas

## Comandos úteis
```bash
# deploy de uma function
npx supabase functions deploy conversation-history

# deploy de todas
npx supabase functions deploy

# testar localmente
npx supabase functions serve conversation-history --env-file .env

# ver logs
npx supabase functions logs conversation-history
```

## Regras invioláveis
- Nunca usar imports de Node.js (runtime é Deno)
- Sempre incluir CORS headers (inclusive em OPTIONS)
- Nunca expor NEXUS_SERVICE_ROLE_KEY em responses
- Sempre validar input (agent_id, conversation_id)
- Nunca usar npm packages — usar esm.sh ou deno.land/x

## Mapa de dependências
```
supabase/functions/
├── consome → Supabase Postgres (via createClient)
├── expõe para → frontend (via supabase.functions.invoke)
├── expõe para → sistemas externos (HTTP direto)
└── depende de env → NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY (configuradas no dashboard)
```
