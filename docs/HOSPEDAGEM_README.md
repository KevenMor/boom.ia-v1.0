# Tool de Hospedagem Sunset Thermas Park — Guia Implementação

## 📋 Resumo

Implementação da **tool de hospedagem** para a agente Julia (Sunset Thermas Park) com lógica complexa de:

✅ Verificação de disponibilidade do parque (calendário)  
✅ Cálculo de cortesia para crianças até 12 anos  
✅ Tarifação correta por número de hóspedes  
✅ Filtro de acomodações por capacidade  
✅ Sugestões de datas alternativas  

---

## 🔧 Arquivos Modificados/Criados

### Código

| Arquivo | Mudança | Descrição |
|---------|---------|-----------|
| `server/src/routes/hospedagem.ts` | ✏️ Modificado | Adicionado endpoint `POST /hospedagem/consultar-sunset` |

### Documentação

| Arquivo | Tipo | Descrição |
|---------|------|-----------|
| `docs/HOSPEDAGEM_TOOL_SPEC.md` | 📖 Spec Técnica | Detalhamento completo das regras, entrada/saída, implementação |
| `docs/HOSPEDAGEM_EXEMPLOS_USO.md` | 📚 Exemplos | Casos de uso, cURL, setup, validação |
| `sql/025_register_hospedagem_tool_sunset.sql` | 🗄️ Seed | SQL para registrar a tool no banco |

---

## 🚀 Implementação — Passo a Passo

### 1️⃣ Deploy do Endpoint (já feito)

O endpoint `POST /hospedagem/consultar-sunset` foi adicionado a `hospedagem.ts`:

```typescript
// Entrada
{
  "tenant_id": "uuid",
  "check_in": "YYYY-MM-DD",
  "check_out": "YYYY-MM-DD",
  "guests": [
    { "type": "adult" },
    { "type": "adult" },
    { "type": "child", "age": 3 }
  ]
}

// Saída (sucesso)
{
  "status": "success",
  "nights": 2,
  "guests_in_family": 3,
  "guests_for_pricing": 2,
  "kids_under_12": [{ "age": 3 }],
  "available_accommodations": [ ... ],
  "message": "Encontramos X opções..."
}
```

### 2️⃣ Registrar Tool no Banco

```bash
# Executar SQL de seed
cd server
psql $DATABASE_URL < ../sql/025_register_hospedagem_tool_sunset.sql

# Ou via Supabase SQL Editor (copiar/colar conteúdo)
```

### 3️⃣ Vincular Tool ao Agente Julia

Via Admin UI ou SQL:
```sql
INSERT INTO public.agent_tools (agent_id, tool_id)
SELECT a.id, t.id
FROM public.agents a
JOIN public.tools t ON t.name = 'consultar_hospedagem_sunset'
WHERE a.name ILIKE 'Julia%'
ON CONFLICT DO NOTHING;
```

### 4️⃣ Testar via CLI

```bash
cd server
npx tsx list-agent-tools.ts "Julia"
```

Deve listar: `consultar_hospedagem_sunset`

### 5️⃣ Testar via Chat

Conversa com Julia:
```
Cliente: "Quero alojar para 2 adultos e 1 criança de 3 anos, 15 a 17 de maio"
Julia: [usa tool] "Ótimo! Encontramos 3 opções. Sua filha entra em cortesia..."
```

---

## 📊 Lógica de Negócio — Resumo

### Cortesia para Crianças

| Caso | Tarifação | Explicação |
|------|-----------|-----------|
| 2 ad + 1 criança ≤12 | 2 pessoas | 1 criança = cortesia |
| 2 ad + 2 crianças ≤12 | **3 pessoas** | 2+ crianças = +1 na tarifação |
| 2 ad + 1 criança ≤12 + 1 adolescente | 3 pessoas | 1 criança cortesia + 1 adolescente paga |

### Acomodações & Filtros

**Para 2 pessoas**:
- ✅ Luxo com Varanda, Luxo Duplo, Standard
- ❌ Luxo Piscina (min 3), Master (min 4), Loft (min 6)

**Para 3 pessoas**:
- ✅ Luxo com Varanda, Luxo Duplo, Standard, Luxo Piscina
- ❌ Master (min 4), Loft (min 6)

**Para 4+ pessoas**:
- ✅ Todas conforme seus mínimos

---

## ✨ Recursos Implementados

### ✅ Verificação de Calendário

A tool consulta `lodging_park_days` e verifica se o parque está aberto em **todas** as datas.

Se fechado em qualquer data → retorna `status: "park_closed"` com sugestões.

