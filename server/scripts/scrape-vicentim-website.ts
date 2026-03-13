/**
 * Extrai conteúdo do site Instituto Vicentim Maekawa para alimentar RAG.
 * Uso: npx tsx scripts/scrape-vicentim-website.ts
 *
 * Saída: server/data/vicentim-website-content.json
 */

import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";

const BASE_URL = "https://drajulianavicentim.com.br";

const PAGES: { path: string; title?: string }[] = [
  { path: "/", title: "Início" },
  { path: "/alinhadores/", title: "Alinhadores" },
  { path: "/bruxismo/", title: "Bruxismo" },
  { path: "/clareamento/", title: "Clareamento" },
  { path: "/cirurgia/", title: "Cirurgia Odontológica" },
  { path: "/endodontia/", title: "Endodontia" },
  { path: "/facetas/", title: "Facetas" },
  { path: "/frenectomia/", title: "Frenectomia" },
  { path: "/gengivectomia/", title: "Gengivectomia" },
  { path: "/gestantes/", title: "Gestantes" },
  { path: "/harmonizacao-facial/", title: "Harmonização Facial" },
  { path: "/implante/", title: "Implante Dentário" },
  { path: "/laserterapia/", title: "Laserterapia" },
  { path: "/prevencao/", title: "Odontologia Preventiva" },
  { path: "/odontopediatria/", title: "Odontopediatria" },
  { path: "/ortodontia/", title: "Ortodontia" },
  { path: "/periodontia/", title: "Periodontia" },
  { path: "/protese/", title: "Prótese Dentária" },
  { path: "/protocolo-dentario/", title: "Protocolo Dentário" },
  { path: "/restauracao/", title: "Restauração Dental" },
  { path: "/sedacao/", title: "Sedação Consciente" },
];

interface FaqItem {
  pergunta: string;
  resposta: string;
}

interface PageContent {
  url: string;
  title: string;
  bodyText: string;
  faqs: FaqItem[];
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

function isAgendarLink(href: string): boolean {
  return (
    href.includes("wa.me") ||
    href.includes("tintim.app") ||
    href.includes("agendar") ||
    href.includes("whatsapp")
  );
}

async function scrapePage(pagePath: string): Promise<PageContent | null> {
  const url = `${BASE_URL}${pagePath}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VicentimRAG/1.0; +https://boom-agents)",
      },
    });
    if (!res.ok) {
      console.warn(`  [SKIP] ${url} - HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    const pageTitle =
      $("title").text().replace(/ - Instituto Vicentim Maekawa.*$/, "").trim() ||
      $("h1").first().text().trim() ||
      pagePath === "/"
        ? "Instituto Vicentim Maekawa - Início"
        : "Página";

    const bodyParts: string[] = [];

    $("main#content .elementor-widget-heading .elementor-heading-title").each(
      (_, el) => {
        const text = $(el).text().trim();
        if (text && !isAgendarLink(text) && text.length > 10) {
          bodyParts.push(text);
        }
      }
    );

    const faqs: FaqItem[] = [];
    $(".elementor-toggle-item").each((_, item) => {
      const $item = $(item);
      const pergunta = $item.find(".elementor-toggle-title").text().trim();
      const resposta = $item.find(".elementor-tab-content p").text().trim();
      if (pergunta && resposta) {
        faqs.push({ pergunta, resposta });
      }
    });

    let bodyText = cleanText(bodyParts.join("\n\n"));
    const faqText = faqs
      .map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`)
      .join("\n\n");
    if (faqText) {
      bodyText = bodyText ? `${bodyText}\n\n---\n\n${faqText}` : faqText;
    }

    return {
      url,
      title: pageTitle,
      bodyText,
      faqs,
    };
  } catch (err) {
    console.warn(`  [ERRO] ${url}:`, (err as Error).message);
    return null;
  }
}

async function main() {
  console.log("Extraindo conteúdo do site Vicentim Maekawa...\n");

  const results: PageContent[] = [];

  for (const page of PAGES) {
    process.stdout.write(`  ${page.path}... `);
    const content = await scrapePage(page.path);
    if (content && (content.bodyText || content.faqs.length > 0)) {
      results.push(content);
      console.log(
        `OK (${content.bodyText.length} chars, ${content.faqs.length} FAQs)`
      );
    } else {
      console.log("vazio ou erro");
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  const outDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, "vicentim-website-content.json");
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");

  console.log(`\nConcluído. Salvo em ${outPath}`);
  console.log(`Total: ${results.length} páginas extraídas`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
