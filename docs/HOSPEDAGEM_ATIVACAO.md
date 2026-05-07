# Guia de Ativação — Tool de Hospedagem Julia

## ✅ Status Atual

A tool de hospedagem foi **implementada e documentada** com sucesso.

✓ Endpoint criado: `POST /hospedagem/consultar-sunset`  
✓ Lógica de cortesia implementada  
✓ Verificação de calendário  
✓ Documentação completa  
✓ SQL seed pronto  

---

## 📋 Checklist de Ativação

### Fase 1: Deploy do Código ✅ (PRONTO)

- [x] Endpoint adicionado a `server/src/routes/hospedagem.ts`
- [x] Lógica de cálculo implementada
- [x] Validações e tratamento de erro
- [ ] **Deploy do servidor** ← PRÓXIMO PASSO

### Fase 2: Registrar Tool no Banco (PRONTO)

- [x] SQL seed criado: `sql/025_register_hospedagem_tool_sunset.sql`
- [ ] **Executar SQL** ← PRÓXIMO PASSO

### Fase 3: Vincular ao Agente Julia (MANUAL)

- [ ] Vincular tool ao agente Julia
- [ ] Testar via `list-agent-tools.ts`

### Fase 4: Testes (MANUAL)

- [ ] Teste 1: 2 adultos simples
- [ ] Teste 2: 2 adultos + 1 criança
- [ ] Teste 3: 2 adultos + 2 crianças
- [ ] Teste 4: Parque fechado
- [ ] Teste E2E: Chat com Julia

---

## 🚀 Próximas Ações

### 1️⃣ Deploy do Servidor (5 min)

Seu código já foi modificado em `server/src/routes/hospedagem.ts`.

```bash
# No seu ambiente de produção/staging
cd server
npm run build
npm start
# ou reiniciar o container Docker
```

**Verificar**:
```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -d '{"error":"test"}'
```

Deve retornar erro de validação (não 404).

### 2️⃣ Executar SQL de Seed (2 min)

**Opção A: Via Supabase Dashboard**

1. Abrir: https://supabase.com/projects/boomsolution-supabase/sql/new
2. Copiar conteúdo de `sql/025_register_hospedagem_tool_sunset.sql`
3. Clicar "Run"
4. Confirmar sucesso na mensagem

**Opção B: Via psql CLI**

```bash
psql $DATABASE_URL < sql/025_register_hospedagem_tool_sunset.sql
```

**Verificar sucesso**:
```sql
SELECT id, name, tool_type, tenant_id 
FROM public.tools 
WHERE name = 'consultar_hospedagem_sunset';
```

Deve retornar 1 linha.

### 3️⃣ Vincular ao Agente Julia (5 min)

**Pré-requisito**: Agente Julia já existe em `public.agents`

**Opção A: Via SQL**

```sql
-- Buscar IDs
SELECT id, name FROM public.agents 
WHERE name ILIKE '%julia%' LIMIT 5;

SELECT id, name FROM public.tools 
WHERE name = 'consultar_hospedagem_sunset' LIMIT 1;

-- Vincular
INSERT INTO public.agent_tools (agent_id, tool_id)
SELECT a.id, t.id
FROM public.agents a, public.tools t
WHERE a.name ILIKE '%julia%'
  AND t.name = 'consultar_hospedagem_sunset'
ON CONFLICT DO NOTHING;

-- Confirmar
SELECT * FROM public.agent_tools 
WHERE agent_id IN (SELECT id FROM public.agents WHERE name ILIKE '%julia%');
```

**Opção B: Via Admin UI**

1. Ir para Admin UI de agents
2. Selecionar Agent "Julia"
3. Adicionar tool "consultar_hospedagem_sunset"
4. Salvar

### 4️⃣ Validar no CLI (3 min)

```bash
cd server
npx tsx list-agent-tools.ts "Julia"
```

