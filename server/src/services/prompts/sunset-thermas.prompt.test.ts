import { describe, expect, it } from "vitest";
import {
  appendSunsetConversationContext,
  COMMUNICATION_RULES,
  conversationDeclaresLodgingIntent,
  detectSunsetSiteFormMessage,
  DISPATCHER_PROMPT,
  FOLLOWUP_PROMPT,
  messageDeclaresLodgingIntent,
  messageDeclaresParkDayVisitQuestion,
  SUNSET_FORM_DIALOGUE_EXAMPLE,
  SYSTEM_PROMPT,
} from "./sunset-thermas.js";
import { buildSystemPrompt } from "./registry.js";

describe("Sunset Thermas Park — SYSTEM_PROMPT (contratos de negócio)", () => {
  it("versão do prompt atualizada (rastreio de deploy)", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.5\.16/);
  });

  it("mantém regra suprema de valores e vaga (tolerância zero)", () => {
    expect(SYSTEM_PROMPT).toMatch(/REGRA SUPREMA/i);
    expect(SYSTEM_PROMPT).toMatch(/NUNCA.*inventa.*valores|n[aã]o.*inventa.*valores/i);
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o confirma disponibilidade/i);
  });

  it("preserva tabela oficial com Chalés R$ 552,00 / R$ 782,00 / R$ 1.012,00", () => {
    expect(SYSTEM_PROMPT).toMatch(/R\$\s*552,00/);
    expect(SYSTEM_PROMPT).toMatch(/R\$\s*782,00/);
    expect(SYSTEM_PROMPT).toMatch(/R\$\s*1\.012,00/);
  });

  it("mantém validade até 21/12/2026 e exclusões de datas especiais (como conhecimento interno)", () => {
    expect(SYSTEM_PROMPT).toMatch(/21\/12\/2026/);
    expect(SYSTEM_PROMPT).toMatch(/Carnaval/i);
    expect(SYSTEM_PROMPT).toMatch(/Natal/i);
    expect(SYSTEM_PROMPT).toMatch(/R[eé]veillon/i);
  });

  it("mantém cortesia de uma criança até 12 anos em qualquer acomodação (regra interna)", () => {
    expect(SYSTEM_PROMPT).toMatch(/at[eé] 12 anos/i);
    expect(SYSTEM_PROMPT).toMatch(/cortesia/i);
    expect(SYSTEM_PROMPT).toMatch(/qualquer acomoda[cç][aã]o/i);
  });
});

describe("Sunset Thermas Park — §00d MENSAGEM PADRÃO DO SITE", () => {
  it("declara a seção 00d com gatilhos do formulário do site", () => {
    expect(SYSTEM_PROMPT).toMatch(/00d\)/);
    expect(SYSTEM_PROMPT).toMatch(/MENSAGEM PADR[AÃ]O DO SITE/i);
    expect(SYSTEM_PROMPT).toMatch(/Gostaria de verificar disponibilidade/i);
  });

  it("lista os rótulos estruturados que vêm do formulário", () => {
    expect(SYSTEM_PROMPT).toMatch(/Acomoda[cç][aã]o:/);
    expect(SYSTEM_PROMPT).toMatch(/Check-in:/);
    expect(SYSTEM_PROMPT).toMatch(/Check-out:/);
    expect(SYSTEM_PROMPT).toMatch(/Total de noites:/);
    expect(SYSTEM_PROMPT).toMatch(/Adultos:/);
    expect(SYSTEM_PROMPT).toMatch(/Crian[cç]as:/);
  });

  it("mapeia 'Chalé Aconchegante' para a linha 'Chalés' da tabela oficial", () => {
    expect(SYSTEM_PROMPT).toMatch(/Chal[eé] Aconchegante/i);
    expect(SYSTEM_PROMPT).toMatch(/Chal[eé] Aconchegante[^\n]*Chal[eé]s|Chal[eé]s[^\n]*Chal[eé] Aconchegante/i);
  });

  it("cobre as 6 categorias oficiais no mapeamento Acomodação→Tabela", () => {
    expect(SYSTEM_PROMPT).toMatch(/Su[ií]te Luxo sem varanda/i);
    expect(SYSTEM_PROMPT).toMatch(/Su[ií]te Luxo com varanda/i);
    expect(SYSTEM_PROMPT).toMatch(/Su[ií]te Luxo Master com varanda/i);
    expect(SYSTEM_PROMPT).toMatch(/Apartamento vista piscina e represa/i);
    expect(SYSTEM_PROMPT).toMatch(/Loft Premium com SPA/i);
  });

  it("proíbe repetir as perguntas que já vieram preenchidas no formulário", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o.*pergunte de novo|N[aã]o.*repita/i);
    expect(SYSTEM_PROMPT).toMatch(/check-in/i);
    expect(SYSTEM_PROMPT).toMatch(/check-out/i);
    expect(SYSTEM_PROMPT).toMatch(/quantos adultos|quantas crian[cç]as|categoria/i);
  });

  it("define o cálculo de pessoas pagantes descontando 1 criança até 12 anos", () => {
    expect(SYSTEM_PROMPT).toMatch(/pessoas pagantes/i);
    expect(SYSTEM_PROMPT).toMatch(/descontando.*1 crian[cç]a.*at[eé] 12|1 crian[cç]a.*at[eé] 12.*cortesia/i);
    expect(SYSTEM_PROMPT).toMatch(/2 adultos \+ 1 crian[cç]a.*= 2 pagantes|2 adultos \+ 1 crian[cç]a.*02 pessoas/i);
  });

  it("ressalva ocupações fora da tabela e categorias com preço único (Loft, Master)", () => {
    expect(SYSTEM_PROMPT).toMatch(/Loft.*pre[cç]o [uú]nico|Loft.*valor [uú]nico/i);
    expect(SYSTEM_PROMPT).toMatch(/Master.*valor [uú]nico|Master.*at[eé] 04 pessoas/i);
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o invente valor|encaminhe.*reserva humana/i);
  });

  it("define o roteiro em TURNOS com valor e CTA distribuídos", () => {
    expect(SYSTEM_PROMPT).toMatch(/Roteiro em TURNOS/i);
    expect(SYSTEM_PROMPT).toMatch(/sunsetthermaspark\.com\.br\/hotel\.php/);
    expect(SYSTEM_PROMPT).toMatch(/\(15\)\s*99860-5662/);
  });

  it("exige fluxo em turnos curtos, uma coisa por bolha (sem despejar tudo junto)", () => {
    expect(SYSTEM_PROMPT).toMatch(/RITMO DE CONVERSA|em TURNOS|uma (intenção|coisa) por bolha/i);
    expect(SYSTEM_PROMPT).toMatch(/NUNCA[^\n]*despejando|n[aã]o[^\n]*despeja/i);
  });

  it("Turno 1 sem nome: SÓ saudação + apresentação + pergunta de nome (sem confirmar/valor/CTA)", () => {
    expect(SYSTEM_PROMPT).toMatch(/Turno 1[^\n]*Sem nome|primeira bolha[^\n]*APENAS|primeira bolha[^\n]*apenas/i);
    expect(SYSTEM_PROMPT).toMatch(/NADA MAIS|sem confirmar dados|n[aã]o cite valor/i);
  });

  it("Turno 2: confirmação curta dos dados + convite curto, sem valor ainda e SEM pedir cliente conferir calendário", () => {
    expect(SYSTEM_PROMPT).toMatch(/Turno 2/i);
    expect(SYSTEM_PROMPT).toMatch(/Confirma[cç][aã]o.*curta|confirme.*dados.*curt/i);
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o cite valor ainda|n[aã]o cite valor/i);
    expect(SYSTEM_PROMPT).toMatch(/N[AÃ]O[^\n]*mencione o calend[aá]rio ao cliente|n[aã]o[^\n]*mencionar calend[aá]rio.*cliente/i);
  });

  it("Turno 3 §00d: cita valor de UMA única categoria (a mapeada do formulário)", () => {
    expect(SYSTEM_PROMPT).toMatch(/Turno 3/i);
    expect(SYSTEM_PROMPT).toMatch(/UMA [uú]nica categoria|uma [uú]nica categoria/);
    expect(SYSTEM_PROMPT).toMatch(/SOMENTE no caso §00d|formul[aá]rio com categoria/i);
  });

  it("Turno 4: CTA único de reserva, somente após valor / dúvida resolvida", () => {
    expect(SYSTEM_PROMPT).toMatch(/Turno 4/i);
    expect(SYSTEM_PROMPT).toMatch(/CTA [uú]nico/i);
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o mande CTA junto|CTA solto vira press[aã]o|N[aã]o mande CTA sem antes/i);
  });

  it("proíbe juntar saudação + nome + confirmação + valor + CTA na mesma bolha", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o cole "saud[aã]o\s*\+\s*nome|na mesma bolha|Erro grave/i);
  });

  it("proíbe pedir ao cliente para conferir calendário/funcionamento no site (política v1.3.0)", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o[^\n]*pe[cç]a[^\n]*conferir calend[aá]rio|N[aã]o[^\n]*pe[cç]a[^\n]*funcionamento do parque no site/i);
  });

  it("00c aponta para 00d quando o gatilho do formulário é detectado", () => {
    expect(SYSTEM_PROMPT).toMatch(/Exce[cç][aã]o[^\n]*00d|siga\s*§00d/i);
  });
});

