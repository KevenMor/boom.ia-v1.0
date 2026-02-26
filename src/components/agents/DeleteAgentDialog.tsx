import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteAgent } from "@/hooks/useAgents";
import { toast } from "sonner";
import type { Agent } from "@/types/database";

interface Props { agent: Agent | null; open: boolean; onOpenChange: (o: boolean) => void; }

export function DeleteAgentDialog({ agent, open, onOpenChange }: Props) {
  const del = useDeleteAgent();
  const handle = async () => {
    if (!agent) return;
    try { await del.mutateAsync(agent.id); toast.success("Agente removido"); onOpenChange(false); }
    catch (err: any) { toast.error("Erro: " + (err.message ?? "")); }
  };
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover Agente</AlertDialogTitle>
          <AlertDialogDescription>Remover <strong>{agent?.name}</strong>? Todas as conversas e dados do agente serão perdidos.</AlertDialogDescription>
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
