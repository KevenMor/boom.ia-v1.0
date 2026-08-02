import { describe, expect, it } from "vitest";
import { buildKanbanColumns } from "@/components/kanban/KanbanBoard";
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

describe("buildKanbanColumns", () => {
  it("separa sem atendimento e agrupa por responsável", () => {
    const columns = buildKanbanColumns([
      conv({ id: "1", contact_name: "A", chatwoot_assignee_name: null, external_user_id: "5511111111111" }),
      conv({ id: "2", contact_name: "B", chatwoot_assignee_name: "Ana", external_user_id: "5511222222222" }),
      conv({ id: "3", contact_name: "C", chatwoot_assignee_name: "Ana", external_user_id: "5511333333333" }),
      conv({ id: "4", contact_name: "D", chatwoot_assignee_name: "João", external_user_id: "5511444444444" }),
    ]);

    expect(columns[0]?.title).toBe("Sem atendimento");
    expect(columns[0]?.cards).toHaveLength(1);
    expect(columns.map((c) => c.title)).toEqual(["Sem atendimento", "Ana", "João"]);
    expect(columns.find((c) => c.title === "Ana")?.cards).toHaveLength(2);
  });
});
