const conversationKey = (agentId: string) => `sandbox_conversation_${agentId}`;
const inputKey = (agentId: string) => `sandbox_input_draft_${agentId}`;

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

export function readSandboxInputDraft(agentId: string | undefined): string {
  if (!agentId) return "";
  try {
    return sessionStorage.getItem(inputKey(agentId)) ?? "";
  } catch {
    return "";
  }
}

export function writeSandboxInputDraft(agentId: string | undefined, value: string): void {
  if (!agentId) return;
  try {
    const trimmed = value.trim();
    if (trimmed) sessionStorage.setItem(inputKey(agentId), value);
    else sessionStorage.removeItem(inputKey(agentId));
  } catch {
    /* ignore */
  }
}