describe("Sunset Thermas Park — FILTRO INTERNO de validade/exclusões e cortesia (v1.3.1)", () => {
  it("declara validade/exclusões como FILTRO INTERNO, não como disclaimer ao cliente", () => {
    expect(SYSTEM_PROMPT).toMatch(/FILTRO INTERNO/i);
    expect(SYSTEM_PROMPT).toMatch(/N[AÃ]O\s+(é\s+)?disclaimer ao cliente|n[aã]o[^\n]*disclaimer espont[aâ]neo|n[aã]o despeja[^\n]*regra/i);
  });

  it("Turno 3 manda cotar enxuto: valor + pacote, sem despejar cortesia genérica nem validade/exclusões", () => {
    expect(SYSTEM_PROMPT).toMatch(/Resposta enxuta/i);
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o\*{0,2}\s+\*{0,2}explique\s+\*{0,2}cortesia gen[eé]rica/i);
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o\*{0,2}\s+\*{0,2}diga\s+\*{0,2}"valores v[aá]lidos at[eé] 21\/12\/2026"|n[aã]o liste exclus[oõ]es de datas especiais/i);
  });

  it("só menciona cortesia/validade/exclusões sob pergunta ou quando regra nega/altera a cotação", () => {
    expect(SYSTEM_PROMPT).toMatch(/\*\*S[oó]\*\* mencione|sob pergunta|cliente perguntar/i);
    expect(SYSTEM_PROMPT).toMatch(/negar|nega\/altera|nega[^\n]*cota[cç][aã]o/i);
  });

  it("define caminho explícito quando data CAI em exclusão (não cota, encaminha humano)", () => {
    expect(SYSTEM_PROMPT).toMatch(/Quando voc[eê] PRECISA mencionar validade\/exclus[aã]o|cai em exclus[aã]o|cair em qualquer exclus[aã]o/i);
    expect(SYSTEM_PROMPT).toMatch(/N[AÃ]O cote|n[aã]o cote/i);
    expect(SYSTEM_PROMPT).toMatch(/encaminhe para reserva humana|encaminhe humano|time confirma/i);
  });

  it("mantém as regras de exclusão conhecidas internamente (Carnaval, Natal, Réveillon, feriados prolongados, 21/12/2026)", () => {
    expect(SYSTEM_PROMPT).toMatch(/21\/12\/2026/);
    expect(SYSTEM_PROMPT).toMatch(/Carnaval/i);
    expect(SYSTEM_PROMPT).toMatch(/Natal/i);
    expect(SYSTEM_PROMPT).toMatch(/R[eé]veillon/i);
    expect(SYSTEM_PROMPT).toMatch(/feriados? prolongad/i);
  });

  it("cortesia de criança até 12 vira aplicação SILENCIOSA no cálculo de pagantes", () => {
    expect(SYSTEM_PROMPT).toMatch(/aplicada no c[aá]lculo de pagantes|c[aá]lculo de pagantes/i);
    expect(SYSTEM_PROMPT).toMatch(/silenciosamente|sem custo adicional|sob pergunta/i);
  });
});

describe("Sunset Thermas Park — §00a CALENDÁRIO INTERNO (política v1.3.0)", () => {
  it("declara calendário como RESPONSABILIDADE INTERNA da Julia", () => {
    expect(SYSTEM_PROMPT).toMatch(/00a\)/);
    expect(SYSTEM_PROMPT).toMatch(/CALEND[AÁ]RIO DO PARQUE[^\n]*RESPONSABILIDADE INTERNA|RESPONSABILIDADE INTERNA DA JULIA/i);
  });

  it("proíbe enviar/orientar o link do calendário ao cliente", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[AÃ]O[^\n]*pede.*cliente.*conferir o calend[aá]rio no site|N[AÃ]O[^\n]*envia o link[^\n]*index\.php/i);
  });

  it("só comunica fechamento/restrição quando há fonte registrada", () => {
    expect(SYSTEM_PROMPT).toMatch(/fonte registrada/i);
    expect(SYSTEM_PROMPT).toMatch(/fechad[oa]|fechamento|restri[cç][aã]o/i);
    expect(SYSTEM_PROMPT).toMatch(/calend[aá]rio interno Boom|texto cadastrado pela equipe|contexto literal passado ao agente/i);
  });

  it("sem fonte: prossegue sem mencionar o assunto ao cliente", () => {
    expect(SYSTEM_PROMPT).toMatch(/Sem fonte registrada[^\n]*prossiga normalmente|N[aã]o toque no assunto calend[aá]rio com o cliente|siga adiante.*sem mencionar calend[aá]rio ao cliente/i);
  });

  it("não confirma ativamente abertura sem fonte e não inventa legenda/modalidade", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[AÃ]O[^\n]*confirme ativamente|n[aã]o confirme[^\n]*aberto[^\n]*sem fonte/i);
    expect(SYSTEM_PROMPT).toMatch(/N[AÃ]O[^\n]*invente legenda|n[aã]o invente legenda do calend[aá]rio/i);
  });
});

