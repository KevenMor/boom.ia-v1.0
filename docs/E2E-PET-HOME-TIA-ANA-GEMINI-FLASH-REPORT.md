# Relatório E2E — Tia Ana (Pet Home Tia Erica) — Gemini 2.0 Flash

**Data:** 2026-03-10  
**Objetivo:** Teste conversacional longo com cliente exigente, buscando falhas na humanização e no fluxo.  
**Modelo:** Gemini 2.0 Flash  
**Acesso:** Sandbox MCP Browser (localhost:8080)

---

## 1. Cenário do Teste

Cliente simulada: **Mariana** — exigente, com dúvidas, buscando encontrar falhas no atendimento.

### Mensagens enviadas

1. "Oi, preciso de informações sobre hospedagem. Mas antes de qualquer coisa, quero saber: vocês realmente cuidam bem dos cachorros? Já tive experiências péssimas em outros lugares e não quero passar por isso de novo."
2. "Sou a Mariana. Mas espera, você não respondeu direito. COMO vocês cuidam? O que exatamente fazem? Tem câmera? Quantas pessoas por cachorro? Não quero respostas genéricas."
3. "Cadê as câmeras? Não tem? Isso é péssimo. E o preço? Quanto custa? Não adianta enrolar, quero números."
4. "Você não respondeu! Quanto custa a hospedagem? E por que [nome do pet]? Nem te falei o nome do meu cachorro ainda. Está me ignorando de propósito?"

---

## 2. Falhas Identificadas

### 🔴 CRÍTICO — Placeholder literal exposto

**Resposta da agente:**  
"a gente manda noticias e fotos do **[nome do pet]** todos os dias."

**Problema:** O modelo usou o placeholder `[nome do pet]` em vez de substituir por "seu doguinho", "seu pet" ou omitir. O cliente não havia informado o nome do pet.

**Impacto:** Quebra total da humanização; cliente percebe que é um template/IA.

**Recomendação:** Incluir no prompt: "NUNCA use placeholders literais como [nome do pet] na resposta. Se não tiver o nome, use 'seu doguinho', 'seu pet' ou 'ele(a)'."

---

### 🟠 ALTO — Falta de acentuação (Gemini 2.0 Flash)

Palavras sem acento nas respostas:

| Resposta | Esperado |
|----------|----------|
| Otimo | Ótimo |
| preocupacao | preocupação |
| seguranca | segurança |
| socializacao | socialização |
| caes | cães |
| compativeis | compatíveis |
| adaptacao | adaptação |
| voce | você |
| recebera | receberá |
| noticias | notícias |
| nao | não |
| cameras | câmeras |
| raca | raça |
| rapida | rápida |

**Recomendação:** Adicionar ao prompt: "Use SEMPRE acentuação correta em português (ó, á, ã, ç, ê, etc.). Nunca omita acentos."

---

### 🟠 ALTO — Múltiplas perguntas na mesma mensagem

**Resposta 1:**  
"Com quem eu falo?" + "Como posso te chamar?" (duas perguntas)

**Resposta 5:**  
"Qual o nome do seu doguinho?" + "E qual a raca dele(a)?" (duas perguntas)

**Problema:** O prompt exige "UMA pergunta por mensagem", mas o modelo não está respeitando.

**Recomendação:** Reforçar no prompt com exemplos de ERRADO vs CERTO. Considerar pós-processamento que detecta múltiplos "?" e alerta.

---

### 🟡 MÉDIO — Fragmentação de mensagens

A agente enviou 4–5 bolhas separadas em uma única resposta (ex.: explicação sobre creche, grupos, câmeras, pergunta "O que você acha?"). O prompt pede "blocos separados por linha em branco" — o modelo pode estar interpretando como mensagens separadas.

**Recomendação:** Esclarecer: "Prefira 1–2 mensagens completas por resposta. Evite enviar mais de 3 bolhas em sequência."

---

### 🟡 MÉDIO — Preço não abordado para cliente exigente

O cliente pediu preço 3 vezes. A agente seguiu corretamente a triagem (não dar valor sem nome do pet e raça), mas não explicou de forma clara o motivo.

**Recomendação:** Adicionar regra para cliente que insiste em preço: "Se o cliente pedir preço repetidamente antes da triagem, explique em UMA frase: 'O valor varia conforme o porte e o período. Preciso do nome e da raça do seu doguinho pra te passar o orçamento certo.' Em seguida, faça APENAS a próxima pergunta da triagem."

