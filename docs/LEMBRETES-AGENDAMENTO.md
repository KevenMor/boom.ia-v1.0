# Lembretes de Agendamento

## Visao geral

O sistema de lembretes envia mensagens aos clientes X minutos antes do horario do agendamento. O lembrete e processado pelo servidor Node.js via cron interno (setInterval a cada 60s).

## Fluxo

1. **Painel (CalendarPage):** Ao criar ou editar um evento com "Enviar lembrete" ativado, e inserido um registro em `appointment_reminders` com:
   - `event_start_at`: data/hora do evento
   - `remind_at`: `event_start_at - reminder_minutes_before` (ex.: 60 min antes)
   - `status`: `pending`

2. **Configuracao do agente:** Em EditAgent > Lembrete de Agendamento:
   - `reminder_enabled`: ativa/desativa
   - `reminder_minutes_before`: quantos minutos antes enviar (ex.: 60)
   - `reminder_template`: template com placeholders `{titulo}`, `{horario}`, `{data}`, `{hora}`

3. **Servidor Node:** A rota `POST /api/queue/reminders` e chamada automaticamente a cada 60 segundos (cron interno em `server/src/index.ts`). Ela:
   - Busca registros com `status = 'pending'` e `remind_at <= now()`
   - Deduplica por `calendar_event_id`
   - Monta a mensagem com o template (`buildReminderMessage`)
   - Envia via Chatwoot (se `chatwoot_conversation_id`) ou WAHA (se `external_user_id`)
   - Atualiza `status` para `sent`, `failed` ou `cancelled`
   - Grava `skip_reason` quando não enviado: `agent_inactive`, `reminder_disabled`, `no_delivery_channel`, `send_failed`, `duplicate`
   - Salva no historico da conversa (exceto eventos manuais com `conversation_id` iniciando em `manual-`)

## Tenants existentes e novos

Follow-ups e Lembretes funcionam para **qualquer tenant** (existente ou novo). O filtro usa `tenant_id`. Ver `docs/TENANT-ONBOARDING.md` para detalhes.

## Arquivos

- **Rota:** `server/src/routes/queue.ts` — `POST /queue/reminders`
- **Cron:** `server/src/index.ts` — setInterval 60s
- **Template:** `server/src/utils/buildReminderMessage.ts`

## Testes

Os testes da logica de montagem da mensagem estao em `server/src/utils/buildReminderMessage.test.ts`:

```sh
npm run test -- --run server/src/utils/buildReminderMessage.test.ts
```
