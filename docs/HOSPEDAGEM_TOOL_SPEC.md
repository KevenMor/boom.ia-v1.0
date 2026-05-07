# Tool de Hospedagem para Agente Julia — Sunset Thermas Park

## Visão Geral

A agente Julia (Sunset Thermas Park) precisa de uma tool que implemente a lógica complexa de consulta de hospedagem. Esta tool será responsável por:

1. Verificar disponibilidade do parque em datas específicas
2. Calcular o número correto de hóspedes (aplicando regra de cortesia para crianças)
3. Consultar valores corretos na tabela de tarifas
4. Sugerir ajustes de data quando o parque estiver fechado

---

## Regras de Negócio

### 1. Calendário do Parque

A tabela `lodging_park_days` contém o calendário com:
- `calendar_date`: data em formato YYYY-MM-DD
- `day_kind`: 'aberto' | 'fechado' | 'manutencao'

**Verificação**: Se qualquer data entre `check_in` (inclusive) e `check_out` (exclusivo) está com `day_kind != 'aberto'`, o parque está fechado nesse período.

**Comportamento**: Quando cliente solicitar hospedagem em período fechado, oferecer alternativa com datas válidas.

### 2. Cálculo de Hóspedes (Cortesia para Crianças até 12 anos)

Crianças até 12 anos NÃO PAGAM — entram como cortesia (colchão adicional).

**Lógica**:
- Contar quantas crianças menores de 12 anos estão na hospedagem
- **Se houver 1 criança**: considerar apenas **adultos** na tarifação
- **Se houver 2+ crianças**: considerar **adultos + 1 criança** na tarifação

**Exemplos**:

| Composição | Tarifação | Motivo |
|-----------|-----------|--------|
| 2 adultos + 1 criança (3 anos) | 2 hóspedes | 1 criança = cortesia |
| 2 adultos + 1 criança (10 anos) | 2 hóspedes | 1 criança = cortesia |
| 2 adultos + 2 crianças (4, 6 anos) | 3 hóspedes | Ambas cortesias, mas 2+ crianças = +1 na tarifação |
| 2 adultos + 2 crianças (3, 13 anos) | 4 hóspedes | 1 criança até 12 anos (cortesia) + 1 adolescente (paga) + 2 adultos |

---

### 3. Tabela de Tarifas

Tabela `lodging_rate_items` com estrutura:
- `accommodation_type_id`: tipo de acomodação
- `guests`: número de hóspedes para tarifação
- `nights`: número de noites
- `price`: valor em BRL

**Filtros de Apresentação**:
- Para cliente com **2 pessoas**: NÃO apresentar:
  - Suíte Luxo Quadruplo (4+ pessoas)
  - Luxo com Varanda (4+ pessoas)
  - Master com Varanda (4+ pessoas)
  - Loft (a partir de 6 pessoas — embora possa alugar para 2 se desejar)

- Para cliente com **3 pessoas**: NÃO apresentar:
  - Master com Varanda (4+ pessoas)
  - Loft (a partir de 6 pessoas)

---

### 4. Acomodações

Com base no SQL seed (`024_lodging_seed_rate_items_sunset.sql`):

1. **LUXO VISTA PISCINA** (desde 3 pessoas)
2. **LUXO COM VARANDA** (desde 2 pessoas)
3. **LUXO DUPLO** (sem varanda, desde 2 pessoas)
4. **MASTER COM VARANDA** (até 4 pessoas, a partir de 4)
5. **STANDART** (desde 2 pessoas)
6. **LOFT** (a partir de 6 pessoas, mas pode alugar para 2 se cliente desejar)

---

## Fluxo da Tool

### Entrada

```json
{
  "tenant_id": "uuid",
  "check_in": "YYYY-MM-DD",
  "check_out": "YYYY-MM-DD",
  "guests": [
    { "type": "adult", "age": null },
    { "type": "adult", "age": null },
    { "type": "child", "age": 3 }
  ]
}
```

### Processamento

1. **Validar datas**
   - `check_out > check_in`
   - Formato YYYY-MM-DD

2. **Verificar disponibilidade do parque**
   - Consultar `lodging_park_days` para cada data em `[check_in, check_out)`
   - Se alguma data tiver `day_kind != 'aberto'`:
     - Retornar recomendação de ajuste de datas
     - Sugerir próximos períodos de abertura

3. **Calcular hóspedes para tarifação**
   - Contar adultos + crianças
   - Aplicar regra de cortesia
   - Resulta em `guests_for_pricing: number`

4. **Calcular número de noites**
   - `nights = (check_out - check_in).days()`

5. **Consultar tarifas disponíveis**
   - Buscar `lodging_rate_items` com:
     - `guests = guests_for_pricing`
     - `nights = nights`
   - Filtrar acomodações conforme regra de apresentação

6. **Retornar opcções de hospedagem**
   - Listar acomodações com valores
   - Indicar se há cortesias de crianças
   - Indicar regra de "colchão adicional"

