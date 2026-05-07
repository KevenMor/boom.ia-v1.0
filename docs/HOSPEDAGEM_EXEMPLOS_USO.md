# Exemplos de Uso — Tool de Hospedagem Sunset Thermas Park

## Teste Manual via cURL

### 1. Caso de Sucesso — 2 Adultos

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <seu-token-aqui>" \
  -d '{
    "tenant_id": "<uuid-sunset>",
    "check_in": "2026-05-15",
    "check_out": "2026-05-17",
    "guests": [
      { "type": "adult" },
      { "type": "adult" }
    ]
  }'
```

**Resposta esperada**:
```json
{
  "status": "success",
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "nights": 2,
  "guests_in_family": 2,
  "guests_for_pricing": 2,
  "kids_under_12": [],
  "available_accommodations": [
    {
      "id": "...",
      "name": "LUXO COM VARANDA",
      "guests": 2,
      "nights": 2,
      "price_per_night": 832.00,
      "total_price": 1664.00,
      "currency": "BRL",
      "notes": "Não válido para datas especiais/eventos"
    },
    {
      "id": "...",
      "name": "LUXO DUPLO",
      "guests": 2,
      "nights": 2,
      "price_per_night": 782.00,
      "total_price": 1564.00,
      "currency": "BRL",
      "notes": "Não válido para datas especiais/eventos"
    },
    {
      "id": "...",
      "name": "STANDART",
      "guests": 2,
      "nights": 2,
      "price_per_night": 552.00,
      "total_price": 1104.00,
      "currency": "BRL",
      "notes": "Lençol de cama e banho não inclusos. Não válido para datas especiais/eventos"
    }
  ],
  "message": "Encontramos 3 opções de hospedagem para 2 pessoas, de 15/05 a 17/05 (2 noites)."
}
```

---

### 2. Caso com Cortesia — 2 Adultos + 1 Criança (3 anos)

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <seu-token-aqui>" \
  -d '{
    "tenant_id": "<uuid-sunset>",
    "check_in": "2026-05-15",
    "check_out": "2026-05-17",
    "guests": [
      { "type": "adult" },
      { "type": "adult" },
      { "type": "child", "age": 3 }
    ]
  }'
```

**Resposta esperada**:
```json
{
  "status": "success",
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "nights": 2,
  "guests_in_family": 3,
  "guests_for_pricing": 2,
  "kids_under_12": [
    { "age": 3 }
  ],
  "available_accommodations": [
    // ... mesmos valores que 2 adultos
  ],
  "message": "Encontramos 3 opções de hospedagem para 2 pessoas (sua família tem 3 pessoas), de 15/05 a 17/05 (2 noites). 1 criança até 12 anos em cortesia (colchão adicional inclusos)."
}
```

---

### 3. Caso com 2+ Crianças — 2 Adultos + 2 Crianças (4, 6 anos)

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <seu-token-aqui>" \
  -d '{
    "tenant_id": "<uuid-sunset>",
    "check_in": "2026-05-15",
    "check_out": "2026-05-17",
    "guests": [
      { "type": "adult" },
      { "type": "adult" },
      { "type": "child", "age": 4 },
      { "type": "child", "age": 6 }
    ]
  }'
```

**Resposta esperada**:
```json
{
  "status": "success",
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "nights": 2,
  "guests_in_family": 4,
  "guests_for_pricing": 3,
  "kids_under_12": [
    { "age": 4 },
    { "age": 6 }
  ],
  "available_accommodations": [
    {
      "id": "...",
      "name": "LUXO VISTA PISCINA",
      "guests": 3,
      "nights": 2,
      "price_per_night": 1127.00,
      "total_price": 2254.00,
      "currency": "BRL",
      "notes": "Não válido para datas especiais/eventos"
    },
    // ... outras acomodações com 3 pessoas
  ],
  "message": "Encontramos 6 opções de hospedagem para 3 pessoas (sua família tem 4 pessoas), de 15/05 a 17/05 (2 noites). 2 crianças até 12 anos em cortesia (colchões adicionais inclusos)."
}
```

---

### 4. Parque Fechado — Erro de Indisponibilidade

Se o parque estiver fechado em uma das datas solicitadas:

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <seu-token-aqui>" \
  -d '{
    "tenant_id": "<uuid-sunset>",
    "check_in": "2026-05-20",
    "check_out": "2026-05-22",
    "guests": [
      { "type": "adult" },
      { "type": "adult" }
    ]
  }'
```

**Resposta esperada** (se 21/05 estiver com `day_kind = 'fechado'`):
```json
{
  "status": "park_closed",
  "check_in": "2026-05-20",
  "check_out": "2026-05-22",
  "message": "O parque estará fechado em 2026-05-21. Não conseguimos confirmar hospedagem nessas datas.",
  "suggestions": [
    "Parque aberto: 2026-05-22 a 2026-05-28",
    "Parque aberto a partir de: 2026-05-29"
  ]
}
```

---

### 5. Erro de Validação — Datas Inválidas

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <seu-token-aqui>" \
  -d '{
    "tenant_id": "<uuid-sunset>",
    "check_in": "2026-05-22",
    "check_out": "2026-05-20",
    "guests": [
      { "type": "adult" }
    ]
  }'
