import type { LucideIcon } from "lucide-react";
import {
  Bell,
  BedDouble,
  Building2,
  CalendarCheck,
  CalendarDays,
  Car,
  Database,
  DollarSign,
  Globe,
  Images,
  MapPin,
  MessageSquare,
  Search,
  Server,
  UserCheck,
  Wrench,
} from "lucide-react";

export interface ToolTypeMeta {
  label: string;
  icon: LucideIcon;
  iconClass: string;
  bgClass: string;
}

/** Metadados visuais por tool_type (ícone + rótulo legível + cores). */
export const TOOL_TYPE_META: Record<string, ToolTypeMeta> = {
  sql_query: {
    label: "Consulta SQL",
    icon: Database,
    iconClass: "text-sky-600 dark:text-sky-400",
    bgClass: "bg-sky-500/10 ring-1 ring-sky-500/15",
  },
  web_scraper: {
    label: "Web Scraper",
    icon: Globe,
    iconClass: "text-violet-600 dark:text-violet-400",
    bgClass: "bg-violet-500/10 ring-1 ring-violet-500/15",
  },
  api_rest: {
    label: "API REST",
    icon: Server,
    iconClass: "text-slate-600 dark:text-slate-400",
    bgClass: "bg-slate-500/10 ring-1 ring-slate-500/15",
  },
  rag_search: {
    label: "Busca RAG",
    icon: MessageSquare,
    iconClass: "text-indigo-600 dark:text-indigo-400",
    bgClass: "bg-indigo-500/10 ring-1 ring-indigo-500/15",
  },
  inventory_query: {
    label: "Consulta de estoque",
    icon: Car,
    iconClass: "text-amber-600 dark:text-amber-400",
    bgClass: "bg-amber-500/10 ring-1 ring-amber-500/15",
  },
  nearest_unit: {
    label: "Unidade mais próxima",
    icon: MapPin,
    iconClass: "text-orange-600 dark:text-orange-400",
    bgClass: "bg-orange-500/10 ring-1 ring-orange-500/15",
  },
  fipe_query: {
    label: "Tabela FIPE",
    icon: DollarSign,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10 ring-1 ring-emerald-500/15",
  },
  calendar_query: {
    label: "Agenda",
    icon: CalendarDays,
    iconClass: "text-cyan-600 dark:text-cyan-400",
    bgClass: "bg-cyan-500/10 ring-1 ring-cyan-500/15",
  },
  chatwoot_assign: {
    label: "Atribuir no Chatwoot",
    icon: UserCheck,
    iconClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-500/10 ring-1 ring-blue-500/15",
  },
  send_notification: {
    label: "Notificação",
    icon: Bell,
    iconClass: "text-rose-600 dark:text-rose-400",
    bgClass: "bg-rose-500/10 ring-1 ring-rose-500/15",
  },
  omnibees_availability: {
    label: "Omnibees (hotel)",
    icon: Building2,
    iconClass: "text-teal-600 dark:text-teal-400",
    bgClass: "bg-teal-500/10 ring-1 ring-teal-500/15",
  },
  artaxnet_availability: {
    label: "Artaxnet (disponibilidade)",
    icon: CalendarCheck,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-500/10 ring-1 ring-emerald-500/15",
  },
  suite_gallery_query: {
    label: "Galeria de suítes",
    icon: Images,
    iconClass: "text-fuchsia-600 dark:text-fuchsia-400",
    bgClass: "bg-fuchsia-500/10 ring-1 ring-fuchsia-500/15",
  },
  lodging_consulta: {
    label: "Hospedagem interna",
    icon: BedDouble,
    iconClass: "text-primary",
    bgClass: "bg-primary/10 ring-1 ring-primary/15",
  },
  park_consulta: {
    label: "Calendário do parque",
    icon: CalendarCheck,
    iconClass: "text-sky-600 dark:text-sky-400",
    bgClass: "bg-sky-500/10 ring-1 ring-sky-500/15",
  },
};

const FALLBACK_META: ToolTypeMeta = {
  label: "Ferramenta",
  icon: Wrench,
  iconClass: "text-muted-foreground",
  bgClass: "bg-muted ring-1 ring-border",
};

export function getToolTypeMeta(toolType: string | null | undefined): ToolTypeMeta {
  if (!toolType) return FALLBACK_META;
  return TOOL_TYPE_META[toolType] ?? FALLBACK_META;
}

/** Título legível no card (humano, não o slug técnico). */
export function toolCardTitle(tool: { name: string; tool_type?: string | null }): string {
  const meta = getToolTypeMeta(tool.tool_type);
  const n = tool.name.toLowerCase();

  if (tool.tool_type === "artaxnet_availability") {
    if (n.includes("flores")) return "Disponibilidade · Flores do Lázaro";
    return "Disponibilidade · Artaxnet";
  }
  if (tool.tool_type === "omnibees_availability") {
    if (n.includes("vale") || n.includes("suico")) return "Disponibilidade · Vale Suíço";
    return "Disponibilidade · Omnibees";
  }
  if (tool.tool_type === "lodging_consulta" && n.includes("sunset")) {
    return "Hospedagem · Sunset Thermas";
  }
  if (tool.tool_type === "park_consulta" && n.includes("sunset")) {
    return "Parque · Sunset Thermas";
  }

  const slug = tool.name.replace(/^consultar_/, "").replace(/_/g, " ");
  if (slug.length <= 28) {
    return slug.replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return meta.label;
}

/** Chip curto do tipo (evita repetir o título inteiro no badge). */
export function toolTypeBadgeLabel(toolType: string | null | undefined): string {
  if (!toolType) return "Tool";
  const short: Record<string, string> = {
    artaxnet_availability: "Artaxnet",
    omnibees_availability: "Omnibees",
    lodging_consulta: "Hospedagem",
    park_consulta: "Parque",
    suite_gallery_query: "Galeria",
    inventory_query: "Estoque",
    fipe_query: "FIPE",
    rag_search: "RAG",
  };
  return short[toolType] ?? getToolTypeMeta(toolType).label;
}