**Esperado**:
```
=== Agente: Julia | ID: <uuid> ===

  [0] consultar_hospedagem_sunset
      function_def.name: "consultar_hospedagem_sunset"
      description: Consulta hospedagem com verificação de disponibilidade...
```

---

## 🧪 Testes Manuais

### Setup: Preparar Dados de Teste

Antes de testar, garantir que o tenant Sunset tem dados:

```sql
-- Verificar tenant
SELECT id, name, slug FROM public.tenants 
WHERE slug LIKE '%sunset%';

-- Verificar calendário (deve ter datas abertas)
SELECT COUNT(*) FROM public.lodging_park_days 
WHERE tenant_id = '<sunset-uuid>' AND day_kind = 'aberto';

-- Verificar tarifas (deve ter valores para 2 e 3 pessoas, 1-5 noites)
SELECT guests, nights, COUNT(*) as count
FROM public.lodging_rate_items
WHERE tenant_id = '<sunset-uuid>'
GROUP BY guests, nights
ORDER BY guests, nights;
```

Se faltar dados, executar seeds:
- `sql/024_lodging_seed_rate_items_sunset.sql` (se ainda não executado)
- Seed de datas abertas no calendário

### Teste 1: 2 Adultos (Caso Simples)

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(seu-token)" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "check_in": "2026-05-15",
    "check_out": "2026-05-17",
    "guests": [
      { "type": "adult" },
      { "type": "adult" }
    ]
  }'
```

**Esperado**:
- `status: "success"`
- `guests_for_pricing: 2`
- `kids_under_12: []`
- `available_accommodations`: 3+ opções
- Nenhuma de Luxo Piscina, Master, ou Loft (por serem min 3, 4, 6 pessoas)

### Teste 2: 2 Adultos + 1 Criança (Cortesia 1)

```bash
# Mesmo request + adicionar
{
  "type": "child",
  "age": 3
}
```

**Esperado**:
- `guests_in_family: 3`
- `guests_for_pricing: 2` ← **CORTESIA APLICADA**
- `kids_under_12: [{age: 3}]`
- **Mesmas acomodações que Teste 1** (pois tarifação é para 2)
- Mensagem menciona cortesia

### Teste 3: 2 Adultos + 2 Crianças (Cortesia 2+)

```bash
# Adicionar 2 crianças no array guests
{
  "type": "child",
  "age": 4
},
{
  "type": "child",
  "age": 6
}
```

**Esperado**:
- `guests_in_family: 4`
- `guests_for_pricing: 3` ← **REGRA 2+ CRIANÇAS APLICADA**
- `kids_under_12: [{age: 4}, {age: 6}]`
- Acomodações **diferentes** (com preços para 3 pessoas)
- Luxo Piscina agora deve aparecer (min 3 pessoas)
- Master ainda não deve aparecer (min 4)

### Teste 4: Parque Fechado

Primeiro, editar calendário para simular fechamento:

```sql
UPDATE public.lodging_park_days
SET day_kind = 'fechado'
WHERE tenant_id = '<sunset-uuid>'
  AND calendar_date = '2026-05-16';
```

Então fazer requisição:

```bash
curl -X POST "http://localhost:3001/hospedagem/consultar-sunset" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(seu-token)" \
  -d '{
    "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
    "check_in": "2026-05-15",
    "check_out": "2026-05-17",
    "guests": [
      { "type": "adult" },
      { "type": "adult" }
    ]
  }'
```

**Esperado**:
- `status: "park_closed"`
- `message`: mention "2026-05-16"
- `suggestions`: array com próximas datas abertas

---

## 💬 Teste E2E com Julia (Chat)

Uma vez que tudo estiver pronto:

**Converse com Julia**:

```
Você: "Oi Julia! Gostaria de fazer uma reserva para 2 adultos e 1 
criança de 3 anos. Podemos fazer hospedagem de 15 a 17 de maio?"

Julia: [Usa a tool internamente]
[Retorna resposta com opções de acomodação para 2 pessoas, 
mencionando cortesia da criança]

