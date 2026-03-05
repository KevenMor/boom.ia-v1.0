# Relatório E2E — Agente Tia Ana (Pet Home)

**Data:** 2026-03-05  
**Objetivo:** Validar humanização, fluxo de triagem, política de porte, apresentação de valores e adaptação a diferentes perfis de clientes.  
**Versão do prompt:** v1.0.0

---

## 1. Escopo dos Testes

- **Agente:** Tia Ana — Pet Home (hotel e creche para cães, Sorocaba/SP)
- **Acesso:** Sandbox com Modo Debug ativado
- **Foco:** Humanização do atendimento, triagem sequencial, bloqueio de raças, apresentação personalizada de valores, e variação de perfis de clientes

---

## 2. Perfis de Clientes Simulados

| # | Perfil | Descrição | Objetivo do Teste |
|---|--------|-----------|-------------------|
| A | Tutora carinhosa e detalhista | Faz muitas perguntas, quer saber tudo antes de decidir | Paciência, respostas completas sem acumular perguntas |
| B | Tutor objetivo e apressado | Quer preço rápido, sem rodeios | Respeitar triagem mesmo sob pressão, sem pular etapas |
| C | Tutora indecisa e insegura | Primeira vez deixando o pet, medo de separação | Empatia, acolhimento, explicação da adaptação gradual |
| D | Tutor com raça bloqueada | Possui Pit Bull ou Rottweiler | Recusa empática sem transferência para Tia Erica |
| E | Tutora com múltiplos pets | Dois cães de portes diferentes | Coleta agrupada, termos coletivos |
| F | Tutor questionador ("é robô?") | Testa identidade da Tia Ana | Manutenção da identidade humana |

---

## 3. Cenários e Resultados Esperados

### 3.1 Cenário A — Tutora carinhosa e detalhista (Creche)

| # | Mensagem do Cliente | Resposta Esperada | Validação |
|---|---------------------|-------------------|-----------|
| 1 | "Oii, boa tarde! Vi vocês no Instagram e achei tudo lindo! Queria saber sobre a creche pra minha bebê" | Saudação calorosa ("Ótima tarde!"), apresentação como Tia Ana, pergunta "Com quem eu falo?" | ✅ Sem emoji, sem markdown, sem valor, 1 pergunta |
| 2 | "Meu nome é Camila! E a minha pequena é a Luna" | Recepcionar Camila e Luna com carinho. Perguntar interesse (creche ou hospedagem) — ou, se já claro, ir para raça | ✅ Usa nome com moderação, 1 pergunta |
| 3 | "Creche mesmo! Ela é uma Shih Tzu" | Confirmar raça, perguntar se é castrada | ✅ Não pula para vacinas, 1 pergunta por vez |
| 4 | "Sim, castradinha!" | Perguntar sobre vacinas | ✅ Sequência respeitada |
| 5 | "Todas em dia!" | Triagem completa → apresentar serviço de creche (funcionamento, diferenciais) em parágrafos naturais. Em seguida, apresentar valores personalizados para Luna (porte pequeno) | ✅ Valores em lista, menciona "Luna (porte pequeno)", inclui adaptação R$ 80 |
| 6 | "Que legal! Quero agendar a adaptação!" | Mensagem de transferência para Tia Erica. Chamar tool alertaia | ✅ Tool chamada, mensagem padrão de transferência |

**Critérios de humanização:**
- [ ] Tom caloroso e direto em todas as mensagens
- [ ] Nenhum emoji em nenhuma resposta
- [ ] Nenhuma formatação markdown
- [ ] Máximo 1 pergunta por mensagem
- [ ] Blocos separados por linha em branco
- [ ] Valores apresentados SOMENTE após triagem completa
- [ ] Valores em formato de lista (não texto corrido)
- [ ] Menção ao nome da Luna no orçamento

---

### 3.2 Cenário B — Tutor objetivo e apressado (Creche)

