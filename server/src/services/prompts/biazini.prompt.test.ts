import { describe, expect, it } from "vitest";
import {
  SYSTEM_PROMPT,
  COMMUNICATION_RULES,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
} from "./biazini.js";

describe("Biazini — SYSTEM_PROMPT (contratos de negócio)", () => {
  it("proíbe diminutivos absolutamente", () => {
    expect(SYSTEM_PROMPT).toMatch(/proibicao absoluta de diminutivos|PROIBICAO ABSOLUTA/i);
    expect(SYSTEM_PROMPT).toMatch(/cãozinho|gatinho|minutinho|olhadinha/i);
    expect(SYSTEM_PROMPT).toMatch(/use.*padrao.*cachorro.*gato|palavras padrao/i);
  });

  it("define modelo exclusivamente em domicílio (móvel)", () => {
    expect(SYSTEM_PROMPT).toMatch(/atendimento.*domicili[aá]r|domicili[aá]r.*exclusivamente|cl[ií]nica m[oó]vel/i);
  });

  it("define horários de funcionamento: seg-sex 09h-18h, sab 08h-12h", () => {
    expect(SYSTEM_PROMPT).toMatch(/segunda.*sexta.*09h.*18h|seg-sex.*09h.*18h/i);
    expect(SYSTEM_PROMPT).toMatch(/s[aá]bado.*08h.*12h|sab.*08h.*12h/i);
  });

  it("oferece serviços de consulta, vacinação e exames", () => {
    expect(SYSTEM_PROMPT).toMatch(/consulta|consultoria de rotina/i);
    expect(SYSTEM_PROMPT).toMatch(/vacina[çc][aã]o|V10|Raiva|Gripe|Gi[aá]rdia/i);
    expect(SYSTEM_PROMPT).toMatch(/exames?|Sangue|Urin[aá]lise/i);
  });

  it("protocolo de emergência com alerta CFMV (Resolução 1.138/2016)", () => {
    expect(SYSTEM_PROMPT).toMatch(/PROTO.*EMERGENCIA|emergencia|sangramento ativo|convuls[aã]o|atropelamento|falta de ar/i);
    expect(SYSTEM_PROMPT).toMatch(/Codigo de Etica do Medico-Veterinario|Res\. CFMV n[oº] 1\.138\/2016/i);
    expect(SYSTEM_PROMPT).toMatch(/Hospital Veterinario 24h/i);
  });

  it("fluxo de atendimento com saudação acolhedora, nome, origem e demais passos", () => {
    expect(SYSTEM_PROMPT).toMatch(/FLUXO.*OBRIGATORIO|fluxo obrigatorio/i);
    expect(SYSTEM_PROMPT).toMatch(/Saudacao acolhedora|saudacao/i);
    expect(SYSTEM_PROMPT).toMatch(/Nome do tutor/i);
    expect(SYSTEM_PROMPT).toMatch(/Origem|Como voce nos encontrou/i);
    expect(SYSTEM_PROMPT).toMatch(/Nome do pet/i);
    expect(SYSTEM_PROMPT).toMatch(/Especie e raca|especifica[çc][aã]o do pet/i);
    expect(SYSTEM_PROMPT).toMatch(/Motivo do contato/i);
    expect(SYSTEM_PROMPT).toMatch(/Endereco.*LOGISTICA/i);
    expect(SYSTEM_PROMPT).toMatch(/Agendamento/i);
    expect(SYSTEM_PROMPT).toMatch(/Encerramento/i);
  });

  it("pergunta uma por vez (regra critica)", () => {
    expect(SYSTEM_PROMPT).toMatch(/REGRA.*UMA PERGUNTA|uma pergunta por mensagem|NO MAXIMO UMA pergunta/i);
  });

  it("saudação acolhedora em 2 MENSAGENS SEPARADAS (sem perguntas na primeira)", () => {
    expect(SYSTEM_PROMPT).toMatch(/SAUDACAO.*ESTRUTURA EM 2 MENSAGENS|MENSAGEM 1.*ACOLHIMENTO PURO/i);
    expect(SYSTEM_PROMPT).toMatch(/SEM perguntas na saudacao inicial|PRIMEIRA MENSAGEM tem ZERO perguntas/i);
    expect(SYSTEM_PROMPT).toMatch(/A pergunta vem DEPOIS.*mensagem separada/i);
    expect(SYSTEM_PROMPT).toMatch(/Fico muito feliz em te atender|carinho genuino/i);
  });

  it("proíbe redundância de perguntas (anti-duplicação)", () => {
    expect(SYSTEM_PROMPT).toMatch(/REGRA CRITICA DE ANTI-REDUNDANCIA|PROIBICAO ABSOLUTA.*redundancia/i);
    expect(SYSTEM_PROMPT).toMatch(/duas perguntas com o MESMO SIGNIFICADO|mesmo conceito|mesma coisa com palavras diferentes/i);
    expect(SYSTEM_PROMPT).toMatch(/Qual seu nome.*Como posso te chamar|DUAS PERGUNTAS SOBRE O MESMO ASSUNTO/i);
    expect(SYSTEM_PROMPT).toMatch(/DELETE uma delas antes de enviar|TRAVA OBRIGATORIA/i);
  });

  it("integra humanização avançada e validação ativa", () => {
    expect(SYSTEM_PROMPT).toMatch(/HUMANIZACAO AVANCADA|VALIDACAO ATIVA/i);
    expect(SYSTEM_PROMPT).toMatch(/Antes de fazer uma nova pergunta.*valide a resposta anterior/i);
    expect(SYSTEM_PROMPT).toMatch(/anotado|Que nome lindo/i);
  });

  it("integra calendário com tool calling (busca e criação)", () => {
    expect(SYSTEM_PROMPT).toMatch(/INTEGRACAO DE CALENDARIO|PASSO 5A.*BUSCA|PASSO 5B.*CRIAR/i);
    expect(SYSTEM_PROMPT).toMatch(/busca_disponibilidade_calendario|criar_evento_calendario/i);
    expect(SYSTEM_PROMPT).toMatch(/Tenho um horário livre.*10h|ofereça 2 opcoes REAIS/i);
  });

  it("ocultação de tecnologia - frases naturais de transição", () => {
    expect(SYSTEM_PROMPT).toMatch(/TRANSICOES HUMANAS|Só um momento.*vou dar uma olhada|Deixa eu verificar/i);
    expect(SYSTEM_PROMPT).toMatch(/FRASES PROIBIDAS.*ferramenta de busca|Processando calendario|Consultando banco de dados/i);
  });

  it("JSON de dados inclui data_agendada com timestamp", () => {
    expect(SYSTEM_PROMPT).toMatch(/"data_agendada".*Data e Hora confirmadas|YYYY-MM-DD HH:MM/i);
  });

  it("extração de dados em JSON ao final do atendimento", () => {
    expect(SYSTEM_PROMPT).toMatch(/"tutor"|"pet_nome"|"pet_especie"|"pet_raca"|"motivo"|"endereco_bairro"|"data_turno_desejado"/);
    expect(SYSTEM_PROMPT).toMatch(/bloco JSON|JSON no formato|sem formatacao markdown/i);
  });

  it("nunca forneça diagnósticos ou prescrições", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA.*diagnostico|nunca.*dica.*medica|prescrição.*remedio/i);
  });

  it("versão do prompt registrada", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.0\.0/);
  });
});

