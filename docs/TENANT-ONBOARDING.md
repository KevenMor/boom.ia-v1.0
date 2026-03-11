# Onboarding de Tenants — Follow-ups e Lembretes

Documentação para garantir que **tenants existentes e novos** tenham Follow-ups e Lembretes de Agendamento funcionando corretamente.

---

## O que funciona automaticamente (todos os tenants)

| Recurso | Tenants existentes | Tenants novos |
|---------|--------------------|---------------|
| **Página Follow-ups e Lembretes** | ✅ Aparece no seletor | ✅ Aparece no seletor após criação |
| **Fila de Follow-ups** | ✅ Lista por tenant_id | ✅ Lista por tenant_id |
| **Fila de Lembretes** | ✅ Lista por tenant_id | ✅ Lista por tenant_id |
| **Processamento (cron)** | ✅ Processa todos | ✅ Processa todos |
| **Motivo quando não enviado** | ✅ skip_reason / cancel_reason | ✅ skip_reason / cancel_reason |

**Conclusão:** Não é necessário configurar nada para que um tenant novo apareça e funcione na página de Follow-ups e Lembretes. O filtro usa `tenant_id`, que todo tenant possui.

---

## Prompts customizados (opcional)

Os prompts (system, dispatcher, follow-up) podem ser **customizados por tenant** via registry em `server/src/services/prompts/registry.ts`.

### Tenants sem registro

Quando o **slug** do tenant não está no registry:

- **System prompt:** usa o `system_prompt` do agente (banco)
- **Dispatcher:** usa `DEFAULT_DISPATCHER_PROMPT`
- **Follow-up:** usa prompt genérico padrão

Ou seja, tenants novos funcionam sem registro.

### Tenants com registro (prompts customizados)

Para um tenant com prompts específicos (ex.: Dr. Iuri, PPL Motors):

1. Criar arquivo em `server/src/services/prompts/` (ex.: `meu-tenant.ts`)
2. Exportar `SYSTEM_PROMPT`, `COMMUNICATION_RULES`, `DISPATCHER_PROMPT`, `FOLLOWUP_PROMPT`
3. Registrar em `registry.ts`:

```ts
"meu-tenant-slug": {
  systemPrompt: MEU_SYSTEM,
  communicationRules: MEU_COMM_RULES,
  dispatcherPrompt: MEU_DISPATCHER,
  followupPrompt: MEU_FOLLOWUP,
  version: "v1.0",
  description: "Assistente Meu Tenant",
},
```

O **slug** deve ser o mesmo usado na criação do tenant (ex.: `dr-iuri`, `ppl-motors`).

---

## Checklist para novo tenant

- [ ] Tenant criado (Tenants → Novo Tenant)
- [ ] Agente(s) criado(s) para o tenant
- [ ] (Opcional) Prompts customizados → registrar em `registry.ts`
- [ ] Follow-ups: configurar em EditAgent → Follow-up Automático
- [ ] Lembretes: configurar em EditAgent → Lembrete de Agendamento
- [ ] Página Follow-ups e Lembretes: selecionar o tenant e conferir as abas

---

## Arquivos relevantes

- **Registry:** `server/src/services/prompts/registry.ts`
- **Queue (follow-ups + lembretes):** `server/src/routes/queue.ts`
- **Página:** `src/pages/FollowUpsPage.tsx`
- **Migration skip_reason:** `sql/017_appointment_reminders_skip_reason.sql`
