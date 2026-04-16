# API de Integracao - Outro Projeto (PPL Motors)

Este documento foi preparado para facilitar a integracao de um projeto externo com a API do Boom IA, com foco em inventario de veiculos e autenticacao.

## 1) Base URL e padrao de rotas

- Base API: `https://SEU-DOMINIO-API/api`
- Health geral: `https://SEU-DOMINIO-API/health`
- Health Nexus/Supabase: `https://SEU-DOMINIO-API/api/health/nexus`

Exemplo:

- Producao: `https://api.seudominio.com/api`
- Local: `http://localhost:3001/api`

## 2) Autenticacao (obrigatorio na maioria das rotas)

## 2.1 Como a API valida autenticacao

O backend valida token JWT do Supabase (mesmo projeto configurado em `NEXUS_DB_URL`) por:

- Header principal: `Authorization: Bearer <JWT_DO_USUARIO>`
- Header alternativo: `x-nexus-auth: <JWT_DO_USUARIO>` ou `x-nexus-auth: Bearer <JWT_DO_USUARIO>`

Regra recomendada para integracoes:

- Use sempre `Authorization: Bearer <token>`
- Use `x-nexus-auth` apenas quando houver requisito especifico (ex.: alguns jobs internos/cron)

## 2.2 Como obter o token JWT para usar na API

Opcao mais comum para projeto externo (server-to-server com usuario tecnico):

1. Criar um usuario tecnico no Supabase Auth (ex.: `integracao-ppl@...`)
2. Adicionar memberships corretas desse usuario no tenant alvo (`tenant_memberships`)
3. Fazer login no Supabase Auth e usar `access_token` retornado

Exemplo de login direto no Supabase Auth:

```bash
curl -X POST "https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/token?grant_type=password" \
  -H "apikey: <SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "integracao-ppl@empresa.com",
    "password": "SENHA_FORTE"
  }'
```

Resposta (resumo):

```json
{
  "access_token": "<JWT>",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "bearer"
}
```

Depois, chamar API:

```bash
curl -X GET "https://SEU-DOMINIO-API/api/inventory?tenant_id=<TENANT_ID>" \
  -H "Authorization: Bearer <JWT>"
```

## 2.3 Permissoes e escopo (muito importante)

A API aplica autorizacao por papel/membership:

- `superadmin`: acesso total
- `tenant_admin`: gerencia recursos do tenant
- `tenant_user`: acesso de leitura conforme regras

Erros comuns:

- `401 unauthorized`: token ausente/invalido/expirado
- `403 forbidden_tenant_access`: usuario autenticado, mas sem permissao no tenant
- `403 module_disabled`: modulo (ex.: inventory) desativado no tenant

## 2.4 Quando usar `x-nexus-auth` com service role

Alguns fluxos aceitam `x-nexus-auth` como chave de backend/cron.

Exemplo conhecido:

- `POST /api/inventory/sync` pode ser chamado por cron com `x-nexus-auth`, sem auth de usuario

Atencao:

- `service_role` deve ficar somente em backend seguro (nunca frontend/browser)
- nao expor em app cliente publico

---

## 3) Endpoints principais para integracao de inventario

Prefixo abaixo: `/api`

## 3.1 Listar inventario

- Metodo: `GET`
- Rota: `/inventory`
- Auth: `Authorization Bearer`
- Query params:
  - `tenant_id` (string, recomendado)
  - `status` (string, ex.: `available`, `sold`)
  - `search` (string)
  - `limit` (string numerica, max 500)
  - `offset` (string numerica)

Exemplo:

```bash
curl -X GET "https://SEU-DOMINIO-API/api/inventory?tenant_id=<TENANT_ID>&status=available&limit=50&offset=0&search=corolla" \
  -H "Authorization: Bearer <JWT>"
```

Resposta (resumo):

```json
{
  "data": [
    {
      "id": "uuid",
      "external_id": "12345",
      "tenant_id": "uuid",
      "brand": "Toyota",
      "model": "Corolla",
      "version": "XEi",
      "year": 2022,
      "price": 125900,
      "mileage": 28000,
      "status": "available",
      "photos": "[\"https://...\"]"
    }
  ],
  "total": 1
}
```

