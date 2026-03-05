# Relatório E2E — Agente Juliana (PPL Motors)

**Data:** 2025-03-05  
**Objetivo:** Testar de ponta a ponta o agente Juliana (PPL Motors) com cenários reais de clientes, validar ferramentas, fluxos, qualidade das respostas e registro de mensagens.

---

## 1. Escopo dos testes

- **Agente:** Juliana — PPL Motors (atendimento ao cliente / concessionária).
- **Acesso:** Sandbox em `http://localhost:8080/agents/{agentId}/sandbox` com **Modo Debug** ativado.
- **Cenários:** Cliente interessado em veículo específico; informações gerais e comparação; preços/fotos/financiamento; indecisão; objeção (quilometragem); mudança de assunto (revisão); pedido de horário e endereço.

---

## 2. Cenários executados e resultados

### 2.1 Cliente interessado em veículo específico

| Ação do usuário | Resposta da agente | Ferramentas (Debug) | Avaliação |
|-----------------|--------------------|----------------------|-----------|
| "Oi! Estou procurando um Corolla 2024. Vocês têm disponível? Qual o preço?" | Cumprimento, apresentação como Juliana da PPL Motors e pergunta "Como posso te chamar?" | 2 tool calls, 7 dispatch, ~34k tokens | **Ponto de melhoria:** Não respondeu de imediato sobre Corolla 2024 nem preço; priorizou captura do nome. Ideal: reconhecer o pedido e dizer que vai verificar, e em seguida pedir o nome. |
| "Pode me chamar de Carlos. E sobre o Corolla 2024, vocês têm? Qual o preço e condições de financiamento?" | "Muito prazer, Carlos! Verifiquei aqui no nosso estoque e no momento não estamos com o Corolla 2024 disponível. Você teria interesse em algum outro modelo parecido ou prefere que eu te avise assim que chegar um desse?" | 2 tool calls, 6 dispatch, ~34k tokens | **OK.** Consulta a estoque (tool) e resposta alinhada. Não informou financiamento porque o veículo não está disponível. |

### 2.2 Comparação de modelos, preços e fotos

| Ação do usuário | Resposta da agente | Ferramentas (Debug) | Avaliação |
|-----------------|--------------------|----------------------|-----------|
| "Quais modelos vocês têm então? Quero comparar Civic e Corolla, e saber preços e fotos se tiver." | Listou que não tem Civic no estoque; ofereceu Corolla 2.0 XEI 2019 (R$ 105.900, 120.000 km, Preto, CVT). Ofereceu enviar fotos. Em seguida enviou várias fotos do veículo (links autocerto.com). | 2 tool calls, 5 dispatch, ~30k tokens | **OK.** Uso de estoque/inventário e exibição de fotos. Resposta coerente e útil. |

### 2.3 Indecisão, objeção (km) e mudança de assunto (revisão)

| Ação do usuário | Resposta da agente | Ferramentas (Debug) | Avaliação |
|-----------------|--------------------|----------------------|-----------|
| "Não sei não, 120 mil km me preocupa. E como funciona o financiamento aí? A propósito, vocês fazem revisão no carro também?" | (1) Sobre km: "Nossos carros passam por uma revisão criteriosa para garantir sua total tranquilidade." (2) Financiamento: explicou LGPD e pediu banco, nome completo, CPF e data de nascimento para simular. (3) "Revisão" foi interpretada como revisão pré-venda dos carros. | 0 tool calls, 2 dispatch, ~24k tokens | **OK.** Tratou objeção, fluxo de financiamento e assunto “revisão” de forma contextual. Resposta sem tool (dados no prompt). |

### 2.4 Informação geral (horário e endereço)

| Ação do usuário | Resposta da agente | Ferramentas (Debug) | Avaliação |
|-----------------|--------------------|----------------------|-----------|
| "Só queria saber o horário de funcionamento e o endereço da loja." | "Carlos, a nossa loja fica na Rua Portugal, 355, no Jardim Europa, aqui em Sorocaba. Estamos abertos hoje até as 18h. Que tal passar aqui agora à tarde pra tomar um café com a gente?" | 0 tool calls, 2 dispatch, ~23k tokens | **OK.** Endereço e horário coerentes; tom próximo e convite à visita. |

---

## 3. Validação de ferramentas (tools)

- **Estoque/inventário:** Utilizado quando o cliente pergunta por veículos (Corolla 2024, modelos disponíveis, Civic x Corolla). Retornos condizentes (ex.: Corolla 2024 indisponível; Corolla 2019 disponível com preço e fotos).
- **Fotos:** Envio de múltiplas imagens do veículo (URLs autocerto.com), carregadas com status 200.
- **Financiamento:** Fluxo explicado e coleta de dados (banco, nome, CPF, data de nascimento) sem chamada de tool explícita no Debug (informação/regras no contexto do agente).
- **Dispatcher:** Debug exibiu passos de dispatch (5–7 por turno quando há consulta a estoque), sem erros visíveis de tool.

