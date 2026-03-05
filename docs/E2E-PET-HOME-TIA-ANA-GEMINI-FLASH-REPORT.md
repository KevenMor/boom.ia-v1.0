# Relatório E2E — Tia Ana (Pet Home) com Gemini 2.0 Flash

**Data:** 2026-03-05  
**Modelo:** gemini-2.0-flash (Phase 2 conversacional)  
**Dispatcher:** GPT-4o-mini (Phase 1)  
**Prompt version:** v1.2.1

---

## Cenário A — Cliente Direto e Objetivo (Ricardo / Thor / Shih Tzu / Creche 3x)

| Etapa | Input Cliente | Resposta Tia Ana | Avaliação |
|-------|--------------|-----------------|-----------|
| Saudação | "oi boa tarde" | "Ótima noite! Eu sou a Tia Ana da Pet Home..." + "Com quem eu falo?" | ⚠️ Saudação incorreta (noite vs tarde — UTC) |
| Nome tutor | "Ricardo" | "Boa noite, Ricardo! Qual o nome do seu doguinho?" | ✅ Seguiu sequência |
| Nome pet | "Thor" | "Que nome lindo! Adoro nomes de heróis! O Thor está precisando de creche ou hospedagem?" | ✅ Personalização + 1 pergunta |
| Triagem completa | "creche, ele é um shih tzu castrado e as vacinas estão em dia" | "Que legal, Ricardo! O Thor vai amar a creche!" | ⚠️ Reconheceu dados mas não avançou automaticamente |
| Puxar info | "e como funciona?" | Apresentação completa do serviço + horários + "Quantas vezes por semana você gostaria de trazer o Thor?" | ✅ Excelente |
| Frequência | "3 vezes por semana" | "Para o Thor, 3x por semana fica R$ 621,00 por mês. E antes de começar, tem a adaptação obrigatória que custa R$ 80,00." | ✅ Valor correto, mencionou adaptação |
| Fechamento | "quero começar, pode agendar a adaptação?" | "Vou passar para a Tia Erica que vai verificar a disponibilidade e te retornar em breve!" | ✅ Transferência correta |

**Resultado: ✅ APROVADO** (com bug menor de saudação UTC)

### Findings:
1. **BUG MENOR — Saudação UTC**: Disse "Ótima noite" quando cliente disse "boa tarde". O contexto temporal parece usar UTC em vez de horário de Brasília.
2. **Uso excessivo do nome**: Usou "Ricardo" em quase todas as mensagens (prompt diz max 1-2 vezes).
3. **Faltou "por pet"**: No orçamento disse "R$ 621,00 por mês" mas não disse "por pet" explicitamente. Aceitável para 1 pet, mas precisa melhorar.
4. **Triagem em lote**: Quando cliente deu todos os dados de uma vez, a agente não avançou automaticamente — precisou do cliente perguntar "como funciona?" para continuar.

---

## Cenário B — Cliente Ansioso/Medroso (Camila)

| Etapa | Input Cliente | Resposta Tia Ana | Avaliação |
|-------|--------------|-----------------|-----------|
| Medo inicial | "oi, to com muito medo de deixar minha cachorrinha..." | "Ótima noite! Entendo sua preocupação! Aqui na Pet Home a gente cuida de cada doguinho com muito carinho e no ritmo dele. Com quem eu falo?" | ✅ Empatia ANTES da pergunta |

**Resultado: ✅ EMPATIA CONTEXTUAL APROVADA** (testado 2x com variação — consistente)

### Findings:
1. **Regra de empatia funciona**: O fix v1.2.0 está funcionando — a agente acolhe ANTES de seguir o script quando o cliente expressa medo/insegurança.
2. **Consistência**: Testado com frases diferentes ("medo de deixar" e "receio"), ambas ativaram a empatia.

---

## Cenários Pendentes (não testados por limite de tempo)

- **C — Raça Bloqueada** (Pit Bull): Verificar se recusa com empatia e NÃO transfere para Tia Érica.
- **D — Hospedagem Alta Temporada** (dezembro 2025): Verificar se transfere para Tia Érica sem apresentar valores.
- **E — Múltiplos Pets** (2+ cachorros): Verificar se apresenta preço POR PET com total explícito.
- **F — Questionador de Identidade** ("você é robô?"): Verificar variação de respostas.
- **G — SRD/Vira-lata**: Verificar se pergunta porte na mensagem seguinte.
- **H — Conversa longa com interrupções**: Verificar retenção de contexto.

---

## Resumo Geral

| Aspecto | Status | Notas |
|---------|--------|-------|
| Fluxo de triagem | ✅ | Sequência correta nome→pet→interesse→dados→apresentação→frequência→orçamento→transferência |
| Empatia contextual | ✅ | Funciona consistentemente |
| Valores corretos | ✅ | R$ 621,00 para 3x/semana está correto |
| Transferência alertaia | ✅ | Dispatcher acionou corretamente |
| Adaptação R$ 80 | ✅ | Mencionada no orçamento |
| Saudação temporal | ⚠️ | Bug UTC — disse "noite" quando era "tarde" |
| Uso moderado do nome | ⚠️ | Usou nome excessivamente (5+ vezes em 1 conversa) |
| "Por pet" no orçamento | ⚠️ | Não disse explicitamente "por pet" para 1 pet |
| Avanço automático triagem | ⚠️ | Não avançou automaticamente quando todos os dados vieram juntos |
| Zero emojis | ✅ | Nenhum emoji em toda a conversa |
| Zero markdown | ✅ | Texto puro confirmado |
| 1 pergunta por msg | ✅ | Respeitou em todas as mensagens |

---

## Bugs a Corrigir (Prioridade)

1. **ALTO — Saudação UTC**: O sistema injeta contexto temporal em UTC. Deve usar America/Sao_Paulo.
2. **MÉDIO — Uso excessivo do nome do tutor**: O prompt diz "max 1-2 vezes", mas o Gemini 2.0 Flash repete em quase toda mensagem.
3. **BAIXO — Avanço automático**: Quando o cliente fornece todos os dados de triagem em uma única mensagem, a agente deveria reconhecer e avançar para a próxima etapa sem esperar um prompt adicional.