---

### 🟢 BAIXO — Saudação "Ótimo dia" em horário não validado

A agente disse "Ótimo dia" — o teste foi por volta de 11h. Se o [CONTEXTO TEMPORAL] estiver correto, ok. Validar se o timezone está sendo injetado corretamente.

---

## 3. Pontos Positivos

- ✅ Acolheu a preocupação inicial do cliente ("Entendo sua preocupacao!")
- ✅ Respondeu sobre câmeras (não tem, mas envia fotos)
- ✅ Respondeu sobre equipe 24h, grupos, adaptação
- ✅ Reconheceu o erro do placeholder na última resposta: "Desculpa, Mariana! Fui rapida demais."
- ✅ Tom caloroso e uso de "doguinho"
- ✅ Não usou emojis

---

## 4. Ajustes Recomendados no Prompt (pet-home.ts)

1. **Regra anti-placeholder:**
   ```
   NUNCA use placeholders literais ([nome do pet], {nome}, etc.) na resposta ao cliente.
   Se não tiver o dado, use: "seu doguinho", "seu pet", "ele(a)" ou reformule a frase.
   ```

2. **Regra de acentuação:**
   ```
   Use SEMPRE acentuação correta em português brasileiro (ó, á, ã, ç, ê, ú, etc.).
   Nunca omita acentos em palavras como: você, não, segurança, preocupação, cães, etc.
   ```

3. **Reforço uma pergunta:**
   ```
   CRÍTICO: Máximo UMA pergunta por mensagem. Nunca escreva duas perguntas na mesma resposta.
   Exemplo ERRADO: "Qual o nome do seu doguinho? E qual a raça dele?"
   Exemplo CERTO: "Qual o nome do seu doguinho?" (aguarde a resposta antes de perguntar a raça)
   ```

4. **Cliente insistindo em preço:**
   ```
   Se o cliente pedir preço/valor 2+ vezes antes da triagem completa: explique em uma frase
   que o valor varia por porte/período e que precisa do nome e raça do pet. Depois faça
   APENAS a próxima pergunta da triagem (uma por vez).
   ```

---

## 5. Resumo

| Categoria | Quantidade |
|-----------|------------|
| Crítico   | 1 (placeholder literal) |
| Alto     | 2 (acentuação, múltiplas perguntas) |
| Médio    | 2 (fragmentação, preço não explicado) |
| Baixo    | 1 (saudação) |

**Prioridade:** Corrigir o placeholder e a acentuação primeiro; em seguida, reforçar a regra de uma pergunta e o handling de cliente exigente por preço.

---

## 6. Teste de Verificação (pós-ajustes) — 2026-03-10

**Objetivo:** Validar se os ajustes no prompt surtiram efeito.

### Mensagens do teste 2

1. "Oi, quero saber sobre hospedagem. Vocês cuidam bem? E quanto custa? Preciso do preço agora."
2. "Sou a Carla. Mas cadê o preço? Já te perguntei. Quanto custa a hospedagem?"
3. "O Thor. Ele é Poodle, castrado, vacinas em dia. Agora pode me dizer o preço da hospedagem?"

### Resultados

| Ajuste | Status | Observação |
|--------|--------|------------|
| **Placeholder [nome do pet]** | ✅ | Não apareceu. Agente usou "O Thor" e "seu doguinho" corretamente. |
| **Uma pergunta por mensagem** | ⚠️ Parcial | Resposta 1: ainda duas perguntas ("Com quem eu falo?" + "Como posso te chamar?"). Respostas 2 e 3: apenas UMA pergunta cada. |
| **Cliente insistindo em preço** | ✅ | Explicou: "Mas antes de falar de valores, preciso saber um pouquinho mais sobre ele." |
| **Acentuação** | ❌ | Persiste: Otimo, hospede, familia, tambem, tera, atencao. |
| **Fragmentação** | ✅ | Menos bolhas; respostas mais condensadas. |

### Conclusão do teste 2

- Placeholder e regra de preço: **funcionando**.
- Uma pergunta: **melhorou** nas respostas 2 e 3; resposta 1 ainda repete pergunta de nome.
- Acentuação: **Gemini 2.0 Flash** continua omitindo acentos; pode exigir pós-processamento ou instrução mais forte.
