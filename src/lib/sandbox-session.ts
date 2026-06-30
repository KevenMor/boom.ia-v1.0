const conversationKey = (agentId: string) => `sandbox_conversation_${agentId}`;
const snapshotKey = (agentId: string) => `sandbox_snapshot_${agentId}`;

/** Mensagem serializada para cache (memória + sessionStorage). */
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

function readSessionSnapshot(agentId: string): SandboxMemorySnapshot | null {
  try {
    const raw = sessionStorage.getItem(snapshotKey(agentId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SandboxMemorySnapshot;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionSnapshot(agentId: string, snapshot: SandboxMemorySnapshot): void {
  try {
    sessionStorage.setItem(snapshotKey(agentId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

/** Memória (remount na mesma aba) → sessionStorage (voltar ao site). */
export function readSandboxMemorySnapshot(agentId: string | undefined): SandboxMemorySnapshot | undefined {
  if (!agentId) return undefined;
  const mem = memoryByAgent.get(agentId);
  if (mem && mem.messages.length > 0) return mem;
  const stored = readSessionSnapshot(agentId);
  if (stored && stored.messages.length > 0) {
    memoryByAgent.set(agentId, stored);
    return stored;
  }
  return mem;
}

export function writeSandboxMemorySnapshot(agentId: string | undefined, snapshot: SandboxMemorySnapshot): void {
  if (!agentId) return;
  memoryByAgent.set(agentId, snapshot);
  writeSessionSnapshot(agentId, snapshot);
  writeSandboxConversationId(agentId, snapshot.conversationId);
}

export function clearSandboxSession(agentId: string | undefined): void {
  if (!agentId) return;
  memoryByAgent.delete(agentId);
  try {
    sessionStorage.removeItem(snapshotKey(agentId));
  } catch {
    /* ignore */
  }
  writeSandboxConversationId(agentId, null);
}