## 3.2 Criar veiculo manualmente

- Metodo: `POST`
- Rota: `/inventory`
- Auth: `Authorization Bearer`
- Papel recomendado: `tenant_admin`

Body exemplo:

```json
{
  "tenant_id": "<TENANT_ID>",
  "brand": "Honda",
  "model": "Civic",
  "version": "Touring",
  "year": 2021,
  "price": 139900,
  "mileage": 32000,
  "color": "Preto",
  "transmission": "Automatico",
  "fuel_type": "Flex",
  "photo_url": "https://...",
  "photos": ["https://.../1.jpg", "https://.../2.jpg"],
  "detail_url": "https://...",
  "description": "sedan",
  "status": "available",
  "video_details": "https://..."
}
```

## 3.3 Atualizar veiculo

- Metodo: `PATCH`
- Rota: `/inventory/:id`
- Auth: `Authorization Bearer`
- Papel recomendado: `tenant_admin`

Exemplo:

```bash
curl -X PATCH "https://SEU-DOMINIO-API/api/inventory/<ID>" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "price": 129900, "status": "available" }'
```

## 3.4 Remover veiculo

- Metodo: `DELETE`
- Rota: `/inventory/:id`
- Auth: `Authorization Bearer`
- Papel recomendado: `tenant_admin`

## 3.5 Sincronizar inventario (scraping)

- Metodo: `POST`
- Rota: `/inventory/sync`
- Auth:
  - Usuario autenticado com permissao de gestao no tenant, ou
  - `x-nexus-auth` (fluxo cron/backend)
- Body opcional:
  - `tenant_id` (se omitido, usa tenant default PPL Motors configurado na rota)

Exemplo com usuario:

```bash
curl -X POST "https://SEU-DOMINIO-API/api/inventory/sync" \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{ "tenant_id": "<TENANT_ID>" }'
```

Exemplo com cron/service key:

```bash
curl -X POST "https://SEU-DOMINIO-API/api/inventory/sync" \
  -H "x-nexus-auth: <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{ "tenant_id": "<TENANT_ID>" }'
```

## 3.6 Video probe (tamanho/modo de envio)

- Metodo: `POST`
- Rota: `/inventory/video-probe`
- Auth: `Authorization Bearer`

Body:

```json
{
  "tenant_id": "<TENANT_ID>",
  "url": "https://.../video.mp4"
}
```

---

## 4) Lista completa de rotas do backend (catalogo atual)

## 4.1 Infra/saude

- `GET /health`
- `GET /api/health/nexus`
- `ALL /api/supabase-proxy/*`

## 4.2 Chat

- `POST /api/chat`
- `POST /api/chat-local`

## 4.3 Inventory

- `GET /api/inventory`
- `POST /api/inventory`
- `PATCH /api/inventory/:id`
- `DELETE /api/inventory/:id`
- `POST /api/inventory/sync`
- `POST /api/inventory/video-probe`

## 4.4 Queue e lembretes

- `GET /api/queue/followups/list`
- `POST /api/queue/process`
- `POST /api/queue/followups`
- `GET /api/queue/reminders/list`
- `POST /api/queue/reminders`

## 4.5 Webhooks e entrega

- `POST /api/webhooks`
- `POST /api/delivery/send`

## 4.6 Tools

- `POST /api/tools/fipe`
- `POST /api/tools/nearest-unit`
- `POST /api/tools/test`

## 4.7 RAG

- `POST /api/rag/ingest-vicentim`

## 4.8 Calendar services

- `GET /api/calendar-services`
- `POST /api/calendar-services`
- `PUT /api/calendar-services/:id`
- `DELETE /api/calendar-services/:id`

## 4.9 Admin

- `POST /api/admin/clear-conversations`
- `POST /api/admin/provider-keys`
- `POST /api/admin/prompts`
- `GET /api/admin/prompts`
- `GET /api/admin/tenants`
- `POST /api/admin/tenants`
- `DELETE /api/admin/tenants/:id`
- `GET /api/admin/users`
- `POST /api/admin/users`
- `PATCH /api/admin/users/:id`

## 4.10 CRM contacts

