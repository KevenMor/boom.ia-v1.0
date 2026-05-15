# constants

## Contexto rápido
Constantes do backend — lista de respostas genéricas do LLM que devem ser filtradas (soft replies).

## Stack e ferramentas
- TypeScript puro
- Vitest

## Como modificar

### Adicionar uma feature
1. Adicionar nova constante em arquivo dedicado
2. Criar teste correspondente

### Corrigir um bug
1. Verificar se alguma frase legítima está sendo filtrada
2. Rodar `npx vitest run src/constants/`

### Refatorar
1. Não mover para config/env — são constantes de domínio, não configuração

## Comandos úteis
```bash
cd server && npx vitest run src/constants/
```

## Regras invioláveis
- Nunca adicionar frases muito curtas (< 5 palavras) — risco de falso positivo
- Sempre testar com cenários reais de conversa

## Mapa de dependências
```
constants/
├── expõe para → ../routes/chat-local.ts
└── depende de env → nenhuma
```
