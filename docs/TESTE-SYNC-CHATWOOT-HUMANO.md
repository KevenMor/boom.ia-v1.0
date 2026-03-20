# Como testar a sincronização de conversas humanas do Chatwoot

Guia para validar que mensagens de atendentes humanos aparecem no Nexus quando um humano está atribuído à conversa.

---

## Pré-requisitos

1. **Servidor rodando:** `npm run dev:all` (ou server em `http://localhost:3001`)
2. **Agente válido:** Pegue um `agent_id` real no painel (Agentes → editar → URL ou config)
3. **Configuração do agente:**
   - `agent_assignee_id`: ID do usuário no Chatwoot que representa o **bot** (para ignorar respostas dele)
   - `test_assignee_id`: Se o agente estiver em modo Teste, ID do usuário que pode testar

---

## Opção A: Teste com Chatwoot real (recomendado)

### Teste 1 — Cliente + humano: conversa completa no Nexus

1. No Chatwoot, atribua a conversa a um **atendente humano** (não ao bot).
2. Cliente envia mensagem pelo WhatsApp.
3. O webhook incoming chega → mensagem é salva como `user`.
4. O atendente responde no Chatwoot.
5. O webhook outgoing chega → mensagem é salva como `assistant`.

**Verificar:** Chat ao Vivo / Conversas → abrir o contato → deve aparecer:
- Mensagem do cliente (user)
- Resposta do atendente (assistant)

**Logs:** No terminal do server, procure `saved_no_ai` e `Human reply synced`.

---

### Teste 2 — Bot responde: não duplicar

1. Atribua a conversa ao **bot** (ou ao usuário configurado em `agent_assignee_id`).
2. Cliente envia mensagem.
3. O bot responde (via IA ou follow-up).
4. O webhook outgoing da resposta do bot chega.

**Esperado:** Resposta `ignored` com `"Outgoing — mensagem do bot, não processar"`. A mensagem do bot já foi salva pelo fluxo de delivery; não deve haver duplicata.

---

### Teste 3 — Deduplicação (retry do Chatwoot)

1. Com humano atribuído, o atendente envia uma mensagem.
2. O Chatwoot pode reenviar o webhook em caso de retry.

**Esperado:** Primeira chamada → `saved_no_ai`. Segunda (duplicata) → `ignored_duplicate`.

---

### Teste 4 — Nota privada

1. No Chatwoot, o atendente envia uma **nota privada** (visível só para a equipe).

**Esperado:** Resposta `ignored` com `"Private note"`. A nota não deve aparecer na conversa do cliente no Nexus.

---

## Opção B: Simular payloads com curl (desenvolvimento)

Use um `agent_id` real do seu banco. Ajuste `AGENT_ID` e `CHATWOOT_CONV_ID` conforme necessário.

### Base URL

```bash
BASE="http://localhost:3001/api"
```

### Teste 1a — Incoming (cliente) com humano atribuído

```bash
curl -X POST "$BASE/webhooks?agent_id=SEU_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_created",
    "id": 1001,
    "content": "Olá, preciso de ajuda",
    "message_type": "incoming",
    "private": false,
    "conversation": {
      "id": 5001,
      "channel": "Channel::Whatsapp",
      "meta": { "sender": { "phone_number": "5511999999999" } },
      "assignee": { "id": 15, "name": "João Atendente" }
    },
    "contact": { "id": 101, "name": "Cliente Teste", "phone_number": "5511999999999" }
  }'
```

**Esperado:** `saved_no_ai` ou `queued` (dependendo do assignee). Mensagem salva como `user`.

---

### Teste 1b — Outgoing (humano) — resposta do atendente

```bash
curl -X POST "$BASE/webhooks?agent_id=SEU_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_created",
    "id": 1002,
    "content": "Olá! Em que posso ajudar?",
    "message_type": "outgoing",
    "private": false,
    "conversation": {
      "id": 5001,
      "channel": "Channel::Whatsapp",
      "assignee": { "id": 15, "name": "João Atendente" }
    },
    "contact": { "id": 101, "name": "Cliente Teste", "phone_number": "5511999999999" }
  }'
```

**Esperado:** `saved_no_ai` com `"Human reply synced"`. Mensagem salva como `assistant`.

**Importante:** O `assignee.id` (15) deve ser **diferente** do `agent_assignee_id` do agente (que é o ID do bot). Caso contrário, será ignorado.

---

### Teste 2 — Outgoing do bot (ignorar)

Use o mesmo payload acima, mas com `assignee.id` igual ao `agent_assignee_id` configurado no agente.

**Esperado:** `ignored` — `"Outgoing — mensagem do bot, não processar"`.

---

### Teste 3 — Deduplicação

Envie o mesmo payload do Teste 1b **duas vezes** (mesmo `id` da mensagem).

**Esperado:** Primeira → `saved_no_ai`. Segunda → `ignored_duplicate`.

---

### Teste 4 — Nota privada

```bash
curl -X POST "$BASE/webhooks?agent_id=SEU_AGENT_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "message_created",
    "id": 1003,
    "content": "Nota interna da equipe",
    "message_type": "outgoing",
    "private": true,
    "conversation": { "id": 5001, "assignee": { "id": 15 } },
    "contact": { "id": 101, "phone_number": "5511999999999" }
  }'
```

**Esperado:** `ignored` — `"Private note"`.

---

## Onde verificar as mensagens

1. **Interface:** Chat ao Vivo ou Conversas → selecione o agente → abra o contato (por nome ou `external_user_id`).
2. **Banco de dados:** Tabela `{tenant_schema}.messages` — filtrar por `conversation_id` e ver `role` (user/assistant) e `content`.
3. **Logs do servidor:** Terminal onde o server está rodando — buscar `[Webhook]`, `saved_no_ai`, `Human reply synced`, `ignored`.

---

## Checklist rápido

| Cenário                    | Resultado esperado                          |
|---------------------------|---------------------------------------------|
| Incoming + humano atribuído | user salvo, `saved_no_ai`                   |
| Outgoing + humano atribuído | assistant salvo, `Human reply synced`       |
| Outgoing + bot atribuído    | `ignored` (mensagem do bot)                |
| Retry (mesmo eventMessageId)| `ignored_duplicate`                         |
| Nota privada                | `ignored` (Private note)                   |
