# utils

## Contexto rápido
Funções utilitárias do backend — sanitização de LLM, extração de mídia, notificações, formatação de datas BR.

## Stack e ferramentas
- TypeScript puro (sem dependências externas pesadas)
- Vitest para testes
- Intl.DateTimeFormat para timezone Brasília

## Como modificar

### Adicionar uma feature
1. Criar `server/src/utils/novo-util.ts`
2. Criar teste `server/src/utils/novo-util.test.ts`
3. Exportar e importar onde necessário (routes ou services)

### Corrigir um bug
1. Rodar o teste específico: `npx vitest run src/utils/arquivo.test.ts`
2. Verificar se a sanitização não está removendo conteúdo legítimo (falsos positivos)
3. Para bugs de timezone: verificar `brasiliaTime.ts` e `Intl.DateTimeFormat`

### Refatorar
1. Manter funções puras — sem side-effects
2. Não mover `sendNotification.ts` para routes (é service-like mas usado por utils)
3. Não alterar interfaces de retorno sem atualizar consumidores em routes/

## Comandos úteis
```bash
# rodar todos os testes de utils
cd server && npx vitest run src/utils/

# rodar teste específico
cd server && npx vitest run src/utils/sanitize-stream-leak.test.ts

# rodar em watch
cd server && npx vitest src/utils/
```

## Regras invioláveis
- Nunca usar `new Date()` para lógica de negócio — usar `brasiliaTime.ts`
- Nunca alterar marcadores de mídia (`[IMG:...]`, `[VID:...]`) sem atualizar prompts
- Sempre ter teste para funções de sanitização
- Nunca logar dados sensíveis (telefones, API keys) em sendNotification

## Sunset Thermas (hospedagem)

| Arquivo | Função |
|---------|--------|
| `sunset-lodging-params.ts` | `userNeedsSunsetLodgingToolCall` (allowlist), `extractSunsetLodgingParams`, detecção FAQ amenidade |
| `sunset-lodging-quote-format.ts` | `formatSunsetLodgingQuoteForDelivery`, `shouldRebuildSunsetQuoteFromTool` |
| `sunset-park-params.ts` | Ingresso/parque (separado de hospedagem) |

Alterações aqui afetam `chat-local.ts` diretamente — sempre rodar os `*.test.ts` correspondentes.

## Mapa de dependências
```
utils/
├── consome → ../services/supabase.ts (apenas sendNotification)
├── consome → ../services/delivery.ts (getChatwootAuthHeaders)
├── expõe para → ../routes/chat-local.ts (sanitize, extract-media, agendaNotification, sunset-lodging-*)
├── expõe para → ../routes/delivery.ts (extract-media)
├── expõe para → ../services/tool-executor.ts (agendaNotification, sendNotification)
└── depende de env → WAHA_API_URL, WAHA_API_KEY (sendNotification)
```
