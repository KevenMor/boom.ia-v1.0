# Fluxo Técnico da Tool de Hospedagem — Diagramas

## 1. Fluxo de Processamento

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTE → Julia: "Quero alojar para 2 adultos + 1 criança de  │
│  3 anos, 15-17 de maio"                                         │
└────────────────────────────┬──────────────────────────────────┘
                             ↓
          ┌──────────────────────────────────┐
          │ Julia extrai parâmetros:         │
          │ • check_in: "2026-05-15"         │
          │ • check_out: "2026-05-17"        │
          │ • guests: [                      │
          │    {type: "adult"},              │
          │    {type: "adult"},              │
          │    {type: "child", age: 3}       │
          │  ]                               │
          └────────────┬─────────────────────┘
                       ↓
        POST /hospedagem/consultar-sunset
                       ↓
    ┌─────────────────────────────────────────┐
    │ 1️⃣ VALIDAÇÃO                             │
    │ ✓ tenant_id válido?                    │
    │ ✓ Datas em YYYY-MM-DD?                 │
    │ ✓ check_out > check_in?                │
    │ ✓ Autenticação OK?                     │
    └────────────┬────────────────────────────┘
                 ↓
    ┌─────────────────────────────────────────────────┐
    │ 2️⃣ CÁLCULO DE HÓSPEDES PARA TARIFAÇÃO            │
    │                                                 │
    │ adults = 2                                      │
    │ children_under_12 = [{age: 3}]                 │
    │ children_count = 1                              │
    │                                                 │
    │ if children_count >= 2:                         │
    │   guests_for_pricing = 2 + 1 = 3               │
    │ else:                                           │
    │   guests_for_pricing = 2 ✓ (ESTE CASO)         │
    └────────────┬────────────────────────────────────┘
                 ↓
    ┌──────────────────────────────────────┐
    │ 3️⃣ VERIFICAR DISPONIBILIDADE DO PARQUE │
    │                                      │
    │ SELECT * FROM lodging_park_days      │
    │ WHERE tenant_id = 'uuid'             │
    │   AND calendar_date                  │
    │   BETWEEN '2026-05-15'               │
    │   AND '2026-05-16' (check_out-1)    │
    │                                      │
    │ Resultado:                           │
    │ • 2026-05-15: aberto ✓              │
    │ • 2026-05-16: aberto ✓              │
    │                                      │
    │ Status: PARQUE DISPONÍVEL ✓          │
    └────────────┬─────────────────────────┘
                 ↓
    ┌────────────────────────────────────┐
    │ 4️⃣ CALCULAR NÚMERO DE NOITES        │
    │                                    │
    │ nights = (17-05) - (15-05)         │
    │ nights = 2 dias ✓                  │
    └────────────┬───────────────────────┘
                 ↓
    ┌─────────────────────────────────────────────┐
    │ 5️⃣ BUSCAR TARIFAS                           │
    │                                             │
    │ SELECT * FROM lodging_rate_items            │
    │ WHERE tenant_id = 'uuid'                    │
    │   AND guests = 2          ← guests_for_pricing
    │   AND nights = 2                            │
    │                                             │
    │ Encontrados:                                │
    │ • LUXO COM VARANDA: R$ 1.664 (2 noites)   │
    │ • LUXO DUPLO: R$ 1.564 (2 noites)         │
    │ • STANDART: R$ 1.104 (2 noites)           │
    └────────────┬────────────────────────────────┘
                 ↓
    ┌──────────────────────────────────────────────┐
    │ 6️⃣ FILTRAR ACOMODAÇÕES POR CAPACIDADE        │
    │                                              │
    │ guests_for_pricing = 2                       │
    │                                              │
    │ LUXO COM VARANDA:                            │
    │   min_guests = 2 → 2 >= 2 ✓ INCLUIR         │
    │                                              │
    │ LUXO DUPLO:                                  │
    │   min_guests = 2 → 2 >= 2 ✓ INCLUIR         │
    │                                              │
    │ STANDART:                                    │
    │   min_guests = 2 → 2 >= 2 ✓ INCLUIR         │
    │                                              │
    │ LUXO VISTA PISCINA:                          │
    │   min_guests = 3 → 2 >= 3 ✗ EXCLUIR         │
    │                                              │
    │ MASTER COM VARANDA:                          │
    │   min_guests = 4 → 2 >= 4 ✗ EXCLUIR         │
    │                                              │
    │ Disponíveis: 3 acomodações                  │
    └────────────┬─────────────────────────────────┘
                 ↓
    ┌──────────────────────────────────────────────┐
    │ 7️⃣ MONTAR RESPOSTA FINAL                      │
    │                                              │
    │ ✓ status: "success"                         │
    │ ✓ nights: 2                                  │
    │ ✓ guests_in_family: 3                        │
    │ ✓ guests_for_pricing: 2                      │
    │ ✓ kids_under_12: [{age: 3}]                 │
    │ ✓ available_accommodations: [...]           │
    │ ✓ message: "Encontramos 3 opções..."         │
    └────────────┬─────────────────────────────────┘
                 ↓
           RESPOSTA JSON
                 ↓
