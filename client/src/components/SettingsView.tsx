import React, { useState, useEffect, useMemo } from 'react';
import { 
  Key, 
  Shield, 
  Globe, 
  Terminal, 
  Copy, 
  Check, 
  Plus, 
  X, 
  RefreshCw, 
  Trash2, 
  Save, 
  RotateCcw, 
  CheckCircle2, 
  AlertCircle,
  Building,
  Layers,
  Sliders,
  Cpu,
  Edit3,
  Server,
  Zap,
  Mail,
  Webhook,
  Lock,
  Unlock,
  ShieldAlert,
  ShieldCheck,
  CheckSquare,
  Square,
  Filter,
  Search,
  Eye,
  ChevronRight,
  SlidersHorizontal,
  Users
} from 'lucide-react';
import { Product, Tenant, UserRole, PermissionDefinition, PermissionKey, RolePermissionsMatrix, PermissionModule } from '../types';
import { 
  PERMISSION_DEFINITIONS as DEFAULT_PERMISSION_DEFINITIONS, 
  createDefaultPermissionsMatrix,
  hasRolePermission 
} from '../constants/permissions';
import { useAuth } from '../context/AuthContext';

export const ALL_SYSTEM_ROLES: UserRole[] = [
  'super_admin',
  'tenant_admin',
  'squad_lead',
  'developer',
  'support_agent',
  'client_user'
];

export type SettingsTab = 'profile' | 'products' | 'security' | 'routing' | 'permissions' | 'embed';

export const ROLE_METADATA: Record<UserRole, { label: string; badge: string; desc: string; color: string }> = {
  super_admin: {
    label: 'Super Admin',
    badge: 'SYSTEM ROOT',
    desc: 'Unrestricted enterprise platform root access across all tenant boundaries.',
    color: 'border-purple-300 bg-purple-50 text-purple-800'
  },
  tenant_admin: {
    label: 'Tenant Admin',
    badge: 'ORG GOVERNANCE',
    desc: 'Full tenant authority over organization profiles, API keys, member roles, security, and policies.',
    color: 'border-indigo-300 bg-indigo-50 text-indigo-800'
  },
  squad_lead: {
    label: 'Squad Lead',
    badge: 'ENGINEERING ARCH',
    desc: 'Engineering leadership, ticket lifecycle, quarantine notes, developer assignments, and triage.',
    color: 'border-blue-300 bg-blue-50 text-blue-800'
  },
  developer: {
    label: 'Developer',
    badge: 'CORE IMPLEMENTATION',
    desc: 'Bug resolution, status advancement, technical internal notes, and decrypted telemetry inspection.',
    color: 'border-emerald-300 bg-emerald-50 text-emerald-800'
  },
  support_agent: {
    label: 'Support Agent',
    badge: 'TRIAGE & ESCALATION',
    desc: 'Customer ticket verification, initial status triage, and public communications.',
    color: 'border-amber-300 bg-amber-50 text-amber-800'
  },
  client_user: {
    label: 'Client User',
    badge: 'EXTERNAL REPORTER',
    desc: 'External customer submitting feedback and monitoring progress without internal data exposure.',
    color: 'border-slate-300 bg-slate-50 text-slate-800'
  }
};

export const MODULE_METADATA: Record<PermissionModule, { label: string; icon: any; desc: string }> = {
  tickets: {
    label: 'Incident Tickets & Workflow',
    icon: Layers,
    desc: 'Queue browsing, creation, edits, assignment, status advancement, and telemetry inspection.'
  },
  products: {
    label: 'Monitored Products & Ingestion Keys',
    icon: Key,
    desc: 'Client product registration, API key generation, key rotation, and lifecycle controls.'
  },
  tenant: {
    label: 'Tenant Profile & Domain Firewall',
    icon: Globe,
    desc: 'Organization branding, plan tier, anti-spoofing origin whitelist, and telemetry capture policies.'
  },
  permissions: {
    label: 'Role Permissions Governance (RBAC)',
    icon: ShieldCheck,
    desc: 'Configuring dynamic capability matrices, granting access, and resetting baseline presets.'
  },
  audit: {
    label: 'Audit Observability & Ingestion Bridge',
    icon: Server,
    desc: 'Compliance audit trail inspection and diagnostic ping tests against telemetry endpoints.'
  }
};