describe("Sunset Thermas Park — COMMUNICATION_RULES (regras de WhatsApp)", () => {
  it("mantém regras de zero emoji (inclusive orçamento) e valores apenas da tabela", () => {
    expect(COMMUNICATION_RULES).toMatch(/Emoji: zero/i);
    expect(COMMUNICATION_RULES).toMatch(/inclusive no or[cç]amento|inclusive no orçamento/i);
    expect(COMMUNICATION_RULES).toMatch(/3b-formato/i);
    expect(COMMUNICATION_RULES).toMatch(/Valores:/i);
    expect(COMMUNICATION_RULES).toMatch(/21\/12\/2026/);
  });

  it("item 6: lista fechada de exclusões; Dia dos Namorados não é exclusão; menciona só quando nega", () => {
    expect(COMMUNICATION_RULES).toMatch(/Filtro interno|lista fechada/i);
    expect(COMMUNICATION_RULES).toMatch(/Dia dos Namorados.*N[AÃ]O s[aã]o exclus|N[AÃ]O s[aã]o exclus[aã]o.*Dia dos Namorados/i);
    expect(COMMUNICATION_RULES).toMatch(/encaminhe humano|liste todas as acomoda/i);
    expect(COMMUNICATION_RULES).toMatch(/nega|s[oó] quando a regra/i);
  });

  it("item 12: calendário é interno, NÃO envia link ao cliente e só comunica com fonte registrada", () => {
    expect(COMMUNICATION_RULES).toMatch(/Calend[aá]rio do parque[^.\n]*interno/i);
    expect(COMMUNICATION_RULES).toMatch(/N[aã]o envie[^\n]*index\.php|N[aã]o[^\n]*link[^\n]*cliente|N[aã]o pe[cç]a[^\n]*olhada no funcionamento/i);
    expect(COMMUNICATION_RULES).toMatch(/fonte registrada/i);
  });
});

describe("Sunset Thermas Park — gate abertura do parque (v1.5.16)", () => {
  it("§00a declara gate de hospedagem e janela alternativa em park_closed", () => {
    expect(SYSTEM_PROMPT).toMatch(/GATE|gate obrigatório/i);
    expect(SYSTEM_PROMPT).toMatch(/nearest_open_window/);
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o continue.*valores de hotel|N[aã]o continue/i);
  });

  it("§00e park_closed proíbe cotação e manda oferecer data alternativa", () => {
    expect(SYSTEM_PROMPT).toMatch(/PARE a cota[cç][ãa]o|GATE:/i);
    expect(SYSTEM_PROMPT).toMatch(/data aberta mais pr[oó]xima/i);
  });

  it("§00f cobre pergunta se parque vai estar aberto", () => {
    expect(SYSTEM_PROMPT).toMatch(/vai estar aberto|funciona nessa data/i);
    expect(SYSTEM_PROMPT).toMatch(/next_open_date/);
  });

  it("DISPATCHER documenta gate na hospedagem e re-chamada após park_closed", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Park-open gate|park_closed/i);
    expect(DISPATCHER_PROMPT).toMatch(/nearest_open_window/);
    expect(DISPATCHER_PROMPT).toMatch(/Re-call after park_closed/i);
  });

  it("DISPATCHER chama consultar_parque_sunset para abertura do parque", () => {
    expect(DISPATCHER_PROMPT).toMatch(/vai estar aberto|abre nessa data/i);
  });

  it("COMMUNICATION_RULES item 12 reforça gate e nearest_open_window", () => {
    expect(COMMUNICATION_RULES).toMatch(/12\./);
    expect(COMMUNICATION_RULES).toMatch(/nearest_open_window|Gate hospedagem/i);
  });
});

describe("Sunset Thermas Park — §00e TOOL DE HOSPEDAGEM (v1.4.0 — fonte primária)", () => {
  it("declara a seção 00e com a tool consultar_hospedagem_sunset como fonte primária", () => {
    expect(SYSTEM_PROMPT).toMatch(/00e\)/);
    expect(SYSTEM_PROMPT).toMatch(/consultar_hospedagem_sunset/);
    expect(SYSTEM_PROMPT).toMatch(/FONTE PRIM[AÁ]RIA|fonte primária/i);
  });

  it("documenta os 3 retornos possíveis da tool (success / park_closed / erro)", () => {
    expect(SYSTEM_PROMPT).toMatch(/status:\s*"success"/i);
    expect(SYSTEM_PROMPT).toMatch(/status:\s*"park_closed"/i);
    expect(SYSTEM_PROMPT).toMatch(/Erro\s*\/\s*m[oó]dulo desabilitado|sem tarifa para a combina[cç][aã]o/i);
  });

  it("ensina a converter datas de dd/mm/aaaa para YYYY-MM-DD antes de chamar a tool", () => {
    expect(SYSTEM_PROMPT).toMatch(/YYYY-MM-DD/);
    expect(SYSTEM_PROMPT).toMatch(/16\/05\/2026.*2026-05-16|dd\/mm\/aaaa.*YYYY-MM-DD/i);
  });

  it("documenta o array guests com type adult e child+age", () => {
    expect(SYSTEM_PROMPT).toMatch(/"type":\s*"adult"/);
    expect(SYSTEM_PROMPT).toMatch(/"type":\s*"child"[^\n]*"age"/);
  });

  it("explica que a tool cuida da cortesia de crianças (regra oficial pode diferir da intuição)", () => {
    expect(SYSTEM_PROMPT).toMatch(/soma das idades.*crian[cç]as.*≤\s*12|todas[^\n]*cortesia/i);
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o.*calcule pagantes na m[aã]o|n[aã]o precisa calcular pagantes/i);
  });

  it("manda chamar a tool silenciosamente no Turno 1 quando a §00d traz todos os dados", () => {
    expect(SYSTEM_PROMPT).toMatch(/silenciosamente no Turno 1|chamada.*silenciosa/i);
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o diga[^\n]*"vou consultar nosso sistema"|sem fazer roleplay|n[aã]o[^\n]*roleplay/i);
  });

  it("proíbe expor IDs, JSON ou nomes de campos da resposta da tool ao cliente", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o[^\n]*mostre[^\n]*IDs?|N[aã]o[^\n]*JSON|n[aã]o[^\n]*nomes de campos/i);
  });

  it("proíbe ignorar park_closed e proíbe check_in == check_out (mínimo 1 noite)", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o[^\n]*ignore[^\n]*park_closed|se a tool disse fechado.*[eé] fechado/i);
    expect(SYSTEM_PROMPT).toMatch(/check_in\s*==\s*check_out|m[ií]nimo 1 noite/i);
  });
});

describe("Sunset Thermas Park — Tabela do §2 como FALLBACK (v1.4.0)", () => {
  it("rotula a tabela do §2 como FALLBACK explícito (só usar quando a tool falhar)", () => {
    expect(SYSTEM_PROMPT).toMatch(/FALLBACK[^\n]*tool da §00e|FALLBACK[^\n]*tool[^\n]*indispon[ií]vel|tabela[^\n]*fallback/i);
  });

  it("Turno 3 separa caminho feliz (tool success) de caminho fallback (tool erro/ausente)", () => {
    expect(SYSTEM_PROMPT).toMatch(/caminho feliz[^\n]*tool retornou success|tool retornou success/i);
    expect(SYSTEM_PROMPT).toMatch(/tool n[aã]o foi chamada[^\n]*ou retornou erro|fallback da tabela §2|fallback[^\n]*tabela §2/i);
  });

  it("Turno 3 inclui park_closed no roteamento de exceção (oferece janela alternativa)", () => {
    expect(SYSTEM_PROMPT).toMatch(/park_closed/);
    expect(SYSTEM_PROMPT).toMatch(/nearest_open_window|data aberta mais pr[oó]xima/i);
  });

  it("§00a cita a tool como fonte canônica do park_closed (calendário)", () => {
    expect(SYSTEM_PROMPT).toMatch(/00a\)/);
    expect(SYSTEM_PROMPT).toMatch(/consultar_hospedagem_sunset/);
    expect(SYSTEM_PROMPT).toMatch(/lodging_park_days|sinal[^\n]*autoritativ/i);
  });
});

