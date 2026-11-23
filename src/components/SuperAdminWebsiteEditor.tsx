import React, { useEffect, useState } from 'react';
import { ClientConfig, TenantRecord } from '../types';
import { ConfigEditorDrawer } from './ConfigEditorDrawer';
import { LiveWebsitePreview } from './LiveWebsitePreview';
import {
  fetchTenantWebsiteDraft,
  saveTenantWebsiteDraft,
  publishTenantWebsiteAtomic,
  unpublishTenantWebsiteAtomic,
  fetchPublicWebsiteConfig,
  verifyServerAdminCapabilities,
  verifyRootAdminStatus,
  getTenantRecord,
  updateTenantSlugAtomic,
  validateAndNormalizeSlug,
} from '../auth/clientAuth';
import { auth } from '../firebase';
import { INDUSTRY_PRESETS } from '../presets/industryPresets';
import { DEMO_CLIENT_CONFIG } from '../presets/clientPresets';
import {
  Globe,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Eye,
  Sliders,
  Smartphone,
  Monitor,
  UploadCloud,
  EyeOff,
  AlertTriangle,
  Building2,
  ShieldCheck,
  FileText,
  Link2,
} from 'lucide-react';

interface SuperAdminWebsiteEditorProps {
  tenant: TenantRecord;
  isRootAdmin?: boolean;
  onClose: () => void;
  onSaved?: (tenantId: string) => void;
}

/**
 * Initialize fallback baseline ClientConfig based on tenant industry preset
 */
function getInitialPresetConfig(tenant: TenantRecord): ClientConfig {
  const rawKey = (tenant.industry || 'general-business').toLowerCase().trim();
  const preset = INDUSTRY_PRESETS[rawKey] || INDUSTRY_PRESETS['general-business'] || DEMO_CLIENT_CONFIG;
  return {
    ...preset,
    clientId: tenant.tenantId,
    businessName: tenant.businessName || preset.businessName,
    email: tenant.ownerEmail || preset.email,
  };
}

