import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useImportContacts, type ImportContactRow } from "@/hooks/useContacts";
import { useTenantContext } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { parseContactsCsv } from "@/lib/parseCsv";
import { capitalizeName } from "@/lib/capitalizeName";
import { Upload } from "lucide-react";

interface ImportClientsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportClientsDialog({ open, onOpenChange }: ImportClientsDialogProps) {
  const { selectedTenantId } = useTenantContext();
  const importMutation = useImportContacts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportContactRow[] | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.endsWith(".csv")) {
      toast.error("Selecione um arquivo CSV");
      return;
    }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result ?? "");
        const rows = parseContactsCsv(text);
        setPreview(rows);
        if (rows.length === 0) {
          toast.warning("Nenhum contato válido encontrado no CSV");
        }
      } catch {
        toast.error("Erro ao ler o arquivo CSV");
        setPreview(null);
      }
    };
    reader.readAsText(f, "UTF-8");
  };

  const handleImport = async () => {
    if (!selectedTenantId || !preview || preview.length === 0) {
      toast.error("Selecione um tenant e um arquivo com contatos válidos");
      return;
    }
    try {
      const res = await importMutation.mutateAsync({
        tenant_id: selectedTenantId,
        rows: preview.map((r) => ({ ...r, name: capitalizeName(r.name) })),
      });
      toast.success(`${res.imported} cliente(s) importado(s)`);
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao importar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Importar clientes</DialogTitle>
          <DialogDescription>
            Envie um arquivo CSV com as colunas: Nome, E-mail, Telefone, CPF/CNPJ, Cidade, Estado, Endereço, CEP, Observações.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2 h-24 border-dashed"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-6 w-6 text-muted-foreground" />
            <span>{file ? file.name : "Clique para selecionar um CSV"}</span>
          </Button>

          {preview && preview.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-40 overflow-y-auto">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                {preview.length} contato(s) serão importados
              </p>
              <ul className="text-sm space-y-1">
                {preview.slice(0, 5).map((r, i) => (
                  <li key={i} className="truncate">
                    {r.name}
                    {r.email ? ` — ${r.email}` : ""}
                  </li>
                ))}
                {preview.length > 5 && (
                  <li className="text-muted-foreground">… e mais {preview.length - 5}</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter className="pt-4">
          <Button type="button" variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={!preview?.length || !selectedTenantId || importMutation.isPending}
          >
            {importMutation.isPending ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
