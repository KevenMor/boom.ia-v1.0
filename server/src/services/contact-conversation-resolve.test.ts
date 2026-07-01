import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { resolveContactConversation } from "./contact-conversation-resolve.js";

function mockSupabase(agents: unknown[], rpcResults: Record<string, unknown[]>) {
  return {
    from: () => ({
      select: () => ({
        eq: async () => ({ data: agents, error: null }),
      }),
    }),
    rpc: async (name: string, args: { p_agent_id?: string }) => {
      const key = args.p_agent_id ?? name;
      return { data: rpcResults[key] ?? [], error: null };
    },
  } as never;
}

describe("resolveContactConversation", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/contacts/search")) {
          return {
            ok: true,
            json: async () => ({ payload: [{ id: 77, phone_number: "+5511999887766" }] }),
          };
        }
        if (url.includes("/contacts/77/conversations")) {
          return {
            ok: true,
            json: async () => ({ payload: [{ id: 1234, last_activity_at: 999 }] }),
          };
        }
        return { ok: false, json: async () => ({}) };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prioriza conversa com chatwoot_conversation_id no Nexus", async () => {
    const supabase = mockSupabase(
      [
        {
          id: "agent-1",
          name: "Ana",
          avatar_url: null,
          tenant_id: "t1",
          config: { chatwoot_account_id: "9", chatwoot_url: "https://mega.atendai.app", chatwoot_api_token: "tok" },
        },
      ],
      {
        "agent-1": [
          { id: "c1", external_user_id: "5511999887766", chatwoot_conversation_id: 555 },
        ],
      },
    );

    const res = await resolveContactConversation(supabase, "t1", "+55 11 99988-7766", {
      preferredAccountId: "9",
    });

    expect(res?.chatwootConversationId).toBe(555);
    expect(res?.nexusConversationId).toBe("c1");
  });

  it("usa API Chatwoot quando Nexus não tem chatwoot_conversation_id", async () => {
    const supabase = mockSupabase(
      [
        {
          id: "agent-1",
          name: "Ana",
          avatar_url: null,
          tenant_id: "t1",
          config: { chatwoot_account_id: "9", chatwoot_url: "https://mega.atendai.app", chatwoot_api_token: "tok" },
        },
      ],
      {
        "agent-1": [{ id: "c1", external_user_id: "5511999887766", chatwoot_conversation_id: null }],
      },
    );

    const res = await resolveContactConversation(supabase, "t1", "11999887766", {
      preferredAccountId: "9",
    });

    expect(res?.chatwootConversationId).toBe(1234);
    expect(res?.chatwootAccountId).toBe("9");
  });
});
