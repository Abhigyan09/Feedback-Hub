import React, { useState, useEffect } from 'react';
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
  Webhook
} from 'lucide-react';
import { Product, Tenant, UserRole } from '../types';

interface SettingsViewProps {
  currentTenantId: string;
  currentRole?: UserRole;
  onTenantUpdated?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ 
  currentTenantId,
  currentRole = 'developer',
  onTenantUpdated
}) => {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  // UI Feedback States
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [selectedProductForSnippet, setSelectedProductForSnippet] = useState<string>('');

  // Role-Based Permissions
  const canManageSettings = ['super_admin', 'tenant_admin'].includes(currentRole);
  const canViewSettings = ['super_admin', 'tenant_admin', 'squad_lead', 'developer'].includes(currentRole);
  const canEdit = canManageSettings;

  // 1. Fetch live tenant settings and products from backend
  const loadTenantSettings = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/v1/tenants/current', {
        headers: {
          'x-tenant-id': currentTenantId,
          'x-user-role': currentRole
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
      } else {
        const err = await res.json();
        setErrorMessage(err.error || 'Failed to load tenant configuration');
      }
    } catch (err: any) {
      console.error('Failed to load tenant settings:', err);
      setErrorMessage(err.message || 'Network connection error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTenantSettings();
  }, [currentTenantId, currentRole]);

  // 2. Handle Master Save Changes & Update Settings
  const handleSaveChanges = async (customMessage?: string) => {
    if (!orgName.trim()) {
      setErrorMessage('Organization name cannot be empty.');
      return;
    }

    setIsSaving(true);
    setSaveSuccessMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/v1/tenants/current', {
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
        setSaveSuccessMessage(customMessage || 'Settings updated and persisted to database successfully!');
        setTimeout(() => setSaveSuccessMessage(null), 5000);
        if (onTenantUpdated) onTenantUpdated();
      } else {
        const err = await res.json();
        setErrorMessage('Failed to save settings: ' + (err.error || 'Server error'));
      }
    } catch (err: any) {
      setErrorMessage('Network error: ' + err.message);
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
      const res = await fetch('/api/v1/tenants/products', {
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
      const res = await fetch(`/api/v1/tenants/products/${productId}`, {
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
      const res = await fetch(`/api/v1/tenants/products/${productId}`, {
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
      const res = await fetch(`/api/v1/tenants/products/${productId}`, {
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
      const res = await fetch('/api/v1/tenants/ping-ingest', {
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
      <div className="p-16 text-center text-xs font-mono text-slate-400 border border-slate-200 bg-white flex flex-col items-center justify-center space-y-3 shadow-2xs select-none">
        <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
        <span>SYNCHRONIZING TENANT CONFIGURATION & RLS METRICS...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 select-none">
      
      {/* Top Header & Sticky Save / Update Action Bar */}
      <div className="bg-white border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 font-mono uppercase tracking-wide flex items-center space-x-2">
            <Building className="w-5 h-5 text-indigo-600" />
            <span>PLATFORM SETTINGS & INTEGRATION</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Manage tenant configuration, monitored products, client SDK keys, and domain access controls.
          </p>
        </div>

        {canEdit ? (
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={loadTenantSettings}
              disabled={isSaving}
              className="px-3.5 py-2 text-xs font-mono border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 bg-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Discard unsaved local changes and reload from server"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="button"
              onClick={() => handleSaveChanges()}
              disabled={isSaving}
              className="px-5 py-2 bg-[#0066FF] hover:bg-blue-600 text-white text-xs font-mono font-bold flex items-center space-x-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSaving ? 'SAVING...' : 'SAVE CHANGES'}</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono text-slate-500 px-3 py-1.5 bg-slate-100 border border-slate-200 font-medium">
              READ-ONLY MODE ({currentRole.toUpperCase()})
            </span>
          </div>
        )}
      </div>

      {/* Read-Only Notice for Developers & Squad Leads */}
      {!canManageSettings && (
        <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-900 text-xs font-mono flex items-center space-x-2.5 shadow-2xs">
          <Shield className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Engineering Read-Only Mode:</strong> Viewing configuration as <strong>{currentRole === 'squad_lead' ? 'Squad Lead' : 'Developer'}</strong>. You can inspect API keys, copy embed snippets, and run live diagnostic pings. Modifying tenant domains, plan tier, or rotating keys requires Tenant Administrator credentials.
          </span>
        </div>
      )}

      {/* Success Notification Banner */}
      {saveSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-mono flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xs">
          <div className="flex items-center space-x-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{saveSuccessMessage}</span>
          </div>
          <button onClick={() => setSaveSuccessMessage(null)} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Notification Banner */}
      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-800 text-xs font-mono flex items-center justify-between animate-in fade-in slide-in-from-top-2 duration-200 shadow-2xs">
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
      <div className="bg-white border border-slate-200 p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              Active Tenant Profile
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono text-emerald-700 font-semibold px-2 py-0.5 bg-emerald-50 border border-emerald-200">
              {tenant?.isolation_standard || 'PostgreSQL 16 RLS (Bank-Grade)'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          
          {/* Editable Organization Name */}
          <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
            <label className="text-slate-500 uppercase text-[10px] font-bold block">
              Organization Name {canEdit && <span className="text-indigo-600">(Editable)</span>}
            </label>
            {canEdit ? (
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Enter organization name"
                className="w-full bg-white border border-slate-300 focus:border-indigo-600 px-2.5 py-1.5 text-slate-900 font-bold text-xs focus:outline-none transition-colors"
              />
            ) : (
              <p className="text-slate-900 font-bold">{orgName}</p>
            )}
          </div>

          {/* Tenant ID (Immutable UUID boundary) */}
          <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
            <span className="text-slate-500 uppercase text-[10px] font-bold block">Tenant ID (UUID Boundary)</span>
            <div className="flex items-center justify-between">
              <p className="text-indigo-700 truncate font-bold text-xs">{currentTenantId}</p>
              <button
                type="button"
                onClick={() => handleCopy(currentTenantId, 'tenantId')}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer transition-colors"
                title="Copy Tenant ID"
              >
                {copiedKey === 'tenantId' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Plan Tier Selector */}
          <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
            <label className="text-slate-500 uppercase text-[10px] font-bold block">
              Enterprise Plan Tier {canEdit && <span className="text-indigo-600">(Editable)</span>}
            </label>
            {canEdit ? (
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-emerald-700 font-bold text-xs focus:outline-none focus:border-indigo-600 cursor-pointer"
              >
                <option value="ENTERPRISE">ENTERPRISE (SOC2 + AES-256)</option>
                <option value="PRO">PRO (SLA 99.9%)</option>
                <option value="SCALE">SCALE (High Concurrency)</option>
              </select>
            ) : (
              <p className="text-emerald-700 font-bold">{plan}</p>
            )}
          </div>

          {/* Alert Webhook URL */}
          <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5 md:col-span-2">
            <label className="text-slate-500 uppercase text-[10px] font-bold flex items-center space-x-1.5">
              <Webhook className="w-3 h-3 text-indigo-600" />
              <span>Incident Alert Webhook URL (Real-time Bridge)</span>
            </label>
            {canEdit ? (
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://api.yourcompany.com/v1/webhooks/incidents"
                className="w-full bg-white border border-slate-300 focus:border-indigo-600 px-2.5 py-1.5 text-slate-800 text-xs focus:outline-none transition-colors"
              />
            ) : (
              <p className="text-slate-700 truncate">{webhookUrl || 'Not configured'}</p>
            )}
          </div>

          {/* Security Alert Email */}
          <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
            <label className="text-slate-500 uppercase text-[10px] font-bold flex items-center space-x-1.5">
              <Mail className="w-3 h-3 text-indigo-600" />
              <span>Escalation Email</span>
            </label>
            {canEdit ? (
              <input
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="alerts@yourcompany.com"
                className="w-full bg-white border border-slate-300 focus:border-indigo-600 px-2.5 py-1.5 text-slate-800 text-xs focus:outline-none transition-colors"
              />
            ) : (
              <p className="text-slate-700 truncate">{notificationEmail || 'Not configured'}</p>
            )}
          </div>

        </div>

        {/* Card Specific Update Button */}
        {canEdit && (
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => handleSaveChanges('Tenant profile updated and saved.')}
              disabled={isSaving}
              className="px-4 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
            >
              <Save className="w-3.5 h-3.5" />
              <span>UPDATE PROFILE</span>
            </button>
          </div>
        )}
      </div>

      {/* 2. Monitored Products & Ingestion Keys Card */}
      <div className="bg-white border border-slate-200 p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Key className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              MONITORED PRODUCTS & CLIENT INGESTION KEYS ({products.length})
            </h3>
          </div>

          {canEdit && !isAddingProduct && (
            <button
              type="button"
              onClick={() => setIsAddingProduct(true)}
              className="px-3.5 py-1.5 text-xs font-mono bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>ADD PRODUCT</span>
            </button>
          )}
        </div>

        {/* Add Product Inline Form */}
        {isAddingProduct && (
          <form onSubmit={handleCreateProduct} className="p-4 bg-slate-50 border border-indigo-200 space-y-3 font-mono text-xs animate-in fade-in duration-150">
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
                  className="w-full bg-white border border-slate-300 focus:border-indigo-600 p-2 text-slate-900 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-slate-600 uppercase font-bold">Environment</label>
                <select
                  value={newProductEnv}
                  onChange={(e) => setNewProductEnv(e.target.value as any)}
                  className="w-full bg-white border border-slate-300 focus:border-indigo-600 p-2 text-slate-900 focus:outline-none cursor-pointer"
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
                  className="w-full bg-white border border-slate-300 focus:border-indigo-600 p-2 text-slate-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddingProduct(false)}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-white cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
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
            <p className="p-6 text-center text-xs font-mono text-slate-500 bg-slate-50 border border-slate-200">
              No monitored products registered yet. Click '+ ADD PRODUCT' to generate your first client ingestion key.
            </p>
          ) : (
            products.map((prod) => {
              const currentKey = prod.raw_api_key || prod.api_key_hash;
              const isEditingThis = editingProductId === prod.id;

              return (
                <div 
                  key={prod.id}
                  className="p-4 bg-slate-50 border border-slate-200 space-y-3 text-xs font-mono shadow-2xs"
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
                            className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-slate-900 font-bold text-xs focus:outline-none focus:border-indigo-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-slate-600 uppercase">Environment</label>
                          <select
                            value={editProductEnv}
                            onChange={(e) => setEditProductEnv(e.target.value as any)}
                            className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-indigo-600 cursor-pointer"
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
                            className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-slate-800 text-xs focus:outline-none focus:border-indigo-600"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => setEditingProductId(null)}
                          className="px-3 py-1 border border-slate-300 text-slate-700 hover:bg-white cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveProductEdit(prod.id)}
                          className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center space-x-1.5 cursor-pointer"
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
                          <span className={`px-2 py-0.5 text-[10px] uppercase font-bold border ${
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
                          <code className="text-indigo-700 font-semibold bg-white px-2 py-0.5 border border-slate-200">{currentKey}</code>
                        </p>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(currentKey, prod.id)}
                          className="px-3 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-800 hover:bg-slate-50 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs font-semibold"
                        >
                          {copiedKey === prod.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === prod.id ? 'COPIED' : 'COPY KEY'}</span>
                        </button>

                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleStartEditProduct(prod)}
                              title="Edit product details"
                              className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Edit</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRotateKey(prod.id, prod.name)}
                              title="Rotate API Key"
                              className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-amber-300 text-slate-600 hover:text-amber-800 flex items-center space-x-1 transition-colors cursor-pointer shadow-2xs"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Rotate</span>
                            </button>

                            {products.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleDeleteProduct(prod.id, prod.name)}
                                title="Delete Product"
                                className="p-1.5 bg-white border border-slate-200 hover:border-red-300 text-slate-500 hover:text-red-600 transition-colors cursor-pointer shadow-2xs"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </>
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

      {/* 3. Domain Origin Whitelist Card */}
      <div className="bg-white border border-slate-200 p-5 space-y-4 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center space-x-2">
            <Globe className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-mono uppercase font-bold text-slate-900 tracking-wider">
              DOMAIN ORIGIN WHITELIST (ANTI-SPOOFING FIREWALL)
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500 font-semibold">
            {allowedDomains.length} DOMAINS PERMITTED
          </span>
        </div>

        <div className="space-y-3 text-xs font-mono">
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
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-800 flex items-center space-x-2 group hover:border-slate-300 transition-colors shadow-2xs"
                >
                  <Globe className="w-3 h-3 text-indigo-600" />
                  <span className="font-semibold">{d}</span>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemoveDomain(d)}
                      className="text-slate-400 hover:text-red-600 p-0.5 rounded-none transition-colors cursor-pointer"
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
          {canEdit && (
            <form onSubmit={handleAddDomain} className="flex items-center space-x-2 pt-2">
              <input
                type="text"
                value={newDomain}
                onChange={(e) => setNewDomain(e.target.value)}
                placeholder="e.g. payments.acme.com or localhost:3000"
                className="flex-1 bg-white border border-slate-300 px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-indigo-600 transition-colors"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Domain</span>
              </button>
            </form>
          )}

          {/* Dedicated Whitelist Update Button */}
          {canEdit && (
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleSaveChanges('Domain whitelist updated and saved.')}
                disabled={isSaving}
                className="px-4 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>UPDATE WHITELIST</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 4. Incident Routing & Telemetry Policies Card */}
      <div className="bg-white border border-slate-200 p-5 space-y-4 shadow-2xs">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Default Squad Assignment */}
            <div className="p-3 bg-slate-50 border border-slate-200 space-y-1.5">
              <label className="text-slate-600 uppercase text-[10px] font-bold block">
                Default Squad Assignment
              </label>
              {canEdit ? (
                <select
                  value={defaultSquad}
                  onChange={(e) => setDefaultSquad(e.target.value)}
                  className="w-full bg-white border border-slate-300 px-2.5 py-1.5 text-indigo-700 font-bold text-xs focus:outline-none focus:border-indigo-600 cursor-pointer"
                >
                  <option value="Core Platform & API Squad">Core Platform & API Squad</option>
                  <option value="Checkout & Billing Squad">Checkout & Billing Squad</option>
                  <option value="Merchant Admin Portal Squad">Merchant Admin Portal Squad</option>
                  <option value="Frontend & Mobile Squad">Frontend & Mobile Squad</option>
                  <option value="DevOps & Reliability Squad">DevOps & Reliability Squad</option>
                </select>
              ) : (
                <p className="text-indigo-700 font-bold">{defaultSquad}</p>
              )}
            </div>

            {/* User Email Requirement */}
            <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-slate-900 font-bold block text-xs">Require Reporter Email</span>
                <span className="text-[11px] text-slate-500 block">Enforces valid user email for ticket submission</span>
              </div>
              {canEdit ? (
                <input
                  type="checkbox"
                  checked={requireEmail}
                  onChange={(e) => setRequireEmail(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded-none cursor-pointer"
                />
              ) : (
                <span className="text-slate-700 font-bold">{requireEmail ? 'YES' : 'NO'}</span>
              )}
            </div>

            {/* Console Log Capture Toggle */}
            <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-slate-900 font-bold block text-xs">Auto-Capture Browser Console Logs</span>
                <span className="text-[11px] text-slate-500 block">Captures console errors and exceptions</span>
              </div>
              {canEdit ? (
                <input
                  type="checkbox"
                  checked={autoCaptureTelemetry}
                  onChange={(e) => setAutoCaptureTelemetry(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded-none cursor-pointer"
                />
              ) : (
                <span className="text-slate-700 font-bold">{autoCaptureTelemetry ? 'ENABLED' : 'DISABLED'}</span>
              )}
            </div>

            {/* Network API Failure Capture Toggle */}
            <div className="p-3 bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-slate-900 font-bold block text-xs">Auto-Capture Network API Failures</span>
                <span className="text-[11px] text-slate-500 block">Tracks 4xx/5xx HTTP failures for diagnostics</span>
              </div>
              {canEdit ? (
                <input
                  type="checkbox"
                  checked={autoCaptureNetwork}
                  onChange={(e) => setAutoCaptureNetwork(e.target.checked)}
                  className="w-4 h-4 accent-indigo-600 rounded-none cursor-pointer"
                />
              ) : (
                <span className="text-slate-700 font-bold">{autoCaptureNetwork ? 'ENABLED' : 'DISABLED'}</span>
              )}
            </div>

          </div>

          {/* Dedicated Policies Update Button */}
          {canEdit && (
            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleSaveChanges('Incident routing and telemetry policies updated.')}
                disabled={isSaving}
                className="px-4 py-1.5 bg-white border border-indigo-200 hover:border-indigo-300 text-indigo-700 text-xs font-mono font-bold flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Save className="w-3.5 h-3.5" />
                <span>UPDATE POLICIES</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 5. Client Embed Script Generator & Live Verification Card */}
      <div className="bg-white border border-slate-200 p-5 space-y-4 shadow-2xs">
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
                  className="bg-white border border-slate-300 text-indigo-700 px-2 py-1 focus:outline-none focus:border-indigo-600 cursor-pointer"
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
              className="px-3 py-1 bg-white border border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-700 flex items-center space-x-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
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
            <pre className="bg-[#0B112C] border border-[#152042] p-4 text-xs text-indigo-300 overflow-x-auto leading-relaxed">
              {embedSnippet}
            </pre>

            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(embedSnippet);
                setCopiedSnippet(true);
                setTimeout(() => setCopiedSnippet(false), 2000);
              }}
              className="absolute top-2.5 right-2.5 px-3 py-1.5 bg-[#152042] border border-[#23356D] hover:border-slate-500 text-slate-200 hover:text-white text-xs flex items-center space-x-1.5 shadow-sm transition-colors cursor-pointer font-semibold"
            >
              {copiedSnippet ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedSnippet ? 'COPIED' : 'COPY SCRIPT'}</span>
            </button>
          </div>

          {/* Diagnostic Test Ping Results Display */}
          {pingStatus.tested && (
            <div className={`p-3 border text-xs font-mono animate-in fade-in duration-200 shadow-2xs ${
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

      {/* 6. Bottom Sticky Save Changes & Update Action Bar */}
      {canEdit && (
        <div className="p-4 border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs shadow-2xs">
          <div className="text-slate-500">
            Click 'UPDATE & SAVE CHANGES' to persist organization profile, whitelist firewall, and routing policies to the database.
          </div>
          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={loadTenantSettings}
              disabled={isSaving}
              className="px-4 py-2 border border-slate-200 hover:border-slate-300 text-slate-700 hover:bg-slate-50 bg-white flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Discard Changes</span>
            </button>
            <button
              type="button"
              onClick={() => handleSaveChanges()}
              disabled={isSaving}
              className="px-6 py-2.5 bg-[#0066FF] hover:bg-blue-600 text-white font-bold flex items-center space-x-2 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{isSaving ? 'SAVING CHANGES...' : 'UPDATE & SAVE CHANGES'}</span>
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
