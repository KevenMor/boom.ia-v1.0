# lib (frontend)

## Contexto rápido
Utilitários puros do frontend — API client com auto-auth, formatação BR, CSV, validação e helpers de domínio.

## Stack e ferramentas
- TypeScript puro
- clsx + tailwind-merge (cn)
- Vitest para testes

## Como modificar

### Adicionar uma feature
1. Criar `src/lib/novo-util.ts`
2. Exportar funções puras
3. Criar teste `src/lib/novo-util.test.ts` se lógica não-trivial
4. Importar onde necessário

### Corrigir um bug
1. Para bugs de API: verificar `api-client.ts` → resolução de URL e auth
2. Para bugs de formatação: verificar locale e timezone
3. Rodar teste: `npx vitest run src/lib/arquivo.test.ts`

### Refatorar
1. Não alterar assinatura de `cn()` — usado em centenas de componentes
2. Não alterar `getApiBase()` sem testar dev + prod
3. Manter funções puras e sem dependências de React

## Comandos úteis
```bash
# rodar testes de lib
npx vitest run src/lib/

# verificar tipos
npx tsc --noEmit
```

## Regras invioláveis
- Nunca importar React em lib/ (funções puras, sem hooks)
- Nunca hardcodar URLs — usar getApiBase()
- Nunca alterar cn() sem verificar impacto visual
- Sempre validar input em funções de segurança (image-file-guards)

## Mapa de dependências
```
lib/
├── consome → ../integrations/supabase/nexus-client.ts (api-client.ts)
├── expõe para → ../hooks/* (api-client, tenant-modules)
├── expõe para → ../components/* (cn, formatação)
├── expõe para → ../pages/* (exportCsv, parseCsv)
└── depende de env → nenhuma (via nexus-client)
```