| # | Mensagem do Cliente | Resposta Esperada | Validação |
|---|---------------------|-------------------|-----------|
| 1 | "Quanto custa a creche? Preciso de um orçamento rápido" | Saudação + "Com quem eu falo?" — NÃO apresentar valores | ✅ Triagem não pode ser pulada |
| 2 | "Paulo. Meu cachorro é o Thor, Poodle macho castrado, vacinas ok. Quanto fica?" | Confirmar dados recebidos. Mesmo com tudo junto, apresentar serviço brevemente + valores para Thor (porte pequeno) | ✅ Aceita dados agrupados, não repergunta o que já foi dito |
| 3 | "5x por semana, como faz pra começar?" | Transferir para Tia Erica via alertaia | ✅ Tool chamada |

**Critérios específicos:**
- [ ] Não apresentou valores antes de ter nome + pet + raça + castração + vacinas
- [ ] Aceitou informações agrupadas sem repedir
- [ ] Não acumulou perguntas desnecessárias

---

### 3.3 Cenário C — Tutora insegura, primeira vez (Hospedagem)

| # | Mensagem do Cliente | Resposta Esperada | Validação |
|---|---------------------|-------------------|-----------|
| 1 | "Oi, nunca deixei meu cachorrinho em nenhum lugar, tenho muito medo. Vou viajar e não tenho com quem deixar ele" | Saudação empática, acolhimento ("Entendo sua preocupação"), pergunta nome | ✅ Empatia antes de triagem |
| 2 | "Sou a Fernanda, e ele é o Bidu, um Yorkshire de 3 anos" | Recepcionar com carinho, perguntar se é castrado | ✅ Sequência mantida |
| 3 | "Sim, ele é bem medroso com outros cachorros, tenho medo dele sofrer" | Explicar adaptação gradual no ritmo do pet, sem recusa automática. Perguntar vacinas | ✅ Não recusa pet medroso, explica processo |
| 4 | "Vacinas em dia. Seria do dia 10 ao dia 15 do mês que vem" | Triagem completa com datas → apresentar hospedagem (funcionamento 24h, equipe presente, acompanhamento WhatsApp) + valores | ✅ Verifica se datas são alta temporada. Se fora, apresenta valores |
| 5 | "Ele vai ficar bem mesmo?" | Reforçar segurança, equipe 24h, grupos compatíveis, adaptação no ritmo dele. Sem inventar informações | ✅ Empatia contínua, sem promessas falsas |

**Critérios específicos:**
- [ ] Empatia genuína com medo de separação
- [ ] Explicação da adaptação gradual para pet medroso
- [ ] Não recusou o pet por ser medroso
- [ ] Verificação de alta temporada nas datas

---

### 3.4 Cenário D — Tutor com raça bloqueada (Pit Bull)

| # | Mensagem do Cliente | Resposta Esperada | Validação |
|---|---------------------|-------------------|-----------|
| 1 | "Boa tarde, quero saber sobre creche pro meu cachorro" | Saudação + "Com quem eu falo?" | ✅ Fluxo normal |
| 2 | "Sou o Ricardo, o dog é o Zeus" | Perguntar raça | ✅ Sequência |
| 3 | "Ele é um Pit Bull, super dócil" | Informar com empatia que não é possível atender por política de segurança. NÃO apresentar valores, NÃO agendar, NÃO transferir para Tia Erica | ✅ Bloqueio empático, sem tool chamada |

**Critérios específicos:**
- [ ] Recusa empática e respeitosa
- [ ] Não transferiu para Tia Erica
- [ ] Não apresentou valores
- [ ] Encerrou cordialmente

---

### 3.5 Cenário E — Tutora com 2 pets (Creche)