┌──────────────────────────────────────────────────────────┐
│ Julia recebe resposta e apresenta para cliente:         │
│                                                         │
│ "Ótimo! Encontramos 3 opções de hospedagem para 2     │
│  pessoas. Sua filha de 3 anos entra em cortesia       │
│  (colchão adicional incluído). Para 15 a 17 de maio    │
│  (2 noites):                                           │
│                                                        │
│  1. Suíte Luxo com Varanda: R$ 1.664,00               │
│  2. Suíte Luxo Duplo: R$ 1.564,00                     │
│  3. Chalé Standard: R$ 1.104,00                       │
│                                                        │
│  Qual você prefere?"                                   │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Fluxo de Cálculo de Cortesia

```
┌────────────────────────────────────────┐
│ INPUT: Lista de hóspedes               │
│ • Adult 1                              │
│ • Adult 2                              │
│ • Child age 3                          │
│ • Child age 6  (apenas neste caso)    │
└────────────┬───────────────────────────┘
             ↓
┌─────────────────────────────────────────┐
│ CONTAR ADULTOS                          │
│ adults = 2                              │
└────────────┬────────────────────────────┘
             ↓
┌────────────────────────────────────────────────────┐
│ FILTRAR CRIANÇAS ATÉ 12 ANOS                       │
│ children_under_12 = [                              │
│   {age: 3},                                        │
│   {age: 6}  (se 4 hóspedes)                        │
│ ]                                                  │
│ children_count = 1 ou 2                            │
└────────────┬─────────────────────────────────────┘
             ↓
        ┌────────┴────────────────────────────────┐
        │                                         │
        ↓ children_count = 1                      ↓ children_count >= 2
        │                                         │
   ┌─────────────┐                     ┌──────────────────┐
   │ CORTESIA 1  │                     │  CORTESIA 2+     │
   │             │                     │                  │
   │ guests_for_ │                     │ guests_for_      │
   │ pricing =   │                     │ pricing =        │
   │ adults      │                     │ adults + 1       │
   │             │                     │                  │
   │ Exemplo:    │                     │ Exemplo:         │
   │ 2 + 0 = 2   │                     │ 2 + 1 = 3        │
   └──────┬──────┘                     └────────┬─────────┘
          │                                     │
          └─────────────┬──────────────────────┘
                        ↓
          ┌──────────────────────────────────────┐
          │ RESULTADO: guests_for_pricing        │
          │ (Usar para buscar tarifas)           │
          └──────────────────────────────────────┘
```

---

## 3. Verificação de Disponibilidade do Parque

```
┌─────────────────────────────────────────────┐
│ INPUT: check_in="2026-05-15"                │
│        check_out="2026-05-17"               │
└────────────┬────────────────────────────────┘
             ↓
    ┌──────────────────────────┐
    │ Datas a verificar:       │
    │ • 2026-05-15 (entrada)   │
    │ • 2026-05-16             │
    │ (check_out é exclusivo)  │
    └────────────┬─────────────┘
                 ↓
    ┌────────────────────────────────────┐
    │ Query: SELECT day_kind             │
    │        FROM lodging_park_days      │
    │        WHERE calendar_date IN      │
    │        (2026-05-15, 2026-05-16)    │
    └────────────┬───────────────────────┘
                 ↓
    Cenário A: ✓ ABERTO
    │
    ├─ 2026-05-15: aberto
    ├─ 2026-05-16: aberto
    │
    └─→ ✓ RETORNAR TARIFAS


    Cenário B: ✗ FECHADO
    │
    ├─ 2026-05-15: aberto
    ├─ 2026-05-16: fechado ✗
    │
    └─→ ✗ RETORNAR park_closed
        └─ Sugestões:
           "Parque aberto: 2026-05-17 a 2026-05-21"
           "Próxima abertura: 2026-05-22"


    Cenário C: MANUTENÇÃO
    │
    ├─ 2026-05-15: aberto
    ├─ 2026-05-16: manutencao ✗
    │
    └─→ ✗ RETORNAR park_closed
        (tratado como fechado)
```

---

## 4. Fluxo de Erro — Parque Fechado

