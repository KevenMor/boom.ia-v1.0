import { describe, expect, it } from "vitest";
import { buildKanbanColumns, classifyKanbanBucket } from "@/components/kanban/KanbanBoard";
import type { Conversation } from "@/hooks/useConversations";

function conv(partial: Partial<Conversation> & Pick<Conversation, "id">): Conversation {
  return {
    channel: "whatsapp",
    external_user_id: "5511999990000",
    contact_name: "Cliente",
    contact_avatar_url: null,
    status: "open",
    started_at: "2026-08-02T12:00:00.000Z",
    ended_at: null,
    message_count: 3,
    ...partial,
  };
}

describe("classifyKanbanBucket", () => {
  it("sem assignee e com mensagens → IA", () => {
    expect(classifyKanbanBucket(conv({ id: "1", chatwoot_assignee_name: null, message_count: 4 }), "Manu")).toBe(
      "ai",
    );
  });

  it("sem assignee e sem mensagens → sem atendimento", () => {
    expect(classifyKanbanBucket(conv({ id: "1", chatwoot_assignee_name: null, message_count: 0 }), "Manu")).toBe(
      "unassigned",
    );
  });

  it("assignee com nome da agente Boom → IA", () => {
    expect(
      classifyKanbanBucket(conv({ id: "1", chatwoot_assignee_name: "Manu", message_count: 2 }), "Manu"),
    ).toBe("ai");
  });

  it("assignee humano → human", () => {
    expect(
      classifyKanbanBucket(conv({ id: "1", chatwoot_assignee_name: "Gabriella", message_count: 2 }), "Manu"),
    ).toBe("human");
  });
});

describe("buildKanbanColumns", () => {
  it("separa sem atendimento, agente IA e responsáveis humanos", () => {
    const columns = buildKanbanColumns(
      [
        conv({
          id: "1",
          contact_name: "A",
          chatwoot_assignee_name: null,
          message_count: 0,
          external_user_id: "5511111111111",
        }),
        conv({
          id: "2",
          contact_name: "B",
          chatwoot_assignee_name: null,
          message_count: 5,
          external_user_id: "5511222222222",
        }),
        conv({
          id: "3",
          contact_name: "C",
          chatwoot_assignee_name: "Ana",
          external_user_id: "5511333333333",
        }),
        conv({
          id: "4",
          contact_name: "D",
          chatwoot_assignee_name: "Ana",
          external_user_id: "5511444444444",
        }),
        conv({
          id: "5",
          contact_name: "E",
          chatwoot_assignee_name: "João",
          external_user_id: "5511555555555",
        }),
      ],
      { agentName: "Manu" },
    );

    expect(columns.map((c) => c.title)).toEqual(["Sem atendimento", "Manu", "Ana", "João"]);
    expect(columns[0]?.cards).toHaveLength(1);
    expect(columns[1]?.variant).toBe("ai");
    expect(columns[1]?.cards).toHaveLength(1);
    expect(columns[1]?.subtitle).toBe("Agente IA");
    expect(columns.find((c) => c.title === "Ana")?.cards).toHaveLength(2);
  });
});
