export interface Calendar {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
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
  created_at: string;
  updated_at: string;
}
