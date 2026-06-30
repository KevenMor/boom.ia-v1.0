import { useEffect } from "react";
import { Link, useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ExternalLink,
  Trash2,
  CheckCircle,
  UserPlus,
  Bug,
  Mail,
  Phone,
} from "lucide-react";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  useContact,
  useUpdateContact,
  useContactConversationPreview,
  useContactInvoices,
  useUpdateContactInvoice,
  useDeleteContactInvoice,
  useContactSummary,
} from "@/hooks/useContacts";
import { ConversationMessagesView } from "@/components/chat/ConversationMessagesView";
import { CreateInvoiceDialog } from "@/components/contacts/CreateInvoiceDialog";
import { ContactSummaryCards } from "@/components/contacts/ContactSummaryCards";
import { ContactPackagesTab } from "@/components/contacts/ContactPackagesTab";
import { ContactAgendaTab } from "@/components/contacts/ContactAgendaTab";
import { ContactConsultationsTab } from "@/components/contacts/ContactConsultationsTab";
import { ContactDocumentsTab } from "@/components/contacts/ContactDocumentsTab";
import { ContactContractsTab } from "@/components/contacts/ContactContractsTab";
import {
  ProfileIdentityHeader,
  ProfileSectionTitle,
  ProfileSidebarPanel,
  ProfileTabNav,
} from "@/components/contacts/contact-profile-shell";
import { shouldShowChatMessage, dedupeAndSortConversationMessages } from "@/lib/chatMessageDisplay";
import { fetchAddressByCep } from "@/lib/viacep";
import { capitalizeName } from "@/lib/capitalizeName";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import type { Contact, ContactClientMetadata } from "@/types/database";
import { useEmbedCrm } from "@/contexts/EmbedCrmContext";

const editSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  email: z.union([z.string().email("E-mail inválido"), z.literal("")]).optional(),
  phone: z.string().optional(),
  cpf_cnpj: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip_code: z.string().optional(),
  notes: z.string().optional(),
  company_name: z.string().optional(),
  profession: z.string().optional(),
  birth_date: z.string().optional(),
  client_status: z.enum(["active", "inactive", "at_risk", ""]).optional(),
  complementary_info: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

const PROFILE_TABS = ["about", "edit", "history", "consultations", "invoices", "packages", "contracts", "documents", "agenda"] as const;
type ProfileTab = (typeof PROFILE_TABS)[number];

function isProfileTab(v: string | null): v is ProfileTab {
  return !!v && (PROFILE_TABS as readonly string[]).includes(v);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
}

function getClientStatusBadge(contact: Contact) {
  const meta = (contact.metadata ?? {}) as ContactClientMetadata;
  const status = meta.client_status;
  if (!status) return null;
  const labels: Record<string, string> = {
    active: "Ativo",
    inactive: "Inativo",
    at_risk: "Em risco",
  };
  const variants: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-600",
    inactive: "bg-muted text-muted-foreground",
    at_risk: "bg-amber-500/15 text-amber-600",
  };
  return (
    <Badge variant="secondary" className={variants[status] ?? ""}>
      {labels[status] ?? status}
    </Badge>
  );
}

function getLeadStatusBadge(contact: Contact) {
  const meta = (contact.metadata ?? {}) as Record<string, unknown>;
  const status = (meta.lead_status ?? meta.status ?? "") as string;
  if (!status) return null;
  const variants: Record<string, string> = {
    new: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    prospect: "bg-primary/10 text-primary",
    lead: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    qualified: "bg-success/10 text-success",
    closed: "bg-muted text-muted-foreground",
  };
  const key = status.toLowerCase().replace(/\s+/g, "_");
  const cls = variants[key] ?? "bg-muted text-muted-foreground";
  return <Badge variant="secondary" className={cls}>{status}</Badge>;
}

