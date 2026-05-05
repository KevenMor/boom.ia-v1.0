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
import { useDeleteInventory } from "@/hooks/useInventory";
import { toast } from "sonner";
import type { InventoryItem } from "@/types/database";

interface DeleteInventoryDialogProps {
  item: InventoryItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteInventoryDialog({ item, open, onOpenChange }: DeleteInventoryDialogProps) {
  const deleteInventory = useDeleteInventory();

  const handleDelete = async () => {
    if (!item) return;
    try {
      await deleteInventory.mutateAsync(item.id);
      toast.success("Veículo removido do inventário");
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao remover: " + (err.message ?? "erro desconhecido"));
    }
  };

  const vehicleName = item ? `${item.brand} ${item.model} ${item.version}`.trim() : "";

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Veículo</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover <strong>{vehicleName}</strong> do inventário? Esta ação é irreversível.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteInventory.isPending ? "Removendo..." : "Remover"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
