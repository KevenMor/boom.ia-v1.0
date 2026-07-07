/**
 * Validação unitária/funcional do pipeline Sunset sem precisar do LLM.
 *
 * Desde v1.5.30 (toggle SUNSET_LODGING_SEND_PHOTOS_WITH_QUOTE = false):
 *   - A tool `consultar_hospedagem_sunset` NÃO injeta gallery_photos no tool_result.
 *   - O formatter produz blocos só com `*Nome* — R$ X` (sem foto), 1 bolha por opção.
 *   - Foto vai SOB DEMANDA via pipeline `suite_gallery_query` + `userLikelyAskedForPhotos`.
 *
 * Uso: cd server && npx tsx scripts/test-sunset-formatter.ts
 */

import { formatSunsetLodgingQuoteForDelivery } from "../src/utils/sunset-lodging-quote-format.js";

/** Tool JSON real do modo toggle OFF (sem gallery_photos). */
const TOOL_JSON_SEM_FOTOS = JSON.stringify({
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
  // sem gallery_photos — toggle OFF desde v1.5.30
});

/** Tool JSON com fotos (modo toggle ON, desativado por padrão mas mantido para regressão). */
const TOOL_JSON_COM_FOTOS = JSON.stringify({
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
  ],
});

const textoLLMCru = `Segue o orçamento solicitado.

*Resumo*
• 2 pessoas · 1 pernoite

*Opções*

*Incluso*
Jantar e café`;

function run(nome: string, texto: string, toolJson: string) {
  console.log(`\n=== ${nome} ===`);
  const out = formatSunsetLodgingQuoteForDelivery(texto, [toolJson]);
  const hasMsgSplit = out.includes("<<MSG_SPLIT>>");
  const temFoto = /!\[.*?\]\(https?:/.test(out);
  const rooms = [
    "*Chalé* — R$ 414,00",
    "*Suíte Luxo* — R$ 586,50",
    "*Suíte com Varanda* — R$ 624,00",
  ].filter((r) => out.replace(/ /g, " ").includes(r.replace(/ /g, " ")));

  console.log("contém MSG_SPLIT:", hasMsgSplit);
  console.log("contém foto inline:", temFoto);
  console.log("preços pareados por MSG_SPLIT:", rooms.length);
  console.log("\n--- OUTPUT ---");
  console.log(out);
  console.log("--- FIM ---\n");

  return {
    nome,
    hasMsgSplit,
    temFoto,
    rooms: rooms.length,
  };
}

let allOk = true;

// Cenário principal (modo toggle OFF, padrão desde v1.5.30)
const resultA = run("A) Toggle OFF: tool sem gallery_photos + LLM sem foto inline", textoLLMCru, TOOL_JSON_SEM_FOTOS);

if (resultA.temFoto) {
  console.error(`✗ Cenário A: toggle OFF deveria zerar fotos no orçamento`);
  allOk = false;
} else if (resultA.rooms < 3) {
  console.error(`✗ Cenário A: esperava 3 acomodações, obtido ${resultA.rooms}`);
  allOk = false;
} else if (!resultA.hasMsgSplit) {
  console.error(`✗ Cenário A: esperava <<MSG_SPLIT>> entre opções`);
  allOk = false;
} else {
  console.log(`✓ Cenário A: ${resultA.rooms} quartos em bolhas separadas, sem foto`);
}

// Cenário B: regressão — toggle ON (gallery_photos presente) ainda mantém compatibilidade
const textoComFoto = `Segue o orçamento solicitado.

*Resumo*
• 2 pessoas

*Opções*
![Chalé](https://cdn.example/chale.jpg)
*Chalé* — R$ 414,00

![Suíte Luxo](https://cdn.example/luxo.jpg)
*Suíte Luxo* — R$ 586,50

*Incluso*
Jantar`;
const resultB = run("B) Toggle ON (regressão): tool com gallery_photos", textoComFoto, TOOL_JSON_COM_FOTOS);
if (!resultB.hasMsgSplit || resultB.temFoto === false) {
  console.error(`✗ Cenário B: regressão quebrou — toggle ON com fotos deve produzir MSG_SPLIT e foto`);
  allOk = false;
} else if (resultB.rooms < 2) {
  console.error(`✗ Cenário B: esperava ≥2 quartos, obtido ${resultB.rooms}`);
  allOk = false;
} else {
  console.log(`✓ Cenário B: regressão toggle ON mantida (${resultB.rooms} quartos + foto)`);
}

if (!allOk) {
  console.error("\n✗ Falhas na validação do formatter Sunset.");
  process.exit(1);
}
console.log("\n✓ Toggle OFF (v1.5.30): orçamento Sunset sem foto, 1 bolha por opção com preço.");
console.log("✓ Toggle ON (regressão): foto+preço pareados continuam funcionando se toggle for reativado.");
