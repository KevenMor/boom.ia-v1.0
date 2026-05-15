# pages

## Contexto rápido
Páginas do painel admin React — cada arquivo é uma rota, consome hooks para dados e renderiza componentes de domínio.

## Stack e ferramentas
- React 18, React Router v6
- TanStack Query (via hooks)
- shadcn/ui + Tailwind CSS
- TypeScript

## Como modificar

### Adicionar uma feature (nova página)
1. Criar `src/pages/NovaPagina.tsx`
2. Adicionar rota em `src/App.tsx` dentro de `<Routes>`
3. Envolver com `<ProtectedRoute>` e `<ModuleRoute module="nome">`
4. Criar hook em `src/hooks/useNovoRecurso.ts` se necessário
5. Adicionar link na sidebar (`AppSidebar`)

### Corrigir um bug
1. Identificar a página pela URL
2. Verificar hook correspondente (dados corretos?)
3. Verificar componentes filhos
4. React Query Devtools no browser para estado do cache

### Refatorar
1. Não mover lógica de dados para a página — manter em hooks
2. Não criar componentes inline — extrair para `src/components/{domínio}/`
3. Manter consistência de nomenclatura

## Comandos úteis
```bash
# rodar frontend
npm run dev

# verificar tipos
npx tsc --noEmit

# build de produção
npm run build
```

## Regras invioláveis
- Nunca fazer fetch direto na página — usar hooks
- Sempre proteger com ProtectedRoute + ModuleRoute
- Nunca hardcodar tenantId — usar TenantContext
- Sempre testar com roles diferentes (superadmin, admin, user)

## Mapa de dependências
```
pages/
├── consome → ../hooks/* (dados)
├── consome → ../components/* (UI)
├── consome → ../contexts/* (auth, tenant)
├── consome → ../lib/* (utilitários)
├── expõe para → ../App.tsx (rotas)
└── depende de env → nenhuma (via hooks/contexts)
```
