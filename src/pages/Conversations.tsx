import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  MessageSquare,
  Bot,
  ArrowLeft,
  Search,
  Send,
  Paperclip,
  Smile,
  Bug,
  Trash2,
  Users,
  UserPlus,
  Tag,
  MoreVertical,
  Building2,
  Phone,
  MapPin,
  Ban,
  List,
  Headphones,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  PanelRight,
  ChevronsLeft,
  ChevronsRight,
  Loader2,
} from "lucide-react";
import { ConversationMessagesView } from "@/components/chat/ConversationMessagesView";
import { callAPI } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useAgents } from "@/hooks/useAgents";
import { useTenants } from "@/hooks/useTenants";
import { useTenantContext } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { useConversations, useMultiConversationMessages } from "@/hooks/useConversations";
import { useContacts, useCreateContact, useUpdateContact } from "@/hooks/useContacts";
import { useNavigate } from "react-router-dom";
import { format, isToday, isYesterday } from "date-fns";
import { cn, relationName } from "@/lib/utils";
import { dedupeAndSortConversationMessages, shouldShowChatMessage } from "@/lib/chatMessageDisplay";

const AVATAR_COLORS = ["#019FA2", "#0d9488", "#0ea5e9", "#64748b", "#14b8a6", "#475569"];

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function normalizeDigits(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

function conversationPhoneKeyDigits(externalUserId: string | null | undefined): string | null {
  const d = normalizeDigits(externalUserId);
  if (d.length < 10) return null;
  if (d.startsWith("55") && d.length >= 12) return d.slice(-11);
  return d;
}

function isNameRedundantWithPhone(
  name: string | null | undefined,
  externalUserId: string | null | undefined
): boolean {
  const n = (name || "").trim();
  if (!n) return true;
  const nameDigits = normalizeDigits(n);
  const extDigits = normalizeDigits(externalUserId);
  if (nameDigits && extDigits && nameDigits === extDigits) return true;
  const key = conversationPhoneKeyDigits(externalUserId);
  if (nameDigits.length >= 10) {
    if (key && (nameDigits === key || nameDigits.slice(-11) === key)) return true;
    if (key && extDigits.length >= 12 && nameDigits.length >= 11 && nameDigits === extDigits.slice(-11)) return true;
  }
  return false;
}

function pickBetterMergedDisplayName(
  a: string | null | undefined,
  b: string | null | undefined,
  externalUserId: string | null | undefined
): string | null {
  const prefer = (x: string | null | undefined) => {
    const t = x?.trim();
    if (!t) return null;
    if (!isNameRedundantWithPhone(t, externalUserId)) return t;
    return null;
  };
  return prefer(a) ?? prefer(b) ?? (a?.trim() || b?.trim() || null);
}

function displayNameFromConversation(
  conv: {
    contact_name?: string | null;
    crm_display_name?: string | null;
    external_user_id?: string | null;
  } | null | undefined
): string {
  if (!conv) return "Anônimo";
  const ext = conv.external_user_id;
  const crm = conv.crm_display_name?.trim();
  if (crm && !isNameRedundantWithPhone(crm, ext)) return crm;
  const cn = conv.contact_name?.trim();
  if (cn && !isNameRedundantWithPhone(cn, ext)) return cn;
  if (ext && (ext.startsWith("{") || ext.startsWith("["))) {
    try {
      const parsed = JSON.parse(ext) as {
        name?: string;
        phone?: string;
        phone_number?: string;
        email?: string;
        identifier?: string;
      };
      const parsedName = parsed?.name?.trim();
      const parsedPhone = parsed?.phone || parsed?.phone_number || parsed?.identifier;
      if (parsedName && !isNameRedundantWithPhone(parsedName, String(parsedPhone || ext))) return parsedName;
      return (parsed?.phone || parsed?.phone_number || parsed?.email || "Anônimo") as string;
    } catch {
      /* ignore */
    }
  }
  return ext || "Anônimo";
}

function extractEmailFromConversation(conv: { external_user_id?: string | null } | null | undefined): string | null {
  return extractEmailFromExternalUserId(conv?.external_user_id ?? null);
}

function extractEmailFromExternalUserId(ext: string | null | undefined): string | null {
  if (!ext) return null;
  const t = ext.trim();
  if (t.includes("@") && !t.startsWith("{")) return t.length < 200 ? t : null;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const o = JSON.parse(t) as { email?: string };
      const e = o?.email?.trim();
      if (e?.includes("@")) return e;
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Alinha com a normalização usada em crm-contacts (conversation-preview). */
function normalizeBrazilPhoneDigits(digits: string): string {
  const d = digits.replace(/\D/g, "");
  if (d.length < 10) return d;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

function crmPhoneMatchesConversation(convDigits: string | null, contactPhone: string | null): boolean {
  if (!convDigits || convDigits.length < 10) return false;
  const a = normalizeBrazilPhoneDigits(convDigits);
  const b = normalizeBrazilPhoneDigits((contactPhone ?? "").replace(/\D/g, ""));
  return a.length >= 12 && b.length >= 12 && a === b;
}

function ConversationContactPanel(props: {
  avatarUrl?: string | null;
  avatarInitials: string;
  name: string;
  subtitle: string;
  statusOpen: boolean;
  tenantLabel: string;
  phoneDisplay: string;
  channelLabel: string;
  assigneeDisplay: string;
  labels: string[];
  onRequestAddLabel: () => void;
  profileCta: {
    label: string;
    disabled: boolean;
    loading: boolean;
    mode: "profile" | "promote";
    onClick: () => void;
  };
}) {
  const {
    avatarUrl,
    avatarInitials,
    name,
    subtitle,
    statusOpen,
    tenantLabel,
    phoneDisplay,
    channelLabel,
    assigneeDisplay,
    labels,
    onRequestAddLabel,
    profileCta,
  } = props;
  const bg = `linear-gradient(135deg, ${getAvatarColor(name)}dd, ${getAvatarColor(name)})`;

  return (
    <>
      <div className="relative flex flex-col items-center border-b border-slate-100 p-6 text-center dark:border-border sm:p-8">
        <div className="relative mb-4 sm:mb-5">
          <div
            className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full text-lg font-bold text-white shadow-md ring-1 ring-slate-100 dark:ring-border sm:h-24 sm:w-24 sm:text-xl"
            style={{ background: bg }}
          >
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : avatarInitials}
          </div>
          {statusOpen && (
            <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500 dark:border-card sm:h-5 sm:w-5" />
          )}
        </div>
        <h2 className="mb-1 text-lg font-bold text-[#0f172a] dark:text-foreground sm:text-[22px]">{name}</h2>
        <p className="mb-4 text-sm text-slate-500 dark:text-muted-foreground sm:mb-6">{subtitle}</p>
        <div className="flex w-full gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-[44px] flex-1 rounded-xl border-slate-200/60 dark:border-border active:scale-[0.98]"
            disabled={profileCta.disabled || profileCta.loading}
            onClick={profileCta.onClick}
          >
            {profileCta.loading ? (
              <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
            ) : profileCta.mode === "promote" ? (
              <UserPlus className="mr-2 h-4 w-4 shrink-0" />
            ) : (
              <Users className="mr-2 h-4 w-4 shrink-0" />
            )}
            {profileCta.label}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 min-h-[44px] min-w-[44px] shrink-0 rounded-xl border-slate-200/60 dark:border-border active:scale-[0.98]"
            disabled
            title="Em breve"
          >
            <Ban className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="space-y-4 border-b border-slate-100 p-5 dark:border-border sm:p-6">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Informações do contato</h3>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-slate-500 dark:text-muted-foreground">
              <Building2 className="h-4 w-4 shrink-0 opacity-70" /> Tenant
            </span>
            <span className="max-w-[55%] text-right font-semibold text-[#0f172a] dark:text-foreground">{tenantLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-500 dark:text-muted-foreground">
              <Phone className="h-4 w-4 shrink-0 opacity-70" /> Telefone
            </span>
            <span className="max-w-[55%] text-right font-semibold tabular-nums text-[#0f172a] dark:text-foreground">
              {phoneDisplay}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-500 dark:text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0 opacity-70" /> Canal
            </span>
            <span className="max-w-[55%] text-right font-semibold text-[#0f172a] dark:text-foreground">{channelLabel}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="flex items-center gap-2 text-slate-500 dark:text-muted-foreground">
              <Headphones className="h-4 w-4 shrink-0 opacity-70" /> Atendente
            </span>
            <span className="max-w-[58%] text-right font-bold text-primary">{assigneeDisplay}</span>
          </div>
        </div>
      </div>

      <div className="border-b border-slate-100 p-5 dark:border-border sm:p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Etiquetas</h3>
          <button
            type="button"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center gap-1 rounded-md bg-primary/10 px-3 py-2 text-xs font-bold text-primary transition-colors active:scale-[0.98] hover:bg-primary/15"
            onClick={onRequestAddLabel}
          >
            + Adicionar
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {labels.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhuma etiqueta nesta conversa.</p>
          ) : (
            labels.map((lbl) => (
              <span
                key={lbl}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-bold text-slate-600 dark:border-border dark:bg-muted dark:text-foreground"
              >
                {lbl}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="p-5 sm:p-6">
        <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">Notas internas</h3>
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/90 p-4 text-[13px] leading-relaxed text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
          Notas fixas do Chatwoot ainda não são sincronizadas aqui. Use etiquetas e o CRM para contexto compartilhado com a equipe.
        </p>
      </div>
    </>
  );
}

const CONTACT_PANEL_COLLAPSED_KEY = "boom_conv_contact_panel_collapsed";

export default function Conversations() {
  const { selectedTenantId, scopedTenantDisplayName } = useTenantContext();
  const { data: agents, isLoading: agentsLoading } = useAgents(selectedTenantId ?? undefined);
  const { data: tenants } = useTenants();
  const tenantNameById = useMemo(
    () => new Map((tenants ?? []).map((t) => [t.id, t.name])),
    [tenants]
  );
  const [selectedAgentId, setSelectedAgentIdState] = useState<string | null>(
    () => sessionStorage.getItem("conv_selectedAgentId") ?? null
  );
  const [selectedContactKey, setSelectedContactKeyState] = useState<string | null>(
    () => sessionStorage.getItem("conv_selectedContactKey") ?? null
  );

  const setSelectedAgentId = (id: string | null) => {
    setSelectedAgentIdState(id);
    if (id) sessionStorage.setItem("conv_selectedAgentId", id);
    else sessionStorage.removeItem("conv_selectedAgentId");
  };
  const setSelectedContactKey = (key: string | null) => {
    setSelectedContactKeyState(key);
    if (key) sessionStorage.setItem("conv_selectedContactKey", key);
    else sessionStorage.removeItem("conv_selectedContactKey");
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [newContactOpen, setNewContactOpen] = useState(false);
  const [newContactPhone, setNewContactPhone] = useState("");
  const [newContactName, setNewContactName] = useState("");
  const [newContactMessage, setNewContactMessage] = useState("");
  const [sendingNewContact, setSendingNewContact] = useState(false);
  const [newLabelInput, setNewLabelInput] = useState("");
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelPopoverOpen, setLabelPopoverOpen] = useState(false);
  const [threadSearchPopoverOpen, setThreadSearchPopoverOpen] = useState(false);
  const [threadMessageSearch, setThreadMessageSearch] = useState("");
  const [threadSearchMatchIdx, setThreadSearchMatchIdx] = useState(0);
  const [contactSheetOpen, setContactSheetOpen] = useState(false);
  const [contactPanelCollapsed, setContactPanelCollapsed] = useState(() =>
    typeof localStorage !== "undefined" && localStorage.getItem(CONTACT_PANEL_COLLAPSED_KEY) === "1",
  );
  const [convLimit, setConvLimit] = useState(500);
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [inboxScope, setInboxScope] = useState<"all" | "mine" | "unassigned">("all");

  // Ao trocar de tenant, limpar seleção e busca (termo de outra empresa deixava a lista vazia)
  useEffect(() => {
    setSelectedAgentId(null);
    setSelectedContactKey(null);
    setLabelFilter(null);
    setSearchTerm("");
    setConvLimit(500);
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }, [selectedTenantId, queryClient]);

  // Ao trocar de agente, limpar busca/filtros para não esconder todos os contatos do agente atual
  useEffect(() => {
    setSearchTerm("");
    setLabelFilter(null);
    setInboxScope("all");
  }, [selectedAgentId]);

  const { data: conversations, isLoading: convsLoading, error: convsError, isError: convsIsError } = useConversations(
    selectedAgentId,
    convLimit,
    selectedTenantId
  );

  const { deduplicatedConversations, contactConvIds, contactLabelsMap, allLabels } = useMemo(() => {
    if (!conversations) return {
      deduplicatedConversations: [] as typeof conversations,
      contactConvIds: new Map<string, string[]>(),
      contactLabelsMap: new Map<string, Set<string>>(),
      allLabels: [] as string[],
    };
    const contactMap = new Map<string, (typeof conversations)[number]>();
    const idsMap = new Map<string, string[]>();
    const labelsMap = new Map<string, Set<string>>();
    const labelsSet = new Set<string>();

    const resolveContactKey = (conv: (typeof conversations)[number]) => {
      const normalizePhoneKey = (v: unknown) => {
        const digits = String(v ?? "").replace(/\D/g, "");
        if (digits.length < 10) return null;
        if (digits.startsWith("55") && digits.length >= 12) return digits.slice(-11);
        return digits;
      };

      const phoneKey = normalizePhoneKey(conv.external_user_id);
      if (phoneKey) return `phone:${phoneKey}`;

      let key = conv.contact_name || conv.external_user_id || conv.id;
      if (key.startsWith("{") || key.startsWith("[")) {
        try {
          const parsed = JSON.parse(key);
          const parsedPhoneKey = normalizePhoneKey(parsed?.phone || parsed?.phone_number || parsed?.identifier);
          if (parsedPhoneKey) return `phone:${parsedPhoneKey}`;
          key = parsed?.name || parsed?.phone || parsed?.email || conv.id;
        } catch {
          key = conv.id;
        }
      }
      return key;
    };

    const cwConvKeyMap = new Map<number, string>();
    for (const conv of conversations) {
      const cwId = conv.chatwoot_conversation_id;
      if (cwId && !cwConvKeyMap.has(cwId)) {
        cwConvKeyMap.set(cwId, resolveContactKey(conv));
      }
    }

    for (const conv of conversations) {
      let contactKey: string;
      const cwId = conv.chatwoot_conversation_id;
      if (cwId && cwConvKeyMap.has(cwId)) {
        contactKey = cwConvKeyMap.get(cwId)!;
      } else {
        contactKey = resolveContactKey(conv);
      }

      if (!idsMap.has(contactKey)) idsMap.set(contactKey, []);
      idsMap.get(contactKey)!.push(conv.id);

      const convLabels = conv.labels ?? [];
      for (const lbl of convLabels) {
        labelsSet.add(lbl);
        if (!labelsMap.has(contactKey)) labelsMap.set(contactKey, new Set());
        labelsMap.get(contactKey)!.add(lbl);
      }

      if (!contactMap.has(contactKey)) {
        contactMap.set(contactKey, conv);
      } else {
        const existing = contactMap.get(contactKey)!;
        const extId = conv.external_user_id || existing.external_user_id;
        contactMap.set(contactKey, {
          ...existing,
          message_count: existing.message_count + conv.message_count,
          chatwoot_assignee_name: conv.chatwoot_assignee_name || existing.chatwoot_assignee_name,
          contact_name: pickBetterMergedDisplayName(existing.contact_name, conv.contact_name, extId),
          crm_display_name: pickBetterMergedDisplayName(
            existing.crm_display_name,
            conv.crm_display_name,
            extId
          ),
          contact_avatar_url: conv.contact_avatar_url || existing.contact_avatar_url,
        });
      }
    }
    return {
      deduplicatedConversations: Array.from(contactMap.values()),
      contactConvIds: idsMap,
      contactLabelsMap: labelsMap,
      allLabels: Array.from(labelsSet).sort(),
    };
  }, [conversations]);

  const selectedConvIds = useMemo(
    () => selectedContactKey ? (contactConvIds.get(selectedContactKey) ?? []) : [],
    [selectedContactKey, contactConvIds]
  );
  const selectedConv = deduplicatedConversations.find((c) => {
    const key = c.contact_name || c.external_user_id || c.id;
    return selectedContactKey && (contactConvIds.get(selectedContactKey) ?? []).includes(c.id);
  }) ?? (selectedContactKey ? deduplicatedConversations.find((c) => {
    let k = c.contact_name || c.external_user_id || c.id;
    if (k.startsWith("{") || k.startsWith("[")) {
      try { const p = JSON.parse(k); k = p?.name || p?.phone || p?.email || c.id; } catch { k = c.id; }
    }
    return k === selectedContactKey;
  }) : undefined);

  // sessionStorage / troca de tenant pode deixar selectedContactKey sem conversa correspondente → evita crash e ecrã branco
  useEffect(() => {
    if (!selectedContactKey || !selectedAgentId || convsLoading) return;
    if (selectedConv === undefined) setSelectedContactKey(null);
  }, [selectedContactKey, selectedAgentId, convsLoading, selectedConv]);

  const { data: messages, isLoading: msgsLoading } = useMultiConversationMessages(selectedAgentId, selectedConvIds);

  const threadSearchMatches = useMemo(() => {
    const q = threadMessageSearch.trim().toLowerCase();
    if (!q || !messages?.length) return [] as string[];
    const list = dedupeAndSortConversationMessages(messages);
    return list
      .filter((m) => shouldShowChatMessage(m, showDebug))
      .filter((m) => (m.content || "").toLowerCase().includes(q))
      .map((m) => m.id);
  }, [messages, threadMessageSearch, showDebug]);

  const activeThreadSearchMessageId =
    threadSearchMatches.length > 0
      ? threadSearchMatches[
          Math.min(threadSearchMatchIdx, Math.max(0, threadSearchMatches.length - 1))
        ]
      : null;

  useEffect(() => {
    setThreadMessageSearch("");
    setThreadSearchMatchIdx(0);
    setThreadSearchPopoverOpen(false);
    setContactSheetOpen(false);
  }, [selectedContactKey]);

  useEffect(() => {
    try {
      localStorage.setItem(CONTACT_PANEL_COLLAPSED_KEY, contactPanelCollapsed ? "1" : "0");
    } catch {
      /* ignore quota / private mode */
    }
  }, [contactPanelCollapsed]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const getContactKeyForConv = (conv: (typeof deduplicatedConversations)[number]) => {
    for (const [key, ids] of contactConvIds.entries()) {
      if (ids.includes(conv.id)) return key;
    }
    const digits = String(conv?.external_user_id ?? "").replace(/\D/g, "");
    if (digits.length >= 10) {
      const normalized = digits.startsWith("55") && digits.length >= 12 ? digits.slice(-11) : digits;
      return `phone:${normalized}`;
    }
    return conv?.contact_name || conv?.external_user_id || conv?.id;
  };

  const filteredConversations = deduplicatedConversations.filter((c) => {
    if (inboxScope === "unassigned") {
      if (c.chatwoot_assignee_name?.trim()) return false;
    } else if (inboxScope === "mine") {
      const mine = profile?.full_name?.trim();
      if (!mine) return false;
      const asn = c.chatwoot_assignee_name?.trim();
      if (!asn || asn.toLowerCase() !== mine.toLowerCase()) return false;
    }
    if (labelFilter) {
      const key = getContactKeyForConv(c);
      if (!contactLabelsMap.get(key)?.has(labelFilter)) return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const title = displayNameFromConversation(c).toLowerCase();
    return (
      title.includes(term) ||
      c.crm_display_name?.toLowerCase().includes(term) ||
      c.contact_name?.toLowerCase().includes(term) ||
      c.external_user_id?.toLowerCase().includes(term) ||
      c.channel?.toLowerCase().includes(term)
    );
  });

  const hasDebugData = (messages ?? []).some(
    (msg) => !!msg.metadata?.debug?.length || !!msg.metadata?.token_usage
  );

  const handleClearConversation = async () => {
    if (!selectedConvIds.length) return;
    const name = displayName(selectedConv);
    if (!confirm(`Tem certeza que deseja apagar todo o histórico de "${name}"? Essa ação não pode ser desfeita.`)) return;
    setClearing(true);
    try {
      const data = await callAPI<{ deleted_messages?: number }>("/admin/clear-conversations", {
        body: { conversation_ids: selectedConvIds, agent_id: selectedAgentId },
      });
      toast.success(`Histórico limpo: ${data.deleted_messages} mensagens removidas`);
      setSelectedContactKey(null);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      queryClient.invalidateQueries({ queryKey: ["multi-conversation-messages"] });
    } catch (e: any) {
      toast.error("Erro ao limpar histórico: " + (e?.message || "erro desconhecido"));
    } finally {
      setClearing(false);
    }
  };

  const currentLabels = selectedContactKey ? Array.from(contactLabelsMap.get(selectedContactKey) ?? []) : [];

  const handleAddLabel = async () => {
    const label = newLabelInput.trim();
    if (!label || !selectedAgentId || !selectedConvIds.length) return;
    setAddingLabel(true);
    try {
      await callAPI("/contacts/add-label", {
        body: { agent_id: selectedAgentId, conversation_ids: selectedConvIds, label },
      });
      toast.success(`Etiqueta "${label}" adicionada`);
      setNewLabelInput("");
      setLabelPopoverOpen(false);
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: any) {
      toast.error("Erro ao adicionar etiqueta: " + (e?.message || "erro desconhecido"));
    } finally {
      setAddingLabel(false);
    }
  };

  const handleNewContact = async () => {
    if (!newContactPhone.trim() || !newContactMessage.trim() || !selectedAgentId) return;
    setSendingNewContact(true);
    try {
      await callAPI("/contacts/new", {
        body: {
          agent_id: selectedAgentId,
          phone: newContactPhone.trim(),
          name: newContactName.trim() || undefined,
          message: newContactMessage.trim(),
        },
      });
      toast.success("Mensagem enviada para " + (newContactName.trim() || newContactPhone.trim()));
      setNewContactOpen(false);
      setNewContactPhone("");
      setNewContactName("");
      setNewContactMessage("");
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: any) {
      toast.error("Erro ao enviar: " + (e?.message || "erro desconhecido"));
    } finally {
      setSendingNewContact(false);
    }
  };

  const displayName = (conv: any) => displayNameFromConversation(conv);
  const initials = (conv: any) => (displayName(conv) || "?").slice(0, 2).toUpperCase();
  const getContactKey = (conv: any) => {
    const cwId = conv?.chatwoot_conversation_id;
    if (cwId) {
      for (const [key, ids] of contactConvIds.entries()) {
        if (ids.includes(conv?.id)) return key;
      }
    }
    const digits = String(conv?.external_user_id ?? "").replace(/\D/g, "");
    if (digits.length >= 10) {
      const normalized = digits.startsWith("55") && digits.length >= 12 ? digits.slice(-11) : digits;
      return `phone:${normalized}`;
    }
    let key = conv?.contact_name || conv?.external_user_id || conv?.id;
    if (key && (key.startsWith("{") || key.startsWith("["))) {
      try {
        const p = JSON.parse(key);
        const pDigits = String(p?.phone || p?.phone_number || p?.identifier || "").replace(/\D/g, "");
        if (pDigits.length >= 10) {
          const normalized = pDigits.startsWith("55") && pDigits.length >= 12 ? pDigits.slice(-11) : pDigits;
          return `phone:${normalized}`;
        }
        key = p?.name || p?.phone || p?.email || conv?.id;
      } catch { key = conv?.id; }
    }
    return key;
  };

  const normalizePhone = (value: string) => value.replace(/\D/g, "");

  const extractPhoneDigits = (value: unknown): string | null => {
    if (value == null) return null;
    if (typeof value === "number") {
      const digits = normalizePhone(String(value));
      return digits.length >= 10 ? digits : null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      const digits = normalizePhone(trimmed);
      if (digits.length >= 10) return digits;
      if ((trimmed.startsWith("{") || trimmed.startsWith("[")) && trimmed.length > 2) {
        try { const parsed = JSON.parse(trimmed); return extractPhoneDigits(parsed); } catch { return null; }
      }
      return null;
    }
    if (typeof value === "object") {
      const record = value as Record<string, unknown>;
      const priorityKeys = ["phone", "phone_number", "identifier", "source_id", "external_user_id", "whatsapp"];
      for (const key of priorityKeys) { const found = extractPhoneDigits(record[key]); if (found) return found; }
      for (const nested of Object.values(record)) { const found = extractPhoneDigits(nested); if (found) return found; }
    }
    return null;
  };

  const formatPhone = (value?: string | null) => {
    if (!value) return null;
    const digits = normalizePhone(value);
    if (digits.length === 13 && digits.startsWith("55")) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 9)}-${digits.slice(9)}`;
    if (digits.length === 12 && digits.startsWith("55")) return `+${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 8)}-${digits.slice(8)}`;
    if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
    return value;
  };

  const getPhoneDisplay = (conv: any) => {
    const candidates = [conv?.external_user_id, conv?.contact_name, conv?.chatwoot_contact_id];
    for (const candidate of candidates) {
      const digits = extractPhoneDigits(candidate);
      if (digits) return formatPhone(digits);
    }
    return null;
  };

  const selectedAgent = agents?.find((a) => a.id === selectedAgentId);
  const navigate = useNavigate();
  const updateContact = useUpdateContact();
  const createContact = useCreateContact();
  const selectedCrmTenantId = selectedAgent?.tenant_id ?? selectedTenantId ?? null;

  const selectedConvPhoneDigits = selectedConv ? extractPhoneDigits(selectedConv) : null;

  const crmSearchSuffix =
    selectedConvPhoneDigits && selectedConvPhoneDigits.length >= 9
      ? selectedConvPhoneDigits.slice(-9)
      : undefined;

  const crmLookupActive = Boolean(
    selectedCrmTenantId && selectedConvPhoneDigits && selectedConvPhoneDigits.length >= 10 && crmSearchSuffix
  );

  const crmContactsQuery = useContacts({
    tenant_id: selectedCrmTenantId,
    limit: 100,
    search: crmSearchSuffix,
    queryEnabled: crmLookupActive,
  });

  const matchedCrmContact = useMemo(() => {
    const rows = crmContactsQuery.data?.data ?? [];
    return rows.find((c) => crmPhoneMatchesConversation(selectedConvPhoneDigits, c.phone)) ?? null;
  }, [crmContactsQuery.data?.data, selectedConvPhoneDigits]);

  const crmStillLoading = crmLookupActive && crmContactsQuery.isPending;

  const handleConversationProfileCta = useCallback(async () => {
    if (!selectedConv) return;
    const tenantId = selectedCrmTenantId;
    if (!tenantId) {
      toast.error("Selecione um tenant ou agente válido.");
      return;
    }
    const digits = selectedConvPhoneDigits;
    if (!digits || digits.length < 10) {
      toast.error("Telefone do contato não identificado.");
      return;
    }
    if (crmStillLoading) return;

    try {
      if (matchedCrmContact?.contact_type === "client") {
        navigate(`/clients/${matchedCrmContact.id}`);
        return;
      }
      if (matchedCrmContact) {
        await updateContact.mutateAsync({ id: matchedCrmContact.id, contact_type: "client" });
        toast.success("Lead promovido a cliente!");
        navigate(`/clients/${matchedCrmContact.id}`);
        return;
      }
      const phoneNorm = normalizeBrazilPhoneDigits(digits);
      const created = await createContact.mutateAsync({
        tenant_id: tenantId,
        name: displayNameFromConversation(selectedConv) || "Cliente",
        phone: `+${phoneNorm}`,
        contact_type: "client",
      });
      toast.success("Cliente criado no CRM.");
      navigate(`/clients/${created.id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || "Não foi possível concluir.");
    }
  }, [
    selectedConv,
    selectedCrmTenantId,
    selectedConvPhoneDigits,
    matchedCrmContact,
    crmStillLoading,
    navigate,
    updateContact,
    createContact,
  ]);

  const conversationProfileCta = useMemo(() => {
    const noPhone = !selectedConvPhoneDigits || selectedConvPhoneDigits.length < 10;
    const noTenant = !selectedCrmTenantId;
    const mutating = updateContact.isPending || createContact.isPending;
    const loading = crmStillLoading || mutating;

    if (noPhone || noTenant) {
      return {
        label: "Perfil",
        disabled: true,
        loading: false,
        mode: "profile" as const,
        onClick: () => {},
      };
    }

    const isClient = matchedCrmContact?.contact_type === "client";

    return {
      label: mutating ? "Aguarde…" : crmStillLoading ? "Carregando…" : isClient ? "Perfil" : "Tornar cliente",
      disabled: loading,
      loading,
      mode: !crmStillLoading && isClient ? ("profile" as const) : ("promote" as const),
      onClick: handleConversationProfileCta,
    };
  }, [
    selectedConvPhoneDigits,
    selectedCrmTenantId,
    crmStillLoading,
    matchedCrmContact,
    updateContact.isPending,
    createContact.isPending,
    handleConversationProfileCta,
  ]);

  const getChannelLabel = (channel: string) => {
    if (channel?.toLowerCase().includes("whatsapp")) return "WhatsApp";
    if (channel === "webhook") return "WhatsApp";
    if (channel?.toLowerCase().includes("web")) return "Web";
    return channel || "Chat";
  };

  const getListTimestamp = (conv: (typeof deduplicatedConversations)[number]) => {
    try {
      const d = new Date(conv.started_at);
      const now = Date.now();
      if (isToday(d)) return format(d, "HH:mm");
      if (isYesterday(d)) return "Ontem";
      const ms = now - d.getTime();
      const h = Math.floor(ms / 36e5);
      if (h < 48) return `${Math.max(1, h)}h`;
      const days = Math.floor(h / 24);
      if (days < 14) return `${days}d`;
      return format(d, "dd/MM");
    } catch {
      return "";
    }
  };

  const selectedEmail = selectedConv ? extractEmailFromConversation(selectedConv) : null;
  const selectedTenantLabel =
    (selectedAgent &&
      (relationName(selectedAgent.tenants) ?? tenantNameById.get(selectedAgent.tenant_id ?? ""))) ||
    (selectedTenantId ? tenantNameById.get(selectedTenantId) : null) ||
    scopedTenantDisplayName ||
    "—";

  const pickerScopeLabel =
    scopedTenantDisplayName ??
    (selectedTenantId ? tenantNameById.get(selectedTenantId) ?? null : null) ??
    "Todos os tenants";

  const openAgentBox = (agentId: string) => {
    setSelectedAgentId(agentId);
    setSelectedContactKey(null);
  };

  const singlePickerAgent =
    !agentsLoading && agents && agents.length === 1 ? agents[0] ?? null : null;

  return (
    <div className="flex h-full min-h-0 flex-1 touch-manipulation flex-col overflow-hidden overscroll-none bg-background text-foreground">
      {!selectedAgentId ? (
        <div className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto overscroll-contain px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:items-center sm:px-4 sm:pb-8 md:py-8">
          <div className="w-full max-w-[920px] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_4px_32px_-8px_rgba(15,23,42,0.12)] dark:border-border dark:bg-card sm:rounded-2xl">
            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(272px,360px)] lg:grid-cols-[1fr_380px]">
              <div className="relative flex flex-col justify-center gap-4 border-b border-slate-100 bg-gradient-to-br from-[#f5f3ff] via-white to-[#ecfeff] px-5 py-6 dark:border-border dark:from-card dark:via-card dark:to-card sm:gap-6 sm:px-8 sm:py-10 md:border-b-0 md:border-r md:py-12">
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Área operacional</span>
                  <h1 className="mt-3 text-[1.65rem] font-bold tracking-tight text-[#0f172a] dark:text-foreground md:text-[2rem] md:leading-tight">
                    Entre na sua caixa de chat
                  </h1>
                  <p className="mt-4 text-[15px] leading-relaxed text-slate-600 dark:text-muted-foreground">
                    Escolha o agente para ver filas, histórico e responder no mesmo layout usado dentro da inbox.
                  </p>
                </div>
                <ul className="space-y-3 text-[14px] leading-snug text-slate-600 dark:text-muted-foreground">
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>Conversas, etiquetas e contato lado a lado, no padrão operacional Boom.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>Trocar de tenant no menu lateral altera os agentes listados ao lado.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>Um único agente no escopo aparece destacado para entrar rápido.</span>
                  </li>
                </ul>
                <div className="rounded-xl border border-white/70 bg-white/75 px-4 py-3 text-[13px] dark:border-border dark:bg-muted/40">
                  <span className="font-semibold text-slate-800 dark:text-foreground">Escopo atual: </span>
                  <span className="text-slate-600 dark:text-muted-foreground">{pickerScopeLabel}</span>
                  <span className="mx-2 text-slate-300 dark:text-border">·</span>
                  <span className="font-medium text-primary">{agents?.length ?? 0} agente(s)</span>
                </div>
              </div>

              <div className="flex flex-col gap-5 bg-[#f8fafc]/95 px-6 py-8 dark:bg-muted/25 md:justify-center md:px-8 md:py-10">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[17px] font-semibold tracking-tight text-[#0f172a] dark:text-foreground">
                    Agentes no escopo
                  </h2>
                  {!agentsLoading && (
                    <span className="shrink-0 rounded-full bg-primary/12 px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary dark:bg-primary/20 dark:text-primary">
                      {agents?.length ?? 0}
                    </span>
                  )}
                </div>

                {agentsLoading && (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="h-[4.75rem] rounded-2xl border border-slate-100 bg-white/70 animate-pulse dark:border-border dark:bg-muted"
                      />
                    ))}
                  </div>
                )}

                {singlePickerAgent && (
                    <button
                      type="button"
                      onClick={() => openAgentBox(singlePickerAgent.id)}
                      className="group w-full overflow-hidden rounded-2xl border border-border bg-card text-left transition-all hover:border-primary dark:border-border dark:bg-card dark:hover:border-primary"
                    >
                      <div className="flex items-start gap-4 p-5 pb-4">
                        <div className="relative shrink-0">
                          {singlePickerAgent.avatar_url ? (
                            <img
                              src={singlePickerAgent.avatar_url}
                              alt={singlePickerAgent.name}
                              className="h-[4.25rem] w-[4.25rem] rounded-full object-cover ring-[3px] ring-border dark:ring-border"
                            />
                          ) : (
                            <div className="flex h-[4.25rem] w-[4.25rem] items-center justify-center rounded-full bg-primary/10">
                              <Bot className="h-9 w-9 text-primary" />
                            </div>
                          )}
                          <span
                            className={cn(
                              "absolute bottom-1 right-1 h-3.5 w-3.5 rounded-full border-[3px] border-white dark:border-card",
                              singlePickerAgent.status === "active" ? "bg-emerald-500" : "bg-slate-300"
                            )}
                          />
                        </div>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <p className="truncate text-lg font-bold text-[#0f172a] dark:text-foreground">{singlePickerAgent.name}</p>
                          <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-muted-foreground">
                            {relationName(singlePickerAgent.tenants) ??
                              tenantNameById.get(singlePickerAgent.tenant_id) ??
                              scopedTenantDisplayName ??
                              "Sem tenant"}
                          </p>
                        </div>
                        <ChevronRight className="mt-2 h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                      <div className="flex items-center justify-center gap-2 bg-primary py-3.5 text-sm font-semibold text-white transition-colors group-hover:bg-primary/90">
                        <MessageSquare className="h-4 w-4" />
                        Abrir caixa de conversas
                      </div>
                    </button>
                )}

                {!agentsLoading && agents && agents.length > 1 && (
                  <ul className="space-y-2.5 [scrollbar-width:thin]">
                    {agents.map((agent) => {
                      const isActive = agent.status === "active";
                      const tenantLine =
                        relationName(agent.tenants) ??
                        tenantNameById.get(agent.tenant_id) ??
                        scopedTenantDisplayName ??
                        "Sem tenant";
                      return (
                        <li key={agent.id}>
                          <button
                            type="button"
                            onClick={() => openAgentBox(agent.id)}
                            className="group flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary hover:bg-muted dark:border-border dark:bg-card dark:hover:border-primary"
                          >
                            <div className="relative shrink-0">
                              {agent.avatar_url ? (
                                <img
                                  src={agent.avatar_url}
                                  alt={agent.name}
                                  className="h-11 w-11 rounded-full object-cover ring-2 ring-slate-100 dark:ring-border"
                                />
                              ) : (
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                                  <Bot className="h-5 w-5 text-primary" />
                                </div>
                              )}
                              <span
                                className={cn(
                                  "absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-card",
                                  isActive ? "bg-emerald-500" : "bg-slate-300"
                                )}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-[#0f172a] dark:text-foreground">{agent.name}</p>
                              <p className="truncate text-[13px] text-slate-500 dark:text-muted-foreground">{tenantLine}</p>
                            </div>
                            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 group-hover:text-primary" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {!agentsLoading && (!agents || agents.length === 0) && (
                  <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-200 bg-white/70 py-12 text-center dark:border-border dark:bg-muted/30">
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-muted">
                      <Bot className="h-8 w-8 text-slate-400 dark:text-muted-foreground" />
                    </div>
                    <p className="px-4 text-[15px] font-semibold text-slate-800 dark:text-foreground">Nenhum agente aqui</p>
                    <p className="mt-2 max-w-[260px] px-4 text-sm text-slate-500 dark:text-muted-foreground">
                      Crie um agente neste tenant ou troque de workspace na barra lateral.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "flex min-h-0 flex-1 touch-pan-y flex-col gap-3 overflow-hidden pb-[env(safe-area-inset-bottom,0px)] md:flex-row md:gap-6 md:p-6",
            selectedContactKey
              ? "max-md:gap-0 max-md:pb-0 max-md:pt-2"
              : "px-3 pt-3 min-[480px]:px-4 min-[480px]:pt-4",
          )}
        >
          <aside
            className={cn(
              "flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-border dark:bg-card sm:rounded-2xl md:w-[20rem]",
              selectedContactKey ? "hidden md:flex" : "flex min-h-[36dvh] flex-1 sm:min-h-[40dvh] md:min-h-0 md:flex-none",
            )}
          >
            {/* Header Conversas */}
            <div className="shrink-0 border-b border-slate-100 px-3 py-3 dark:border-border sm:p-5">
              <div className="mb-2 flex items-start justify-between gap-2 sm:mb-4">
                <h2 className="text-base font-semibold tracking-tight text-[#0f172a] dark:text-foreground sm:text-lg md:text-xl">Conversas</h2>
                <button
                  type="button"
                  onClick={() => { setSelectedAgentId(null); setSelectedContactKey(null); }}
                  className="min-h-[40px] shrink-0 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors active:bg-slate-100 hover:bg-slate-100 hover:text-primary dark:text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-1">
                    <ArrowLeft className="h-3 w-3" /> Sair
                  </span>
                </button>
              </div>

              {/* Chips */}
              <div className="mb-2 flex gap-2 overflow-x-auto overscroll-contain pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin] [-ms-overflow-style:none] [&::-webkit-scrollbar]:h-1 sm:mb-4">
                {([
                  { id: "all" as const, label: "Todas" },
                  { id: "mine" as const, label: "Minhas" },
                  { id: "unassigned" as const, label: "Não Atribuídas" },
                ]).map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => {
                      setInboxScope(chip.id);
                      if (chip.id !== "mine") setLabelFilter(null);
                    }}
                    className={cn(
                      "touch-manipulation whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-semibold shadow-sm transition-colors active:scale-[0.98] sm:px-3 sm:py-2.5 sm:text-xs",
                      inboxScope === chip.id
                        ? "bg-primary text-white"
                        : "border border-slate-200/60 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-border dark:bg-muted dark:text-muted-foreground"
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {allLabels.length > 0 && (
                <div className="mb-2 sm:mb-3">
                  <Select value={labelFilter ?? "all"} onValueChange={(v) => setLabelFilter(v === "all" ? null : v)}>
                    <SelectTrigger className="h-9 w-full rounded-xl border-slate-200/60 bg-slate-50 text-xs dark:border-border dark:bg-muted">
                      <Tag className="mr-2 h-3.5 w-3.5 text-slate-500" />
                      <SelectValue placeholder="Filtrar por etiqueta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as etiquetas</SelectItem>
                      {allLabels.map((lbl) => (
                        <SelectItem key={lbl} value={lbl}>{lbl}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar nas conversas..."
                  className="h-10 rounded-xl border-slate-200/60 bg-slate-50 pl-10 text-sm placeholder:text-slate-400 dark:border-border dark:bg-muted"
                />
              </div>

              {selectedAgent && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 dark:border-border dark:bg-muted/50 sm:mt-4 sm:gap-2.5 sm:rounded-xl sm:px-3 sm:py-2">
                  {selectedAgent.avatar_url ? (
                    <img src={selectedAgent.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-[#0f172a] dark:text-foreground">{selectedAgent.name}</p>
                    <p className="text-[11px] text-slate-500 dark:text-muted-foreground">Agente ativo nesta caixa</p>
                  </div>
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      selectedAgent.status === "active" ? "bg-emerald-500" : "bg-slate-300"
                    )}
                  />
                </div>
              )}

              <div className="mt-2 flex items-center justify-between sm:mt-3">
                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="font-medium">{filteredConversations.length} na lista</span>
                </div>
                <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                    >
                      <span className="inline-flex items-center gap-1">
                        <UserPlus className="h-3.5 w-3.5" /> Novo contato
                      </span>
                    </button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                      <DialogTitle>Novo Contato</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="nc-phone">Telefone *</Label>
                        <Input
                          id="nc-phone"
                          placeholder="(11) 99999-9999"
                          value={newContactPhone}
                          onChange={(e) => setNewContactPhone(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nc-name">Nome (opcional)</Label>
                        <Input
                          id="nc-name"
                          placeholder="Nome do contato"
                          value={newContactName}
                          onChange={(e) => setNewContactName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nc-msg">Mensagem *</Label>
                        <Textarea
                          id="nc-msg"
                          placeholder="Digite a mensagem..."
                          value={newContactMessage}
                          onChange={(e) => setNewContactMessage(e.target.value)}
                          rows={3}
                        />
                      </div>
                      <Button
                        className="w-full"
                        disabled={!newContactPhone.trim() || !newContactMessage.trim() || sendingNewContact}
                        onClick={handleNewContact}
                      >
                        {sendingNewContact ? "Enviando..." : "Enviar Mensagem"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Contact list */}
            <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin] hover:[scrollbar-color:rgb(203_213_225)_transparent]">
              {convsLoading && (
                <div className="space-y-px">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className="h-10 w-10 rounded-full bg-muted/60 animate-pulse shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3.5 w-24 rounded bg-muted/60 animate-pulse" />
                        <div className="h-3 w-36 rounded bg-muted/40 animate-pulse" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!convsLoading && convsIsError && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4 gap-2">
                  <MessageSquare className="h-8 w-8 text-destructive/40 mb-1" />
                  <p className="text-xs font-medium text-destructive">Erro ao carregar conversas</p>
                  <p className="text-[11px] text-muted-foreground max-w-[240px]">
                    {(convsError as Error)?.message || "Falha na API (ex.: RPC list_agent_conversations). Verifique migrações do Supabase."}
                  </p>
                </div>
              )}

              {!convsLoading && !convsIsError && filteredConversations?.length === 0 && deduplicatedConversations.length > 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4 gap-2">
                  <Search className="h-7 w-7 text-muted-foreground/30" />
                  <p className="text-xs text-muted-foreground">Nenhum contato com os filtros ou busca atuais</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => {
                      setSearchTerm("");
                      setLabelFilter(null);
                      setInboxScope("all");
                    }}
                  >
                    Limpar busca e filtros
                  </Button>
                </div>
              )}

              {!convsLoading && !convsIsError && filteredConversations?.length === 0 && deduplicatedConversations.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground">Nenhuma conversa encontrada</p>
                </div>
              )}

              <div className="space-y-0.5">
                {filteredConversations?.map((conv) => {
                  const isSelected = selectedContactKey === getContactKey(conv);
                  const channel = getChannelLabel(conv.channel);
                  const timestamp = getListTimestamp(conv);
                  const name = displayName(conv);

                  const avatarColor = getAvatarColor(name);
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      onClick={() => setSelectedContactKey(getContactKey(conv))}
                      className={cn(
                        "relative flex min-h-[56px] w-full touch-manipulation items-start gap-3 border-b border-slate-50 p-3 text-start transition-colors active:bg-slate-100 hover:bg-slate-50/90 dark:border-border dark:active:bg-muted/50 dark:hover:bg-muted/60 sm:p-4",
                        isSelected ? "border-l-4 border-l-primary bg-primary/[0.06]" : "border-l-4 border-l-transparent"
                      )}
                    >
                      {/* Avatar */}
                      <div className="relative shrink-0">
                        <div
                          className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-[13px] shadow-sm"
                          style={{
                            background: `linear-gradient(135deg, ${avatarColor}dd, ${avatarColor})`,
                            boxShadow: `0 2px 8px ${avatarColor}44`,
                          }}
                        >
                          {conv.contact_avatar_url ? (
                            <img src={conv.contact_avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                          ) : (
                            initials(conv)
                          )}
                        </div>
                        {conv.status === "open" && (
                          <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-success" />
                        )}
                      </div>

                        <div className="flex flex-1 min-w-0 flex-col gap-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-[15px] font-semibold text-[#0f172a] dark:text-foreground">
                              {name}
                            </p>
                            <span
                              className={cn(
                                "shrink-0 text-right tabular-nums text-[11px] font-semibold tracking-tight",
                                isSelected ? "text-primary" : "text-slate-400 dark:text-muted-foreground",
                              )}
                            >
                              {timestamp}
                            </span>
                          </div>
                          <p className="truncate text-sm text-slate-500 dark:text-muted-foreground">
                            {conv.message_count} mensagens • {channel}
                          </p>
                        </div>
                    </button>
                  );
                })}
              </div>

              {!convsLoading && conversations && conversations.length >= convLimit && (
                <div className="px-4 py-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setConvLimit((prev) => prev + 500)}
                    className="w-full rounded-lg border border-border py-2 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
                  >
                    Carregar mais contatos
                  </button>
                </div>
              )}
            </div>
          </aside>

          {/* Thread principal (referência Stitch) */}
          <section
            className={cn(
              "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-border dark:bg-card sm:rounded-2xl md:min-h-[380px]",
              "max-md:rounded-none max-md:border-x-0 max-md:shadow-none",
              !selectedContactKey ? "hidden md:flex" : "flex max-md:min-h-0",
            )}
          >
            {!selectedContactKey ? (
              <div className="flex flex-1 flex-col items-center justify-center bg-slate-50/40 px-6 dark:bg-muted/30">
                <div className="mx-auto max-w-sm text-center">
                  <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-white shadow-inner dark:bg-card">
                    <MessageSquare className="h-9 w-9 text-slate-300 dark:text-muted-foreground" />
                  </div>
                  <p className="text-base font-semibold text-slate-700 dark:text-foreground">Selecione uma conversa</p>
                  <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">
                    Escolha um contato na lista à esquerda para ler e responder mensagens.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="z-10 flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white/95 px-2 py-2.5 backdrop-blur-sm dark:border-border dark:bg-card/95 sm:gap-3 sm:px-5 sm:py-4">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-ml-0.5 h-10 w-10 shrink-0 touch-manipulation text-slate-500 active:bg-slate-100 md:h-11 md:w-11 md:hidden"
                      onClick={() => setSelectedContactKey(null)}
                      aria-label="Voltar à lista de conversas"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="relative shrink-0">
                      <div
                        className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white shadow-sm ring-2 ring-white dark:ring-border sm:h-12 sm:w-12 sm:text-sm"
                        style={{
                          background: `linear-gradient(135deg, ${getAvatarColor(displayName(selectedConv))}dd, ${getAvatarColor(displayName(selectedConv))})`,
                        }}
                      >
                        {selectedConv?.contact_avatar_url ? (
                          <img src={selectedConv.contact_avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          initials(selectedConv)
                        )}
                      </div>
                      {selectedConv?.status === "open" && (
                        <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-[3px] border-white bg-emerald-500 dark:border-card" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-semibold leading-snug text-[#0f172a] dark:text-foreground sm:text-[18px]">
                        {displayName(selectedConv)}
                      </p>
                      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[10px] text-slate-500 dark:text-muted-foreground sm:gap-1.5 sm:text-xs">
                        <span className={`h-2 w-2 rounded-full ${selectedConv?.status === "open" ? "bg-emerald-500" : "bg-slate-300"}`} />
                        <span className="min-w-0 truncate">
                          {getChannelLabel(String(selectedConv?.channel ?? ""))}
                          {getPhoneDisplay(selectedConv) ? ` • ${getPhoneDisplay(selectedConv)}` : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="touch-manipulation h-9 w-9 shrink-0 rounded-xl border-slate-200/60 bg-white shadow-sm hover:text-primary sm:h-10 sm:w-10 xl:hidden"
                      title="Detalhes do contato"
                      aria-label="Abrir detalhes do contato"
                      onClick={() => setContactSheetOpen(true)}
                    >
                      <PanelRight className="h-4 w-4 sm:h-5 sm:w-5" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className={cn(
                        "hidden h-9 w-9 shrink-0 rounded-xl border-slate-200/60 bg-white text-slate-500 shadow-sm hover:text-primary sm:h-10 sm:w-10 xl:inline-flex",
                        contactPanelCollapsed && "border-primary/80 text-primary",
                      )}
                      title={
                        contactPanelCollapsed
                          ? "Mostrar informações do contato"
                          : "Recolher painel de informações do contato"
                      }
                      aria-expanded={!contactPanelCollapsed}
                      aria-controls="conversation-contact-panel"
                      aria-label={
                        contactPanelCollapsed
                          ? "Mostrar painel de informações do contato"
                          : "Recolher painel de informações do contato"
                      }
                      onClick={() => setContactPanelCollapsed((c) => !c)}
                    >
                      {contactPanelCollapsed ? (
                        <ChevronsLeft className="h-5 w-5" aria-hidden />
                      ) : (
                        <ChevronsRight className="h-5 w-5" aria-hidden />
                      )}
                    </Button>
                    <Popover open={threadSearchPopoverOpen} onOpenChange={setThreadSearchPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className={cn(
                            "h-9 w-9 shrink-0 touch-manipulation rounded-xl border-slate-200/60 bg-white shadow-sm hover:text-primary sm:h-10 sm:w-10",
                            threadMessageSearch.trim().length > 0 && "border-primary text-primary",
                          )}
                          type="button"
                          title={threadMessageSearch.trim() ? "Busca ativa — clique para editar" : "Buscar no histórico da conversa"}
                          aria-label="Buscar no histórico da conversa"
                        >
                          <Search className="h-4 w-4 sm:h-5 sm:w-5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]" align="end">
                        <div className="space-y-3">
                          <label htmlFor="thread-msg-search" className="text-sm font-medium leading-none">
                            Buscar no histórico
                          </label>
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              id="thread-msg-search"
                              value={threadMessageSearch}
                              onChange={(e) => {
                                setThreadMessageSearch(e.target.value);
                                setThreadSearchMatchIdx(0);
                              }}
                              placeholder="Palavra ou trecho..."
                              className="h-9 border-slate-200 pl-9 text-[15px] shadow-sm dark:border-border"
                              autoComplete="off"
                              autoCapitalize="off"
                              spellCheck={false}
                              onKeyDown={(e) => {
                                const len = threadSearchMatches.length;
                                if (!len) return;
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  setThreadSearchMatchIdx((prev) => (prev + 1 >= len ? 0 : prev + 1));
                                }
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
                            <span>
                              {threadMessageSearch.trim().length === 0
                                ? "Digite para localizar mensagens nesta conversa."
                                : threadSearchMatches.length === 0
                                  ? "Nenhuma mensagem encontrada."
                                  : `${threadSearchMatches.length} resultado${threadSearchMatches.length === 1 ? "" : "s"} (${threadSearchMatchIdx + 1}/${threadSearchMatches.length})`}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={threadSearchMatches.length <= 1}
                              className="gap-1"
                              onClick={() =>
                                setThreadSearchMatchIdx((prev) => {
                                  const len = threadSearchMatches.length;
                                  return len === 0 ? prev : (prev - 1 + len) % len;
                                })
                              }
                            >
                              <ChevronUp className="h-4 w-4" aria-hidden /> Anterior
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={threadSearchMatches.length <= 1}
                              className="gap-1"
                              onClick={() =>
                                setThreadSearchMatchIdx((prev) => {
                                  const len = threadSearchMatches.length;
                                  return len === 0 ? prev : (prev + 1) % len;
                                })
                              }
                            >
                              Próxima <ChevronDown className="h-4 w-4" aria-hidden />
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0 rounded-xl border-slate-200/60 bg-white text-slate-500 shadow-sm hover:text-primary sm:h-10 sm:w-10"
                          title="Etiquetas"
                          aria-label="Etiquetas"
                        >
                          <Tag className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64" align="end">
                        <div className="space-y-3">
                          <p className="text-sm font-medium">Etiquetas</p>
                          {currentLabels.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {currentLabels.map((lbl) => (
                                <Badge key={lbl} variant="secondary" className="text-[10px]">
                                  {lbl}
                                </Badge>
                              ))}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <Input
                              placeholder="Nova etiqueta..."
                              value={newLabelInput}
                              onChange={(e) => setNewLabelInput(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddLabel())}
                              className="h-8 text-sm"
                            />
                            <Button
                              size="sm"
                              onClick={handleAddLabel}
                              disabled={!newLabelInput.trim() || addingLabel}
                            >
                              {addingLabel ? "..." : "Adicionar"}
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <div className="hidden items-center gap-0.5 md:flex sm:gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-9 w-9 rounded-xl", showDebug ? "text-primary" : "text-slate-500")}
                        onClick={() => setShowDebug(!showDebug)}
                        title={showDebug ? "Ocultar debug" : "Mostrar debug"}
                      >
                        <Bug className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-slate-500 hover:text-red-600"
                        onClick={handleClearConversation}
                        disabled={clearing}
                        title="Limpar histórico"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 rounded-xl border-slate-200/60 bg-white text-slate-500 shadow-sm hover:text-primary"
                        type="button"
                        disabled
                        title="Brevemente"
                      >
                        <MoreVertical className="h-5 w-5" />
                      </Button>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="inline-flex h-9 w-9 shrink-0 touch-manipulation rounded-xl border-slate-200/60 bg-white text-slate-600 shadow-sm md:hidden"
                          aria-label="Mais opções"
                          title="Mais opções"
                        >
                          <MoreVertical className="h-5 w-5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-52">
                        <DropdownMenuItem
                          onClick={() => setShowDebug(!showDebug)}
                          className="gap-2"
                        >
                          <Bug className="h-4 w-4" />
                          {showDebug ? "Ocultar debug" : "Mostrar debug"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => void handleClearConversation()}
                          disabled={clearing}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          Limpar histórico
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {showDebug && !hasDebugData && (
                  <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    Debug ativado, mas esta conversa ainda não possui rastros de debug.
                  </div>
                )}

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/55 px-2 py-3 [scrollbar-width:thin] dark:bg-muted/40 sm:px-4 md:px-6 md:py-5">
                  <ConversationMessagesView
                    messages={messages}
                    isLoading={msgsLoading}
                    contactAvatarUrl={selectedConv?.contact_avatar_url}
                    contactInitials={initials(selectedConv)}
                    agentName={selectedAgent?.name}
                    agentAvatarUrl={selectedAgent?.avatar_url}
                    showDebug={showDebug}
                    variant="boom-live"
                    messageSearchQuery={threadMessageSearch}
                    activeSearchMessageId={activeThreadSearchMessageId}
                  />
                  <div ref={messagesEndRef} className="h-2" />
                </div>

                <div className="shrink-0 border-t border-slate-100 bg-white px-2 pb-[max(14px,env(safe-area-inset-bottom))] pt-2 dark:border-border dark:bg-card sm:px-3 sm:pb-[max(14px,env(safe-area-inset-bottom))] sm:pt-3 md:px-5 md:pb-4 md:pt-4">
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const input = form.elements.namedItem("operator-msg") as HTMLTextAreaElement;
                      const text = input?.value?.trim();
                      if (!text || !selectedAgentId || !selectedConvIds.length) return;
                      input.disabled = true;
                      try {
                        await callAPI("/contacts/send-operator-message", {
                          body: { agent_id: selectedAgentId, conversation_id: selectedConvIds[0], content: text },
                        });
                        input.value = "";
                        queryClient.invalidateQueries({ queryKey: ["multi-conversation-messages"] });
                      } catch (err: unknown) {
                        toast.error("Erro ao enviar: " + ((err as Error)?.message || "erro desconhecido"));
                      } finally {
                        input.disabled = false;
                        input.focus();
                      }
                    }}
                    className="flex flex-col overflow-hidden rounded-xl border border-slate-200/60 bg-white shadow-sm dark:border-border dark:bg-muted/30"
                  >
                    <div className="hidden items-center gap-1 border-b border-slate-100 px-3 py-2 dark:border-border md:flex">
                      <button type="button" className="rounded-lg px-2 py-1.5 font-serif text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-muted" tabIndex={-1}>
                        B
                      </button>
                      <button type="button" className="rounded-lg px-2 py-1.5 font-serif text-sm italic text-slate-500 hover:bg-slate-100 dark:hover:bg-muted" tabIndex={-1}>
                        I
                      </button>
                      <div className="mx-2 h-4 w-px bg-slate-200 dark:bg-border" aria-hidden />
                      <button type="button" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-muted" tabIndex={-1} aria-label="Lista">
                        <List className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                    <Textarea
                      name="operator-msg"
                      className="min-h-[52px] resize-none border-0 bg-transparent px-3 py-2.5 text-[15px] text-[#0f172a] shadow-none outline-none placeholder:text-slate-400 focus-visible:ring-0 dark:text-foreground sm:min-h-[72px] sm:px-4 sm:py-3 md:min-h-[88px]"
                      placeholder="Digite sua mensagem ou use / para respostas rápidas..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
                        }
                      }}
                    />
                    <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-2 pb-1 pt-2 dark:border-border sm:gap-3 sm:px-3 sm:pb-px sm:pt-3">
                      <div className="flex gap-0.5">
                        <button
                          type="button"
                          className="rounded-full p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary dark:hover:bg-muted"
                          aria-label="Anexo"
                          tabIndex={-1}
                        >
                          <Paperclip className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          className="rounded-full p-2.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-primary dark:hover:bg-muted"
                          aria-label="Emoji"
                          tabIndex={-1}
                        >
                          <Smile className="h-5 w-5" />
                        </button>
                      </div>
                      <button
                        type="submit"
                        className="inline-flex min-h-[44px] shrink-0 touch-manipulation items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-primary/90 active:scale-[0.98] sm:px-6"
                      >
                        Enviar <Send className="h-[18px] w-[18px]" />
                      </button>
                    </div>
                  </form>
                </div>
              </>
            )}
          </section>

          {selectedContactKey && selectedConv && (
            <>
              <aside
                id="conversation-contact-panel"
                className={cn(
                  "max-h-none min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain rounded-xl border border-slate-200/60 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05)] dark:border-border dark:bg-card sm:rounded-2xl",
                  contactPanelCollapsed ? "hidden" : "hidden w-full xl:flex xl:w-[340px]",
                )}
              >
                <ConversationContactPanel
                  avatarUrl={selectedConv.contact_avatar_url ?? undefined}
                  avatarInitials={initials(selectedConv)}
                  name={displayName(selectedConv)}
                  subtitle={selectedEmail ?? getPhoneDisplay(selectedConv) ?? "Contato via canal digital"}
                  statusOpen={selectedConv.status === "open"}
                  tenantLabel={selectedTenantLabel}
                  phoneDisplay={getPhoneDisplay(selectedConv) ?? "—"}
                  channelLabel={getChannelLabel(String(selectedConv.channel ?? ""))}
                  assigneeDisplay={selectedConv.chatwoot_assignee_name ?? selectedAgent?.name ?? "—"}
                  labels={currentLabels}
                  onRequestAddLabel={() => setLabelPopoverOpen(true)}
                  profileCta={conversationProfileCta}
                />
              </aside>
              <Sheet open={contactSheetOpen} onOpenChange={setContactSheetOpen}>
                <SheetContent
                  side="right"
                  className="flex h-[100dvh] max-h-[100dvh] w-full flex-col gap-0 overflow-y-auto overscroll-contain border-l border-slate-200/70 bg-white p-0 pb-[max(12px,env(safe-area-inset-bottom))] pt-14 dark:border-border dark:bg-background sm:max-w-md md:h-full md:max-h-none"
                >
                  <SheetTitle className="sr-only">Contato — {displayName(selectedConv)}</SheetTitle>
                  <ConversationContactPanel
                    avatarUrl={selectedConv.contact_avatar_url ?? undefined}
                    avatarInitials={initials(selectedConv)}
                    name={displayName(selectedConv)}
                    subtitle={selectedEmail ?? getPhoneDisplay(selectedConv) ?? "Contato via canal digital"}
                    statusOpen={selectedConv.status === "open"}
                    tenantLabel={selectedTenantLabel}
                    phoneDisplay={getPhoneDisplay(selectedConv) ?? "—"}
                    channelLabel={getChannelLabel(String(selectedConv.channel ?? ""))}
                    assigneeDisplay={selectedConv.chatwoot_assignee_name ?? selectedAgent?.name ?? "—"}
                    labels={currentLabels}
                    onRequestAddLabel={() => {
                      setLabelPopoverOpen(true);
                      setContactSheetOpen(false);
                    }}
                    profileCta={conversationProfileCta}
                  />
                </SheetContent>
              </Sheet>
            </>
          )}
        </div>
      )}
    </div>
  );
}
