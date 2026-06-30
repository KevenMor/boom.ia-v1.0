export interface ChatwootAppContact {
  id?: number;
  name?: string;
  email?: string | null;
  phone_number?: string | null;
  identifier?: string | null;
  thumbnail?: string | null;
}

export interface ChatwootAppConversation {
  id?: number;
  account_id?: number;
  meta?: { sender?: ChatwootAppContact };
}

export interface ChatwootAppContext {
  event?: string;
  data?: {
    conversation?: ChatwootAppConversation;
    contact?: ChatwootAppContact;
    currentAgent?: { id?: number; name?: string };
  };
}

export function parseChatwootAppContext(data: unknown): ChatwootAppContext | null {
  if (!data) return null;

  if (typeof data === "string") {
    try {
      return parseChatwootAppContext(JSON.parse(data));
    } catch {
      return null;
    }
  }

  if (typeof data !== "object") return null;
  const obj = data as Record<string, unknown>;

  if (obj.event === "appContext" && obj.data) {
    return obj as ChatwootAppContext;
  }

  if (obj.data && typeof obj.data === "object") {
    const inner = obj.data as Record<string, unknown>;
    if (inner.conversation || inner.contact) {
      return { data: inner as ChatwootAppContext["data"] };
    }
  }

  if (obj.conversation || obj.contact) {
    return { data: obj as ChatwootAppContext["data"] };
  }

  return null;
}

export function getContactFromAppContext(ctx: ChatwootAppContext | null): ChatwootAppContact | null {
  if (!ctx?.data) return null;
  return (
    ctx.data.contact ??
    ctx.data.conversation?.meta?.sender ??
    null
  );
}

export function contextConversationId(ctx: ChatwootAppContext | null): number | null {
  const id = ctx?.data?.conversation?.id;
  return id != null ? Number(id) : null;
}
