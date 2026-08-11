export interface Tenant {
  id: string;
  name: string;
  slug: string;
  /** Quando false, webhooks não acionam LLM para nenhum agente desta tenant. */
  ai_globally_enabled?: boolean;
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
  communication_rules: string | null;
  dispatcher_prompt: string | null;
  followup_prompt: string | null;
  always_inject_comm_rules: boolean;
  skip_greeting: boolean;
  override_prompts: boolean;
  current_version: string;
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

export type ToolType = 'sql_query' | 'web_scraper' | 'api_rest' | 'rag_search' | 'inventory_query' | 'nearest_unit' | 'fipe_query' | 'calendar_query' | 'chatwoot_assign' | 'send_notification' | 'omnibees_availability' | 'suite_gallery_query' | 'lodging_consulta';

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

// "admin" é legado e tratado como superadmin em runtime.
export type AppRole = "superadmin" | "tenant_admin" | "tenant_user" | "admin";

export interface Profile {
  id: string;
  full_name: string | null;
  role: AppRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: "tenant_admin" | "tenant_user";
  created_at: string;
  updated_at: string;
  /** Preenchido quando o scope carrega com `select('*, tenants(name)')`. */
  tenants?: { name: string } | null;
}

export type ContactType = "lead" | "client";

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
  contact_type?: ContactType;
  created_at: string;
  updated_at: string;
  tenants?: { name: string } | null;
}

export type ContactInvoiceStatus = "pending" | "paid" | "overdue" | "cancelled";

export interface ContactInvoice {
  id: string;
  contact_id: string;
  tenant_id: string;
  amount: number;
  due_date: string;
  paid_at: string | null;
  status: ContactInvoiceStatus;
  description: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type ContactPackageStatus = "active" | "paused" | "completed" | "cancelled";

export interface ContactPackage {
  id: string;
  contact_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  status: ContactPackageStatus;
  price: number | null;
  start_date: string | null;
  end_date: string | null;
  sessions_total: number | null;
  sessions_used: number;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ContactSummary {
  total_invoiced: number;
  total_paid: number;
  total_overdue: number;
  invoice_count: number;
  active_packages: number;
  upcoming_appointments: number;
}

export type ContactDocumentCategory = "geral" | "contrato" | "identidade" | "comprovante" | "outro";

export interface ContactDocument {
  id: string;
  contact_id: string;
  tenant_id: string;
  name: string;
  category: ContactDocumentCategory;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  notes: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type ContactContractStatus = "draft" | "active" | "expired" | "cancelled" | "suspended";

export interface ContactContract {
  id: string;
  contact_id: string;
  tenant_id: string;
  contract_number: string | null;
  title: string;
  status: ContactContractStatus;
  start_date: string | null;
  end_date: string | null;
  value: number | null;
  payment_terms: string | null;
  description: string | null;
  document_url: string | null;
  metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** Campos extras em `contacts.metadata` para gestão de clientes. */
export interface ContactClientMetadata {
  client_status?: "active" | "inactive" | "at_risk";
  company_name?: string;
  complementary_info?: string;
  profession?: string;
  birth_date?: string;
}

export type CatalogItemType = "service" | "product";
export type CatalogItemStatus = "active" | "inactive" | "coming_soon";
export type CatalogAttendanceType = "individual" | "group";
export type CatalogRagSyncStatus = "pending" | "synced" | "error";

export interface CatalogCategory {
  id: string;
  tenant_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Professional {
  id: string;
  tenant_id: string;
  full_name: string;
  photo_url: string | null;
  bio_short: string | null;
  working_hours: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CatalogItem {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  item_type: CatalogItemType;
  status: CatalogItemStatus;
  image_url: string | null;
  description: string | null;
  faq_text: string | null;
  price_standard: number | null;
  price_promo: number | null;
  promo_valid_until: string | null;
  payment_methods: string[] | null;
  max_installments: number | null;
  installment_note: string | null;
  cancellation_policy: string | null;
  duration_minutes: number | null;
  buffer_after_minutes: number | null;
  attendance_type: CatalogAttendanceType | null;
  max_capacity: number | null;
  resource_required: string | null;
  available_weekdays: number[] | null;
  prerequisites: string | null;
  target_audience: string | null;
  rag_synced_at: string | null;
  rag_sync_status: CatalogRagSyncStatus;
  rag_last_error: string | null;
  created_at: string;
  updated_at: string;
  catalog_categories?: Pick<CatalogCategory, "id" | "name"> | null;
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

export type OccurrenceStatus = "aberta" | "em_andamento" | "resolvida" | "cancelada";
export type OccurrenceSeverity = "baixa" | "media" | "alta" | "critica";

export type OccurrenceLocationType =
  | "loja"
  | "patio"
  | "test_drive"
  | "transporte"
  | "oficina"
  | "externo"
  | "outro";

/** Resumo do veículo retornado pela API (join com inventário). */
export interface OccurrenceInventorySummary {
  id: string;
  brand: string;
  model: string;
  version: string | null;
  year?: number | null;
  price?: number | null;
  photo_url: string | null;
  external_id: string | null;
  detail_url: string | null;
  status: string;
}

/** Cliente (CRM) associado à ocorrência. */
export interface OccurrenceContactSummary {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export interface Occurrence {
  id: string;
  tenant_id: string;
  inventory_id: string;
  contact_id?: string | null;
  title: string;
  description: string | null;
  status: OccurrenceStatus;
  severity: OccurrenceSeverity;
  occurred_at: string;
  location_type: OccurrenceLocationType;
  location_detail: string | null;
  odometer_km: number | null;
  photo_urls: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  inventory?: OccurrenceInventorySummary | OccurrenceInventorySummary[] | null;
  contacts?: OccurrenceContactSummary | OccurrenceContactSummary[] | null;
}

export interface SuiteGalleryMedia {
  url: string;
  type: 'photo' | 'video';
  caption?: string;
  /** Quando enviar esta mídia (só para o agente / LLM). Ex.: "cliente disse que não conhece o resort". */
  llm_send_when?: string;
}

export interface SuiteGallery {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  /** Instruções para o LLM sobre quando enviar fotos/vídeos desta galeria. */
  llm_media_guidance?: string | null;
  cover_image_url: string | null;
  media_urls: SuiteGalleryMedia[];
  display_order: number;
  created_at: string;
  updated_at: string;
  tenants?: { name: string } | null;
  /** Nomes retornados pela Omnibees que mapeiam para esta galeria. */
  omnibees_room?: string[] | null;
}