describe("Sunset Thermas Park — DISPATCHER_PROMPT (v1.4.0)", () => {
  it("rota a tool consultar_hospedagem_sunset (não só suite_gallery_query)", () => {
    expect(DISPATCHER_PROMPT).toMatch(/consultar_hospedagem_sunset/);
    expect(DISPATCHER_PROMPT).toMatch(/suite_gallery_query/);
  });

  it("rota consultar_parque_sunset para ingresso/valor do parque", () => {
    expect(DISPATCHER_PROMPT).toMatch(/consultar_parque_sunset/);
    expect(DISPATCHER_PROMPT).toMatch(/park_consulta|ticket price|ingresso/i);
  });

  it("documenta gatilhos de preço/disponibilidade que disparam a tool", () => {
    expect(DISPATCHER_PROMPT).toMatch(/valor|pre[cç]o|quanto custa|tarifa|pacote/i);
    expect(DISPATCHER_PROMPT).toMatch(/disponibilidade|tem vaga|est[aá] aberto/i);
  });

  it("manda chamar a tool imediatamente quando recebe a mensagem padrão do site", () => {
    expect(DISPATCHER_PROMPT).toMatch(/standard form|mensagem padr[aã]o do site|"Gostaria de verificar disponibilidade"/i);
    expect(DISPATCHER_PROMPT).toMatch(/immediately|silently|first dispatcher turn/i);
  });

  it("documenta YYYY-MM-DD e conversão de dd/mm/aaaa", () => {
    expect(DISPATCHER_PROMPT).toMatch(/YYYY-MM-DD/);
    expect(DISPATCHER_PROMPT).toMatch(/16\/05\/2026.*2026-05-16|dd\/mm\/aaaa/i);
  });

  it("documenta o array guests com adult e child+age", () => {
    expect(DISPATCHER_PROMPT).toMatch(/"type":\s*"adult"/);
    expect(DISPATCHER_PROMPT).toMatch(/"type":\s*"child"[^\n]*"age"/);
  });

  it("NÃO chama a tool quando faltam datas concretas (só intenção genérica)", () => {
    expect(DISPATCHER_PROMPT).toMatch(/has not provided concrete check-in.*check-out|n[aã]o.*datas concretas/i);
  });

  it("permite chamada paralela quando o cliente pede valor + foto na mesma mensagem", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Parallel calls|simultaneously|both tools in the same turn/i);
  });

  it("mantém NO_TOOLS_NEEDED para small talk e proíbe gerar texto conversacional", () => {
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED/);
    expect(DISPATCHER_PROMPT).toMatch(/NEVER generate conversational text/i);
  });
});

describe("Sunset Thermas Park — regressão v1.4.1 (caso 'dia dos namorados')", () => {
  it("§00 proíbe também NEGAR vaga sem fonte registrada (não só confirmar)", () => {
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o confirma disponibilidade/i);
    expect(SYSTEM_PROMPT).toMatch(
      /tamb[eé]m n[aã]o nega|n[aã]o nega vaga|n[aã]o[^\n]*nega[cç][aã]o[^\n]*vaga|n[aã]o confirme nem negue/i
    );
    expect(SYSTEM_PROMPT).toMatch(/n[aã]o temos|Esgotado|Esgotado|lotou|n[aã]o h[áa] pacotes/i);
  });

  it("§3 proíbe inferir nº de hóspedes a partir do contexto do cliente", () => {
    expect(SYSTEM_PROMPT).toMatch(/NUNCA INFERIR|nunca[^\n]*infere[^\n]*h[oó]spedes|N[UÚ]NCA[^\n]*inferir/i);
    expect(SYSTEM_PROMPT).toMatch(/dia dos namorados/);
    expect(SYSTEM_PROMPT).toMatch(/lua de mel|minha esposa|sozinho|com a fam[ií]lia/i);
  });

  it("§3 manda PERGUNTAR composição ao cliente quando só a data veio", () => {
    expect(SYSTEM_PROMPT).toMatch(/composi[cç][aã]o.*vari[aá]vel independente|composi[cç][aã]o[^\n]*perguntar|antes de qualquer cota[cç][aã]o/i);
  });

  it("DISPATCHER_PROMPT proíbe chamar a tool sem guests[] explícito (não inferir do contexto)", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Do NOT infer guests from context|has not provided guest composition/i);
    expect(DISPATCHER_PROMPT).toMatch(/dia dos namorados|lua de mel|minha esposa|sozinho/i);
    expect(DISPATCHER_PROMPT).toMatch(/NO_TOOLS_NEEDED/);
  });
});

describe("Sunset Thermas Park — regressão v1.4.2 (tom hoje/amanhã)", () => {
  it("declara §00c-2 sobre CONTEXTO TEMPORAL como uso interno, não fala do cliente", () => {
    expect(SYSTEM_PROMPT).toMatch(/00c-2\)/);
    expect(SYSTEM_PROMPT).toMatch(/CONTEXTO TEMPORAL|USO INTERNO|n[ãa]o [eé] fala do cliente/i);
  });

  it("proíbe encher linguiça com 'hoje?' ou ganchos inventados a partir do contexto temporal", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[UÚ]NCA[^\n]*trate esse bloco|n[ãa]o[^\n]*enche[nc]ha?[^\n]*lingui[çc]a|n[ãa]o encha lingui[çc]a/i);
    expect(SYSTEM_PROMPT).toMatch(/hoje\?/i);
  });

  it("Turno 2 sem dados: proíbe inventar gancho e manda descobrir intenção antes de datas", () => {
    expect(SYSTEM_PROMPT).toMatch(/TURNO 2 SEM DADOS|Turno 2[^\n]*sem dados|Turno 2[^\n]*cliente s[oó] respondeu o nome/i);
    expect(SYSTEM_PROMPT).toMatch(/N[ÃÃ]O invente gancho|n[ãa]o invente gancho/i);
    expect(SYSTEM_PROMPT).toMatch(/3a\)|INTEN[ÇC][ÃA]O.*PARQUE|parque.*hospedagem.*ambos/i);
  });

  it("§3 tem exemplo positivo oi → Maria → perguntar intenção (não curtir o parque nem §00d)", () => {
    expect(SYSTEM_PROMPT).toMatch(/Cliente Turno 2: "Maria"/i);
    expect(SYSTEM_PROMPT).toMatch(/parque.*hospedagem.*os dois|hospedagem no hotel.*os dois/i);
    expect(SYSTEM_PROMPT).toMatch(/ERRADO.*curtir o parque|vi[eé]s s[oó] parque/i);
    expect(SYSTEM_PROMPT).not.toMatch(/Turno 2 \(CORRETO\)[^\n]*curtir o parque/i);
  });
});

