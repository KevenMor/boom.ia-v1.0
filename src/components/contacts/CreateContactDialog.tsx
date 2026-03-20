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
import { useState } from "react";
import { useCreateContact } from "@/hooks/useContacts";
import { useTenantContext } from "@/contexts/TenantContext";
import { toast } from "sonner";
import { fetchAddressByCep } from "@/lib/viacep";
import { capitalizeName } from "@/lib/capitalizeName";

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

interface CreateContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Quando 'client', cadastra como cliente; senão como lead */
  contactType?: "lead" | "client";
}

export function CreateContactDialog({ open, onOpenChange, contactType = "lead" }: CreateContactDialogProps) {
  const createContact = useCreateContact();
  const { selectedTenantId } = useTenantContext();

  const [cepLoading, setCepLoading] = useState(false);
  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<FormData>({
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

  const onSubmit = async (data: FormData) => {
    if (!selectedTenantId) {
      toast.error("Selecione um tenant para cadastrar contatos");
      return;
    }
    try {
      await createContact.mutateAsync({
        tenant_id: selectedTenantId,
        name: capitalizeName(data.name),
        email: data.email || null,
        phone: data.phone || null,
        cpf_cnpj: data.cpf_cnpj || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code || null,
        notes: data.notes || null,
        contact_type: contactType,
      });
      toast.success("Contato cadastrado!");
      reset();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error("Erro ao cadastrar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Novo Contato</DialogTitle>
          <p className="text-sm text-muted-foreground">Cadastre um contato no CRM</p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <div>
            <Label htmlFor="name">Nome *</Label>
            <Input id="name" {...register("name")} placeholder="Nome completo" />
            {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...register("email")} placeholder="email@exemplo.com" />
              {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <Label htmlFor="phone">Telefone</Label>
              <Input id="phone" {...register("phone")} placeholder="(11) 99999-9999" />
            </div>
          </div>

          <div>
            <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
            <Input id="cpf_cnpj" {...register("cpf_cnpj")} placeholder="000.000.000-00" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Label htmlFor="address">Endereço</Label>
              <Input id="address" {...register("address")} placeholder="Rua, número, complemento" />
            </div>
            <div>
              <Label htmlFor="zip_code">CEP</Label>
              <Input
                id="zip_code"
                placeholder="01310-100"
                disabled={cepLoading}
                {...(() => {
                  const { onBlur, ...rest } = register("zip_code");
                  return {
                    ...rest,
                    onBlur: async (e: React.FocusEvent<HTMLInputElement>) => {
                      onBlur(e);
                      const cep = e.target.value.trim();
                      if (cep.replace(/\D/g, "").length !== 8) return;
                      setCepLoading(true);
                      try {
                        const result = await fetchAddressByCep(cep);
                        if (result) {
                          setValue("address", result.address);
                          setValue("city", result.city);
                          setValue("state", result.state);
                          toast.success("Endereço preenchido automaticamente");
                        } else {
                          toast.error("CEP não encontrado");
                        }
                      } finally {
                        setCepLoading(false);
                      }
                    },
                  };
                })()}
              />
              {cepLoading && (
                <p className="text-xs text-muted-foreground mt-0.5">Buscando...</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="city">Cidade</Label>
              <Input id="city" {...register("city")} placeholder="São Paulo" />
            </div>
            <div>
              <Label htmlFor="state">Estado</Label>
              <Input id="state" {...register("state")} placeholder="SP" maxLength={2} />
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Observações</Label>
            <Textarea id="notes" {...register("notes")} placeholder="Notas..." rows={3} className="resize-none" />
          </div>

          <DialogFooter className="pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createContact.isPending}>
              {createContact.isPending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
