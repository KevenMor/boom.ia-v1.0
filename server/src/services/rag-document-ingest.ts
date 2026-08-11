import { PDFParse } from "pdf-parse";
import type { SupabaseClient } from "@supabase/supabase-js";

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
const EMBEDDING_MODEL = "text-embedding-ada-002";

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/\n+/g, "\n").trim();
}

function chunkText(text: string): string[] {
  if (!text || text.length === 0) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + CHUNK_SIZE, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(" ", end);
      if (lastSpace > start + CHUNK_SIZE / 2) end = lastSpace + 1;
    }
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 30) chunks.push(chunk);
    if (end >= text.length) break;
    start = end - CHUNK_OVERLAP;
    if (start >= text.length) break;
  }
  return chunks;
}

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
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI embeddings error (status ${res.status}): ${errText}`);
  }
  const data = (await res.json()) as { data: { embedding: number[]; index: number }[] };
  const byIndex = (data.data || []).sort((a, b) => a.index - b.index);
  return byIndex.map((d) => d.embedding);
}

export interface IngestPdfOptions {
  agentId: string;
  filePath: string;
  originalName: string;
  openaiKey: string;
}

export async function ingestPdfDocument(
  supabase: SupabaseClient,
  options: IngestPdfOptions
): Promise<{ success: boolean; chunksCount: number; error?: string }> {
  const { agentId, filePath, originalName, openaiKey } = options;

  let schema = "";
  let docId = "";
  let insertedCount = 0;

  try {
    // 1. Obter informações de tenant do agente
    const { data: agent, error: agentErr } = await supabase
      .from("agents")
      .select("tenant_id")
      .eq("id", agentId)
      .single();

    if (agentErr || !agent) {
      throw new Error(`Agente não encontrado: ${agentErr?.message || ""}`);
    }

    const { data: tenant, error: tenantErr } = await supabase
      .from("tenants")
      .select("db_name")
      .eq("id", agent.tenant_id)
      .single();

    if (tenantErr || !tenant || !tenant.db_name) {
      throw new Error(`Schema do tenant não encontrado: ${tenantErr?.message || ""}`);
    }

    schema = tenant.db_name;

    // 2. Baixar o arquivo PDF do Supabase Storage
    const { data: fileBlob, error: downloadErr } = await supabase.storage
      .from("agent-documents")
      .download(filePath);

    if (downloadErr || !fileBlob) {
      throw new Error(`Falha ao baixar arquivo do storage: ${downloadErr?.message || ""}`);
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Extrair texto baseado na extensão do arquivo
    const ext = originalName.split(".").pop()?.toLowerCase() || "";
    let rawText = "";
    let totalPages = 1;

    try {
      if (ext === "pdf") {
        const pdfParser = new PDFParse({ data: buffer });
        try {
          const textResult = await pdfParser.getText();
          rawText = textResult.text || "";
          totalPages = textResult.total || 1;
        } finally {
          await pdfParser.destroy();
        }
      } else if (ext === "docx") {
        const mammoth = await import("mammoth");
        const docxResult = await mammoth.extractRawText({ buffer });
        rawText = docxResult.value || "";
        totalPages = 1;
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX = await import("xlsx");
        const workbook = XLSX.read(buffer, { type: "buffer" });
        let combinedText = "";
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          if (!worksheet) continue;
          const sheetText = XLSX.utils.sheet_to_csv(worksheet);
          combinedText += `\n--- Planilha: ${sheetName} ---\n${sheetText}\n`;
        }
        rawText = combinedText;
        totalPages = workbook.SheetNames.length || 1;
      } else if (ext === "txt" || ext === "md" || ext === "csv") {
        rawText = buffer.toString("utf-8");
        totalPages = 1;
      } else {
        throw new Error(`Extensão de arquivo não suportada: .${ext}`);
      }
    } catch (parseErr: any) {
      throw new Error(`Falha ao extrair texto do arquivo (.${ext}): ${parseErr.message || parseErr}`);
    }

    const cleanRawText = cleanText(rawText);

    if (cleanRawText.length < 10) {
      throw new Error("O documento de conhecimento está vazio ou o texto não pôde ser extraído.");
    }

    // 4. Inserir documento no RAG com status 'processing'
    const { data: insertedDocId, error: insDocErr } = await supabase.rpc("rag_ingest_insert_document", {
      p_schema: schema,
      p_agent_id: agentId,
      p_title: originalName,
      p_source_url: filePath,
      p_metadata: {
        file_size: buffer.length,
        total_pages: totalPages,
      },
    });

    if (insDocErr || !insertedDocId) {
      throw new Error(`Falha ao registrar documento no banco: ${insDocErr?.message || ""}`);
    }

    docId = insertedDocId;

    // 5. Chunking do texto
    const chunks = chunkText(cleanRawText);
    if (chunks.length === 0) {
      throw new Error("Não foi possível segmentar o texto do PDF em chunks.");
    }

    // 6. Gerar embeddings e salvar chunks em lotes (batch)
    const BATCH_SIZE = 15;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
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
          p_metadata: {
            url: filePath,
            title: originalName,
          },
        });

        if (chunkErr) {
          console.error(`Erro ao inserir chunk ${i + j}:`, chunkErr.message);
        } else {
          insertedCount++;
        }
      }

      // Atualizar progresso parcial (chunks inseridos até o momento)
      await supabase.rpc("rag_ingest_update_document_status", {
        p_schema: schema,
        p_document_id: docId,
        p_chunk_count: insertedCount,
        p_status: "processing",
      });
    }

    // 7. Atualizar status do documento para ready
    const { error: updateErr } = await supabase.rpc("rag_ingest_update_document_status", {
      p_schema: schema,
      p_document_id: docId,
      p_chunk_count: insertedCount,
      p_status: "ready",
    });

    if (updateErr) {
      console.warn("Erro ao atualizar status final do documento RAG:", updateErr.message);
    }

    return {
      success: true,
      chunksCount: insertedCount,
    };
  } catch (err: any) {
    const errMsg = err.message || String(err);
    console.error(`Erro na ingestão de documento RAG (${originalName}):`, errMsg);

    // Tentar marcar como erro no banco se o registro já tiver sido criado
    if (schema && docId) {
      try {
        await supabase.rpc("rag_ingest_update_document_status", {
          p_schema: schema,
          p_document_id: docId,
          p_chunk_count: insertedCount,
          p_status: "error",
        });
      } catch (dbUpdateErr) {
        console.error("Falha ao registrar erro no banco para o documento RAG:", dbUpdateErr);
      }
    }

    return {
      success: false,
      chunksCount: insertedCount,
      error: errMsg,
    };
  }
}
