export type UserRole = 
  | 'super_admin' 
  | 'tenant_admin' 
  | 'squad_lead' 
  | 'developer' 
  | 'support_agent' 
  | 'client_user';

export type TicketCategory = 'BUG' | 'API_FAILURE' | 'UI_GLITCH' | 'FEATURE_REQUEST' | 'PERFORMANCE' | 'SECURITY';
export type TicketSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | 'BLOCKER';
export type TicketStatus = 'OPEN' | 'TRIAGED' | 'IN_DEV' | 'IN_QA' | 'RESOLVED' | 'CLOSED';

export interface TicketTelemetry {
  page_url?: string;
  app_version?: string;
  user_agent?: string;
  viewport_dimensions?: string;
  console_logs?: Array<{ type: string; message: string; timestamp: string }>;
  network_errors?: Array<{ url: string; status: number; method?: string; timestamp: string }>;
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
  short_code: string;
  title: string;
  description: string;
  category: TicketCategory;
  severity: TicketSeverity;
  status: TicketStatus;
  reporter_email: string;
  assigned_squad: string;
  assigned_to?: string;
  assigned_to_name?: string;
  telemetry?: TicketTelemetry;
  sla_due_at: string;
  created_at: string;
  updated_at: string;
  waiting_for_client?: boolean;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  allowed_domains: string[];
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  avatarInitials: string;
  status: 'ONLINE' | 'AWAY' | 'ON_CALL';
  color: string;
}

