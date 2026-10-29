import { PermissionDefinition, PermissionKey, RolePermissionsMatrix, UserRole } from '../types/index.js';

export const ALL_ROLES: UserRole[] = [
  'super_admin',
  'tenant_admin',
  'squad_lead',
  'developer',
  'support_agent',
  'client_user'
];

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  // 1. INCIDENT TICKETS MODULE
  {
    key: 'tickets:view',
    module: 'tickets',
    action: 'view',
    name: 'View Incident Tickets',
    description: 'Browse queue, filter incidents, and view basic ticket metadata across products.',
    riskLevel: 'LOW'
  },
  {
    key: 'tickets:create',
    module: 'tickets',
    action: 'create',
    name: 'Submit / Create Tickets',
    description: 'Create new tickets or ingest incident reports via the SDK feedback widget.',
    riskLevel: 'LOW'
  },
  {
    key: 'tickets:edit',
    module: 'tickets',
    action: 'edit',
    name: 'Edit Ticket Properties',
    description: 'Update ticket title, severity, category, rating, and description details.',
    riskLevel: 'MEDIUM'
  },
  {
    key: 'tickets:change_status',
    module: 'tickets',
    action: 'change_status',
    name: 'Update Workflow Status',
    description: 'Advance tickets through lifecycle states (OPEN -> TRIAGED -> IN_DEV -> IN_QA -> RESOLVED -> CLOSED).',
    riskLevel: 'MEDIUM'
  },
  {
    key: 'tickets:assign',
    module: 'tickets',
    action: 'assign',
    name: 'Assign Squads & Engineers',
    description: 'Reallocate ticket ownership to engineering squads or specific developers.',
    riskLevel: 'MEDIUM'
  },
  {
    key: 'tickets:view_telemetry_internal',
    module: 'tickets',
    action: 'view_telemetry_internal',
    name: 'Inspect Raw Telemetry & Decrypt PII',
    description: 'Access raw browser console logs, network payloads, and AES-256 decrypted sensitive headers.',
    riskLevel: 'CRITICAL'
  },
  {
    key: 'tickets:view_internal_notes',
    module: 'tickets',
    action: 'view_internal_notes',
    name: 'View Internal Developer Notes',
    description: 'Read quarantined technical commentary and internal incident timeline entries.',
    riskLevel: 'HIGH'
  },
  {
    key: 'tickets:create_internal_notes',
    module: 'tickets',
    action: 'create_internal_notes',
    name: 'Post Internal Developer Notes',
    description: 'Annotate incidents with private internal engineering notes hidden from client reporters.',
    riskLevel: 'HIGH'
  },
  {
    key: 'tickets:delete',
    module: 'tickets',
    action: 'delete',
    name: 'Permanently Delete Tickets',
    description: 'Purge tickets and associated telemetry streams permanently from the tenant queue.',
    riskLevel: 'CRITICAL'
  },

  // 2. MONITORED PRODUCTS & INGESTION KEYS
  {
    key: 'products:view',
    module: 'products',
    action: 'view',
    name: 'View Monitored Products & Keys',
    description: 'Inspect registered applications, environment stages, and client SDK integration keys.',
    riskLevel: 'LOW'
  },
  {
    key: 'products:create',
    module: 'products',
    action: 'create',
    name: 'Register Monitored Products',
    description: 'Add new monitored software products and generate active client SDK ingestion keys.',
    riskLevel: 'HIGH'
  },
  {
    key: 'products:edit',
    module: 'products',
    action: 'edit',
    name: 'Edit Product Configuration',
    description: 'Modify product names, environment classifications, and application descriptions.',
    riskLevel: 'MEDIUM'
  },
  {
    key: 'products:rotate_keys',
    module: 'products',
    action: 'rotate_keys',
    name: 'Rotate Ingestion API Keys',
    description: 'Invalidate existing product API keys and regenerate fresh client ingestion hashes.',
    riskLevel: 'CRITICAL'
  },
  {
    key: 'products:delete',
    module: 'products',
    action: 'delete',
    name: 'Delete Monitored Products',
    description: 'Remove product profiles and deactivate client ingestion endpoints permanently.',
    riskLevel: 'CRITICAL'
  },

  // 3. TENANT PROFILE & DOMAIN FIREWALL
  {
    key: 'tenant:view_profile',
    module: 'tenant',
    action: 'view_profile',
    name: 'View Tenant Profile & Plan',
    description: 'View organization details, enterprise plan tiers, and SLA metrics.',
    riskLevel: 'LOW'
  },
  {
    key: 'tenant:edit_profile',
    module: 'tenant',
    action: 'edit_profile',
    name: 'Edit Organization Profile & Plan',
    description: 'Update organization name, plan tier, escalation webhook, and security alert email.',
    riskLevel: 'HIGH'
  },
  {
    key: 'tenant:manage_domains',
    module: 'tenant',
    action: 'manage_domains',
    name: 'Manage Origin Domain Whitelist',
    description: 'Configure anti-spoofing firewall domains permitted to send client telemetry.',
    riskLevel: 'HIGH'
  },
  {
    key: 'tenant:manage_policies',
    module: 'tenant',
    action: 'manage_policies',
    name: 'Configure Incident Routing Policies',
    description: 'Toggle automatic console log capture, network failure tracking, and squad assignments.',
    riskLevel: 'HIGH'
  },

  // 4. ROLES & PERMISSIONS GOVERNANCE
  {
    key: 'permissions:view',
    module: 'permissions',
    action: 'view',
    name: 'View Role Permissions Matrix',
    description: 'Inspect active role permission assignments and access control policies.',
    riskLevel: 'LOW'
  },
  {
    key: 'permissions:edit',
    module: 'permissions',
    action: 'edit',
    name: 'Configure Role Permissions',
    description: 'Modify, grant, or revoke granular functional capabilities for roles.',
    riskLevel: 'CRITICAL'
  },
  {
    key: 'permissions:reset',
    module: 'permissions',
    action: 'reset',
    name: 'Reset Permissions to Baseline',
    description: 'Restore default bank-grade RBAC security matrix presets.',
    riskLevel: 'HIGH'
  },

  // 5. AUDIT & TELEMETRY OBSERVABILITY
  {
    key: 'audit:view',
    module: 'audit',
    action: 'view',
    name: 'View Immutable Audit Trails',
    description: 'Inspect compliance audit trails and security change history.',
    riskLevel: 'MEDIUM'
  },
  {
    key: 'audit:test_bridge',
    module: 'audit',
    action: 'test_bridge',
    name: 'Execute Diagnostic Ingestion Ping',
    description: 'Send test telemetry probes to verify endpoint connectivity and roundtrip latency.',
    riskLevel: 'LOW'
  }
];

