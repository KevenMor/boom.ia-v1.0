# hooks

## Contexto rápido
React Query hooks — data fetching e mutations para todos os recursos do painel admin, com cache e invalidação automática.

## Stack e ferramentas
- TanStack Query (React Query) v5
- @supabase/supabase-js
- TypeScript

## Como modificar

### Adicionar uma feature (novo hook)
1. Criar `src/hooks/useNovoRecurso.ts`
2. Usar `useQuery` para leitura, `useMutation` para escrita
3. Query key: `["novo-recurso", tenantId, ...filtros]`
4. Invalidar queries relacionadas no `onSuccess` da mutation
5. Consumir em páginas/componentes

### Corrigir um bug
1. Verificar query key (cache stale?)
2. Verificar se tenantId está presente (isolamento multi-tenant)
3. Verificar resposta do Supabase no Network tab
4. Verificar se mutation invalida as queries corretas

### Refatorar
1. Não alterar query keys sem verificar dependentes
2. Não remover invalidações de cache
3. Manter padrão: um hook por recurso

## Comandos úteis
```bash
# verificar tipos
npx tsc --noEmit

# React Query Devtools (já incluído em dev)
# Abrir painel no browser: ícone flutuante no canto
```

## Regras invioláveis
- Sempre filtrar por tenantId (isolamento multi-tenant)
- Sempre invalidar cache após mutations
- Nunca fazer queries sem enabled: !!tenantId (evita fetch sem contexto)
- Nunca usar queryClient diretamente em componentes — usar hooks

## Mapa de dependências
```
hooks/
├── consome → ../integrations/supabase/nexus-client.ts (nexusDb)
├── consome → ../contexts/TenantContext.tsx (tenantId)
├── consome → ../contexts/AuthContext.tsx (session)
├── consome → ../lib/api-client.ts (callAPI para endpoints custom)
├── expõe para → ../pages/* (dados e mutations)
├── expõe para → ../components/* (dados e mutations)
└── depende de env → nenhuma (via nexus-client)
```
