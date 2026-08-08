import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
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

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

export function CreateContactDialog({ open, onOpenChange, contactType = "lead" }: CreateContactDialogProps) {
  const createContact = useCreateContact();
  const { selectedTenantId } = useTenantContext();

  const [cepLoading, setCepLoading] = useState(false);
  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<FormData>({
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

  const nameValue = watch("name");
  const emailValue = watch("email");
  const phoneValue = watch("phone");
  const cpfValue = watch("cpf_cnpj");

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
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto p-0 gap-0 border-none bg-background rounded-xl shadow-2xl">
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-5 h-full">
          {/* Coluna da Esquerda: Formulário */}
          <div className="lg:col-span-3 p-6 space-y-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                <h2 className="text-lg font-bold tracking-tight text-foreground">
                  {contactType === "client" ? "Novo Cliente" : "Novo Lead"}
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Insira as informações básicas, de contato e localização do cliente.
              </p>
            </div>

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
          </div>

          {/* Coluna da Direita: Preview Card */}
          <div className="lg:col-span-2 bg-slate-50 dark:bg-slate-900/40 border-l border-slate-100 dark:border-slate-800 p-6 flex flex-col justify-between">
            <div className="space-y-6">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-primary" />
                Visualização do Card
              </div>
              
              {/* Card Flutuante */}
              <div className="relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-all duration-300 hover:shadow-md">
                <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/10 blur-xl" />
                
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="absolute -inset-0.5 rounded-full bg-gradient-to-tr from-primary to-cyan-500 opacity-30 blur" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 border font-bold text-lg text-primary uppercase shadow-inner">
                      {nameValue ? getInitials(nameValue) : "?"}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <h3 className="font-bold text-sm text-foreground truncate capitalize">
                      {nameValue || "Nome do Cliente"}
                    </h3>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/20 capitalize">
                        {contactType === "client" ? "Cliente" : "Lead"}
                      </span>
                      {cpfValue && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border">
                          {cpfValue}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="mt-5 pt-4 border-t space-y-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span className="truncate">{emailValue || "E-mail não cadastrado"}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                    <span>{phoneValue || "WhatsApp não cadastrado"}</span>
                  </div>
                </div>
              </div>

              {/* Seção: Observações */}
              <div className="space-y-2">
                <Label htmlFor="notes" className="text-xs font-semibold flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Observações Internas
                </Label>
                <Textarea
                  id="notes"
                  {...register("notes")}
                  placeholder="Notas adicionais sobre o perfil do cliente, preferências, histórico..."
                  rows={4}
                  className="resize-none text-xs bg-card"
                />
              </div>
            </div>

            <DialogFooter className="border-t pt-4 mt-6 flex items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={createContact.isPending}>
                {createContact.isPending ? "Cadastrando..." : "Cadastrar Cliente"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
