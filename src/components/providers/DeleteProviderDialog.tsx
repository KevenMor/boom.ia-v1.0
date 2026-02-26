import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteProvider } from "@/hooks/useProviders";
import { toast } from "sonner";
import type { Provider } from "@/types/database";

interface Props { provider: Provider | null; open: boolean; onOpenChange: (o: boolean) => void; }

export function DeleteProviderDialog({ provider, open, onOpenChange }: Props) {
  const del = useDeleteProvider();
  const handle = async () => {
    if (!provider) return;
    try { await del.mutateAsync(provider.id); toast.success("Provider removido"); onOpenChange(false); }
    catch (err: any) { toast.error("Erro: " + (err.message ?? "")); }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Provider</AlertDialogTitle>
          <AlertDialogDescription>Remover <strong>{provider?.name}</strong>? Agentes vinculados perderão o provider.</AlertDialogDescription>
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