describe("Sunset Thermas Park — §3a intenção parque + hospedagem (v1.4.8)", () => {
  it("declara §3a com três públicos (parque, hospedagem, ambos)", () => {
    expect(SYSTEM_PROMPT).toMatch(/3a\)/);
    expect(SYSTEM_PROMPT).toMatch(/s[oó] ingressos|s[oó] o parque/i);
    expect(SYSTEM_PROMPT).toMatch(/hospedagem no hotel|s[oó] hospedagem/i);
    expect(SYSTEM_PROMPT).toMatch(/os dois|ambos/i);
  });

  it("proíbe abrir Turno 2 com 'curtir o parque'", () => {
    expect(SYSTEM_PROMPT).toMatch(/Proibido no Turno 2|N[aã]o.*curtir o parque/i);
  });

  it("§0b e §1 cobrem atendimento dual parque + hospedagem", () => {
    expect(SYSTEM_PROMPT).toMatch(/Dois p[uú]blicos|parque.*hospedagem|hospedagem.*parque/i);
    expect(SYSTEM_PROMPT).toMatch(/consultora.*Sunset Thermas Park/i);
  });

  it("COMMUNICATION_RULES reforça intenção antes de datas", () => {
    expect(COMMUNICATION_RULES).toMatch(/descubra inten[cç][aã]o|inten[cç][aã]o.*§3a/i);
  });
});

describe("Sunset Thermas Park — regressão v1.4.3 / v1.4.7 (Dia dos Namorados = 12/06)", () => {
  it("§3 distingue DADO DO EVENTO (extraível) de DADO DE COMPOSIÇÃO (não extraível)", () => {
    expect(SYSTEM_PROMPT).toMatch(/DADO DO EVENTO|DIFEREN[ÇC]A ENTRE DADO DO EVENTO/i);
    expect(SYSTEM_PROMPT).toMatch(/extra[ií]vel|extra[íi]r o que [eé] extra[íi]vel/i);
  });

  it("tabela de eventos com data fixa nacional reconhece Dia dos Namorados, Natal, Réveillon, Dia das Mães, Carnaval", () => {
    expect(SYSTEM_PROMPT).toMatch(/Dia dos Namorados[^\n]*12\/06|12\/06[^\n]*Dia dos Namorados/);
    expect(SYSTEM_PROMPT).toMatch(/Natal[^\n]*25\/12|25\/12[^\n]*Natal/);
    expect(SYSTEM_PROMPT).toMatch(/R[eé]veillon[^\n]*31\/12|31\/12[^\n]*R[eé]veillon/);
    expect(SYSTEM_PROMPT).toMatch(/Dia das M[ãa]es[^\n]*2[ºo] domingo|2[ºo] domingo de maio/);
    expect(SYSTEM_PROMPT).toMatch(/Carnaval/i);
  });

  it("Dia dos Namorados (12/06) NÃO é exclusão — qualifica e cota, não encaminha humano", () => {
    expect(SYSTEM_PROMPT).toMatch(/Dia dos Namorados[^\n]*N[ÃA]O [eé] exclus|N[ÃA]O s[aã]o exclus[aã]o[^\n]*Dia dos Namorados/i);
    expect(SYSTEM_PROMPT).toMatch(/valor do pacote do site n[aã]o se aplica.*proibido|ERRADO.*n[aã]o se aplica/i);
    expect(SYSTEM_PROMPT).toMatch(/Quantas pessoas v[aã]o/i);
  });

  it("Carnaval é marcado como exclusão do §00 (não cote, encaminhe humano)", () => {
    expect(SYSTEM_PROMPT).toMatch(/Carnaval[^\n]*exclus[ãa]o|Carnaval[^\n]*n[ãa]o cote|exclus[oõ]es.*Carnaval/i);
  });

  it("proíbe oferecer 'outra data próxima' quando o cliente trouxe evento com data certa", () => {
    expect(SYSTEM_PROMPT).toMatch(/N[ÃÃ]O[^\n]*ofere[çc]a[^\n]*outra data pr[óo]xima|n[ãa]o ofere[çc]a[^\n]*outra data pr[óo]xima|outra data pr[óo]xima[^\n]*fric[çc][ãa]o/i);
  });

  it("composição (nº de pessoas) continua sendo pergunta obrigatória separada do evento", () => {
    expect(SYSTEM_PROMPT).toMatch(/composi[çc][ãa]o[^\n]*pergunta obrigat[óo]ria|N[ÃÃ]O[^\n]*se extrai[^\n]*composi[çc][ãa]o|composi[çc][ãa]o[^\n]*separada/i);
  });
});

describe("Sunset Thermas Park — §3c check-in sexta → checkout domingo (v1.4.9)", () => {
  it("declara §3c com regra de 2 noites sexta a domingo", () => {
    expect(SYSTEM_PROMPT).toMatch(/3c\)/);
    expect(SYSTEM_PROMPT).toMatch(/sexta-feira.*domingo|check-in.*sexta.*check-out.*domingo/i);
    expect(SYSTEM_PROMPT).toMatch(/2 noites|duas noites/i);
  });

  it("Dia dos Namorados 12\/06\/2026 como exemplo sexta → 14\/06 domingo", () => {
    expect(SYSTEM_PROMPT).toMatch(/12\/06\/2026.*2026-06-12|2026-06-12.*2026-06-14/i);
    expect(SYSTEM_PROMPT).toMatch(/N[aã]o.*12→13|n[aã]o use 12→13/i);
  });

  it("proíbe assumir 1 noite quando entrada é sexta sem pedido explícito", () => {
    expect(SYSTEM_PROMPT).toMatch(/Proibido:.*1 noite|n[aã]o assuma pacote de 1 noite/i);
  });

  it("DISPATCHER aplica checkout domingo em check-in sexta", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Friday check-in|check-in is a \*\*Friday\*\*/i);
    expect(DISPATCHER_PROMPT).toMatch(/2026-06-12.*2026-06-14|following Sunday/i);
  });
});

describe("Sunset Thermas Park — Loft/SPA reconsulta (v1.5.2)", () => {
  it("§3b-Loft exige tool e proíbe R$ 2.700 como total de fim de semana", () => {
    expect(SYSTEM_PROMPT).toMatch(/3b-Loft|LOFT.*SPA.*HIDRO/i);
    expect(SYSTEM_PROMPT).toMatch(/2\.700,00|2700/);
    expect(SYSTEM_PROMPT).toMatch(/total_price|n[aã]o.*di[aá]ria isolada/i);
  });

  it("DISPATCHER reconsulta em pergunta Loft/hidromassagem", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Category follow-up|Loft.*SPA.*hidromassagem/i);
    expect(DISPATCHER_PROMPT).toMatch(/interest_keywords/);
  });
});

describe("Sunset Thermas Park — anti-alucinação sem tool (v1.5.1)", () => {
  it("§00e proíbe citar R$ sem resultado da tool no turno", () => {
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO ABSOLUTO.*anti-alucina|anti-alucina[cç][aã]o/i);
    expect(SYSTEM_PROMPT).toMatch(/sem bloco "Resultados obtidos"|n[aã]o houver resultado da tool/i);
  });

  it("§3b exige tool antes de cotação; fallback §2 só após erro da tool", () => {
    expect(SYSTEM_PROMPT).toMatch(/Sem resultado da tool neste turno.*PROIBIDO citar R\$/i);
  });

  it("DISPATCHER exige idades quando há criança", () => {
    expect(DISPATCHER_PROMPT).toMatch(/3-composi[cç][ãa]o-idades|without ages = NO_TOOLS_NEEDED/i);
    expect(DISPATCHER_PROMPT).toMatch(/Never.*invent child ages/i);
  });

  it("DISPATCHER exige crianças confirmadas antes de chamar tool", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Composition answer|quantas pessoas/i);
    expect(DISPATCHER_PROMPT).toMatch(/Bare number "3"|sem crian[cç]as|NO_TOOLS_NEEDED/i);
  });

  it("COMMUNICATION_RULES item 16 reforça anti-alucinação", () => {
    expect(COMMUNICATION_RULES).toMatch(/16\./);
    expect(COMMUNICATION_RULES).toMatch(/sem resultado da tool|Anti-alucina/i);
  });
});

