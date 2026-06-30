import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ContactAvatarUpload } from "@/components/contacts/ContactAvatarUpload";
import { Skeleton } from "@/components/ui/skeleton";
import type { Contact, ContactClientMetadata } from "@/types/database";

export const PROFILE_TAB_LABELS: Record<string, string> = {
  about: "Visão geral",
  edit: "Cadastro",
  history: "Conversas",
  consultations: "Consultas",
  invoices: "Faturas",
  packages: "Pacotes",
  contracts: "Contratos",
  documents: "Arquivos",
  agenda: "Agenda",
};

const CLIENT_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "Cliente ativo", className: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800" },
  inactive: { label: "Inativo", className: "border-border bg-muted/50 text-muted-foreground" },
  at_risk: { label: "Em risco", className: "border-amber-200 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800" },
};

function formatShortDate(iso: string | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export function ProfileTabNav({ tabs }: { tabs: readonly string[] }) {
  return (
    <TabsList className="h-auto w-full justify-start gap-0 rounded-none border-b border-border bg-transparent p-0 flex-wrap">
      {tabs.map((tab) => (
        <TabsTrigger
          key={tab}
          value={tab}
          className={cn(
            "relative rounded-none border-0 border-b-2 border-transparent bg-transparent px-4 py-2.5",
            "text-sm font-medium text-muted-foreground shadow-none",
            "data-[state=active]:border-primary data-[state=active]:bg-transparent",
            "data-[state=active]:text-foreground data-[state=active]:shadow-none",
            "hover:text-foreground transition-colors"
          )}
        >
          {PROFILE_TAB_LABELS[tab] ?? tab}
        </TabsTrigger>
      ))}
    </TabsList>
  );
}

interface IdentityHeaderProps {
  contact: Contact | undefined;
  isLoading: boolean;
  listPath: string;
  listLabel: string;
  hideBackLink?: boolean;
  onAvatarUploaded: (url: string | null) => Promise<void>;
  getInitials: (name: string) => string;
}

export function ProfileIdentityHeader({
  contact,
  isLoading,
  listPath,
  listLabel,
  hideBackLink,
  onAvatarUploaded,
  getInitials,
}: IdentityHeaderProps) {
  const meta = (contact?.metadata ?? {}) as ContactClientMetadata;
  const statusCfg = meta.client_status ? CLIENT_STATUS[meta.client_status] : null;
  const subtitle = meta.company_name?.trim() || contact?.tenants?.name || null;
  const location = [contact?.city, contact?.state].filter(Boolean).join(" · ");

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="h-1.5 bg-gradient-to-r from-primary/80 via-primary/40 to-transparent" aria-hidden />
      <div className="px-5 py-5 sm:px-6 sm:py-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex items-center gap-4 min-w-0 flex-1">
          {isLoading ? (
            <Skeleton className="h-16 w-16 rounded-full shrink-0" />
          ) : contact ? (
            <ContactAvatarUpload
              contactId={contact.id}
              currentUrl={contact.avatar_url}
              onUploaded={onAvatarUploaded}
              size="lg"
              className="h-16 w-16 shrink-0 ring-2 ring-background shadow-sm"
            />
          ) : null}
          <div className="min-w-0">
            {isLoading ? (
              <>
                <Skeleton className="h-6 w-48 mb-2" />
                <Skeleton className="h-4 w-32" />
              </>
            ) : contact ? (
              <>
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">
                    {contact.name}
                  </h1>
                  {statusCfg && (
                    <Badge variant="outline" className={cn("text-[11px] font-normal", statusCfg.className)}>
                      {statusCfg.label}
                    </Badge>
                  )}
                </div>
                {subtitle && (
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">{subtitle}</p>
                )}
                <p className="text-xs text-muted-foreground/80 mt-1">
                  {[location, contact.created_at ? `desde ${formatShortDate(contact.created_at)}` : null]
                    .filter(Boolean)
                    .join(" · ") || "Sem localização cadastrada"}
                </p>
              </>
            ) : null}
          </div>
        </div>
        {!hideBackLink && (
        <Button variant="outline" size="sm" className="shrink-0 self-start sm:self-center" asChild>
          <Link to={listPath}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5 opacity-70" />
            {listLabel}
          </Link>
        </Button>
        )}
      </div>
    </div>
  );
}

interface SidebarStat {
  label: string;
  value: string | number;
}

export function ProfileSidebarPanel({
  contact,
  stats,
}: {
  contact: Contact;
  isLoading?: boolean;
  stats: SidebarStat[];
  getInitials?: (name: string) => string;
  onAvatarUploaded?: (url: string | null) => Promise<void>;
}) {
  const meta = (contact.metadata ?? {}) as ContactClientMetadata;

  return (
    <aside className="rounded-2xl border border-border bg-card h-fit overflow-hidden">
      <div className="px-4 py-4 border-b border-border/80">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">
          Contato rápido
        </p>
        <dl className="space-y-2.5 text-sm">
          {contact.email ? (
            <div>
              <dt className="text-xs text-muted-foreground">E-mail</dt>
              <dd className="truncate">
                <a href={`mailto:${contact.email}`} className="text-foreground hover:underline underline-offset-2">
                  {contact.email}
                </a>
              </dd>
            </div>
          ) : null}
          {contact.phone ? (
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
          ) : null}
          {contact.cpf_cnpj ? (
            <div>
              <dt className="text-xs text-muted-foreground">CPF / CNPJ</dt>
              <dd className="font-mono text-xs">{contact.cpf_cnpj}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="px-4 py-3 border-b border-border/80">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-2">
          Resumo
        </p>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-[11px] text-muted-foreground">{s.label}</dt>
              <dd className="text-base font-semibold tabular-nums text-foreground">{s.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {(meta.profession || contact.address) && (
        <div className="px-4 py-3 text-sm text-muted-foreground space-y-1">
          {meta.profession && <p>{meta.profession}</p>}
          {contact.address && (
            <p className="text-xs leading-relaxed">
              {[contact.address, contact.city, contact.state].filter(Boolean).join(", ")}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}

/** Título de seção do formulário — sem ícone decorativo */
export function ProfileSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
      {children}
    </h3>
  );
}
