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
import { useDeleteOccurrence } from "@/hooks/useOccurrences";
import type { Occurrence } from "@/types/database";
import { toast } from "sonner";

interface DeleteOccurrenceDialogProps {
  occurrence: Occurrence | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteOccurrenceDialog({ occurrence, open, onOpenChange }: DeleteOccurrenceDialogProps) {
  const deleteMutation = useDeleteOccurrence();

  const handleDelete = async () => {
    if (!occurrence) return;
    try {
      await deleteMutation.mutateAsync(occurrence.id);
      toast.success("Ocorrência removida.");
      onOpenChange(false);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "erro desconhecido";
      toast.error("Erro: " + message);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover ocorrência?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acção não pode ser anulada. A ocorrência{" "}
            <span className="font-medium text-foreground">&quot;{occurrence?.title}&quot;</span> será eliminada.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
            disabled={deleteMutation.isPending}
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