function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function ContactProfilePage() {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const embedCrm = useEmbedCrm();
  const isEmbed = Boolean(embedCrm?.isEmbed);
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const activeTab: ProfileTab = isProfileTab(tabFromUrl) ? tabFromUrl : "about";

  const handleProfileTabChange = (value: string) => {
    const next: ProfileTab = isProfileTab(value) ? value : "about";
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (next === "about") p.delete("tab");
        else p.set("tab", next);
        return p;
      },
      { replace: true }
    );
  };
  const { data: contact, isLoading, error } = useContact(contactId ?? null);
  const updateContact = useUpdateContact();

  const { data: convData, isLoading: convLoading } = useContactConversationPreview(contactId ?? null);
  const { data: invoices = [], isLoading: invoicesLoading } = useContactInvoices(contactId ?? null);
  const { data: summary } = useContactSummary(contactId ?? null);
  const updateInvoice = useUpdateContactInvoice(contactId ?? null);
  const deleteInvoice = useDeleteContactInvoice(contactId ?? null);
  const messages = convData?.messages ?? [];
  const chatwootUrl = convData?.chatwoot_url ?? null;
  const agentName = convData?.agent_name ?? null;

  const normalizedMessages = useMemo(() => dedupeAndSortConversationMessages(messages), [messages]);
  const visibleCount = useMemo(
    () => normalizedMessages.filter((m) => shouldShowChatMessage(m, false)).length,
    [normalizedMessages]
  );

  const [cepLoading, setCepLoading] = useState(false);
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [deleteInvoiceId, setDeleteInvoiceId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const hasDebugData = messages.some(
    (m) => !!(m.metadata?.debug as unknown[])?.length || !!m.metadata?.token_usage
  );
  const { register, handleSubmit, reset, formState: { errors }, setValue, watch } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
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
      company_name: "",
      profession: "",
      birth_date: "",
      client_status: "",
      complementary_info: "",
    },
  });
  const clientStatusValue = watch("client_status");

  useEffect(() => {
    if (contact) {
      const meta = (contact.metadata ?? {}) as ContactClientMetadata;
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
        company_name: meta.company_name || "",
        profession: meta.profession || "",
        birth_date: meta.birth_date || "",
        client_status: meta.client_status || "",
        complementary_info: meta.complementary_info || "",
      });
    }
  }, [contact, reset]);

  const onSubmit = async (data: EditFormData) => {
    if (!contactId) return;
    const prevMeta = (contact?.metadata ?? {}) as Record<string, unknown>;
    const metadata: ContactClientMetadata & Record<string, unknown> = {
      ...prevMeta,
      company_name: data.company_name?.trim() || undefined,
      profession: data.profession?.trim() || undefined,
      birth_date: data.birth_date?.trim() || undefined,
      client_status: data.client_status || undefined,
      complementary_info: data.complementary_info?.trim() || undefined,
    };
    Object.keys(metadata).forEach((k) => {
      if (metadata[k] === undefined) delete metadata[k];
    });
    try {
      await updateContact.mutateAsync({
        id: contactId,
        name: capitalizeName(data.name),
        email: data.email || null,
        phone: data.phone || null,
        cpf_cnpj: data.cpf_cnpj || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zip_code: data.zip_code || null,
        notes: data.notes || null,
        metadata,
      });
      toast.success("Contato atualizado!");
    } catch (err: unknown) {
      toast.error("Erro ao atualizar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  const isClientRoute = isEmbed || location.pathname.startsWith("/clients/");
  const isClient = contact?.contact_type === "client" || isEmbed;
  const listPath = isClient ? "/clients" : "/contacts";
  const listLabel = isClient ? "Clientes" : "Leads";

  // Rota /clients/:id é exclusiva para clientes — lead acessando redireciona (exceto embed)
  useEffect(() => {
    if (isEmbed) return;
    if (!isLoading && contact && isClientRoute && !isClient) {
      navigate(`/contacts/${contactId}`, { replace: true });
    }
  }, [isLoading, contact, isClientRoute, isClient, contactId, navigate, isEmbed]);

  if (!contactId) {
    if (!isEmbed) navigate(listPath);
    return null;
  }

  if (error || (!isLoading && !contact)) {
    return (
      <div className={`${isEmbed ? "min-h-[100dvh]" : "min-h-[calc(100vh-4rem)]"} w-full bg-muted/30 flex items-center justify-center`}>
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              {error ? `Erro: ${(error as Error).message}` : "Contato não encontrado."}
            </p>
            {!isEmbed && (
              <Button variant="outline" className="w-full mt-4" asChild>
                <Link to={isClientRoute ? "/clients" : "/contacts"}>
                  Voltar
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className={`ds-chatwoot font-cw ${isEmbed ? "min-h-[100dvh]" : "min-h-[calc(100vh-4rem)]"} w-full bg-[hsl(var(--cw-surface,0_0%_98%))] dark:bg-background`}>
      <div className={cn("w-full mx-auto space-y-5", isEmbed ? "max-w-none px-2 py-3 sm:px-3" : "max-w-[1200px] px-4 py-6 sm:px-6 lg:px-8")}>
        {!isEmbed && (
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Painel</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={listPath}>{listLabel}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{isLoading ? "…" : contact?.name ?? "Perfil"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        )}

        {/* Lead view — perfil completo só para clientes */}
        {!isClient && !isEmbed && contact && (
            <Card className="border border-border rounded-2xl overflow-hidden shadow-none max-w-2xl">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row gap-6 items-start">
                  <Avatar className="h-20 w-20 rounded-full border-2 border-background shrink-0">
                    {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt="" />}
                    <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                      {getInitials(contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold">{contact.name}</h2>
                    <p className="text-sm text-muted-foreground mt-0.5">{contact.tenants?.name ?? "—"}</p>
                    <div className="mt-3 space-y-1 text-sm">
                      {contact.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                          <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
                        </div>
                      )}
                      {contact.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                          <a href={`https://wa.me/55${contact.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{contact.phone}</a>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-dashed border-border">
                      <p className="text-sm text-muted-foreground">
                        Este contato é um <strong>lead</strong>. O perfil completo (foto, faturas, histórico) é exclusivo para clientes.
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Marque como cliente para acessar o cadastro completo na página Clientes.
                      </p>
                      <Button
                        className="mt-4 gap-2"
                        onClick={async () => {
                          try {
                            await updateContact.mutateAsync({ id: contact.id, contact_type: "client" });
                            toast.success("Contato promovido a cliente!");
                            navigate(`/clients/${contact.id}`, { replace: true });
                          } catch (err: unknown) {
                            toast.error("Erro: " + (err instanceof Error ? err.message : "erro desconhecido"));
                          }
                        }}
                        disabled={updateContact.isPending}
                      >
                        <UserPlus className="h-4 w-4" />
                        {updateContact.isPending ? "Promovendo..." : "Promover a cliente"}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
        )}

        {/* Summary cards — só para clientes */}
        {isClient && contact && (
          <>
            <ProfileIdentityHeader
              contact={contact}
              isLoading={isLoading}
              listPath={listPath}
              listLabel={listLabel}
              hideBackLink={isEmbed}
              getInitials={getInitials}
              onAvatarUploaded={async (url) => {
                await updateContact.mutateAsync({ id: contact.id, avatar_url: url });
              }}
            />
            <ContactSummaryCards summary={summary} />
          </>
        )}

        {/* Profile body — só para clientes */}
        {isClient && (
        <div className={cn("grid gap-5", isEmbed ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-[260px_1fr]")}>
          {contact && !isEmbed && (
            <ProfileSidebarPanel
              contact={contact}
              isLoading={isLoading}
              getInitials={getInitials}
              onAvatarUploaded={async (url) => {
                await updateContact.mutateAsync({ id: contact.id, avatar_url: url });
              }}
              stats={[
                { label: "Conversas", value: visibleCount },
                { label: "Faturas", value: invoices.length },
                { label: "Pacotes", value: summary?.active_packages ?? 0 },
                { label: "Agenda", value: summary?.upcoming_appointments ?? 0 },
              ]}
            />
          )}

          <Card className="border border-border rounded-2xl overflow-hidden shadow-none">
            <CardContent className="p-0 sm:p-0">
              <Tabs value={activeTab} onValueChange={handleProfileTabChange} className="w-full">
                <div className="px-4 sm:px-5 pt-4 border-b border-border overflow-x-auto">
                  <ProfileTabNav tabs={PROFILE_TABS} />
                </div>
                <div className="p-4 sm:p-6">
                  <TabsContent value="about" className="mt-0 focus-visible:outline-none">
                    <div className="space-y-6">
                      <div>
                        <ProfileSectionTitle>Dados cadastrais</ProfileSectionTitle>
                        {contact && getClientStatusBadge(contact) && (
                          <div className="mb-3">{getClientStatusBadge(contact)}</div>
                        )}
                        {(() => {
                          const meta = (contact?.metadata ?? {}) as ContactClientMetadata;
                          const hasExtra = meta.company_name || meta.profession || meta.birth_date || meta.complementary_info;
                          if (!hasExtra && !contact?.notes) {
                            return (
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                Nenhuma informação complementar cadastrada.
                              </p>
                            );
                          }
                          return (
                            <dl className="space-y-2 text-sm">
                              {meta.company_name && (
                                <div className="flex gap-2">
                                  <dt className="text-muted-foreground shrink-0">Empresa</dt>
                                  <dd className="text-foreground">{meta.company_name}</dd>
                                </div>
                              )}
                              {meta.profession && (
                                <div className="flex gap-2">
                                  <dt className="text-muted-foreground shrink-0">Profissão</dt>
                                  <dd className="text-foreground">{meta.profession}</dd>
                                </div>
                              )}
                              {meta.birth_date && (
                                <div className="flex gap-2">
                                  <dt className="text-muted-foreground shrink-0">Nascimento</dt>
                                  <dd className="text-foreground">{formatDate(meta.birth_date)}</dd>
                                </div>
                              )}
                              {meta.complementary_info && (
                                <dd className="text-muted-foreground leading-relaxed whitespace-pre-wrap pt-1">
                                  {meta.complementary_info}
                                </dd>
                              )}
                              {contact?.notes && (
                                <div className="pt-3 border-t border-border">
                                  <dt className="text-xs text-muted-foreground mb-1">Observações internas</dt>
                                  <dd className="text-sm text-foreground">{contact.notes}</dd>
                                </div>
                              )}
                            </dl>
                          );
                        })()}
                      </div>

                      <div>
                        <ProfileSectionTitle>Contato</ProfileSectionTitle>
                        <dl className="space-y-2 text-sm">
                          {contact?.email && (
                            <div>
                              <dt className="text-xs text-muted-foreground">E-mail</dt>
                              <dd>
                                <a href={`mailto:${contact.email}`} className="text-foreground hover:underline underline-offset-2">
                                  {contact.email}
                                </a>
                              </dd>
                            </div>
                          )}
                          {contact?.phone && (
                            <div>
                              <dt className="text-xs text-muted-foreground">Telefone</dt>
                              <dd>
                                <a
                                  href={`https://wa.me/55${contact.phone.replace(/\D/g, "")}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-foreground hover:underline underline-offset-2"
                                >
                                  {contact.phone}
                                </a>
                              </dd>
                            </div>
                          )}
                          {(contact?.address || contact?.city) && (
                            <div>
                              <dt className="text-xs text-muted-foreground">Endereço</dt>
                              <dd className="text-foreground">
                                {[contact?.address, contact?.city, contact?.state].filter(Boolean).join(", ") || "—"}
                              </dd>
                            </div>
                          )}
                          {contact?.cpf_cnpj && (
                            <div>
                              <dt className="text-xs text-muted-foreground">CPF / CNPJ</dt>
                              <dd className="font-mono text-xs">{contact.cpf_cnpj}</dd>
                            </div>
                          )}
                          {!contact?.email && !contact?.phone && !contact?.address && !contact?.city && !contact?.cpf_cnpj && (
                            <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
                          )}
                        </dl>
                      </div>

                      {contact && getLeadStatusBadge(contact) && (
                        <div>
                          <ProfileSectionTitle>Status</ProfileSectionTitle>
                          <div className="flex flex-wrap gap-2">{getLeadStatusBadge(contact)}</div>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="edit" className="mt-0 focus-visible:outline-none">
                    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                      <div>
                        <ProfileSectionTitle>Dados pessoais</ProfileSectionTitle>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="name">Nome *</Label>
                            <Input id="name" {...register("name")} className="h-9" />
                            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="cpf_cnpj">CPF/CNPJ</Label>
                            <Input id="cpf_cnpj" {...register("cpf_cnpj")} className="h-9" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <ProfileSectionTitle>Contato</ProfileSectionTitle>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="email">E-mail</Label>
                            <Input id="email" type="email" {...register("email")} className="h-9" />
                            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="phone">Telefone</Label>
                            <Input id="phone" {...register("phone")} className="h-9" />
                          </div>
                        </div>
                      </div>
                      <div>
                        <ProfileSectionTitle>Endereço</ProfileSectionTitle>
                        <div className="grid gap-3 sm:grid-cols-3">
                          <div className="space-y-2 sm:col-span-2">
                            <Label htmlFor="address">Logradouro</Label>
                            <Input id="address" {...register("address")} className="h-9" placeholder="Rua, número, complemento" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="zip_code">CEP</Label>
                            <Input
                              id="zip_code"
                              placeholder="01310-100"
                              disabled={cepLoading}
                              className="h-9"
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
                            {cepLoading && <p className="text-xs text-muted-foreground">Buscando...</p>}
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 mt-3">
                          <div className="space-y-2">
                            <Label htmlFor="city">Cidade</Label>
                            <Input id="city" {...register("city")} className="h-9" placeholder="São Paulo" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="state">Estado</Label>
                            <Input id="state" {...register("state")} maxLength={2} className="h-9" placeholder="SP" />
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-border">
                        <ProfileSectionTitle>Informações complementares</ProfileSectionTitle>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="company_name">Empresa</Label>
                            <Input id="company_name" {...register("company_name")} className="h-9" placeholder="Razão social ou nome fantasia" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="profession">Profissão / cargo</Label>
                            <Input id="profession" {...register("profession")} className="h-9" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="birth_date">Data de nascimento</Label>
                            <Input id="birth_date" type="date" {...register("birth_date")} className="h-9" />
                          </div>
                          {isClient && (
                            <div className="space-y-2">
                              <Label>Status do cliente</Label>
                              <Select
                                value={clientStatusValue || ""}
                                onValueChange={(v) => setValue("client_status", v as EditFormData["client_status"])}
                              >
                                <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="active">Ativo</SelectItem>
                                  <SelectItem value="inactive">Inativo</SelectItem>
                                  <SelectItem value="at_risk">Em risco</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2 mt-3">
                          <Label htmlFor="complementary_info">Informações adicionais</Label>
                          <Textarea
                            id="complementary_info"
                            {...register("complementary_info")}
                            rows={3}
                            className="resize-none"
                            placeholder="Preferências, histórico comercial, detalhes do relacionamento..."
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="notes">Observações internas</Label>
                        <Textarea id="notes" {...register("notes")} rows={3} className="resize-none" />
                      </div>
                      <div className="flex justify-end gap-2 pt-2 border-t border-border">
                        <Button type="button" variant="outline" size="sm" onClick={() => reset()}>
                          Cancelar
                        </Button>
                        <Button type="submit" size="sm" disabled={updateContact.isPending}>
                          {updateContact.isPending ? "Salvando..." : "Salvar"}
                        </Button>
                      </div>
                    </form>
                  </TabsContent>

                  <TabsContent value="history" className="mt-0 focus-visible:outline-none">
                    <div className="min-h-[280px]">
                      {convLoading && (
                        <div className="space-y-3">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      )}
                      {!convLoading && messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-border rounded-xl bg-muted/20">
                          <p className="text-sm font-medium text-foreground">Nenhuma conversa</p>
                          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                            Este contato ainda não possui histórico no Chat ao Vivo.
                          </p>
                          <Button variant="outline" size="sm" className="mt-4" asChild>
                            <Link to="/conversations">Abrir Chat ao Vivo</Link>
                          </Button>
                        </div>
                      )}
                      {!convLoading && messages.length > 0 && (
                        <>
                          <div className="flex justify-end mb-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn("h-8 w-8", showDebug ? "text-primary" : "text-muted-foreground")}
                              onClick={() => setShowDebug(!showDebug)}
                              title={showDebug ? "Ocultar debug" : "Mostrar debug"}
                            >
                              <Bug className="h-4 w-4" />
                            </Button>
                          </div>
                          {showDebug && !hasDebugData && (
                            <p className="text-xs text-muted-foreground text-center mb-2">
                              Debug ativado — nenhum dado de debug nas mensagens desta conversa.
                            </p>
                          )}
                          <div className="h-[calc(100vh-340px)] min-h-[280px] overflow-y-auto -mx-1 px-1">
                            <ConversationMessagesView
                              messages={messages}
                              isLoading={false}
                              contactAvatarUrl={contact?.avatar_url ?? null}
                              contactInitials={contact ? getInitials(contact.name) : "?"}
                              agentName={agentName}
                              agentAvatarUrl={convData?.agent_avatar_url ?? null}
                              showDebug={showDebug}
                            />
                          </div>
                          {chatwootUrl && (
                            <div className="shrink-0 pt-4 mt-4 border-t border-border">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={() => window.open(chatwootUrl!, "_blank")}
                              >
                                <ExternalLink className="h-4 w-4" />
                                Abrir no Chatwoot
                              </Button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="consultations" className="mt-0 focus-visible:outline-none">
                    {contact && (
                      <ContactConsultationsTab contactId={contact.id} tenantId={contact.tenant_id} />
                    )}
                  </TabsContent>

                  <TabsContent value="invoices" className="mt-0 focus-visible:outline-none">
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Faturas
                        </h3>
                        <Button size="sm" onClick={() => setInvoiceDialogOpen(true)}>
                          Nova fatura
                        </Button>
                      </div>
                      {invoices.length > 0 && (
                        <div className="flex flex-wrap gap-2 text-xs">
                          {(() => {
                            const paid = invoices.filter(i => i.status === "paid").reduce((s, i) => s + Number(i.amount), 0);
                            const pending = invoices.filter(i => i.status === "pending").reduce((s, i) => s + Number(i.amount), 0);
                            const overdue = invoices.filter(i => i.status === "overdue").reduce((s, i) => s + Number(i.amount), 0);
                            const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
                            return (
                              <>
                                <span className="rounded-full bg-success/10 text-success px-2.5 py-1">Pago: {fmt(paid)}</span>
                                {pending > 0 && <span className="rounded-full bg-primary/10 text-primary px-2.5 py-1">Pendente: {fmt(pending)}</span>}
                                {overdue > 0 && <span className="rounded-full bg-destructive/10 text-destructive px-2.5 py-1">Vencido: {fmt(overdue)}</span>}
                              </>
                            );
                          })()}
                        </div>
                      )}
                      {invoicesLoading && (
                        <div className="space-y-2">
                          <Skeleton className="h-14 w-full" />
                          <Skeleton className="h-14 w-full" />
                          <Skeleton className="h-14 w-full" />
                        </div>
                      )}
                      {!invoicesLoading && invoices.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-14 text-center border border-dashed border-border rounded-xl bg-muted/20">
                          <p className="text-sm font-medium text-foreground">Nenhuma fatura</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Registre cobranças e acompanhe pagamentos deste cliente.
                          </p>
                          <Button size="sm" className="mt-4" onClick={() => setInvoiceDialogOpen(true)}>
                            Nova fatura
                          </Button>
                        </div>
                      )}
                      {!invoicesLoading && invoices.length > 0 && (
                        <div className="space-y-2">
                          {invoices.map((inv) => (
                            <div
                              key={inv.id}
                              className={`flex items-center justify-between rounded-lg border p-3 ${inv.status === "overdue" ? "border-destructive/50 bg-destructive/5" : "border-border"}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-semibold">
                                    R$ {Number(inv.amount).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className={
                                      inv.status === "paid"
                                        ? "bg-success/10 text-success"
                                        : inv.status === "overdue"
                                          ? "bg-destructive/10 text-destructive"
                                          : inv.status === "cancelled"
                                            ? "bg-muted text-muted-foreground"
                                            : "bg-primary/10 text-primary"
                                    }
                                  >
                                    {inv.status === "paid"
                                      ? "Pago"
                                      : inv.status === "overdue"
                                        ? "Vencido"
                                        : inv.status === "cancelled"
                                          ? "Cancelado"
                                          : "Pendente"}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  Vencimento: {formatDate(inv.due_date)}
                                  {inv.status === "paid" && inv.paid_at && ` • Pago em ${formatDate(inv.paid_at)}`}
                                  {inv.description && ` • ${inv.description}`}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                {inv.status !== "paid" && inv.status !== "cancelled" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() =>
                                      updateInvoice.mutate({
                                        invoiceId: inv.id,
                                        status: "paid",
                                        paid_at: new Date().toISOString(),
                                      })
                                    }
                                    disabled={updateInvoice.isPending}
                                    title="Marcar como pago"
                                  >
                                    <CheckCircle className="h-4 w-4 text-success" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteInvoiceId(inv.id)}
                                  disabled={deleteInvoice.isPending}
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="packages" className="mt-0 focus-visible:outline-none">
                    {contactId && <ContactPackagesTab contactId={contactId} />}
                  </TabsContent>

                  <TabsContent value="contracts" className="mt-0 focus-visible:outline-none">
                    {contactId && <ContactContractsTab contactId={contactId} />}
                  </TabsContent>

                  <TabsContent value="documents" className="mt-0 focus-visible:outline-none">
                    {contactId && contact?.tenant_id && (
                      <ContactDocumentsTab contactId={contactId} tenantId={contact.tenant_id} />
                    )}
                  </TabsContent>

                  <TabsContent value="agenda" className="mt-0 focus-visible:outline-none">
                    {contactId && <ContactAgendaTab contactId={contactId} tenantId={contact?.tenant_id} />}
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>
        )}
      </div>

      <CreateInvoiceDialog
        contactId={contactId}
        open={invoiceDialogOpen}
        onOpenChange={setInvoiceDialogOpen}
      />

      <AlertDialog open={!!deleteInvoiceId} onOpenChange={() => setDeleteInvoiceId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fatura</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta fatura? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (deleteInvoiceId) {
                  await deleteInvoice.mutateAsync(deleteInvoiceId);
                  setDeleteInvoiceId(null);
                  toast.success("Fatura excluída");
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
