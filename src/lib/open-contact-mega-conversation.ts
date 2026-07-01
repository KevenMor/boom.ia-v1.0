import { callAPI } from "@/lib/api-client";
import { resolveMegaConversationNavigateUrl } from "@/lib/chatwoot-conversation-url";
import { openMegaChatwootConversation } from "@/lib/open-mega-chatwoot-conversation";
import type { ContactConversationPreview } from "@/hooks/useContacts";

export async function openContactMegaConversation(
  contactId: string,
  embedAccountId?: string | null,
): Promise<boolean> {
  const res = await callAPI<ContactConversationPreview>(
    `/crm-contacts/${contactId}/conversation-preview`,
    { method: "GET" },
  );
  const navUrl = resolveMegaConversationNavigateUrl(res ?? {}, embedAccountId ?? null);
  if (!navUrl) return false;
  return openMegaChatwootConversation(navUrl, { embedAccountId: embedAccountId ?? null });
}
