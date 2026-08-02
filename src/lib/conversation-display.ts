/** Helpers compartilhados entre Chat ao Vivo e Kanban. */

export function conversationPhoneKeyDigits(externalUserId: string | null | undefined): string | null {
  const d = String(externalUserId ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  if (d.startsWith("55") && d.length >= 12) return d.slice(-11);
  return d;
}

function isNameRedundantWithPhone(
  name: string | null | undefined,
  externalUserId: string | null | undefined,
): boolean {
  const n = (name || "").trim();
  if (!n) return true;
  const nameDigits = n.replace(/\D/g, "");
  const extDigits = String(externalUserId ?? "").replace(/\D/g, "");
  if (nameDigits && extDigits && nameDigits === extDigits) return true;
  const key = conversationPhoneKeyDigits(externalUserId);
  if (nameDigits.length >= 10) {
    if (key && (nameDigits === key || nameDigits.slice(-11) === key)) return true;
    if (key && extDigits.length >= 12 && nameDigits.length >= 11 && nameDigits === extDigits.slice(-11)) {
      return true;
    }
  }
  return false;
}

export function resolveConversationContactKey(conv: {
  id: string;
  contact_name?: string | null;
  external_user_id?: string | null;
  chatwoot_conversation_id?: number | null;
}): string {
  const phoneKey = conversationPhoneKeyDigits(conv.external_user_id);
  if (phoneKey) return `phone:${phoneKey}`;

  let key = conv.contact_name || conv.external_user_id || conv.id;
  if (key.startsWith("{") || key.startsWith("[")) {
    try {
      const parsed = JSON.parse(key) as {
        name?: string;
        phone?: string;
        phone_number?: string;
        identifier?: string;
        email?: string;
      };
      const parsedPhoneKey = conversationPhoneKeyDigits(
        parsed?.phone || parsed?.phone_number || parsed?.identifier,
      );
      if (parsedPhoneKey) return `phone:${parsedPhoneKey}`;
      key = parsed?.name || parsed?.phone || parsed?.email || conv.id;
    } catch {
      key = conv.id;
    }
  }
  return key;
}

export function displayNameFromConversation(conv: {
  contact_name?: string | null;
  crm_display_name?: string | null;
  external_user_id?: string | null;
} | null | undefined): string {
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
      if (parsedName && !isNameRedundantWithPhone(parsedName, String(parsedPhone || ext))) {
        return parsedName;
      }
      return (parsed?.phone || parsed?.phone_number || parsed?.email || "Anônimo") as string;
    } catch {
      /* ignore */
    }
  }
  return ext || "Anônimo";
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  return (name.slice(0, 2) || "?").toUpperCase();
}
