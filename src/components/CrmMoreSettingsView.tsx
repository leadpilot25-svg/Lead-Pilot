import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Building2,
  FileSpreadsheet,
  Upload,
  Download,
  Users,
  Settings,
  Activity,
  ChevronRight,
  ChevronLeft,
  RotateCw,
  Check,
  AlertTriangle,
  ExternalLink,
  Phone,
  Mail,
  MapPin,
  Clock,
  Star,
  Globe,
  ShieldCheck,
  TrendingUp,
  Smartphone,
} from 'lucide-react';
import { ClientConfig, LeadItem, LeadStatus } from '../types';
import { SheetSyncSummary } from '../utils/leadStorage';
import { SUPPORTED_COUNTRY_CODES } from '../utils/phoneUtils';
import { TenantStaffManager } from './TenantStaffManager';
import { PWAInstallCard } from './PWAInstallCard';
import { usePWAInstall } from '../pwa/installPromptStore';

export type MoreSettingsSection =
  | 'profile'
  | 'sheets'
  | 'import'
  | 'export'
  | 'team'
  | 'settings'
  | 'install'
  | 'status';

interface CrmMoreSettingsViewProps {
  currentConfig: ClientConfig;
  appMode: 'development' | 'client';
  currentUserRole: 'client_admin' | 'client_staff';
  currentUserUid?: string;
  activeTenantScope: string;
  leads: LeadItem[];
  endpoint: string;
  isGatewayMode: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncSummary: SheetSyncSummary | null;
  autoSyncEnabled: boolean;
  connStatus: 'testing' | 'connected' | 'failed' | 'unconfigured';
  connMsg: string;
  isTestingConn: boolean;
  selectedCountryCode: string;
  clientIdsList: string[];
  selectedClientId: string;
  onChangeClientId: (clientId: string) => void;
  onChangeCountryCode: (code: string) => void;
  onToggleAutoSync: () => void;
  onSyncNow: () => void;
  onTestConnection: () => void;
  onOpenImportModal: () => void;
  onOpenTestOnboarding?: () => void;
  onExportMessage?: (type: 'success' | 'error', message: string) => void;
}

function escapeSpreadsheetFormula(value: string): string {
  const trimmed = value.trimStart();
  if (!trimmed) return value;
  if (/^[=@\t\r]/.test(trimmed)) {
    return `'${value}`;
  }
  if (/^[+-]/.test(trimmed) && !/^[+]?\d[\d\s()-]*$/.test(trimmed)) {
    return `'${value}`;
  }
  return value;
}

