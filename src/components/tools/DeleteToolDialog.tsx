import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteTool } from "@/hooks/useTools";
import { toast } from "sonner";
import type { Tool } from "@/types/database";

interface Props { tool: Tool | null; open: boolean; onOpenChange: (o: boolean) => void; }

export function DeleteToolDialog({ tool, open, onOpenChange }: Props) {
  const del = useDeleteTool();
  const handle = async () => {
    if (!tool) return;
    try { await del.mutateAsync(tool.id); toast.success("Tool removida"); onOpenChange(false); }
    catch (err: any) { toast.error("Erro: " + (err.message ?? "")); }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Tool</AlertDialogTitle>
          <AlertDialogDescription>Remover <strong>{tool?.name}</strong>? Agentes que usam esta tool perderão acesso.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handle} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {del.isPending ? "Removendo..." : "Remover"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
