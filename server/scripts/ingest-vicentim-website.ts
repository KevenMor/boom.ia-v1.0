/**
 * Ingerir conteúdo do site Vicentim Maekawa no RAG (knowledge_documents + knowledge_chunks).
 * Uso: npx tsx scripts/ingest-vicentim-website.ts
 *
 * Requer: NEXUS_DB_URL, NEXUS_SERVICE_ROLE_KEY, OPENAI_API_KEY
 * Para schemas de tenant: DATABASE_URL ou NEXUS_DATABASE_URL (postgresql://...) para conexão direta
 * Input: server/data/vicentim-website-content.json (gerado por scrape-vicentim-website.ts)
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

const CHUNK_SIZE = 1800;
const CHUNK_OVERLAP = 150;
const EMBEDDING_MODEL = "text-embedding-ada-002";

interface PageContent {
  url: string;
  title: string;
  bodyText: string;
  faqs: { pergunta: string; resposta: string }[];
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

async function getEmbedding(text: string, apiKey: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text.slice(0, 8000),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI embeddings: ${res.status} ${err}`);
  }
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data[0].embedding;
}

async function main() {
  const dbUrl = process.env.NEXUS_DB_URL;
  const dbKey = process.env.NEXUS_SERVICE_ROLE_KEY || process.env.NEXUS_DB_ANON_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!dbUrl || !dbKey) {
    console.error("NEXUS_DB_URL e NEXUS_SERVICE_ROLE_KEY são obrigatórios.");
    process.exit(1);
  }
  if (!openaiKey) {
    console.error("OPENAI_API_KEY é obrigatório para gerar embeddings.");
    process.exit(1);
  }

  const dataPath = path.join(process.cwd(), "data", "vicentim-website-content.json");
  if (!fs.existsSync(dataPath)) {
    console.error(`Arquivo não encontrado: ${dataPath}`);
    console.error("Execute primeiro: npm run scrape:vicentim");
    process.exit(1);
  }

  const allPages: PageContent[] = JSON.parse(fs.readFileSync(dataPath, "utf-8"));
  const pageLimit = process.env.PAGE_LIMIT ? parseInt(process.env.PAGE_LIMIT, 10) : undefined;
  const pageOffset = process.env.PAGE_OFFSET ? parseInt(process.env.PAGE_OFFSET, 10) : 0;
  const pages = pageLimit
    ? allPages.slice(pageOffset, pageOffset + pageLimit)
    : allPages.slice(pageOffset);
  if (pageLimit || pageOffset)
    console.log(`Processando páginas ${pageOffset + 1}-${pageOffset + pages.length} de ${allPages.length}.\n`);
  const supabase = createClient(dbUrl, dbKey);

  const tenantSlug = process.env.TENANT_SLUG || "instituto-vicentim-maekawa";

  let tenant: { id: string; db_name: string; slug: string } | undefined;

  const { data: tenantFromApi } = await supabase
    .from("tenants")
    .select("id, db_name, slug")
    .eq("slug", tenantSlug)
    .single();
  tenant = tenantFromApi ?? undefined;

  if (!tenant?.db_name) {
    const { data: byDbName } = await supabase
      .from("tenants")
      .select("id, db_name, slug")
      .eq("db_name", tenantSlug)
      .single();
    tenant = byDbName ?? undefined;
  }

  if (!tenant?.db_name) {
    const { data: byDbName } = await supabase
      .from("tenants")
      .select("id, db_name, slug")
      .eq("db_name", "dp_insituto_vicentim_maekawa")
      .single();
    tenant = byDbName ?? undefined;
  }

  // Fallback: buscar tenant via Postgres direto (quando API Supabase não retorna)
  if (!tenant?.db_name) {
    const pgUrl = process.env.DATABASE_URL || process.env.NEXUS_DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (pgUrl) {
      const pgFallback = new pg.Client({ connectionString: pgUrl });
      await pgFallback.connect();
      const slugs = [tenantSlug, "insituto-vicentim-maekawa", "instituto-vicentim-maekawa", "dp_insituto_vicentim_maekawa"];
      for (const s of slugs) {
        const { rows } = await pgFallback.query(
          `SELECT id, db_name, slug FROM public.tenants WHERE slug = $1 OR db_name = $1 LIMIT 1`,
          [s]
        );
        if (rows[0]?.db_name) {
          tenant = rows[0];
          break;
        }
      }
      if (!tenant?.db_name) {
        const { rows: all } = await pgFallback.query(`SELECT id, slug, db_name FROM public.tenants`);
        console.error("Tenant não encontrado. Tenants no banco:", JSON.stringify(all, null, 2));
        console.error("Use TENANT_SLUG=slug-ou-db_name para especificar.");
        await pgFallback.end();
        process.exit(1);
      }
      await pgFallback.end();
    } else if (!tenant?.db_name) {
      const { data: all } = await supabase.from("tenants").select("id, slug, db_name");
      console.error("Tenant não encontrado. Tenants no banco:", JSON.stringify(all, null, 2));
      console.error("Use TENANT_SLUG=slug-ou-db_name para especificar.");
      process.exit(1);
    }
  }

  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .single();

  if (!agent) {
    console.error("Nenhum agente encontrado no tenant instituto-vicentim-maekawa.");
    process.exit(1);
  }

  const schema = tenant.db_name;
  const agentId = agent.id;
  console.log(`Schema: ${schema}, Agent: ${agentId}\n`);

  const pgUrl = process.env.DATABASE_URL || process.env.NEXUS_DATABASE_URL || process.env.SUPABASE_DB_URL;
  let pgClient: pg.Client | null = null;
  let useRpc = false;

  if (pgUrl) {
    try {
      pgClient = new pg.Client({ connectionString: pgUrl });
      await pgClient.connect();
      console.log("Conexão Postgres direta OK.\n");
    } catch (e) {
      console.warn("Postgres direto falhou:", (e as Error).message);
      console.warn("Usando RPCs via API Supabase (execute sql/023_rag_ingest_rpcs.sql se ainda não aplicou).\n");
      pgClient = null;
      useRpc = true;
    }
  } else {
    console.warn("DATABASE_URL não configurado. Usando RPCs via API.\n");
    useRpc = true;
  }

  if (!/^[a-zA-Z0-9_]+$/.test(schema)) {
    console.error("Schema inválido:", schema);
    process.exit(1);
  }
  const docTable = `"${schema}".knowledge_documents`;
  const chunkTable = `"${schema}".knowledge_chunks`;

  for (const page of pages) {
    if (!page.bodyText || page.bodyText.length < 50) {
      console.log(`  [SKIP] ${page.url} - conteúdo vazio`);
      continue;
    }

    const title = page.title.replace(/ - Instituto Vicentim Maekawa.*$/, "").trim() || page.url.split("/").filter(Boolean).pop() || "Página";

    if (useRpc) {
      const { error: delErr } = await supabase.rpc("rag_ingest_delete_document", {
        p_schema: schema,
        p_agent_id: agentId,
        p_source_url: page.url,
      });
      if (delErr) {
        console.error(`  [ERRO] ${page.url}: delete falhou:`, delErr.message);
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
        console.error(`  [ERRO] ${page.url}: insert doc failed:`, insErr?.message);
        continue;
      }

      const chunks = chunkText(page.bodyText);
      let inserted = 0;
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i];
        try {
          const embedding = await getEmbedding(content, openaiKey);
          const embeddingStr = `[${embedding.join(",")}]`;
          const { error: chunkErr } = await supabase.rpc("rag_ingest_insert_chunk", {
            p_schema: schema,
            p_document_id: docId,
            p_content: content,
            p_embedding: embeddingStr,
            p_chunk_index: i,
            p_metadata: { url: page.url, title },
          });
          if (!chunkErr) inserted++;
        } catch (e) {
          console.warn(`    Chunk ${i} falhou:`, (e as Error).message);
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      const { error: updErr } = await supabase.rpc("rag_ingest_update_document_status", {
        p_schema: schema,
        p_document_id: docId,
        p_chunk_count: inserted,
        p_status: "ready",
      });
      if (updErr) console.warn(`    Update status falhou:`, updErr.message);

      console.log(`  [OK] ${title} - ${inserted} chunks (via RPC)`);
      if (typeof global.gc === "function") global.gc();
    } else {
      const { rows: existingRows } = await pgClient!.query(
        `SELECT id FROM ${docTable} WHERE agent_id = $1 AND source_url = $2 LIMIT 1`,
        [agentId, page.url]
      );
      const existing = existingRows[0];
      if (existing?.id) {
        await pgClient!.query(`DELETE FROM ${chunkTable} WHERE document_id = $1`, [existing.id]);
        await pgClient!.query(`DELETE FROM ${docTable} WHERE id = $1`, [existing.id]);
      }

      const { rows: docRows } = await pgClient!.query(
        `INSERT INTO ${docTable} (agent_id, title, source_url, file_type, status, chunk_count, metadata)
         VALUES ($1, $2, $3, 'web', 'processing', 0, $4)
         RETURNING id`,
        [agentId, title, page.url, JSON.stringify({ faq_count: page.faqs?.length || 0 })]
      );
      const doc = docRows[0];
      if (!doc?.id) {
        console.error(`  [ERRO] ${page.url}: insert doc failed`);
        continue;
      }

      const chunks = chunkText(page.bodyText);
      let inserted = 0;
      for (let i = 0; i < chunks.length; i++) {
        const content = chunks[i];
        try {
          const embedding = await getEmbedding(content, openaiKey);
          const embeddingStr = `[${embedding.join(",")}]`;
          await pgClient!.query(
            `INSERT INTO ${chunkTable} (document_id, content, embedding, chunk_index, metadata)
             VALUES ($1, $2, $3::vector, $4, $5)`,
            [doc.id, content, embeddingStr, i, JSON.stringify({ url: page.url, title })]
          );
          inserted++;
        } catch (e) {
          console.warn(`    Chunk ${i} falhou:`, (e as Error).message);
        }
        await new Promise((r) => setTimeout(r, 100));
      }

      await pgClient!.query(
        `UPDATE ${docTable} SET status = 'ready', chunk_count = $1 WHERE id = $2`,
        [inserted, doc.id]
      );
      console.log(`  [OK] ${title} - ${inserted} chunks`);
      if (typeof global.gc === "function") global.gc();
    }
  }

  if (pgClient) pgClient.end();

  console.log("\nIngestão concluída.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
