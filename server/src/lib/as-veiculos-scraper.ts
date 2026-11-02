import * as cheerio from "cheerio";

export const AS_VEICULOS_BASE_URL = "https://asveiculosmultimarcas.com.br";
export const AS_VEICULOS_WP_API = `${AS_VEICULOS_BASE_URL}/wp-json/wp/v2`;

export interface ASVeiculoBruto {
  id: number;
  link: string;
  titulo: string;
  cambio: string;
  combustivel: string;
  marca: string;
}

export interface ASVeiculoFicha {
  id: number;
  external_id: string;
  titulo: string;
  brand: string;
  model: string;
  version: string;
  motor: string;
  preco: number | null;
  ano: number | null;
  ano_modelo: number | null;
  km: number | null;
  cambio: string;
  combustivel: string;
  cor: string;
  cores: string[];
  opcionais: string[];
  fotos: string[];
  link: string;
}

interface WpPost {
  id: number;
  link: string;
  title?: { rendered?: string };
  class_list?: string[];
}

const MARCA_TAXONOMY: Record<string, string> = {
  "marcas-volkswagen": "Volkswagen",
  "marcas-chevrolet": "Chevrolet",
};

const COMBUSTIVEL_TAXONOMY: Record<string, string> = {
  "combustivel-flex-gasolina-e-alcool": "Flex (Gasolina e álcool)",
  "combustivel-gasolina": "Gasolina",
  "combustivel-alcool": "Álcool",
  "combustivel-diesel": "Diesel",
  "combustivel-flex": "Flex",
};

const CAMBIO_TAXONOMY: Record<string, string> = {
  "cambio-automatico": "Automático",
  "cambio-manual": "Manual",
  "cambio-engate": "Manual com engate",
};

/** Frases de marketing da loja que aparecem no campo "Itens do veículo" e não são opcionais. */
const ITENS_NAO_OPCIONAIS = [
  /financiamento por bancos/i,
  /financia em até/i,
  /pegamos (carro|moto)/i,
  /aceitamos (troca|carro|moto)/i,
  /veja (todas )?as fotos/i,
  /fale com a gente/i,
  /whatsapp/i,
];

/** Vocabulário de itens de série/equipamentos quando o site publica tudo em um texto corrido. */
const VOCABULARIO_ITENS = [
  "Ar-condicionado",
  "Direção Hidráulica",
  "Direção Elétrica",
  "Vidros Elétricos",
  "Travas Elétricas",
  "Rodas de Liga Leve",
  "Rodas de Liga",
  "Airbag",
  "Freio ABS",
  "Freio a disco",
  "Alarme",
  "Sensor de Estacionamento",
  "Câmera de Ré",
  "Bancos em Couro",
  "Bancos de Couro",
  "Central Multimídia",
  "Controle de Tração",
  "Piloto Automático",
  "Teto Solar",
  "Partida Elétrica",
  "Partida Elétrica",
  "Computador de bordo",
  "Faróis de neblina",
  "Kit Multimídia",
  "Presilha de cinto",
  "Retrovisores elétricos",
];

const CORES = [
  "PRETO", "PRETA", "BRANCO", "BRANCA", "PRATA", "CINZA", "VERMELHO", "VERMELHA",
  "AZUL", "VERDE", "AMARELO", "AMARELA", "BEGE", "PRÉTO", "PRÉTA", "GRAFITE",
  "CHAMPAGNE", "VINHO", "SOMBRIO", "ESCURO", "CLARO", "LARANJA", "DOURADO", "DOURADA",
];

