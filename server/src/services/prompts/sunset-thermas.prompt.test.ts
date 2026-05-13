import { describe, expect, it } from "vitest";
import { COMMUNICATION_RULES, SYSTEM_PROMPT } from "./sunset-thermas.js";

describe("Sunset Thermas Park — SYSTEM_PROMPT (contratos de negócio)", () => {
  it("versão do prompt atualizada (rastreio de deploy)", () => {
    expect(SYSTEM_PROMPT).toMatch(/v1\.3\.1/);
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

  it("Turno 3: cita valor de UMA única categoria (a mapeada), sem listar várias", () => {
    expect(SYSTEM_PROMPT).toMatch(/Turno 3/i);
    expect(SYSTEM_PROMPT).toMatch(/UMA [uú]nica categoria|uma [uú]nica categoria/);
    expect(SYSTEM_PROMPT).toMatch(/liste\s*2,\s*3\s*ou\s*todas|liste duas ou mais categorias/i);
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
    expect(SYSTEM_PROMPT).toMatch(/sob pergunta|S[oó]\s+(\*\*)?mencione/i);
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
  it("mantém regras de zero emoji e valores apenas da tabela", () => {
    expect(COMMUNICATION_RULES).toMatch(/Emoji: zero/i);
    expect(COMMUNICATION_RULES).toMatch(/Valores:/i);
    expect(COMMUNICATION_RULES).toMatch(/21\/12\/2026/);
  });

  it("item 6: validade/exclusões viram FILTRO INTERNO; cota enxuto, menciona só sob pergunta ou quando nega", () => {
    expect(COMMUNICATION_RULES).toMatch(/Filtro interno antes de cotar|filtro interno/i);
    expect(COMMUNICATION_RULES).toMatch(/N[aã]o cote|N[aã]o\s+cote\s+\u2014|encaminhe humano/i);
    expect(COMMUNICATION_RULES).toMatch(/cote enxuto|sem despejar regra de validade/i);
    expect(COMMUNICATION_RULES).toMatch(/s[oó] sob pergunta|nega\/altera|regra de fato/i);
  });

  it("item 12: calendário é interno, NÃO envia link ao cliente e só comunica com fonte registrada", () => {
    expect(COMMUNICATION_RULES).toMatch(/Calend[aá]rio do parque[^.\n]*interno/i);
    expect(COMMUNICATION_RULES).toMatch(/N[aã]o envie[^\n]*index\.php|N[aã]o[^\n]*link[^\n]*cliente|N[aã]o pe[cç]a[^\n]*olhada no funcionamento/i);
    expect(COMMUNICATION_RULES).toMatch(/fonte registrada/i);
  });
});
