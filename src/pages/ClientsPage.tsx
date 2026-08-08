import { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Mail,
  Phone,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useContacts, useCreateContact, useUpdateContact } from "@/hooks/useContacts";
import { useTenantContext } from "@/contexts/TenantContext";
import { useEmbedClientsOptional } from "@/contexts/EmbedClientsContext";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { DeleteContactDialog } from "@/components/contacts/DeleteContactDialog";
import { ContactConversationModal } from "@/components/contacts/ContactConversationModal";
import { ImportClientsDialog } from "@/components/contacts/ImportClientsDialog";
import { callAPI } from "@/lib/api-client";
import { openContactMegaConversation } from "@/lib/open-contact-mega-conversation";
import { exportContactsCsv } from "@/lib/exportCsv";
import { fetchAddressByCep } from "@/lib/viacep";
import { capitalizeName, capitalizeAsYouType } from "@/lib/capitalizeName";
import type { Contact } from "@/types/database";

const PAGE_SIZE = 10;
const SORT_OPTIONS = [
  { value: "name_asc", label: "Nome A–Z" },
  { value: "name_desc", label: "Nome Z–A" },
  { value: "recent", label: "Mais recentes" },
] as const;

function sortToApi(sort: (typeof SORT_OPTIONS)[number]["value"]) {
  if (sort === "name_asc") return { order_by: "name" as const, order_dir: "asc" as const };
  if (sort === "name_desc") return { order_by: "name" as const, order_dir: "desc" as const };
  return { order_by: "updated_at" as const, order_dir: "desc" as const };
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function formatCreatedAt(createdAt: string | undefined): string {
  if (!createdAt) return "—";
  try {
    return new Date(createdAt).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

// Zod Schema para Validação dos Formulários ERP
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
  contact_type: z.enum(["lead", "client"]).optional(),
});

type FormData = z.infer<typeof schema>;

// --- SUB-COMPONENTE: FORMULÁRIO DE CADASTRO ERP ---
interface CreateClientViewProps {
  tenantId: string | null;
  onCancel: () => void;
  contactType?: "lead" | "client";
}

function CreateClientView({ tenantId, onCancel, contactType = "lead" }: CreateClientViewProps) {
  const createContact = useCreateContact();
  const [cepLoading, setCepLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, setValue } = useForm<FormData>({
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
    if (!tenantId) {
      toast.error("Selecione um tenant para cadastrar contatos");
      return;
    }
    try {
      await createContact.mutateAsync({
        tenant_id: tenantId,
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
      toast.success("Cliente cadastrado com sucesso!");
      onCancel();
    } catch (err: unknown) {
      toast.error("Erro ao cadastrar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  return (
    <Card className="border border-border bg-card shadow-sm rounded-lg">
      <CardHeader className="border-b border-border/50 pb-4">
        <h2 className="text-base font-semibold text-foreground">Ficha de Inclusão</h2>
        <p className="text-xs text-muted-foreground">Preencha os dados abaixo para registrar o cliente no banco de dados.</p>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="p-6 space-y-6">
          {/* Seção 1: Identificação */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">1. Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">Nome Completo *</Label>
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
                  placeholder="Nome completo do cliente"
                  className="h-9 text-sm"
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpf_cnpj" className="text-xs font-medium text-muted-foreground">CPF ou CNPJ</Label>
                <Input id="cpf_cnpj" {...register("cpf_cnpj")} placeholder="000.000.000-00" className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção 2: Contatos */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">2. Informações de Contato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">E-mail</Label>
                <Input id="email" type="email" {...register("email")} placeholder="exemplo@dominio.com" className="h-9 text-sm" />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">Telefone / WhatsApp</Label>
                <Input id="phone" {...register("phone")} placeholder="(00) 00000-0000" className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção 3: Endereço */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">3. Localidade e Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="zip_code" className="text-xs font-medium text-muted-foreground">CEP</Label>
                <div className="relative">
                  <Input
                    id="zip_code"
                    placeholder="00000-000"
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
                <Label htmlFor="address" className="text-xs font-medium text-muted-foreground">Logradouro, Número, Complemento</Label>
                <Input id="address" {...register("address")} placeholder="Rua, avenida, número, apto..." className="h-9 text-sm" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="city" className="text-xs font-medium text-muted-foreground">Cidade</Label>
                <Input id="city" {...register("city")} placeholder="Nome da cidade" className="h-9 text-sm" />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="state" className="text-xs font-medium text-muted-foreground">Estado (UF)</Label>
                <Input id="state" {...register("state")} placeholder="UF" maxLength={2} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção 4: Informações Adicionais */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">4. Observações e Notas</h3>
            <div className="space-y-1">
              <Label htmlFor="notes" className="text-xs font-medium text-muted-foreground">Observações internas do cliente</Label>
              <Textarea id="notes" {...register("notes")} placeholder="Particularidades, histórico ou observações sobre o cliente..." rows={4} className="resize-none text-sm bg-background" />
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-border/50 bg-muted/20 px-6 py-4 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={createContact.isPending}>
            {createContact.isPending ? "Salvando..." : "Salvar Registro"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// --- SUB-COMPONENTE: FORMULÁRIO DE EDIÇÃO ERP ---
interface EditClientViewProps {
  contact: Contact;
  onCancel: () => void;
}

function EditClientView({ contact, onCancel }: EditClientViewProps) {
  const updateContact = useUpdateContact();
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
      contact_type: "lead",
    },
  });

  const contactType = watch("contact_type");

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
        contact_type: (contact.contact_type === "client" ? "client" : "lead") as "lead" | "client",
      });
    }
  }, [contact, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateContact.mutateAsync({
        id: contact.id,
        name: capitalizeName(data.name),
        email: data.email || null,
        phone: data.phone || null,
        cpf_cnpj: data.cpf_cnpj || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code || null,
        notes: data.notes || null,
        contact_type: data.contact_type === "client" ? "client" : "lead",
      });
      toast.success("Cliente atualizado com sucesso!");
      onCancel();
    } catch (err: unknown) {
      toast.error("Erro ao atualizar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  return (
    <Card className="border border-border bg-card shadow-sm rounded-lg">
      <CardHeader className="border-b border-border/50 pb-4">
        <h2 className="text-base font-semibold text-foreground">Ficha de Edição</h2>
        <p className="text-xs text-muted-foreground">Atualize as informações cadastrais e salve para registrar as alterações.</p>
      </CardHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <CardContent className="p-6 space-y-6">
          {/* Seção 1: Identificação */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">1. Identificação</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">Nome Completo *</Label>
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
                  className="h-9 text-sm"
                />
                {errors.name && <p className="text-xs text-destructive mt-1">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-medium text-muted-foreground">Classificação do Contato</Label>
                <Select value={contactType} onValueChange={(v) => setValue("contact_type", v as "lead" | "client")}>
                  <SelectTrigger className="h-9 text-sm bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="client">Cliente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cpf_cnpj" className="text-xs font-medium text-muted-foreground">CPF ou CNPJ</Label>
                <Input id="cpf_cnpj" {...register("cpf_cnpj")} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção 2: Contatos */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">2. Informações de Contato</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">E-mail</Label>
                <Input id="email" type="email" {...register("email")} className="h-9 text-sm" />
                {errors.email && <p className="text-xs text-destructive mt-1">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone" className="text-xs font-medium text-muted-foreground">Telefone / WhatsApp</Label>
                <Input id="phone" {...register("phone")} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção 3: Endereço */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">3. Localidade e Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="zip_code" className="text-xs font-medium text-muted-foreground">CEP</Label>
                <div className="relative">
                  <Input
                    id="zip_code"
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
                <Label htmlFor="address" className="text-xs font-medium text-muted-foreground">Logradouro, Número, Complemento</Label>
                <Input id="address" {...register("address")} className="h-9 text-sm" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="city" className="text-xs font-medium text-muted-foreground">Cidade</Label>
                <Input id="city" {...register("city")} className="h-9 text-sm" />
              </div>
              <div className="space-y-1 md:col-span-1">
                <Label htmlFor="state" className="text-xs font-medium text-muted-foreground">Estado (UF)</Label>
                <Input id="state" {...register("state")} maxLength={2} className="h-9 text-sm" />
              </div>
            </div>
          </div>

          {/* Seção 4: Informações Adicionais */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground pb-1 border-b border-border/50">4. Observações e Notas</h3>
            <div className="space-y-1">
              <Label htmlFor="notes" className="text-xs font-medium text-muted-foreground">Observações internas do cliente</Label>
              <Textarea id="notes" {...register("notes")} rows={4} className="resize-none text-sm bg-background" />
            </div>
          </div>
        </CardContent>

        <CardFooter className="border-t border-border/50 bg-muted/20 px-6 py-4 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={updateContact.isPending}>
            {updateContact.isPending ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

// --- COMPONENTE PRINCIPAL: CLIENTSPAGE ---
export default function ClientsPage() {
  const embed = useEmbedClientsOptional();
  const isEmbed = !!embed;
  const navigate = useNavigate();
  const { selectedTenantId } = useTenantContext();
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("recent");
  
  // Controle de Visualização da Página (list = Listagem, create = Criar Cliente, edit = Editar Cliente)
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  
  const [importOpen, setImportOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [selectedContactForConversation, setSelectedContactForConversation] = useState<Contact | null>(null);
  const [openingConversationId, setOpeningConversationId] = useState<string | null>(null);
  const [clientStatusFilter, setClientStatusFilter] = useState<string>("all");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchFocused) searchInputRef.current?.focus();
  }, [searchFocused]);

  const tenantId = embed?.tenantId ?? selectedTenantId ?? undefined;
  const order = sortToApi(sort);
  const { data, isLoading, error } = useContacts({
    tenant_id: tenantId,
    search: search.trim() || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    order_by: order.order_by,
    order_dir: order.order_dir,
    type: "client",
  });

  const allContacts = data?.data ?? [];
  const paginatedContacts = clientStatusFilter === "all"
    ? allContacts
    : allContacts.filter((c) => ((c.metadata as Record<string, unknown> | null)?.client_status ?? "active") === clientStatusFilter);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (tenantId) params.set("tenant_id", tenantId);
      params.set("type", "client");
      params.set("limit", "500");
      params.set("offset", "0");
      if (search.trim()) params.set("search", search.trim());
      const res = await callAPI<{ data: Contact[] }>(`/crm-contacts?${params.toString()}`, { method: "GET" });
      const list = res?.data ?? [];
      if (list.length === 0) {
        toast.info("Nenhum cliente para exportar");
        return;
      }
      exportContactsCsv(list, "clientes.csv");
      toast.success("CSV exportado");
    } catch (err: unknown) {
      toast.error("Erro ao exportar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  const profilePathFor = (contactId: string) =>
    isEmbed ? `${embed.basePath}/${contactId}` : `/clients/${contactId}`;

  const handleOpenMegaConversation = async (contactId: string) => {
    setOpeningConversationId(contactId);
    try {
      const ok = await openContactMegaConversation(contactId, embed?.accountId ?? null);
      if (!ok) {
        toast.error("Nenhuma conversa vinculada a este cliente no Mega");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao abrir conversa no Mega");
    } finally {
      setOpeningConversationId(null);
    }
  };

  const handleCancelView = () => {
    setEditContact(null);
    setView("list");
  };

  // --- RENDERIZAR TELA DE CRIAÇÃO ERP ---
  if (view === "create") {
    return (
      <div className={isEmbed ? "w-full px-4 py-6 sm:px-6" : "min-h-[calc(100vh-4rem)] w-full bg-muted/30 px-4 py-6 sm:px-6 lg:px-8"}>
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={handleCancelView} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Voltar para a listagem
          </Button>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Novo Cliente</h1>
          <p className="text-sm text-muted-foreground">Ficha de cadastro para inclusão de novos registros no CRM.</p>
        </div>
        <CreateClientView tenantId={tenantId ?? null} onCancel={handleCancelView} contactType="client" />
      </div>
    );
  }

  // --- RENDERIZAR TELA DE EDIÇÃO ERP ---
  if (view === "edit" && editContact) {
    return (
      <div className={isEmbed ? "w-full px-4 py-6 sm:px-6" : "min-h-[calc(100vh-4rem)] w-full bg-muted/30 px-4 py-6 sm:px-6 lg:px-8"}>
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={handleCancelView} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />
            Voltar para a listagem
          </Button>
        </div>
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">Editar Cliente</h1>
          <p className="text-sm text-muted-foreground">Alteração da ficha cadastral de {editContact.name}.</p>
        </div>
        <EditClientView contact={editContact} onCancel={handleCancelView} />
      </div>
    );
  }

  // --- RENDERIZAR TELA DE LISTAGEM PADRÃO ---
  return (
    <div className={isEmbed ? "w-full px-4 py-6 sm:px-6" : "min-h-[calc(100vh-4rem)] w-full bg-muted/30"}>
      <div className={isEmbed ? "w-full" : "w-full px-4 py-6 sm:px-6 lg:px-8"}>
        {!isEmbed && (
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Painel</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/contacts">CRM</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Clientes</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        )}

        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-medium text-foreground">Clientes</h1>
          {!isEmbed && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSearchFocused(true)}
              aria-label="Filtrar"
            >
              <Filter className="h-4 w-4" />
              Filtrar
            </Button>
          </div>
          )}
        </div>

        <Card className="overflow-hidden border border-border bg-card shadow-sm rounded-lg">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4 border-b border-border/50 pb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Clientes</h2>
              <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary text-xs">
                {total}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!isEmbed && (
              <>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setImportOpen(true)}
                title="Importar lista de clientes (CSV)"
              >
                <Upload className="h-4 w-4" />
                Importar CSV
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
                <Download className="h-4 w-4" />
                Exportar CSV
              </Button>
              </>
              )}
              <Select value={clientStatusFilter} onValueChange={setClientStatusFilter}>
                <SelectTrigger className="h-8 w-[140px] bg-muted/50">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                  <SelectItem value="at_risk">Em risco</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                <SelectTrigger className="h-8 w-[140px] bg-muted/50">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isEmbed && (
              <Button size="sm" className="gap-1.5" onClick={() => setView("create")}>
                <Plus className="h-4 w-4" />
                Novo Cliente
              </Button>
              )}
            </div>
          </CardHeader>

          <div className="border-b border-border/50 px-6 py-3">
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchInputRef}
                placeholder="Buscar por nome, e-mail ou telefone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(0);
                }}
                onBlur={() => setSearchFocused(false)}
                className="h-9 bg-background pl-9"
              />
            </div>
          </div>

          <CardContent className="p-0">
            {error && (
              <p className="px-6 py-4 text-sm text-destructive">
                Erro ao carregar clientes: {error.message}
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                      Cliente
                    </th>
                    {!isEmbed && (
                    <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                      Empresa
                    </th>
                    )}
                    <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                      E-mail
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                      Telefone
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                      Status
                    </th>
                    <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                      Data de criação
                    </th>
                    <th className="relative px-4 py-3.5 text-right">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50 bg-card">
                  {isLoading &&
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        <td className="px-4 py-4" colSpan={isEmbed ? 6 : 7}>
                          <Skeleton className="h-12 w-full" />
                        </td>
                      </tr>
                    ))}

                  {!isLoading && paginatedContacts.length === 0 && (
                    <tr>
                      <td
                        colSpan={isEmbed ? 6 : 7}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        Nenhum cliente encontrado. Use &quot;Importar CSV&quot; ou &quot;Novo Cliente&quot; para adicionar.
                      </td>
                    </tr>
                  )}

                  {paginatedContacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-9 w-9 rounded-full">
                            {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt="" />}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                              {getInitials(contact.name)}
                            </AvatarFallback>
                          </Avatar>
                          {isEmbed ? (
                            <button
                              type="button"
                              onClick={() => navigate(profilePathFor(contact.id))}
                              className="font-medium text-foreground hover:text-primary hover:underline text-left"
                            >
                              {contact.name}
                            </button>
                          ) : (
                          <Link
                            to={profilePathFor(contact.id)}
                            className="font-medium text-foreground hover:text-primary hover:underline text-left"
                          >
                            {contact.name}
                          </Link>
                          )}
                        </div>
                      </td>
                      {!isEmbed && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {contact.tenants?.name ?? "—"}
                      </td>
                      )}
                      <td className="px-4 py-3">
                        {contact.email ? (
                          <a
                            href={`mailto:${contact.email}`}
                            className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline"
                          >
                            <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                            {contact.email}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {contact.phone ? (
                          <a
                            href={`https://wa.me/55${contact.phone.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-foreground hover:text-primary hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            {contact.phone}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const s = ((contact.metadata as Record<string, unknown> | null)?.client_status ?? "active") as string;
                          const cfg: Record<string, { label: string; className: string }> = {
                            active:   { label: "Ativo",    className: "bg-emerald-500/15 text-emerald-600 border-emerald-200" },
                            inactive: { label: "Inativo",  className: "bg-slate-500/15 text-slate-600 border-slate-200" },
                            at_risk:  { label: "Em risco", className: "bg-amber-500/15 text-amber-600 border-amber-200" },
                          };
                          const c = cfg[s] ?? cfg.active;
                          return <Badge className={`text-xs border ${c.className}`}>{c.label}</Badge>;
                        })()}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                        {formatCreatedAt(contact.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isEmbed && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                              onClick={() => void handleOpenMegaConversation(contact.id)}
                              disabled={openingConversationId === contact.id}
                              title="Abrir conversa no Mega"
                            >
                              <MessageSquare className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                            onClick={() =>
                              isEmbed
                                ? navigate(profilePathFor(contact.id))
                                : setSelectedContactForConversation(contact)
                            }
                            title={isEmbed ? "Ver perfil" : "Ver conversa"}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {!isEmbed && (
                          <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg bg-info/10 text-info hover:bg-info/20"
                            onClick={() => {
                              setEditContact(contact);
                              setView("edit");
                            }}
                            title="Editar"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20"
                            onClick={() => setDeleteContact(contact)}
                            title="Excluir"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-between gap-4 border-t border-border/50 py-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {from}–{to} de {total}
            </p>
            <nav className="flex items-center gap-1" aria-label="Paginação">
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = totalPages <= 5 ? i : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
                if (p >= totalPages) return null;
                return (
                  <Button
                    key={p}
                    variant={page === p ? "default" : "outline"}
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => setPage(p)}
                  >
                    {p + 1}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </nav>
          </CardFooter>
        </Card>
      </div>

      <ImportClientsDialog open={importOpen} onOpenChange={setImportOpen} />
      <DeleteContactDialog
        contact={deleteContact}
        open={!!deleteContact}
        onOpenChange={(o) => !o && setDeleteContact(null)}
      />
      <ContactConversationModal
        contact={selectedContactForConversation}
        open={!!selectedContactForConversation}
        onOpenChange={(o) => !o && setSelectedContactForConversation(null)}
      />
    </div>
  );
}
