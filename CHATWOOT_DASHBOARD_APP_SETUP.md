# Chatwoot Dashboard App — BoomIA Setup Guide

## Overview

O Chatwoot Dashboard App permite integrar a interface BoomIA diretamente no painel do agente humano no Chatwoot. Quando uma conversa é aberta, um iframe mostra:

- **Contato**: dados CRM do cliente (nome, telefone, email, notas)
- **Histórico**: mensagens trocadas com o agente de IA do BoomIA
- **Follow-ups**: lembretes agendados pendentes

---

## Prerequisites

1. **BoomIA server** rodando em produção (ou staging)
2. **Agent token** gerado e configurado no BoomIA (descrito abaixo)
3. **Acesso administrativo ao Chatwoot**
4. O agent_id (UUID) do seu agente BoomIA

---

## Step 1: Gerar o Dashboard App Token no BoomIA

O token de segurança garante que apenas o Chatwoot autorizado possa acessar os dados via iframe.

### Option A: Via Supabase Studio (recomendado para rápido setup)

1. Abra o **Supabase Studio** → seu projeto
2. Vá para **SQL Editor**
3. Execute o seguinte comando (substitua os valores):

```sql
UPDATE agents
SET config = config || '{"dashboard_app_token":"seu_token_secreto_aqui"}'::jsonb
WHERE id = 'seu_agent_id_uuid_aqui';
```

**Exemplo:**
```sql
UPDATE agents
SET config = config || '{"dashboard_app_token":"chatwoot_secret_123abc"}'::jsonb
WHERE id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
```

### Option B: Via BoomIA Admin (quando implementado)

Edite o agent em `/agents/:agentId/edit` e procure por **"Token do Dashboard App (Chatwoot)"** na seção de integrações.

---

## Step 2: Construir a URL do Dashboard App

A URL do Chatwoot Dashboard App segue este padrão:

```
https://sua-url-boomia.com/chatwoot-app?agent_id=SEU_AGENT_ID&token=SEU_TOKEN_SECRET
```

**Componentes:**
- `sua-url-boomia.com` — domínio de produção do BoomIA (ex: `boom.empresa.com`)
- `agent_id` — UUID do agente BoomIA (ex: `f47ac10b-58cc-4372-a567-0e02b2c3d479`)
- `token` — token secreto que você gerou no Step 1 (ex: `chatwoot_secret_123abc`)

**Exemplo completo:**
```
https://boom.empresa.com/chatwoot-app?agent_id=f47ac10b-58cc-4372-a567-0e02b2c3d479&token=chatwoot_secret_123abc
```

---

## Step 3: Registrar o Dashboard App no Chatwoot

### Via Chatwoot UI

1. Acesse **Settings** → **Integrations** (ou **Administração** → **Integrações**)
2. Procure por **Dashboard Apps** (pode estar em "Customize"/"Custom")
3. Clique em **New Dashboard App** ou **+ Add**
4. Preencha:
   - **Name**: `BoomIA` (ou qualquer nome descritivo)
   - **URL**: Cole a URL completa do Step 2
   - **Target**: Escolha onde o app deve aparecer (geralmente "Conversation Window" ou "Sidebar")
5. Clique em **Create** / **Save**

### Via Chatwoot API (alternativa)

Se sua instância do Chatwoot estiver acessível via API:

```bash
curl -X POST https://seu-chatwoot.com/api/v1/accounts/1/dashboard_apps \
  -H "Content-Type: application/json" \
  -H "api_access_token: SEU_CHATWOOT_API_TOKEN" \
  -d '{
    "dashboard_app": {
      "name": "BoomIA",
      "content_type": "frame",
      "url": "https://boom.empresa.com/chatwoot-app?agent_id=f47ac10b-58cc-4372-a567-0e02b2c3d479&token=chatwoot_secret_123abc"
    }
  }'
```

---

## Step 4: Teste a Integração

1. Abra uma conversa no Chatwoot (em qualquer inbox)
2. O iframe do BoomIA deve aparecer no painel (geralmente sidebar direita ou abaixo das mensagens)
3. Você deve ver:
   - Abas: **Contato** | **Histórico** | **Follow-ups** (se houver)
   - Dados do contato carregados
   - Histórico de mensagens da IA
4. Se vê "Aguardando dados da conversa..." → o Chatwoot não enviou a mensagem postMessage corretamente
5. Se vê "Conversa ainda não processada..." → nenhuma conversa BoomIA foi associada a este ID do Chatwoot ainda (normal em primeiras conversas)

---

## Segurança

### Token Management

