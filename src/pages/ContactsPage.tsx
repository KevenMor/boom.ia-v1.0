import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Mail,
  Phone,
  RefreshCw,
  Eye,
  Filter,
  ChevronLeft,
  ChevronRight,
  Download,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useContacts, useSyncContactsFromConversations } from "@/hooks/useContacts";
import { useTenantContext } from "@/contexts/TenantContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateContactDialog } from "@/components/contacts/CreateContactDialog";
import { EditContactDialog } from "@/components/contacts/EditContactDialog";
import { DeleteContactDialog } from "@/components/contacts/DeleteContactDialog";
import { ContactConversationModal } from "@/components/contacts/ContactConversationModal";
import { callAPI } from "@/lib/api-client";
import { exportContactsCsv } from "@/lib/exportCsv";
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

export default function ContactsPage() {
  const { selectedTenantId } = useTenantContext();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<(typeof SORT_OPTIONS)[number]["value"]>("recent");
  const [createOpen, setCreateOpen] = useState(false);
  const [editContact, setEditContact] = useState<Contact | null>(null);
  const [deleteContact, setDeleteContact] = useState<Contact | null>(null);
  const [selectedContactForConversation, setSelectedContactForConversation] = useState<Contact | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchFocused) searchInputRef.current?.focus();
  }, [searchFocused]);

  const tenantId = selectedTenantId ?? undefined;
  const order = sortToApi(sort);
  const { data, isLoading, error } = useContacts({
    tenant_id: tenantId,
    search: search.trim() || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    order_by: order.order_by,
    order_dir: order.order_dir,
    type: "lead",
  });

  const paginatedContacts = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, total);

  const syncMutation = useSyncContactsFromConversations();

  const handleSyncFromConversations = async () => {
    try {
      const res = await syncMutation.mutateAsync(selectedTenantId ?? undefined);
      toast.success(`Sincronizado: ${res.synced} contato(s) do Chat ao Vivo`);
    } catch (err: unknown) {
      toast.error("Erro ao sincronizar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (tenantId) params.set("tenant_id", tenantId);
      params.set("type", "lead");
      params.set("limit", "500");
      params.set("offset", "0");
      if (search.trim()) params.set("search", search.trim());
      const res = await callAPI<{ data: Contact[] }>(`/crm-contacts?${params.toString()}`, { method: "GET" });
      const list = res?.data ?? [];
      if (list.length === 0) {
        toast.info("Nenhum contato para exportar");
        return;
      }
      exportContactsCsv(list);
      toast.success("CSV exportado");
    } catch (err: unknown) {
      toast.error("Erro ao exportar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] w-full bg-muted/30">
      <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
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
              <BreadcrumbPage>Leads</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Page header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end">
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
        </div>

        {/* Card */}
        <Card className="overflow-hidden border-border bg-card shadow-sm">
          <CardHeader className="flex flex-col gap-3 border-b border-border/50 pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">Leads</h2>
              <Badge variant="secondary" className="rounded-full bg-primary/10 text-primary text-xs">
                {total}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isMobile ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <MoreVertical className="h-4 w-4" />
                      Ações
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleSyncFromConversations} disabled={syncMutation.isPending}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Importar do Chat
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportCsv}>
                      <Download className="mr-2 h-4 w-4" />
                      Exportar CSV
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={handleSyncFromConversations}
                    disabled={syncMutation.isPending}
                    title="Importar contatos das conversas do Chat ao Vivo"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                    Importar do Chat
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleExportCsv}>
                    <Download className="h-4 w-4" />
                    Exportar CSV
                  </Button>
                </>
              )}
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
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Criar Lead</span>
              </Button>
            </div>
          </CardHeader>

          {/* Search */}
          <div className="border-b border-border/50 px-4 py-3 sm:px-6">
            <div className="relative w-full sm:max-w-xs">
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
                Erro ao carregar contatos: {error.message}
              </p>
            )}

            {/* Mobile: card list */}
            {isMobile ? (
              <div className="divide-y divide-border/50">
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="px-4 py-4">
                      <Skeleton className="h-14 w-full" />
                    </div>
                  ))}

                {!isLoading && paginatedContacts.length === 0 && (
                  <p className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Nenhum contato encontrado.
                  </p>
                )}

                {paginatedContacts.map((contact) => (
                  <Link
                    key={contact.id}
                    to={`/contacts/${contact.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-muted/50"
                  >
                    <Avatar className="h-10 w-10 shrink-0 rounded-full">
                      {contact.avatar_url && <AvatarImage src={contact.avatar_url} alt="" />}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                        {getInitials(contact.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {contact.name}
                        </span>
                        {getLeadStatusBadge(contact)}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {contact.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                            <Phone className="h-3 w-3 shrink-0" />
                            {contact.phone}
                          </span>
                        )}
                        {contact.email && !contact.phone && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground truncate">
                            <Mail className="h-3 w-3 shrink-0" />
                            {contact.email}
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground/60">
                          {formatCreatedAt(contact.created_at)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                  </Link>
                ))}
              </div>
            ) : (
              /* Desktop: table */
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                        Contato
                      </th>
                      <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                        Empresa
                      </th>
                      <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                        E-mail
                      </th>
                      <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                        Status
                      </th>
                      <th className="px-4 py-3.5 text-left text-sm font-medium text-muted-foreground">
                        Telefone
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
                          <td className="px-4 py-4" colSpan={7}>
                            <Skeleton className="h-12 w-full" />
                          </td>
                        </tr>
                      ))}

                    {!isLoading && paginatedContacts.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-4 py-12 text-center text-sm text-muted-foreground"
                        >
                          Nenhum contato encontrado. Use &quot;Criar Lead&quot; para adicionar.
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
                            <Link
                              to={`/contacts/${contact.id}`}
                              className="font-medium text-foreground hover:text-primary hover:underline text-left"
                            >
                              {contact.name}
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {contact.tenants?.name ?? "—"}
                        </td>
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
                          {getLeadStatusBadge(contact) ?? (
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
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {formatCreatedAt(contact.created_at)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg bg-primary/10 text-primary hover:bg-primary/20"
                              onClick={() => setSelectedContactForConversation(contact)}
                              title="Ver conversa"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-lg bg-info/10 text-info hover:bg-info/20"
                              onClick={() => setEditContact(contact)}
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
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-border/50 px-4 py-3 sm:gap-4 sm:py-4">
            <p className="text-xs text-muted-foreground sm:text-sm">
              {from}–{to} de {total}
            </p>
            <nav className="flex items-center gap-1" aria-label="Paginação">
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0 sm:h-8 sm:w-8"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {!isMobile && Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
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
              {isMobile && (
                <span className="px-2 text-xs text-muted-foreground">
                  {page + 1}/{totalPages}
                </span>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-9 p-0 sm:h-8 sm:w-8"
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

      <CreateContactDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditContactDialog
        contact={editContact}
        open={!!editContact}
        onOpenChange={(o) => !o && setEditContact(null)}
      />
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
