import { useState, useEffect, useRef, useMemo } from "react";
import { MessageSquare, Bot, ArrowLeft, Search, Send, Paperclip, Smile, Bug, Trash2, Users, UserPlus, Tag, UserCircle } from "lucide-react";
import { ConversationMessagesView } from "@/components/chat/ConversationMessagesView";
import { callAPI } from "@/lib/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAgents } from "@/hooks/useAgents";
import { useTenants } from "@/hooks/useTenants";
import { useTenantContext } from "@/contexts/TenantContext";
import { useConversations, useMultiConversationMessages } from "@/hooks/useConversations";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["#019FA2", "#0d9488", "#0ea5e9", "#64748b", "#14b8a6", "#475569"];

function getAvatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h << 5) - h + name.charCodeAt(i);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function Conversations() {
  const { selectedTenantId } = useTenantContext();
  const { data: agents, isLoading: agentsLoading } = useAgents(selectedTenantId ?? undefined);
  const { data: tenants } = useTenants();
  const tenantNameById = useMemo(
    () => new Map((tenants ?? []).map((t) => [t.id, t.name])),
    [tenants]
  );
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedContactKey, setSelectedContactKey] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [labelFilter, setLabelFilter] = useState<string | null>(null);
  const [assigneeFilter, setAssigneeFilter] = useState<string | null>(null);
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
  const queryClient = useQueryClient();

  // Ao trocar de tenant, limpar seleção para refletir a nova empresa
  useEffect(() => {
    setSelectedAgentId(null);
    setSelectedContactKey(null);
    setAssigneeFilter(null);
    setLabelFilter(null);
  }, [selectedTenantId]);

  const { data: conversations, isLoading: convsLoading } = useConversations(selectedAgentId);

  const agentName = agents?.find((a) => a.id === selectedAgentId)?.name ?? null;

  const { deduplicatedConversations, contactConvIds, contactLabelsMap, contactAssigneesMap, allLabels, allAssignees } = useMemo(() => {
    if (!conversations) return {
      deduplicatedConversations: [] as typeof conversations,
      contactConvIds: new Map<string, string[]>(),
      contactLabelsMap: new Map<string, Set<string>>(),
      contactAssigneesMap: new Map<string, Set<string>>(),
      allLabels: [] as string[],
      allAssignees: [] as string[],
    };
    const contactMap = new Map<string, (typeof conversations)[number]>();
    const idsMap = new Map<string, string[]>();
    const labelsMap = new Map<string, Set<string>>();
    const assigneesMap = new Map<string, Set<string>>();
    const labelsSet = new Set<string>();
    const assigneesSet = new Set<string>();

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

      const assigneeName = conv.chatwoot_assignee_name?.trim();
      if (assigneeName) {
        assigneesSet.add(assigneeName);
        if (!assigneesMap.has(contactKey)) assigneesMap.set(contactKey, new Set());
        assigneesMap.get(contactKey)!.add(assigneeName);
      }
      // Conversas sem atendente humano (com a agente IA) também aparecem no filtro pelo nome da agente
      if (!assigneeName && agentName) {
        assigneesSet.add(agentName);
        if (!assigneesMap.has(contactKey)) assigneesMap.set(contactKey, new Set());
        assigneesMap.get(contactKey)!.add(agentName);
      }

      if (!contactMap.has(contactKey)) {
        contactMap.set(contactKey, conv);
      } else {
        const existing = contactMap.get(contactKey)!;
        contactMap.set(contactKey, {
          ...existing,
          message_count: existing.message_count + conv.message_count,
          chatwoot_assignee_name: conv.chatwoot_assignee_name || existing.chatwoot_assignee_name,
        });
      }
    }
    return {
      deduplicatedConversations: Array.from(contactMap.values()),
      contactConvIds: idsMap,
      contactLabelsMap: labelsMap,
      contactAssigneesMap: assigneesMap,
      allLabels: Array.from(labelsSet).sort(),
      allAssignees: Array.from(assigneesSet).sort(),
    };
  }, [conversations, agentName]);

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

  const { data: messages, isLoading: msgsLoading } = useMultiConversationMessages(selectedAgentId, selectedConvIds);

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
    if (labelFilter) {
      const key = getContactKeyForConv(c);
      if (!contactLabelsMap.get(key)?.has(labelFilter)) return false;
    }
    if (assigneeFilter) {
      const key = getContactKeyForConv(c);
      if (!contactAssigneesMap.get(key)?.has(assigneeFilter)) return false;
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
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

  const displayName = (conv: any) => {
    if (conv?.contact_name) return conv.contact_name;
    const ext = conv?.external_user_id;
    if (ext && (ext.startsWith("{") || ext.startsWith("["))) {
      try {
        const parsed = JSON.parse(ext);
        return parsed?.name || parsed?.phone || parsed?.email || "Anônimo";
      } catch { /* ignore */ }
    }
    return ext || "Anônimo";
  };
  const initials = (conv: any) => (displayName(conv)).slice(0, 2).toUpperCase();
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

  const getChannelLabel = (channel: string) => {
    if (channel?.toLowerCase().includes("whatsapp")) return "WhatsApp";
    if (channel === "webhook") return "WhatsApp";
    if (channel?.toLowerCase().includes("web")) return "Web";
    return channel || "Chat";
  };

  const getTimestamp = (conv: any) => {
    try {
      return formatDistanceToNow(new Date(conv.started_at), { addSuffix: false, locale: ptBR });
    } catch {
      return "";
    }
  };

  return (
    <div className="h-full overflow-hidden">
      {!selectedAgentId ? (
        /* ─── Agent selection ─── */
        <div className="space-y-6 p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Chat ao Vivo</h1>
            <p className="text-sm text-muted-foreground mt-1">Selecione um agente para ver as conversas:</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agentsLoading && Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-muted/50 animate-pulse" />
            ))}
            {agents?.map((agent) => {
              const isActive = agent.status === "active";
              return (
                <button
                  key={agent.id}
                  onClick={() => { setSelectedAgentId(agent.id); setSelectedContactKey(null); }}
                  className="group flex items-center gap-3 rounded-2xl border border-border/50 bg-card p-4 text-left transition-all duration-200 hover:border-primary/30 hover:shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.12)] hover:-translate-y-0.5"
                >
                  <div className="relative shrink-0">
                    {agent.avatar_url ? (
                      <img src={agent.avatar_url} alt={agent.name} className="h-11 w-11 rounded-xl object-cover ring-2 ring-border/30" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                        <Bot className="h-5 w-5 text-primary" />
                      </div>
                    )}
                    <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${isActive ? "bg-success" : "bg-muted-foreground/40"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{agent.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {(agent.tenants as { name?: string } | null)?.name
                        ?? tenantNameById.get(agent.tenant_id)
                        ?? "Sem tenant"}
                    </p>
                  </div>
                  <MessageSquare className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                </button>
              );
            })}
            {!agentsLoading && (!agents || agents.length === 0) && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
                  <Bot className="h-8 w-8 text-muted-foreground/40" />
                </div>
                <p className="text-sm text-muted-foreground">Nenhum agente configurado</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ─── CRM Layout: Contact List + Chat (estilo ChatApp) ─── */
        <div className="chat-app-style flex h-full overflow-hidden">
          {/* ─── Left: Contact List ─── */}
          <div
            className={cn(
              "chat-sidebar w-full flex-col md:w-[300px] lg:w-[320px] md:shrink-0 overflow-hidden flex",
              selectedContactKey ? "hidden md:flex" : "flex"
            )}
          >
            {/* Search */}
            <div className="shrink-0 p-3.5 pb-2 border-b border-border">
              <div className="flex items-center rounded-lg overflow-hidden border border-border bg-muted/30">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar conversa..."
                  className="flex-1 border-0 bg-transparent px-3 py-2 text-xs outline-none focus:ring-0 text-foreground placeholder:text-muted-foreground"
                />
                <button type="button" className="p-2 text-primary bg-primary/10 hover:bg-primary/15 transition-colors">
                  <Search className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 px-3 py-2.5 border-b border-border">
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-md text-[11px] font-semibold bg-primary text-primary-foreground"
              >
                Recentes
                {filteredConversations.length > 0 && (
                  <span className="min-w-4 h-4 flex items-center justify-center rounded-full bg-white/30 text-[9px]">
                    {Math.min(filteredConversations.length, 99)}
                  </span>
                )}
              </button>
              {allLabels.length > 0 && (
                <Select value={labelFilter ?? "all"} onValueChange={(v) => setLabelFilter(v === "all" ? null : v)}>
                  <SelectTrigger className="flex-1 h-8 text-[11px] font-semibold border-0 bg-primary/10 text-primary gap-1">
                    <Tag className="h-3 w-3 shrink-0" />
                    <SelectValue placeholder="Etiquetas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {allLabels.map((lbl) => (
                      <SelectItem key={lbl} value={lbl}>{lbl}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {allAssignees.length > 0 && (
                <Select value={assigneeFilter ?? "all"} onValueChange={(v) => setAssigneeFilter(v === "all" ? null : v)}>
                  <SelectTrigger className="flex-1 h-8 text-[11px] font-semibold border-0 bg-primary/10 text-primary gap-1">
                    <UserCircle className="h-3 w-3 shrink-0" />
                    <SelectValue placeholder="Atendente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {allAssignees.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Contact list header */}
            <div className="shrink-0 border-b border-border">
              <div className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold tracking-tight">Contatos</h2>
                  {filteredConversations.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                      {filteredConversations.length}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Dialog open={newContactOpen} onOpenChange={setNewContactOpen}>
                    <DialogTrigger asChild>
                      <button className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                        <UserPlus className="h-3.5 w-3.5" />
                        Novo
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
                  <button
                    onClick={() => { setSelectedAgentId(null); setSelectedContactKey(null); }}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <ArrowLeft className="h-3 w-3" />
                    Voltar
                  </button>
                </div>
              </div>

              {/* Agent info bar */}
              {selectedAgent && (
                <div className="flex items-center gap-2.5 border-t border-border bg-muted/30 px-4 py-2">
                  {selectedAgent.avatar_url ? (
                    <img src={selectedAgent.avatar_url} alt="" className="h-6 w-6 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10">
                      <Bot className="h-3.5 w-3.5 text-primary" />
                    </div>
                  )}
                  <span className="text-xs font-medium text-foreground truncate">{selectedAgent.name}</span>
                  <span className={cn("ml-auto h-2 w-2 rounded-full shrink-0", selectedAgent.status === "active" ? "bg-success" : "bg-muted-foreground/40")} />
                </div>
              )}

            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto py-1.5">
              <div className="px-4 py-2 pt-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                CONVERSAS
              </div>
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

              {!convsLoading && filteredConversations?.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                  <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-3" />
                  <p className="text-xs text-muted-foreground">Nenhuma conversa encontrada</p>
                </div>
              )}

              <div className="space-y-0.5">
                {filteredConversations?.map((conv) => {
                  const isSelected = selectedContactKey === getContactKey(conv);
                  const phone = getPhoneDisplay(conv);
                  const channel = getChannelLabel(conv.channel);
                  const timestamp = getTimestamp(conv);
                  const name = displayName(conv);
                  const convCount = contactConvIds.get(getContactKey(conv))?.length ?? 1;

                  const avatarColor = getAvatarColor(name);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => setSelectedContactKey(getContactKey(conv))}
                      className={cn(
                        "chat-contact-item flex w-full items-center gap-2.5 px-4 py-2.5 mx-2 rounded-lg text-start border-l-[3px]",
                        isSelected ? "active border-l-primary" : "border-l-transparent"
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

                      {/* Contact info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[13px] truncate max-w-[130px] font-semibold text-foreground">
                            {name}
                          </p>
                          <span className="text-[10px] text-muted-foreground shrink-0">{timestamp}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                            {conv.message_count} mensagens
                            {channel === "WhatsApp" && " • WhatsApp"}
                          </span>
                          {(conv.labels ?? []).filter((l) => /^leads/i.test(l)).length > 0 && (
                            <span className="text-primary text-xs">✓✓</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ─── Right: Chat Panel ─── */}
          <div
            className={cn(
              "flex-1 flex-col min-w-0 overflow-hidden flex",
              !selectedContactKey ? "hidden md:flex" : "flex"
            )}
          >
            {!selectedContactKey ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="h-20 w-20 rounded-full bg-muted/30 flex items-center justify-center mx-auto">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Selecione um contato</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Escolha um contato na lista para visualizar as mensagens
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-3 bg-card">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 md:hidden shrink-0"
                    onClick={() => setSelectedContactKey(null)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <div className="relative shrink-0">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-sm"
                      style={{
                        background: `linear-gradient(135deg, ${getAvatarColor(displayName(selectedConv))}dd, ${getAvatarColor(displayName(selectedConv))})`,
                      }}
                    >
                      {selectedConv?.contact_avatar_url ? (
                        <img src={selectedConv.contact_avatar_url} alt="" className="h-full w-full rounded-full object-cover" />
                      ) : (
                        initials(selectedConv)
                      )}
                    </div>
                    {selectedConv?.status === "open" && (
                      <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-success" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{displayName(selectedConv)}</p>
                    <p className={cn(
                      "text-[11px]",
                      selectedConv?.status === "open" ? "text-success" : "text-muted-foreground"
                    )}>
                      {selectedConv?.status === "open" ? "online" : "offline"}
                      {getPhoneDisplay(selectedConv) ? ` • ${getPhoneDisplay(selectedConv)}` : ""}
                      {selectedConv?.chatwoot_assignee_name ? ` • Atendente: ${selectedConv.chatwoot_assignee_name}` : ""}
                      {!getPhoneDisplay(selectedConv) && !selectedConv?.chatwoot_assignee_name ? " • —" : ""}
                    </p>
                    {currentLabels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {currentLabels.map((lbl) => (
                          <Badge key={lbl} variant="secondary" className="text-[10px] font-medium px-1.5 py-0">
                            {lbl}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Popover open={labelPopoverOpen} onOpenChange={setLabelPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-primary"
                          title="Adicionar etiqueta"
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn("h-8 w-8", showDebug ? "text-primary" : "text-muted-foreground")}
                      onClick={() => setShowDebug(!showDebug)}
                      title={showDebug ? "Ocultar debug" : "Mostrar debug"}
                    >
                      <Bug className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={handleClearConversation}
                      disabled={clearing}
                      title="Limpar histórico"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {showDebug && !hasDebugData && (
                  <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                    Debug ativado, mas esta conversa ainda não possui rastros de debug.
                  </div>
                )}

                {/* Messages area */}
                <div className="chat-messages-area flex-1 overflow-y-auto min-h-0 px-5 py-5">
                  <ConversationMessagesView
                    messages={messages}
                    isLoading={msgsLoading}
                    contactAvatarUrl={selectedConv?.contact_avatar_url}
                    contactInitials={initials(selectedConv)}
                    agentName={selectedAgent?.name}
                    agentAvatarUrl={selectedAgent?.avatar_url}
                    showDebug={showDebug}
                    variant="chat-app"
                  />
                  <div ref={messagesEndRef} className="h-0" />
                </div>

                {/* Footer — send message */}
                <div className="chat-input-area shrink-0 px-5 py-3">
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
                      } catch (err: any) {
                        toast.error("Erro ao enviar: " + (err?.message || "erro desconhecido"));
                      } finally {
                        input.disabled = false;
                        input.focus();
                      }
                    }}
                    className="flex items-center gap-2.5"
                  >
                    <button type="button" className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                      <Paperclip className="h-4 w-4" />
                    </button>
                    <button type="button" className="h-9 w-9 rounded-lg flex items-center justify-center bg-muted text-muted-foreground hover:bg-muted/80 transition-colors">
                      <Smile className="h-4 w-4" />
                    </button>
                    <input
                      name="operator-msg"
                      className="flex-1 border border-border rounded-xl px-4 py-2.5 text-[13px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-muted/50 text-foreground placeholder:text-muted-foreground font-[inherit]"
                      placeholder="Digite uma mensagem..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          (e.currentTarget.form as HTMLFormElement)?.requestSubmit();
                        }
                      }}
                    />
                    <button
                      type="submit"
                      className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary text-white hover:opacity-95 transition-all shadow-[0_4px_12px_hsl(var(--primary)/0.33)] hover:scale-105"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
