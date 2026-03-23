import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateContactPackage, useUpdateContactPackage } from "@/hooks/useContacts";
import { toast } from "sonner";
import type { ContactPackage } from "@/types/database";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  description: z.string().optional(),
  status: z.enum(["active", "paused", "completed", "cancelled"]).default("active"),
  price: z.union([z.coerce.number().min(0), z.literal("")]).optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  sessions_total: z.union([z.coerce.number().int().min(1), z.literal("")]).optional(),
}).refine((d) => {
  if (d.start_date && d.end_date && d.end_date < d.start_date) return false;
  return true;
}, { message: "Data de término deve ser posterior ao início", path: ["end_date"] });

type FormData = z.infer<typeof schema>;

interface Props {
  contactId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: ContactPackage | null;
}

export function CreatePackageDialog({ contactId, open, onOpenChange, editing }: Props) {
  const createPkg = useCreateContactPackage(contactId);
  const updatePkg = useUpdateContactPackage(contactId);
  const isEditing = !!editing;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: editing?.name ?? "",
      description: editing?.description ?? "",
      status: (editing?.status as FormData["status"]) ?? "active",
      price: editing?.price != null ? editing.price : "",
      start_date: editing?.start_date ?? "",
      end_date: editing?.end_date ?? "",
      sessions_total: editing?.sessions_total != null ? editing.sessions_total : "",
    },
  });

  const status = watch("status");

  const onSubmit = (values: FormData) => {
    const payload = {
      name: values.name,
      description: values.description || null,
      status: values.status,
      price: values.price !== "" ? Number(values.price) : null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      sessions_total: values.sessions_total !== "" ? Number(values.sessions_total) : null,
    };

    if (isEditing) {
      updatePkg.mutate(
        { packageId: editing!.id, ...payload },
        {
          onSuccess: () => { toast.success("Pacote atualizado"); onOpenChange(false); reset(); },
          onError: () => toast.error("Erro ao atualizar pacote"),
        }
      );
    } else {
      createPkg.mutate(payload, {
        onSuccess: () => { toast.success("Pacote criado"); onOpenChange(false); reset(); },
        onError: () => toast.error("Erro ao criar pacote"),
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar Pacote" : "Novo Pacote / Serviço"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pkg-name">Nome *</Label>
            <Input id="pkg-name" placeholder="Ex: Pacote Mensal, Tratamento Ortodôntico" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkg-desc">Descrição</Label>
            <Textarea id="pkg-desc" rows={2} placeholder="Detalhes do serviço ou pacote" {...register("description")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as FormData["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="completed">Concluído</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-price">Valor (R$)</Label>
              <Input id="pkg-price" type="number" min="0" step="0.01" placeholder="0,00" {...register("price")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pkg-start">Início</Label>
              <Input id="pkg-start" type="date" {...register("start_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pkg-end">Término</Label>
              <Input id="pkg-end" type="date" {...register("end_date")} />
              {errors.end_date && <p className="text-xs text-destructive">{errors.end_date.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pkg-sessions">Total de Sessões (opcional)</Label>
            <Input id="pkg-sessions" type="number" min="1" placeholder="Ex: 10" {...register("sessions_total")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createPkg.isPending || updatePkg.isPending}>
              {isEditing ? "Salvar" : "Criar Pacote"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