interface SettingsViewProps {
  currentTenantId: string;
  currentRole?: UserRole;
  onTenantUpdated?: () => void;
  permissionsMatrix?: RolePermissionsMatrix | null;
  onPermissionsUpdated?: (newMatrix: RolePermissionsMatrix) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  currentTenantId,
  currentRole = 'developer',
  onTenantUpdated,
  permissionsMatrix: initialPermissionsMatrix,
  onPermissionsUpdated
}) => {
  const { authFetch } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    return (localStorage.getItem('fb_settings_tab') as SettingsTab) || 'profile';
  });

  useEffect(() => {
    localStorage.setItem('fb_settings_tab', activeTab);
  }, [activeTab]);

  // Editable Profile State
  const [orgName, setOrgName] = useState('');
  const [plan, setPlan] = useState('ENTERPRISE');
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [newDomain, setNewDomain] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');

  // Routing & Policies State
  const [defaultSquad, setDefaultSquad] = useState('Core Platform & API Squad');
  const [autoCaptureTelemetry, setAutoCaptureTelemetry] = useState(true);
  const [autoCaptureNetwork, setAutoCaptureNetwork] = useState(true);
  const [requireEmail, setRequireEmail] = useState(false);

  // New Product Modal/Form State
  const [isAddingProduct, setIsAddingProduct] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductDesc, setNewProductDesc] = useState('');
  const [newProductEnv, setNewProductEnv] = useState<'production' | 'staging' | 'development'>('production');

  // Product Inline Edit State
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProductName, setEditProductName] = useState('');
  const [editProductDesc, setEditProductDesc] = useState('');
  const [editProductEnv, setEditProductEnv] = useState<'production' | 'staging' | 'development'>('production');

  // Diagnostic Test Ping State
  const [pingStatus, setPingStatus] = useState<{
    tested: boolean;
    loading: boolean;
    online: boolean;
    latencyMs?: number;
    details?: any;
    error?: string;
  }>({ tested: false, loading: false, online: false });

  // Permissions State
  const [permissionsMatrix, setPermissionsMatrix] = useState<RolePermissionsMatrix>(() => {
    return initialPermissionsMatrix || createDefaultPermissionsMatrix();
  });
  const [permissionDefinitions, setPermissionDefinitions] = useState<PermissionDefinition[]>(DEFAULT_PERMISSION_DEFINITIONS);
  const [selectedRoleForPerms, setSelectedRoleForPerms] = useState<UserRole>(currentRole);
  const [permMatrixView, setPermMatrixView] = useState<'cards' | 'grid'>('cards');
  const [permSearchQuery, setPermSearchQuery] = useState('');
  const [permFilterModule, setPermFilterModule] = useState<string>('ALL');
  const [permFilterRisk, setPermFilterRisk] = useState<string>('ALL');
  const [isSavingPerms, setIsSavingPerms] = useState(false);
  const [permsSuccessMessage, setPermsSuccessMessage] = useState<string | null>(null);
  const [hasUnsavedPerms, setHasUnsavedPerms] = useState(false);
  const [testActionKey, setTestActionKey] = useState<PermissionKey>('tickets:delete');
  const [testRoleKey, setTestRoleKey] = useState<UserRole>(currentRole);
  const [copySourceRole, setCopySourceRole] = useState<UserRole>('developer');

  // Sync prop permissionsMatrix if passed
  useEffect(() => {
    if (initialPermissionsMatrix) {
      setPermissionsMatrix(initialPermissionsMatrix);
    }
  }, [initialPermissionsMatrix]);

  // UI Feedback States
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [selectedProductForSnippet, setSelectedProductForSnippet] = useState<string>('');

  // Dynamic Granular Permissions derived from active tenant matrix and role
  // Strict Security Rule: Only Admin (super_admin, tenant_admin) and Lead Manager (squad_lead) can make changes in settings.
  // Developer and other non-admin/non-lead roles cannot do any changes.
  const isPlatformAdmin = currentRole === 'super_admin';
  const isAdminOrLead = ['super_admin', 'tenant_admin', 'squad_lead'].includes(currentRole);

  // Read-only view permissions (Developers and above can view settings)
  const canViewTenantProfile = hasRolePermission(permissionsMatrix, currentRole, 'tenant:view_profile');
  const canViewProducts = hasRolePermission(permissionsMatrix, currentRole, 'products:view');
  const canViewPermissions = hasRolePermission(permissionsMatrix, currentRole, 'permissions:view');
  const canViewAudit = hasRolePermission(permissionsMatrix, currentRole, 'audit:view');

  // Settings modification permissions: strictly restricted to Admin & Lead Manager
  const canEditTenantProfile = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'tenant:edit_profile');
  const canManageDomains = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'tenant:manage_domains');
  const canManagePolicies = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'tenant:manage_policies');

  const canCreateProduct = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'products:create');
  const canEditProduct = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'products:edit');
  const canDeleteProduct = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'products:delete');
  const canRotateProductKeys = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'products:rotate_keys');

  // Governance access: Only Admin (super_admin, tenant_admin) and Lead Manager (squad_lead) can configure RBAC permissions
  const canEditPermissions = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'permissions:edit');
  const canResetPermissions = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'permissions:reset');

  const canTestBridge = isAdminOrLead && hasRolePermission(permissionsMatrix, currentRole, 'audit:test_bridge');

  // Can view Settings general screen if has any relevant view permissions or is developer/squad_lead/admin
  const canViewSettings = isPlatformAdmin || currentRole === 'tenant_admin' || canViewTenantProfile || canViewProducts || canViewPermissions || 
    ['squad_lead', 'developer'].includes(currentRole);

  // Can save any tenant setting if has edit profile, domains, or policies AND is Admin or Lead Manager
  const canSaveAnyTenantSettings = isAdminOrLead && (canEditTenantProfile || canManageDomains || canManagePolicies);

  // 1. Fetch live tenant settings, products, and dynamic permissions from backend
  const loadTenantSettings = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await authFetch(`/api/v1/tenants/current?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole,
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.tenant) {
          const t: Tenant = data.tenant;
          setTenant(t);
          setOrgName(t.name || '');
          setPlan(t.plan || 'ENTERPRISE');
          setAllowedDomains(t.allowed_domains || []);
          setWebhookUrl(t.webhook_url || '');
          setNotificationEmail(t.notification_email || '');
          setDefaultSquad(t.default_squad || 'Core Platform & API Squad');
          setAutoCaptureTelemetry(t.auto_capture_telemetry ?? true);
          setAutoCaptureNetwork(t.auto_capture_network ?? true);
          setRequireEmail(t.require_email ?? false);
        }
        if (data.products) {
          setProducts(data.products);
          if (data.products.length > 0 && !selectedProductForSnippet) {
            setSelectedProductForSnippet(data.products[0].id);
          }
        }
        if (data.permissions_matrix) {
          setPermissionsMatrix(data.permissions_matrix);
        }
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to load tenant configuration');
      }

      // Also fetch full permission definitions
      const permRes = await authFetch(`/api/v1/tenants/permissions?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole,
          'pragma': 'no-cache',
          'cache-control': 'no-cache'
        }
      });
      if (permRes.ok) {
        const permData = await permRes.json();
        if (permData.definitions) setPermissionDefinitions(permData.definitions);
        if (permData.matrix) setPermissionsMatrix(permData.matrix);
        setHasUnsavedPerms(false);
      }
    } catch (err: any) {
      console.error('Failed to load tenant settings:', err);
      setErrorMessage(err.message || 'Network connection error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setSelectedRoleForPerms(currentRole);
    setTestRoleKey(currentRole);
    loadTenantSettings();
  }, [currentTenantId, currentRole]);


  // 2. Handle Master Save Changes & Update Settings
  const handleSaveChanges = async (customMessage?: string) => {
    if (!canSaveAnyTenantSettings && !hasUnsavedPerms) {
      setErrorMessage(`Your active role '${ROLE_METADATA[currentRole]?.label || currentRole}' is not authorized to modify tenant settings.`);
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    if (!orgName.trim()) {
      setErrorMessage('Organization name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setSaveSuccessMessage(null);
    setErrorMessage(null);

    try {
      if (canSaveAnyTenantSettings) {
        const res = await authFetch('/api/v1/tenants/current', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': currentTenantId,
            'x-user-role': currentRole
          },
          body: JSON.stringify({
            name: orgName,
            plan,
            allowed_domains: allowedDomains,
            webhook_url: webhookUrl,
            notification_email: notificationEmail,
            default_squad: defaultSquad,
            auto_capture_telemetry: autoCaptureTelemetry,
            auto_capture_network: autoCaptureNetwork,
            require_email: requireEmail
          })
        });

        if (res.ok) {
          const data = await res.json();
          setTenant(data.tenant);
        } else {
          const err = await res.json();
          throw new Error(err.message || err.error || 'Server error saving settings');
        }
      }

      // Persist any modified role permissions if present
      if (hasUnsavedPerms && permissionsMatrix && canEditPermissions) {
        await persistMatrix(permissionsMatrix, 'Settings and role permissions saved.');
      } else {
        setSaveSuccessMessage(customMessage || 'Settings updated and persisted to database successfully!');
        setTimeout(() => setSaveSuccessMessage(null), 5000);
      }

      if (onTenantUpdated) onTenantUpdated();
    } catch (err: any) {
      setErrorMessage('Failed to save settings: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 3. Add Domain to Whitelist
  const handleAddDomain = (e: React.FormEvent) => {
    e.preventDefault();
    const domainClean = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!domainClean) return;

    if (allowedDomains.includes(domainClean)) {
      setErrorMessage('This domain is already in your whitelist.');
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const updated = [...allowedDomains, domainClean];
    setAllowedDomains(updated);
    setNewDomain('');
  };

  // 4. Remove Domain from Whitelist
  const handleRemoveDomain = (domainToRemove: string) => {
    setAllowedDomains(allowedDomains.filter(d => d !== domainToRemove));
  };

  // 5. Add Monitored Product
  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductName.trim()) return;

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await authFetch('/api/v1/tenants/products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          name: newProductName,
          description: newProductDesc,
          environment: newProductEnv
        })
      });

      if (res.ok) {
        const data = await res.json();
        setProducts([...products, data.product]);
        setNewProductName('');
        setNewProductDesc('');
        setIsAddingProduct(false);
        setSaveSuccessMessage(`Product '${data.product.name}' registered with active ingestion key.`);
        setTimeout(() => setSaveSuccessMessage(null), 5000);
      } else {
        const err = await res.json();
        setErrorMessage('Failed to add product: ' + err.error);
      }
    } catch (err: any) {
      setErrorMessage('Network error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 6. Start Inline Product Edit
  const handleStartEditProduct = (prod: Product) => {
    setEditingProductId(prod.id);
    setEditProductName(prod.name);
    setEditProductDesc(prod.description || '');
    setEditProductEnv(prod.environment);
  };

  // 6.1 Save Product Inline Edit
  const handleSaveProductEdit = async (productId: string) => {
    if (!editProductName.trim()) {
      setErrorMessage('Product name cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await authFetch(`/api/v1/tenants/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          name: editProductName,
          description: editProductDesc,
          environment: editProductEnv
        })
      });

      if (res.ok) {
        const data = await res.json();
        setProducts(products.map(p => p.id === productId ? data.product : p));
        setEditingProductId(null);
        setSaveSuccessMessage(`Product '${data.product.name}' updated successfully.`);
        setTimeout(() => setSaveSuccessMessage(null), 4000);
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to update product');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error updating product');
    } finally {
      setIsSaving(false);
    }
  };

  // 7. Rotate API Key
  const handleRotateKey = async (productId: string, productName: string) => {
    if (!confirm(`Are you sure you want to rotate the API key for '${productName}'? Any existing embed scripts will need to be updated with the new key.`)) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await authFetch(`/api/v1/tenants/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({ rotate_key: true })
      });

      if (res.ok) {
        const data = await res.json();
        setProducts(products.map(p => p.id === productId ? data.product : p));
        setSaveSuccessMessage(`API Key rotated successfully for '${productName}'.`);
        setTimeout(() => setSaveSuccessMessage(null), 5000);
      } else {
        setErrorMessage('Failed to rotate API key');
      }
    } catch (err: any) {
      setErrorMessage('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 8. Delete Product
  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (products.length <= 1) {
      alert('A tenant must retain at least one active monitored product.');
      return;
    }

    if (!confirm(`Permanently remove monitored product '${productName}' and revoke its ingestion key?`)) {
      return;
    }

    setIsSaving(true);
    try {
      const res = await authFetch(`/api/v1/tenants/products/${productId}`, {
        method: 'DELETE',
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });

      if (res.ok) {
        setProducts(products.filter(p => p.id !== productId));
        setSaveSuccessMessage(`Product '${productName}' removed successfully.`);
        setTimeout(() => setSaveSuccessMessage(null), 5000);
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to remove product');
      }
    } catch (err: any) {
      setErrorMessage('Error: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // 9. Diagnostic Ingestion Ping
  const handleTestPing = async () => {
    setPingStatus({ tested: true, loading: true, online: false });
    const startTime = Date.now();
    try {
      const res = await authFetch('/api/v1/tenants/ping-ingest', {
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        }
      });
      const latency = Date.now() - startTime;
      if (res.ok) {
        const data = await res.json();
        setPingStatus({
          tested: true,
          loading: false,
          online: true,
          latencyMs: latency,
          details: data
        });
      } else {
        setPingStatus({
          tested: true,
          loading: false,
          online: false,
          error: `HTTP ${res.status}`
        });
      }
    } catch (err: any) {
      setPingStatus({
        tested: true,
        loading: false,
        online: false,
        error: err.message
      });
    }
  };

  // Helper: Persist permissions matrix atomically to live backend, disk file & database
  const persistMatrix = async (
    updatedMatrix: RolePermissionsMatrix, 
    successMsg: string,
    targetRole?: UserRole
  ) => {
    setIsSavingPerms(true);
    setErrorMessage(null);
    try {
      const activeRole = targetRole || selectedRoleForPerms;
      const res = await authFetch('/api/v1/tenants/permissions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({
          matrix: updatedMatrix,
          role: activeRole,
          permissions: updatedMatrix[activeRole]
        })
      });

      if (res.ok) {
        const data = await res.json();
        const serverMatrix = data.matrix || updatedMatrix;
        setPermissionsMatrix(serverMatrix);
        onPermissionsUpdated?.(serverMatrix);
        setHasUnsavedPerms(false);
        setPermsSuccessMessage(successMsg);
        setTimeout(() => setPermsSuccessMessage(null), 4000);
        if (onTenantUpdated) onTenantUpdated();
      } else {
        const err = await res.json();
        setErrorMessage(err.message || err.error || 'Failed to update permissions');
      }
    } catch (err: any) {
      setErrorMessage('Network error: ' + err.message);
    } finally {
      setIsSavingPerms(false);
    }
  };

  // 10. RBAC: Save Permissions Matrix (Manual Save Trigger)
  const handleSavePermissions = async () => {
    if (!permissionsMatrix) return;
    await persistMatrix(
      permissionsMatrix, 
      `All tenant role permissions successfully saved to database!`,
      selectedRoleForPerms
    );
  };

  // 11. RBAC: Reset Permissions to Bank-Grade Baseline
  const handleResetPermissions = async (targetRole?: UserRole) => {
    const roleName = targetRole ? ROLE_METADATA[targetRole].label : 'ALL ROLES';
    if (!confirm(`Reset permissions for ${roleName} to bank-grade default baseline? Any custom overrides will be replaced.`)) {
      return;
    }

    setIsSavingPerms(true);
    setErrorMessage(null);
    try {
      const res = await authFetch('/api/v1/tenants/permissions/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
        },
        body: JSON.stringify({ role: targetRole })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.matrix) {
          setPermissionsMatrix(data.matrix);
          onPermissionsUpdated?.(data.matrix);
        }
        setHasUnsavedPerms(false);
        setPermsSuccessMessage(data.message || `Permissions for ${roleName} reset to default baseline.`);
        setTimeout(() => setPermsSuccessMessage(null), 5000);
        if (onTenantUpdated) onTenantUpdated();
      } else {
        const err = await res.json();
        setErrorMessage(err.message || err.error || 'Failed to reset permissions');
      }
    } catch (err: any) {
      setErrorMessage('Network error: ' + err.message);
    } finally {
      setIsSavingPerms(false);
    }
  };

  // 12. RBAC: Toggle Single Permission (Auto-persisted to Database)
  const handleTogglePermission = async (role: UserRole, key: PermissionKey) => {
    // Protection against losing governance permission for admins & lead
    if ((role === 'super_admin' || role === 'tenant_admin' || role === 'squad_lead') && key === 'permissions:edit') {
      return;
    }

    if (!canEditPermissions) {
      setErrorMessage(`Your active role '${ROLE_METADATA[currentRole]?.label || currentRole}' does not possess 'permissions:edit' authority.`);
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const baseMatrix = permissionsMatrix || createDefaultPermissionsMatrix();
    const currentVal = Boolean(baseMatrix[role]?.[key]);
    const newVal = !currentVal;

    const updatedMatrix: RolePermissionsMatrix = {
      ...baseMatrix,
      [role]: {
        ...(baseMatrix[role] || {}),
        [key]: newVal
      }
    };

    setPermissionsMatrix(updatedMatrix);
    onPermissionsUpdated?.(updatedMatrix);

    await persistMatrix(
      updatedMatrix,
      `Permission '${key}' for ${ROLE_METADATA[role].label} set to ${newVal ? 'GRANTED' : 'REVOKED'} (Saved)`,
      role
    );
  };

  // 13. RBAC: Grant All In Module (Auto-persisted)
  const handleGrantAllInModule = async (role: UserRole, module: PermissionModule) => {
    if (!canEditPermissions) return;
    const baseMatrix = permissionsMatrix || createDefaultPermissionsMatrix();
    const modPerms = permissionDefinitions.filter(p => p.module === module);
    const updates: Record<string, boolean> = {};
    modPerms.forEach(p => { updates[p.key] = true; });

    const updatedMatrix: RolePermissionsMatrix = {
      ...baseMatrix,
      [role]: {
        ...(baseMatrix[role] || {}),
        ...updates
      }
    };

    setPermissionsMatrix(updatedMatrix);
    onPermissionsUpdated?.(updatedMatrix);
    await persistMatrix(
      updatedMatrix,
      `All ${module} permissions granted to ${ROLE_METADATA[role].label} (Saved)`,
      role
    );
  };

  // 14. RBAC: Revoke All In Module (Auto-persisted)
  const handleRevokeAllInModule = async (role: UserRole, module: PermissionModule) => {
    if (!canEditPermissions) return;
    const baseMatrix = permissionsMatrix || createDefaultPermissionsMatrix();
    const modPerms = permissionDefinitions.filter(p => p.module === module);
    const updates: Record<string, boolean> = {};
    modPerms.forEach(p => {
      if ((role === 'super_admin' || role === 'tenant_admin' || role === 'squad_lead') && p.key === 'permissions:edit') {
        updates[p.key] = true;
      } else {
        updates[p.key] = false;
      }
    });

    const updatedMatrix: RolePermissionsMatrix = {
      ...baseMatrix,
      [role]: {
        ...(baseMatrix[role] || {}),
        ...updates
      }
    };

    setPermissionsMatrix(updatedMatrix);
    onPermissionsUpdated?.(updatedMatrix);
    await persistMatrix(
      updatedMatrix,
      `All ${module} permissions revoked from ${ROLE_METADATA[role].label} (Saved)`,
      role
    );
  };

  // 15. RBAC: Clone / Copy Permissions from another Role (Auto-persisted)
  const handleCopyPermissions = async (fromRole: UserRole, toRole: UserRole) => {
    if (!canEditPermissions) return;
    if (!confirm(`Clone all permissions from '${ROLE_METADATA[fromRole].label}' to '${ROLE_METADATA[toRole].label}'?`)) {
      return;
    }

    const baseMatrix = permissionsMatrix || createDefaultPermissionsMatrix();
    const updatedMatrix: RolePermissionsMatrix = {
      ...baseMatrix,
      [toRole]: {
        ...(baseMatrix[fromRole] || {})
      }
    };

    if (toRole === 'super_admin' || toRole === 'tenant_admin' || toRole === 'squad_lead') {
      updatedMatrix[toRole]['permissions:edit'] = true;
    }

    setPermissionsMatrix(updatedMatrix);
    onPermissionsUpdated?.(updatedMatrix);
    await persistMatrix(
      updatedMatrix,
      `Permissions cloned from '${ROLE_METADATA[fromRole].label}' to '${ROLE_METADATA[toRole].label}' (Saved)`,
      toRole
    );
  };

  // Filtered permission definitions based on search and filters
  const filteredPermissionDefs = useMemo(() => {
    return permissionDefinitions.filter(def => {
      if (permFilterModule !== 'ALL' && def.module !== permFilterModule) return false;
      if (permFilterRisk !== 'ALL' && def.riskLevel !== permFilterRisk) return false;
      if (permSearchQuery.trim()) {
        const query = permSearchQuery.toLowerCase();
        return (
          def.name.toLowerCase().includes(query) ||
          def.key.toLowerCase().includes(query) ||
          def.description.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [permissionDefinitions, permFilterModule, permFilterRisk, permSearchQuery]);

  // Group filtered definitions by module
  const groupedPermissions = useMemo(() => {
    const groups: Partial<Record<PermissionModule, PermissionDefinition[]>> = {};
    for (const def of filteredPermissionDefs) {
      if (!groups[def.module]) {
        groups[def.module] = [];
      }
      groups[def.module]!.push(def);
    }
    return groups;
  }, [filteredPermissionDefs]);

  // Role capability statistics
  const roleStats = useMemo(() => {
    if (!permissionsMatrix || !selectedRoleForPerms) {
      return { total: 0, granted: 0, critical: 0, high: 0, medium: 0, low: 0 };
    }
    const rolePerms = permissionsMatrix[selectedRoleForPerms] || {};
    let granted = 0;
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;

    for (const def of permissionDefinitions) {
      if (rolePerms[def.key]) {
        granted++;
        if (def.riskLevel === 'CRITICAL') critical++;
        else if (def.riskLevel === 'HIGH') high++;
        else if (def.riskLevel === 'MEDIUM') medium++;
        else if (def.riskLevel === 'LOW') low++;
      }
    }

    return {
      total: permissionDefinitions.length,
      granted,
      critical,
      high,
      medium,
      low
    };
  }, [permissionsMatrix, selectedRoleForPerms, permissionDefinitions]);

  const handleCopy = (text: string, keyId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(keyId);
    setTimeout(() => setCopiedKey(null), 2000);
  };


  const activeSnippetProduct = products.find(p => p.id === selectedProductForSnippet) || products[0];
  const snippetKey = activeSnippetProduct?.raw_api_key || activeSnippetProduct?.api_key_hash || 'fb_live_key';
  const embedSnippet = `<script 
  src="http://localhost:5001/v1/sdk.js" 
  data-product-key="${snippetKey}"
  async>
</script>`;

  if (!canViewSettings) {
    return (
      <div className="bg-white border border-slate-200 p-16 text-center shadow-2xs space-y-4 select-none">
        <div className="w-12 h-12 bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
          <Shield className="w-6 h-6 text-amber-600" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900 font-mono uppercase tracking-tight">
            Restricted Enterprise Configuration
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
            Platform settings, monitored product API keys, and tenant domain access controls are restricted to authorized administrators and developers. Your current active role is <span className="font-bold text-slate-800">[{currentRole}]</span>.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-16 text-center text-xs font-mono text-slate-400 border border-slate-200 bg-white rounded-md card-subtle flex flex-col items-center justify-center space-y-3 shadow-2xs select-none">
        <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
        <span>SYNCHRONIZING TENANT CONFIGURATION & RLS METRICS...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 select-none">
      
      {/* Top Header & Master Action Bar */}
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2.5 flex-wrap gap-y-1">
            <h2 className="text-lg font-bold text-slate-900 font-mono uppercase tracking-wide flex items-center space-x-2">
              <Building className="w-5 h-5 text-indigo-600" />
              <span>PLATFORM SETTINGS & GOVERNANCE</span>
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-blue-50 text-blue-800 border border-blue-200 rounded-md">
              {ROLE_METADATA[currentRole]?.label || currentRole}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md">
              RLS ACTIVE
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Tenant configuration, product API keys, origin firewall, routing policies, and dynamic RBAC matrices.
          </p>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            type="button"
            onClick={loadTenantSettings}
            disabled={isSaving}
            className="px-3.5 py-2 text-xs font-mono border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 bg-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs rounded-md"
            title="Discard unsaved local changes and reload from server"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveChanges()}
            disabled={isSaving || (!canSaveAnyTenantSettings && !hasUnsavedPerms)}
            className="px-5 py-2 bg-[#0066FF] hover:bg-blue-600 text-white text-xs font-mono font-bold flex items-center space-x-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'SAVING...' : 'SAVE ALL CHANGES'}</span>
          </button>
        </div>
      </div>

      {/* Settings Navigation Tabs Strip */}
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-2 flex items-center flex-wrap gap-1.5 shadow-2xs font-mono text-xs">
        {[
          { id: 'profile' as SettingsTab, label: 'Profile & Identity', icon: Building },
          { id: 'products' as SettingsTab, label: 'Monitored Products', icon: Key, badge: products.length },
          { id: 'security' as SettingsTab, label: 'Domain Whitelist', icon: Shield, badge: allowedDomains.length },
          { id: 'routing' as SettingsTab, label: 'Routing & Policies', icon: SlidersHorizontal },
          { id: 'permissions' as SettingsTab, label: 'Role Permissions (RBAC)', icon: ShieldCheck },
          { id: 'embed' as SettingsTab, label: 'Embed & Health Check', icon: Terminal },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 flex items-center space-x-2 font-bold text-xs transition-all cursor-pointer border rounded-md ${
                isActive
                  ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-2xs'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span className={`px-1.5 py-0.2 text-[10px] font-bold border rounded-sm ${
                  isActive ? 'bg-indigo-100 text-indigo-800 border-indigo-200' : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Success Notification Banner */}
      {saveSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xs rounded-md card-subtle">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{saveSuccessMessage}</span>
          </div>
          <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Permissions Success Notification Banner */}
      {permsSuccessMessage && (
        <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-mono flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xs rounded-md card-subtle">
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span className="font-semibold">{permsSuccessMessage}</span>
          </div>
          <button onClick={() => setPermsSuccessMessage(null)} className="text-indigo-600 hover:text-indigo-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs font-mono flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xs rounded-md card-subtle">
          <div className="flex items-center space-x-2.5">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-semibold">{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-red-600 hover:text-red-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 1. Active Tenant Profile Card */}
      {activeTab === 'profile' && (
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              Active Tenant Profile
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono text-emerald-700 font-semibold px-2 py-0.5 bg-emerald-50 border border-emerald-200 rounded-md">
              {tenant?.isolation_standard || 'PostgreSQL 16 RLS (Bank-Grade)'}
            </span>
          </div>
        </div>

        {/* Read-Only Notice if role cannot edit profile */}
        {!canEditTenantProfile && (
          <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono flex items-center space-x-2.5 shadow-2xs rounded-md card-subtle">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>READ-ONLY PROFILE:</strong> Role <strong>{ROLE_METADATA[currentRole]?.label || currentRole}</strong> cannot modify tenant settings. Only <strong>Admin</strong> and <strong>Lead Manager</strong> can make changes.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          
          {/* Editable Organization Name */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
            <label className="text-slate-500 uppercase text-[10px] font-bold block">
              Organization Name {canEditTenantProfile ? <span className="text-indigo-600 font-bold">(Editable)</span> : <span className="text-slate-400 font-normal">(Read-Only)</span>}
            </label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              disabled={!canEditTenantProfile || isSaving}
              placeholder="Enter organization name"
              className={`w-full border px-2.5 py-1.5 font-bold text-xs rounded-md focus:outline-none transition-colors ${
                !canEditTenantProfile 
                  ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' 
                  : 'bg-white border-slate-300 focus:border-indigo-600 text-slate-900'
              }`}
            />
          </div>

          {/* Tenant ID (Immutable UUID boundary) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
            <span className="text-slate-500 uppercase text-[10px] font-bold block">Tenant ID (UUID Boundary)</span>
            <div className="flex items-center justify-between">
              <p className="text-indigo-700 truncate font-bold text-xs">{currentTenantId}</p>
              <button
                type="button"
                onClick={() => handleCopy(currentTenantId, 'tenantId')}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-md cursor-pointer transition-colors"
                title="Copy Tenant ID"
              >
                {copiedKey === 'tenantId' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Plan Tier Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
            <label className="text-slate-500 uppercase text-[10px] font-bold block">
              Enterprise Plan Tier {canEditTenantProfile ? <span className="text-indigo-600 font-bold">(Editable)</span> : <span className="text-slate-400 font-normal">(Read-Only)</span>}
            </label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              disabled={!canEditTenantProfile || isSaving}
              className={`w-full border px-2.5 py-1.5 font-bold text-xs rounded-md focus:outline-none ${
                !canEditTenantProfile 
                  ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' 
                  : 'bg-white border-slate-300 focus:border-indigo-600 text-emerald-700 cursor-pointer'
              }`}
            >
              <option value="ENTERPRISE">ENTERPRISE (SOC2 + AES-256)</option>
              <option value="PRO">PRO (SLA 99.9%)</option>
              <option value="SCALE">SCALE (High Concurrency)</option>
            </select>
          </div>

          {/* Alert Webhook URL */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5 md:col-span-2">
            <label className="text-slate-500 uppercase text-[10px] font-bold flex items-center space-x-1.5">
              <Webhook className="w-3 h-3 text-indigo-600" />
              <span>Incident Alert Webhook URL (Real-time Bridge)</span>
            </label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              disabled={!canEditTenantProfile || isSaving}
              placeholder="https://api.yourcompany.com/v1/webhooks/incidents"
              className={`w-full border px-2.5 py-1.5 text-xs rounded-md focus:outline-none transition-colors ${
                !canEditTenantProfile 
                  ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' 
                  : 'bg-white border-slate-300 focus:border-indigo-600 text-slate-800'
              }`}
            />
          </div>

          {/* Security Alert Email */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
            <label className="text-slate-500 uppercase text-[10px] font-bold flex items-center space-x-1.5">
              <Mail className="w-3 h-3 text-indigo-600" />
              <span>Escalation Email</span>
            </label>
            <input
              type="email"
              value={notificationEmail}
              onChange={(e) => setNotificationEmail(e.target.value)}
              disabled={!canEditTenantProfile || isSaving}
              placeholder="alerts@yourcompany.com"
              className={`w-full border px-2.5 py-1.5 text-xs rounded-md focus:outline-none transition-colors ${
                !canEditTenantProfile 
                  ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' 
                  : 'bg-white border-slate-300 focus:border-indigo-600 text-slate-800'
              }`}
            />
          </div>

        </div>

        {/* Card Specific Update Button */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => handleSaveChanges('Tenant profile updated and saved.')}
            disabled={isSaving || !canEditTenantProfile}
            className="px-4 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
            title={!canEditTenantProfile ? "Profile editing restricted to Admin and Lead Manager" : undefined}
          >
            <Save className="w-3.5 h-3.5" />
            <span>UPDATE PROFILE</span>
          </button>
        </div>
      </div>
      )}

      {/* 2. Monitored Products & Ingestion Keys Card */}
      {activeTab === 'products' && (
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              MONITORED PRODUCTS & CLIENT INGESTION KEYS ({products.length})
            </h3>
          </div>

          {!isAddingProduct && canCreateProduct && (
            <button
              type="button"
              onClick={() => setIsAddingProduct(true)}
              className="px-3.5 py-1.5 text-xs font-mono bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs rounded-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD PRODUCT</span>
            </button>
          )}
        </div>

        {/* Read-Only Notice if role cannot create or modify products */}
        {!canCreateProduct && (
          <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono flex items-center space-x-2.5 shadow-2xs rounded-md card-subtle">
            <Lock className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>READ-ONLY PRODUCTS:</strong> Role <strong>{ROLE_METADATA[currentRole]?.label || currentRole}</strong> cannot register, edit, rotate keys, or delete products. Only <strong>Admin</strong> and <strong>Lead Manager</strong> can make changes.
            </span>
          </div>
        )}

        {/* Add Product Inline Form */}
        {isAddingProduct && (
          <form onSubmit={handleCreateProduct} className="p-4 bg-slate-50 border border-indigo-200 rounded-md card-subtle space-y-3 font-mono text-xs animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
              <span className="font-bold text-indigo-900 uppercase flex items-center space-x-1.5">
                <Plus className="w-4 h-4 text-indigo-600" />
                <span>Register New Product & Ingestion Key</span>
              </span>
              <button type="button" onClick={() => setIsAddingProduct(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[10px] text-slate-600 uppercase font-bold">Product Name *</label>
                <input
                  type="text"
                  value={newProductName}
                  onChange={(e) => setNewProductName(e.target.value)}
                  placeholder="e.g. Mobile iOS Application"
                  required
                  className="w-full bg-white border border-slate-300 focus:border-indigo-600 p-2 text-slate-900 focus:outline-none rounded-md"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-600 uppercase font-bold">Environment</label>
                <select
                  value={newProductEnv}
                  onChange={(e) => setNewProductEnv(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 focus:border-indigo-600 p-2 text-slate-900 focus:outline-none cursor-pointer rounded-md"
                >
                  <option value="production">Production</option>
                  <option value="staging">Staging</option>
                  <option value="development">Development</option>
                </select>
              </div>

              <div className="sm:col-span-3 space-y-1">
                <label className="text-[10px] text-slate-600 uppercase font-bold">Description (Optional)</label>
                <input
                  type="text"
                  value={newProductDesc}
                  onChange={(e) => setNewProductDesc(e.target.value)}
                  placeholder="e.g. Native iOS payment SDK and in-app checkout screen"
                  className="w-full bg-white border border-slate-300 focus:border-indigo-600 p-2 text-slate-900 focus:outline-none rounded-md"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingProduct(false)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-white cursor-pointer rounded-md"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50 rounded-md"
              >
                <Key className="w-3.5 h-3.5" />
                <span>GENERATE & REGISTER PRODUCT KEY</span>
              </button>
            </div>
          </form>
        )}

        {/* Product Cards List */}
        <div className="space-y-3">
          {products.length === 0 ? (
            <p className="p-6 text-center text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200 rounded-md">
              No monitored products registered yet. Click '+ ADD PRODUCT' to generate your first client ingestion key.
            </p>
          ) : (
            products.map((prod) => {
              const currentKey = prod.raw_api_key || prod.api_key_hash;
              const isEditingThis = editingProductId === prod.id;

              return (
                <div 
                  key={prod.id} 
                  className="p-4 bg-slate-50 border border-slate-200 rounded-md space-y-3 text-xs font-mono shadow-2xs"
                >
                  {isEditingThis ? (
                    // Inline Edit Mode
                    <div className="space-y-3 animate-in fade-in duration-150">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-2 space-y-1">
                          <label className="text-[10px] text-slate-600 uppercase">Product Name</label>
                          <input
                            type="text"
                            value={editProductName}
                            onChange={(e) => setEditProductName(e.target.value)}
                            className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-slate-900 font-bold text-xs focus:outline-none focus:border-indigo-600 rounded-md"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-600 uppercase">Environment</label>
                          <select
                            value={editProductEnv}
                            onChange={(e) => setEditProductEnv(e.target.value as any)}
                            className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-indigo-600 cursor-pointer rounded-md"
                          >
                            <option value="production">Production</option>
                            <option value="staging">Staging</option>
                            <option value="development">Development</option>
                          </select>
                        </div>
                        <div className="sm:col-span-3 space-y-1">
                          <label className="text-[10px] text-slate-600 uppercase">Description</label>
                          <input
                            type="text"
                            value={editProductDesc}
                            onChange={(e) => setEditProductDesc(e.target.value)}
                            placeholder="Product description"
                            className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-slate-800 text-xs focus:outline-none focus:border-indigo-600 rounded-md"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setEditingProductId(null)}
                          className="px-3 py-1 border border-slate-300 text-slate-700 hover:bg-white cursor-pointer rounded-md"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveProductEdit(prod.id)}
                          className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center space-x-1.5 cursor-pointer rounded-md"
                        >
                          <Save className="w-3.5 h-3.5" />
                          <span>SAVE PRODUCT</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    // Normal Display Mode
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-slate-900 font-bold text-sm tracking-wide truncate">{prod.name}</span>
                          <span className={`px-2 py-0.5 text-[10px] uppercase font-bold border rounded-md ${
                            prod.environment === 'production' 
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-semibold' 
                              : prod.environment === 'staging'
                              ? 'bg-blue-50 text-blue-800 border-blue-300 font-semibold'
                              : 'bg-amber-50 text-amber-800 border-amber-300 font-semibold'
                          }`}>
                            {prod.environment}
                          </span>
                        </div>
                        {prod.description && (
                          <p className="text-slate-600 text-xs">{prod.description}</p>
                        )}
                        <p className="text-slate-500 text-[11px] truncate flex items-center space-x-1.5">
                          <span className="text-slate-400 font-medium">Key:</span>
                          <code className="text-indigo-700 font-semibold bg-white px-2 py-0.5 border border-slate-200 rounded-md">{currentKey}</code>
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(currentKey, prod.id)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs font-semibold rounded-md"
                        >
                          {copiedKey === prod.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === prod.id ? 'COPIED' : 'COPY KEY'}</span>
                        </button>

                        {canEditProduct && (
                          <button
                            type="button"
                            onClick={() => handleStartEditProduct(prod)}
                            title="Edit product details"
                            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs font-semibold rounded-md"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Edit</span>
                          </button>
                        )}

                        {canRotateProductKeys && (
                          <button
                            type="button"
                            onClick={() => handleRotateKey(prod.id, prod.name)}
                            title="Rotate API Key"
                            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-amber-300 text-slate-600 hover:text-amber-800 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs font-semibold rounded-md"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Rotate</span>
                          </button>
                        )}

                        {canDeleteProduct && (
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(prod.id, prod.name)}
                            title={products.length <= 1 ? "A tenant must retain at least one product" : "Delete Product"}
                            disabled={products.length <= 1}
                            className="p-1.5 bg-white border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 transition-colors cursor-pointer shadow-2xs rounded-md disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* 3. Domain Origin Whitelist Card */}
      {activeTab === 'security' && (
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              DOMAIN ORIGIN WHITELIST (ANTI-SPOOFING FIREWALL)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500 font-semibold px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200">
            {allowedDomains.length} DOMAINS PERMITTED
          </span>
        </div>

        <div className="space-y-3 text-xs font-mono">
          {!canManageDomains && (
            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono flex items-center space-x-2.5 shadow-2xs rounded-md card-subtle">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>READ-ONLY WHITELIST:</strong> Role <strong>{ROLE_METADATA[currentRole]?.label || currentRole}</strong> cannot modify permitted origin domains. Only <strong>Admin</strong> and <strong>Lead Manager</strong> can make changes.
              </span>
            </div>
          )}

          <p className="text-slate-500 text-[11px]">
            Only requests with origin headers matching these domains will be ingested into this tenant's incident queue:
          </p>

          {/* Interactive Domain Pills */}
          <div className="flex flex-wrap gap-2 pt-1">
            {allowedDomains.length === 0 ? (
              <span className="text-slate-400 italic">No domains whitelisted. Add your application domains below.</span>
            ) : (
              allowedDomains.map((d) => (
                <span 
                  key={d} 
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-800 flex items-center space-x-2 group hover:border-slate-300 transition-colors shadow-2xs rounded-md"
                >
                  <Globe className="w-3 h-3 text-indigo-600" />
                  <span className="font-semibold">{d}</span>
                  {canManageDomains && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDomain(d)}
                      className="text-slate-400 hover:text-red-600 p-0.5 rounded-sm transition-colors cursor-pointer"
                      title="Remove domain"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              ))
            )}
          </div>

          {/* Add Domain Input Form */}
          {canManageDomains && (
            <form onSubmit={handleAddDomain} className="flex items-center space-x-2 pt-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. payments.acme.com or localhost:3000"
                className="flex-1 bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 rounded-md focus:outline-none focus:border-indigo-600 transition-colors"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center space-x-1.5 rounded-md transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Domain</span>
              </button>
            </form>
          )}

          {/* Dedicated Whitelist Update Button */}
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleSaveChanges('Domain whitelist updated and saved.')}
              disabled={isSaving || !canManageDomains}
              className="px-4 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-mono font-bold flex items-center space-x-1.5 rounded-md transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canManageDomains ? "Domain management restricted to Admin and Lead Manager" : undefined}
            >
              <Save className="w-3.5 h-3.5" />
              <span>UPDATE WHITELIST</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 4. Incident Routing & Telemetry Policies Card */}
      {activeTab === 'routing' && (
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              INCIDENT ROUTING & TELEMETRY POLICIES
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500 font-semibold">AUTOMATION & TRIAGE</span>
        </div>

        <div className="space-y-4 font-mono text-xs">
          {!canManagePolicies && (
            <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono flex items-center space-x-2.5 shadow-2xs rounded-md">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>READ-ONLY POLICIES:</strong> Role <strong>{ROLE_METADATA[currentRole]?.label || currentRole}</strong> cannot modify telemetry and routing policies. Only <strong>Admin</strong> and <strong>Lead Manager</strong> can make changes.
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Default Squad Assignment */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
              <label className="text-slate-600 uppercase text-[10px] font-bold block">
                Default Squad Assignment {canManagePolicies ? <span className="text-indigo-600 font-bold">(Editable)</span> : <span className="text-slate-400 font-normal">(Read-Only)</span>}
              </label>
              <select
                value={defaultSquad}
                onChange={(e) => setDefaultSquad(e.target.value)}
                disabled={!canManagePolicies || isSaving}
                className={`w-full border px-2.5 py-1.5 font-bold text-xs rounded-md focus:outline-none ${
                  !canManagePolicies 
                    ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed' 
                    : 'bg-white border-slate-300 text-indigo-700 focus:border-indigo-600 cursor-pointer'
                }`}
              >
                <option value="Core Platform & API Squad">Core Platform & API Squad</option>
                <option value="Checkout & Billing Squad">Checkout & Billing Squad</option>
                <option value="Merchant Admin Portal Squad">Merchant Admin Portal Squad</option>
                <option value="Frontend & Mobile Squad">Frontend & Mobile Squad</option>
                <option value="DevOps & Reliability Squad">DevOps & Reliability Squad</option>
              </select>
            </div>

            {/* User Email Requirement */}
            <div className={`p-3 border rounded-md flex items-center justify-between ${!canManagePolicies ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="space-y-0.5">
                <span className="text-slate-900 font-bold block text-xs">Require Reporter Email</span>
                <span className="text-[11px] text-slate-500 block">Enforces valid user email for ticket submission</span>
              </div>
              <input
                type="checkbox"
                checked={requireEmail}
                onChange={(e) => setRequireEmail(e.target.checked)}
                disabled={!canManagePolicies || isSaving}
                className="w-4 h-4 accent-indigo-600 rounded-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Console Log Capture Toggle */}
            <div className={`p-3 border rounded-md flex items-center justify-between ${!canManagePolicies ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="space-y-0.5">
                <span className="text-slate-900 font-bold block text-xs">Auto-Capture Browser Console Logs</span>
                <span className="text-[11px] text-slate-500 block">Captures console errors and exceptions</span>
              </div>
              <input
                type="checkbox"
                checked={autoCaptureTelemetry}
                onChange={(e) => setAutoCaptureTelemetry(e.target.checked)}
                disabled={!canManagePolicies || isSaving}
                className="w-4 h-4 accent-indigo-600 rounded-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            {/* Network API Failure Capture Toggle */}
            <div className={`p-3 border rounded-md flex items-center justify-between ${!canManagePolicies ? 'bg-slate-100/70 border-slate-200' : 'bg-slate-50 border-slate-200'}`}>
              <div className="space-y-0.5">
                <span className="text-slate-900 font-bold block text-xs">Auto-Capture Network API Failures</span>
                <span className="text-[11px] text-slate-500 block">Tracks 4xx/5xx HTTP failures for diagnostics</span>
              </div>
              <input
                type="checkbox"
                checked={autoCaptureNetwork}
                onChange={(e) => setAutoCaptureNetwork(e.target.checked)}
                disabled={!canManagePolicies || isSaving}
                className="w-4 h-4 accent-indigo-600 rounded-sm cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

          </div>

          {/* Dedicated Policies Update Button */}
          <div className="flex justify-end pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => handleSaveChanges('Incident routing and telemetry policies updated.')}
              disabled={isSaving || !canManagePolicies}
              className="px-4 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 hover:bg-indigo-50 text-xs font-mono font-bold flex items-center space-x-1.5 rounded-md transition-colors cursor-pointer shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canManagePolicies ? "Policy configuration restricted to Admin and Lead Manager" : undefined}
            >
              <Save className="w-3.5 h-3.5" />
              <span>UPDATE POLICIES</span>
            </button>
          </div>
        </div>
      </div>
      )}

      {/* 5. Role-Based Access Control (RBAC) & Dynamic Permissions Matrix */}
      {activeTab === 'permissions' && (
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 space-y-4 shadow-2xs">

        {/* Header & Action Bar matching screenshot */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-start space-x-3">
            <div className="w-9 h-9 bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0 mt-0.5 rounded-md">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center flex-wrap gap-2.5">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight uppercase">
                  ROLE-BASED ACCESS CONTROL (DYNAMIC RBAC MATRIX)
                </h3>
                <span className="text-[10px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 font-semibold px-2 py-0.5 uppercase rounded-md">
                  5 MODULES • 23 PERMISSIONS
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Configure granular module capabilities per role. Dynamically bound to tenant context and enforced by PostgreSQL RLS.
              </p>
            </div>
          </div>

          {/* Action Buttons Right Side */}
          <div className="flex flex-col sm:items-end gap-2.5 shrink-0">
            <div className="flex items-center space-x-2">
              {/* View Switcher: Role Drilldown vs Full 2D Matrix */}
              <div className="inline-flex bg-slate-100 border border-slate-200 p-0.5 rounded-md">
                <button
                  type="button"
                  onClick={() => setPermMatrixView('cards')}
                  className={`px-3 py-1.5 text-xs uppercase font-mono font-bold transition-colors cursor-pointer rounded-md ${
                    permMatrixView === 'cards' 
                      ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ROLE DRILLDOWN
                </button>
                <button
                  type="button"
                  onClick={() => setPermMatrixView('grid')}
                  className={`px-3 py-1.5 text-xs uppercase font-mono font-medium transition-colors cursor-pointer rounded-md ${
                    permMatrixView === 'grid' 
                      ? 'bg-white text-indigo-600 shadow-2xs border border-slate-200' 
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  FULL 2D MATRIX
                </button>
              </div>

              {/* Reset to Presets Button */}
              <button
                type="button"
                onClick={() => handleResetPermissions()}
                disabled={isSavingPerms || !canResetPermissions}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 hover:text-slate-900 flex items-center space-x-1.5 text-xs font-mono transition-colors cursor-pointer shadow-2xs rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                title="Restore baseline security presets"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>Reset Defaults</span>
              </button>
            </div>

            {/* Save Permissions Matrix Button */}
            <button
              type="button"
              onClick={handleSavePermissions}
              disabled={isSavingPerms || !canEditPermissions}
              className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer rounded-md disabled:opacity-50 disabled:cursor-not-allowed shadow-xs ${
                hasUnsavedPerms
                  ? 'bg-[#0066FF] hover:bg-blue-600 text-white'
                  : 'bg-[#5046e5] hover:bg-indigo-700 text-white'
              }`}
            >
              {isSavingPerms ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isSavingPerms ? 'SAVING...' : hasUnsavedPerms ? 'SAVE PERMISSIONS (UNSAVED)' : 'SAVE PERMISSIONS'}</span>
            </button>
          </div>
        </div>

        {/* Read-Only Mode Banner if user role lacks permissions:edit */}
        {!canEditPermissions && (
          <div className="p-3.5 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-mono flex items-center justify-between shadow-2xs rounded-md card-subtle">
            <div className="flex items-center space-x-2.5">
              <Lock className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>READ-ONLY RBAC VIEW:</strong> Your active role <strong>{ROLE_METADATA[currentRole]?.label || currentRole}</strong> cannot modify security permissions. Only <strong>Admin</strong> and <strong>Lead Manager</strong> can make changes.
              </span>
            </div>
          </div>
        )}

        {/* Unsaved Changes Notification Banner */}
        {hasUnsavedPerms && (
          <div className="p-3 bg-blue-50 border border-blue-200 text-blue-900 text-xs flex items-center justify-between shadow-2xs rounded-md card-subtle">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                You have modified permissions for <strong>{ROLE_METADATA[selectedRoleForPerms].label}</strong>. Click 'SAVE PERMISSIONS' to persist your changes.
              </span>
            </div>
            <button
              type="button"
              onClick={handleSavePermissions}
              disabled={isSavingPerms}
              className="px-3 py-1 bg-[#0066FF] hover:bg-blue-600 text-white font-medium text-xs cursor-pointer shrink-0 rounded-md"
            >
              Save Now
            </button>
          </div>
        )}

        {/* VIEW 1: ROLE DRILLDOWN CARDS VIEW */}
        {permMatrixView === 'cards' && (
          <div className="space-y-4">
            
            {/* 6 Role Selection Cards Grid matching screenshot */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {ALL_SYSTEM_ROLES.map((roleKey) => {
                const meta = ROLE_METADATA[roleKey];
                const isSelected = selectedRoleForPerms === roleKey;
                const rolePermCount = permissionsMatrix 
                  ? Object.values(permissionsMatrix[roleKey] || {}).filter(Boolean).length 
                  : 0;

                return (
                  <div
                    key={roleKey}
                    onClick={() => setSelectedRoleForPerms(roleKey)}
                    className={`p-3 bg-white transition-all cursor-pointer select-none relative rounded-md ${
                      isSelected
                        ? 'border-2 border-indigo-600 shadow-2xs'
                        : 'border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {isSelected && (
                      <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full absolute top-3 right-3" />
                    )}
                    <div className="text-[10px] font-mono text-slate-500 font-semibold tracking-wider uppercase mb-1">
                      {meta.badge}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mb-2 truncate">
                      {meta.label}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500 font-mono">
                      <span>Granted:</span>
                      <span className="font-bold text-slate-800 font-mono">
                        {rolePermCount} / {permissionDefinitions.length || 23}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Active Selected Role Summary & Fast Controls Banner matching screenshot */}
            <div className="bg-white border border-slate-200 rounded-md card-subtle p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center flex-wrap gap-2">
                  <h3 className="text-base font-bold text-slate-900">
                    {ROLE_METADATA[selectedRoleForPerms].label}
                  </h3>
                  <span className="px-2 py-0.5 text-[10px] font-mono font-semibold uppercase text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-md">
                    {ROLE_METADATA[selectedRoleForPerms].badge}
                  </span>
                  {selectedRoleForPerms === currentRole && (
                    <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase text-blue-700 bg-blue-100/70 border border-blue-300 rounded-md">
                      YOUR ACTIVE ROLE
                    </span>
                  )}
                </div>

                {/* Right: Clone from and Reset Role */}
                <div className="flex items-center space-x-2 shrink-0">
                  <span className="text-xs text-slate-500 font-medium">Clone from:</span>
                  <select
                    value={copySourceRole}
                    onChange={(e) => setCopySourceRole(e.target.value as UserRole)}
                    className="bg-white border border-slate-200 text-slate-800 text-xs px-2.5 py-1 focus:outline-none cursor-pointer rounded-md"
                  >
                    {ALL_SYSTEM_ROLES.filter(r => r !== selectedRoleForPerms).map(r => (
                      <option key={r} value={r}>{ROLE_METADATA[r].label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => handleCopyPermissions(copySourceRole, selectedRoleForPerms)}
                    disabled={!canEditPermissions || isSavingPerms}
                    className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 transition-colors cursor-pointer rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clone
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetPermissions(selectedRoleForPerms)}
                    disabled={!canResetPermissions || isSavingPerms}
                    className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 transition-colors cursor-pointer rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Reset this role to baseline defaults"
                  >
                    Reset Role
                  </button>
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-600 leading-relaxed">
                {ROLE_METADATA[selectedRoleForPerms].desc}
              </p>

              {/* Risk Badges Row */}
              <div className="flex items-center flex-wrap gap-4 pt-1 text-xs font-mono">
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-600 font-medium">Total Granted:</span>
                  <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 font-mono font-bold text-slate-800 rounded-md">
                    {roleStats.granted} / {roleStats.total}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-rose-600 font-medium">Critical Risk:</span>
                  <span className="px-2 py-0.5 bg-rose-50 border border-rose-300 font-mono font-bold text-rose-600 rounded-md">
                    {roleStats.critical}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-amber-600 font-medium">High Risk:</span>
                  <span className="px-2 py-0.5 bg-amber-50 border border-amber-300 font-mono font-bold text-amber-600 rounded-md">
                    {roleStats.high}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-blue-600 font-medium">Medium Risk:</span>
                  <span className="px-2 py-0.5 bg-blue-50 border border-blue-300 font-mono font-bold text-blue-600 rounded-md">
                    {roleStats.medium}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-600 font-medium">Low Risk:</span>
                  <span className="px-2 py-0.5 bg-slate-50 border border-slate-300 font-mono font-bold text-slate-600 rounded-md">
                    {roleStats.low}
                  </span>
                </div>
              </div>
            </div>

            {/* Filter and Search Bar matching screenshot */}
            <div className="border border-slate-200 rounded-md card-subtle bg-white p-2.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              {/* Search */}
              <div className="flex items-center space-x-2 flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={permSearchQuery}
                  onChange={(e) => setPermSearchQuery(e.target.value)}
                  placeholder="Filter permissions by name, code key, or des..."
                  className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 focus:outline-none"
                />
                {permSearchQuery && (
                  <button
                    onClick={() => setPermSearchQuery('')}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Module Filter Pills */}
              <div className="flex items-center flex-wrap gap-1.5">
                <span className="text-[11px] font-mono text-slate-500 font-semibold mr-1">MODULE:</span>
                {(['ALL', 'tickets', 'products', 'tenant', 'permissions', 'audit'] as const).map((modKey) => {
                  const isActive = permFilterModule === modKey;
                  return (
                    <button
                      key={modKey}
                      type="button"
                      onClick={() => setPermFilterModule(modKey)}
                      className={`px-2.5 py-1 text-xs uppercase font-mono transition-colors cursor-pointer rounded-md ${
                        isActive
                          ? 'bg-black text-white font-bold'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {modKey}
                    </button>
                  );
                })}
              </div>

              {/* Risk Selector */}
              <div className="flex items-center space-x-1.5 shrink-0">
                <span className="text-[11px] font-mono text-slate-500 font-semibold">RISK:</span>
                <select
                  value={permFilterRisk}
                  onChange={(e) => setPermFilterRisk(e.target.value)}
                  className="border border-slate-200 bg-white text-slate-800 px-2 py-1 text-xs uppercase font-mono focus:outline-none cursor-pointer rounded-md"
                >
                  <option value="ALL">ALL RISKS</option>
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="MEDIUM">MEDIUM</option>
                  <option value="LOW">LOW</option>
                </select>
              </div>
            </div>

            {/* Module Cards with 2-Column Grid of Permission Cards matching screenshot */}
            <div className="space-y-4">
              {(['tickets', 'products', 'tenant', 'permissions', 'audit'] as PermissionModule[]).map((modKey) => {
                const defs = groupedPermissions[modKey];
                if (!defs || defs.length === 0) return null;

                const modMeta = MODULE_METADATA[modKey];
                const ModIcon = modMeta.icon;
                const grantedInMod = defs.filter(d => Boolean(permissionsMatrix?.[selectedRoleForPerms]?.[d.key])).length;

                return (
                  <div key={modKey} className="border border-slate-200 rounded-md card-subtle bg-white overflow-hidden">
                    
                    {/* Module Header Bar */}
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2.5">
                          <ModIcon className="w-4 h-4 text-indigo-600 shrink-0" />
                          <h4 className="font-bold text-slate-900 text-sm">
                            {modMeta.label}
                          </h4>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 font-semibold rounded-md">
                            {grantedInMod} / {defs.length} Granted
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          {modMeta.desc}
                        </p>
                      </div>

                      {/* Module Action Buttons: Grant All / Revoke All */}
                      <div className="flex items-center space-x-2 shrink-0 text-xs">
                        <button
                          type="button"
                          disabled={!canEditPermissions || isSavingPerms}
                          onClick={() => handleGrantAllInModule(selectedRoleForPerms, modKey)}
                          className="px-3 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-medium text-xs transition-colors cursor-pointer rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Grant All
                        </button>
                        <button
                          type="button"
                          disabled={!canEditPermissions || isSavingPerms}
                          onClick={() => handleRevokeAllInModule(selectedRoleForPerms, modKey)}
                          className="px-3 py-1 bg-white hover:bg-rose-50 border border-slate-200 text-rose-600 font-medium text-xs transition-colors cursor-pointer rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Revoke All
                        </button>
                      </div>
                    </div>

                    {/* 2-Column Grid of Permission Cards */}
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {defs.map((def) => {
                        const isGranted = Boolean(permissionsMatrix?.[selectedRoleForPerms]?.[def.key]);
                        const isGovernanceLock = (selectedRoleForPerms === 'super_admin' || selectedRoleForPerms === 'tenant_admin' || selectedRoleForPerms === 'squad_lead') && def.key === 'permissions:edit';

                        return (
                          <div
                            key={def.key}
                            onClick={() => {
                              if (!isGovernanceLock && canEditPermissions) {
                                handleTogglePermission(selectedRoleForPerms, def.key);
                              }
                            }}
                            className={`p-3.5 border transition-all select-none flex items-start space-x-3 rounded-md ${
                              isGranted
                                ? 'bg-blue-50/20 border-blue-200'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            } ${!isGovernanceLock && canEditPermissions ? 'cursor-pointer' : 'cursor-not-allowed opacity-80'}`}
                            title={isGovernanceLock ? "Admin and Lead governance permission cannot be revoked" : !canEditPermissions ? "Read-only: Your role cannot edit permissions" : isGranted ? "Click to revoke" : "Click to grant"}
                          >
                            {/* Blue Checkbox */}
                            <div className="shrink-0 mt-0.5">
                              <div
                                className={`w-4 h-4 flex items-center justify-center transition-colors border rounded-sm ${
                                  isGranted
                                    ? 'bg-[#0066FF] border-[#0066FF] text-white'
                                    : 'bg-white border-slate-300 text-transparent'
                                }`}
                              >
                                {isGovernanceLock ? (
                                  <Lock className="w-3 h-3 text-white" />
                                ) : (
                                  <Check className={`w-3 h-3 stroke-[3] ${isGranted ? 'opacity-100' : 'opacity-0'}`} />
                                )}
                              </div>
                            </div>

                            {/* Card Content: Title, Risk Badge, Description */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-bold text-slate-900 leading-tight">
                                  {def.name}
                                </span>
                                <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 border rounded-md ${
                                  def.riskLevel === 'CRITICAL'
                                    ? 'bg-rose-50 text-rose-700 border-rose-200'
                                    : def.riskLevel === 'HIGH'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : def.riskLevel === 'MEDIUM'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                  {def.riskLevel}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                {def.description}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                  </div>
                );
              })}
            </div>

          </div>
        )}

        {/* VIEW 2: FULL 2D CROSS-ROLE MATRIX GRID VIEW */}
        {permMatrixView === 'grid' && (
          <div className="border border-slate-200 shadow-2xs font-mono text-xs w-full max-w-full overflow-hidden rounded-md card-subtle">
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                  <th className="p-2.5 border-b border-slate-800 font-bold">
                    MODULE & PERMISSION KEY
                  </th>
                  {ALL_SYSTEM_ROLES.map(role => (
                    <th key={role} className="p-2 border-b border-slate-800 text-center font-bold">
                      <div className="truncate text-[11px]">{ROLE_METADATA[role].label}</div>
                      <div className="text-[8px] text-slate-400 font-normal">{ROLE_METADATA[role].badge}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {(['tickets', 'products', 'tenant', 'permissions', 'audit'] as PermissionModule[]).map((modKey) => {
                  const defs = permissionDefinitions.filter(p => p.module === modKey);
                  const modMeta = MODULE_METADATA[modKey];

                  return (
                    <React.Fragment key={modKey}>
                      {/* Module Sub-Header */}
                      <tr className="bg-slate-100 font-bold text-slate-800">
                        <td colSpan={7} className="px-3 py-2 text-[11px] uppercase tracking-wide bg-slate-100 border-y border-slate-200">
                          <span className="text-indigo-700 mr-2">[{modKey.toUpperCase()}]</span>
                          {modMeta.label}
                        </td>
                      </tr>

                      {defs.map((def) => (
                        <tr key={def.key} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3 align-middle">
                            <div className="font-bold text-slate-900 text-xs">{def.name}</div>
                            <div className="flex items-center space-x-2 mt-0.5">
                              <code className="text-[10px] text-indigo-700 bg-slate-50 px-1 border border-slate-200 font-medium rounded-md">
                                {def.key}
                              </code>
                              <span className={`px-1 text-[8px] uppercase font-bold border rounded-md ${
                                def.riskLevel === 'CRITICAL' ? 'bg-rose-50 text-rose-800 border-rose-300' :
                                def.riskLevel === 'HIGH' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                                def.riskLevel === 'MEDIUM' ? 'bg-blue-50 text-blue-800 border-blue-300' :
                                'bg-slate-50 text-slate-700 border-slate-300'
                              }`}>
                                {def.riskLevel}
                              </span>
                            </div>
                          </td>

                          {ALL_SYSTEM_ROLES.map((role) => {
                            const isGranted = Boolean(permissionsMatrix?.[role]?.[def.key]);
                            const isGovernanceLock = (role === 'super_admin' || role === 'tenant_admin' || role === 'squad_lead') && def.key === 'permissions:edit';

                            return (
                              <td key={role} className="p-3 text-center align-middle">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isGovernanceLock && canEditPermissions) {
                                      handleTogglePermission(role, def.key);
                                    }
                                  }}
                                  disabled={isGovernanceLock || !canEditPermissions || isSavingPerms}
                                  className={`w-7 h-7 mx-auto flex items-center justify-center transition-colors border rounded-md ${
                                    isGranted
                                      ? 'bg-emerald-600 border-emerald-700 text-white shadow-2xs'
                                      : 'bg-slate-100 border-slate-200 text-slate-400 hover:border-slate-300'
                                  } ${!isGovernanceLock && canEditPermissions ? 'cursor-pointer hover:scale-105' : 'cursor-not-allowed opacity-70'}`}
                                  title={isGovernanceLock ? "Admin and Lead governance permission cannot be revoked" : !canEditPermissions ? "Read-only: Your role cannot edit permissions" : `${isGranted ? 'Granted' : 'Denied'} for ${ROLE_METADATA[role].label}`}
                                >
                                  {isGovernanceLock ? (
                                    <Lock className="w-3.5 h-3.5 text-white" />
                                  ) : isGranted ? (
                                    <Check className="w-4 h-4" />
                                  ) : (
                                    <X className="w-3 h-3" />
                                  )}
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 5.1 LIVE PERMISSION SIMULATOR & SECURITY POLICY CHECKER */}
        <div className="p-4 bg-slate-50/70 border border-slate-200 space-y-3 font-mono text-xs shadow-2xs rounded-md card-subtle">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-indigo-600" />
              <span className="font-semibold text-slate-900 text-xs">
                Live Policy Evaluator & Permission Simulator
              </span>
            </div>
            <span className="text-[10px] text-slate-500">
              Interactive test against active tenant RBAC state
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Test Role Picker */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase font-semibold block">
                1. Test Subject Role
              </label>
              <select
                value={testRoleKey}
                onChange={(e) => setTestRoleKey(e.target.value as UserRole)}
                className="w-full bg-white border border-slate-200 text-slate-900 px-3 py-2 text-xs focus:outline-none focus:border-indigo-600 cursor-pointer rounded-md"
              >
                {ALL_SYSTEM_ROLES.map(r => (
                  <option key={r} value={r}>
                    {ROLE_METADATA[r].label} ({ROLE_METADATA[r].badge})
                  </option>
                ))}
              </select>
            </div>

            {/* Test Permission Action Picker */}
            <div className="space-y-1">
              <label className="text-[10px] text-slate-500 uppercase font-semibold block">
                2. Target Operation / Permission Key
              </label>
              <select
                value={testActionKey}
                onChange={(e) => setTestActionKey(e.target.value as PermissionKey)}
                className="w-full bg-white border border-slate-200 text-slate-900 px-3 py-2 text-xs focus:outline-none focus:border-indigo-600 cursor-pointer rounded-md"
              >
                {permissionDefinitions.map(p => (
                  <option key={p.key} value={p.key}>
                    [{p.module.toUpperCase()}] {p.name} ({p.key})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Dynamic Evaluation Output */}
          {(() => {
            const isTestAuthorized = testRoleKey === 'super_admin' || 
              Boolean(permissionsMatrix?.[testRoleKey]?.[testActionKey]);
            const targetDef = permissionDefinitions.find(p => p.key === testActionKey);

            return (
              <div className={`p-3 border transition-colors rounded-md ${
                isTestAuthorized
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    {isTestAuthorized ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
                    )}
                    <span className="font-semibold text-xs">
                      {isTestAuthorized ? 'ACCESS GRANTED (HTTP 200)' : 'ACCESS DENIED (HTTP 403 FORBIDDEN)'}
                    </span>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] font-mono font-medium border rounded-md ${
                    isTestAuthorized ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-rose-100 text-rose-900 border-rose-300'
                  }`}>
                    {isTestAuthorized ? 'AUTHORIZED' : 'RESTRICTED'}
                  </span>
                </div>

                <div className="mt-2 text-[11px] space-y-1 text-slate-600">
                  <p>
                    • Operation: <strong className="text-slate-800">{targetDef?.name}</strong> (<code className="font-mono text-indigo-700">{testActionKey}</code>)
                  </p>
                  <p>
                    • Policy Rule: {isTestAuthorized 
                      ? `Role '${ROLE_METADATA[testRoleKey].label}' is actively granted '${testActionKey}'. Backend middleware and PostgreSQL RLS will approve execution.` 
                      : `Role '${ROLE_METADATA[testRoleKey].label}' is NOT granted '${testActionKey}'. Incoming requests will be blocked.`}
                  </p>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Card Footer Update Action Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
          <div className="text-slate-500 text-[11px]">
            Changes are immediately applied to live Express middleware and synced to database storage.
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => handleResetPermissions(selectedRoleForPerms)}
              disabled={isSavingPerms}
              className="px-3.5 py-1.5 border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 bg-white flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50 font-medium rounded-md"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Reset {ROLE_METADATA[selectedRoleForPerms].label}</span>
            </button>
            <button
              type="button"
              onClick={handleSavePermissions}
              disabled={isSavingPerms}
              className={`px-5 py-1.5 text-white font-semibold flex items-center space-x-2 shadow-xs transition-all cursor-pointer rounded-md disabled:opacity-50 ${
                hasUnsavedPerms ? 'bg-[#0066FF] hover:bg-blue-600' : 'bg-slate-900 hover:bg-slate-800'
              }`}
            >
              {isSavingPerms ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isSavingPerms ? 'Saving...' : 'Save Permissions'}</span>
            </button>
          </div>
        </div>

      </div>
      )}

      {/* 6. Client Embed Script Generator & Live Verification Card */}
      {activeTab === 'embed' && (
      <div className="bg-white border border-slate-200 rounded-md card-subtle p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Terminal className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              CLIENT EMBED SCRIPT & LIVE VERIFICATION
            </h3>
          </div>


          <div className="flex items-center space-x-3 text-xs font-mono">
            {products.length > 1 && (
              <div className="flex items-center space-x-1.5">
                <span className="text-slate-500 text-[11px]">Product:</span>
                <select
                  value={selectedProductForSnippet}
                  onChange={(e) => setSelectedProductForSnippet(e.target.value)}
                  className="bg-white border border-slate-300 text-indigo-700 px-2 py-1 focus:outline-none focus:border-indigo-600 cursor-pointer rounded-md"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Test Ping Diagnostic Button */}
            <button
              type="button"
              onClick={handleTestPing}
              disabled={pingStatus.loading}
              title="Send verification ping to client ingestion API"
              className="px-3 py-1 bg-white border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-700 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs rounded-md disabled:opacity-50"
            >
              <Zap className={`w-3.5 h-3.5 ${pingStatus.loading ? 'animate-spin text-amber-500' : 'text-emerald-600'}`} />
              <span>{pingStatus.loading ? 'TESTING...' : 'TEST INGESTION ENDPOINT'}</span>
            </button>
          </div>
        </div>

        <div className="space-y-3 font-mono">
          <p className="text-xs text-slate-500">
            Paste this snippet into any client application header to enable the 1-click feedback widget and telemetry collection:
          </p>

          <div className="relative">
            <pre className="bg-[#0B112C] border border-[#152042] p-4 text-xs text-indigo-300 whitespace-pre-wrap break-all leading-relaxed max-w-full rounded-md">
              {embedSnippet}
            </pre>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(embedSnippet);
                setCopiedSnippet(true);
                setTimeout(() => setCopiedSnippet(false), 2000);
              }}
              className="absolute top-2.5 right-2.5 px-3 py-1.5 bg-[#152042] border border-[#23356D] hover:border-slate-500 text-slate-200 hover:text-white text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer font-semibold rounded-md"
            >
              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnippet ? 'COPIED' : 'COPY SCRIPT'}</span>
            </button>
          </div>

          {/* Diagnostic Test Ping Results Display */}
          {pingStatus.tested && (
            <div className={`p-3 border text-xs font-mono animate-in fade-in duration-200 shadow-2xs rounded-md card-subtle ${
              pingStatus.online 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
                : 'bg-red-50 border-red-200 text-red-900'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Server className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold">
                    INGESTION BRIDGE STATUS: {pingStatus.online ? 'ONLINE & READY' : 'OFFLINE / UNREACHABLE'}
                  </span>
                </div>
                {pingStatus.latencyMs && (
                  <span className="text-[11px] font-semibold text-emerald-700">
                    ROUNDTRIP: {pingStatus.latencyMs}ms
                  </span>
                )}
              </div>
              {pingStatus.details && (
                <div className="mt-2 text-[11px] text-slate-600 space-y-0.5">
                  <p>• Verified Origin: <code className="text-slate-900 font-semibold">{pingStatus.details.client_origin}</code></p>
                  <p>• Isolation Standard: <code className="text-emerald-700 font-semibold">{pingStatus.details.isolation}</code></p>
                  <p>• Active Products Monitored: <code className="text-indigo-700 font-semibold">{pingStatus.details.total_products}</code></p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      )}

      {/* 6. Bottom Sticky Save Changes & Update Action Bar */}
      <div className="p-4 border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs shadow-2xs rounded-md card-subtle">
        <div className="text-slate-500">
          {!canSaveAnyTenantSettings && !hasUnsavedPerms
            ? "Settings modifications are restricted to Admin and Lead Manager roles (Read-only mode active)."
            : "Click 'UPDATE & SAVE CHANGES' to persist organization profile, whitelist firewall, and routing policies to the database."}
        </div>
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={loadTenantSettings}
            disabled={isSaving}
            className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 bg-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs rounded-md"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Discard Changes</span>
          </button>
          <button
            type="button"
            onClick={() => handleSaveChanges()}
            disabled={isSaving || (!canSaveAnyTenantSettings && !hasUnsavedPerms)}
            className="px-6 py-2.5 bg-[#0066FF] hover:bg-blue-600 text-white font-bold flex items-center space-x-2 shadow-xs transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
            title={!canSaveAnyTenantSettings && !hasUnsavedPerms ? "Settings modification restricted to Admin and Lead Manager" : undefined}
          >
            {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{isSaving ? 'SAVING CHANGES...' : 'UPDATE & SAVE CHANGES'}</span>
          </button>
        </div>
      </div>

    </div>
  );
};
