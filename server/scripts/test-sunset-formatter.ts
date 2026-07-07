/**
 * Validação unitária/funcional do pipeline Sunset sem precisar do LLM:
 * chama diretamente `formatSunsetLodgingQuoteForDelivery` com o JSON exato
 * que a tool `consultar_hospedagem_sunset` retorna, e valida que a saída
 * tem `<<MSG_SPLIT>>` separando blocos foto+preço pareados.
 *
 * Uso: cd server && npx tsx scripts/test-sunset-formatter.ts
 */

import { formatSunsetLodgingQuoteForDelivery } from "../src/utils/sunset-lodging-quote-format.js";

const TOOL_JSON = JSON.stringify({
  status: "success",
  check_in: "2026-07-12",
  check_out: "2026-07-13",
  nights: 1,
  guests_in_family: 2,
  guests_for_pricing: 2,
  kids_under_12: [],
  available_accommodations: [
    { id: "r-1", name: "STANDART", total_price: 414, currency: "BRL" },
    { id: "r-2", name: "LUXO DUPLO", total_price: 586.5, currency: "BRL" },
    { id: "r-3", name: "LUXO COM VARANDA", total_price: 624, currency: "BRL" },
  ],
  message: "Encontramos 3 opções de hospedagem...",
  gallery_photos: [
    {
      accommodationName: "STANDART",
      displayLabel: "Chalé",
      galleryName: "Chalé",
      imageUrl: "https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-chale.jpg",
      photoMarkdown: "![Chalé](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-chale.jpg)",
    },
    {
      accommodationName: "LUXO DUPLO",
      displayLabel: "Suíte Luxo",
      galleryName: "Suite Luxo Sem Varanda",
      imageUrl: "https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-luxo.jpg",
      photoMarkdown: "![Suíte Luxo](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-luxo.jpg)",
    },
    {
      accommodationName: "LUXO COM VARANDA",
      displayLabel: "Suíte com Varanda",
      galleryName: "Suite Luxo com Varanda",
      imageUrl: "https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-varanda.jpg",
      photoMarkdown: "![Suíte com Varanda](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-varanda.jpg)",
    },
  ],
});

// Cenário A: LLM entregou texto com fotos inline + preços (caso ideal).
const textoComFotos = `Segue o orçamento solicitado.

*Resumo*
• 2 pessoas · 1 pernoite

*Opções*
![Chalé](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-chale.jpg)
*Chalé* — R$ 414,00
![Suíte Luxo](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-luxo.jpg)
*Suíte Luxo* — R$ 586,50
![Suíte com Varanda](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-varanda.jpg)
*Suíte com Varanda* — R$ 624,00

*Incluso no pacote*
Jantar e café`;

// Cenário B: LLM entregou texto SEM fotos inline (causa raiz do bug do usuário).
const textoSemFotos = `Segue o orçamento solicitado.

*Resumo*
• 2 pessoas · 1 pernoite

*Opções*
Chalé — R$ 414,00
Suíte Luxo Sem Varanda — R$ 586,50
Suíte com Varanda — R$ 624,00

*Incluso no pacote*
Jantar e café`;

// Cenário C: LLM entregou foto e preço separados por linha em branco.
const textoComLinhaBranco = `Segue o orçamento solicitado.

*Resumo*
• 2 pessoas

*Opções*
![Chalé](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-chale.jpg)

*Chalé* — R$ 414,00

![Suíte Luxo](https://boomsolution-supabase.kgn6uc.easypanel.host/storage/v1/object/public/suite-galleries/photo-luxo.jpg)

*Suíte Luxo* — R$ 586,50

*Incluso no pacote*
Jantar e café`;

const IMAGE_MD_RE = /^!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)\s*$/i;
const PRICE_LINE_RE = /\*[^*]+\*\s*[—–-]\s*R\$\s*[\d.,]+/;

function countLodgingPairs(text: string): number {
  const parts = text.includes("<<MSG_SPLIT>>")
    ? text.split("<<MSG_SPLIT>>")
    : [text];
  return parts.filter((p) => {
    const lines = p
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    return lines.length >= 2 && IMAGE_MD_RE.test(lines[0]) && PRICE_LINE_RE.test(lines[1]);
  }).length;
}

function run(nome: string, texto: string, esperadoMinimo: number) {
  console.log(`\n=== ${nome} ===`);
  const out = formatSunsetLodgingQuoteForDelivery(texto, [TOOL_JSON]);
  const pairs = countLodgingPairs(out);
  const hasMsgSplit = out.includes("<<MSG_SPLIT>>");
  console.log("contém MSG_SPLIT:", hasMsgSplit);
  console.log("blocos foto+preço pareados:", pairs);
  console.log("(mínimo esperado:", esperadoMinimo, ")");
  console.log("\n--- OUTPUT ---");
  console.log(out);
  console.log("--- FIM ---\n");

  if (pairs < esperadoMinimo) {
    console.error(`✗ ${nome}: esperado ${esperadoMinimo}+ blocos, obtido ${pairs}`);
    return false;
  }
  console.log(`✓ ${nome}: ${pairs} blocos pareados`);
  return true;
}

let allOk = true;
allOk = run("A) Com fotos inline (caso ideal)", textoComFotos, 3) && allOk;
allOk = run("B) Sem fotos inline (LLM omitiu)", textoSemFotos, 3) && allOk;
allOk = run("C) Foto e preço separados por linha em branco", textoComLinhaBranco, 2) && allOk;

if (!allOk) {
  console.error("\n✗ Falhas na validação do formatter Sunset.");
  process.exit(1);
}
console.log("\n✓ Todos os cenários validados — foto+preço pareados em cada MSG_SPLIT.");
