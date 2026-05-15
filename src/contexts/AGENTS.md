# contexts

## Contexto rápido
Providers React de estado global — autenticação (Supabase), tenant ativo e sidebar.

## Stack e ferramentas
- React 18 (Context API)
- @supabase/supabase-js
- TypeScript

## Como modificar

### Adicionar uma feature
1. Se for estado global novo: criar `src/contexts/NovoContext.tsx`
2. Exportar provider + hook (`useNovo()`)
3. Adicionar provider na hierarquia em `App.tsx` (atenção à ordem)

### Corrigir um bug
1. Para bugs de auth: verificar `AuthContext.tsx` → `loadScope()`
2. Para bugs de tenant: verificar `TenantContext.tsx` → seleção/persistência
3. Verificar console do browser para erros de Supabase

### Refatorar
1. Não mover lógica de auth para hooks — manter centralizado no context
2. Não quebrar a hierarquia de providers (Auth → Tenant → resto)

## Comandos úteis
```bash
# rodar frontend em dev
npm run dev

# verificar tipos
npx tsc --noEmit
```

## Regras invioláveis
- Nunca acessar Supabase Auth fora do AuthContext
- Nunca alterar ordem dos providers sem testar toda a app
- Nunca expor tokens/session em logs ou state visível
- Sempre usar o hook (`useAuth()`) — nunca `useContext(AuthContext)` direto

## Mapa de dependências
```
contexts/
├── consome → ../integrations/supabase/nexus-client.ts
├── consome → ../lib/api-client.ts
├── expõe para → toda a aplicação (via hooks)
└── depende de env → VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (via nexus-client)
```