describe("Sunset Thermas Park — §3d fechamento consultivo SDR (v1.5.9)", () => {
  it("declara §3d consultivo e proíbe encaminhar após cotação", () => {
    expect(SYSTEM_PROMPT).toMatch(/3d\)/);
    expect(SYSTEM_PROMPT).toMatch(/CONSULTORA \+ SDR|consultiva SDR/i);
    expect(SYSTEM_PROMPT).toMatch(/Proibido.*encaminho.*setor de reservas|encaminho pro setor de reservas/i);
    expect(SYSTEM_PROMPT).toMatch(/o que achou|Ficou alguma d[uú]vida/i);
  });

  it("§3d proíbe menu seco de call center", () => {
    expect(SYSTEM_PROMPT).toMatch(/prefere que eu verifique algo mais/i);
    expect(SYSTEM_PROMPT).toMatch(/Menu seco|Posso ajudar em algo mais/i);
  });

  it("COMMUNICATION_RULES item 14 reforça fechamento consultivo sem encaminhar", () => {
    expect(COMMUNICATION_RULES).toMatch(/14\./);
    expect(COMMUNICATION_RULES).toMatch(/§3d|consultivo/i);
    expect(COMMUNICATION_RULES).toMatch(/Proibido.*encaminho|encaminhar pro setor/i);
  });

  it("§3b-formato documenta layout WhatsApp limpo sem emoji", () => {
    expect(SYSTEM_PROMPT).toMatch(/3b-formato\)/);
    expect(SYSTEM_PROMPT).toMatch(/Zero emoji no or[cç]amento|Zero emoji.*or[cç]amento/i);
    expect(SYSTEM_PROMPT).toMatch(/\*Opções\*/);
    expect(SYSTEM_PROMPT).toMatch(/\*Chal[eé]\* — R\$/);
    expect(SYSTEM_PROMPT).toMatch(/STANDART.*Chal[eé]/i);
    expect(SYSTEM_PROMPT).toMatch(/Proibido.*STANDART R\$/i);
    expect(SYSTEM_PROMPT).toMatch(/Check-in: a partir das 10h/i);
  });

  it("COMMUNICATION_RULES proíbe emoji inclusive no orçamento", () => {
    expect(COMMUNICATION_RULES).toMatch(/Emoji: zero/i);
    expect(COMMUNICATION_RULES).not.toMatch(/Exce[cç][ãa]o.*3b-formato.*emoji/i);
  });

  it("§3-composição exige confirmar crianças antes de cotar", () => {
    expect(SYSTEM_PROMPT).toMatch(/3-composi[cç][ãa]o|CRIAN[CÇ]AS — OBRIGAT/i);
    expect(SYSTEM_PROMPT).toMatch(/Alguma crian[cç]a vai junto/i);
    expect(COMMUNICATION_RULES).toMatch(/15\./);
  });
});

describe("Sunset Thermas Park — §3f conversão SDR (v1.5.8+)", () => {
  it("declara papel SDR e encaminhamento ao setor de reservas", () => {
    expect(SYSTEM_PROMPT).toMatch(/3f\)/);
    expect(SYSTEM_PROMPT).toMatch(/PAPEL SDR|consultora \+ SDR/i);
    expect(SYSTEM_PROMPT).toMatch(/99860-5662/);
    expect(SYSTEM_PROMPT).toMatch(/hotel\.php/);
    expect(SYSTEM_PROMPT).toMatch(/reserva confirmada/i);
  });

  it("FOLLOWUP inclui Etapa F e precisão ancorada no histórico", () => {
    expect(FOLLOWUP_PROMPT).toMatch(/Etapa F/i);
    expect(FOLLOWUP_PROMPT).toMatch(/fato exato|fato do hist/i);
    expect(FOLLOWUP_PROMPT).toMatch(/setor de reservas/i);
    expect(FOLLOWUP_PROMPT).toMatch(/fico no aguardo/i);
  });

  it("appendSunsetConversationContext injeta bloco de conversão com interesse", () => {
    const ref = new Date("2026-06-13T15:00:00Z");
    const ctx = appendSunsetConversationContext(undefined, [
      { role: "user", content: "quero hospedagem de hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas?" },
      { role: "user", content: "8 pessoas" },
      { role: "assistant", content: "Valores..." },
      { role: "user", content: "gostei do Standart, quero reservar" },
    ], ref);
    expect(ctx).toMatch(/INTERESSE|CONVERS[AÃ]O SDR/i);
    expect(ctx).toMatch(/99860-5662/);
    expect(ctx).toMatch(/PROIBIDO.*reserva confirmada/i);
  });

  it("COMMUNICATION_RULES item 24 reforça papel SDR só com interesse", () => {
    expect(COMMUNICATION_RULES).toMatch(/24\./);
    expect(COMMUNICATION_RULES).toMatch(/§3f|SDR/i);
  });

  it("§3-composição-tom proíbe pergunta redundante sobre crianças", () => {
    expect(SYSTEM_PROMPT).toMatch(/3-composi[cç][ãa]o-tom/i);
    expect(SYSTEM_PROMPT).toMatch(/Quantas crian[cç]as v[aã]o junto\? Se sim, quantas/i);
    expect(SYSTEM_PROMPT).toMatch(/Perfeito, 3 pessoas/i);
  });

  it("§00c-3 proíbe inventar nome e copiar exemplos fictícios", () => {
    expect(SYSTEM_PROMPT).toMatch(/00c-3\)/);
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO.*Keven|copiar nomes dos \*\*exemplos fict/i);
    expect(SYSTEM_PROMPT).toMatch(/hospedagem para hoje até amanhã/i);
  });

  it("injeta nameGuard quando cliente não disse nome", () => {
    const ctx = appendSunsetConversationContext(undefined, [
      { role: "user", content: "ola" },
      { role: "assistant", content: "Como prefere ser chamado(a)?" },
      { role: "user", content: "hospedagem para o dia de hoje ate amanha" },
    ]);
    expect(ctx).toMatch(/PROIBIDO.*Prazer/i);
    expect(ctx).toMatch(/copiar nomes dos exemplos fict/i);
  });

  it("§3-composição-idades exige idade quando há criança", () => {
    expect(SYSTEM_PROMPT).toMatch(/3-composi[cç][ãa]o-idades/i);
    expect(SYSTEM_PROMPT).toMatch(/Quantos anos tem a crian[cç]a/i);
    expect(SYSTEM_PROMPT).toMatch(/2 adultos e 1 crian[cç]a de 5 anos/i);
  });

  it("injeta contexto idades pendentes quando criança sem idade", () => {
    const ref = new Date("2026-06-13T15:00:00Z");
    const ctx = appendSunsetConversationContext(undefined, [
      { role: "user", content: "hospedagem para hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas vão na estadia?" },
      { role: "user", content: "3" },
      { role: "assistant", content: "Alguma criança vai junto?" },
      { role: "user", content: "sim, 1 criança" },
    ], ref);
    expect(ctx).toMatch(/IDADES PENDENTES/i);
    expect(ctx).toMatch(/Quantos anos/i);
    expect(ctx).toMatch(/PROIBIDO.*cotar/i);
  });

  it("injeta contexto crianças pendentes quando cliente disse só número", () => {
    const ref = new Date("2026-06-13T15:00:00Z");
    const ctx = appendSunsetConversationContext(undefined, [
      { role: "user", content: "hospedagem para hoje ate amanha" },
      { role: "assistant", content: "Quantas pessoas vão na estadia?" },
      { role: "user", content: "3" },
    ], ref);
    expect(ctx).toMatch(/CRIAN[CÇ]AS PENDENTES/i);
    expect(ctx).toMatch(/PROIBIDO.*repetir.*quantas pessoas/i);
    expect(ctx).toMatch(/PROIBIDO.*cotar/i);
  });
});

