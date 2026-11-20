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
} from 'lucide-react';
import { listTenantRecords, createTenantRecord } from '../auth/clientAuth';
import { TenantRecord } from '../types';
import { INDUSTRY_PRESETS } from '../presets/industryPresets';
import { SuperAdminWebsiteEditor } from './SuperAdminWebsiteEditor';

interface SuperAdminClientDirectoryProps {
  onSelectTenantScope?: (tenantId: string) => void;
  activeSelectedTenant?: string;
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
}) => {
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
  const [isTenantIdTouched, setIsTenantIdTouched] = useState<boolean>(false);
  const [formIndustry, setFormIndustry] = useState<string>('general-business');
  const [formOwnerEmail, setFormOwnerEmail] = useState<string>('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Available industry preset keys with human-readable labels
  const availableIndustries = Object.keys(INDUSTRY_PRESETS).map((key) => ({
    key,
    label: INDUSTRY_PRESETS[key]?.industry || key.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  }));

  const fetchTenants = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const records = await listTenantRecords();
      setTenants(records);
    } catch (err: any) {
      setErrorMessage(
        err?.message || 'Failed to retrieve tenant directory. Firestore administrator access is required.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, []);

  // Sync slug if the user hasn't manually customized the tenant ID
  const handleBusinessNameChange = (val: string) => {
    setFormBusinessName(val);
    if (!isTenantIdTouched) {
      setFormTenantId(generateTenantSlug(val));
    }
  };

  const handleOpenAddModal = () => {
    setFormBusinessName('');
    setFormTenantId('');
    setIsTenantIdTouched(false);
    setFormIndustry('general-business');
    setFormOwnerEmail('');
    setModalError(null);
    setIsAddModalOpen(true);
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

    // 3. Validate Owner Email format if provided
    if (cleanEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        setModalError('Please enter a valid owner email address, or leave it blank.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // 4. Atomic createTenantRecord handles duplicate prevention via Firestore runTransaction
      const result = await createTenantRecord({
        tenantId: cleanTenantId,
        businessName: cleanName,
        industry: formIndustry,
        status: 'active',
        isPublished: false,
        ownerEmail: cleanEmail,
      });

      if (!result.success) {
        setModalError(result.error || 'Failed to create tenant record.');
        setIsSubmitting(false);
        return;
      }

      // Success
      setIsAddModalOpen(false);
      setSuccessBanner(`Client tenant "${cleanName}" (${cleanTenantId}) created successfully.`);
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
      (t.industry && t.industry.toLowerCase().includes(q)) ||
      (t.ownerEmail && t.ownerEmail.toLowerCase().includes(q))
    );
  });

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
            onClick={() => setSuccessBanner(null)}
            className="text-emerald-400 hover:text-white text-xs font-bold"
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
                    <th className="px-5 py-3.5">Tenant ID</th>
                    <th className="px-5 py-3.5">Industry</th>
                    <th className="px-5 py-3.5">Owner Email</th>
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

                        {/* Tenant ID */}
                        <td className="px-5 py-4">
                          <span className="font-mono text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
                            {tenant.tenantId}
                          </span>
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
                          <div className="flex items-center justify-end gap-2">
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

                  <div className="pt-2 flex flex-col gap-2">
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
          onClose={() => setEditingWebsiteTenant(null)}
          onSaved={async (savedTenantId) => {
            await fetchTenants();
            // Keep editing open or update tenant state in place
            const updated = tenants.find((t) => t.tenantId === savedTenantId);
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
                    setIsTenantIdTouched(true);
                    setFormTenantId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
                  }}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none transition text-xs"
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Used in Firestore paths (/tenants/{formTenantId || 'tenantId'}) for strict database isolation.
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

              {/* Owner Email (Optional) */}
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  Owner Email <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="email"
                  placeholder="e.g. owner@apexdental.com"
                  value={formOwnerEmail}
                  onChange={(e) => setFormOwnerEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-emerald-500 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none transition"
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Initial primary contact email for tenant administrative records.
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
    </div>
  );
};
