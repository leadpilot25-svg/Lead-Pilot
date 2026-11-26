import React, { useEffect, useState } from 'react';
import {
  Building2,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
  ExternalLink,
  Globe,
  Mail,
  Layers,
  Search,
  PlusCircle,
  X,
  CheckCircle2,
  Settings,
  Link2,
  Power,
  AlertTriangle,
  KeyRound,
  Copy,
  Check,
  UserPlus,
} from 'lucide-react';
import {
  listTenantRecords,
  createTenantRecord,
  updateTenantSlugAtomic,
  updateTenantStatus,
  getTenantOwnerLoginInfo,
  assignTenantOwnerEmail,
  ensurePendingOwnerInvite,
  TenantOwnerLoginInfo,
  validateAndNormalizeSlug,
  verifyRootAdminStatus,
  ROOT_ADMIN_EMAIL,
} from '../auth/clientAuth';
import { auth } from '../firebase';
import { TenantRecord, TenantStatus } from '../types';
import { INDUSTRY_PRESETS } from '../presets/industryPresets';
import { SuperAdminWebsiteEditor } from './SuperAdminWebsiteEditor';

interface SuperAdminClientDirectoryProps {
  onSelectTenantScope?: (tenantId: string) => void;
  activeSelectedTenant?: string;
  isRootAdmin?: boolean;
}

// Generate a valid slug for tenant IDs: lower-case alphanumeric, hyphens, and underscores only
function generateTenantSlug(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  return base || 'client';
}