Você: "Qual é mais barata?"

Julia: "O Chalé Standard é a mais acessível: R$ 1.104,00..."

Você: "Perfeito! Como faço a reserva?"

Julia: [Oferece próximas opções: confirmar detalhes, 
gerar proposta, etc.]
```

---

## 📖 Documentação de Referência

Para dúvidas durante implementação:

- **Especificação Técnica**: `docs/HOSPEDAGEM_TOOL_SPEC.md`
- **Exemplos de Uso**: `docs/HOSPEDAGEM_EXEMPLOS_USO.md`
- **Fluxos Visuais**: `docs/HOSPEDAGEM_FLUXOS_DIAGRAMAS.md`
- **Quick Reference**: `docs/HOSPEDAGEM_README.md`

---

## 🆘 Troubleshooting

### Problema: Endpoint retorna 404

**Causa**: Servidor não foi reiniciado após mudanças.

**Solução**:
```bash
npm run build  # Recompilar TypeScript
npm start      # Reiniciar
```

### Problema: Tool não aparece em `list-agent-tools`

**Causa 1**: SQL seed não foi executado.
```sql
SELECT * FROM public.tools WHERE name = 'consultar_hospedagem_sunset';
```

**Causa 2**: Tool registrada mas não vinculada ao agente.
```sql
SELECT * FROM public.agent_tools 
WHERE agent_id = '<julia-id>';
```

**Solução**: Executar SQL seed + vincular manualmente se necessário.

### Problema: `guests_for_pricing` sempre igual a `guests_in_family`

**Causa**: Lógica de cortesia não está sendo aplicada.

**Debug**:
1. Adicione log na função de cálculo
2. Verifique se `children_under_12.length` está correto
3. Confirme regra: `if (children_under_12.length >= 2) { ... }`

### Problema: Acomodações não aparecem

**Causa 1**: Tarifas não existem para o combination guests/nights.
```sql
SELECT * FROM public.lodging_rate_items
WHERE tenant_id = '<sunset-uuid>'
  AND guests = 2
  AND nights = 2;
```

**Causa 2**: Todas as acomodações estão sendo filtradas por capacidade.

**Debug**:
- Ajuste `minGuestsMap` em `hospedagem.ts`
- Ou adicione mais tarifas ao banco

### Problema: Parque sempre retorna "fechado"

**Causa**: Todas as datas têm `day_kind != 'aberto'`.

**Verificar**:
```sql
SELECT DISTINCT day_kind FROM public.lodging_park_days
WHERE tenant_id = '<sunset-uuid>'
  AND calendar_date BETWEEN '2026-05-01' AND '2026-05-31';
```

**Solução**: Seed de datas abertas se necessário.

---

## ✨ Próxima: Melhorias (Opcional)

Uma vez ativada, futuras melhorias poderiam incluir:

- [ ] Suporte a períodos promocionais (event_label)
- [ ] Filtro de acomodações por tipo (luxo, standard, etc)
- [ ] Busca por faixa de preço
- [ ] Integração com sistema de reservas (criar reserva direto)
- [ ] Histórico de consultas para analytics
- [ ] Validação de CPF/contato
- [ ] Notificações de confirmação

---

## 📞 Suporte

Em caso de dúvidas ou problemas:

1. Consultar `HOSPEDAGEM_TOOL_SPEC.md` (especificação técnica)
2. Verificar logs do servidor: `console.error` em `hospedagem.ts`
3. Validar dados no banco: `SELECT...` queries acima
4. Revisar fluxos: `HOSPEDAGEM_FLUXOS_DIAGRAMAS.md`

---

## 🎯 Resumo

**Implementação**: ✅ Completa  
**Documentação**: ✅ Completa  
**Próximas Ações**: Deploy → SQL → Vincular → Testar → Live 🚀

Tempo estimado para ativação completa: **15-30 min**