| # | Mensagem do Cliente | Resposta Esperada | Validação |
|---|---------------------|-------------------|-----------|
| 1 | "Oi! Tenho dois cachorrinhos e queria saber da creche pra eles" | Saudação + "Com quem eu falo?" | ✅ |
| 2 | "Marina! São o Pipoca e a Mel" | Perguntar raça dos dois (pode agrupar: "Me conta a raça dos doguinhos?") | ✅ Termos coletivos |
| 3 | "Pipoca é Lhasa Apso e Mel é Maltês, os dois castrados e vacinas em dia" | Triagem completa → apresentar serviço + valores (ambos porte pequeno) | ✅ Aceita info agrupada, valores para cada pet ou indicação de valor por pet |

**Critérios específicos:**
- [ ] Usou termos coletivos ("doguinhos", "eles")
- [ ] Coletou informações de forma agrupada
- [ ] Valores personalizados para ambos

---

### 3.6 Cenário F — Tutor questionador ("é robô?")

| # | Mensagem do Cliente | Resposta Esperada | Validação |
|---|---------------------|-------------------|-----------|
| 1 | "Oi, isso aqui é um robô?" | "Sou a Tia Ana, da Pet Home. Vou te ajudar por aqui. Me conta sobre o seu doguinho!" | ✅ Identidade mantida, redirecionamento natural |
| 2 | "Sério que é uma pessoa? Parece automático" | Manter identidade, redirecionar para atendimento. NÃO mencionar IA/bot/sistema | ✅ Sem quebra de persona |

**Critérios específicos:**
- [ ] Nunca mencionou IA, robô, bot, sistema, automação
- [ ] Redirecionou para o atendimento naturalmente

---

## 4. Validação de Regras Globais

| Regra | Descrição | Como Validar |
|-------|-----------|--------------|
| Sem emojis | ZERO emojis em todas as respostas | Verificar cada resposta |
| Sem markdown | Sem negrito, itálico, sublinhado | Verificar formatação |
| 1 pergunta/mensagem | Nunca acumular perguntas | Contar perguntas por bloco |
| Blocos separados | Linha em branco entre blocos | Verificar quebras de linha |
| Triagem antes de valores | NUNCA informar preço sem triagem completa | Verificar sequência |
| Valores em lista | Formato lista obrigatório para orçamentos | Verificar formato |
| Sem frases de espera | "Um instante", "vou verificar" proibidos | Buscar nas respostas |
| Anti-vazamento técnico | Sem nomes de tools, JSON, termos internos | Verificar cada resposta |
| Adaptação R$ 80 | Sempre mencionar junto ao orçamento | Verificar nos valores |
| Porte pequeno focus | Sem menções a médio/grande porte nos valores | Verificar contexto |

---

## 5. Validação de Ferramentas (Tools)

| Ferramenta | Quando deve ser chamada | Quando NÃO deve ser chamada |
|------------|------------------------|-----------------------------|
| alertaia | Após orçamento + cliente quer prosseguir; alta temporada; agendamento; visita; juros | Durante triagem; saudação; perguntas gerais; raça bloqueada |

---

## 6. Checklist de Humanização

- [ ] Tia Ana demonstra simpatia genuína (não genérica)
- [ ] Respostas adaptadas ao tom do cliente (carinhosa → carinhosa, objetiva → direta)
- [ ] Valores apresentados de forma personalizada (nome do pet, porte específico)
- [ ] Sem listas extensas desnecessárias — valores focados no que o cliente precisa
- [ ] Empatia real com medos e preocupações do tutor
- [ ] Bloqueio de raças feito com compaixão, sem frieza
- [ ] Identidade humana mantida sob questionamento
- [ ] Nenhuma resposta robótica ou formulaica
- [ ] Variação nas estruturas de frase (sem repetição de padrões)
- [ ] Conhecimento específico sobre cães de pequeno porte

---

## 7. Cenários de Borda

### 7.1 Cliente menciona gato
- **Esperado:** Informar com gentileza que a Pet Home é especializada em cães. Não transferir para Tia Erica.

### 7.2 Cliente pede preço na primeira mensagem
- **Esperado:** NÃO informar preço. Iniciar triagem (nome → pet → raça → castração → vacinas).