Nenhuma falha de tool ou resposta vazia/incorreta por falta de dado de ferramenta foi observada.

---

## 4. Registro e persistência de mensagens

- O histórico da conversa no sandbox foi mantido (ex.: "J Juliana 13:19 25 mensagens").
- A lista de conversas na lateral foi atualizada após cada envio (novas conversas e contagem de mensagens).
- Requisições `list_agent_conversations` (POST) para o agente Juliana retornaram **200** nesta sessão.
- Conclusão: **mensagens estão sendo gravadas e listadas corretamente** para este agente.

---

## 5. Qualidade e naturalidade das respostas

| Critério | Resultado |
|----------|-----------|
| Tom humanizado | Uso de "Carlos", convites ("tomar um café"), empatia ("Entendo sua preocupação"). |
| Consistência com o contexto | Respostas alinhadas ao estoque (disponível/indisponível), financiamento e endereço/horário. |
| Clareza | Preços e dados do veículo em formato legível; fluxo de financiamento e LGPD explicados de forma objetiva. |
| Mudança de assunto | "Revisão" e "horário/endereço" foram tratados sem perder o fio da conversa. |

**Único ajuste recomendado:** na primeira mensagem, quando o cliente já pergunta por veículo e preço, a agente poderia reconhecer o pedido antes de perguntar o nome (ex.: "Já vou verificar o Corolla 2024 para você. Enquanto isso, como posso te chamar?"), mantendo o fluxo de captura de nome.

---

## 6. Bugs e inconsistências encontrados

### 6.1 Frontend / Console

1. **Login — setState durante render (corrigido)**  
   - **Problema:** "Cannot update a component (BrowserRouter) while rendering a different component (Login)".  
   - **Causa:** Redirect `navigate("/dashboard", { replace: true })` quando `user` existe era chamado durante o render do `Login`.  
   - **Correção:** Redirect movido para `useEffect` dependente de `user` e `navigate`, mantendo `if (user) return null` para não renderizar o formulário.

2. **React Router — Future Flags**  
   - Avisos de `v7_startTransition` e `v7_relativeSplatPath` no console.  
   - Recomendação: manter o uso de `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}` no `BrowserRouter` (já documentado em `E2E-LOG-ANALYSIS.md`).

3. **Dashboard — validateDOMNesting**  
   - Aviso de `<div>` dentro de `<p>` em `RecentDeployments` (Badge).  
   - Recomendação: manter a correção com `<div>` em vez de `<p>` onde o Badge é usado (já documentada anteriormente).

### 6.2 Rede / Backend

- **chat-agent (POST):** Todas as requisições retornaram **200**.
- **list_agent_conversations (POST):** Retornou **200** para o agente Juliana nesta sessão.
- **Imagens (fotos do veículo):** Todas com **200** (autocerto.com).

Nenhum erro de rede ou falha de API foi observado durante os testes.

---

## 7. Fluxos de atendimento

| Fluxo | Status |
|-------|--------|
| Abertura (cumprimento + nome) | OK |
| Consulta a veículo específico | OK (com sugestão de melhoria na 1ª mensagem) |
| Listagem/comparação de modelos | OK |
| Exibição de preço e fotos | OK |
| Objeção (quilometragem) | OK |
| Informações sobre financiamento e coleta de dados | OK |
| Mudança de assunto (revisão) | OK |
| Horário e endereço | OK |
| Persistência e listagem de conversas | OK |

---

## 8. Recomendações para produção

1. **Prompt/instruções do agente:** Incluir orientação para, na primeira mensagem, quando o cliente já mencionar veículo ou preço, reconhecer o pedido antes (ou junto) da pergunta do nome, para evitar sensação de “não leu” a mensagem.
2. **Login:** Correção do redirect no `Login.tsx` já aplicada; validar em outros ambientes (staging/produção).
3. **Monitoramento:** Manter acompanhamento de `list_agent_conversations` (em outros agentes/tenants já foi observado 400 em sessões anteriores; ver `E2E-LOG-ANALYSIS.md`).
4. **WhatsApp:** Após conectar ao WhatsApp, repetir cenários equivalentes (veículo, preço, fotos, financiamento, horário/endereço) para garantir mesmo comportamento e latência aceitável.

---

## 9. Conclusão

O agente **Juliana (PPL Motors)** se comportou de forma **estável e coerente** nos cenários testados: ferramentas de estoque e fotos foram acionadas quando esperado, respostas foram naturais e contextualizadas, objeções e mudança de assunto foram tratadas, e as mensagens foram registradas e listadas corretamente. O único bug crítico identificado (redirect no Login) foi corrigido. Com o ajuste de UX na primeira mensagem (reconhecer pedido de veículo antes de pedir o nome), o sistema está em condições de ser utilizado em produção com conexão ao WhatsApp, desde que se mantenha o monitoramento de APIs e a validação periódica dos fluxos.