export const CrmMoreSettingsView: React.FC<CrmMoreSettingsViewProps> = ({
  currentConfig,
  appMode,
  currentUserRole,
  currentUserUid,
  activeTenantScope,
  leads,
  endpoint,
  isGatewayMode,
  isSyncing,
  lastSyncTime,
  syncSummary,
  autoSyncEnabled,
  connStatus,
  connMsg,
  isTestingConn,
  selectedCountryCode,
  clientIdsList,
  selectedClientId,
  onChangeClientId,
  onChangeCountryCode,
  onToggleAutoSync,
  onSyncNow,
  onTestConnection,
  onOpenImportModal,
  onOpenTestOnboarding,
  onExportMessage,
}) => {
  const [activeSection, setActiveSection] = useState<MoreSettingsSection>('profile');
  const [mobileShowingMenu, setMobileShowingMenu] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const { isInstallable, isInstalled } = usePWAInstall();

  const menuItems: Array<{
    id: MoreSettingsSection;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      id: 'profile',
      label: 'Business Profile',
      description: 'Contact details, hours, and listed services',
      icon: Building2,
    },
    {
      id: 'sheets',
      label: 'Google Sheets Sync',
      description: syncSummary
        ? syncSummary.success
          ? `Last synced ${lastSyncTime || 'recently'}`
          : 'Sync needs attention'
        : 'Manual sync, auto-sync, and sync summary',
      icon: FileSpreadsheet,
    },
    {
      id: 'import',
      label: 'Import Leads',
      description: 'Upload leads from CSV or Excel files',
      icon: Upload,
    },
    {
      id: 'export',
      label: 'Export Leads',
      description: `Download ${leads.length} lead(s) as CSV or Excel`,
      icon: Download,
    },
    {
      id: 'team',
      label: 'Team Access',
      description:
        currentUserRole === 'client_admin'
          ? 'Invite and manage staff members'
          : 'View your team permissions',
      icon: Users,
    },
    {
      id: 'settings',
      label: 'CRM Settings',
      description: 'Country code, messaging template, and pipeline stats',
      icon: Settings,
    },
    {
      id: 'install',
      label: 'Install LeadPilot',
      description: isInstalled
        ? 'Installed in app mode on this device'
        : isInstallable
        ? 'Tap to add LeadPilot to your home screen'
        : 'Add LeadPilot CRM shortcut to home screen',
      icon: Smartphone,
    },
    {
      id: 'status',
      label: 'Integration Status',
      description: 'Firestore isolation and sheet gateway health',
      icon: Activity,
    },
  ];

  const handleSelectMenu = (section: MoreSettingsSection) => {
    setActiveSection(section);
    setMobileShowingMenu(false);
  };

  const handleExportLeads = (format: 'csv' | 'xlsx') => {
    if (leads.length === 0) {
      onExportMessage?.('error', 'No leads available to export for this business yet.');
      return;
    }

    setIsExporting(true);
    try {
      const rows = leads.map((lead) => ({
        'Lead ID': escapeSpreadsheetFormula(lead.id || ''),
        'Customer Name': escapeSpreadsheetFormula(lead.name || ''),
        Phone: escapeSpreadsheetFormula(lead.phone || ''),
        Email: escapeSpreadsheetFormula(lead.email || ''),
        Service: escapeSpreadsheetFormula(lead.service || ''),
        Address: escapeSpreadsheetFormula(lead.address || ''),
        Status: escapeSpreadsheetFormula(lead.status || 'New'),
        'Follow-up Date': lead.followUpDate || '',
        'Lead Source': escapeSpreadsheetFormula(lead.leadSource || ''),
        'Created At': lead.timestamp || '',
        Details: escapeSpreadsheetFormula(lead.details || ''),
        'Contact Count': lead.contactCount || 0,
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');
      const dateStr = new Date().toISOString().slice(0, 10);
      const safeTenant = (activeTenantScope || 'leads').replace(/[^a-z0-9_-]/gi, '-');
      XLSX.writeFile(workbook, `${safeTenant}-leads-${dateStr}.${format}`);
      onExportMessage?.(
        'success',
        `Exported ${leads.length} lead(s) as ${format.toUpperCase()}.`
      );
    } catch (err: any) {
      onExportMessage?.('error', err?.message || 'Could not export leads.');
    } finally {
      setIsExporting(false);
    }
  };

  // Pipeline summary metrics moved cleanly into CRM Settings
  const totalLeadsCount = leads.length;
  const newCount = leads.filter((l) => l.status === 'New').length;
  const contactedCount = leads.filter((l) => l.status === 'Contacted').length;
  const followUpStageCount = leads.filter((l) => l.status === 'Follow-up').length;
  const qualifiedCount = leads.filter((l) => l.status === 'Qualified').length;
  const wonCount = leads.filter((l) => l.status === 'Won').length;
  const lostCount = leads.filter((l) => l.status === 'Lost').length;
  const engagedCount = leads.filter((l) => l.status !== 'New' && l.status !== 'Lost').length;
  const totalTouches = leads.reduce((acc, l) => acc + (l.contactCount || 0), 0);
  const contactRatePct = totalLeadsCount > 0 ? Math.round((engagedCount / totalLeadsCount) * 100) : 0;
  const winRatePct = totalLeadsCount > 0 ? Math.round((wonCount / totalLeadsCount) * 100) : 0;
  const avgTouches = totalLeadsCount > 0 ? (totalTouches / totalLeadsCount).toFixed(1) : '0.0';

  const activeMenuObj = menuItems.find((m) => m.id === activeSection) || menuItems[0];

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'profile':
        return (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">{currentConfig.businessName}</h3>
              <p className="text-xs text-slate-400 mt-1">
                Tenant: <span className="font-mono text-slate-300">{activeTenantScope}</span>{' '}
                <span aria-hidden="true">·</span>{' '}
                <span className="capitalize">{currentConfig.industry || 'General business'}</span>
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
              <div className="space-y-4">
                <div>
                  <div className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>Primary Phone</span>
                  </div>
                  <div className="text-sm font-semibold text-white font-mono tabular-nums">
                    {currentConfig.phone || 'Not set'}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>Business Email</span>
                  </div>
                  <div className="text-sm font-medium text-slate-200 break-all">
                    {currentConfig.email || 'Not set'}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>Service Area</span>
                  </div>
                  <div className="text-sm font-medium text-slate-200">
                    {currentConfig.serviceArea || currentConfig.cityStateZip || 'Not set'}
                  </div>
                  {currentConfig.address && (
                    <div className="text-xs text-slate-400 mt-0.5">{currentConfig.address}</div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Business Hours</span>
                  </div>
                  <div className="text-sm font-medium text-slate-200">
                    {currentConfig.businessHours || 'Standard Business Hours'}
                  </div>
                </div>

                <div>
                  <div className="text-slate-400 font-medium mb-1 flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span>Reputation & Google Profile</span>
                  </div>
                  <div className="text-sm font-semibold text-white tabular-nums">
                    {currentConfig.averageRating ?? (currentConfig as any).googleRating ?? 0} rating{' '}
                    <span aria-hidden="true">·</span> {currentConfig.reviewCount || 0}+ reviews
                  </div>
                  <a
                    href={
                      currentConfig.googleBusinessProfileUrl ||
                      currentConfig.googleBusinessProfileLink ||
                      currentConfig.googleMapsLink ||
                      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${currentConfig.businessName} ${currentConfig.cityStateZip || ''}`
                      )}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300"
                  >
                    <span>Open Google Business Profile</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            </div>

            {currentConfig.services && currentConfig.services.length > 0 && (
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <h4 className="text-xs font-semibold text-slate-300">
                  Listed Services ({currentConfig.services.length})
                </h4>
                <div className="divide-y divide-slate-800/80 border border-slate-800 rounded-xl bg-slate-950/60">
                  {currentConfig.services.map((svc, idx) => (
                    <div key={idx} className="p-3">
                      <div className="text-xs font-semibold text-white">{svc.title}</div>
                      {svc.description && (
                        <div className="text-xs text-slate-400 mt-0.5">{svc.description}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'sheets':
        return (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-white">Google Sheets Sync</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Sync incoming enquiries and lead updates with your connected spreadsheet.
                </p>
              </div>
              <button
                type="button"
                onClick={onSyncNow}
                disabled={isSyncing}
                className="min-h-[44px] sm:min-h-[38px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'Syncing...' : syncSummary && !syncSummary.success ? 'Retry Sync' : 'Sync Now'}</span>
              </button>
            </div>

            {/* Current Sync Status Summary */}
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                syncSummary && !syncSummary.success
                  ? 'bg-rose-950/30 border-rose-500/40 text-rose-200'
                  : 'bg-slate-950 border-slate-800 text-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-semibold flex items-center gap-2">
                  {syncSummary && !syncSummary.success ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : (
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>
                    {syncSummary
                      ? syncSummary.success
                        ? 'Synchronization healthy'
                        : 'Synchronization issue'
                      : isGatewayMode || endpoint
                      ? 'Ready to sync'
                      : 'Google Sheets endpoint not configured'}
                  </span>
                </div>
                {lastSyncTime && (
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    Last attempt: {lastSyncTime}
                  </span>
                )}
              </div>
              {syncSummary?.message && (
                <p className="text-xs text-slate-300 leading-relaxed">{syncSummary.message}</p>
              )}
            </div>

            {/* Exact Breakdown Counts */}
            {syncSummary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="text-xs text-slate-400">New Imported</div>
                  <div className="text-xl font-bold text-emerald-400 mt-1 tabular-nums">
                    {syncSummary.newLeadsImported}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="text-xs text-slate-400">Updated</div>
                  <div className="text-xl font-bold text-sky-400 mt-1 tabular-nums">
                    {syncSummary.existingLeadsUpdated}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="text-xs text-slate-400">Duplicates Skipped</div>
                  <div className="text-xl font-bold text-slate-200 mt-1 tabular-nums">
                    {syncSummary.duplicatesSkipped}
                  </div>
                </div>
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                  <div className="text-xs text-slate-400">Validation Skipped</div>
                  <div className="text-xl font-bold text-amber-400 mt-1 tabular-nums">
                    {syncSummary.rowsSkippedDueToValidationError}
                  </div>
                </div>
              </div>
            )}

            {/* Auto-sync & Connection Controls */}
            <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/60">
              <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Automatic Background Sync</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Checks Google Sheets for updates every 60 seconds while CRM is open.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onToggleAutoSync}
                  className={`min-h-[40px] px-4 py-2 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    autoSyncEnabled
                      ? 'bg-emerald-600/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                >
                  {autoSyncEnabled ? 'Auto-Sync On (60s)' : 'Auto-Sync Off'}
                </button>
              </div>

              {appMode === 'development' && (
                <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white">Apps Script Endpoint Check</div>
                    <div className="text-xs text-slate-400 mt-0.5 truncate">
                      {connMsg || (endpoint ? endpoint : 'No endpoint URL configured')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onTestConnection}
                    disabled={isTestingConn}
                    className="min-h-[40px] px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-700 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {isTestingConn ? 'Testing...' : 'Test Connection'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'import':
        return (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Import Leads</h3>
              <p className="text-xs text-slate-400 mt-1">
                Bring existing enquiries from spreadsheets into {currentConfig.businessName} without overwriting existing leads.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold text-white">CSV or Excel (.xlsx) Upload</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Map spreadsheet columns to LeadPilot fields, automatically normalize phone numbers, and skip duplicate phone or email entries before saving.
                </p>
              </div>

              <button
                type="button"
                onClick={onOpenImportModal}
                className="min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
                <span>Open Import Wizard</span>
              </button>
            </div>
          </div>
        );

      case 'export':
        return (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Export Leads</h3>
              <p className="text-xs text-slate-400 mt-1">
                Download a clean copy of all {leads.length} lead(s) for {currentConfig.businessName}.
              </p>
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="text-xs text-slate-300 space-y-1">
                <div className="font-semibold text-white">Included Fields</div>
                <p className="text-slate-400">
                  Lead ID, Customer Name, Phone, Email, Service, Address, Status, Follow-up Date, Lead Source, Created Date, Details, and Contact Count.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={isExporting || leads.length === 0}
                  onClick={() => handleExportLeads('csv')}
                  className="min-h-[44px] px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV ({leads.length})</span>
                </button>
                <button
                  type="button"
                  disabled={isExporting || leads.length === 0}
                  onClick={() => handleExportLeads('xlsx')}
                  className="min-h-[44px] px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white border border-slate-700 text-xs font-semibold rounded-xl inline-flex items-center gap-2 transition-colors cursor-pointer"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Export Excel (.xlsx)</span>
                </button>
              </div>
            </div>
          </div>
        );

      case 'team':
        return (
          <div className="space-y-4">
            {currentUserRole === 'client_admin' && currentUserUid ? (
              <TenantStaffManager
                tenantId={activeTenantScope}
                businessName={currentConfig.businessName}
                currentUserUid={currentUserUid}
                embedded={true}
              />
            ) : (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-2">
                <h3 className="text-base font-bold text-white">Team Access</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {currentUserRole === 'client_staff'
                    ? 'You are signed in as a team staff member. Only the organization owner can invite or remove team accounts.'
                    : 'Team member invitations are available to signed-in organization owners in the live CRM portal.'}
                </p>
              </div>
            )}
          </div>
        );

      case 'settings':
        return (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">CRM Settings</h3>
              <p className="text-xs text-slate-400 mt-1">
                Configure phone formatting, messaging templates, and view pipeline statistics.
              </p>
            </div>

            {/* Country Code Setting */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  <span>Default Dialing Country Code</span>
                </label>
                <p className="text-xs text-slate-400 mt-0.5">
                  Applied to 10-digit phone numbers for Call and WhatsApp links.
                </p>
              </div>
              <select
                value={selectedCountryCode}
                onChange={(e) => onChangeCountryCode(e.target.value)}
                className="w-full sm:w-auto min-h-[44px] bg-slate-900 border border-slate-700 text-white font-semibold text-xs rounded-xl px-3 py-2 outline-none focus:border-emerald-500 cursor-pointer"
              >
                {SUPPORTED_COUNTRY_CODES.map((opt) => (
                  <option key={opt.code} value={opt.code}>
                    {opt.flag} +{opt.code} · {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Pipeline & Performance Summary (preserved off main page) */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-white flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>Pipeline Breakdown</span>
                </h4>
                <span className="text-xs text-slate-400 tabular-nums">
                  {totalLeadsCount} total leads
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">New</div>
                  <div className="text-lg font-bold text-white mt-0.5 tabular-nums">{newCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Contacted</div>
                  <div className="text-lg font-bold text-white mt-0.5 tabular-nums">{contactedCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Follow-up</div>
                  <div className="text-lg font-bold text-white mt-0.5 tabular-nums">{followUpStageCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Qualified</div>
                  <div className="text-lg font-bold text-white mt-0.5 tabular-nums">{qualifiedCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Won</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5 tabular-nums">{wonCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-slate-400">Lost</div>
                  <div className="text-lg font-bold text-slate-400 mt-0.5 tabular-nums">{lostCount}</div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-300 tabular-nums">
                <span>Contact rate: <strong className="text-white">{contactRatePct}%</strong></span>
                <span>Win rate: <strong className="text-white">{winRatePct}%</strong></span>
                <span>Avg touches: <strong className="text-white">{avgTouches}</strong></span>
              </div>
            </div>

            {/* Development Mode Utilities */}
            {appMode === 'development' && (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-4">
                <div className="text-xs font-semibold text-white">Developer Preview Controls</div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <select
                    value={selectedClientId}
                    onChange={(e) => onChangeClientId(e.target.value)}
                    className="min-h-[40px] bg-slate-900 border border-slate-700 text-white font-mono text-xs rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Clients (Agency View)</option>
                    {clientIdsList.map((cid) => (
                      <option key={cid} value={cid}>
                        {cid} {cid === currentConfig.clientId ? `(${currentConfig.businessName})` : ''}
                      </option>
                    ))}
                  </select>
                  {onOpenTestOnboarding && (
                    <button
                      type="button"
                      onClick={onOpenTestOnboarding}
                      className="min-h-[40px] px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
                    >
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Onboarding & Security Check</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'install':
        return <PWAInstallCard />;

      case 'status':
        return (
          <div className="space-y-6">
            <div className="pb-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">Integration Status</h3>
              <p className="text-xs text-slate-400 mt-1">
                Health of your Firestore CRM database and Google Sheets synchronization.
              </p>
            </div>

            <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl bg-slate-950/60 text-xs">
              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-white">Firestore Tenant Database</div>
                  <div className="text-slate-400 mt-0.5">
                    Isolated tenant scope: <span className="font-mono text-slate-300">{activeTenantScope}</span>
                  </div>
                </div>
                <span className="text-emerald-400 font-semibold inline-flex items-center gap-1 shrink-0">
                  <Check className="w-3.5 h-3.5" />
                  <span>Active</span>
                </span>
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-white">Google Sheets Sync</div>
                  <div className="text-slate-400 mt-0.5">
                    {syncSummary
                      ? syncSummary.success
                        ? `Last synced at ${lastSyncTime || 'recently'}`
                        : syncSummary.message || 'Last sync returned an error'
                      : isGatewayMode
                      ? 'Routed securely via Cloudflare Gateway'
                      : endpoint
                      ? 'Direct Apps Script endpoint configured'
                      : 'Not configured'}
                  </div>
                </div>
                <span
                  className={`font-semibold inline-flex items-center gap-1 shrink-0 ${
                    syncSummary && !syncSummary.success
                      ? 'text-rose-400'
                      : !isGatewayMode && !endpoint
                      ? 'text-amber-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {syncSummary && !syncSummary.success ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Attention needed</span>
                    </>
                  ) : !isGatewayMode && !endpoint ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Not configured</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{connStatus === 'connected' || syncSummary?.success ? 'Connected' : 'Ready'}</span>
                    </>
                  )}
                </span>
              </div>

              <div className="p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-white">WhatsApp Country Code</div>
                  <div className="text-slate-400 mt-0.5">
                    Default prefix for 10-digit numbers
                  </div>
                </div>
                <span className="font-mono font-semibold text-slate-200">+{selectedCountryCode}</span>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="space-y-4">
      {/* Mobile Menu vs Detail View */}
      <div className="md:hidden">
        {mobileShowingMenu ? (
          <div className="space-y-4">
            <div className="pb-3 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">More & Settings</h2>
              <p className="text-xs text-slate-400 mt-1">{currentConfig.businessName}</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800/80 overflow-hidden">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectMenu(item.id)}
                    className="w-full min-h-[56px] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white">{item.label}</div>
                        <div className="text-xs text-slate-400 truncate">{item.description}</div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setMobileShowingMenu(true)}
              className="min-h-[44px] inline-flex items-center gap-1.5 text-xs font-semibold text-slate-300 hover:text-white px-2 -ml-2 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>More & Settings</span>
              <span className="text-slate-500" aria-hidden="true">/</span>
              <span className="text-white">{activeMenuObj.label}</span>
            </button>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6">
              {renderSectionContent()}
            </div>
          </div>
        )}
      </div>

      {/* Desktop 2-Column Settings Workspace */}
      <div className="hidden md:grid md:grid-cols-12 gap-6 items-start">
        <aside className="md:col-span-4 lg:col-span-3 bg-slate-900 border border-slate-800 rounded-2xl p-2 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={`w-full px-3 py-2.5 rounded-xl flex items-center gap-3 text-left transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 font-medium'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="text-xs truncate">{item.label}</span>
              </button>
            );
          })}
        </aside>

        <div className="md:col-span-8 lg:col-span-9 bg-slate-900 border border-slate-800 rounded-2xl p-6">
          {renderSectionContent()}
        </div>
      </div>
    </div>
  );
};