describe("Sunset Thermas Park — §3b recotação lista completa (v1.4.9)", () => {
  it("§3b exige lista completa em recotação quando cliente muda datas", () => {
    expect(SYSTEM_PROMPT).toMatch(/RECOTA[CÇ][ÃA]O|recota[cç][ãa]o/i);
    expect(SYSTEM_PROMPT).toMatch(/12 ao 14|chame a tool de novo/i);
    expect(SYSTEM_PROMPT).toMatch(/TODAS.*available_accommodations|lista completa/i);
  });

  it("DISPATCHER manda chamar tool de novo em novo período", () => {
    expect(DISPATCHER_PROMPT).toMatch(/Re-quote|do 12 ao 14/i);
    expect(DISPATCHER_PROMPT).toMatch(/all.*available_accommodations/i);
  });
});

describe("Sunset Thermas Park — §3b listagem de todas as acomodações (v1.4.6)", () => {
  it("declara §3b com regra de listar todas as opções disponíveis", () => {
    expect(SYSTEM_PROMPT).toMatch(/3b\)/);
    expect(SYSTEM_PROMPT).toMatch(/TODAS AS ACOMODA[CÇ][ÕO]ES|TODAS as opções/i);
    expect(SYSTEM_PROMPT).toMatch(/nunca.*escolha uma.*arbitrariamente|nunca.*escolha uma categoria/i);
  });

  it("§00e manda listar available_accommodations[] inteiro no fluxo §3", () => {
    expect(SYSTEM_PROMPT).toMatch(/available_accommodations\[\]/);
    expect(SYSTEM_PROMPT).toMatch(/apresente \*\*TODAS\*\*|TODAS as entradas/i);
    expect(SYSTEM_PROMPT).toMatch(/nunca.*escolha uma arbitrariamente|nunca\*\* escolha uma arbitrariamente/i);
  });

  it("proíbe citar só uma categoria sem o cliente ter pedido (fluxo §3)", () => {
    expect(SYSTEM_PROMPT).toMatch(/Proibido:.*citar Chal[eé].*Su[ií]te Luxo|pular categorias que vieram na tool/i);
  });

  it("COMMUNICATION_RULES item 13 reforça §3b-formato e §3c sexta→domingo", () => {
    expect(COMMUNICATION_RULES).toMatch(/3b-formato|liste \*\*todas\*\*|liste todas/i);
    expect(COMMUNICATION_RULES).toMatch(/sexta.*domingo|§3c/i);
  });
});

describe("Sunset Thermas Park — mudança de assunto parque (v1.5.4)", () => {
  const parkDayQuestion =
    "legal para passar somente o dia no parque, qual seria o valor do ingresso e funciona de que a hora a que horas?";
  const parkPriceToday = "qual valor hoje para ir ao park?";

  it("detecta pergunta de day use / ingresso / horário", () => {
    expect(messageDeclaresParkDayVisitQuestion(parkDayQuestion)).toBe(true);
    expect(messageDeclaresParkDayVisitQuestion(parkPriceToday)).toBe(true);
    expect(messageDeclaresParkDayVisitQuestion("quero hospedagem para duas pessoas")).toBe(false);
  });

  it("§00f documenta consultar_parque_sunset e exemplo sem nome inventado", () => {
    expect(SYSTEM_PROMPT).toMatch(/00f\)/);
    expect(SYSTEM_PROMPT).toMatch(/consultar_parque_sunset/);
    expect(SYSTEM_PROMPT).toMatch(/qual valor hoje para ir ao park/);
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO.*Keven|sem o cliente ter dito o nome/i);
  });

  it("injeta contexto de ingresso na 1ª mensagem sem pedir intenção", () => {
    const ctx = appendSunsetConversationContext(undefined, [{ role: "user", content: parkPriceToday }]);
    expect(ctx).toMatch(/PARQUE \/ INGRESSO/i);
    expect(ctx).toMatch(/consultar_parque_sunset/);
    expect(ctx).toMatch(/NÃO.*parque\/hospedagem\/ambos/i);
    expect(ctx).toMatch(/PROIBIDO.*Prazer/i);
  });

  it("§3e proíbe repetir hospedagem quando cliente pede só parque", () => {
    expect(SYSTEM_PROMPT).toMatch(/3e\)/);
    expect(SYSTEM_PROMPT).toMatch(/passar somente o dia no parque|passar s[oó] o dia/i);
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO.*repetir.*hospedagem|n[aã]o.*repetir.*hospedagem/i);
  });

  it("injeta contexto de foco parque sem reler hotel", () => {
    const msgs = [
      { role: "user", content: "hospedagem dia dos namorados duas pessoas" },
      { role: "assistant", content: "Standart R$ 1.104..." },
      { role: "user", content: parkDayQuestion },
    ];
    const ctx = appendSunsetConversationContext(undefined, msgs);
    expect(ctx).toMatch(/PARQUE \/ INGRESSO/i);
    expect(ctx).toMatch(/consultar_parque_sunset/);
    expect(ctx).toMatch(/PROIBIDO.*repetir.*hospedagem/i);
  });

  it("COMMUNICATION_RULES item 17 reforça §3e", () => {
    expect(COMMUNICATION_RULES).toMatch(/17\./);
    expect(COMMUNICATION_RULES).toMatch(/§3e|mudan[cç]a de assunto/i);
  });

  it("COMMUNICATION_RULES item 18 reforça §00f parque", () => {
    expect(COMMUNICATION_RULES).toMatch(/18\./);
    expect(COMMUNICATION_RULES).toMatch(/consultar_parque_sunset|§00f/i);
  });

  it("§3b-grupos proíbe confirmação especial para 8 pessoas", () => {
    expect(SYSTEM_PROMPT).toMatch(/3b-grupos/);
    expect(SYSTEM_PROMPT).toMatch(/confirma[cç][ãa]o especial|multi-quarto/i);
  });

  it("§00c-2 proíbe Dia dos Namorados quando cliente disse hoje", () => {
    expect(SYSTEM_PROMPT).toMatch(/PROIBIDO.*Dia dos Namorados|n[aã]o citou.*hoje/i);
  });

  it("injeta contexto hoje/amanhã sem evento inventado", () => {
    const ref = new Date("2026-06-13T15:00:00.000Z");
    const ctx = appendSunsetConversationContext(
      undefined,
      [{ role: "user", content: "Maria, quero hospedagem para o dia de hoje ate amanha" }],
      ref
    );
    expect(ctx).toMatch(/HOJE\/AMANHÃ|13\/06\/2026/i);
    expect(ctx).toMatch(/§3a-tom|certo\?/i);
    expect(ctx).toMatch(/PROIBIDO.*Dia dos Namorados|12\/06/i);
    expect(ctx).toMatch(/quantas pessoas/i);
    expect(ctx).toMatch(/n[aã]o.*repita essas datas/i);
  });

  it("§3a-tom proíbe confirmar hoje/amanhã roboticamente", () => {
    expect(SYSTEM_PROMPT).toMatch(/3a-tom\)/);
    expect(SYSTEM_PROMPT).toMatch(/certo\?|13\/06 e amanhã será 14\/06/i);
    expect(SYSTEM_PROMPT).toMatch(/me chamo Maria e quero hospedagem de hoje at[eé] amanh[aã]/i);
  });

  it("§3b-grupos-tom exige explicar quartos antes da lista", () => {
    expect(SYSTEM_PROMPT).toMatch(/3b-grupos-tom|divide em \*\*dois quartos\*\*/i);
    expect(SYSTEM_PROMPT).toMatch(/para 2 unidades.*sem explicar/i);
  });
});

