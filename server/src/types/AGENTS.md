# types

## Contexto rápido
Declarações TypeScript globais do servidor — tipos disponíveis sem import explícito.

## Stack e ferramentas
- TypeScript (declaration files)

## Como modificar

### Adicionar uma feature
1. Adicionar interface/type em `global.d.ts`
2. Verificar com `cd server && npx tsc --noEmit`

### Corrigir um bug
1. Verificar conflitos de tipo com `tsc --noEmit`

### Refatorar
1. Mover tipos específicos de domínio para seus respectivos módulos
2. Manter aqui apenas tipos verdadeiramente globais

## Comandos úteis
```bash
cd server && npx tsc --noEmit
```

## Regras invioláveis
- Nunca declarar tipos de domínio específico aqui (usar módulo correspondente)
- Nunca usar `any` em declarações globais

## Mapa de dependências
```
types/
├── expõe para → todo o server (global)
└── depende de env → nenhuma
```
