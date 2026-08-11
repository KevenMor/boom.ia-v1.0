import { useState, useEffect, useRef } from "react";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import { callAPI } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { 
  FileText, 
  Trash2, 
  Loader2, 
  UploadCloud, 
  CheckCircle2, 
  AlertCircle, 
  Database,
  Calendar,
  Layers
} from "lucide-react";

interface KnowledgeDocument {
  id: string;
  agent_id: string;
  title: string;
  source_url: string;
  file_type: string | null;
  status: "processing" | "ready" | "error";
  chunk_count: number;
  metadata: any;
  created_at: string;
}

export default function AgentKnowledgeBaseSection({ agentId }: { agentId: string }) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States para visualização de chunks
  const [viewingDoc, setViewingDoc] = useState<KnowledgeDocument | null>(null);
  const [chunks, setChunks] = useState<Array<{ id: string; content: string; chunk_index: number }>>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  const handleViewChunks = async (doc: KnowledgeDocument) => {
    setViewingDoc(doc);
    setLoadingChunks(true);
    setChunks([]);
    try {
      const res = await callAPI<{ success: boolean; chunks: Array<{ id: string; content: string; chunk_index: number }> }>(
        `/agents/${agentId}/documents/${doc.id}/chunks`,
        { method: "GET" }
      );
      if (res.success) {
        setChunks(res.chunks);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar chunks");
    } finally {
      setLoadingChunks(false);
    }
  };

  useEffect(() => {
    if (agentId) {
      loadDocuments();
      
      // Criar um polling simples para atualizar o status dos documentos em processamento
      const interval = setInterval(() => {
        setDocuments(prev => {
          const hasProcessing = prev.some(d => d.status === "processing");
          if (hasProcessing) {
            void loadDocumentsSilently();
          }
          return prev;
        });
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [agentId]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const res = await callAPI<{ success: boolean; documents: KnowledgeDocument[] }>(
        `/agents/${agentId}/documents`,
        { method: "GET" }
      );
      if (res.success) {
        setDocuments(res.documents);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao carregar base de conhecimento");
    } finally {
      setLoading(false);
    }
  };

  const loadDocumentsSilently = async () => {
    try {
      const res = await callAPI<{ success: boolean; documents: KnowledgeDocument[] }>(
        `/agents/${agentId}/documents`,
        { method: "GET" }
      );
      if (res.success) {
        setDocuments(res.documents);
      }
    } catch (err) {
      console.error("Silent load documents failed:", err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExtensions = ["pdf", "docx", "xlsx", "xls", "txt", "md", "csv"];
    const fileExt = file.name.split(".").pop()?.toLowerCase() || "";

    if (!allowedExtensions.includes(fileExt)) {
      toast.error("Formato de arquivo não suportado. Envie PDF, Word, Excel, TXT, Markdown ou CSV.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("O arquivo deve ter no máximo 20MB.");
      return;
    }

    setUploading(true);
    const timestamp = Date.now();
    // Limpar o nome do arquivo para evitar problemas de caracteres especiais
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storagePath = `${agentId}/${timestamp}_${cleanFileName}`;

    try {
      // 1. Upload do PDF para o Supabase Storage via bucket 'agent-documents'
      const { data, error: uploadErr } = await supabase.storage
        .from("agent-documents")
        .upload(storagePath, file, { 
          cacheControl: "3600",
          upsert: false 
        });

      if (uploadErr || !data) {
        throw new Error(uploadErr?.message || "Erro no upload para o storage");
      }

      // 2. Chamar o endpoint do backend para iniciar a ingestão RAG
      await callAPI(`/agents/${agentId}/documents/ingest`, {
        method: "POST",
        body: {
          filePath: storagePath,
          originalName: file.name
        }
      });

      toast.success("Documento enviado. O processamento foi iniciado em segundo plano!");
      void loadDocuments();
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha no upload: ${err.message || "Erro desconhecido"}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (docId: string, filePath: string) => {
    const confirmDelete = window.confirm("Tem certeza que deseja remover este documento da base de conhecimento?");
    if (!confirmDelete) return;

    try {
      const res = await callAPI<{ success: boolean; message: string }>(
        `/agents/${agentId}/documents/${docId}?filePath=${encodeURIComponent(filePath)}`,
        { method: "DELETE" }
      );
      if (res.success) {
        toast.success("Documento removido com sucesso!");
        setDocuments(prev => prev.filter(d => d.id !== docId));
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao remover documento");
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              Base de Conhecimento do Agente
            </h3>
            <p className="text-xs text-muted-foreground">
              Envie documentos (PDF, Word, Excel, TXT, Markdown, CSV) para treinar o agente. O texto será extraído e vetorizado automaticamente no RAG.
            </p>
          </div>

          <div>
            <input
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.txt,.md,.csv"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
              disabled={uploading}
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-full sm:w-auto flex items-center gap-2"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <UploadCloud className="h-4 w-4" />
                  Carregar Arquivo (RAG)
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-border/80 bg-muted/20">
          <span className="text-xs font-semibold text-foreground tracking-wide uppercase">
            Documentos Indexados ({documents.length})
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Carregando base de dados RAG...</span>
          </div>
        ) : documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center border-dashed border-2 border-border/60 m-5 rounded-lg bg-muted/5">
            <FileText className="h-10 w-10 text-muted-foreground/60 mb-3" />
            <h4 className="text-sm font-semibold text-foreground">Nenhum documento cadastrado</h4>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Carregue um arquivo de suporte para que o agente possa consultar as informações automaticamente antes de responder aos clientes.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  <th className="px-5 py-3">Documento</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Chunks</th>
                  <th className="px-5 py-3">Data de Upload</th>
                  <th className="px-5 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-sm">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-5 py-4 min-w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/5 text-primary">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[250px]" title={doc.title}>
                            {doc.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground block truncate max-w-[250px]">
                            {doc.source_url}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {doc.status === "ready" && (
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600 hover:bg-green-500/10 border-green-500/20 flex items-center gap-1 w-fit">
                          <CheckCircle2 className="h-3 w-3" />
                          Pronto
                        </Badge>
                      )}
                      {doc.status === "processing" && (
                        <Badge variant="secondary" className="bg-blue-500/10 text-blue-600 hover:bg-blue-500/10 border-blue-500/20 flex items-center gap-1 w-fit">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Processando
                        </Badge>
                      )}
                      {doc.status === "error" && (
                        <Badge variant="secondary" className="bg-destructive/10 text-destructive hover:bg-destructive/10 border-destructive/20 flex items-center gap-1 w-fit">
                          <AlertCircle className="h-3 w-3" />
                          Erro
                        </Badge>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      {doc.status === "ready" ? (
                        <button
                          type="button"
                          onClick={() => handleViewChunks(doc)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary hover:bg-primary/20 transition-all shadow-sm border border-primary/20"
                          title="Visualizar fragmentos de texto (chunks)"
                        >
                          <Layers className="h-3 w-3" />
                          {doc.chunk_count} Chunks
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground/80 border border-border">
                          <Layers className="h-3 w-3" />
                          {doc.chunk_count} Chunks
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(doc.created_at)}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(doc.id, doc.source_url)}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/5 h-8 w-8"
                        title="Deletar documento"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={viewingDoc !== null} onOpenChange={(open) => !open && setViewingDoc(null)}>
        <DialogContent className="max-h-[85vh] max-w-[min(100vw-2rem,46rem)] overflow-y-auto sm:max-w-3xl flex flex-col rounded-xl border border-border shadow-2xl">
          <DialogHeader className="border-b border-border pb-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              <DialogTitle className="text-base font-bold text-foreground">
                Base de Conhecimento — Chunks RAG
              </DialogTitle>
            </div>
            <DialogDescription className="truncate text-xs text-muted-foreground mt-1">
              Documento: <strong className="text-foreground/80 font-medium">{viewingDoc?.title}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-4 py-4 pr-1 max-h-[60vh]">
            {loadingChunks ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="h-7 w-7 animate-spin text-primary" />
                <span className="text-sm text-muted-foreground">Buscando fragmentos de texto...</span>
              </div>
            ) : chunks.length === 0 ? (
              <div className="text-center py-16 text-sm text-muted-foreground border border-dashed rounded-lg">
                Nenhum fragmento indexado para este documento.
              </div>
            ) : (
              chunks.map((c) => (
                <div 
                  key={c.id} 
                  className="border-l-4 border-primary bg-muted/30 hover:bg-muted/50 p-5 rounded-r-xl rounded-l-sm shadow-sm space-y-3 text-left transition-all border-y border-r border-border/60"
                >
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span className="flex items-center gap-1.5 text-primary">
                      <Layers className="h-3.5 w-3.5" />
                      Fragmento #{c.chunk_index + 1}
                    </span>
                    <span className="text-[10px] bg-background px-2.5 py-0.5 rounded-full border border-border/80 font-normal">
                      {c.content.length} caracteres
                    </span>
                  </div>
                  <p className="text-sm text-foreground/90 font-normal leading-relaxed whitespace-pre-wrap select-all">
                    {c.content}
                  </p>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
