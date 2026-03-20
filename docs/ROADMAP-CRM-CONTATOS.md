# Roadmap — CRM de Contatos

Página de gestão de contatos estilo CRM, com cadastro, importação/exportação em planilha e dados de faturas/recorrência.

---

## Visão geral

| Fase | Descrição | Status |
|------|-----------|--------|
| **1** | Banco + API + Página básica (CRUD) | ✅ Implementado |
| **2** | Import/Export (xlsx, csv) | ⬜ Pendente |
| **3** | Faturas e recorrência | ⬜ Pendente |
| **4** | Marcação automática de status do lead pelo agente | ⬜ Pendente |

---

## Fase 1 — Base (CRUD)

### 1.1 Banco de dados

**Tabela `public.contacts`**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `tenant_id` | UUID | FK → tenants |
| `name` | TEXT | Nome completo |
| `email` | TEXT | E-mail |
| `phone` | TEXT | Telefone (WhatsApp) |
| `cpf_cnpj` | TEXT | CPF ou CNPJ |
| `address` | TEXT | Endereço |
| `city` | TEXT | Cidade |
| `state` | TEXT | Estado (UF) |
| `zip_code` | TEXT | CEP |
| `notes` | TEXT | Observações |
| `metadata` | JSONB | Dados extras |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

- Índices: `tenant_id`, `email`, `phone`, `name`
- RLS: authenticated pode CRUD; filtro por tenant

### 1.2 API (server)

- `GET /api/crm-contacts` — lista (tenant_id, search, limit, offset)
- `POST /api/crm-contacts` — criar
- `PATCH /api/crm-contacts/:id` — atualizar
- `DELETE /api/crm-contacts/:id` — remover

Arquivo: `server/src/routes/crm-contacts.ts` (novo, separado do `contacts.ts` atual que é para envio de mensagens).

### 1.3 Frontend

- Página `/contacts` (ou `/crm-contacts`)
- Hook `useContacts` (list, create, update, delete)
- Componentes: `ContactsPage`, `CreateContactDialog`, `EditContactDialog`, `DeleteContactDialog`
- Sidebar: item "Contatos" em "Visão geral"
- Padrão: seguir `InventoryPage` e `useInventory`

---

## Fase 2 — Import/Export

### 2.1 Export

- Botão "Exportar" na página
- Formato: **CSV** e **XLSX**
- Colunas: name, email, phone, cpf_cnpj, address, city, state, zip_code, notes
- Dependências: `xlsx` (SheetJS) no frontend para gerar xlsx; CSV via `Blob` nativo

### 2.2 Import

- Botão "Importar" → modal com upload
- Aceitar: `.csv`, `.xlsx`
- Validação: colunas esperadas (nome obrigatório)
- Preview antes de confirmar
- Inserção em lote (batch)
- API: `POST /api/crm-contacts/import` com multipart ou JSON (array de linhas)

---

## Fase 3 — Faturas e recorrência

### 3.1 Tabela `public.contact_invoices`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `contact_id` | UUID | FK → contacts |
| `amount` | NUMERIC(12,2) | Valor |
| `due_date` | DATE | Vencimento |
| `paid_at` | TIMESTAMPTZ | Data do pagamento |
| `status` | TEXT | pending, paid, overdue, cancelled |
| `description` | TEXT | Descrição |
| `metadata` | JSONB | Dados extras |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 3.2 Tabela `public.contact_recurrence`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `contact_id` | UUID | FK → contacts |
| `type` | TEXT | monthly, yearly, custom |
| `amount` | NUMERIC(12,2) | Valor recorrente |
| `day_of_month` | INTEGER | Dia do mês (1–31) |
| `description` | TEXT | Descrição |
| `active` | BOOLEAN | Ativo ou pausado |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### 3.3 UI

- Aba ou seção "Faturas" no detalhe do contato
- Aba ou seção "Recorrência" no detalhe do contato
- Listagem de faturas pendentes na página principal (opcional)

---

