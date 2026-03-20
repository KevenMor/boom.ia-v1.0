import { useEffect } from "react";
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
import { useUpdateContact } from "@/hooks/useContacts";
import { toast } from "sonner";
import type { Contact } from "@/types/database";

const schema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.union([z.string().email("E-mail inválido"), z.literal("")]).optional(),
  phone: z.string().optional(),
  cpf_cnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface EditContactDialogProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditContactDialog({ contact, open, onOpenChange }: EditContactDialogProps) {
  const updateContact = useUpdateContact();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      cpf_cnpj: "",
      address: "",
      city: "",
      state: "",
      zip_code: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (contact) {
      reset({
        name: contact.name,
        email: contact.email || "",
        phone: contact.phone || "",
        cpf_cnpj: contact.cpf_cnpj || "",
        address: contact.address || "",
        city: contact.city || "",
        state: contact.state || "",
        zip_code: contact.zip_code || "",
        notes: contact.notes || "",
      });
    }
  }, [contact, reset]);

  const onSubmit = async (data: FormData) => {
    if (!contact) return;
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        cpf_cnpj: data.cpf_cnpj || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code || null,
        notes: data.notes || null,
      });
      toast.success("Contato atualizado!");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao atualizar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  if (!contact) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Editar Contato</DialogTitle>
          <p className="text-sm text-muted-foreground">{contact.name}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email")} />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" {...register("phone")} />
            </div>
          </div>

          <div>
            <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
            <Input id="cpf_cnpj" {...register("cpf_cnpj")} />
          </div>

          <div>
            <Label htmlFor="address">Endereço</Label>
            <Input id="address" {...register("address")} />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" {...register("city")} />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input id="state" {...register("state")} maxLength={2} />
            </div>
            <div>
              <Label htmlFor="zip_code">CEP</Label>
              <Input id="zip_code" {...register("zip_code")} />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" {...register("notes")} rows={3} className="resize-none" />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={updateContact.isPending}>
              {updateContact.isPending ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
