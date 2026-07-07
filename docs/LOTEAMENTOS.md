# Gestão de Lotes (módulo loteamentos)

Módulo opcional por tenant para incorporadoras: cadastro de empreendimentos, mapa visual de lotes e controle de status (disponível, reservado, vendido, bloqueado).

## Ativação

1. Aplicar `sql/039_lot_developments_and_lots.sql` no Supabase.
2. No painel Boom IA: **Tenants → Editar → Módulos** → habilitar **Gestão de lotes**.
3. (Opcional) Rodar `sql/040_lot_seed_reservas_do_brasil.sql` para demo Delta / Reservas do Brasil.

## Painel admin

| Rota | Função |
|------|--------|
| `/loteamentos/empreendimentos` | Lista de empreendimentos com totais por status |
| `/loteamentos/empreendimentos/:id` | Mapa + tabela de lotes do empreendimento |

### Ações por lote

- **Disponível** → reservar (vincula contato CRM) ou bloquear
- **Reservado** → vender, liberar ou bloquear
- **Bloqueado** → liberar (volta a disponível)
- **Vendido** → terminal na v1

### Mapa visual

- Imagem de fundo via URL ou upload (bucket `suite-galleries`).
- Cada lote usa `map_geometry` JSON (`type: rect`, coordenadas normalizadas 0–1).
- Modo **Desenhar lote no mapa**: arraste um retângulo para posicionar lote novo.

### Importação em massa

CSV com colunas: `code`, `block`, `lot_number`, `area_m2`, `status` (separador `,`, `;` ou tab).

## Embed Chatwoot (Mega)

Script: `scripts/tenants/delta-empreendimentos-dashboard-loteamentos.script.html` (**v3**, menu **Lotes**)  
Conta Chatwoot: **15** (Delta Empreendimentos) — o menu **só aparece** em `/app/accounts/15/*`.

Fluxo:

```
Mega sidebar → /api/embed/chatwoot/loteamentos/view → React embed → API /api/loteamentos/*
```

Requisitos no server:

- `CHATWOOT_MIRROR_EMBED_KEY` igual ao `EMBED_KEY` do script
- Agente com `config.chatwoot_account_id = 15`

## API (server)

Prefixo `/api/loteamentos` — todas as rotas exigem módulo `loteamentos` habilitado (`denyIfDisabled`).

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/summary` | Contadores por empreendimento |
| CRUD | `/developments`, `/lots` | Empreendimentos e lotes |
| POST | `/lots/:id/reserve` | Reservar (body: `contact_id`, `reserved_until?`) |
| POST | `/lots/:id/sell` | Marcar vendido |
| POST | `/lots/:id/release` | Liberar reserva |
| POST | `/lots/:id/block` | Bloquear |
| POST | `/lots/bulk` | Import JSON (até 500 lotes) |

## Fora do escopo v1

- Tool `consultar_lotes` para agente Manu
- Sincronização InstaCasa API
- Cobrança Asaas ao reservar/vender
- Editor de polígono avançado
