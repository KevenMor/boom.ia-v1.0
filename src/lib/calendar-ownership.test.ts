import { describe, expect, it } from "vitest";
import {
  buildAppointmentMetadata,
  filterCalendarsForUser,
  findPersonalCalendar,
  isCalendarScopedUser,
} from "./calendar-ownership";
import type { Calendar } from "@/types/calendar";

const cal = (partial: Partial<Calendar> & { id: string }): Calendar => ({
  id: partial.id,
  tenant_id: partial.tenant_id ?? "t1",
  name: partial.name ?? partial.id,
  description: null,
  color: "primary",
  is_active: true,
  created_at: "",
  updated_at: "",
  owner_user_id: partial.owner_user_id ?? null,
});

describe("isCalendarScopedUser", () => {
  it("admin e superadmin não são escopados", () => {
    expect(isCalendarScopedUser({ isSuperAdmin: true, isTenantAdmin: false })).toBe(false);
    expect(isCalendarScopedUser({ isSuperAdmin: false, isTenantAdmin: true })).toBe(false);
  });

  it("tenant_user é escopado", () => {
    expect(isCalendarScopedUser({ isSuperAdmin: false, isTenantAdmin: false })).toBe(true);
  });
});

describe("filterCalendarsForUser", () => {
  const list = [
    cal({ id: "a", owner_user_id: "u1" }),
    cal({ id: "b", owner_user_id: "u2" }),
    cal({ id: "c", owner_user_id: null }),
  ];

  it("admin vê todas", () => {
    expect(filterCalendarsForUser(list, { userId: "u1", scoped: false })).toHaveLength(3);
  });

  it("corretor vê só a própria", () => {
    const filtered = filterCalendarsForUser(list, { userId: "u1", scoped: true });
    expect(filtered.map((c) => c.id)).toEqual(["a"]);
  });

  it("corretor sem agenda própria cai nas compartilhadas", () => {
    const filtered = filterCalendarsForUser(list, { userId: "u9", scoped: true });
    expect(filtered.map((c) => c.id)).toEqual(["c"]);
  });

  it("sem userId escopado mostra só compartilhadas", () => {
    const filtered = filterCalendarsForUser(list, { userId: null, scoped: true });
    expect(filtered.map((c) => c.id)).toEqual(["c"]);
  });
});

describe("findPersonalCalendar", () => {
  it("encontra agenda do usuário", () => {
    const list = [cal({ id: "a", owner_user_id: "u1" }), cal({ id: "b", owner_user_id: "u2" })];
    expect(findPersonalCalendar(list, "u2")?.id).toBe("b");
  });
});

describe("buildAppointmentMetadata", () => {
  it("monta metadata e remove vazios", () => {
    expect(
      buildAppointmentMetadata({
        clientName: "Ana",
        clientPhone: "11999999999",
        interest: "Visita",
        assignedUserId: "u1",
      })
    ).toEqual({
      client_name: "Ana",
      client_phone: "11999999999",
      interest: "Visita",
      assigned_user_id: "u1",
    });
  });

  it("retorna null se tudo vazio", () => {
    expect(
      buildAppointmentMetadata({
        clientName: "",
        clientPhone: "",
        interest: "",
        assignedUserId: "",
      })
    ).toBeNull();
  });
});