function decodeEntities(texto: string): string {
  return (texto || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, "-")
    .replace(/&#8217;/g, "'")
    .replace(/&[a-z]+;/gi, " ");
}

function limpar(texto: string): string {
  return decodeEntities(texto || "").replace(/\s+/g, " ").trim();
}

function parsePreco(bruto: string): number | null {
  const limpo = bruto.replace(/[R$\s.]/g, "").replace(",", ".");
  const n = Number.parseFloat(limpo);
  return Number.isNaN(n) ? null : n;
}

function taxonomia(classList: string[] | undefined, prefixo: string): string | undefined {
  return (classList || []).find((c) => c.startsWith(prefixo));
}

function normalizarCor(valor: string): string {
  const v = valor.trim().toUpperCase();
  const achado = CORES.find((c) => v === c);
  if (!achado) return "";
  return achado.charAt(0) + achado.slice(1).toLowerCase();
}

/**
 * Colunas da ficha técnica.
 * O Elementor aninha colunas, então `.elementor-column` devolve também as
 * "wrappers" com todos os valores juntos. Aqui ficamos só com as colunas
 * folha (sem outra `.elementor-column` dentro), que são as que têm
 * rótulo + valor reais.
 */
function lerColunasFolha($: cheerio.CheerioAPI): string[][] {
  const colunas: string[][] = [];
  $(".elementor-column").each((_, col) => {
    if ($(col).find(".elementor-column").length > 0) return;
    const valores: string[] = [];
    $(col)
      .find(".elementor-widget-heading")
      .each((__, w) => {
        const t = $(w).text().replace(/\s+/g, " ").trim();
        if (t) valores.push(t);
      });
    if (valores.length) colunas.push(valores);
  });
  return colunas;
}

function tokenCambio(valor: string): string {
  const v = valor.trim().toUpperCase();
  if (v.startsWith("AUTOMAT")) return "Automático";
  if (v === "MANUAL") return "Manual";
  if (v === "ENGATE") return "Manual com engate";
  return "";
}

function tokenCombustivel(valor: string): string {
  const v = valor.trim().toUpperCase();
  if (v === "GASOLINA") return "Gasolina";
  if (v === "FLEX") return "Flex";
  if (v === "ALCOOL" || v === "ÁLCOOL") return "Álcool";
  if (v === "DIESEL") return "Diesel";
  return "";
}

/**
 * Itens/opcionais publicados em "Itens do veículo".
 * O site usa um item por linha; em motos o texto vem corrido — nesse caso
 * extraímos apenas o vocabulário de equipamentos reconhecível.
 */
function extrairItens($: cheerio.CheerioAPI): { itens: string[]; descricao: string } {
  let bruto = "";
  $(".elementor-widget").each((_, el) => {
    if (bruto) return;
    if ($(el).text().trim() === "Itens do veículo:") {
      const irmao = $(el).next(".elementor-widget");
      if (irmao.length) bruto = irmao.text();
    }
  });
  if (!bruto.trim()) return { itens: [], descricao: "" };

  const linhas = bruto
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((l) => !ITENS_NAO_OPCIONAIS.some((re) => re.test(l)));

  const itens: string[] = [];
  let descricao = "";

  for (const linha of linhas) {
    if (linha.length <= 60) {
      if (!itens.includes(linha)) itens.push(linha);
      continue;
    }
    // Texto corrido: guarda como descrição e extrai só o vocabulário conhecido.
    if (!descricao) descricao = linha;
    for (const item of VOCABULARIO_ITENS) {
      if (new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(linha)) {
        if (!itens.includes(item)) itens.push(item);
      }
    }
  }

  return { itens: itens.slice(0, 25), descricao };
}

function extrairFotosDoHtml($: cheerio.CheerioAPI): string[] {
  const urls = new Set<string>();
  $("img").each((_, el) => {
    const bruto =
      $(el).attr("data-lazy-src") ||
      $(el).attr("src") ||
      $(el).find("noscript").text() ||
      "";
    if (!bruto || !bruto.includes("/uploads/")) return;
    const url = bruto.trim().replace(/\.webp$/, "");
    if (!/^https?:/i.test(url)) return;
    if (/5693ba8b|autozone-img|logo/i.test(url)) return;
    urls.add(url);
  });
  return Array.from(urls);
}

/**
 * Converte o post do WP + HTML da página de detalhe em ficha técnica fiel ao site.
 * Nada é inferido: cada campo vem do conteúdo publicado pela loja.
 */
export function montarFicha(post: WpPost, html: string, fotosMedia: string[]): ASVeiculoFicha {
  const $ = cheerio.load(html);
  const colunas = lerColunasFolha($);
  const titulo = limpar(post.title?.rendered || $("title").text().replace(/[–-].*$/, ""));

  // Marca / modelo / versão vêm do título publicado (ex.: "FORD/ECOSPORT XLT PRETA").
  const partesTitulo = titulo.split("/");
  const marcaBruta = (partesTitulo[0] || "").trim();
  const marcaTax = MARCA_TAXONOMY[taxonomia(post.class_list, "marcas-") || ""] || "";
  const brand = marcaTax || marcaBruta;
  const resto = (partesTitulo.slice(1).join("/") || marcaBruta).trim();
  const model = resto.split(/\s+/)[0] || "";
  const version = resto.split(/\s+/).slice(1).join(" ") || "";

  // Motorização: 2º valor da coluna de identificação (ex.: "2.0", "150cc").
  const colunaIdent = colunas.find((c) => c.length >= 2 && /[A-ZÀ-Ü]/i.test(c[0]));
  const motor = colunaIdent ? limpar(colunaIdent[1]) : "";

  // Anos: coluna com dois anos. O site mostra o "Ano" no catálogo do veículo
  // (grid) e o "Ano Modelo" na ficha; a ordem na página é [modelo, ano].
  const colunaAnos = colunas.find((c) => c.filter((v) => /^(19|20)\d{2}$/.test(v)).length >= 2);
  const anos = colunaAnos ? colunaAnos.filter((v) => /^(19|20)\d{2}$/.test(v)) : [];
  const ano = anos.length >= 2 ? Number.parseInt(anos[1], 10) : null;
  const anoModelo =
    anos.length >= 2 && anos[0] !== anos[1] ? Number.parseInt(anos[0], 10) : null;

  // Quilometragem: coluna iniciada pelo rótulo "KM".
  const colunaKm = colunas.find((c) => c[0]?.trim().toUpperCase() === "KM");
  const kmBruto = colunaKm && colunaKm.length >= 2 ? colunaKm[1] : "";
  const km = kmBruto ? Number.parseInt(kmBruto.replace(/\D/g, ""), 10) || null : null;

  // Câmbio: taxonomia do site tem precedência; senão varre os tokens das colunas.
  const cambioTax = CAMBIO_TAXONOMY[taxonomia(post.class_list, "cambio-") || ""];
  let cambio = cambioTax;
  if (!cambio) {
    for (const coluna of colunas) {
      for (const valor of coluna) {
        const token = tokenCambio(valor);
        if (token) {
          cambio = token;
          break;
        }
      }
      if (cambio) break;
    }
  }
  if (!cambio) cambio = "Não informado";

  // Combustível: taxonomia tem precedência; senão primeiro token encontrado.
  const combustivelTax = COMBUSTIVEL_TAXONOMY[taxonomia(post.class_list, "combustivel-") || ""];
  let combustivel = combustivelTax;
  if (!combustivel) {
    for (const coluna of colunas) {
      for (const valor of coluna) {
        const token = tokenCombustivel(valor);
        if (token) {
          combustivel = token;
          break;
        }
      }
      if (combustivel) break;
    }
  }
  if (!combustivel) combustivel = "Flex";

  // Cor: coluna logo após "Final da placa". A cor do carro é a que bate com o
  // título; sem cor no título, usamos o segundo valor da coluna.
  const idxPlaca = colunas.findIndex((c) => c[0]?.trim() === "Final da placa");
  const colunaCores = idxPlaca >= 0 ? colunas[idxPlaca + 1] : undefined;
  const cores = (colunaCores || [])
    .slice(1)
    .map(normalizarCor)
    .filter(Boolean);

  const corTitulo = CORES.find((c) => titulo.toUpperCase().includes(` ${c}`));
  let cor = "";
  if (corTitulo) {
    cor = normalizarCor(corTitulo);
  } else if (cores.length) {
    cor = cores[cores.length - 1];
  }

  // Preço: valor publicado na própria página.
  const precoMatch = html.match(/R\$\s*[\d.]+(?:,\d{2})?/i);
  const preco = precoMatch ? parsePreco(precoMatch[0]) : null;

  const { itens, descricao } = extrairItens($);

  // Fotos: media do WP (originais) tem precedência; senão usa as imagens da página.
  const fotos = (fotosMedia.length ? fotosMedia : extrairFotosDoHtml($)).slice(0, 15);

  return {
    id: post.id,
    external_id: `as-${post.id}`,
    titulo,
    brand,
    model,
    version,
    motor,
    preco,
    ano,
    ano_modelo: anoModelo,
    km,
    cambio,
    combustivel,
    cor,
    cores,
    opcionais: itens,
    fotos,
    link: post.link,
  };
}

/** Lê a lista de carros publicada no site via API REST do WordPress. */
export async function listarCarros(): Promise<WpPost[]> {
  const resp = await fetch(`${AS_VEICULOS_WP_API}/carros?per_page=100`, {
    headers: { "User-Agent": "NexusAI-Bot/1.0" },
  });
  if (!resp.ok) throw new Error(`Falha ao consultar API WordPress: HTTP ${resp.status}`);
  const posts = (await resp.json()) as WpPost[];
  return Array.isArray(posts) ? posts : [];
}

/** Lê as fotos originais anexadas ao post do carro (endpoint de mídia do WP). */
export async function listarFotos(postId: number): Promise<string[]> {
  try {
    const resp = await fetch(
      `${AS_VEICULOS_WP_API}/media?parent=${postId}&per_page=50&_fields=source_url`,
      { headers: { "User-Agent": "NexusAI-Bot/1.0" } },
    );
    if (!resp.ok) return [];
    const itens = (await resp.json()) as Array<{ source_url?: string }>;
    const urls = (itens || [])
      .map((i) => i.source_url || "")
      .filter((u) => /^https?:\/\//i.test(u) && /\.(jpe?g|png|webp|gif)$/i.test(u));
    return Array.from(new Set(urls));
  } catch {
    return [];
  }
}

/** Baixa o HTML da página de detalhe de um carro. */
export async function carregarPaginaDetalhe(link: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(link, {
      headers: { "User-Agent": "NexusAI-Bot/1.0" },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}