```

**Resposta esperada**:
```json
{
  "error": "check_out_must_be_after_check_in"
}
```

---

## Uso pela Agente Julia via Chat

Quando a ferramenta estiver vinculada à agente Julia, ela poderá ser usada assim:

**Cliente**: "Gostaria de fazer uma reserva para 2 adultos e 1 criança de 3 anos, check-in em 15 de maio e checkout em 17."

**Julia (usando a tool)**:
- Chamará `/hospedagem/consultar-sunset` com os dados:
  - check_in: "2026-05-15"
  - check_out: "2026-05-17"
  - guests: [{ type: "adult" }, { type: "adult" }, { type: "child", age: 3 }]
- Receberá resposta com `guests_for_pricing: 2` (criança em cortesia)
- Apresentará as opções de acomodação em valor de 2 pessoas

**Julia responde**: "Ótimo! Encontramos 3 opções para vocês. Como sua filha tem 3 anos, ela entra em cortesia, então cobraremos apenas 2 pessoas. Para 2 noites (15 a 17 de maio), temos:
- Suíte Luxo com Varanda: R$ 1.664,00 (R$ 832/noite)
- Suíte Luxo Duplo: R$ 1.564,00 (R$ 782/noite)
- Chalé Standard: R$ 1.104,00 (R$ 552/noite)

Gostaria de mais detalhes sobre alguma?"

---

## Setup no Banco de Dados

### 1. Executar SQL de Seed

```bash
# No terminal do projeto
cd server
psql $DATABASE_URL < ../sql/025_register_hospedagem_tool_sunset.sql
```

Ou via Supabase SQL Editor:
1. Abrir https://supabase.com/projects/boomsolution-supabase/sql/new
2. Copiar conteúdo de `sql/025_register_hospedagem_tool_sunset.sql`
3. Clicar "Run"

### 2. Verificar Registro

```bash
# No terminal do servidor
cd server
npx tsx list-agent-tools.ts "Julia"
```

Deve listar a tool `consultar_hospedagem_sunset`.

### 3. Vincular Tool ao Agente (via Admin UI ou SQL)

**Via SQL** (se precisar fazer manualmente):
```sql
-- Buscar IDs
SELECT id FROM public.agents WHERE name ILIKE 'Julia%' LIMIT 1;
SELECT id FROM public.tools WHERE name = 'consultar_hospedagem_sunset' LIMIT 1;

-- Vincular
INSERT INTO public.agent_tools (agent_id, tool_id)
VALUES ('<agent-id-julia>', '<tool-id-consultar-hospedagem>')
ON CONFLICT DO NOTHING;
```

---

## Regras Aplicadas na Implementação

### Cálculo de Hóspedes

| Entrada | Tarifação | Motivo |
|---------|-----------|--------|
| 2 ad + 1 criança (≤12) | 2 | Criança = cortesia |
| 2 ad + 2 crianças (≤12) | 3 | 2+ crianças = +1 na tarifação |
| 2 ad + 1 criança (≤12) + 1 adolescente (13+) | 3 | 1 criança cortesia + 1 adolescente paga |

### Filtros de Acomodação por Número de Pessoas

Para 2 pessoas:
- ✅ LUXO COM VARANDA (min 2)
- ✅ LUXO DUPLO (min 2)
- ✅ STANDART (min 2)
- ❌ LUXO VISTA PISCINA (min 3)
- ❌ MASTER COM VARANDA (min 4)
- ❌ LOFT (min 6, embora possa alugar para 2 se cliente insistir)

Para 3 pessoas:
- ✅ LUXO COM VARANDA (min 2)
- ✅ LUXO DUPLO (min 2)
- ✅ STANDART (min 2)
- ✅ LUXO VISTA PISCINA (min 3)
- ❌ MASTER COM VARANDA (min 4)
- ❌ LOFT (min 6)

Para 4+ pessoas:
- ✅ Todas as acomodações conforme seus mínimos

---

## Monitoramento & Debugging

### Logs no Servidor

Se algo der errado, procurar por "Error in consultar-sunset:" nos logs do servidor.

### Query SQL para Verificar Parque Aberto

```sql
SELECT calendar_date, day_kind FROM public.lodging_park_days
WHERE tenant_id = '<uuid-sunset>'
  AND calendar_date BETWEEN '2026-05-15' AND '2026-05-17'
ORDER BY calendar_date;
```

### Query SQL para Verificar Tarifas

```sql
SELECT 
  rat.id,
  rat.guests,
  rat.nights,
  rat.price,
  at.name
FROM public.lodging_rate_items rat
JOIN public.lodging_accommodation_types at ON at.id = rat.accommodation_type_id
WHERE rat.tenant_id = '<uuid-sunset>'
  AND rat.guests = 2
  AND rat.nights = 2
ORDER BY rat.price;
```

---

## Checklist de Validação

- [ ] Endpoint `/hospedagem/consultar-sunset` responde com status 200
- [ ] Tool registrada no banco: `SELECT * FROM public.tools WHERE name = 'consultar_hospedagem_sunset'`
- [ ] Tool vinculada ao agente Julia: `SELECT * FROM public.agent_tools WHERE agent_id = '<julia-id>'`
- [ ] `list-agent-tools.ts` lista a tool
- [ ] Teste manual: 2 adultos + 1 criança retorna `guests_for_pricing: 2`
- [ ] Teste manual: 2 adultos + 2 crianças retorna `guests_for_pricing: 3`
- [ ] Teste manual: parque fechado retorna `status: "park_closed"` com sugestões
- [ ] Chat com Julia: consegue usar a tool e apresentar opções corretamente