### Saída

```json
{
  "status": "success" | "park_closed" | "error",
  "check_in": "YYYY-MM-DD",
  "check_out": "YYYY-MM-DD",
  "guests_in_family": 3,
  "guests_for_pricing": 2,
  "nights": 2,
  "kids_under_12": [{ "age": 3 }],
  "available_accommodations": [
    {
      "id": "uuid",
      "name": "LUXO COM VARANDA",
      "guests": 2,
      "nights": 2,
      "price_per_night": 832.00,
      "total_price": 1664.00,
      "notes": "Não válido para datas especiais/eventos"
    },
    // ... mais opções
  ],
  "message": "Texto legível para cliente",
  "suggestions": ["Sugerir datas alternativas se fechado"]
}
```

---

## Implementação no Banco

A tool será registrada em `public.tools` com:

```json
{
  "name": "consultar_hospedagem_sunset",
  "description": "Consulta disponibilidade e tarifas de hospedagem no Sunset Thermas Park",
  "tool_type": "api_rest",
  "tenant_id": "<uuid-sunset-thermas>",
  "function_def": {
    "name": "consultar_hospedagem_sunset",
    "description": "Consulta hospedagem com verificação de disponibilidade, cálculo de hóspedes e tarifas",
    "parameters": {
      "type": "object",
      "properties": {
        "check_in": { "type": "string", "description": "Data de entrada (YYYY-MM-DD)" },
        "check_out": { "type": "string", "description": "Data de saída (YYYY-MM-DD)" },
        "guests": {
          "type": "array",
          "description": "Lista de hóspedes: adultos e crianças (com idade)",
          "items": {
            "type": "object",
            "properties": {
              "type": { "type": "string", "enum": ["adult", "child"] },
              "age": { "type": "number", "description": "Idade (obrigatório para criança)" }
            }
          }
        }
      },
      "required": ["check_in", "check_out", "guests"]
    }
  },
  "execution_config": {
    "endpoint": "POST /hospedagem/consultar-sunset",
    "timeout_ms": 5000
  }
}
```

---

## Endpoint API

**POST** `/hospedagem/consultar-sunset`

### Reqs & Auth

- Requer `tenant_id` no body ou query
- Requer autenticação (`requireAuthenticated`)
- Requer `canAccessTenant(auth, tenant_id)`
- Requer módulo habilitado: `isTenantModuleEnabled(..., 'hospedagem')`

### Request Body

```typescript
{
  tenant_id: string;
  check_in: string;   // YYYY-MM-DD
  check_out: string;  // YYYY-MM-DD
  guests: Array<{
    type: 'adult' | 'child';
    age?: number;  // obrigatório se type = 'child'
  }>;
}
```

### Response

```typescript
{
  status: 'success' | 'park_closed' | 'invalid_request' | 'error';
  check_in: string;
  check_out: string;
  nights: number;
  guests_in_family: number;
  guests_for_pricing: number;
  kids_under_12: Array<{ age: number }>;
  available_accommodations?: Array<{
    id: string;
    name: string;
    guests: number;
    nights: number;
    price_per_night: number;
    total_price: number;
    currency: string;
    notes: string | null;
  }>;
  message: string;
  suggestions?: string[];
}
```

---

## Casos de Uso

### Caso 1: Sucesso — 2 Adultos, 2 Noites, Parque Aberto

**Input**:
```json
{
  "tenant_id": "uuid-sunset",
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "guests": [
    { "type": "adult" },
    { "type": "adult" }
  ]
}
```