### 7.3 Cliente menciona alta temporada (dezembro/janeiro)
- **Esperado:** NÃO apresentar valores. Transferir para Tia Erica via alertaia.

### 7.4 Vacinas incompletas
- **Esperado:** NÃO bloquear atendimento. Orientar que será necessário atualizar, continuar normalmente.

### 7.5 Fêmea no cio
- **Esperado:** Informar que não pode frequentar durante o período. Orientar a retornar depois.

### 7.6 Macho não castrado (adulto)
- **Esperado:** Informar que castração é obrigatória para machos. Orientar sem recusar o cliente.

### 7.7 Mestiço de raça bloqueada
- **Esperado:** Mesmo tratamento de raça bloqueada — recusa empática, sem transferência.

---

## 8. Métricas de Qualidade

| Métrica | Alvo |
|---------|------|
| Emojis por conversa | 0 (zero absoluto) |
| Perguntas acumuladas por mensagem | Máximo 1 |
| Etapas puladas na triagem | 0 |
| Valores antes da triagem completa | 0 ocorrências |
| Quebra de identidade | 0 ocorrências |
| Menções a médio/grande porte | 0 |
| Vazamentos técnicos (nomes de tools, JSON) | 0 |
| Transferências para Tia Erica em raça bloqueada | 0 (deve encerrar, não transferir) |

---

## 9. Como Executar os Testes

1. Acesse o Sandbox do agente Tia Ana com **Modo Debug ativado**
2. Execute cada cenário (A-F) sequencialmente em conversas separadas
3. Para cada mensagem, verifique:
   - Conteúdo da resposta (tom, empatia, precisão)
   - Ferramentas chamadas no painel Debug
   - Ausência de emojis, markdown, vazamentos técnicos
4. Preencha os checkboxes de validação
5. Documente anomalias na seção de Resultados abaixo

---

## 10. Resultados (Execução: 2026-03-05)

### Cenário A — Tutora carinhosa (Camila + Luna, Shih Tzu) ✅ APROVADO
| Turno | Status | Observações |
|-------|--------|-------------|
| 1 | ✅ | Saudação calorosa, apresentação como Tia Ana, perguntou "Com quem eu falo?". Sem emoji, sem markdown. ⚠️ Blocos não separados por linha em branco (saudação + pergunta no mesmo bloco). |
| 2 | ✅ | "Prazer em te conhecer, Camila! A Luna ja tem um nome de princesa. Qual e a raca da Luna ou o porte dela caso seja vira-lata?" — Tom caloroso, 1 pergunta. Pulou pergunta de interesse (creche), mas a cliente já mencionou na msg 1. |
| 3 | ✅ | "Entendi, Shih Tzu sao uma fofura mesmo. A Luna ja e castrada?" — Sequência correta (raça → castração). |
| 4 | ✅ | "Que otimo que ela ja e castradinha, Camila. As vacinas da Luna estao todas em dia, como a V8 ou V10, a da gripe e a de giardia?" — Sequência correta (castração → vacinas). |
| 5 | ✅ | Triagem completa → apresentou serviço em 3 blocos separados (socialização, acompanhamento WhatsApp, adaptação R$ 80). Perguntou se pode passar valores. |
| 6 | ✅ | **Valores perfeitos:** "Para a Luna (porte pequeno), na creche:" seguido de lista com 5 frequências + adaptação R$ 80. "Qual frequencia funciona melhor para voces?" |

**Checklist Cenário A:**
- [x] Tom caloroso e direto
- [x] Zero emojis
- [x] Zero markdown
- [x] Máximo 1 pergunta por mensagem
- [x] Valores SOMENTE após triagem completa
- [x] Valores em formato lista
- [x] Menção ao nome da Luna no orçamento
- [x] Adaptação R$ 80 mencionada
- [ ] ⚠️ Blocos nem sempre separados por linha em branco no turno 1

### Cenário B — Tutor objetivo (Paulo + Thor, Poodle)
| Turno | Status | Observações |
|-------|--------|-------------|
| 1 | ⬜ | Não executado |
| 2 | ⬜ | Não executado |
| 3 | ⬜ | Não executado |

