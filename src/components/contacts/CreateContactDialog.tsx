import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { capitalizeName, capitalizeAsYouType } from "@/lib/capitalizeName";
import { User, Phone, Mail, MapPin, FileText, Loader2, Building2 } from "lucide-react";

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
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <DialogHeader className="border-b pb-4 mb-4">
          <DialogTitle className="text-lg font-bold flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {contactType === "client" ? "Novo Cliente" : "Novo Lead"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Preencha os campos abaixo para cadastrar um novo {contactType === "client" ? "cliente" : "lead"} no sistema ERP.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Seção: Identificação */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <User className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Identificação</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-semibold">Nome Completo *</Label>
                <Input
                  id="name"
                  {...register("name")}
                  onChange={(e) => {
                    const cursor = e.target.selectionStart;
                    const val = capitalizeAsYouType(e.target.value);
                    setValue("name", val);
                    setTimeout(() => {
                      if (e.target && cursor !== null) {
                        e.target.setSelectionRange(cursor, cursor);
                      }
                    }, 0);
                  }}
                  onBlur={(e) => {
                    register("name").onBlur(e);
                    setValue("name", capitalizeName(e.target.value));
                  }}
                  placeholder="Ex: Keven Moreira"
                  className="h-9 text-sm capitalize"
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpf_cnpj" className="text-xs font-semibold">CPF ou CNPJ</Label>
                <Input id="cpf_cnpj" {...register("cpf_cnpj")} placeholder="000.000.000-00" className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção: Contato */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Informações de Contato</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-semibold">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                  <Input id="email" type="email" {...register("email")} placeholder="email@exemplo.com" className="pl-9 h-9 text-sm" />
                </div>
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-semibold">Telefone / WhatsApp</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground/70" />
                  <Input id="phone" {...register("phone")} placeholder="(15) 99999-9999" className="pl-9 h-9 text-sm" />
                </div>
              </div>
            </div>
          </div>

          {/* Seção: Endereço */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Localidade e Endereço</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="zip_code" className="text-xs font-semibold">CEP</Label>
                <div className="relative">
                  <Input
                    id="zip_code"
                    placeholder="01310-100"
                    disabled={cepLoading}
                    className="h-9 text-sm pr-8"
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
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
              
              <div className="space-y-1 md:col-span-3">
                <Label htmlFor="address" className="text-xs font-semibold">Logradouro, Nº, Compl.</Label>
                <Input id="address" {...register("address")} placeholder="Ex: Av. Paulista, 1000 - Apto 12" className="h-9 text-sm" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="city" className="text-xs font-semibold">Cidade</Label>
                <Input id="city" {...register("city")} placeholder="Ex: São Paulo" className="h-9 text-sm" />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="state" className="text-xs font-semibold">Estado</Label>
                <Input id="state" {...register("state")} placeholder="UF" maxLength={2} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção: Observações */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 border-b pb-1.5">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Informações Adicionais</span>
            </div>
            <div className="space-y-1">
              <Label htmlFor="notes" className="text-xs font-semibold">Observações internas</Label>
              <Textarea id="notes" {...register("notes")} placeholder="Notas adicionais sobre o perfil do cliente, preferências, etc..." rows={3} className="resize-none text-sm" />
            </div>
          </div>

          <DialogFooter className="border-t pt-4 mt-6">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={createContact.isPending}>
              {createContact.isPending ? "Cadastrando..." : "Cadastrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
