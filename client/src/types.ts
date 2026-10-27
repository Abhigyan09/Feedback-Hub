export type UserRole = 
  | 'super_admin' 
  | 'tenant_admin' 
  | 'squad_lead' 
  | 'developer' 
  | 'support_agent' 
  | 'client_user';

export type TicketCategory = 'BUG' | 'IDEA' | 'HELP' | 'RATING' | 'API_FAILURE' | 'UI_GLITCH' | 'FEATURE_REQUEST' | 'PERFORMANCE';
export type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' | 'CRITICAL' | 'BLOCKER';
export type TicketStatus = 'OPEN' | 'TRIAGED' | 'IN_DEV' | 'IN_QA' | 'RESOLVED' | 'CLOSED';

export interface TicketTelemetry {
  page_url?: string;
  domain_origin?: string;
  app_version?: string;
  user_agent?: string;
  viewport_dimensions?: string;
  console_logs?: Array<{ type: string; message: string; timestamp: string }>;
  network_errors?: Array<{ url: string; status: number; method?: string; timestamp: string }>;
  screenshot_url?: string;
  encrypted_sensitive_data?: string;
}

export interface TicketEvent {
  id: string;
  ticket_id: string;
  tenant_id: string;
  author_name: string;
  author_role: UserRole;
  event_type: 'STATUS_CHANGE' | 'DEV_NOTE' | 'CLIENT_REPLY' | 'ASSIGNED';
  content: string;
  is_internal_only: boolean;
  created_at: string;
}

export interface Ticket {
  id: string;
  tenant_id: string;
  product_id: string;
  product_name?: string;
  domain_origin?: string;
  short_code: string;
  title: string;
  description: string;
  category: TicketCategory;
  severity: TicketSeverity;
  rating?: number;
  screenshot_url?: string;
  status: TicketStatus;
  reporter_email: string;
  assigned_squad: string;
  assigned_to?: string;
  assigned_to_name?: string;
  telemetry?: TicketTelemetry;
  sla_due_at: string;
  created_at: string;
  updated_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  isolation_standard?: string;
  allowed_domains: string[];
  webhook_url?: string;
  notification_email?: string;
  auto_capture_telemetry?: boolean;
  auto_capture_network?: boolean;
  require_email?: boolean;
  default_squad?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description?: string;
  api_key_hash: string;
  raw_api_key?: string;
  environment: 'production' | 'staging' | 'development';
  created_at: string;
  updated_at?: string;
}

export type PermissionModule = 'tickets' | 'products' | 'tenant' | 'permissions' | 'audit';

export type PermissionKey =
  // Tickets Module
  | 'tickets:view'
  | 'tickets:create'
  | 'tickets:edit'
  | 'tickets:delete'
  | 'tickets:change_status'
  | 'tickets:assign'
  | 'tickets:view_telemetry_internal'
  | 'tickets:view_internal_notes'
  | 'tickets:create_internal_notes'
  // Products Module
  | 'products:view'
  | 'products:create'
  | 'products:edit'
  | 'products:delete'
  | 'products:rotate_keys'
  // Tenant & Security Module
  | 'tenant:view_profile'
  | 'tenant:edit_profile'
  | 'tenant:manage_domains'
  | 'tenant:manage_policies'
  // Permissions Management Module
  | 'permissions:view'
  | 'permissions:edit'
  | 'permissions:reset'
  // Audit & Telemetry Module
  | 'audit:view'
  | 'audit:test_bridge';

export interface PermissionDefinition {
  key: PermissionKey;
  module: PermissionModule;
  action: string;
  name: string;
  description: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export type RolePermissionsMatrix = Record<UserRole, Record<PermissionKey, boolean>>;

