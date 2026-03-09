# Lembretes de Agendamento

## Visao geral

O sistema de lembretes envia mensagens aos clientes X minutos antes do horario do agendamento. O lembrete e disparado pela Edge Function `process-reminders` (Supabase).

## Fluxo

1. **Painel (CalendarPage):** Ao criar ou editar um evento com "Enviar lembrete" ativado, e inserido um registro em `appointment_reminders` com:
   - `event_start_at`: data/hora do evento
   - `remind_at`: `event_start_at - reminder_minutes_before` (ex.: 60 min antes)
   - `status`: `pending`

2. **Configuracao do agente:** Em EditAgent > Lembrete de Agendamento:
   - `reminder_enabled`: ativa/desativa
   - `reminder_minutes_before`: quantos minutos antes enviar (ex.: 60)
   - `reminder_template`: template com placeholders `{titulo}`, `{horario}`, `{data}`, `{hora}`

3. **Edge Function:** `supabase/functions/process-reminders/index.ts` deve ser invocada periodicamente (cron externo). Ela:
   - Busca registros com `status = 'pending'` e `remind_at <= now()`
   - Monta a mensagem com o template
   - Envia via Chatwoot (se `chatwoot_conversation_id`) ou WAHA (se `external_user_id`)
   - Atualiza `status` para `sent` ou `failed`

## Como disparar a Edge Function

A funcao **nao** tem cron interno. E necessario configurar um agendador externo:

- **Supabase pg_cron** (se disponivel): criar job que chama a URL da Edge Function a cada 5 minutos
- **Servico externo** (cron, GitHub Actions, etc.): fazer `POST` para a URL da funcao no intervalo desejado (recomendado: a cada 5 min)

Exemplo de invocacao:
```bash
curl -X POST "https://<projeto>.supabase.co/functions/v1/process-reminders" \
  -H "Authorization: Bearer <anon_key>" \
  -H "Content-Type: application/json"
```

## Testes

Os testes da logica de montagem da mensagem estao em `server/src/utils/buildReminderMessage.test.ts`:

```sh
npm run test -- --run server/src/utils/buildReminderMessage.test.ts
```

A logica em `server/src/utils/buildReminderMessage.ts` e equivalente a da Edge Function (manter sincronizadas se alterar).