```
┌──────────────────────────────────────┐
│ Request com datas que parque fecha    │
│ check_in: "2026-05-20"               │
│ check_out: "2026-05-22"              │
└────────────┬─────────────────────────┘
             ↓
    Verificar calendário:
    • 2026-05-20: aberto ✓
    • 2026-05-21: fechado ✗
             ↓
┌──────────────────────────────────────┐
│ closedDates = ["2026-05-21"]         │
│ if (closedDates.length > 0) {        │
│   return park_closed                 │
│ }                                    │
└────────────┬─────────────────────────┘
             ↓
    ┌──────────────────────────────────┐
    │ Buscar próximas datas abertas:   │
    │                                  │
    │ SELECT * FROM lodging_park_days  │
    │ WHERE calendar_date >= '2026-05-22'
    │ ORDER BY calendar_date           │
    │ LIMIT 30                         │
    │                                  │
    │ Resultado:                       │
    │ • 2026-05-22: aberto             │
    │ • 2026-05-23: aberto             │
    │ • 2026-05-24: aberto             │
    │ • 2026-05-25: fechado            │
    │ • 2026-05-26: aberto             │
    │ ...                              │
    └────────────┬─────────────────────┘
                 ↓
    ┌───────────────────────────────────┐
    │ Montar sugestões:                 │
    │                                   │
    │ [                                 │
    │   "Parque aberto: 2026-05-22 a    │
    │    2026-05-24",                   │
    │   "Parque aberto: 2026-05-26 a    │
    │    2026-05-28",                   │
    │   ...                             │
    │ ]                                 │
    └────────────┬────────────────────┘
                 ↓
┌──────────────────────────────────────────────────┐
│ Response: park_closed                           │
│ {                                               │
│   "status": "park_closed",                      │
│   "message": "O parque estará fechado em       │
│    2026-05-21. Não conseguimos confirmar       │
│    hospedagem nessas datas.",                  │
│   "suggestions": [                              │
│     "Parque aberto: 2026-05-22 a 2026-05-24", │
│     "Parque aberto: 2026-05-26 a 2026-05-28", │
│     ...                                        │
│   ]                                            │
│ }                                              │
└──────────────────────────────────────────────────┘
             ↓
    Julia apresenta ao cliente:
    "Infelizmente, o parque estará fechado
     em 21 de maio. Podemos oferecer:
     • 22 a 24 de maio
     • 26 a 28 de maio
     Qual data funciona melhor?"
```

---

## 5. Estrutura de Dados — Requisição

```json
{
  "tenant_id": "550e8400-e29b-41d4-a716-446655440000",
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "guests": [
    {
      "type": "adult",
      "age": null  // opcional para adultos
    },
    {
      "type": "adult",
      "age": null
    },
    {
      "type": "child",
      "age": 3  // obrigatório para crianças
    }
  ]
}
```

---

## 6. Estrutura de Dados — Resposta (Sucesso)

```json
{
  "status": "success",
  "check_in": "2026-05-15",
  "check_out": "2026-05-17",
  "nights": 2,
  "guests_in_family": 3,
  "guests_for_pricing": 2,
  "kids_under_12": [
    {
      "age": 3
    }
  ],
  "available_accommodations": [
    {
      "id": "uuid-1",
      "name": "LUXO COM VARANDA",
      "guests": 2,
      "nights": 2,
      "price_per_night": 832.00,
      "total_price": 1664.00,
      "currency": "BRL",
      "notes": "Não válido para datas especiais/eventos"
    },
    {
      "id": "uuid-2",
      "name": "LUXO DUPLO",
      "guests": 2,
      "nights": 2,
      "price_per_night": 782.00,
      "total_price": 1564.00,
      "currency": "BRL",
      "notes": "Não válido para datas especiais/eventos"
    },
    {
      "id": "uuid-3",
      "name": "STANDART",
      "guests": 2,
      "nights": 2,
      "price_per_night": 552.00,
      "total_price": 1104.00,
      "currency": "BRL",
      "notes": "Lençol de cama e banho não inclusos..."
    }
  ],
  "message": "Encontramos 3 opções de hospedagem para 2 pessoas (sua família tem 3 pessoas), de 15/05 a 17/05 (2 noites). 1 criança até 12 anos em cortesia (colchão adicional inclusos)."
}
```

---

## 7. Estrutura de Dados — Resposta (Parque Fechado)

```json
{
  "status": "park_closed",
  "check_in": "2026-05-20",
  "check_out": "2026-05-22",
  "message": "O parque estará fechado em 2026-05-21. Não conseguimos confirmar hospedagem nessas datas.",
  "suggestions": [
    "Parque aberto: 2026-05-22 a 2026-05-24",
    "Parque aberto: 2026-05-26 a 2026-05-28"
  ]
}
```

---

## 8. Matriz de Decisão — Acomodações por Número de Pessoas

```
                │ 2 pessoas │ 3 pessoas │ 4 pessoas │ 5+ pessoas
────────────────┼───────────┼───────────┼───────────┼────────────
Luxo Varanda    │    ✓      │    ✓      │    ✓      │     ✓
Luxo Duplo      │    ✓      │    ✓      │    ✓      │     ✓
Standard        │    ✓      │    ✓      │    ✓      │     ✓
Luxo Piscina    │    ✗      │    ✓      │    ✓      │     ✓
(min 3)         │   min 3   │           │           │
                │           │           │           │
Master Varanda  │    ✗      │    ✗      │    ✓      │     ✗
(até 4)         │           │           │           │    max 4
                │           │           │           │
Loft            │    ✗      │    ✗      │    ✗      │     ✓
(min 6)         │   min 6   │   min 6   │   min 6   │  desde 6
```

---

Visualizações criadas para facilitar compreensão do fluxo! 🎯