describe("Sunset Thermas Park — intenção já declarada (v1.5.3)", () => {
  it("detecta hospedagem na mensagem do cliente", () => {
    expect(messageDeclaresLodgingIntent("keven, quero hospedagem para o dia dos namorados")).toBe(true);
    expect(messageDeclaresLodgingIntent("quero ingresso do parque")).toBe(false);
  });

  it("§3a proíbe menu parque/hospedagem quando intenção + período já vieram", () => {
    expect(SYSTEM_PROMPT).toMatch(/INTEN[ÇC][ÃA]O \+ PER[IÍ]ODO J[AÁ] DITOS/i);
    expect(SYSTEM_PROMPT).toMatch(/Maria, quero hospedagem para o dia dos namorados/i);
    expect(SYSTEM_PROMPT).toMatch(/Quantas pessoas v[aã]o na estadia/);
  });

  it("injeta contexto: hospedagem + dia dos namorados → só pedir composição", () => {
    const msgs = [
      { role: "user", content: "ola" },
      { role: "assistant", content: "Como prefere ser chamado?" },
      { role: "user", content: "Maria, quero hospedagem para o dia dos namorados" },
    ];
    const ctx = appendSunsetConversationContext(undefined, msgs);
    expect(ctx).toMatch(/j[aá] declarou HOSPEDAGEM/i);
    expect(ctx).toMatch(/NÃO.*parque.*hospedagem.*ambos/i);
    expect(ctx).toMatch(/composi[çc][ãa]o|quantas pessoas/i);
    expect(conversationDeclaresLodgingIntent(msgs)).toBe(true);
  });
});

describe("Sunset Thermas Park — detecção formulário do site (runtime §00d)", () => {
  const formMessage =
    "Olá! Gostaria de verificar disponibilidade para hospedagem no Hotel Sunset Thermas. Acomodação: Chalé Aconchegante Check-in: 16/05/2026 Check-out: 17/05/2026 Total de noites: 1 noite Adultos: 2 Crianças: 1 (idades: 3 anos)";

  it("detecta mensagem padrão do formulário do site", () => {
    expect(detectSunsetSiteFormMessage(formMessage)).toBe(true);
  });

  it("não detecta formulário em oi simples", () => {
    expect(detectSunsetSiteFormMessage("ola")).toBe(false);
    expect(detectSunsetSiteFormMessage("keven")).toBe(false);
  });

  it("injeta contexto negativo quando cliente não veio do formulário", () => {
    const ctx = appendSunsetConversationContext("ola");
    expect(ctx).toMatch(/NÃO se aplica/);
    expect(ctx).toMatch(/inten[çc][ãa]o|§3a/i);
    expect(ctx).not.toMatch(/Exemplo §00d — ATIVO/);
  });

  it("injeta exemplo §00d só quando formulário foi detectado", () => {
    const ctx = appendSunsetConversationContext(formMessage);
    expect(ctx).toMatch(/Exemplo §00d — ATIVO NESTA CONVERSA/);
  });

  it("buildSystemPrompt injeta contexto negativo para oi no Sunset Thermas", () => {
    const prompt = buildSystemPrompt("", "sunset-thermas-park", false, { firstUserMessage: "ola" });
    expect(prompt).toMatch(/\[CONTEXTO DESTA CONVERSA\]/);
    expect(prompt).not.toMatch(/Prazer, Marina\. Vi aqui que vocês querem 1 noite/);
  });
});

describe("Sunset Thermas Park — regressão v1.4.4 (condicionalidade do §00d)", () => {
  it("§00d declara no topo que SÓ se aplica quando os gatilhos do formulário foram detectados", () => {
    expect(SYSTEM_PROMPT).toMatch(/CONDI[ÇC][ÃÃ]O DE APLICA[ÇC][ÃÃ]O DO §00d|ATEN[ÇC][ÃÃ]O[^\n]*CONDI[ÇC][ÃÃ]O|S[ÓO][^\n]*se aplica quando os[^\n]*gatilhos do formul[áa]rio/i);
  });

  it("§00d manda voltar para §3 quando o cliente não veio do formulário", () => {
    expect(SYSTEM_PROMPT).toMatch(/VOLTE PARA §3|volte para §3[^\n]*Qualifica[çc][ãa]o/i);
  });

  it("Turno 2 do §00d é explicitamente condicional, não universal", () => {
    expect(SYSTEM_PROMPT).toMatch(/TURNO 2[^\n]*S[ÓO] DENTRO DO CASO §00d|S[ÓO] DENTRO DO CASO §00d/);
    expect(SYSTEM_PROMPT).toMatch(/Se o cliente N[ÃÃ]O veio do formul[áa]rio[^\n]*N[ÃÃ]O se aplica/i);
  });

  it("Turno 2 do §00d proíbe citar campos que NÃO vieram no formulário", () => {
    expect(SYSTEM_PROMPT).toMatch(/Se algum campo N[ÃÃ]O veio[^\n]*N[ÃÃ]O cite|algum campo N[ÃÃ]O veio.*N[ÃÃ]O cite/i);
  });

  it("exemplo '1 noite, 2 adultos, Chalé' está fora do prompt estático (só no bloco injetado §00d)", () => {
    expect(SYSTEM_PROMPT).not.toMatch(/Prazer, Marina\. Vi aqui que vocês querem 1 noite/);
    expect(SUNSET_FORM_DIALOGUE_EXAMPLE).toMatch(/Exemplo §00d[^\n]*ATIVO NESTA CONVERSA/i);
    expect(SUNSET_FORM_DIALOGUE_EXAMPLE).toMatch(/conte[úu]do[^\n]*fict[íi]cio/i);
  });

  it("§00d proíbe alucinação de turno citando dados que o cliente não trouxe", () => {
    expect(SYSTEM_PROMPT).toMatch(/Confirmar frases como|alucina[çc][ãa]o de turno.*erro grav[íi]ssimo|1 noite[^\n]*12\/06[^\n]*Chal[ée] Aconchegante/i);
  });
});
