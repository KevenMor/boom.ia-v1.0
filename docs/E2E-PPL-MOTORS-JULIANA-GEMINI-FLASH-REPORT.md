# Relatório E2E — Juliana (PPL Motors) com Gemini 2.0 Flash

**Data:** 2026-03-05  
**Modelo:** gemini-2.0-flash (Phase 2 conversacional)  
**Dispatcher:** GPT-4o-mini (Phase 1)  
**Prompt version:** v2.1.0

---

## Cenário A — Primeiro Contato com Veículo Específico (Corolla)

**Input:** "oi, vi um corolla no site de voces, quanto custa?"

| Aspecto | Resultado | Avaliação |
|---------|-----------|-----------|
| Dispatcher (Phase 1) | NO_TOOLS_NEEDED (não chamou consultar_estoque) | ✅ Regra 6 respeitada — 1º contato = saudação + nome |
| Resposta Juliana | "Olá! Eu sou a Juliana, da PPL Motors, e vou ficar responsável pelo seu atendimento por aqui. Como posso te chamar?" | ✅ Perfeito |
| Bloqueio de info no 1º contato | NÃO mencionou Corolla, preço ou estoque | ✅ APROVADO |
| Tom | Natural, profissional, sem emoji | ✅ |
| Uma pergunta | Apenas "Como posso te chamar?" | ✅ |
| Prompt length | 56.611 chars (com inventory rules) | ℹ️ Informativo |

**Resultado: ✅ APROVADO** — O Dispatcher + Gemini respeitaram perfeitamente a regra do 1º contato.

**Testado 3x consecutivas com a mesma mensagem — resposta IDÊNTICA e CONSISTENTE todas as vezes.** Isso demonstra alta estabilidade do prompt com Gemini 2.0 Flash.

---

## Análise do Pipeline (Dispatcher ↔ LLM)

### Sintonia Dispatcher ↔ Conversacional

| Aspecto | Status | Notas |
|---------|--------|-------|
| Regra 6 (1º contato = NO_TOOLS) | ✅ | Dispatcher NÃO chamou consultar_estoque mesmo com "corolla" na mensagem |
| Registry prompt loading | ✅ | Tenant slug "ppl-mortors" (legado) carregado corretamente |
| Prompt injection (hasInventory: true) | ✅ | Communication rules de SDR injetadas automaticamente |
| Gemini system-as-user workaround | ✅ | Workaround de persona ativo e funcional |

### Logs de Execução (Fluxo Completo)
```
[Prompts] Tenant slug: ppl-mortors, hasInventory: true, prompt length: 56611
[Dispatcher] Using registry prompt for tenant: ppl-mortors
[Conversational] Gemini raw response (115 chars): Olá! Eu sou a Juliana...
```

---

## Bug de UI Encontrado — Sandbox Instável

**⚠️ BUG CRÍTICO DE UI:** O sandbox da Juliana apresenta um comportamento onde a tela fica em branco após o envio da mensagem. O backend processa corretamente (confirmado via logs), mas o frontend perde o estado da conversa.

**Hipótese:** Pode estar relacionado ao tempo de resposta (latência 13.6s média) ou ao tamanho do prompt (56k chars) causando timeout na UI.

**Impacto:** Impede testes E2E visuais completos. Os cenários B, C, D, E, F precisam ser testados via WhatsApp real ou aguardar fix do bug de UI.

---

## Cenários Pendentes (não testados por bug de UI do Sandbox)

- **B — Fluxo completo: nome → estoque → fotos → agendamento** — Testar se o Dispatcher chama consultar_estoque após receber o nome e se a Juliana apresenta dados corretamente.
- **C — Troca/Avaliação (veículo nacional)** — "tenho um Cruze 2020 pra trocar" → consultar_fipe deve ser acionado.
- **D — Troca (veículo importado)** — "tenho uma BMW X3 2020" → NÃO deve chamar FIPE (regra 16).
- **E — Agendamento** — Testar check_availability → criar → confirmação com endereço.
- **F — Negociação/Handoff** — "melhor preço", "quero fechar" → deve chamar atribuir_conversa.
- **G — Horário noturno** — Testar night rule (23:30-07:00 → sem handoff).
- **H — Múltiplas perguntas** — Verificar regra de 1 pergunta por mensagem.

---

## Resumo Geral

| Aspecto | Status | Notas |
|---------|--------|-------|
| Regra do 1º contato | ✅ | Nome antes de qualquer info |
| Dispatcher - NO_TOOLS no 1º contato | ✅ | Regra 6 funcionando perfeitamente |
| Consistência de resposta | ✅ | 3 execuções idênticas |
| Tom natural e profissional | ✅ | Sem emoji, sem markdown, texto puro |
| Prompt registry loading | ✅ | Slug legado "ppl-mortors" funcional |
| Gemini workaround | ✅ | System-as-user ativo |
| Sandbox UI | 🔴 | Bug de tela branca impede testes visuais |
| Tool calling (estoque/fipe/agenda) | ⏳ | Pendente — requer fix do sandbox |

---

## Recomendações

1. **🔴 URGENTE — Fix Sandbox UI:** Investigar por que o sandbox da Juliana fica em branco após envio de mensagem. O backend responde corretamente mas o frontend perde estado.
2. **Testar via cURL:** Usar `supabase--curl_edge_functions` para simular conversas completas e testar todos os cenários de tool calling sem depender da UI.
3. **Testar cenários B-H via WhatsApp real** se o fix do sandbox demorar.
