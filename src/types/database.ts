export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  db_host: string | null;
  db_port: number;
  db_name: string | null;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Provider {
  id: string;
  name: string;
  base_url: string | null;
  api_key_encrypted: string | null;
  model_default: string | null;
  status: string;
  created_at: string;
}

export interface Agent {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  provider_id: string | null;
  model: string | null;
  system_prompt: string | null;
  temperature: number;
  status: string;
  config: Record<string, unknown>;
  webhook_token: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  // joined
  tenants?: Tenant;
  providers?: Provider;
}

export type ToolType = 'sql_query' | 'web_scraper' | 'api_rest' | 'rag_search' | 'inventory_query' | 'nearest_unit' | 'fipe_query' | 'calendar_query' | 'chatwoot_assign' | 'send_notification';

export interface Tool {
  id: string;
  name: string;
  description: string | null;
  type: string;
  tool_type: ToolType;
  schema: Record<string, unknown> | null;
  endpoint: string | null;
  auth_config: Record<string, unknown> | null;
  tenant_id: string | null;
  function_def: Record<string, unknown> | null;
  execution_config: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  tenant_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  cpf_cnpj: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  tenants?: { name: string } | null;
}

export interface InventoryItem {
  id: string;
  external_id: string | null;
  tenant_id: string;
  brand: string;
  model: string;
  version: string | null;
  year: number | null;
  price: number | null;
  mileage: number | null;
  color: string | null;
  transmission: string | null;
  fuel_type: string | null;
  photo_url: string | null;
  photos: string[] | string | null;
  detail_url: string | null;
  description: string | null;
  status: string;
  video_details: string | null;
  raw_data?: { photos?: string[]; features?: string[]; optionals?: string[] } | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
  tenants?: { name: string } | null;
}
