import type { Calendar } from "@/types/calendar";

/** Usuário comum (não admin) só vê agendas das quais é dono. */
export function isCalendarScopedUser(opts: {
  isSuperAdmin: boolean;
  isTenantAdmin: boolean;
}): boolean {
  return !opts.isSuperAdmin && !opts.isTenantAdmin;
}

/**
 * Filtra calendários conforme papel: admin vê todos; corretor só os seus.
 * Corretor sem agenda própria (contas anteriores ao ownership) cai nas
 * compartilhadas do tenant — sem isso a página ficaria vazia e inutilizável.
 */
export function filterCalendarsForUser(
  calendars: Calendar[],
  opts: { userId: string | null | undefined; scoped: boolean }
): Calendar[] {
  if (!opts.scoped) return calendars;
  const uid = opts.userId ?? "";
  const owned = uid ? calendars.filter((c) => c.owner_user_id === uid) : [];
  if (owned.length > 0) return owned;
  return calendars.filter((c) => !c.owner_user_id);
}

/** Agenda pessoal do usuário no tenant (primeira match). */
export function findPersonalCalendar(
  calendars: Calendar[] | null | undefined,
  userId: string | null | undefined
): Calendar | null {
  if (!calendars?.length || !userId) return null;
  return calendars.find((c) => c.owner_user_id === userId) ?? null;
}

export const APPOINTMENT_INTEREST_OPTIONS = [
  "Visita ao empreendimento",
  "Interesse em lote",
  "Proposta / valores",
  "Financiamento",
  "Outro",
] as const;

export type AppointmentEventMetadata = {
  client_name?: string;
  client_phone?: string;
  interest?: string;
  assigned_user_id?: string;
};

export function buildAppointmentMetadata(fields: {
  clientName: string;
  clientPhone: string;
  interest: string;
  assignedUserId: string;
  previous?: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  const base: Record<string, unknown> = { ...(fields.previous ?? {}) };
  const client_name = fields.clientName.trim();
  const client_phone = fields.clientPhone.trim();
  const interest = fields.interest.trim();
  const assigned_user_id = fields.assignedUserId.trim();

  if (client_name) base.client_name = client_name;
  else delete base.client_name;

  if (client_phone) base.client_phone = client_phone;
  else delete base.client_phone;

  if (interest) base.interest = interest;
  else delete base.interest;

  if (assigned_user_id) base.assigned_user_id = assigned_user_id;
  else delete base.assigned_user_id;

  return Object.keys(base).length > 0 ? base : null;
}
