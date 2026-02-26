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
import { useDeleteTenant } from "@/hooks/useTenants";
import { toast } from "sonner";
import type { Tenant } from "@/types/database";

interface DeleteTenantDialogProps {
  tenant: Tenant | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteTenantDialog({ tenant, open, onOpenChange }: DeleteTenantDialogProps) {
  const deleteTenant = useDeleteTenant();

  const handleDelete = async () => {
    if (!tenant) return;
    try {
      await deleteTenant.mutateAsync(tenant.id);
      toast.success(`Tenant "${tenant.name}" removido`);
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erro ao remover: " + (err.message ?? "erro desconhecido"));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Tenant</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover <strong>{tenant?.name}</strong>? Esta ação é irreversível e removerá todos os agentes associados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteTenant.isPending ? "Removendo..." : "Remover"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
