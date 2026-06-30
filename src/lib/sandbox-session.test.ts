import { describe, expect, it, beforeEach } from "vitest";
import {
  clearSandboxSession,
  readSandboxConversationId,
  readSandboxMemorySnapshot,
  writeSandboxConversationId,
  writeSandboxMemorySnapshot,
} from "./sandbox-session";

describe("sandbox-session", () => {
  beforeEach(() => {
    sessionStorage.clear();
    clearSandboxSession("agent-a");
    clearSandboxSession("agent-b");
  });

  it("persiste e lê conversationId por agente", () => {
    writeSandboxConversationId("agent-a", "conv-1");
    expect(readSandboxConversationId("agent-a")).toBe("conv-1");
    expect(readSandboxConversationId("agent-b")).toBeNull();
  });

  it("remove conversationId ao gravar null", () => {
    writeSandboxConversationId("agent-a", "conv-1");
    writeSandboxConversationId("agent-a", null);
    expect(readSandboxConversationId("agent-a")).toBeNull();
  });

  it("cache em memória sobrevive por agentId", () => {
    writeSandboxMemorySnapshot("agent-a", {
      conversationId: "conv-1",
      messages: [{ role: "user", content: "oi" }],
    });
    const snap = readSandboxMemorySnapshot("agent-a");
    expect(snap?.conversationId).toBe("conv-1");
    expect(snap?.messages).toHaveLength(1);
    expect(readSandboxMemorySnapshot("agent-b")).toBeUndefined();
  });

  it("clearSandboxSession limpa memória e sessionStorage", () => {
    writeSandboxConversationId("agent-a", "conv-1");
    writeSandboxMemorySnapshot("agent-a", {
      conversationId: "conv-1",
      messages: [{ role: "user", content: "x" }],
    });
    clearSandboxSession("agent-a");
    expect(readSandboxConversationId("agent-a")).toBeNull();
    expect(readSandboxMemorySnapshot("agent-a")).toBeUndefined();
  });
});
