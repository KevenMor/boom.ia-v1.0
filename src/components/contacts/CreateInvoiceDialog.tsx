import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
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
import { useCreateContactInvoice } from "@/hooks/useContacts";
import { toast } from "sonner";

const schema = z.object({
  amount: z.coerce.number().min(0.01, "Valor deve ser maior que zero"),
  due_date: z.string().min(1, "Data de vencimento é obrigatória"),
  description: z.string().optional(),
  status: z.enum(["pending", "paid", "overdue", "cancelled"]).optional(),
});

type FormData = z.infer<typeof schema>;

interface CreateInvoiceDialogProps {
  contactId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateInvoiceDialog({ contactId, open, onOpenChange }: CreateInvoiceDialogProps) {
  const createInvoice = useCreateContactInvoice(contactId);

  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      amount: 0,
      due_date: new Date().toISOString().slice(0, 10),
      description: "",
      status: "pending",
    },
  });

  const status = watch("status");

  const onSubmit = async (data: FormData) => {
    if (!contactId) return;
    try {
      await createInvoice.mutateAsync({
        amount: data.amount,
        due_date: data.due_date,
        description: data.description || undefined,
        status: data.status,
      });
      toast.success("Fatura criada!");
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao criar fatura: " + (err instanceof Error ? err.message : ""));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova fatura</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                placeholder="0,00"
                {...register("amount")}
              />
              {errors.amount && (
                <p className="text-xs text-destructive">{errors.amount.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Vencimento</Label>
              <Input id="due_date" type="date" {...register("due_date")} />
              {errors.due_date && (
                <p className="text-xs text-destructive">{errors.due_date.message}</p>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v) => setValue("status", v as FormData["status"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="paid">Pago</SelectItem>
                <SelectItem value="overdue">Vencido</SelectItem>
                <SelectItem value="cancelled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea id="description" {...register("description")} rows={2} className="resize-none" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createInvoice.isPending}>
              {createInvoice.isPending ? "Salvando..." : "Criar fatura"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
