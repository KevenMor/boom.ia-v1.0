import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDeleteSuiteGallery } from "@/hooks/useSuiteGalleries";
import type { SuiteGallery } from "@/types/database";

type Props = {
  gallery: SuiteGallery | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DeleteSuiteGalleryDialog({ gallery, open, onOpenChange }: Props) {
  const del = useDeleteSuiteGallery();

  const handleDelete = async () => {
    if (!gallery) return;
    try {
      await del.mutateAsync(gallery.id);
      toast.success(`Galeria "${gallery.name}" excluída.`);
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao excluir: " + (err instanceof Error ? err.message : ""));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir galeria</DialogTitle>
          <DialogDescription>
            Tem certeza que deseja excluir a galeria{" "}
            <span className="font-medium text-foreground">"{gallery?.name}"</span>? Esta ação não
            pode ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={del.isPending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={del.isPending}>
            {del.isPending ? "Excluindo…" : "Excluir"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
