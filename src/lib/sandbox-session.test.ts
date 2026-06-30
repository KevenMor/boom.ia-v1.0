import { describe, expect, it, beforeEach } from "vitest";
import {
  readSandboxConversationId,
  readSandboxInputDraft,
  writeSandboxConversationId,
  writeSandboxInputDraft,
} from "./sandbox-session";

describe("sandbox-session", () => {
  beforeEach(() => {
    sessionStorage.clear();
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

  it("persiste rascunho do input", () => {
    writeSandboxInputDraft("agent-a", "olá");
    expect(readSandboxInputDraft("agent-a")).toBe("olá");
    writeSandboxInputDraft("agent-a", "   ");
    expect(readSandboxInputDraft("agent-a")).toBe("");
  });
});
