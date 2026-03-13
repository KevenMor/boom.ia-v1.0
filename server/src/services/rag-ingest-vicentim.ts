/**
 * Serviço de ingestão RAG para Instituto Vicentim Maekawa.
 * Usado pelo endpoint POST /api/rag/ingest-vicentim (cron) e pelo script ingest-vicentim-website.ts.
 * Usa RPCs via API Supabase (sem conexão Postgres direta).
 */

import * as cheerio from "cheerio";
import type { SupabaseClient } from "@supabase/supabase-js";

const BASE_URL = "https://drajulianavicentim.com.br";
const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 150;
const EMBEDDING_MODEL = "text-embedding-ada-002";

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

export interface PageContent {
  url: string;
  title: string;
  bodyText: string;
  faqs: { pergunta: string; resposta: string }[];
}

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\n+/g, "\n").trim();
}

function isAgendarLink(href: string): boolean {
  return (
    href.includes("wa.me") ||
    href.includes("tintim.app") ||
    href.includes("agendar") ||
    href.includes("whatsapp")
  );
}

export async function scrapeVicentimPages(): Promise<PageContent[]> {
  const results: PageContent[] = [];
  for (const page of PAGES) {
    const url = `${BASE_URL}${page.path}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; VicentimRAG/1.0; +https://boom-agents)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      const pageTitle =
        $("title").text().replace(/ - Instituto Vicentim Maekawa.*$/, "").trim() ||
        $("h1").first().text().trim() ||
        (page.path === "/" ? "Instituto Vicentim Maekawa - Início" : "Página");

      const bodyParts: string[] = [];
      $("main#content .elementor-widget-heading .elementor-heading-title").each((_, el) => {
        const text = $(el).text().trim();
        if (text && !isAgendarLink(text) && text.length > 10) bodyParts.push(text);
      });

      const faqs: { pergunta: string; resposta: string }[] = [];
      $(".elementor-toggle-item").each((_, item) => {
        const $item = $(item);
        const pergunta = $item.find(".elementor-toggle-title").text().trim();
        const resposta = $item.find(".elementor-tab-content p").text().trim();
        if (pergunta && resposta) faqs.push({ pergunta, resposta });
      });

      let bodyText = cleanText(bodyParts.join("\n\n"));
      const faqText = faqs.map((f) => `P: ${f.pergunta}\nR: ${f.resposta}`).join("\n\n");
      if (faqText) bodyText = bodyText ? `${bodyText}\n\n---\n\n${faqText}` : faqText;

      if (bodyText || faqs.length > 0) {
        results.push({ url, title: pageTitle, bodyText, faqs });
      }
    } catch {
      /* skip */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + CHUNK_SIZE / 2) end = lastSpace + 1;
    }
    chunks.push(text.slice(start, end).trim());
    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return chunks.filter((c) => c.length > 50);
}

/** OpenAI aceita array de textos; retorna embeddings em lote (muito mais rápido) */
async function getEmbeddingsBatch(texts: string[], apiKey: string): Promise<number[][]> {
  const inputs = texts.map((t) => t.slice(0, 8000));
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: inputs,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI embeddings: ${res.status}`);
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  const byIndex = (data.data || []).sort((a, b) => a.index - b.index);
  return byIndex.map((d) => d.embedding);
}

export interface IngestResult {
  success: boolean;
  pagesProcessed: number;
  chunksInserted: number;
  errors?: string[];
}

export async function runVicentimIngest(
  supabase: SupabaseClient,
  openaiKey: string,
  options?: { pageOffset?: number; pageLimit?: number }
): Promise<IngestResult> {
  const tenantSlug = "instituto-vicentim-maekawa";
  let tenant: { id: string; db_name: string } | null = null;
  const { data: t1 } = await supabase.from("tenants").select("id, db_name").eq("slug", tenantSlug).limit(1).single();
  if (t1?.db_name) tenant = t1;
  if (!tenant) {
    const { data: t2 } = await supabase.from("tenants").select("id, db_name").eq("db_name", "dp_insituto_vicentim_maekawa").limit(1).single();
    if (t2?.db_name) tenant = t2;
  }

  if (!tenant?.db_name) {
    return { success: false, pagesProcessed: 0, chunksInserted: 0, errors: ["Tenant não encontrado"] };
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .single();

  if (!agent) {
    return { success: false, pagesProcessed: 0, chunksInserted: 0, errors: ["Agente não encontrado"] };
  }

  const schema = tenant.db_name;
  const agentId = agent.id;

  const allPages = await scrapeVicentimPages();
  const offset = options?.pageOffset ?? 0;
  const limit = options?.pageLimit ?? allPages.length;
  const pages = allPages.slice(offset, offset + limit);

  const errors: string[] = [];
  let chunksInserted = 0;

  for (const page of pages) {
    if (!page.bodyText || page.bodyText.length < 50) continue;

    const title =
      page.title.replace(/ - Instituto Vicentim Maekawa.*$/, "").trim() ||
      page.url.split("/").filter(Boolean).pop() ||
      "Página";

    const { error: delErr } = await supabase.rpc("rag_ingest_delete_document", {
      p_schema: schema,
      p_agent_id: agentId,
      p_source_url: page.url,
    });
    if (delErr) {
      errors.push(`${page.url}: delete ${delErr.message}`);
      continue;
    }

    const { data: docId, error: insErr } = await supabase.rpc("rag_ingest_insert_document", {
      p_schema: schema,
      p_agent_id: agentId,
      p_title: title,
      p_source_url: page.url,
      p_metadata: { faq_count: page.faqs?.length || 0 },
    });
    if (insErr || !docId) {
      errors.push(`${page.url}: insert doc ${insErr?.message}`);
      continue;
    }

    const chunks = chunkText(page.bodyText);
    let inserted = 0;
    const BATCH_SIZE = 20;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      try {
        const embeddings = await getEmbeddingsBatch(batch, openaiKey);
        for (let j = 0; j < batch.length; j++) {
          const content = batch[j];
          const embedding = embeddings[j];
          if (!embedding) continue;
          const embeddingStr = `[${embedding.join(",")}]`;
          const { error: chunkErr } = await supabase.rpc("rag_ingest_insert_chunk", {
            p_schema: schema,
            p_document_id: docId,
            p_content: content,
            p_embedding: embeddingStr,
            p_chunk_index: i + j,
            p_metadata: { url: page.url, title },
          });
          if (!chunkErr) inserted++;
        }
      } catch (e) {
        errors.push(`chunks ${i}-${i + batch.length}: ${(e as Error).message}`);
      }
    }

    await supabase.rpc("rag_ingest_update_document_status", {
      p_schema: schema,
      p_document_id: docId,
      p_chunk_count: inserted,
      p_status: "ready",
    });
    chunksInserted += inserted;
  }

  return {
    success: errors.length === 0,
    pagesProcessed: pages.length,
    chunksInserted,
    errors: errors.length > 0 ? errors : undefined,
  };
}
