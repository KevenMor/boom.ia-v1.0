import { describe, expect, it } from "vitest";
import { stripBotSelfAssignment } from "./tool-executor.js";

describe("stripBotSelfAssignment", () => {
  it("remove assignee quando é o bot e deixa team", () => {
    const r = stripBotSelfAssignment({
      assigneeId: 15,
      teamId: 16,
      botAssigneeIds: [15],
    });
    expect(r).toEqual({ assigneeId: null, teamId: 16, blockedBotAssignee: true });
  });

  it("zera tudo quando só havia o bot", () => {
    const r = stripBotSelfAssignment({
      assigneeId: 15,
      teamId: null,
      botAssigneeIds: [15, 99],
    });
    expect(r.assigneeId).toBeNull();
    expect(r.teamId).toBeNull();
    expect(r.blockedBotAssignee).toBe(true);
  });

  it("mantém humano", () => {
    const r = stripBotSelfAssignment({
      assigneeId: 1,
      teamId: null,
      botAssigneeIds: [15],
    });
    expect(r).toEqual({ assigneeId: 1, teamId: null, blockedBotAssignee: false });
  });
});
