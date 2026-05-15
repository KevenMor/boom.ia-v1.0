# lib

## Contexto rápido
Utilitário de normalização de URLs do Supabase Storage — garante path correto para acesso público a buckets.

## Stack e ferramentas
- TypeScript puro

## Como modificar

### Adicionar uma feature
1. Adicionar função no arquivo existente ou criar novo arquivo em `server/src/lib/`
2. Manter funções puras

### Corrigir um bug
1. Verificar se a URL de entrada tem formato esperado (com/sem `/object/public/`)
2. Testar com URLs de upload vs download

### Refatorar
1. Não mover para utils/ — lib é para utilitários de infraestrutura, utils para domínio

## Comandos úteis
```bash
cd server && npx tsc --noEmit
```

## Regras invioláveis
- Nunca alterar URLs de upload (POST) — apenas GET/HEAD
- Nunca quebrar URLs signed ou authenticated

## Mapa de dependências
```
lib/
├── expõe para → ../services/tool-executor.ts
├── expõe para → ../routes/ (supabase-proxy)
└── depende de env → nenhuma
```
