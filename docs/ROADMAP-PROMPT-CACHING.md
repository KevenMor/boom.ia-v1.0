# Roadmap — Prompt Caching (Redução de custo de input tokens)

Otimizações de prompt caching para reduzir custo de input tokens no chat-local, aproveitando cache automático da OpenAI e implícito do Gemini.

**Status:** ✅ Parcialmente implementado — Auto Escola Ideal (ideal, autoescola-ideal, auto-escola-ideal)

---

## Visão geral

| Fase | Descrição | Status |
|------|-----------|--------|
| **1** | Reestruturar prompts para prefixo estável | ✅ Implementado (Auto Escola Ideal) |
| **2** | OpenAI: prompt_cache_key | ✅ Implementado |
| **3** | Gemini: garantir prefixo estável | ✅ dateContext simplificado |
| **4** | Monitoramento de cached_tokens | ⬜ Pendente |
| **5** | UI: checkbox em EditTenant para outros tenants | ⬜ Pendente |

---

## Contexto

O chat-local envia prompts com estrutura que prejudica o cache:

- **Dispatcher (OpenAI)**: system inclui hints dinâmicos (entityHint, cepHint, assignHint, schedulingHint) que mudam a cada request.
- **Conversacional (Gemini)**: system inclui `dateContext` com hora exata (muda a cada minuto) e `petContext` (muda por conversa).

Para cache funcionar, o prefixo do prompt precisa ser idêntico entre requests. Conteúdo estático no início, variável no final.

---

## Fase 1 — Reestruturar prompts

### 1.1 Dispatcher

- Manter no system: `getDispatcherPrompt` + `dispatcherDateContext` (data do dia).
- Mover hints para a última mensagem user como bloco `[CONTEXTO]`.

### 1.2 Conversacional

- Simplificar `dateContext`: usar apenas data do dia (hoje/amanhã), não hora exata.
- Ou mover hora para mensagem user variável se necessário em agendamentos.
- Mover `petContext` para primeira mensagem user (fluxo Pet Home).

### 1.3 Arquivos

- `server/src/routes/chat-local.ts`
- `server/src/services/prompts/registry.ts`

---

## Fase 2 — OpenAI prompt_cache_key

Adicionar `prompt_cache_key` nos requests ao Dispatcher para melhorar roteamento de cache:

```javascript
prompt_cache_key: `agent:${agent_id}:tenant:${tenantSlug}:date:${todayISO}`
```

---

## Fase 3 — Gemini

Com as mudanças da Fase 1, o prefixo (system prompt) fica estável. O cache implícito do Gemini tende a aproveitar melhor.

---

## Fase 4 — Monitoramento

- Incluir `cached_tokens` no payload de `token_usage` enviado ao frontend.
- Exibir no DebugBlock quando houver tokens cacheados.

---

## Riscos (considerar antes de implementar)

1. **Hints na última mensagem**: o modelo pode dar menos peso a instruções em user vs system. Testar em sandbox/staging.
2. **Data sem hora**: fluxos de agendamento ("daqui 2 horas") podem ser afetados. Manter hora em mensagem user se necessário.
3. **Feature flag**: usar `ENABLE_PROMPT_CACHING` para rollout gradual.

---

## Implementação atual (Auto Escola Ideal)

- **Tenants:** `ideal`, `autoescola-ideal`, `auto-escola-ideal` — otimização ativa por slug
- **Outros tenants:** definir `prompt_caching_enabled: true` em `tenant.settings` (via SQL ou UI futura)
- **Dispatcher:** hints movidos para última mensagem user; system prompt estável
- **Conversacional:** `buildSystemPrompt` com `useSimplifiedDateContext` — data do dia sem hora
- **OpenAI:** `prompt_cache_key` adicionado para melhor roteamento de cache

---

## Referências

- [OpenAI Prompt Caching](https://platform.openai.com/docs/guides/prompt-caching)
- [Gemini Context Caching](https://ai.google.dev/gemini-api/docs/caching)
- Plano detalhado: `.cursor/plans/prompt_caching_boom_ia_*.plan.md`
