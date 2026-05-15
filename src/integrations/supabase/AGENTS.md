# supabase (integrations)

## Contexto rápido
Cliente Supabase do frontend — conecta via proxy no backend para evitar CORS, usado por todos os hooks e contexts.

## Stack e ferramentas
- @supabase/supabase-js v2
- TypeScript
- Vite (env vars VITE_*)

## Como modificar

### Adicionar uma feature
1. Para nova tabela: regenerar tipos com `npx supabase gen types typescript --project-id=... > src/integrations/supabase/types.ts`
2. Para novo bucket: usar `nexusDb.storage.from("novo-bucket")`
3. Para nova auth feature: usar `nexusDb.auth.*`

### Corrigir um bug
1. Verificar se proxy está funcionando: `curl http://localhost:3001/api/supabase-proxy/rest/v1/`
2. Verificar VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no `.env`
3. Verificar Network tab — requests devem ir para `/api/supabase-proxy/*`

### Refatorar
1. Não criar segundo cliente — usar sempre `nexusDb`
2. Não remover lógica de resolução de URL sem testar dev + prod
3. Não editar `types.ts` manualmente — é auto-gerado

## Comandos úteis
```bash
# regenerar tipos do banco
npx supabase gen types typescript --project-id=SEU_PROJECT_ID > src/integrations/supabase/types.ts

# verificar proxy
curl http://localhost:3001/api/supabase-proxy/rest/v1/ -H "apikey: SUA_ANON_KEY"
```

## Regras invioláveis
- Sempre usar `nexusDb` (nunca instanciar cliente Supabase diretamente)
- Nunca editar `types.ts` manualmente
- Nunca expor service_role_key no frontend
- Sempre testar resolução de URL em dev E produção

## Mapa de dependências
```
integrations/supabase/
├── consome → env vars (VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_API_URL)
├── expõe para → ../hooks/* (nexusDb)
├── expõe para → ../contexts/AuthContext.tsx (nexusDb.auth)
├── expõe para → ../lib/api-client.ts (nexusDb.auth.getSession)
└── depende de env → VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, VITE_API_URL
```