export const SuperAdminWebsiteEditor: React.FC<SuperAdminWebsiteEditorProps> = ({
  tenant,
  isRootAdmin = false,
  onClose,
  onSaved,
}) => {
  const [verifiedRootAdmin, setVerifiedRootAdmin] = useState<boolean>(false);
  const [config, setConfig] = useState<ClientConfig>(() => getInitialPresetConfig(tenant));
  const [initialLoadedConfig, setInitialLoadedConfig] = useState<ClientConfig>(() => getInitialPresetConfig(tenant));
  const [isPublished, setIsPublished] = useState<boolean>(Boolean(tenant.isPublished));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isPublishingAction, setIsPublishingAction] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);

  // View state: 'preview' (Live preview) or 'edit' (Config drawer open)
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');

  // Preview device mode: 'desktop' or 'mobile'
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop');

  // Confirmation dialogs
  const [confirmDialog, setConfirmDialog] = useState<{
    action: 'publish' | 'unpublish';
    title: string;
    description: string;
  } | null>(null);

  // Public URL Slug modal state
  const [activeSlug, setActiveSlug] = useState<string>(tenant.slug || '');
  const [isSlugModalOpen, setIsSlugModalOpen] = useState<boolean>(false);
  const [slugDraftInput, setSlugDraftInput] = useState<string>((tenant.slug || tenant.tenantId || '').replace(/_/g, '-'));
  const [slugError, setSlugError] = useState<string | null>(null);
  const [isSavingSlug, setIsSavingSlug] = useState<boolean>(false);

  const isTenantActive = tenant.status === 'active';

  // Load existing configuration: checks private draft first, falls back to public website, then preset
  useEffect(() => {
    let isMounted = true;

    async function loadWebsiteConfig() {
      setIsLoading(true);
      setStatusMessage(null);

      // Verify strict Root Admin authorization
      const caps = await verifyServerAdminCapabilities(auth.currentUser);
      const rootOk = isRootAdmin && caps.isRootAdmin;
      if (isMounted) {
        setVerifiedRootAdmin(rootOk);
      }
      if (!rootOk) {
        if (isMounted) {
          setStatusMessage({
            type: 'error',
            text: 'Unauthorized: Verified Root Administrator privileges required to manage website configuration.',
          });
          setIsLoading(false);
        }
        return;
      }

      try {
        // Loads draft first; if missing, falls back to public website; does not mutate live site
        const res = await fetchTenantWebsiteDraft(tenant.tenantId);
        if (isMounted) {
          const baseline = getInitialPresetConfig(tenant);
          if (res.success && res.config) {
            const mergedConfig: ClientConfig = {
              ...baseline,
              ...res.config,
              clientId: tenant.tenantId,
              businessName: (res.config as any).businessName || tenant.businessName || baseline.businessName,
            };
            setConfig(mergedConfig);
            setInitialLoadedConfig(mergedConfig);
            setIsPublished(Boolean(res.isPublished));
          } else {
            // No saved draft or public doc yet: start with preset draft
            setConfig(baseline);
            setInitialLoadedConfig(baseline);
            setIsPublished(false);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setStatusMessage({
            type: 'error',
            text: err?.message || 'Could not load saved website configuration.',
          });
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadWebsiteConfig();
    return () => {
      isMounted = false;
    };
  }, [tenant.tenantId]);

  useEffect(() => {
    setActiveSlug(tenant.slug || '');
  }, [tenant.slug]);

  const handleSaveSlug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingSlug) return;
    setSlugError(null);

    const validation = validateAndNormalizeSlug(slugDraftInput);
    if (!validation.isValid) {
      setSlugError(validation.error || 'Invalid URL slug.');
      return;
    }

    setIsSavingSlug(true);
    try {
      const rootOk = await verifyRootAdminStatus(auth.currentUser);
      if (!rootOk) {
        setSlugError('Action rejected: Only verified Root Admin can update public URL slugs.');
        setIsSavingSlug(false);
        return;
      }

      const res = await updateTenantSlugAtomic(tenant.tenantId, validation.normalizedSlug);
      if (!res.success) {
        setSlugError(res.error || 'Failed to update public URL slug.');
        setIsSavingSlug(false);
        return;
      }
      setActiveSlug(validation.normalizedSlug);
      setIsSlugModalOpen(false);
      setStatusMessage({
        type: 'success',
        text: `Public URL "/${validation.normalizedSlug}" saved and mapped to "${tenant.tenantId}".`,
      });
      if (onSaved) onSaved(tenant.tenantId);
    } catch (err: any) {
      setSlugError(err?.message || 'Unexpected error while saving public URL slug.');
    } finally {
      setIsSavingSlug(false);
    }
  };

  // Track in-memory modifications
  const handleConfigChange = (newConfig: ClientConfig) => {
    setConfig(newConfig);
    setHasUnsavedChanges(true);
    if (statusMessage) setStatusMessage(null);
  };

  // Reset in-memory changes back to industry default
  const handleResetToPreset = () => {
    const preset = getInitialPresetConfig(tenant);
    setConfig(preset);
    setHasUnsavedChanges(true);
    setStatusMessage({
      type: 'success',
      text: 'Reset in-memory fields to industry preset. Click "Save Draft" to persist.',
    });
  };

  // 1. Save Draft (Writes ONLY to /tenants/{tenantId}/private/websiteDraft; NEVER alters live site)
  const handleSaveDraft = async () => {
    setIsSaving(true);
    setStatusMessage(null);

    const rootOk = await verifyRootAdminStatus(auth.currentUser);
    if (!rootOk) {
      setStatusMessage({
        type: 'error',
        text: 'Save rejected: Only verified Root Admin can modify website configurations.',
      });
      setIsSaving(false);
      return;
    }

    try {
      // Writes exclusively to private working draft document
      const res = await saveTenantWebsiteDraft(tenant.tenantId, config);

      if (res.success) {
        setHasUnsavedChanges(false);
        setInitialLoadedConfig(config);
        setStatusMessage({
          type: 'success',
          text: `Website draft for "${tenant.businessName}" saved successfully in private draft. Live website remains completely untouched.`,
        });
        if (onSaved) onSaved(tenant.tenantId);
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to persist website draft to Firestore.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error occurred while saving website configuration.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // 2. Publish Website Workflow (Atomic batch write, strictly requires active tenant)
  const executePublish = async () => {
    setIsPublishingAction(true);
    setStatusMessage(null);
    setConfirmDialog(null);

    const rootOk = await verifyRootAdminStatus(auth.currentUser);
    if (!rootOk) {
      setStatusMessage({
        type: 'error',
        text: 'Action rejected: Only verified Root Admin can publish websites.',
      });
      setIsPublishingAction(false);
      return;
    }

    // Security Invariant: Verify tenant document status is strictly 'active'
    try {
      const freshTenant = await getTenantRecord(tenant.tenantId);
      if (!freshTenant || freshTenant.status !== 'active') {
        setStatusMessage({
          type: 'error',
          text: `Publishing blocked: Tenant account status is "${freshTenant?.status || 'unknown'}". Only active tenants can be published. Suspended tenants cannot be published.`,
        });
        setIsPublishingAction(false);
        return;
      }

      // Atomically publish using writeBatch()
      const publishRes = await publishTenantWebsiteAtomic(tenant.tenantId, config);
      if (!publishRes.success) {
        setStatusMessage({
          type: 'error',
          text: publishRes.error || 'Failed to publish website atomically.',
        });
        setIsPublishingAction(false);
        return;
      }

      // Re-verify the saved state
      const verifyRes = await fetchPublicWebsiteConfig(tenant.tenantId);
      if (verifyRes.success && verifyRes.isPublished === true) {
        setIsPublished(true);
        setHasUnsavedChanges(false);
        setInitialLoadedConfig(config);
        setStatusMessage({
          type: 'success',
          text: `Website for "${tenant.businessName}" is now LIVE and PUBLISHED to public visitors.`,
        });
        if (onSaved) onSaved(tenant.tenantId);
      } else {
        setStatusMessage({
          type: 'warning',
          text: 'Website configuration committed, but verification check returned draft state. Please refresh.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to publish website.',
      });
    } finally {
      setIsPublishingAction(false);
    }
  };

  // 3. Unpublish Website Workflow (Atomic batch write, non-destructive)
  const executeUnpublish = async () => {
    setIsPublishingAction(true);
    setStatusMessage(null);
    setConfirmDialog(null);

    const rootOk = await verifyRootAdminStatus(auth.currentUser);
    if (!rootOk) {
      setStatusMessage({
        type: 'error',
        text: 'Action rejected: Only verified Root Admin can unpublish websites.',
      });
      setIsPublishingAction(false);
      return;
    }

    try {
      // Atomically unpublish using writeBatch()
      const unpublishRes = await unpublishTenantWebsiteAtomic(tenant.tenantId);
      if (!unpublishRes.success) {
        setStatusMessage({
          type: 'error',
          text: unpublishRes.error || 'Failed to unpublish website atomically.',
        });
        setIsPublishingAction(false);
        return;
      }

      setIsPublished(false);
      setHasUnsavedChanges(false);
      setStatusMessage({
        type: 'success',
        text: `Website for "${tenant.businessName}" has been unpublished and reverted to DRAFT. Public visitors can no longer view it, but all content is preserved.`,
      });
      if (onSaved) onSaved(tenant.tenantId);
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Failed to unpublish website.',
      });
    } finally {
      setIsPublishingAction(false);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmDiscard = window.confirm(
        'You have unsaved modifications to this website draft. Are you sure you want to close without saving?'
      );
      if (!confirmDiscard) return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md animate-in fade-in select-none">
      {/* Top Banner Control Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 sm:px-6 flex flex-wrap items-center justify-between gap-3 shadow-xl z-50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                Website Manager: {tenant.businessName}
              </h2>
              <span className="font-mono text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-500/30 px-2 py-0.5 rounded">
                {tenant.tenantId}
              </span>

              {/* Publication Status Badge */}
              {isPublished ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  PUBLISHED (LIVE)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                  DRAFT (UNPUBLISHED)
                </span>
              )}

              {/* Account Status Badge */}
              {!isTenantActive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  TENANT SUSPENDED
                </span>
              )}

              {/* Public URL Slug Action Badge (Root Admin Only) */}
              {verifiedRootAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setSlugDraftInput((activeSlug || tenant.tenantId || '').replace(/_/g, '-'));
                    setSlugError(null);
                    setIsSlugModalOpen(true);
                  }}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                    activeSlug
                      ? 'bg-sky-500/10 text-sky-300 border-sky-500/30 hover:bg-sky-500/20'
                      : 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                  }`}
                  title="Set or update the public URL path slug in /slugs/{slug}"
                >
                  <Link2 className="w-3 h-3" />
                  <span>{activeSlug ? `URL: /${activeSlug}` : 'Set Public URL'}</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Industry: <span className="capitalize text-slate-300">{tenant.industry || 'General'}</span> • Document: <span className="font-mono text-slate-400">/tenants/{tenant.tenantId}/public/website</span>
            </p>
          </div>
        </div>

        {/* View Mode & Actions Bar */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Preview / Edit Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 shadow-inner">
            <button
              onClick={() => setViewMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'preview'
                  ? 'bg-blue-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Preview the landing page"
            >
              <Eye className="w-3.5 h-3.5" />
              <span>Preview</span>
            </button>
            <button
              onClick={() => setViewMode('edit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                viewMode === 'edit'
                  ? 'bg-amber-500 text-slate-950 font-black shadow'
                  : 'text-amber-400/90 hover:text-amber-300'
              }`}
              title="Edit landing page sections & content"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Edit Content</span>
            </button>
          </div>

          {/* Device Switcher (when in preview mode) */}
          {viewMode === 'preview' && (
            <div className="hidden sm:flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 shadow-inner">
              <button
                onClick={() => setPreviewDevice('desktop')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  previewDevice === 'desktop' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Desktop View (Full Width)"
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPreviewDevice('mobile')}
                className={`p-1.5 rounded-lg transition cursor-pointer ${
                  previewDevice === 'mobile' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
                }`}
                title="Mobile View (375px Device Frame)"
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Save Draft Action */}
          <button
            onClick={handleSaveDraft}
            disabled={isSaving || isPublishingAction || isLoading}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 border border-slate-700 font-bold text-xs shadow-sm transition cursor-pointer"
            title="Save draft changes persistently to Firestore without publishing"
          >
            {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" /> : <Save className="w-3.5 h-3.5" />}
            <span>{isSaving ? 'Saving...' : 'Save Draft'}</span>
          </button>

          {/* Publish / Unpublish Action */}
          {isPublished ? (
            <button
              onClick={() =>
                setConfirmDialog({
                  action: 'unpublish',
                  title: `Unpublish "${tenant.businessName}"?`,
                  description:
                    'This will revert the landing page to DRAFT. Public visitors will no longer be able to access this website. All website content will remain completely intact in Firestore.',
                })
              }
              disabled={isSaving || isPublishingAction || isLoading}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 disabled:opacity-50 text-rose-300 border border-rose-800/50 font-bold text-xs shadow-sm transition cursor-pointer"
              title="Unpublish website (revert to draft)"
            >
              {isPublishingAction ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span>Unpublish</span>
            </button>
          ) : (
            <button
              onClick={() => {
                if (!isTenantActive) {
                  setStatusMessage({
                    type: 'error',
                    text: 'Cannot publish: This tenant is SUSPENDED. Only active tenants can publish public landing pages.',
                  });
                  return;
                }
                setConfirmDialog({
                  action: 'publish',
                  title: `Publish Website for "${tenant.businessName}"?`,
                  description:
                    'This will publish the website configuration to Firestore (/tenants/' +
                    tenant.tenantId +
                    '/public/website). Anonymous public visitors will be able to view this landing page and submit enquiries.',
                });
              }}
              disabled={isSaving || isPublishingAction || isLoading || !isTenantActive}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-bold text-xs shadow-md transition ${
                !isTenantActive
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
              }`}
              title={
                !isTenantActive
                  ? 'Tenant is suspended. Cannot publish website.'
                  : 'Publish website for public visitors'
              }
            >
              {isPublishingAction ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <UploadCloud className="w-3.5 h-3.5" />
              )}
              <span>Publish Website</span>
            </button>
          )}

          {/* Close Editor */}
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
            title="Close Website Manager"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`mx-4 sm:mx-6 mt-2 p-3 rounded-xl text-xs flex items-center justify-between shadow-md z-40 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : statusMessage.type === 'warning'
              ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : statusMessage.type === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-bold">{statusMessage.text}</span>
          </div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-white text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Preview / Edit Workspace */}
      <main className="flex-1 relative overflow-auto bg-slate-950 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center p-8 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl max-w-sm w-full">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin mx-auto mb-3" />
              <h3 className="text-sm font-bold text-white">Loading Website Content</h3>
              <p className="text-xs text-slate-400 mt-1">
                Fetching configuration from /tenants/{tenant.tenantId}/public/website...
              </p>
            </div>
          </div>
        ) : viewMode === 'preview' ? (
          /* Live Website Preview Mode */
          <div className="flex-1 overflow-y-auto flex justify-center p-2 sm:p-6">
            <div
              className={`transition-all duration-300 w-full ${
                previewDevice === 'mobile'
                  ? 'max-w-[400px] border-4 border-slate-800 rounded-3xl overflow-hidden shadow-2xl bg-white my-auto'
                  : 'max-w-7xl shadow-xl rounded-2xl overflow-hidden bg-white'
              }`}
            >
              {/* Mobile device status bar simulation */}
              {previewDevice === 'mobile' && (
                <div className="bg-slate-900 text-white text-[10px] px-4 py-1.5 flex items-center justify-between border-b border-slate-800 font-mono">
                  <span>9:41</span>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                    <span>5G</span>
                  </div>
                </div>
              )}

              {/* Render actual landing page using LiveWebsitePreview */}
              <LiveWebsitePreview
                config={{
                  ...config,
                  sampleDataNoticeEnabled: false,
                  heroTrustBadgesEnabled: false,
                }}
                appMode="client"
              />
            </div>
          </div>
        ) : (
          /* Edit Content Mode: Explanatory Landing Card behind drawer */
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center p-8 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl max-w-md w-full">
              <div className="w-12 h-12 bg-slate-800 text-amber-400 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-700">
                <Sliders className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">
                Website Editor: {tenant.businessName}
              </h3>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                The sliding configuration panel is open on the right. You can edit branding, copy, services, contact details, and FAQs. Switch back to "Preview" anytime to see your live changes.
              </p>
              <div className="mt-5 pt-4 border-t border-slate-800 flex items-center justify-center gap-3">
                <button
                  onClick={() => setViewMode('preview')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow transition cursor-pointer flex items-center gap-1.5"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View Live Preview</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reused ConfigEditorDrawer (opens when viewMode === 'edit') */}
        {!isLoading && (
          <ConfigEditorDrawer
            isOpen={viewMode === 'edit'}
            onClose={() => setViewMode('preview')}
            config={config}
            onChangeConfig={handleConfigChange}
            onResetPreset={handleResetToPreset}
          />
        )}
      </main>

      {/* Confirmation Dialog Modal (Publish / Unpublish) */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-start gap-3 mb-4">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  confirmDialog.action === 'publish'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                }`}
              >
                {confirmDialog.action === 'publish' ? (
                  <UploadCloud className="w-5 h-5" />
                ) : (
                  <EyeOff className="w-5 h-5" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-white">{confirmDialog.title}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {confirmDialog.description}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                disabled={isPublishingAction}
                className="px-4 py-2 rounded-xl text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  confirmDialog.action === 'publish' ? executePublish() : executeUnpublish()
                }
                disabled={isPublishingAction}
                className={`flex items-center gap-2 px-5 py-2 rounded-xl font-bold text-xs transition shadow-md cursor-pointer ${
                  confirmDialog.action === 'publish'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {isPublishingAction && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {confirmDialog.action === 'publish'
                    ? isPublishingAction
                      ? 'Publishing...'
                      : 'Confirm & Publish'
                    : isPublishingAction
                    ? 'Unpublishing...'
                    : 'Confirm & Unpublish'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Public URL Slug Modal */}
      {isSlugModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-slate-100">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
                  <Link2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Public Website URL Slug</h3>
                  <p className="text-xs text-slate-400">{tenant.businessName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !isSavingSlug && setIsSlugModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {slugError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{slugError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSlug} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">URL Path Slug</label>
                <div className="flex items-center bg-slate-950 border border-slate-700 focus-within:border-sky-500 rounded-xl overflow-hidden">
                  <span className="px-3 py-2.5 text-slate-500 bg-slate-900 border-r border-slate-800 font-mono">/</span>
                  <input
                    type="text"
                    required
                    value={slugDraftInput}
                    onChange={(e) => setSlugDraftInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                    placeholder="e.g. demo-tarot-kochi"
                    className="w-full bg-transparent px-3 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none"
                    disabled={isSavingSlug}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Maps <span className="font-mono text-sky-300">/slugs/{slugDraftInput || 'slug'}</span> to <span className="font-mono text-emerald-400">{tenant.tenantId}</span>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSlugModalOpen(false)}
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
    </div>
  );
};
