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
- **Condição:** Hora atual (Brasília) dentro do intervalo `followup_quiet_start`–`followup_quiet_end` (ex.: 22h–8h).
- **Ação:** Item **não** é cancelado; é **reagendado** para o próximo slot fora do silêncio (ex.: 08:XX do mesmo dia ou do dia seguinte, mantendo o minuto). O log mostra: `[FollowUp] REAGENDANDO item X: quiet hours — hora Brasília Yh → próximo slot <ISO>`.
- **Timezone:** A hora é sempre calculada em Brasília (America/Sao_Paulo) via `Intl`, mesmo com servidor em UTC.

---

## 4. Modo teste + assignee no Chatwoot (CENÁRIO 3)
- **Condição:** Agente com `status === "test"` **e** a conversa no Chatwoot tem um assignee **diferente** de `config.test_assignee_id`.
- **Ação:** Status → `cancelled`.
- **No seu caso:** Se o agente está em **Teste**, a conversa no Chatwoot precisa estar atribuída ao usuário configurado em **test_assignee_id**. Se estiver atribuída a outro usuário (ou a ninguém e `test_assignee_id` está preenchido), o follow-up é cancelado.

---

## 5. Conversa com humano atribuído (CENÁRIO 2)
- **Condição:** Agente **ativo** **e** `agent_assignee_id` configurado **e** assignee da conversa ≠ `agent_assignee_id`.
- **Ação:** Status → `cancelled` **exceto** quando o assignee for o **bot** (configurado em `agent_assignee_id`). A lógica anterior assumia: “conversa com atendente humano → não mandar follow-up automático”.
- **Solução:** Configure o **Assignee ID do agente (bot)** no painel do agente (quando status = Ativo). Esse é o ID do usuário no Chatwoot que representa o bot. Após a primeira mensagem, a IA atribui a conversa a esse ID. Quando o assignee da conversa for igual ao `agent_assignee_id`, o follow-up **é enviado normalmente**.
- **Problema (obsoleto):** No Chatwoot, muitas contas têm **assignee padrão** (ex.: “Bot”, “Inbox” ou um usuário). Nesses casos, **sempre** há `meta.assignee.id`. O código não diferencia “humano” de “bot”; qualquer assignee cancela.
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

## 8. Substituído por novo agendamento (schedule_followup)
- **Condição:** A função `schedule_followup` foi chamada (ex.: ao enviar a primeira mensagem ou ao agendar a próxima tentativa) e existiam follow-ups pendentes para a mesma conversa.
- **Ação:** Os pendentes são cancelados com `cancel_reason = 'superseded'` antes de inserir o novo.
- **No seu caso:** Pode ocorrer se houver duplicatas ou se um novo follow-up substitui um anterior (ex.: reagendamento).

---

## Resumo para o seu caso

- **Causa mais provável do cancelamento anterior:** **CENÁRIO 2** (corrigido em 2026-03: se `agent_assignee_id` não configurado, não cancela mais) ou **quiet hours** (skipped, não cancelado).
- **Para o follow-up das 12:30:**
  1. Confirme no Chatwoot se a conversa está **sem assignee** ou com um assignee que você queira que “não cancele” (aí precisamos de ajuste no código).
  2. Confirme que o agente está **Ativo** ou **Teste** (e, se Teste, que o assignee da conversa é o `test_assignee_id`).
  3. Veja nos **logs do servidor** no horário em que o cron rodar: `[FollowUp] CANCELLED item X: <motivo>` ou `[FollowUp] SKIPPED item X: quiet hours`.

---

**Tenants:** Follow-ups e Lembretes funcionam para todos os tenants (existentes e novos). Ver `docs/TENANT-ONBOARDING.md`.

---

Se quiser, no próximo passo podemos:
- adicionar um **motivo de cancelamento** na tabela/API (ex.: `cancel_reason`) para aparecer na página de follow-ups, ou
- **afrouxar o CENÁRIO 2** (ex.: não cancelar quando o assignee for um ID “bot” configurável).