export const SuperAdminClientDirectory: React.FC<SuperAdminClientDirectoryProps> = ({
  onSelectTenantScope,
  activeSelectedTenant,
  isRootAdmin = false,
}) => {
  const [verifiedRootAdmin, setVerifiedRootAdmin] = useState<boolean>(false);
  const [isCheckingAccess, setIsCheckingAccess] = useState<boolean>(true);
  const [tenants, setTenants] = useState<TenantRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Website Editor State
  const [editingWebsiteTenant, setEditingWebsiteTenant] = useState<TenantRecord | null>(null);

  // Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [formBusinessName, setFormBusinessName] = useState<string>('');
  const [formTenantId, setFormTenantId] = useState<string>('');
  const [formSlug, setFormSlug] = useState<string>('');
  const [isTenantIdTouched, setIsTenantIdTouched] = useState<boolean>(false);
  const [isSlugTouched, setIsSlugTouched] = useState<boolean>(false);
  const [formIndustry, setFormIndustry] = useState<string>('general-business');
  const [formOwnerEmail, setFormOwnerEmail] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Slug Editor Modal State (for existing tenants)
  const [slugModalTenant, setSlugModalTenant] = useState<TenantRecord | null>(null);
  const [slugInputValue, setSlugInputValue] = useState<string>('');
  const [slugModalError, setSlugModalError] = useState<string | null>(null);
  const [isSavingSlug, setIsSavingSlug] = useState<boolean>(false);

  // Account Status Toggle State (Root Admin only)
  const [updatingStatusTenantId, setUpdatingStatusTenantId] = useState<string | null>(null);
  const [suspendConfirmTenant, setSuspendConfirmTenant] = useState<TenantRecord | null>(null);
  const [actionErrorBanner, setActionErrorBanner] = useState<string | null>(null);

  // Client CRM Owner Google Email Assignment Modal State (Root Admin only)
  const [ownerLoginsByTenant, setOwnerLoginsByTenant] = useState<Record<string, TenantOwnerLoginInfo>>({});
  const [ownerModalTenant, setOwnerModalTenant] = useState<TenantRecord | null>(null);
  const [ownerEmailInput, setOwnerEmailInput] = useState<string>('');
  const [ownerModalError, setOwnerModalError] = useState<string | null>(null);
  const [isSavingOwnerEmail, setIsSavingOwnerEmail] = useState<boolean>(false);
  const [copiedCrmLink, setCopiedCrmLink] = useState<boolean>(false);

  const commonCrmUrl =
    typeof window !== 'undefined' ? `${window.location.origin}/crm` : '/crm';

  // Available industry preset keys with human-readable labels
  const availableIndustries = Object.keys(INDUSTRY_PRESETS).map((key) => ({
    key,
    label: INDUSTRY_PRESETS[key]?.industry || key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  const fetchTenants = async (): Promise<TenantRecord[]> => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const records = await listTenantRecords();
      setTenants(records);
      const loginEntries = await Promise.all(
        records.map(async (t) => {
          const info = await getTenantOwnerLoginInfo(t);
          if (!info.connected && t.ownerEmail && !t.ownerUid) {
            await ensurePendingOwnerInvite(t);
          }
          return [t.tenantId, info] as const;
        })
      );
      setOwnerLoginsByTenant(Object.fromEntries(loginEntries));
      return records;
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Failed to retrieve tenant directory. Root Administrator access is required.'
      );
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    async function verifyAndLoad() {
      setIsCheckingAccess(true);
      const rootOk = isRootAdmin && (await verifyRootAdminStatus(auth.currentUser));
      if (!isMounted) return;
      setVerifiedRootAdmin(rootOk);
      setIsCheckingAccess(false);
      if (rootOk) {
        await fetchTenants();
      } else {
        setIsLoading(false);
      }
    }
    verifyAndLoad();
    return () => {
      isMounted = false;
    };
  }, [isRootAdmin]);

  // Sync slug if the user hasn't manually customized the tenant ID
  const handleBusinessNameChange = (val: string) => {
    setFormBusinessName(val);
    const derived = generateTenantSlug(val);
    if (!isTenantIdTouched) {
      setFormTenantId(derived);
    }
    if (!isSlugTouched) {
      setFormSlug(derived.replace(/_/g, '-'));
    }
  };

  const handleOpenAddModal = () => {
    setFormBusinessName('');
    setFormTenantId('');
    setFormSlug('');
    setIsTenantIdTouched(false);
    setIsSlugTouched(false);
    setFormIndustry('general-business');
    setFormOwnerEmail('');
    setModalError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenSlugModal = (tenant: TenantRecord) => {
    setSlugModalTenant(tenant);
    setSlugInputValue((tenant.slug || tenant.tenantId || '').replace(/_/g, '-'));
    setSlugModalError(null);
  };

  const handleSaveSlugModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slugModalTenant || isSavingSlug) return;
    setSlugModalError(null);

    const validation = validateAndNormalizeSlug(slugInputValue);
    if (!validation.isValid) {
      setSlugModalError(validation.error || 'Please enter a valid URL slug.');
      return;
    }

    setIsSavingSlug(true);
    try {
      const rootOk = await verifyRootAdminStatus(auth.currentUser);
      if (!rootOk) {
        setSlugModalError('Action rejected: Only the verified Root Administrator may update public URL slugs.');
        setIsSavingSlug(false);
        return;
      }

      const res = await updateTenantSlugAtomic(slugModalTenant.tenantId, validation.normalizedSlug);
      if (!res.success) {
        setSlugModalError(res.error || 'Failed to save public URL slug.');
        setIsSavingSlug(false);
        return;
      }

      const savedTenantName = slugModalTenant.businessName;
      setSlugModalTenant(null);
      setSuccessBanner(`Public URL "/${validation.normalizedSlug}" enabled for "${savedTenantName}".`);
      setTimeout(() => setSuccessBanner(null), 6000);
      await fetchTenants();
    } catch (err: any) {
      setSlugModalError(err?.message || 'Unexpected error while saving public URL slug.');
    } finally {
      setIsSavingSlug(false);
    }
  };

  const handleToggleTenantStatus = async (tenant: TenantRecord, nextStatus: TenantStatus) => {
    if (updatingStatusTenantId) return;
    setActionErrorBanner(null);
    setSuccessBanner(null);
    setUpdatingStatusTenantId(tenant.tenantId);

    try {
      const rootOk = verifiedRootAdmin && (await verifyRootAdminStatus(auth.currentUser));
      if (!rootOk) {
        setActionErrorBanner(
          'Action rejected: Only the verified Root Administrator may update client account status.'
        );
        return;
      }

      const res = await updateTenantStatus(tenant.tenantId, nextStatus);
      if (!res.success) {
        setActionErrorBanner(
          res.error || `Failed to update status for "${tenant.businessName}" (${tenant.tenantId}).`
        );
        return;
      }

      setSuspendConfirmTenant(null);
      setSuccessBanner(
        `"${tenant.businessName}" (${tenant.tenantId}) status updated to ${
          nextStatus === 'active' ? 'Active' : 'Suspended'
        }.`
      );
      setTimeout(() => setSuccessBanner(null), 6000);
      await fetchTenants();
    } catch (err: any) {
      setActionErrorBanner(
        err?.message || `Unexpected error while updating status for "${tenant.businessName}".`
      );
    } finally {
      setUpdatingStatusTenantId(null);
    }
  };

  const handleOpenOwnerEmailModal = (tenant: TenantRecord) => {
    setOwnerModalTenant(tenant);
    setOwnerEmailInput(tenant.ownerEmail || '');
    setOwnerModalError(null);
  };

  const handleCloseOwnerEmailModal = () => {
    if (isSavingOwnerEmail) return;
    setOwnerModalTenant(null);
    setOwnerModalError(null);
  };

  const handleSaveOwnerEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerModalTenant || isSavingOwnerEmail) return;
    setOwnerModalError(null);

    const cleanEmail = ownerEmailInput.trim().toLowerCase();
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setOwnerModalError('Please enter a valid Google email address.');
      return;
    }
    if (cleanEmail === ROOT_ADMIN_EMAIL) {
      setOwnerModalError('Root Administrator email cannot be assigned as a client owner.');
      return;
    }

    setIsSavingOwnerEmail(true);
    try {
      const res = await assignTenantOwnerEmail(ownerModalTenant.tenantId, cleanEmail);
      if (!res.success) {
        setOwnerModalError(res.error || 'Failed to save approved Google owner email.');
        return;
      }

      const savedBusiness = ownerModalTenant.businessName;
      setOwnerModalTenant(null);
      setSuccessBanner(
        `Approved Google owner email set to "${cleanEmail}" for "${savedBusiness}". Share ${commonCrmUrl} so they can sign in with Google.`
      );
      setTimeout(() => setSuccessBanner(null), 7000);
      await fetchTenants();
    } catch (err: any) {
      setOwnerModalError(err?.message || 'Unexpected error while saving owner Google email.');
    } finally {
      setIsSavingOwnerEmail(false);
    }
  };

  const handleCopyCrmLink = async () => {
    try {
      await navigator.clipboard.writeText(commonCrmUrl);
      setCopiedCrmLink(true);
      setTimeout(() => setCopiedCrmLink(false), 3000);
    } catch {
      setCopiedCrmLink(false);
    }
  };

  const handleCloseAddModal = () => {
    if (isSubmitting) return;
    setIsAddModalOpen(false);
    setModalError(null);
  };

  const handleSubmitNewClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const cleanName = formBusinessName.trim();
    const cleanTenantId = formTenantId.trim().toLowerCase();
    const cleanSlug = formSlug.trim().toLowerCase();
    const cleanEmail = formOwnerEmail.trim().toLowerCase();

    // 1. Validate Business Name
    if (!cleanName) {
      setModalError('Business Name is required.');
      return;
    }

    // 2. Validate Tenant ID format using ^[a-z0-9_-]+$
    const tenantIdRegex = /^[a-z0-9_-]+$/;
    if (!cleanTenantId) {
      setModalError('Tenant ID is required.');
      return;
    }
    if (!tenantIdRegex.test(cleanTenantId)) {
      setModalError('Tenant ID must contain only lowercase letters, numbers, hyphens (-), and underscores (_).');
      return;
    }

    // 3. Validate Public URL Slug if provided
    let normalizedSlug = '';
    if (cleanSlug) {
      const slugCheck = validateAndNormalizeSlug(cleanSlug);
      if (!slugCheck.isValid) {
        setModalError(slugCheck.error || 'Invalid Public URL Slug.');
        return;
      }
      normalizedSlug = slugCheck.normalizedSlug;
    }

    // 4. Validate Owner Email format if provided
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        setModalError('Please enter a valid owner email address, or leave it blank.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const rootOk = await verifyRootAdminStatus(auth.currentUser);
      if (!rootOk) {
        setModalError('Action rejected: Only the verified Root Administrator may create business client tenants.');
        setIsSubmitting(false);
        return;
      }

      // 5. Atomic createTenantRecord handles duplicate prevention & slug reservation via Firestore runTransaction
      const result = await createTenantRecord({
        tenantId: cleanTenantId,
        businessName: cleanName,
        industry: formIndustry,
        status: 'active',
        isPublished: false,
        ownerEmail: cleanEmail,
        ...(normalizedSlug ? { slug: normalizedSlug } : {}),
      });

      if (!result.success) {
        setModalError(result.error || 'Failed to create tenant record.');
        setIsSubmitting(false);
        return;
      }

      // Success
      setIsAddModalOpen(false);
      setSuccessBanner(
        normalizedSlug
          ? `Client tenant "${cleanName}" (${cleanTenantId}) created with public URL "/${normalizedSlug}".`
          : `Client tenant "${cleanName}" (${cleanTenantId}) created successfully.`
      );
      setTimeout(() => setSuccessBanner(null), 6000);

      // Refresh directory
      await fetchTenants();

      // If CRM switch callback exists, select the new tenant
      if (onSelectTenantScope) {
        onSelectTenantScope(cleanTenantId);
      }
    } catch (err: any) {
      setModalError(err?.message || 'An unexpected error occurred while creating the tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      t.businessName.toLowerCase().includes(q) ||
      t.tenantId.toLowerCase().includes(q) ||
      (t.slug && t.slug.toLowerCase().includes(q)) ||
      (t.industry && t.industry.toLowerCase().includes(q)) ||
      (t.ownerEmail && t.ownerEmail.toLowerCase().includes(q))
    );
  });

  if (isCheckingAccess) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center text-slate-400 text-xs">
        <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto mb-2" />
        Verifying Root Administrator permissions...
      </div>
    );
  }

  if (!verifiedRootAdmin) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-6 text-center shadow-xl">
          <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-3" />
          <h2 className="text-base font-extrabold text-white">Root Administrator Access Required</h2>
          <p className="text-xs text-slate-400 mt-1.5">
            Client directory access, tenant creation, and public URL slug management are restricted exclusively to the verified Root Administrator.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Success Notification Banner */}
      {successBanner && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-bold text-emerald-200">{successBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Error Notification Banner */}
      {actionErrorBanner && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between gap-3 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span className="font-bold text-rose-200">{actionErrorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionErrorBanner(null)}
            className="text-rose-400 hover:text-white text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-amber-400 shadow-sm">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  Super Admin Client Directory
                </h1>
                <span className="bg-amber-500/20 text-amber-300 text-[10px] font-extrabold px-2 py-0.5 rounded border border-amber-500/30">
                  ROOT ADMIN ONLY
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Authorized platform view of all registered business client tenants across the database.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            {/* Copy Common CRM Link Button */}
            <button
              type="button"
              onClick={handleCopyCrmLink}
              className="flex items-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-200 border border-blue-500/40 px-3.5 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              title={`Copy shared CRM Sign-In URL (${commonCrmUrl})`}
            >
              {copiedCrmLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>CRM Link Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-blue-300" />
                  <span>Copy CRM Link</span>
                </>
              )}
            </button>

            {/* Add New Client Button */}
            <button
              onClick={handleOpenAddModal}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
              title="Onboard and register a new client tenant"
            >
              <PlusCircle className="w-3.5 h-3.5 text-emerald-100" />
              <span>Add New Client</span>
            </button>

            {/* Refresh Button */}
            <button
              onClick={fetchTenants}
              disabled={isLoading}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
              title="Refresh directory from Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-amber-400' : ''}`} />
              <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="mt-6 pt-5 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by business, tenant ID, industry, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950/70 border border-slate-800 focus:border-amber-500/60 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none transition"
            />
          </div>

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>Total Registered Tenants:</span>
            <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {tenants.length}
            </span>
          </div>
        </div>
      </div>

      {/* Error State */}
      {errorMessage && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start justify-between gap-3 shadow-lg">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-200">Could not retrieve client directory</p>
              <p className="mt-0.5 text-rose-300/90">{errorMessage}</p>
            </div>
          </div>
          <button
            onClick={fetchTenants}
            className="px-3 py-1 bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 border border-rose-500/40 rounded-lg text-xs font-bold transition shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-lg">
          <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-bold text-white">Loading Tenant Directory</h3>
          <p className="text-xs text-slate-400 mt-1">Querying Firestore /tenants collection securely...</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !errorMessage && filteredTenants.length === 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center shadow-lg">
          <div className="w-12 h-12 bg-slate-800 text-slate-400 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Building2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">
            {searchQuery ? 'No matching clients found' : 'No Client Tenants Registered'}
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No registered tenants matched "${searchQuery}". Clear your search query to see all clients.`
              : 'There are currently no registered business tenants stored under the Firestore /tenants database.'}
          </p>
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="mt-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold border border-slate-700 transition"
            >
              Clear Search
            </button>
          ) : (
            <button
              onClick={handleOpenAddModal}
              className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow transition flex items-center gap-1.5 mx-auto"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Register First Client</span>
            </button>
          )}
        </div>
      )}

      {/* Desktop Table View */}
      {!isLoading && !errorMessage && filteredTenants.length > 0 && (
        <>
          <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-950/60 border-b border-slate-800 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-3.5">Business Name</th>
                    <th className="px-5 py-3.5">Tenant ID & Public URL</th>
                    <th className="px-5 py-3.5">Industry</th>
                    <th className="px-5 py-3.5">Owner Email</th>
                    <th className="px-5 py-3.5">Client CRM Login</th>
                    <th className="px-5 py-3.5">Account Status</th>
                    <th className="px-5 py-3.5">Website Status</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredTenants.map((tenant) => {
                    const isActive = tenant.status === 'active';
                    const isPublished = Boolean(tenant.isPublished);
                    const isSelected = activeSelectedTenant === tenant.tenantId;
                    const ownerLogin = ownerLoginsByTenant[tenant.tenantId];

                    return (
                      <tr
                        key={tenant.tenantId}
                        className={`hover:bg-slate-800/40 transition ${
                          isSelected ? 'bg-amber-500/5' : ''
                        }`}
                      >
                        {/* Business Name */}
                        <td className="px-5 py-4 font-semibold text-white">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                              <Building2 className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-bold text-white text-sm">{tenant.businessName}</div>
                              {isSelected && (
                                <span className="text-[10px] text-amber-400 font-mono">
                                  ● Currently Selected Scope
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Tenant ID & Public URL Slug */}
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-start gap-1.5">
                            <span className="font-mono text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
                              {tenant.tenantId}
                            </span>
                            {tenant.slug ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-[11px] text-sky-300 bg-sky-950/40 border border-sky-500/30 px-2 py-0.5 rounded">
                                  /{tenant.slug}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenSlugModal(tenant)}
                                  className="text-[10px] font-bold text-slate-400 hover:text-white underline cursor-pointer"
                                  title="Change Public URL Slug"
                                >
                                  Edit URL
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleOpenSlugModal(tenant)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-300 hover:text-amber-200 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 rounded transition cursor-pointer"
                                title="Create /slugs/{slug} mapping so public visitors can open this portal"
                              >
                                <Link2 className="w-3 h-3" />
                                <span>Set Public URL</span>
                              </button>
                            )}
                          </div>
                        </td>

                        {/* Industry */}
                        <td className="px-5 py-4 text-slate-300">
                          <div className="flex items-center gap-1.5 capitalize">
                            <Layers className="w-3.5 h-3.5 text-slate-500" />
                            <span>{tenant.industry || 'General'}</span>
                          </div>
                        </td>

                        {/* Owner Email */}
                        <td className="px-5 py-4 text-slate-300">
                          {tenant.ownerEmail ? (
                            <div className="flex items-center gap-1.5">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span className="text-slate-200">{tenant.ownerEmail}</span>
                            </div>
                          ) : (
                            <span className="text-slate-500 italic">Unassigned</span>
                          )}
                        </td>

                        {/* Client CRM Login Status */}
                        <td className="px-5 py-4">
                          {ownerLogin?.connected ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                Connected
                              </span>
                              {ownerLogin.email && (
                                <div className="text-[11px] text-slate-200 font-medium break-all">
                                  {ownerLogin.email}
                                </div>
                              )}
                              <div className="text-[10px] font-mono text-sky-300">
                                Role: owner
                              </div>
                            </div>
                          ) : ownerLogin?.pendingEmail ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                Not Connected
                              </span>
                              <div className="text-[11px] text-slate-300 break-all">
                                Invited: {ownerLogin.pendingEmail}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">
                                Awaiting Google Sign-In
                              </div>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              Not Connected
                            </span>
                          )}
                        </td>

                        {/* Account Status */}
                        <td className="px-5 py-4">
                          {isActive ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                              Suspended
                            </span>
                          )}
                        </td>

                        {/* Website Publishing Status */}
                        <td className="px-5 py-4">
                          {isPublished ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                              <Globe className="w-3 h-3 text-blue-400" />
                              Published
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                              Draft
                            </span>
                          )}
                        </td>

                        {/* Action Buttons */}
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-2 flex-wrap">
                            {/* Assign / Edit Owner Google Email Button (Root Admin only) */}
                            {verifiedRootAdmin && !ownerLogin?.connected && (
                              <button
                                type="button"
                                onClick={() => handleOpenOwnerEmailModal(tenant)}
                                className="px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 flex items-center gap-1.5 shadow-sm"
                                title="Set or update the approved Google email for this business owner"
                              >
                                <KeyRound className="w-3.5 h-3.5 text-blue-300" />
                                <span>{tenant.ownerEmail ? 'Edit Owner Email' : 'Set Owner Email'}</span>
                              </button>
                            )}

                            {/* Activate / Suspend Account Status Button (Root Admin only) */}
                            {verifiedRootAdmin && (
                              <button
                                type="button"
                                disabled={updatingStatusTenantId === tenant.tenantId}
                                onClick={() =>
                                  isActive
                                    ? setSuspendConfirmTenant(tenant)
                                    : handleToggleTenantStatus(tenant, 'active')
                                }
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                                  isActive
                                    ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                                }`}
                                title={
                                  isActive
                                    ? 'Suspend this client account'
                                    : 'Activate this client account'
                                }
                              >
                                {updatingStatusTenantId === tenant.tenantId ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Power className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {updatingStatusTenantId === tenant.tenantId
                                    ? isActive
                                      ? 'Suspending...'
                                      : 'Activating...'
                                    : isActive
                                      ? 'Suspend'
                                      : 'Activate'}
                                </span>
                              </button>
                            )}

                            {/* Manage Website Button */}
                            <button
                              onClick={() => setEditingWebsiteTenant(tenant)}
                              className="px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700 flex items-center gap-1.5 shadow-sm"
                              title="Edit landing page configuration for this tenant"
                            >
                              <Globe className="w-3.5 h-3.5 text-amber-400" />
                              <span>Manage Website</span>
                            </button>

                            {/* CRM Scope Action */}
                            {onSelectTenantScope && (
                              <button
                                onClick={() => onSelectTenantScope(tenant.tenantId)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                                  isSelected
                                    ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                                }`}
                              >
                                {isSelected ? 'Viewing' : 'Open CRM'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {filteredTenants.map((tenant) => {
              const isActive = tenant.status === 'active';
              const isPublished = Boolean(tenant.isPublished);
              const isSelected = activeSelectedTenant === tenant.tenantId;
              const ownerLogin = ownerLoginsByTenant[tenant.tenantId];

              return (
                <div
                  key={tenant.tenantId}
                  className={`bg-slate-900 border rounded-2xl p-5 shadow-lg space-y-3 ${
                    isSelected ? 'border-amber-500/50 bg-amber-500/5' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{tenant.businessName}</h4>
                        <span className="font-mono text-[11px] text-emerald-400">
                          {tenant.tenantId}
                        </span>
                      </div>
                    </div>

                    {/* Status badges */}
                    <div className="flex flex-col items-end gap-1">
                      {isActive ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          Suspended
                        </span>
                      )}
                      {isPublished ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                          Published
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          Draft
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">
                        Industry
                      </span>
                      <span className="text-slate-200 capitalize">
                        {tenant.industry || 'General'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 block">
                        Owner Email
                      </span>
                      <span className="text-slate-200 truncate block">
                        {tenant.ownerEmail || 'Unassigned'}
                      </span>
                    </div>
                  </div>

                  {/* Mobile Client CRM Login Status */}
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase font-bold text-slate-500">
                        Client CRM Login
                      </span>
                      {ownerLogin?.connected ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                          Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                          Not Connected
                        </span>
                      )}
                    </div>
                    {ownerLogin?.connected ? (
                      <div className="pt-1 space-y-0.5">
                        {ownerLogin.email && (
                          <div className="text-slate-200 font-medium break-all">{ownerLogin.email}</div>
                        )}
                        <div className="text-[11px] font-mono text-sky-300">Role: owner</div>
                      </div>
                    ) : ownerLogin?.pendingEmail ? (
                      <div className="pt-1 space-y-0.5">
                        <div className="text-slate-300 break-all">
                          Invited: {ownerLogin.pendingEmail}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">
                          Awaiting Google Sign-In
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="pt-2 flex flex-col gap-2">
                    {/* Assign / Edit Owner Google Email Button (Root Admin only) */}
                    {verifiedRootAdmin && !ownerLogin?.connected && (
                      <button
                        type="button"
                        onClick={() => handleOpenOwnerEmailModal(tenant)}
                        className="w-full py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40"
                      >
                        <KeyRound className="w-3.5 h-3.5 text-blue-300" />
                        <span>{tenant.ownerEmail ? 'Edit Owner Email' : 'Set Owner Email'}</span>
                      </button>
                    )}

                    {/* Activate / Suspend Account Status Button (Root Admin only) */}
                    {verifiedRootAdmin && (
                      <button
                        type="button"
                        disabled={updatingStatusTenantId === tenant.tenantId}
                        onClick={() =>
                          isActive
                            ? setSuspendConfirmTenant(tenant)
                            : handleToggleTenantStatus(tenant, 'active')
                        }
                        className={`w-full py-2 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                          isActive
                            ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                            : 'bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border-emerald-500/40'
                        }`}
                      >
                        {updatingStatusTenantId === tenant.tenantId ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Power className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {updatingStatusTenantId === tenant.tenantId
                            ? isActive
                              ? 'Suspending Client...'
                              : 'Activating Client...'
                            : isActive
                              ? 'Suspend Client'
                              : 'Activate Client'}
                        </span>
                      </button>
                    )}

                    {/* Public URL Slug Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenSlugModal(tenant)}
                      className="w-full py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 border border-slate-700"
                    >
                      <Link2 className="w-3.5 h-3.5 text-sky-400" />
                      <span>{tenant.slug ? `Public URL: /${tenant.slug} (Edit)` : 'Set Public URL Slug'}</span>
                    </button>

                    {/* Manage Website Button */}
                    <button
                      onClick={() => setEditingWebsiteTenant(tenant)}
                      className="w-full py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 border border-slate-700"
                    >
                      <Globe className="w-3.5 h-3.5 text-amber-400" />
                      <span>Manage Website</span>
                    </button>

                    {/* CRM Scope Action */}
                    {onSelectTenantScope && (
                      <button
                        onClick={() => onSelectTenantScope(tenant.tenantId)}
                        className={`w-full py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 font-extrabold'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{isSelected ? 'Currently Viewing CRM' : 'Switch CRM To Tenant'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Super Admin Website Editor Modal/View */}
      {editingWebsiteTenant && (
        <SuperAdminWebsiteEditor
          tenant={editingWebsiteTenant}
          isRootAdmin={verifiedRootAdmin}
          onClose={() => setEditingWebsiteTenant(null)}
          onSaved={async (savedTenantId) => {
            const refreshed = await fetchTenants();
            const updated = refreshed.find((t) => t.tenantId === savedTenantId);
            if (updated) {
              setEditingWebsiteTenant(updated);
            }
          }}
        />
      )}

      {/* Add New Client Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 overflow-hidden text-slate-100">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Register New Business Client</h3>
                  <p className="text-xs text-slate-400">Onboard an isolated client tenant account</p>
                </div>
              </div>
              <button
                onClick={handleCloseAddModal}
                disabled={isSubmitting}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Error Notification inside modal */}
            {modalError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{modalError}</span>
              </div>
            )}

            {/* Registration Form */}
            <form onSubmit={handleSubmitNewClient} className="space-y-4 text-xs">
              {/* Business Name */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Business Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Apex Dental Clinic"
                  value={formBusinessName}
                  onChange={(e) => handleBusinessNameChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none transition"
                  disabled={isSubmitting}
                />
              </div>

              {/* Unique Tenant ID */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-bold">
                    Unique Tenant ID <span className="text-rose-400">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Pattern: ^[a-z0-9_-]+$
                  </span>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. apex-dental-clinic"
                  value={formTenantId}
                  onChange={(e) => {
                    const nextId = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
                    setIsTenantIdTouched(true);
                    setFormTenantId(nextId);
                    if (!isSlugTouched) {
                      setFormSlug(nextId.replace(/_/g, '-'));
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none transition text-xs"
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used in Firestore paths (/tenants/{formTenantId || 'tenantId'}) for strict database isolation.
                </p>
              </div>

              {/* Public URL Slug */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-bold">
                    Public URL Slug <span className="text-slate-500 font-normal">(e.g. /{formSlug || 'apex-dental-clinic'})</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    3–63 chars, a-z, 0-9, -
                  </span>
                </div>
                <input
                  type="text"
                  placeholder="e.g. apex-dental-clinic"
                  value={formSlug}
                  onChange={(e) => {
                    setIsSlugTouched(true);
                    setFormSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none transition text-xs"
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Creates /slugs/{formSlug || 'slug'} atomically so visitors can open this business directly by URL path.
                </p>
              </div>

              {/* Industry Preset */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Industry Preset <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formIndustry}
                  onChange={(e) => setFormIndustry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3 py-2.5 text-white focus:outline-none transition text-xs cursor-pointer capitalize"
                  disabled={isSubmitting}
                >
                  {availableIndustries.map((ind) => (
                    <option key={ind.key} value={ind.key}>
                      {ind.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Owner Google Email (Optional) */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Approved Owner Google Email <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. owner@gmail.com"
                  value={formOwnerEmail}
                  onChange={(e) => setFormOwnerEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none transition"
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  When set, signing into <span className="font-mono text-sky-300">/crm</span> with this verified Google account connects the owner directly to this tenant.
                </p>
              </div>

              {/* System Defaults Summary */}
              <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Initial Account Status:</span>
                  <span className="font-bold text-emerald-400">Active (Automatic)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Initial Website State:</span>
                  <span className="font-bold text-slate-300">Draft (Unpublished)</span>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-md cursor-pointer"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmitting ? 'Creating Client...' : 'Register Client'}</span>
                </button>
              </div>
              </form>
          </div>
        </div>
      )}

      {/* Set / Edit Public URL Slug Modal */}
      {slugModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Public Website URL Slug</h3>
                  <p className="text-xs text-slate-400">{slugModalTenant.businessName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingSlug && setSlugModalTenant(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {slugModalError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{slugModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSlugModal} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  URL Path Slug
                </label>
                <div className="flex items-center bg-slate-950 border border-slate-700 focus-within:border-sky-500 rounded-xl overflow-hidden">
                  <span className="px-3 py-2.5 text-slate-500 bg-slate-900 border-r border-slate-800 font-mono">/</span>
                  <input
                    type="text"
                    required
                    value={slugInputValue}
                    onChange={(e) => setSlugInputValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="e.g. demo-tarot-kochi"
                    className="w-full bg-transparent px-3 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none"
                    disabled={isSavingSlug}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Maps <span className="font-mono text-sky-300">/slugs/{slugInputValue || 'slug'}</span> atomically to tenant <span className="font-mono text-emerald-400">{slugModalTenant.tenantId}</span>. If this tenant had an older slug, it will be safely retired.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setSlugModalTenant(null)}
                  disabled={isSavingSlug}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSlug}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-md cursor-pointer"
                >
                  {isSavingSlug && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingSlug ? 'Saving URL...' : 'Save Public URL'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Suspend Client Modal */}
      {verifiedRootAdmin && suspendConfirmTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Suspend Client Account</h3>
                  <p className="text-xs text-slate-400">{suspendConfirmTenant.businessName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  updatingStatusTenantId !== suspendConfirmTenant.tenantId &&
                  setSuspendConfirmTenant(null)
                }
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                Are you sure you want to suspend{' '}
                <span className="font-bold text-white">{suspendConfirmTenant.businessName}</span>{' '}
                (<span className="font-mono text-emerald-400">{suspendConfirmTenant.tenantId}</span>)?
              </p>
              <p className="text-slate-400 bg-slate-950/70 border border-slate-800 rounded-xl p-3 leading-relaxed">
                This updates only the account <span className="font-mono text-slate-200">status</span>{' '}
                to <span className="font-semibold text-amber-300">suspended</span>, disabling
                public portal access and client CRM access. Existing leads, website content, public
                URL slug, and Google Sheets settings are preserved.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 mt-5 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setSuspendConfirmTenant(null)}
                disabled={updatingStatusTenantId === suspendConfirmTenant.tenantId}
                className="px-4 py-2 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingStatusTenantId === suspendConfirmTenant.tenantId}
                onClick={() => handleToggleTenantStatus(suspendConfirmTenant, 'suspended')}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-md cursor-pointer"
              >
                {updatingStatusTenantId === suspendConfirmTenant.tenantId && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>
                  {updatingStatusTenantId === suspendConfirmTenant.tenantId
                    ? 'Suspending...'
                    : 'Confirm Suspend'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Set / Edit Approved Owner Google Email Modal (Root Admin only) */}
      {verifiedRootAdmin && ownerModalTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">
                    {ownerModalTenant.ownerEmail ? 'Edit Approved Owner Google Email' : 'Assign Approved Owner Google Email'}
                  </h3>
                  <p className="text-xs text-slate-400">{ownerModalTenant.businessName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseOwnerEmailModal}
                disabled={isSavingOwnerEmail}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {ownerModalError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{ownerModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveOwnerEmail} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Approved Owner Google Email <span className="text-rose-400">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={ownerEmailInput}
                  onChange={(e) => setOwnerEmailInput(e.target.value)}
                  placeholder="e.g. clientowner@gmail.com"
                  className="w-full bg-slate-950 border border-slate-700 focus:border-blue-500 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none transition"
                  disabled={isSavingOwnerEmail}
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  The business owner must sign in via Google using this exact verified email address.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Tenant ID (Read-only)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={ownerModalTenant.tenantId}
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-emerald-400 font-mono cursor-not-allowed focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    Role Assigned on Sign-In
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="owner"
                    className="w-full bg-slate-950/60 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sky-300 font-mono cursor-not-allowed focus:outline-none"
                  />
                </div>
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-300">Common CRM Sign-In Link</span>
                  <button
                    type="button"
                    onClick={handleCopyCrmLink}
                    className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1 transition cursor-pointer"
                  >
                    {copiedCrmLink ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  readOnly
                  value={commonCrmUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-[11px] font-mono text-sky-300 focus:outline-none"
                />
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Share this link with the client. On their first Google Sign-In, Firebase creates their account automatically and Firestore Security Rules verify their email before linking them as owner of{' '}
                  <span className="font-mono text-emerald-400">{ownerModalTenant.tenantId}</span>.
                </p>
              </div>

              {ownerModalTenant.status !== 'active' && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px]">
                  Note: This client is currently <strong>Suspended</strong>. They will not be able to sign in or claim owner access until you activate their account.
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseOwnerEmailModal}
                  disabled={isSavingOwnerEmail}
                  className="px-4 py-2 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingOwnerEmail}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs transition shadow-md cursor-pointer"
                >
                  {isSavingOwnerEmail && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingOwnerEmail ? 'Saving...' : 'Save Owner Email'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
