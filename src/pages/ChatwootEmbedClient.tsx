import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { parseEmbedCredentialsFromLocation, parseEmbedInitMessage, persistEmbedCredentials } from "@/lib/embed-credentials";
import {
  contextConversationId,
  getContactFromAppContext,
  parseChatwootAppContext,
  type ChatwootAppContext,
} from "@/lib/chatwoot-app-context";
import { extractPhoneDigitsFromChatwootContact } from "@/lib/crm-phone-match";
import { lookupEmbedCrmContact, promoteEmbedCrmContact } from "@/lib/embed-crm-api";
import { ContactProfileEmbed } from "@/components/embed/ContactProfileEmbed";
import type { Contact } from "@/types/database";

const EMBED_VERSION = "v1";

export default function ChatwootEmbedClient() {
  const initial = parseEmbedCredentialsFromLocation();
  const [embedKey, setEmbedKey] = useState(initial.key);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [appContext, setAppContext] = useState<ChatwootAppContext | null>(null);
  const [lookupState, setLookupState] = useState<"missing" | "lead" | "client" | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [error, setError] = useState<string | null>(() => {
    if (!initial.key) return "Chave embed ausente na URL (?key=...)";
    if (!initial.accountId) return "account_id ausente na URL (?account_id=...)";
    return null;
  });

  const applyCredentials = useCallback((key?: string, acct?: string) => {
    if (key) setEmbedKey(key);
    if (acct) setAccountId(acct);
    if (key || acct) persistEmbedCredentials({ key, accountId: acct });
  }, []);

  const chatwootContact = useMemo(() => getContactFromAppContext(appContext), [appContext]);
  const phoneDigits = useMemo(
    () => extractPhoneDigitsFromChatwootContact(chatwootContact),
    [chatwootContact],
  );

  const creds = useMemo(
    () => (embedKey && accountId ? { embedKey, accountId } : null),
    [embedKey, accountId],
  );

  const runLookup = useCallback(async () => {
    if (!creds || !phoneDigits) {
      setLookupState(null);
      setContact(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await lookupEmbedCrmContact(creds, phoneDigits);
      setLookupState(res.state);
      setContact(res.contact);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao consultar CRM");
      setLookupState(null);
      setContact(null);
    } finally {
      setLoading(false);
    }
  }, [creds, phoneDigits]);

  useEffect(() => {
    const syncFromUrl = () => {
      const c = parseEmbedCredentialsFromLocation();
      if (c.key || c.accountId) applyCredentials(c.key, c.accountId);
    };
    syncFromUrl();
    window.addEventListener("hashchange", syncFromUrl);

    const onMessage = (event: MessageEvent) => {
      const init = parseEmbedInitMessage(event.data);
      if (init) applyCredentials(init.key, init.accountId);

      const ctx = parseChatwootAppContext(event.data);
      if (ctx) setAppContext(ctx);
    };
    window.addEventListener("message", onMessage);

    if (window.parent !== window) {
      window.parent.postMessage("chatwoot-dashboard-app:fetch-info", "*");
    }

    return () => {
      window.removeEventListener("hashchange", syncFromUrl);
      window.removeEventListener("message", onMessage);
    };
  }, [applyCredentials]);

  useEffect(() => {
    void runLookup();
  }, [runLookup, contextConversationId(appContext)]);

  const handlePromote = async () => {
    if (!creds || !phoneDigits) return;
    setPromoting(true);
    setError(null);
    try {
      const res = await promoteEmbedCrmContact(creds, {
        phone: phoneDigits,
        name: chatwootContact?.name,
        email: chatwootContact?.email ?? undefined,
      });
      setContact(res.contact);
      setLookupState("client");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao promover lead");
    } finally {
      setPromoting(false);
    }
  };

  if (lookupState === "client" && contact?.id && creds) {
    return (
      <ContactProfileEmbed
        contactId={contact.id}
        embedKey={creds.embedKey}
        accountId={creds.accountId}
      />
    );
  }

  return (
    <div className="ds-chatwoot font-cw min-h-[100dvh] bg-[hsl(var(--cw-surface,0_0%_98%))] dark:bg-background p-4">
      <div className="max-w-md mx-auto space-y-4">
        <div>
          <h1 className="text-base font-semibold text-foreground">Boom IA — Cliente</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Conta Chatwoot {accountId || "—"} · embed {EMBED_VERSION}
          </p>
        </div>

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="pt-4 flex gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {!phoneDigits && !loading && (
          <Card>
            <CardContent className="pt-5 pb-5 text-sm text-muted-foreground">
              Abra uma conversa com telefone identificado no Chatwoot para vincular ao CRM.
            </CardContent>
          </Card>
        )}

        {phoneDigits && (
          <Card className="rounded-2xl">
            <CardContent className="pt-5 space-y-3">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Contato da conversa
                </p>
                <p className="font-medium text-foreground mt-1">
                  {chatwootContact?.name?.trim() || "Sem nome"}
                </p>
                <p className="text-sm text-muted-foreground">{phoneDigits}</p>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Consultando CRM…
                </div>
              ) : lookupState === "lead" || lookupState === "missing" ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    {lookupState === "lead"
                      ? "Este contato é um lead no CRM. Promova para acessar o cadastro completo."
                      : "Contato ainda não está no CRM como cliente."}
                  </p>
                  <Button className="w-full" onClick={handlePromote} disabled={promoting}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    {promoting ? "Convertendo…" : "Transformar em cliente"}
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