### ✅ Cálculo de Cortesia

```typescript
// Pseudocódigo
adults = 2
children_under_12 = [{ age: 3 }, { age: 6 }]  // 2 crianças

guests_for_pricing = adults
if (children_under_12.length >= 2) {
  guests_for_pricing += 1  // = 3
}
```

### ✅ Tarifas Corretas

Busca em `lodging_rate_items` com:
- `guests = guests_for_pricing`
- `nights = (check_out - check_in).days()`

### ✅ Apresentação de Acomodações

Filtra por regra de capacidade mínima e apresenta apenas as apropriadas.

### ✅ Mensagens Amigáveis

Comunica de forma clara:
- Número de pessoas (família vs tarifação)
- Cortesias de crianças
- Datas em formato legível (DD/MM)
- Sugestões quando fechado

---

## 🧪 Teste Rápido (Manual)

### Teste 1: 2 Adultos Simples

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer token" \
  -d '{
    "tenant_id": "uuid-sunset",
    "check_in": "2026-05-15",
    "check_out": "2026-05-17",
    "guests": [
      { "type": "adult" },
      { "type": "adult" }
    ]
  }'
```

✅ Deve retornar 3+ acomodações (Luxo Varanda, Duplo, Standard)

### Teste 2: 2 Adultos + 1 Criança

```bash
# Mesmo request, adicionando:
# { "type": "child", "age": 3 }
```

✅ Deve retornar `guests_for_pricing: 2` (mesmo que teste 1)

### Teste 3: 2 Adultos + 2 Crianças

```bash
# Adicionar 2 crianças no guests array
```

✅ Deve retornar `guests_for_pricing: 3` + acomodações para 3 pessoas

### Teste 4: Parque Fechado

Editar `lodging_park_days` para ter `day_kind = 'fechado'` em 16/05.

```bash
# Request com check_in 15, check_out 17
```

✅ Deve retornar `status: "park_closed"` com sugestões

---

## 📝 Próximos Passos (Checklist)

- [ ] Fazer deploy de `hospedagem.ts` atualizado
- [ ] Executar SQL seed para registrar tool
- [ ] Vincular tool ao agente Julia
- [ ] Rodar `list-agent-tools.ts` para confirmar
- [ ] Testar manualmente via cURL (4 testes acima)
- [ ] Testar com Julia via chat
- [ ] Monitorar logs para erros

---

## 🐛 Troubleshooting

### Tool não aparece em `list-agent-tools.ts`

1. Confirmar SQL foi executado: `SELECT * FROM public.tools WHERE name = 'consultar_hospedagem_sunset'`
2. Confirmar tool vinculada ao agente: `SELECT * FROM public.agent_tools WHERE tool_id = ...`

### Endpoint retorna 404

1. Confirmar servidor foi reiniciado após mudanças em `hospedagem.ts`
2. Confirmar caminho exato: `POST /hospedagem/consultar-sunset`

### Valores errados (não cortesia)

1. Verificar cálculo de `guests_for_pricing` nos logs
2. Confirmar `childrenUnder12.length` foi contado corretamente
3. Testar query SQL direta em `lodging_rate_items`

### Parque sempre aberto/fechado

1. Verificar dados em `lodging_park_days` para período
2. Confirmar `day_kind` tem valores corretos ('aberto', 'fechado', 'manutencao')

---

## 📖 Documentação Relacionada

- **Especificação Completa**: `docs/HOSPEDAGEM_TOOL_SPEC.md`
- **Exemplos de Uso**: `docs/HOSPEDAGEM_EXEMPLOS_USO.md`
- **Seed SQL**: `sql/025_register_hospedagem_tool_sunset.sql`
- **Tabelas**: `lodging_park_days`, `lodging_rate_items`, `lodging_accommodation_types`

---

## 📚 Stack Técnico

| Componente | Tecnologia |
|-----------|-----------|
| API | Fastify (TypeScript) |
| Banco de Dados | Supabase (PostgreSQL) |
| Autenticação | JWT + RLS |
| Tool Format | OpenAI-compatible function_def |

---

## 🎯 Regra de Ouro

> **Sempre calcular cortesia ANTES de buscar tarifas.**

1. Receber lista de hóspedes
2. Aplicar regra de cortesia → `guests_for_pricing`
3. Buscar tarifas com `guests_for_pricing`
4. Apresentar resultado

---

Dúvidas? Consulte `HOSPEDAGEM_TOOL_SPEC.md` ou `HOSPEDAGEM_EXEMPLOS_USO.md`. 🚀
