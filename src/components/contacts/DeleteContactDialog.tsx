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
import { useDeleteContact } from "@/hooks/useContacts";
import { toast } from "sonner";
import type { Contact } from "@/types/database";

interface DeleteContactDialogProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteContactDialog({ contact, open, onOpenChange }: DeleteContactDialogProps) {
  const deleteContact = useDeleteContact();

  const handleDelete = async () => {
    if (!contact) return;
    try {
      await deleteContact.mutateAsync(contact.id);
      toast.success("Contato removido");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao remover: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Contato</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja remover <strong>{contact?.name ?? ""}</strong>? Esta ação é irreversível.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteContact.isPending ? "Removendo..." : "Remover"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