## Fase 4 — Marcação automática de status do lead pelo agente

A coluna **Status** na página de Leads exibe `metadata.lead_status` do contato (ex.: new, prospect, qualified, closed). Hoje o agente pode chamar a ferramenta `marcar_lead`, que aplica etiqueta no Chatwoot, mas **não** atualiza o contato no CRM.

### 4.1 Objetivo

Permitir que o agente atualize automaticamente o status do lead na tabela `contacts` (campo `metadata.lead_status`), para que a coluna Status na página de Leads reflita o estágio do funil.

### 4.2 Abordagem sugerida

**Estender a ferramenta `marcar_lead`** para aceitar parâmetro opcional `status` e, ao ser chamada:

1. Manter o comportamento atual: aplicar etiqueta no Chatwoot (leadsDD-MM-AAAA)
2. **Novo:** localizar o contato em `contacts` por `tenant_id` + telefone da conversa
3. **Novo:** atualizar `metadata.lead_status` com o valor informado (ou `new` por padrão)

Valores de status: `new`, `prospect`, `lead`, `qualified`, `closed`.

### 4.3 Arquivos a alterar

| Arquivo | Alteração |
|---------|-----------|
| `server/src/services/tool-executor.ts` | Em `executeMarcarLead`: buscar contato por tenant+phone, atualizar `metadata` |
| `server/src/services/crm-contact-sync.ts` | Função auxiliar para atualizar metadata do contato (ou reutilizar upsert) |
| `server/src/routes/chat-local.ts` | Atualizar `function_def` de `marcar_lead` para incluir parâmetro `status` opcional |
| Prompts do agente | Instruir o agente a passar `status` quando apropriado (ex.: qualified ao fechar, closed ao concluir) |

### 4.4 Pré-requisitos

- Agente com `lead_label_enabled` e Chatwoot configurado
- Contato já existir em `contacts` (cadastrado via webhook/sync ou manualmente)

---

## Ordem de execução sugerida

1. **Fase 1** — Base funcional para validar fluxo
2. **Fase 2** — Import/Export para operação em massa
3. **Fase 3** — Faturas e recorrência para casos de uso financeiro
4. **Fase 4** — Marcação automática de status do lead pelo agente

---

## Arquivos a criar/alterar

| Tipo | Arquivo |
|------|---------|
| Migration | `supabase/migrations/YYYYMMDD_create_crm_contacts.sql` |
| API | `server/src/routes/crm-contacts.ts` |
| Types | `src/types/database.ts` (Contact, ContactInvoice, ContactRecurrence) |
| Hook | `src/hooks/useContacts.ts` |
| Page | `src/pages/ContactsPage.tsx` |
| Dialogs | `src/components/contacts/CreateContactDialog.tsx`, etc. |
| App | `src/App.tsx` (rota), `src/components/layout/AppSidebar.tsx` (nav) |
| Server index | `server/src/index.ts` (registrar rotas) |

---

## Cadastro automático (webhook / Chat ao Vivo)

Quando um cliente envia mensagem via WhatsApp (webhook Chatwoot) ou aparece no Chat ao Vivo, o contato é **cadastrado automaticamente** no CRM:

- **Webhook** (`webhooks.ts`): após `find_or_create_webhook_conversation`, chama `upsertCrmContact`
- **Queue** (`queue.ts`): ao processar mensagem, chama `upsertCrmContact` com tenant_id, phone, name
- **Serviço** (`crm-contact-sync.ts`): normaliza telefone (55 + DDD), evita duplicatas por (tenant_id, phone)

---

## Validação por fase

- [x] **Fase 1**: Criar contato, editar, excluir, listar com filtro por tenant
- [ ] **Fase 2**: Exportar CSV e XLSX; importar CSV e XLSX com preview
- [ ] **Fase 3**: Cadastrar fatura e recorrência por contato; listar faturas
- [ ] **Fase 4**: Agente chama `marcar_lead` com `status` e contato no CRM é atualizado; coluna Status reflete o valor
