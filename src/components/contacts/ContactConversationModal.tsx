import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink, MessageSquare } from "lucide-react";
import { useMemo } from "react";
import { useContactConversationPreview } from "@/hooks/useContacts";
import { openMegaChatwootConversation, isInsideParentEmbed } from "@/lib/open-mega-chatwoot-conversation";
import { ConversationMessagesView } from "@/components/chat/ConversationMessagesView";
import { shouldShowChatMessage, dedupeAndSortConversationMessages } from "@/lib/chatMessageDisplay";
import type { Contact } from "@/types/database";

interface ContactConversationModalProps {
  contact: Contact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContactConversationModal({ contact, open, onOpenChange }: ContactConversationModalProps) {
  const { data, isLoading, error } = useContactConversationPreview(contact?.id ?? null);

  const messages = data?.messages ?? [];
  const chatwootUrl = data?.chatwoot_url ?? null;
  const agentName = data?.agent_name ?? null;

  const normalizedMessages = useMemo(() => dedupeAndSortConversationMessages(messages), [messages]);
  const visibleCount = useMemo(
    () => normalizedMessages.filter((m) => shouldShowChatMessage(m, false)).length,
    [normalizedMessages]
  );
  const initials = (contact?.name || "?").trim().slice(0, 2).toUpperCase() || "?";

  const showMessageList = !error && (isLoading || visibleCount > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="shrink-0 px-4 py-3 border-b border-border">
          <DialogTitle className="text-base font-semibold">{contact?.name ?? "Contato"}</DialogTitle>
          {agentName && (
            <p className="text-xs text-muted-foreground mt-0.5">Conversa via agente: {agentName}</p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {error && (
            <p className="text-sm text-destructive px-4 py-4">
              Erro ao carregar conversa: {(error as Error).message}
            </p>
          )}

          {!error && !isLoading && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-center px-4">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground/50" />
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

          {!error && !isLoading && messages.length > 0 && visibleCount === 0 && (
            <div className={cn("px-4 py-8 text-center text-sm text-muted-foreground")}>
              <p>Há histórico salvo, mas só com mensagens internas do sistema (ocultas nesta visualização).</p>
              <p className="text-xs mt-2">Use o Chat ao Vivo ou o Chatwoot para detalhes operacionais.</p>
            </div>
          )}

          {showMessageList && (
            <ConversationMessagesView
              messages={messages}
              isLoading={isLoading}
              contactAvatarUrl={null}
              contactInitials={initials}
              agentName={agentName}
              agentAvatarUrl={data?.agent_avatar_url ?? null}
              showDebug={false}
            />
          )}
        </div>

        <div className="shrink-0 border-t border-border px-4 py-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              if (!chatwootUrl) return;
              if (!isInsideParentEmbed()) {
                window.open(chatwootUrl, "_blank", "noopener,noreferrer");
                return;
              }
              openMegaChatwootConversation(chatwootUrl);
            }}
            disabled={!chatwootUrl}
            title={chatwootUrl ? (isInsideParentEmbed() ? "Abrir conversa no Mega" : "Abrir conversa no Chatwoot") : "Conversa não encontrada"}
          >
            <ExternalLink className="h-4 w-4" />
            {isInsideParentEmbed() ? "Abrir conversa no Mega" : "Abrir no Chatwoot"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