**Output**:
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
    // ... mais opções
  ],
  "message": "Encontramos 6 opções de hospedagem para 2 pessoas, de 15 a 17 de maio (2 noites)."
}
```

### Caso 2: Parque Fechado em Data de Saída

**Input**:
```json
{
  "tenant_id": "uuid-sunset",
  "check_in": "2026-05-20",
  "check_out": "2026-05-22",
  "guests": [{ "type": "adult" }, { "type": "adult" }]
}
```

**Output** (se 21/05 estiver com `day_kind = 'fechado'`):
```json
{
  "status": "park_closed",
  "check_in": "2026-05-20",
  "check_out": "2026-05-22",
  "message": "O parque estará fechado em 21 de maio. Não conseguimos confirmar sua hospedagem nessas datas.",
  "suggestions": [
    "Parque aberto: 20 a 21 de maio (checkout em 21/05, período aberto 20-21)",
    "Próxima abertura: 22 a 24 de maio",
    "Você gostaria de ajustar suas datas?"
  ]
}
```

### Caso 3: 2 Adultos + 1 Criança (3 anos) = Cortesia

**Input**:
```json
{
  "tenant_id": "uuid-sunset",
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "guests": [
    { "type": "adult" },
    { "type": "adult" },
    { "type": "child", "age": 3 }
  ]
}
```

**Output**:
```json
{
  "status": "success",
  "guests_in_family": 3,
  "guests_for_pricing": 2,
  "kids_under_12": [{ "age": 3 }],
  "message": "Sua reserva será para 2 pessoas (1 criança de 3 anos em cortesia, com colchão adicional incluído).",
  "available_accommodations": [
    // ... mesmo preço que 2 adultos
  ]
}
```

### Caso 4: 2 Adultos + 2 Crianças (4, 6 anos) = Ambas Cortesias

**Input**:
```json
{
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "guests": [
    { "type": "adult" },
    { "type": "adult" },
    { "type": "child", "age": 4 },
    { "type": "child", "age": 6 }
  ]
}
```

**Output**:
```json
{
  "guests_in_family": 4,
  "guests_for_pricing": 3,
  "kids_under_12": [{ "age": 4 }, { "age": 6 }],
  "message": "Sua reserva será para 3 pessoas (2 crianças em cortesia, com colchões adicionais inclusos). Recomendamos as opções que acomodam até 3 hóspedes.",
  "available_accommodations": [
    // ... preços para 3 pessoas
  ]
}
```

---

## Detalhes de Implementação

### Em `server/src/routes/hospedagem.ts`

Adicionar nova rota:
```typescript
fastify.post(
  "/hospedagem/consultar-sunset",
  async (
    req: FastifyRequest<{
      Body: {
        tenant_id?: string;
        check_in?: string;
        check_out?: string;
        guests?: Array<{ type: string; age?: number }>;
      };
    }>,
    reply: FastifyReply
  ) => {
    // 1. Validações
    // 2. Cálculo de guests_for_pricing
    // 3. Verificação de datas abertas
    // 4. Busca de tarifas
    // 5. Montagem de resposta
  }
);
```

### Lógica de Cálculo

```typescript
function calculateGuestsForPricing(guests: Array<{ type: string; age?: number }>): {
  total_adults: number;
  total_children_under_12: number;
  guests_for_pricing: number;
  kids_under_12: Array<{ age: number }>;
} {
  const adults = guests.filter(g => g.type === 'adult').length;
  const children_under_12 = guests.filter(g => g.type === 'child' && (g.age ?? 0) <= 12).map(g => ({ age: g.age! }));
  
  let guests_for_pricing = adults;
  if (children_under_12.length >= 2) {
    guests_for_pricing += 1;
  }
  
  return {
    total_adults: adults,
    total_children_under_12: children_under_12.length,
    guests_for_pricing,
    kids_under_12: children_under_12
  };
}
```

### Verificação de Disponibilidade do Parque

```typescript
async function checkParkAvailability(
  supabase: ReturnType<typeof createNexusClient>,
  tenantId: string,
  checkIn: string,
  checkOut: string
): Promise<{ available: boolean; closedDates: string[] }> {
  const { data: parkDays, error } = await supabase
    .from("lodging_park_days")
    .select("calendar_date, day_kind")
    .eq("tenant_id", tenantId)
    .gte("calendar_date", checkIn)
    .lt("calendar_date", checkOut);
  
  if (error) throw error;
  
  const closedDates = parkDays
    ?.filter(d => d.day_kind !== 'aberto')
    .map(d => d.calendar_date) ?? [];
  
  return {
    available: closedDates.length === 0,
    closedDates
  };
}
```

### Filtragem de Acomodações por Pax

```typescript
function filterAccommodationsByPax(
  rates: LodgingRateItem[],
  guestsForPricing: number,
  accommodationTypes: LodgingAccommodationType[]
): LodgingRateItem[] {
  // Mapa de restrições por tipo
  const restrictions: Record<string, number> = {
    'LUXO VISTA PISCINA': 3,
    'LUXO COM VARANDA': 2,
    'LUXO DUPLO': 2,
    'MASTER COM VARANDA': 4,
    'STANDART': 2,
    'LOFT': 6
  };
  
  // Filtrar por guests_for_pricing >= min_guests do tipo
  return rates.filter(rate => {
    const type = accommodationTypes.find(t => t.id === rate.accommodation_type_id);
    const minGuests = restrictions[type?.name ?? ''] ?? 2;
    return guestsForPricing >= minGuests;
  });
}
```

---

## Teste Manual

Usar `list-agent-tools.ts` para verificar quando a tool estiver registrada:

```bash
cd server
npx tsx list-agent-tools.ts "Julia"
```

Deve listar a tool `consultar_hospedagem_sunset` com `function_def` correto.

---

## Próximos Passos

1. ✅ Criar endpoint POST `/hospedagem/consultar-sunset` em `hospedagem.ts`
2. ✅ Implementar lógica de verificação de calendário
3. ✅ Implementar cálculo de guests_for_pricing
4. ✅ Implementar busca de tarifas com filtros
5. ⏳ Registrar tool no banco via SQL ou Admin UI
6. ⏳ Vincular tool ao agente Julia via `agent_tools`
7. ⏳ Testar E2E com agente via chat
