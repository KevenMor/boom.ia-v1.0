# utils

## Propósito
Funções puras do backend (exceto `sendNotification.ts`). Consumidas por chat-local, delivery, tool-executor.

## Arquivos-chave

| Arquivo | Papel |
|---------|--------|
| sanitize.ts | limpa comandos internos do stream LLM |
| extract-media-commands.ts | `[IMG:…]` `[VID:…]` → SSE de mídia |
| brasiliaTime.ts | timezone São Paulo — **única** fonte de “agora” |
| agendaNotification.ts / sendNotification.ts / buildReminderMessage.ts | notificações WAHA |
| agent-business-hours.ts / followup-utils.ts / message-debounce.ts | expediente / follow-up / debounce |
| sunset-lodging-params.ts | allowlist tool, FAQ amenidade, params Loft |
| sunset-lodging-quote-format.ts / quote-layout / quote-image-overlays | orçamento Julia |
| sunset-lodging-promo.ts / sunset-lodging-gallery-photos.ts / sunset-handoff-params.ts / sunset-park-params.ts | Sunset |
| omnibees-quote-format.ts / omnibees-photo-markdown.ts | Vale/Omnibees |
| lodging-consulta-summary.ts / park-day-consulta-summary.ts | resumos tools |
| suite-gallery-* / inventory-photo-inject / inventory-quote-format | mídia catálogo |
| llm-usage.ts / builtin-agent-tools.ts / tool-dispatcher-resolver.ts | tokens / tools built-in |
| photos-sent-metadata.ts / videoDeliveryLimits.ts / videoUrl.ts | limites mídia |
| flow-logger.ts / webhook-echo.ts / merge-sse-media-ids.ts / chatwoot-conversation-url.ts / crm-phone-match.ts / petGenderByName.ts | suporte |

## Decisões
- Sanitize em 3 camadas (stream → final → retry)
- Marcadores de mídia aprendidos via prompt — não mudar formato sem atualizar tenants
- Sunset lodging ≠ park (ingresso)

## Cuidados
- Testes obrigatórios em sanitize e sunset-*
- Nunca `new Date()` para regra de negócio