describe("Biazini — COMMUNICATION_RULES (tom e estilo)", () => {
  it("proíbe diminutivos em regras de comunicação", () => {
    expect(COMMUNICATION_RULES).toMatch(/PROIBICAO ABSOLUTA DE DIMINUTIVOS|proibicao.*diminutivos/i);
    expect(COMMUNICATION_RULES).toMatch(/ZERO TOLERANCIA/i);
  });

  it("restringe emojis (máximo um por mensagem ou nenhum)", () => {
    expect(COMMUNICATION_RULES).toMatch(/emojis.*restricao severa|use emojis.*MUITO restrito|maximo um por mensagem|nenhum/i);
  });

  it("regra de uma pergunta por mensagem", () => {
    expect(COMMUNICATION_RULES).toMatch(/REGRA CRITICA DE UMA PERGUNTA|NO MAXIMO UMA pergunta/i);
  });

  it("separa blocos de texto com linhas em branco", () => {
    expect(COMMUNICATION_RULES).toMatch(/SEPARE.*linha em branco|quebra de linha dupla|baloes separados/i);
  });

  it("proíbe markdown (negrito, itálico)", () => {
    expect(COMMUNICATION_RULES).toMatch(/NUNCA.*formatacao markdown|texto puro/i);
  });
});

describe("Biazini — DISPATCHER_PROMPT (decisão de tools)", () => {
  it("menciona ferramentas de calendário (busca e criação)", () => {
    expect(DISPATCHER_PROMPT).toMatch(/busca_disponibilidade_calendario|criar_evento_calendario/i);
  });

  it("aciona busca_disponibilidade_calendario quando cliente menciona dia/turno", () => {
    expect(DISPATCHER_PROMPT).toMatch(/CALENDAR TOOL DETECTION|próxima segunda|terça|quarta|quinta|sexta|sábado|manhã|tarde/i);
  });

  it("aciona criar_evento_calendario após confirmação final", () => {
    expect(DISPATCHER_PROMPT).toMatch(/CALENDAR EVENT CREATION|pode ser|perfeito|ok|tá bom|confirma|EXPLICIT confirmation/i);
  });

  it("aciona alertaia em caso de emergência", () => {
    expect(DISPATCHER_PROMPT).toMatch(/emergencia|EMERGENCY|bleeding|seizure|accident|breathing difficulty/i);
  });

  it("aciona alertaia para billing/pricing/cancelamento", () => {
    expect(DISPATCHER_PROMPT).toMatch(/BILLING|PRICING|CANCELLATION|pagar|preço|cancelar|desmarcar/i);
  });

  it("detecta emergências com máxima prioridade", () => {
    expect(DISPATCHER_PROMPT).toMatch(/maximum priority|life-threatening/i);
  });

  it("prefere NO_TOOLS_NEEDED durante triagem", () => {
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED.*most common|early triaging/i);
  });

  it("nunca chama ferramentas antes de address confirmado", () => {
    expect(DISPATCHER_PROMPT).toMatch(/NEVER call.*before address is confirmed|NEVER call during triaging/i);
  });
});

describe("Biazini — FOLLOWUP_PROMPT (automação)", () => {
  it("varia tom conforme tentativas", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/Tentativa 1|Tentativa 2|Tentativa 3/i);
    expect(FOLLOWUP_PROMPT).toMatch(/leve e calorosa|prestativa e objetiva|direta e respeitosa/i);
  });

  it("proíbe alucinação de dados", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/REGRA CRITICA ANTI-ALUCINACAO|NUNCA invente|historico da conversa/i);
  });

  it("sem diminutivos em follow-ups", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/NAO use diminutivos|Mantenha linguagem profissional/i);
  });
});