### Cenário C — Tutora insegura (Fernanda + Bidu, Yorkshire)
| Turno | Status | Observações |
|-------|--------|-------------|
| 1 | ⬜ | Não executado |
| 2 | ⬜ | Não executado |
| 3 | ⬜ | Não executado |
| 4 | ⬜ | Não executado |
| 5 | ⬜ | Não executado |

### Cenário D — Raça bloqueada (Ricardo + Zeus, Pit Bull) ✅ APROVADO
| Turno | Status | Observações |
|-------|--------|-------------|
| 1 | ✅ | Saudação + perguntou nome do tutor e pet. Usou "Otima noite" — horário real era 18:20 (Brasília), portanto CORRETO. O sandbox exibe UTC (13:20) mas o agente recebe o timezone correto. |
| 2 | ✅ | "Prazer em te atender, Ricardo! Qual e a raca do Zeus?" — 1 pergunta, tom correto. |
| 3 | ✅ | **Bloqueio perfeito:** "Ricardo, infelizmente por uma politica de seguranca voltada ao bem-estar coletivo, nao conseguimos atender Pit Bull aqui na Pet Home. Agradeco a compreensao e desejo tudo de bom para voces!" — Empático, sem tool chamada, sem transferência, sem valores. |

**Checklist Cenário D:**
- [x] Recusa empática e respeitosa
- [x] Não transferiu para Tia Erica
- [x] Não apresentou valores
- [x] Encerrou cordialmente
- [x] Zero emojis
- [x] Zero markdown

### Cenário E — Múltiplos pets (Marina + Pipoca e Mel)
| Turno | Status | Observações |
|-------|--------|-------------|
| 1 | ⬜ | Não executado |
| 2 | ⬜ | Não executado |
| 3 | ⬜ | Não executado |

### Cenário F — Questionador ("é robô?")
| Turno | Status | Observações |
|-------|--------|-------------|
| 1 | ⬜ | Não executado |
| 2 | ⬜ | Não executado |

---

## 11. Bugs e Melhorias Identificados

| # | Tipo | Descrição | Severidade |
|---|------|-----------|------------|
| 1 | ~~Bug~~ OK | ~~Contexto temporal incorreto~~ — Confirmado que o horário real era 18:20 (Brasília). O sandbox exibe UTC (13:20), mas o agente recebe o timezone correto. "Otima noite" estava CORRETO. | — |
| 2 | Melhoria | Turno 1 do Cenário A: saudação e pergunta no mesmo bloco sem separação por linha em branco. Deveria ser 2 bolhas separadas. | Baixa |
| 3 | OK | Triagem respeitada em 100% dos turnos — valores nunca apresentados antes da coleta completa. | — |
| 4 | OK | Bloqueio de raça funcionou perfeitamente — empático, sem tool, sem transferência. | — |
| 5 | OK | Valores personalizados com nome do pet e porte no formato lista. | — |

---

## 12. Conclusão Parcial

Dos **6 cenários planejados**, **2 foram executados** (A e D) com **aprovação total**.

**Destaques positivos:**
- Triagem sequencial rigorosamente respeitada
- Bloqueio de raça empático e correto (sem transferência indevida)
- Valores personalizados em formato lista com nome do pet
- Zero emojis, zero markdown, zero vazamentos técnicos
- Tom caloroso e natural em todas as respostas

**Pendências:** Cenários B (objetivo), C (insegura), E (múltiplos pets) e F (questionador) aguardam execução.

---

## 13. Recomendações

1. **Corrigir timezone** — Verificar contexto temporal do agente para usar saudação correta (dia/tarde/noite)
2. **Separação de blocos** — Reforçar no prompt que a saudação inicial DEVE ser separada da pergunta por linha em branco
3. **Executar cenários restantes** — Priorizar C (insegura) e F (questionador) por testarem empatia e identidade
