# utils

## Propósito
Funções utilitárias puras do backend — sanitização de output LLM, extração de comandos de mídia, formatação de datas, notificações e helpers de domínio.

## Arquitetura
- Funções puras sem side-effects (exceto `sendNotification.ts` que faz HTTP).
- Consumidas por `routes/chat-local.ts`, `routes/delivery.ts`, `services/tool-executor.ts`.
- Cada utilitário tem teste lado-a-lado (`*.test.ts`).

## Arquivos-chave
| Arquivo | Responsabilidade |
|---------|-----------------|
| sanitize.ts | filterCommandLinesFromStream(), sanitizeLLMOutput(), fallbackSanitizeForRetry() — limpa output LLM de comandos internos |
| extract-media-commands.ts | Extrai comandos de mídia (imagens/vídeos) do texto LLM, emite como SSE separado |
| agendaNotification.ts | Payloads de notificação de agendamento (formatDateBR, buildCancelNotification, buildHandoffNotification) |
| sendNotification.ts | Envia notificações para grupos WhatsApp via WAHA |
| brasiliaTime.ts | Timezone America/Sao_Paulo |
| agent-business-hours.ts | Verifica se horário atual está dentro do expediente do agente |
| followup-utils.ts | Utilitários de agendamento de follow-up |
| suite-gallery-llm-labels.ts | Labels amigáveis para LLM de itens de galeria |
| suite-gallery-markdown-inject.ts | Injeta markdown de galeria nas respostas |
| omnibees-photo-markdown.ts | Injeta fotos Omnibees como markdown |
| omnibees-quote-format.ts | Formata cotações Omnibees para entrega |
| buildReminderMessage.ts | Constrói mensagens de lembrete de agendamento |
| photos-sent-metadata.ts | Rastreia fotos já enviadas na conversa |
| videoDeliveryLimits.ts | Limites de tamanho/quantidade de vídeo |

## Decisões técnicas
- Sanitização é multi-camada: `filterCommandLinesFromStream` (stream) → `sanitizeLLMOutput` (final) → `fallbackSanitizeForRetry` (retry).
- Extração de mídia usa marcadores especiais no texto (`[IMG:...]`, `[VID:...]`) que o LLM aprende via prompt.
- `brasiliaTime.ts` é a fonte única de timezone — nunca usar `new Date()` diretamente para lógica de negócio.

## Convenções
- Funções exportadas são puras quando possível.
- Testes lado-a-lado: `arquivo.ts` → `arquivo.test.ts`.
- Nomes em inglês para funções, comentários em pt-BR quando necessário.

## Fluxos críticos
1. `LLM stream → filterCommandLinesFromStream → sanitizeLLMOutput → emitMediaCommandsSseIfNeeded → texto limpo + SSE de mídia`
2. `Tool notificar_agendamento → agendaNotification.ts (build payload) → sendNotification.ts (WAHA group)`
3. `Cron reminders → buildReminderMessage → envio via WAHA`

## Cuidados ao modificar
- Testes obrigatórios: `npm run test` no server/ antes de qualquer merge.
- `sanitize.ts` é crítico — bugs aqui vazam comandos internos para o cliente final.
- `agendaNotification.ts` é usado por múltiplos tenants — testar com dados de cada um.
- Não alterar formato dos marcadores de mídia sem atualizar o prompt dos tenants.