export const DEFAULT_ROLE_PERMISSIONS: RolePermissionsMatrix = {
  // SUPER ADMIN: Unrestricted authority across all system modules
  super_admin: {
    'tickets:view': true,
    'tickets:create': true,
    'tickets:edit': true,
    'tickets:delete': true,
    'tickets:change_status': true,
    'tickets:assign': true,
    'tickets:view_telemetry_internal': true,
    'tickets:view_internal_notes': true,
    'tickets:create_internal_notes': true,
    'products:view': true,
    'products:create': true,
    'products:edit': true,
    'products:delete': true,
    'products:rotate_keys': true,
    'tenant:view_profile': true,
    'tenant:edit_profile': true,
    'tenant:manage_domains': true,
    'tenant:manage_policies': true,
    'permissions:view': true,
    'permissions:edit': true,
    'permissions:reset': true,
    'audit:view': true,
    'audit:test_bridge': true
  },

  // TENANT ADMIN: Complete governance within tenant scope
  tenant_admin: {
    'tickets:view': true,
    'tickets:create': true,
    'tickets:edit': true,
    'tickets:delete': true,
    'tickets:change_status': true,
    'tickets:assign': true,
    'tickets:view_telemetry_internal': true,
    'tickets:view_internal_notes': true,
    'tickets:create_internal_notes': true,
    'products:view': true,
    'products:create': true,
    'products:edit': true,
    'products:delete': true,
    'products:rotate_keys': true,
    'tenant:view_profile': true,
    'tenant:edit_profile': true,
    'tenant:manage_domains': true,
    'tenant:manage_policies': true,
    'permissions:view': true,
    'permissions:edit': true,
    'permissions:reset': true,
    'audit:view': true,
    'audit:test_bridge': true
  },

  // SQUAD LEAD: Engineering architecture, triage, escalation, full ticket lifecycle
  squad_lead: {
    'tickets:view': true,
    'tickets:create': true,
    'tickets:edit': true,
    'tickets:delete': true,
    'tickets:change_status': true,
    'tickets:assign': true,
    'tickets:view_telemetry_internal': true,
    'tickets:view_internal_notes': true,
    'tickets:create_internal_notes': true,
    'products:view': true,
    'products:create': true,
    'products:edit': true,
    'products:delete': true,
    'products:rotate_keys': true,
    'tenant:view_profile': true,
    'tenant:edit_profile': true,
    'tenant:manage_domains': true,
    'tenant:manage_policies': true,
    'permissions:view': true,
    'permissions:edit': true,
    'permissions:reset': true,
    'audit:view': true,
    'audit:test_bridge': true
  },

  // DEVELOPER: Bug resolution, status advancement, technical notes & telemetry investigation
  developer: {
    'tickets:view': true,
    'tickets:create': true,
    'tickets:edit': true,
    'tickets:delete': true,
    'tickets:change_status': true,
    'tickets:assign': true,
    'tickets:view_telemetry_internal': true,
    'tickets:view_internal_notes': true,
    'tickets:create_internal_notes': true,
    'products:view': true,
    'products:create': true,
    'products:edit': true,
    'products:delete': true,
    'products:rotate_keys': true,
    'tenant:view_profile': true,
    'tenant:edit_profile': true,
    'tenant:manage_domains': true,
    'tenant:manage_policies': true,
    'permissions:view': true,
    'permissions:edit': true,
    'permissions:reset': true,
    'audit:view': true,
    'audit:test_bridge': true
  },

  // SUPPORT AGENT: Customer ticket triage, initial verification & status updates
  support_agent: {
    'tickets:view': true,
    'tickets:create': true,
    'tickets:edit': false,
    'tickets:delete': false,
    'tickets:change_status': true,
    'tickets:assign': false,
    'tickets:view_telemetry_internal': false,
    'tickets:view_internal_notes': false,
    'tickets:create_internal_notes': false,
    'products:view': false,
    'products:create': false,
    'products:edit': false,
    'products:delete': false,
    'products:rotate_keys': false,
    'tenant:view_profile': true,
    'tenant:edit_profile': false,
    'tenant:manage_domains': false,
    'tenant:manage_policies': false,
    'permissions:view': false,
    'permissions:edit': false,
    'permissions:reset': false,
    'audit:view': false,
    'audit:test_bridge': false
  },

  // CLIENT USER: External client submitting and tracking their feedback
  client_user: {
    'tickets:view': true,
    'tickets:create': true,
    'tickets:edit': false,
    'tickets:delete': false,
    'tickets:change_status': false,
    'tickets:assign': false,
    'tickets:view_telemetry_internal': false,
    'tickets:view_internal_notes': false,
    'tickets:create_internal_notes': false,
    'products:view': false,
    'products:create': false,
    'products:edit': false,
    'products:delete': false,
    'products:rotate_keys': false,
    'tenant:view_profile': false,
    'tenant:edit_profile': false,
    'tenant:manage_domains': false,
    'tenant:manage_policies': false,
    'permissions:view': false,
    'permissions:edit': false,
    'permissions:reset': false,
    'audit:view': false,
    'audit:test_bridge': false
  }
};

export const createDefaultPermissionsMatrix = (): RolePermissionsMatrix => {
  const matrix: Partial<RolePermissionsMatrix> = {};
  for (const role of ALL_ROLES) {
    matrix[role] = { ...DEFAULT_ROLE_PERMISSIONS[role] };
  }
  return matrix as RolePermissionsMatrix;
};

export const getPermissionDefinition = (key: PermissionKey): PermissionDefinition | undefined => {
  return PERMISSION_DEFINITIONS.find(p => p.key === key);
};