- O `dashboard_app_token` é armazenado em `agents.config` (JSONB) no Supabase
- **Não exponha o token em URLs públicas** — use apenas em configurações privadas do Chatwoot
- Se o token for comprometido, gere um novo:

```sql
UPDATE agents
SET config = config || '{"dashboard_app_token":"novo_token_aqui"}'::jsonb
WHERE id = 'seu_agent_id_uuid_aqui';
```

### Cross-Origin & Framing

O endpoint `/api/chatwoot-app/context` é público mas protegido por:
1. **Agent ID** — o agente deve existir e estar ativo
2. **Token** — deve corresponder ao `agents.config.dashboard_app_token`
3. **Chatwoot Conversation ID** — deve existir e estar associado ao agente

Sem todos os três, o endpoint retorna `{ found: false }`.

---

## Troubleshooting

| Sintoma | Causa Provável | Solução |
|---------|---|---|
| Iframe mostra "Aguardando dados da conversa..." | Chatwoot não enviou `postMessage` | Verifique se o Dashboard App foi registrado corretamente em Chatwoot |
| "Conversa ainda não processada" | A conversa no Chatwoot ainda não tem um histórico no BoomIA | Normal — aguarde o primeiro disparo do webhook ou envie uma mensagem |
| Erro 401 | Token inválido ou não configurado | Verifique o token no Supabase e a URL do Dashboard App |
| Erro 404 | Agent ID inválido | Copie o UUID correto do agent no BoomIA |
| Iframe em branco | URL mal formada | Teste a URL diretamente no navegador (sem o iframe) |

---

## Endpoints Reference

### GET `/api/chatwoot-app/context`

Retorna dados da conversa para o Dashboard App.

**Query Parameters:**
- `agent_id` (UUID, required) — ID do agente BoomIA
- `chatwoot_conversation_id` (integer, required) — ID da conversa no Chatwoot
- `token` (string, required) — Token de segurança

**Response:**
```json
{
  "found": true,
  "agent": {
    "name": "Agente IA",
    "avatar_url": "https://..."
  },
  "conversation": {
    "id": "uuid",
    "status": "open|closed",
    "started_at": "2024-03-20T10:00:00Z",
    "contact_name": "João Silva",
    "contact_avatar_url": "https://..."
  },
  "messages": [
    { "role": "user", "content": "Olá", "created_at": "..." },
    { "role": "assistant", "content": "Oi! Como posso ajudar?", "created_at": "..." }
  ],
  "followups": [
    { "scheduled_at": "...", "status": "pending", "attempt": 1, "max_attempts": 3 }
  ],
  "contact": {
    "name": "João Silva",
    "phone": "+55 11 98765-4321",
    "email": "joao@example.com",
    "notes": "Cliente recorrente",
    "contact_type": "client",
    "lead_status": "hot_lead"
  }
}
```

---

## Multi-Agent Setup

Se você tem múltiplos agentes BoomIA e múltiplos inboxes no Chatwoot:

1. **Para cada agent**, gere um token único
2. **Para cada inbox Chatwoot**, registre um Dashboard App com a URL do agent correspondente
3. Use rules/routing no Chatwoot para direcionar conversas para o inbox correto

Cada agent terá sua própria URL:
```
https://boom.empresa.com/chatwoot-app?agent_id=AGENT_1_UUID&token=TOKEN_1
https://boom.empresa.com/chatwoot-app?agent_id=AGENT_2_UUID&token=TOKEN_2
```

---

## FAQ

**P: O Dashboard App funciona offline?**
R: Não. O iframe precisa acessar `/api/chatwoot-app/context` que requer conexão com o servidor BoomIA.

**P: Posso usar o mesmo token em múltiplos Chatwoot?**
R: Não recomendado. Gere um token separado para cada instância do Chatwoot por segurança.

**P: Quantas conversas o Dashboard App suporta?**
R: O endpoint não tem limite de volume, mas a performance depende da estrutura de dados. Recomenda-se manter menos de 1000 mensagens por conversa para renderização fluida.

**P: O histórico é atualizado em tempo real?**
R: Não. A página é recarregada quando a conversa é aberta. Se você quer atualização em tempo real, será necessário implementar WebSocket (upgrade futuro).

---

## Support

Se encontrar problemas:
1. Verifique os logs do servidor BoomIA: `docker logs boom-ia-server`
2. Verifique os logs do Chatwoot
3. Teste a URL do Dashboard App no navegador diretamente
4. Verifique se `dashboard_app_token` está salvo no Supabase

---

## Version Info

- **BoomIA Dashboard App** v1.0
- **Compatible Chatwoot versions:** 2.8+
- **Last updated:** 2024-03-24
