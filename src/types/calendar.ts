export interface CalendarWorkingHours {
  mon?: { enabled: boolean; start: string; end: string };
  tue?: { enabled: boolean; start: string; end: string };
  wed?: { enabled: boolean; start: string; end: string };
  thu?: { enabled: boolean; start: string; end: string };
  fri?: { enabled: boolean; start: string; end: string };
  sat?: { enabled: boolean; start: string; end: string };
  sun?: { enabled: boolean; start: string; end: string };
}

export interface Calendar {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  /** Dono da agenda (corretor). NULL = compartilhada do tenant. */
  owner_user_id?: string | null;
  working_hours?: CalendarWorkingHours | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  calendar_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  color: string;
  metadata: Record<string, unknown> | null;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface EventProcedureMetadata {
  procedure_type?: string;
  professional_name?: string;
  duration_minutes?: number;
  patient_notes?: string;
  session_number?: number;
}
