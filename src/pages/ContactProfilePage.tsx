import { useEffect } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Phone,
  MapPin,
  Building2,
  FileText,
  MessageSquare,
  Receipt,
  ExternalLink,
  ArrowLeft,
  Filter,
  Share2,
  Pencil,
  History,
  User,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ContactAvatarUpload } from "@/components/contacts/ContactAvatarUpload";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "@/hooks/useContacts";
import { ConversationMessagesView } from "@/components/chat/ConversationMessagesView";
import { CreateInvoiceDialog } from "@/components/contacts/CreateInvoiceDialog";
import { shouldShowChatMessage, dedupeAndSortConversationMessages } from "@/lib/chatMessageDisplay";
import { fetchAddressByCep } from "@/lib/viacep";
import { capitalizeName } from "@/lib/capitalizeName";
import { toast } from "sonner";
import { useMemo, useState } from "react";
import type { Contact } from "@/types/database";

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
});

type EditFormData = z.infer<typeof editSchema>;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "?";
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
  const { data: contact, isLoading, error } = useContact(contactId ?? null);
  const updateContact = useUpdateContact();

  const { data: convData, isLoading: convLoading } = useContactConversationPreview(contactId ?? null);
  const { data: invoices = [], isLoading: invoicesLoading } = useContactInvoices(contactId ?? null);
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
  const { register, handleSubmit, reset, formState: { errors }, setValue } = useForm<EditFormData>({
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

  const onSubmit = async (data: EditFormData) => {
    if (!contactId) return;
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
      });
      toast.success("Contato atualizado!");
    } catch (err: unknown) {
      toast.error("Erro ao atualizar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  const isClientRoute = location.pathname.startsWith("/clients/");
  const isClient = contact?.contact_type === "client";
  const listPath = isClient ? "/clients" : "/contacts";
  const listLabel = isClient ? "Clientes" : "Leads";

  // Rota /clients/:id é exclusiva para clientes — lead acessando redireciona
  useEffect(() => {
    if (!isLoading && contact && isClientRoute && !isClient) {
      navigate(`/contacts/${contactId}`, { replace: true });
    }
  }, [isLoading, contact, isClientRoute, isClient, contactId, navigate]);

  if (!contactId) {
    navigate(listPath);
    return null;
  }

  if (error || (!isLoading && !contact)) {
    return (
      <div className="min-h-[calc(100vh-4rem)] w-full bg-muted/30 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              {error ? `Erro: ${(error as Error).message}` : "Contato não encontrado."}
            </p>
            <Button variant="outline" className="w-full mt-4" asChild>
              <Link to={isClientRoute ? "/clients" : "/contacts"}>
                Voltar
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-muted/30">
      <div className="w-full max-w-[1400px] mx-auto px-4 py-6 sm:px-6 lg:px-8">
        {/* Breadcrumb & Header — fixo ao rolar */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 pb-4 pt-2 -mt-2 bg-muted/30 backdrop-blur-sm"
        >
          <div>
            <Breadcrumb className="mb-1">
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
                  <BreadcrumbLink asChild>
                    <Link to={listPath}>{listLabel}</Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>
                    {isLoading ? "..." : contact?.name ?? "Perfil"}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <h1 className="text-lg font-semibold text-foreground">
              {isLoading ? <Skeleton className="h-6 w-48" /> : contact?.name ?? "Perfil"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-4 w-4" />
              Filtrar
            </Button>
            <Button size="sm" className="gap-1.5">
              <Share2 className="h-4 w-4" />
              Compartilhar
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to={listPath} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" />
                Voltar para {listLabel}
              </Link>
            </Button>
          </div>
        </motion.div>

        {/* Banner */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 }}
          className="h-[180px] sm:h-[210px] rounded-t-lg overflow-hidden bg-gradient-to-br from-primary/90 via-primary-tint1/55 to-primary-tint2/40"
        >
          <img
            src="https://preview.sprukomarket.com/html/tailwind/xintra/dist/assets/images/media/media-3.jpg"
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </motion.div>

        {/* Lead view — perfil completo só para clientes */}
        {!isClient && contact && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="-mt-2 relative z-10"
          >
            <Card className="border border-border rounded-lg overflow-hidden shadow-sm max-w-2xl">
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
          </motion.div>
        )}

        {/* Profile body — só para clientes */}
        {isClient && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5 -mt-2 relative z-10"
        >
          {/* Sidebar */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
          <Card className="border border-border rounded-lg overflow-hidden shadow-sm h-fit">
            <CardContent className="p-0">
              {/* Avatar section */}
              <div className="p-5 pb-4 text-center border-b border-dashed border-border">
                <div className="relative inline-flex mb-3">
                  {isLoading ? (
                    <Skeleton className="h-[72px] w-[72px] rounded-full" />
                  ) : contact ? (
                    <div className="relative">
                      <ContactAvatarUpload
                        contactId={contact.id}
                        currentUrl={contact.avatar_url}
                        onUploaded={async (url) => {
                          await updateContact.mutateAsync({ id: contact.id, avatar_url: url });
                        }}
                        size="lg"
                        className="h-[72px] w-[72px]"
                      />
                      <span className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full bg-success border-2 border-background" />
                    </div>
                  ) : (
                    <Avatar className="h-[72px] w-[72px] rounded-full border-2 border-background shadow-md">
                      <AvatarFallback className="bg-primary text-primary-foreground text-xl font-semibold">?</AvatarFallback>
                    </Avatar>
                  )}
                </div>
                {!isLoading && contact && (
                  <>
                    <p className="font-semibold text-foreground">{contact.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {contact.tenants?.name ?? "—"}
                    </p>
                    <div className="flex justify-center gap-3 mt-2 text-xs text-muted-foreground">
                      {contact.city && (
                        <span className="flex items-center gap-1">
                          <Building2 className="h-3.5 w-3.5" />
                          {contact.city}
                        </span>
                      )}
                      {contact.state && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {contact.state}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-0 border-b border-dashed border-border p-3">
                <div className="flex flex-col items-center gap-1 p-2 rounded-md border border-dashed border-border mx-1">
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <MessageSquare className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-semibold">{visibleCount}</span>
                  <span className="text-[10px] text-muted-foreground">Conversas</span>
                </div>
                <div className="flex flex-col items-center gap-1 p-2 rounded-md border border-dashed border-border mx-1">
                  <div className="w-7 h-7 rounded-full bg-secondary flex items-center justify-center text-secondary-foreground">
                    <Receipt className="h-3.5 w-3.5" />
                  </div>
                  <span className="text-sm font-semibold">{invoices.length}</span>
                  <span className="text-[10px] text-muted-foreground">Faturas</span>
                </div>
              </div>

              {/* Basic info */}
              <div className="p-3">
                <p className="text-xs font-medium text-primary-tint1 mb-2">Info básica</p>
                <div className="space-y-1 text-sm border-b border-dashed border-border pb-3">
                  {isLoading ? (
                    <Skeleton className="h-4 w-full" />
                  ) : (
                    contact && (
                      <>
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">Nome</span>
                          <span className="font-medium truncate max-w-[140px]">{contact.name}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">E-mail</span>
                          <span className="truncate max-w-[140px]">{contact.email ?? "—"}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">Telefone</span>
                          <span className="truncate max-w-[140px]">{contact.phone ?? "—"}</span>
                        </div>
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground">Criado em</span>
                          <span>{formatDate(contact.created_at)}</span>
                        </div>
                      </>
                    )
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          </motion.div>

          {/* Main content */}
          <Card className="border border-border rounded-lg overflow-hidden shadow-sm">
            <CardContent className="p-4 sm:p-5">
              <Tabs defaultValue="about" className="w-full">
                <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1.5 bg-muted/50 rounded-lg">
                  <TabsTrigger value="about" className="text-sm gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md px-4 py-2 transition-all duration-200">
                    <User className="h-4 w-4" />
                    Sobre
                  </TabsTrigger>
                  <TabsTrigger value="edit" className="text-sm gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md px-4 py-2 transition-all duration-200">
                    <Pencil className="h-4 w-4" />
                    Editar
                  </TabsTrigger>
                  <TabsTrigger value="history" className="text-sm gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md px-4 py-2 transition-all duration-200">
                    <History className="h-4 w-4" />
                    Histórico
                  </TabsTrigger>
                  <TabsTrigger value="invoices" className="text-sm gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm rounded-md px-4 py-2 transition-all duration-200">
                    <Receipt className="h-4 w-4" />
                    Faturas
                  </TabsTrigger>
                </TabsList>

                <AnimatePresence mode="wait">
                  <TabsContent value="about" className="mt-4">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-5"
                    >
                      {/* About info */}
                      <div>
                        <h3 className="text-sm font-semibold flex items-center gap-2 mb-2">
                          <FileText className="h-4 w-4 text-primary" />
                          Dados cadastrais
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {contact?.notes || "Nenhuma observação cadastrada."}
                        </p>
                      </div>

                      {/* Contact info */}
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Contato</h3>
                        <div className="space-y-2">
                          {contact?.email && (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center text-primary">
                                <Mail className="h-3.5 w-3.5" />
                              </div>
                              <span className="font-medium">E-mail:</span>
                              <a href={`mailto:${contact.email}`} className="text-primary hover:underline truncate">
                                {contact.email}
                              </a>
                            </div>
                          )}
                          {contact?.phone && (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-6 h-6 rounded-md bg-primary-tint1/10 flex items-center justify-center text-primary-tint1">
                                <Phone className="h-3.5 w-3.5" />
                              </div>
                              <span className="font-medium">Telefone:</span>
                              <a
                                href={`https://wa.me/55${contact.phone.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                              >
                                {contact.phone}
                              </a>
                            </div>
                          )}
                          {(contact?.address || contact?.city) && (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-6 h-6 rounded-md bg-primary-tint2/10 flex items-center justify-center text-primary-tint2">
                                <MapPin className="h-3.5 w-3.5" />
                              </div>
                              <span className="font-medium">Endereço:</span>
                              <span className="text-muted-foreground">
                                {[contact?.address, contact?.city, contact?.state].filter(Boolean).join(", ") || "—"}
                              </span>
                            </div>
                          )}
                          {contact?.cpf_cnpj && (
                            <div className="flex items-center gap-3 text-sm">
                              <div className="w-6 h-6 rounded-md bg-primary-tint3/10 flex items-center justify-center text-primary-tint3">
                                <FileText className="h-3.5 w-3.5" />
                              </div>
                              <span className="font-medium">CPF/CNPJ:</span>
                              <span>{contact.cpf_cnpj}</span>
                            </div>
                          )}
                          {!contact?.email && !contact?.phone && !contact?.address && !contact?.city && !contact?.cpf_cnpj && (
                            <p className="text-sm text-muted-foreground">Nenhum contato cadastrado.</p>
                          )}
                        </div>
                      </div>

                      {/* Tags / Status */}
                      {contact && getLeadStatusBadge(contact) && (
                        <div>
                          <h3 className="text-sm font-semibold mb-2">Status</h3>
                          <div className="flex flex-wrap gap-2">
                            {getLeadStatusBadge(contact)}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="edit" className="mt-4">
                    <motion.form
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      onSubmit={handleSubmit(onSubmit)}
                      className="space-y-5"
                    >
                      <div>
                        <h3 className="text-sm font-semibold mb-3">Dados pessoais</h3>
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
                        <h3 className="text-sm font-semibold mb-3">Contato</h3>
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
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="address">Endereço</Label>
                          <Input id="address" {...register("address")} className="h-9 mt-2" placeholder="Rua, número, complemento" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="zip_code">CEP</Label>
                          <Input
                            id="zip_code"
                            placeholder="01310-100"
                            disabled={cepLoading}
                            className="h-9 mt-2"
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
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="city">Cidade</Label>
                          <Input id="city" {...register("city")} className="h-9" placeholder="São Paulo" />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="state">Estado</Label>
                          <Input id="state" {...register("state")} maxLength={2} className="h-9" placeholder="SP" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="notes">Observações</Label>
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
                    </motion.form>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="min-h-[280px]"
                    >
                      {convLoading && (
                        <div className="space-y-3">
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                          <Skeleton className="h-16 w-full" />
                        </div>
                      )}
                      {!convLoading && messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                            <MessageSquare className="h-7 w-7 text-muted-foreground/50" />
                          </div>
                          <p className="text-sm font-medium text-muted-foreground">Nenhuma conversa encontrada</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Este contato ainda não possui conversas no Chat ao Vivo.
                          </p>
                          <Button variant="outline" size="sm" className="mt-4" asChild>
                            <Link to="/conversations">Ir para Chat ao Vivo</Link>
                          </Button>
                        </div>
                      )}
                      {!convLoading && messages.length > 0 && (
                        <>
                          <div className="h-[calc(100vh-340px)] min-h-[280px] overflow-y-auto -mx-1 px-1">
                            <ConversationMessagesView
                              messages={messages}
                              isLoading={false}
                              contactAvatarUrl={contact?.avatar_url ?? null}
                              contactInitials={contact ? getInitials(contact.name) : "?"}
                              agentName={agentName}
                              agentAvatarUrl={convData?.agent_avatar_url ?? null}
                              showDebug={false}
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
                    </motion.div>
                  </TabsContent>

                  <TabsContent value="invoices" className="mt-4">
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold">Faturas</h3>
                        <Button size="sm" className="gap-1.5" onClick={() => setInvoiceDialogOpen(true)}>
                          <Plus className="h-4 w-4" />
                          Nova fatura
                        </Button>
                      </div>
                      {invoicesLoading && (
                        <div className="space-y-2">
                          <Skeleton className="h-14 w-full" />
                          <Skeleton className="h-14 w-full" />
                          <Skeleton className="h-14 w-full" />
                        </div>
                      )}
                      {!invoicesLoading && invoices.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                          <div className="h-14 w-14 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                            <Receipt className="h-7 w-7 text-muted-foreground/50" />
                          </div>
                          <p className="text-sm font-medium text-muted-foreground">Nenhuma fatura cadastrada</p>
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Clique em &quot;Nova fatura&quot; para adicionar.
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
                              className="flex items-center justify-between rounded-lg border border-border p-3"
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
                    </motion.div>
                  </TabsContent>
                </AnimatePresence>
              </Tabs>
            </CardContent>
          </Card>
        </motion.div>
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
