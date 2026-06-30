const conversationKey = (agentId: string) => `sandbox_conversation_${agentId}`;

/** Mensagem serializada para cache em memória (sobrevive a remount do React). */
export type SandboxMemoryMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  metadata?: { type?: string; video_url?: string };
};

export type SandboxMemorySnapshot = {
  conversationId: string | null;
  messages: SandboxMemoryMessage[];
};

const memoryByAgent = new Map<string, SandboxMemorySnapshot>();

export function readSandboxConversationId(agentId: string | undefined): string | null {
  if (!agentId) return null;
  try {
    return sessionStorage.getItem(conversationKey(agentId));
  } catch {
    return null;
  }
}

export function writeSandboxConversationId(agentId: string | undefined, conversationId: string | null): void {
  if (!agentId) return;
  try {
    if (conversationId) sessionStorage.setItem(conversationKey(agentId), conversationId);
    else sessionStorage.removeItem(conversationKey(agentId));
  } catch {
    /* quota / private mode */
  }
}

export function readSandboxMemorySnapshot(agentId: string | undefined): SandboxMemorySnapshot | undefined {
  if (!agentId) return undefined;
  return memoryByAgent.get(agentId);
}

export function writeSandboxMemorySnapshot(agentId: string | undefined, snapshot: SandboxMemorySnapshot): void {
  if (!agentId) return;
  memoryByAgent.set(agentId, snapshot);
}

export function clearSandboxSession(agentId: string | undefined): void {
  if (!agentId) return;
  memoryByAgent.delete(agentId);
  writeSandboxConversationId(agentId, null);
}