- `GET /api/crm-contacts`
- `POST /api/crm-contacts`
- `POST /api/crm-contacts/import`
- `GET /api/crm-contacts/:id`
- `PATCH /api/crm-contacts/:id`
- `DELETE /api/crm-contacts/:id`
- `GET /api/crm-contacts/:id/invoices`
- `POST /api/crm-contacts/:id/invoices`
- `PATCH /api/crm-contacts/:contactId/invoices/:invoiceId`
- `DELETE /api/crm-contacts/:contactId/invoices/:invoiceId`
- `GET /api/crm-contacts/:id/conversation-preview`
- `POST /api/crm-contacts/sync-from-conversations`
- `GET /api/crm-contacts/:id/summary`
- `GET /api/crm-contacts/:id/packages`
- `POST /api/crm-contacts/:id/packages`
- `PATCH /api/crm-contacts/:contactId/packages/:packageId`
- `DELETE /api/crm-contacts/:contactId/packages/:packageId`
- `GET /api/crm-contacts/:id/appointments`
- `POST /api/crm-contacts/:id/appointments`
- `DELETE /api/crm-contacts/:contactId/appointments/:eventId`
- `POST /api/crm-contacts/merge-duplicates`

## 4.11 Occurrences (registo de ocorrencias)

Ligado ao inventario (`inventory_id`). Autenticacao `Authorization Bearer`. Modulo `occurrences` em `tenant_modules`.

- `GET /api/occurrences` — query: `tenant_id` (obrigatorio para nao-superadmin), `inventory_id`, `status`, `severity`, `search`, `limit`, `offset`
- `GET /api/occurrences/:id`
- `POST /api/occurrences` — corpo: `tenant_id`, `inventory_id`, `title`, `description?`, `status?`, `severity?`, `occurred_at?`, `contact_id?`, `location_type?`, `location_detail?`, `odometer_km?`, `photo_urls?` (array de strings, URLs publicas; ate 15 entradas, cada uma ate 2048 caracteres; omitir ou `[]` = sem fotos) (requer `tenant_admin` / gestao do tenant)
- `PATCH /api/occurrences/:id` — campos opcionais (gestao), incl. `photo_urls` (substitui a lista inteira; `[]` limpa)
- `DELETE /api/occurrences/:id` — gestao

**ACL opcional:** se existir pelo menos uma linha em `occurrence_module_acl` para o `tenant_id`, apenas os `user_id` listados acedem (`can_view` / `can_manage`). Sem linhas na ACL, mantem-se acesso por membership do tenant (como no inventario).

## 4.12 Contacts (operacional/legado)

- `POST /api/contacts/new`
- `POST /api/contacts/send-operator-message`
- `POST /api/contacts/add-label`

## 4.13 Demo

- `GET /api/demo/public-agent-info`

---

## 5) Boas praticas de integracao para o outro projeto

- Sempre enviar `tenant_id` explicitamente nas rotas multi-tenant.
- Implementar renovacao de token (refresh) antes de expirar.
- Tratar `401` com novo login/refresh.
- Tratar `403` como falta de permissao (nao adianta retry sem ajustar role/membership).
- Nao usar `service_role` em frontend.
- Criar usuario tecnico dedicado para integracao externa.
- Logar `x-request-id` no cliente (se houver no gateway/proxy) para troubleshooting.

---

## 6) Checklist rapido para liberar a integracao

1. Definir URL final da API (`API_BASE_URL`)
2. Criar usuario tecnico no Supabase
3. Associar usuario ao tenant da PPL Motors com role correta
4. Validar `GET /api/inventory` com token desse usuario
5. Validar escrita (`POST/PATCH`) se o caso de uso precisar
6. Definir se `sync` sera manual, cron interno ou ambos
7. Publicar segredos em cofre (nunca hardcode)

---

## 7) Contato entre times (sugestao)

Ao enviar para o outro time, compartilhe:

- Este documento
- `tenant_id` alvo
- URL de ambiente (homolog/prod)
- Credencial tecnica (email do usuario tecnico; senha por canal seguro)
- Escopo de rotas que eles vao consumir primeiro (recomendado: apenas inventory no inicio)
