import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, FileText, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { nexusDb as supabase } from "@/integrations/supabase/nexus-client";
import {
  useContactDocuments,
  useCreateContactDocument,
  useDeleteContactDocument,
} from "@/hooks/useContacts";
import { getActiveEmbedCrm } from "@/lib/api-client";
import { embedCrmFetch } from "@/lib/embed-crm-api";
import type { ContactDocument, ContactDocumentCategory } from "@/types/database";
import { toast } from "sonner";

const CATEGORY_LABELS: Record<ContactDocumentCategory, string> = {
  geral: "Geral",
  contrato: "Contrato",
  identidade: "Identidade",
  comprovante: "Comprovante",
  outro: "Outro",
};

function formatFileSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  contactId: string;
  tenantId: string;
}

export function ContactDocumentsTab({ contactId, tenantId }: Props) {
  const qc = useQueryClient();
  const { data: documents, isLoading } = useContactDocuments(contactId);
  const createDoc = useCreateContactDocument(contactId);
  const deleteDoc = useDeleteContactDocument(contactId);
  const fileRef = useRef<HTMLInputElement>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [docName, setDocName] = useState("");
  const [category, setCategory] = useState<ContactDocumentCategory>("geral");
  const [notes, setNotes] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resetUploadForm = () => {
    setPendingFile(null);
    setDocName("");
    setCategory("geral");
    setNotes("");
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Arquivo deve ter no máximo 50 MB");
      return;
    }
    setPendingFile(file);
    if (!docName.trim()) setDocName(file.name.replace(/\.[^.]+$/, ""));
    setUploadOpen(true);
    e.target.value = "";
  };

  const handleUpload = async () => {
    if (!pendingFile || !docName.trim()) {
      toast.error("Informe o nome do arquivo");
      return;
    }
    setUploading(true);
    try {
      const embed = getActiveEmbedCrm();
      if (embed) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
          reader.readAsDataURL(pendingFile);
        });
        await embedCrmFetch<ContactDocument>(
          `/crm-contacts/${contactId}/documents/upload`,
          embed,
          {
            method: "POST",
            body: {
              file_base64: base64,
              file_name: pendingFile.name,
              file_type: pendingFile.type || null,
              name: docName.trim(),
              category,
              notes: notes.trim() || null,
            },
          },
        );
        await qc.invalidateQueries({ queryKey: ["crm-contacts", contactId, "documents"] });
      } else {
        const ext = pendingFile.name.split(".").pop() ?? "bin";
        const path = `${tenantId}/${contactId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("contact-files")
          .upload(path, pendingFile, { upsert: false });
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from("contact-files").getPublicUrl(path);
        await createDoc.mutateAsync({
          name: docName.trim(),
          file_url: data.publicUrl,
          category,
          file_type: pendingFile.type || null,
          file_size: pendingFile.size,
          notes: notes.trim() || null,
        });
      }
      toast.success("Arquivo enviado!");
      setUploadOpen(false);
      resetUploadForm();
    } catch (err: unknown) {
      toast.error("Erro no upload: " + (err instanceof Error ? err.message : "falha"));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteDoc.mutate(deleteId, {
      onSuccess: () => {
        toast.success("Arquivo removido");
        setDeleteId(null);
      },
      onError: () => toast.error("Erro ao remover arquivo"),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {documents?.length ? `${documents.length} arquivo(s)` : "Nenhum arquivo"}
        </p>
        <div>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFilePick} />
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4 mr-1" /> Enviar arquivo
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : documents && documents.length > 0 ? (
        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} onDelete={() => setDeleteId(doc.id)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-3">
          <FileText className="h-10 w-10 opacity-30" />
          <p className="text-sm">Nenhum documento anexado</p>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <FileUp className="h-4 w-4 mr-1" /> Enviar primeiro arquivo
          </Button>
        </div>
      )}

      <Dialog open={uploadOpen} onOpenChange={(v) => { setUploadOpen(v); if (!v) resetUploadForm(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enviar arquivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {pendingFile && (
              <p className="text-xs text-muted-foreground truncate">
                {pendingFile.name} ({formatFileSize(pendingFile.size)})
              </p>
            )}
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input value={docName} onChange={(e) => setDocName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ContactDocumentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CATEGORY_LABELS) as ContactDocumentCategory[]).map((k) => (
                    <SelectItem key={k} value={k}>{CATEGORY_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Observações (opcional)</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancelar</Button>
            <Button onClick={handleUpload} disabled={uploading || !pendingFile}>
              {uploading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Enviando...</> : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover arquivo?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DocumentRow({ doc, onDelete }: { doc: ContactDocument; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <FileText className="h-4 w-4 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{doc.name}</p>
        <div className="flex flex-wrap items-center gap-2 mt-0.5">
          <Badge variant="secondary" className="text-[10px] h-5">
            {CATEGORY_LABELS[doc.category]}
          </Badge>
          {doc.file_size != null && (
            <span className="text-[10px] text-muted-foreground">{formatFileSize(doc.file_size)}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
