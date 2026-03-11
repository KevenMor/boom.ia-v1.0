# Por que um follow-up foi cancelado em vez de enviado?

O processamento dos follow-ups (rota `POST /api/queue/followups`, chamada a cada 60s pelo cron) pode **cancelar** um item em vez de enviar. Abaixo estão **todas as causas** de cancelamento, na ordem em que são verificadas.

---

## 1. Agente não encontrado
- **Condição:** O `agent_id` do item não existe na tabela `agents`.
- **Ação:** Status → `cancelled`.
- **No seu caso:** Improvável se o agente existe e está em uso.

---

## 2. Agente inativo
- **Condição:** `agents.status === "inactive"`.
- **Ação:** Status → `cancelled`.
- **No seu caso:** Verifique no painel se o agente está **Ativo** ou **Teste**, e não **Inativo**.

---

## 3. Horário de silêncio (quiet hours)
- **Condição:** Hora atual (Brasília) dentro do intervalo `followup_quiet_start`–`followup_quiet_end` (ex.: 23h–7h).
- **Ação:** Item **não** é cancelado; fica para a próxima rodada (apenas **skipped**).
- **No seu caso:** Se o follow-up era de dia, não é essa a causa.

---

## 4. Modo teste + assignee no Chatwoot (CENÁRIO 3)
- **Condição:** Agente com `status === "test"` **e** a conversa no Chatwoot tem um assignee **diferente** de `config.test_assignee_id`.
- **Ação:** Status → `cancelled`.
- **No seu caso:** Se o agente está em **Teste**, a conversa no Chatwoot precisa estar atribuída ao usuário configurado em **test_assignee_id**. Se estiver atribuída a outro usuário (ou a ninguém e `test_assignee_id` está preenchido), o follow-up é cancelado.

---

## 5. Conversa com humano atribuído (CENÁRIO 2) — causa muito provável
- **Condição:** Agente **ativo** (`status === "active"`) **e** a API do Chatwoot retorna que a conversa tem **assignee** (qualquer ID).
- **Ação:** Status → `cancelled`. A lógica assume: “conversa com atendente humano → não mandar follow-up automático”.
- **Problema:** No Chatwoot, muitas contas têm **assignee padrão** (ex.: “Bot”, “Inbox” ou um usuário). Nesses casos, **sempre** há `meta.assignee.id`. O código não diferencia “humano” de “bot”; qualquer assignee cancela.
- **No seu caso:** Se o cliente não interagiu e mesmo assim foi cancelado, é muito provável que a conversa no Chatwoot tivesse um assignee (até mesmo um “bot” ou inbox). Ao rodar o follow-up, o servidor viu `currentAssigneeId` preenchido e cancelou.

**O que fazer:**
- No Chatwoot, abra a conversa e veja **Quem está atribuído**.
- Se quiser que follow-ups sejam enviados mesmo com assignee (ex.: assignee “Bot”), será preciso ajustar o código (ex.: ignorar certos `assignee_id` ou não cancelar quando for um usuário “bot”).

---

## 6. Agendamento “confirmado” no histórico (CENÁRIO 1)
- **Condição:** Existe pelo menos uma mensagem **do assistente** no histórico da conversa cujo texto dá match no regex:  
  `confirmad[oa]|agendad[oa]|marcad[oa]|appointment.*confirm`
- **Ação:** Status → `cancelled` (evitar follow-up após “já agendamos”).
- **No seu caso:** Se em algum momento o bot disse algo como “sua consulta está **agendada**” ou “**confirmado**” (mesmo em outro contexto), esse follow-up é cancelado. Pode ser um falso positivo se a palavra aparecer em outra frase.

---

## 7. Última mensagem é do usuário (CENÁRIO “user replied”)
- **Condição:** No histórico carregado por `load_conversation_messages`, a **última** mensagem tem `role === "user"`.
- **Ação:** Status → `cancelled` (interpretação: “cliente já respondeu, não mandar follow-up”).
- **No seu caso:** Você disse que o cliente **não** interagiu. Então, em tese, a última mensagem deveria ser do assistente. Possíveis explicações:
  - **Ordem/sincronia:** a mensagem do usuário que gerou a última resposta do bot foi salva **depois** da resposta do assistente no banco (ex.: atraso no webhook), então no momento em que o cron rodou a “última” mensagem ainda era a do usuário.
  - **Conversa recém-aberta:** você enviou uma mensagem agora; se essa mensagem foi salva como “user” e o bot ainda não respondeu (ou a resposta ainda não foi salva), a última mensagem continua sendo “user” e o follow-up das 12:30 pode ser cancelado por esse motivo quando o cron rodar.

---

## Resumo para o seu caso

- **Causa mais provável do cancelamento anterior:** **CENÁRIO 2** — conversa no Chatwoot com assignee (qualquer um), fazendo o código cancelar o follow-up mesmo sem interação do cliente.
- **Para o follow-up das 12:30:**
  1. Confirme no Chatwoot se a conversa está **sem assignee** ou com um assignee que você queira que “não cancele” (aí precisamos de ajuste no código).
  2. Confirme que o agente está **Ativo** ou **Teste** (e, se Teste, que o assignee da conversa é o `test_assignee_id`).
  3. Veja nos **logs do servidor** no horário em que o cron rodar (ex.: `[FollowUp] Human assigned` ou `[FollowUp] Appointment confirmed` ou `last message is from user`) para ver exatamente qual regra cancelou.

---

**Tenants:** Follow-ups e Lembretes funcionam para todos os tenants (existentes e novos). Ver `docs/TENANT-ONBOARDING.md`.

---

Se quiser, no próximo passo podemos:
- adicionar um **motivo de cancelamento** na tabela/API (ex.: `cancel_reason`) para aparecer na página de follow-ups, ou
- **afrouxar o CENÁRIO 2** (ex.: não cancelar quando o assignee for um ID “bot” configurável).
