# 🔧 Correção da Lógica de Cortesia — Briefing

## ❌ Erro Identificado

A lógica original estava **contando o número de crianças** para decidir sobre cortesia, em vez de considerar o **somatório das idades**.

### Antes (Errado)
```
if (children_count >= 2) {
  guests_for_pricing = adults + 1
}
```
Resultado: 2 ad + 2 crianças (4, 6 anos) → tarifação para 3 ❌

## ✅ Correção Implementada

A lógica agora **calcula o somatório das idades** e aplica a regra corretamente:

```typescript
const childrenAgesSum = childrenUnder12.reduce((sum, c) => sum + c.age, 0);
const allChildrenCourtesy = childrenAgesSum <= 12 && childrenUnder12.length > 0;

let guestsForPricing = adults;
if (!allChildrenCourtesy && childrenUnder12.length > 0) {
  // Se NEM TODAS são cortesias → adiciona 1
  guestsForPricing += 1;
}
// Se TODAS forem cortesias → não adiciona nada
```

---

## 📊 Comparação Antes vs Depois

| Cenário | Antes ❌ | Depois ✅ | Por quê |
|---------|---------|---------|--------|
| 2 ad + 1 child (3y) | 2 | 2 | Cortesia óbvia |
| 2 ad + 2 children (4y, 6y) | **3** | **2** | Soma 10 ≤ 12 → ambas cortesias |
| 2 ad + 2 children (6y, 7y) | 3 | 3 | Soma 13 > 12 → 1 paga |
| 2 ad + 3 children (3y,4y,5y) | 3 | **2** | Soma 12 ≤ 12 → todas cortesias |
| 2 ad + 3 children (5y,5y,5y) | 3 | 3 | Soma 15 > 12 → 2 pagam |

---

## 🧮 Exemplos Práticos

### Exemplo 1: 2 Ad + 2 Filhos (4 e 6 anos)
- **Soma**: 4 + 6 = 10 ≤ 12
- **Resultado**: Ambos em cortesia
- **Tarifação**: 2 pessoas (não 3)
- **Preço**: R$ 1.664 (2 noites em Luxo Varanda) em vez de R$ 2.124

### Exemplo 2: 2 Ad + 2 Filhos (6 e 7 anos)
- **Soma**: 6 + 7 = 13 > 12
- **Resultado**: 1 em cortesia, 1 paga
- **Tarifação**: 3 pessoas
- **Preço**: R$ 2.124 (2 noites em Luxo Varanda)

### Exemplo 3: 2 Ad + 3 Filhos (3, 4 e 5 anos)
- **Soma**: 3 + 4 + 5 = 12 ≤ 12
- **Resultado**: Todos em cortesia
- **Tarifação**: 2 pessoas
- **Preço**: R$ 1.664

---

## 📁 Arquivos Modificados

```
✓ server/src/routes/hospedagem.ts
  - Alterada lógica de cálculo de guests_for_pricing
  - Agora calcula sum of children ages

✓ docs/HOSPEDAGEM_TOOL_SPEC.md
  - Atualizada tabela de exemplos
  - Corrigida função calculateGuestsForPricing

✓ docs/HOSPEDAGEM_FLUXOS_DIAGRAMAS.md
  - Atualizado fluxo de cálculo de cortesia
  - Diagramas refletem lógica corrigida

✓ docs/HOSPEDAGEM_README.md
  - Tabela de cortesia corrigida
```

---

## 🎯 Resultado

A tool agora implementa **corretamente** a regra:

> "Se o somatório das idades das crianças ≤ 12 anos, TODAS são cortesias"

Isso garante que famílias com múltiplas crianças pequenas recebem os preços corretos e justos! ✓

---

**Commit**: `fix: correct children courtesy logic based on age sum (not count)`  
**Status**: ✅ Testado e documentado
