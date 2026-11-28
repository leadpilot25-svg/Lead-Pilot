import React, { useState, useEffect, useRef } from 'react';
import { ClientConfig, LeadItem, LeadStatus } from '../types';
import { LeadImportModal } from './LeadImportModal';
import { ManualLeadModal } from './ManualLeadModal';
import { DeleteLeadModal } from './DeleteLeadModal';
import { TestOnboardingModal } from './TestOnboardingModal';
import { CrmFollowUpsView } from './CrmFollowUpsView';
import { CrmMoreSettingsView } from './CrmMoreSettingsView';
import {
  getStoredLeads,
  updateLeadStatus,
  addLeadNote,
  scheduleLeadFollowUp,
  logLeadContact,
  updateLeadPhone,
  testGoogleSheetConnection,
  deduplicateLeads,
  subscribeTenantLeads,
  deleteLead,
  syncGoogleSheetToCrm,
  isCloudflareGatewayMode,
  SheetSyncSummary,
} from '../utils/leadStorage';
import {
  detectDefaultCountryCode,
  formatPhoneForWhatsApp,
  formatDisplayPhone,
  normalizeImportedPhone,
} from '../utils/phoneUtils';
import {
  Phone,
  MessageSquare,
  Mail,
  Calendar,
  Clock,
  User,
  Search,
  Send,
  ChevronRight,
  RotateCw,
  Check,
  AlertTriangle,
  Globe,
  Edit2,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

export type CrmPrimaryNav = 'leads' | 'followups' | 'more';

interface LeadPilotDashboardProps {
  currentConfig: ClientConfig;
  appMode?: 'development' | 'client';
  currentUserRole?: 'client_admin' | 'client_staff';
  currentUserUid?: string;
  activeNav?: CrmPrimaryNav;
  onNavChange?: (nav: CrmPrimaryNav) => void;
  onFollowUpsDueCountChange?: (count: number) => void;
}

const getTodayLocalDateStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getTomorrowLocalDateStr = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getInNDaysLocalDateStr = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getFollowUpDateStr = (isoOrDateStr: string | undefined): string | null => {
  if (!isoOrDateStr) return null;
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr.slice(0, 10);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return isoOrDateStr.slice(0, 10);
  }
};

const formatFollowUpDisplay = (isoOrDateStr: string | undefined) => {
  if (!isoOrDateStr) return null;
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return isoOrDateStr;
  }
};

const STATUS_DOT_COLOR: Record<LeadStatus, string> = {
  New: 'text-emerald-400',
  Contacted: 'text-sky-400',
  'Follow-up': 'text-amber-300',
  Qualified: 'text-violet-300',
  Won: 'text-emerald-300',
  Lost: 'text-slate-400',
};

export const LeadPilotDashboard: React.FC<LeadPilotDashboardProps> = ({
  currentConfig,
  appMode = 'development',
  currentUserRole = 'client_admin',
  currentUserUid,
  activeNav,
  onNavChange,
  onFollowUpsDueCountChange,
}) => {
  const [leads, setLeads] = useState<LeadItem[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>(
    appMode === 'client' ? currentConfig.clientId || 'client-01' : 'all'
  );
  const [activeTab, setActiveTab] = useState<LeadStatus | 'All'>('All');
  const [internalNav, setInternalNav] = useState<CrmPrimaryNav>('leads');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<LeadItem | null>(null);

  const currentNav = activeNav ?? internalNav;
  const setCurrentNav = (next: CrmPrimaryNav) => {
    if (onNavChange) {
      onNavChange(next);
    } else {
      setInternalNav(next);
    }
  };

  useEffect(() => {
    if (appMode === 'client') {
      setSelectedClientId(currentConfig.clientId || 'client-01');
    } else if (currentConfig.clientId && selectedClientId !== 'all') {
      setSelectedClientId(currentConfig.clientId);
    }
  }, [appMode, currentConfig.clientId]);

  const [isSyncing, setIsSyncing] = useState(false);
  const isSyncingRef = useRef(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncingAction, setSyncingAction] = useState(false);
  const [actionNotification, setActionNotification] = useState<{
    type: 'success' | 'warning' | 'error';
    message: string;
    canRetrySync?: boolean;
  } | null>(null);

  const [connStatus, setConnStatus] = useState<'testing' | 'connected' | 'failed' | 'unconfigured'>('unconfigured');
  const [connMsg, setConnMsg] = useState<string>('');
  const [isTestingConn, setIsTestingConn] = useState(false);

  const [newNoteText, setNewNoteText] = useState('');
  const [followUpDateInput, setFollowUpDateInput] = useState('');
  const [followUpTimeInput, setFollowUpTimeInput] = useState('09:00');

  const [isAddLeadModalOpen, setIsAddLeadModalOpen] = useState(false);
  const [leadToDelete, setLeadToDelete] = useState<LeadItem | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTestOnboardingModalOpen, setIsTestOnboardingModalOpen] = useState(() => {
    if (appMode !== 'development') return false;
    try {
      return sessionStorage.getItem('leadpilot_restore_onboarding_modal') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isTestOnboardingModalOpen) {
      try {
        sessionStorage.removeItem('leadpilot_restore_onboarding_modal');
      } catch {
        // ignore storage errors
      }
    }
  }, [isTestOnboardingModalOpen]);

  const endpoint = currentConfig.formEndpoint ? currentConfig.formEndpoint.trim() : '';
  const activeTenantScope = appMode === 'client' ? currentConfig.clientId || 'client-01' : selectedClientId;

  const refreshLocalLeads = () => {
    const scope = appMode === 'client' ? currentConfig.clientId || 'client-01' : selectedClientId;
    const clientLeads = deduplicateLeads(getStoredLeads(scope));
    setLeads(clientLeads);
    if (selectedLead) {
      const updated = clientLeads.find((l) => l.id === selectedLead.id);
      if (updated) setSelectedLead(updated);
    }
  };

  const handleImportSuccess = (_importedCount: number, message: string) => {
    setActiveTab('All');
    setSearchQuery('');
    refreshLocalLeads();
    setCurrentNav('leads');
    setActionNotification({ type: 'success', message });
  };

  const handleLeadAdded = (newLead: LeadItem) => {
    refreshLocalLeads();
    setActionNotification({
      type: 'success',
      message: `Lead "${newLead.name}" added successfully.`,
    });
  };

  const handleConfirmDeleteLead = async (lead: LeadItem) => {
    const res = await deleteLead(lead.id, lead.clientId, currentConfig.formEndpoint);
    if (!res.success) {
      setActionNotification({
        type: 'error',
        message: res.message || 'Permission denied: could not delete lead.',
      });
      return;
    }

    refreshLocalLeads();
    if (selectedLead?.id === lead.id) {
      setSelectedLead(null);
    }
    setActionNotification({
      type: 'success',
      message: res.message || `Lead "${lead.name}" deleted.`,
    });
  };

  useEffect(() => {
    if (selectedLead?.followUpDate) {
      try {
        const d = new Date(selectedLead.followUpDate);
        if (!isNaN(d.getTime())) {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const hours = String(d.getHours()).padStart(2, '0');
          const mins = String(d.getMinutes()).padStart(2, '0');
          setFollowUpDateInput(`${year}-${month}-${day}`);
          setFollowUpTimeInput(`${hours}:${mins}`);
        } else {
          setFollowUpDateInput(selectedLead.followUpDate.slice(0, 10));
          setFollowUpTimeInput('09:00');
        }
      } catch {
        setFollowUpDateInput('');
        setFollowUpTimeInput('09:00');
      }
    } else {
      setFollowUpDateInput('');
      setFollowUpTimeInput('09:00');
    }
  }, [selectedLead?.id, selectedLead?.followUpDate]);

  const runConnectionTest = async () => {
    if (!endpoint || !endpoint.startsWith('http')) {
      setConnStatus('unconfigured');
      setConnMsg('Google Apps Script URL is not configured.');
      return;
    }
    setIsTestingConn(true);
    setConnStatus('testing');
    try {
      const result = await testGoogleSheetConnection(endpoint);
      if (result.success) {
        setConnStatus('connected');
        setConnMsg(result.message);
      } else {
        setConnStatus('failed');
        setConnMsg(result.message);
      }
    } catch (err: any) {
      setConnStatus('failed');
      setConnMsg(err?.message || 'Connection test failed');
    } finally {
      setIsTestingConn(false);
    }
  };

  const [syncSummary, setSyncSummary] = useState<SheetSyncSummary | null>(null);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(false);

  const handleSyncRemoteLeads = async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    setIsSyncing(true);
    try {
      const summary = await syncGoogleSheetToCrm(endpoint, activeTenantScope);
      setSyncSummary(summary);
      setLastSyncTime(summary.lastSyncTime);
      refreshLocalLeads();

      if (summary.success) {
        if (!silent || summary.newLeadsImported > 0 || summary.existingLeadsUpdated > 0) {
          setActionNotification({
            type: 'success',
            message: summary.message,
          });
        }
      } else if (!silent) {
        setActionNotification({
          type: 'error',
          message: summary.message || 'Could not sync with Google Sheets.',
          canRetrySync: true,
        });
      }
    } catch (err: any) {
      console.warn('Sync error:', err);
      const errorMsg = err?.message || 'Sync failed due to a network error.';
      setSyncSummary({
        success: false,
        newLeadsImported: 0,
        existingLeadsUpdated: 0,
        duplicatesSkipped: 0,
        rowsSkippedDueToValidationError: 0,
        lastSyncTime: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
        message: errorMsg,
      });
      if (!silent) {
        setActionNotification({
          type: 'error',
          message: errorMsg,
          canRetrySync: true,
        });
      }
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    if (!autoSyncEnabled || (!isCloudflareGatewayMode() && (!endpoint || !endpoint.startsWith('http')))) return;

    const interval = setInterval(() => {
      handleSyncRemoteLeads(true);
    }, 60000);

    return () => clearInterval(interval);
  }, [autoSyncEnabled, endpoint, activeTenantScope]);

  useEffect(() => {
    refreshLocalLeads();

    const unsubscribeFirestore = subscribeTenantLeads(activeTenantScope, (firestoreLeads) => {
      setLeads(deduplicateLeads(firestoreLeads));
      if (selectedLead) {
        const updated = firestoreLeads.find((l) => l.id === selectedLead.id);
        if (updated) setSelectedLead(updated);
      }
    });

    if (endpoint && endpoint.startsWith('http')) {
      runConnectionTest();
      handleSyncRemoteLeads(true);
    } else if (isCloudflareGatewayMode()) {
      handleSyncRemoteLeads(true);
    } else {
      setConnStatus('unconfigured');
      setConnMsg('Google Apps Script URL is not configured.');
    }

    const handleUpdateEvent = () => refreshLocalLeads();
    window.addEventListener('leadpilot_leads_updated', handleUpdateEvent);
    return () => {
      unsubscribeFirestore();
      window.removeEventListener('leadpilot_leads_updated', handleUpdateEvent);
    };
  }, [endpoint, selectedClientId, activeTenantScope]);

  const [selectedCountryCode, setSelectedCountryCode] = useState<string>(() =>
    detectDefaultCountryCode(currentConfig)
  );

  useEffect(() => {
    setSelectedCountryCode(detectDefaultCountryCode(currentConfig));
  }, [currentConfig]);

  const [isEditingPhone, setIsEditingPhone] = useState(false);
  const [editedPhoneInput, setEditedPhoneInput] = useState('');
  const [customLeadWhatsAppMsg, setCustomLeadWhatsAppMsg] = useState<string>('');

  const getWhatsAppMessage = (lead: LeadItem, customTemplate?: string) => {
    const isTarot =
      (currentConfig.industry ?? '').toLowerCase().includes('tarot') ||
      (currentConfig.clientId ?? '').toLowerCase().includes('tarot') ||
      (currentConfig.businessName ?? '').toLowerCase().includes('tarot');

    const defaultTarotTemplate =
      'Hi {name}, thank you for reaching out to {businessName} regarding your Tarot Reading session ({service}). When would you like to schedule your guidance reading?';
    const defaultGeneralTemplate =
      'Hi {name}, this is {businessName}. We received your request for {service}. How can we help you?';

    const template =
      customTemplate ||
      currentConfig.whatsAppMessageTemplate ||
      (isTarot ? defaultTarotTemplate : defaultGeneralTemplate);

    return template
      .replace(/{name}/g, lead.name || 'there')
      .replace(/{businessName}/g, currentConfig.businessName || lead.businessName || 'our team')
      .replace(/{service}/g, lead.service || (isTarot ? 'Personal Tarot Reading' : 'Service'))
      .replace(/{phone}/g, lead.phone || '');
  };

  useEffect(() => {
    if (selectedLead) {
      setCustomLeadWhatsAppMsg(getWhatsAppMessage(selectedLead));
    }
  }, [selectedLead, currentConfig]);

  const getRawPhone = (phoneStr: string) => {
    return formatPhoneForWhatsApp(phoneStr, selectedCountryCode);
  };

  const handleSaveEditedPhone = async () => {
    if (!selectedLead || !editedPhoneInput.trim()) return;
    const formatted = normalizeImportedPhone(editedPhoneInput.trim(), selectedCountryCode);
    setSyncingAction(true);
    try {
      const res = await updateLeadPhone(
        selectedLead.id,
        formatted,
        selectedLead.clientId || activeTenantScope,
        endpoint
      );
      if (!res.success) {
        setActionNotification({ type: 'error', message: res.message || 'Failed to save phone number.' });
        return;
      }
      if (res.lead) setSelectedLead(res.lead);
      refreshLocalLeads();
      setIsEditingPhone(false);
      setActionNotification({
        type: 'success',
        message: res.sheetSynced
          ? `Phone updated to ${formatted} and synced to Google Sheets.`
          : `Phone updated to ${formatted}.`,
      });
    } catch (err: any) {
      setActionNotification({ type: 'error', message: err?.message || 'Error updating phone number.' });
    } finally {
      setSyncingAction(false);
    }
  };

  const currentClientLeads =
    selectedClientId === 'all'
      ? leads
      : leads.filter((l) => (l.clientId || '').toLowerCase() === selectedClientId.toLowerCase());

  const filteredLeads = currentClientLeads.filter((lead) => {
    if (activeTab !== 'All' && lead.status !== activeTab) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        lead.name.toLowerCase().includes(q) ||
        lead.phone.toLowerCase().includes(q) ||
        lead.service.toLowerCase().includes(q) ||
        lead.details.toLowerCase().includes(q) ||
        lead.id.toLowerCase().includes(q) ||
        (lead.email && lead.email.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const todayStr = getTodayLocalDateStr();
  const totalLeadsCount = currentClientLeads.length;
  const newLeadsCount = currentClientLeads.filter((l) => l.status === 'New').length;

  const overdueFollowUps = currentClientLeads.filter((l) => {
    if (!l.followUpDate || l.status === 'Won' || l.status === 'Lost') return false;
    const fDateStr = getFollowUpDateStr(l.followUpDate);
    return !!(fDateStr && fDateStr < todayStr);
  });

  const todayFollowUps = currentClientLeads.filter((l) => {
    if (!l.followUpDate || l.status === 'Won' || l.status === 'Lost') return false;
    const fDateStr = getFollowUpDateStr(l.followUpDate);
    return fDateStr === todayStr;
  });

  const upcomingFollowUps = currentClientLeads
    .filter((l) => {
      if (!l.followUpDate || l.status === 'Won' || l.status === 'Lost') return false;
      const fDateStr = getFollowUpDateStr(l.followUpDate);
      return !!(fDateStr && fDateStr > todayStr);
    })
    .sort((a, b) => (a.followUpDate || '').localeCompare(b.followUpDate || ''));

  const followUpsDueCount = overdueFollowUps.length + todayFollowUps.length;

  useEffect(() => {
    onFollowUpsDueCountChange?.(followUpsDueCount);
  }, [followUpsDueCount, onFollowUpsDueCountChange]);

  const handleActionCall = async (lead: LeadItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const raw = getRawPhone(lead.phone);
    if (!raw) {
      setActionNotification({ type: 'error', message: 'No valid phone number found for this lead.' });
      return;
    }
    window.location.href = `tel:+${raw}`;

    setSyncingAction(true);
    setActionNotification(null);
    try {
      const res = await logLeadContact(lead.id, 'Call', undefined, lead.clientId || activeTenantScope, endpoint);
      if (res.success) {
        refreshLocalLeads();
        setActionNotification({
          type: 'success',
          message: res.sheetSynced
            ? `Call logged (+${raw}) and synced to Google Sheets.`
            : `Call logged (+${raw}).`,
        });
      } else {
        setActionNotification({ type: 'warning', message: `Call initiated (+${raw}). ${res.message}` });
      }
    } catch {
      setActionNotification({ type: 'warning', message: `Call initiated (+${raw}). Saved locally.` });
    } finally {
      setSyncingAction(false);
    }
  };

  const handleActionWhatsApp = async (lead: LeadItem, e?: React.MouseEvent, overrideMsg?: string) => {
    if (e) e.stopPropagation();
    const raw = getRawPhone(lead.phone);
    if (!raw) {
      setActionNotification({ type: 'error', message: 'No valid phone number found for this lead.' });
      return;
    }
    const msg =
      overrideMsg ||
      (selectedLead?.id === lead.id && customLeadWhatsAppMsg
        ? customLeadWhatsAppMsg
        : getWhatsAppMessage(lead));
    const waUrl = `https://wa.me/${raw}?text=${encodeURIComponent(msg)}`;

    try {
      window.open(waUrl, '_blank', 'noopener,noreferrer');
    } catch {
      window.location.href = waUrl;
    }

    setSyncingAction(true);
    try {
      const res = await logLeadContact(lead.id, 'WhatsApp', undefined, lead.clientId || activeTenantScope, endpoint);
      if (res.success) {
        refreshLocalLeads();
        setActionNotification({
          type: 'success',
          message: res.sheetSynced
            ? `WhatsApp opened (+${raw}) and synced to Google Sheets.`
            : `WhatsApp opened (+${raw}) and logged.`,
        });
      } else {
        setActionNotification({ type: 'warning', message: `WhatsApp opened (+${raw}). ${res.message}` });
      }
    } catch {
      setActionNotification({ type: 'warning', message: `WhatsApp opened (+${raw}). Saved locally.` });
    } finally {
      setSyncingAction(false);
    }
  };

  const handleActionSms = async (lead: LeadItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const raw = getRawPhone(lead.phone);
    if (!raw) {
      setActionNotification({ type: 'error', message: 'No valid phone number found for this lead.' });
      return;
    }
    const msg = `Hi ${lead.name}, this is ${lead.businessName}. We received your request for ${lead.service}. We’ll be in touch shortly.`;

    window.location.href = `sms:+${raw}?body=${encodeURIComponent(msg)}`;

    setSyncingAction(true);
    setActionNotification(null);
    try {
      const res = await logLeadContact(lead.id, 'SMS', undefined, lead.clientId || activeTenantScope, endpoint);
      if (res.success) {
        refreshLocalLeads();
        setActionNotification({
          type: 'success',
          message: res.sheetSynced ? `SMS logged (+${raw}) and synced.` : `SMS logged (+${raw}).`,
        });
      } else {
        setActionNotification({ type: 'warning', message: `SMS opened (+${raw}). ${res.message}` });
      }
    } catch {
      setActionNotification({ type: 'warning', message: `SMS opened (+${raw}). Saved locally.` });
    } finally {
      setSyncingAction(false);
    }
  };

  const handleActionEmail = async (lead: LeadItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!lead.email) return;
    const subject = `Regarding your service request - ${lead.businessName}`;
    const body = `Hi ${lead.name},\n\nThank you for reaching out to ${lead.businessName} regarding ${lead.service}. We received your request and would like to discuss how we can assist you.\n\nBest regards,\n${lead.businessName}`;
    setSyncingAction(true);
    setActionNotification(null);
    try {
      const res = await logLeadContact(lead.id, 'Email', undefined, lead.clientId || activeTenantScope, endpoint);
      if (!res.success) {
        setActionNotification({ type: 'error', message: `Could not log email contact: ${res.message}` });
        return;
      }
      refreshLocalLeads();
      setActionNotification({
        type: 'success',
        message: res.sheetSynced ? 'Email logged and synced to Google Sheets.' : 'Email contact logged.',
      });
      window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: `Error logging email contact: ${err?.message || 'Unknown error'}`,
      });
    } finally {
      setSyncingAction(false);
    }
  };

  const handleStatusChange = async (leadId: string, newStatus: LeadStatus) => {
    setSyncingAction(true);
    setActionNotification(null);
    try {
      const res = await updateLeadStatus(
        leadId,
        newStatus,
        selectedLead?.clientId || activeTenantScope,
        endpoint
      );
      if (!res.success) {
        setActionNotification({ type: 'error', message: `Failed to update status: ${res.message}` });
        return;
      }
      refreshLocalLeads();
      setActionNotification({
        type: 'success',
        message: res.sheetSynced
          ? `Status updated to "${newStatus}" and synced.`
          : `Status updated to "${newStatus}".`,
      });
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: `Error updating status: ${err?.message || 'Unknown error'}`,
      });
    } finally {
      setSyncingAction(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !newNoteText.trim()) return;
    setSyncingAction(true);
    setActionNotification(null);
    try {
      const res = await addLeadNote(
        selectedLead.id,
        newNoteText,
        'Agent',
        selectedLead.clientId || activeTenantScope,
        endpoint
      );
      if (!res.success) {
        setActionNotification({ type: 'error', message: `Failed to save note: ${res.message}` });
        return;
      }
      setNewNoteText('');
      refreshLocalLeads();
      setActionNotification({
        type: 'success',
        message: res.sheetSynced ? 'Note saved and synced.' : 'Note saved.',
      });
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: `Error adding note: ${err?.message || 'Unknown error'}`,
      });
    } finally {
      setSyncingAction(false);
    }
  };

  const handleSetFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead || !followUpDateInput) return;
    const timePart = followUpTimeInput || '09:00';
    const combinedIso = new Date(`${followUpDateInput}T${timePart}:00`).toISOString();
    setSyncingAction(true);
    setActionNotification(null);
    try {
      const res = await scheduleLeadFollowUp(
        selectedLead.id,
        combinedIso,
        selectedLead.clientId || activeTenantScope,
        endpoint
      );
      if (!res.success) {
        setActionNotification({ type: 'error', message: `Failed to schedule follow-up: ${res.message}` });
        return;
      }
      refreshLocalLeads();
      setActionNotification({
        type: 'success',
        message: res.sheetSynced ? 'Follow-up scheduled and synced.' : 'Follow-up scheduled.',
      });
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: `Error scheduling follow-up: ${err?.message || 'Unknown error'}`,
      });
    } finally {
      setSyncingAction(false);
    }
  };

  const handleClearFollowUp = async () => {
    if (!selectedLead) return;
    setSyncingAction(true);
    setActionNotification(null);
    try {
      const res = await scheduleLeadFollowUp(
        selectedLead.id,
        '',
        selectedLead.clientId || activeTenantScope,
        endpoint
      );
      if (!res.success) {
        setActionNotification({ type: 'error', message: `Failed to clear follow-up: ${res.message}` });
        return;
      }
      setFollowUpDateInput('');
      refreshLocalLeads();
      setActionNotification({
        type: 'success',
        message: res.sheetSynced ? 'Follow-up cleared and synced.' : 'Follow-up cleared.',
      });
    } catch (err: any) {
      setActionNotification({
        type: 'error',
        message: `Error clearing follow-up: ${err?.message || 'Unknown error'}`,
      });
    } finally {
      setSyncingAction(false);
    }
  };

  const handlePresetToday5pm = () => {
    setFollowUpDateInput(getTodayLocalDateStr());
    setFollowUpTimeInput('17:00');
  };

  const handlePresetTomorrow9am = () => {
    setFollowUpDateInput(getTomorrowLocalDateStr());
    setFollowUpTimeInput('09:00');
  };

  const handlePresetIn2Days10am = () => {
    setFollowUpDateInput(getInNDaysLocalDateStr(2));
    setFollowUpTimeInput('10:00');
  };

  const clientIdsList = Array.from(new Set(leads.map((l) => l.clientId)));
  if (currentConfig.clientId && !clientIdsList.includes(currentConfig.clientId)) {
    clientIdsList.push(currentConfig.clientId);
  }

  const formatFollowUpInline = (lead: LeadItem) => {
    if (!lead.followUpDate || lead.status === 'Won' || lead.status === 'Lost') {
      return <span className="text-slate-500">Not scheduled</span>;
    }
    const fDateStr = getFollowUpDateStr(lead.followUpDate);
    const displayTime = formatFollowUpDisplay(lead.followUpDate);

    if (fDateStr && fDateStr < todayStr) {
      return (
        <span className="text-rose-400 font-medium inline-flex items-center gap-1 tabular-nums">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Overdue · {displayTime}</span>
        </span>
      );
    }
    if (fDateStr && fDateStr === todayStr) {
      return (
        <span className="text-amber-300 font-medium inline-flex items-center gap-1 tabular-nums">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Today · {displayTime}</span>
        </span>
      );
    }
    return (
      <span className="text-slate-300 inline-flex items-center gap-1 tabular-nums">
        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span>{displayTime}</span>
      </span>
    );
  };

  const isSheetConfigured = isCloudflareGatewayMode() || (endpoint && endpoint.startsWith('http'));
  const hasSyncError = Boolean(syncSummary && !syncSummary.success);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-950 text-slate-100 pb-24 md:pb-8 overflow-x-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-5 sm:pt-6 space-y-5">
        {/* Embedded navigation fallback when mounted inside Dev Suite without parent header nav */}
        {!onNavChange && (
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div className="min-w-0">
              <div className="text-base font-bold text-white truncate">{currentConfig.businessName}</div>
              <div className="text-xs text-slate-400 font-mono truncate">{activeTenantScope}</div>
            </div>
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
              {(
                [
                  { id: 'leads', label: 'Leads' },
                  {
                    id: 'followups',
                    label: followUpsDueCount > 0 ? `Follow-ups (${followUpsDueCount})` : 'Follow-ups',
                  },
                  { id: 'more', label: 'More' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCurrentNav(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                    currentNav === tab.id
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Compact Syncing / Action Notification (dismissible, never permanently occupies screen) */}
        {syncingAction && (
          <div className="bg-slate-900 border border-slate-700 px-3.5 py-2.5 rounded-xl text-xs text-slate-200 flex items-center gap-2">
            <RotateCw className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
            <span>Saving update...</span>
          </div>
        )}
        {actionNotification && !syncingAction && (
          <div
            className={`px-3.5 py-2.5 rounded-xl text-xs flex flex-wrap items-center justify-between gap-2 border ${
              actionNotification.type === 'success'
                ? 'bg-emerald-950/50 border-emerald-500/40 text-emerald-200'
                : actionNotification.type === 'warning'
                ? 'bg-amber-950/50 border-amber-500/40 text-amber-200'
                : 'bg-rose-950/50 border-rose-500/40 text-rose-200'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {actionNotification.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              )}
              <span className="truncate sm:whitespace-normal">{actionNotification.message}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actionNotification.canRetrySync && (
                <button
                  type="button"
                  onClick={() => handleSyncRemoteLeads(false)}
                  disabled={isSyncing}
                  className="px-2.5 py-1 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg text-xs cursor-pointer"
                >
                  Retry Sync
                </button>
              )}
              <button
                type="button"
                onClick={() => setActionNotification(null)}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
                aria-label="Dismiss notification"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* VIEW 1: MAIN LEADS PAGE */}
        {currentNav === 'leads' && (
          <div className="space-y-5">
            {/* Compact Workspace Header: Business Name + Tenant Info + Small Sync Indicator + 1 Primary Add Lead CTA */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight truncate">
                    {currentConfig.businessName || 'Leads'}
                  </h1>
                  <span className="text-xs font-mono text-slate-400 truncate">
                    {activeTenantScope}
                  </span>
                </div>

                {/* Small, Honest Google Sheets Sync Status Indicator */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {isSyncing ? (
                    <span className="text-slate-300 inline-flex items-center gap-1.5">
                      <RotateCw className="w-3 h-3 text-emerald-400 animate-spin" />
                      <span>Syncing Google Sheets...</span>
                    </span>
                  ) : hasSyncError ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="text-rose-400 inline-flex items-center gap-1.5 font-medium"
                        title={syncSummary?.message}
                      >
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Sheet sync issue</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleSyncRemoteLeads(false)}
                        className="text-xs font-semibold text-white bg-rose-600/90 hover:bg-rose-500 px-2.5 py-0.5 rounded-md transition-colors cursor-pointer"
                      >
                        Retry Sync
                      </button>
                      <button
                        type="button"
                        onClick={() => setCurrentNav('more')}
                        className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                      >
                        Details
                      </button>
                    </div>
                  ) : !isSheetConfigured ? (
                    <button
                      type="button"
                      onClick={() => setCurrentNav('more')}
                      className="text-slate-400 hover:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Sheets not configured</span>
                    </button>
                  ) : (
                    <span className="text-slate-400 inline-flex items-center gap-1.5 tabular-nums">
                      <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>
                        {lastSyncTime ? `Sheets synced · ${lastSyncTime}` : 'Sheets connected'}
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Single Clear Primary Add Lead Button */}
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddLeadModalOpen(true)}
                  className="w-full sm:w-auto min-h-[44px] sm:min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs sm:text-sm rounded-xl inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4 shrink-0" />
                  <span>Add {currentConfig.crmTerminology?.leadLabel || 'Lead'}</span>
                </button>
              </div>
            </div>

            {/* 3 Essential KPI Summary Cards ONLY */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              <button
                type="button"
                onClick={() => setActiveTab('All')}
                className="bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl p-3.5 sm:p-4 text-left transition-colors cursor-pointer"
              >
                <div className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                  Total leads
                </div>
                <div className="text-xl sm:text-2xl font-bold text-white mt-1 tabular-nums">
                  {totalLeadsCount}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('New')}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/40 rounded-xl p-3.5 sm:p-4 text-left transition-colors cursor-pointer"
              >
                <div className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                  New leads
                </div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-400 mt-1 tabular-nums">
                  {newLeadsCount}
                </div>
              </button>

              <button
                type="button"
                onClick={() => setCurrentNav('followups')}
                className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-xl p-3.5 sm:p-4 text-left transition-colors cursor-pointer"
              >
                <div className="text-[11px] sm:text-xs font-medium text-slate-400 truncate">
                  Follow-ups due
                </div>
                <div
                  className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${
                    overdueFollowUps.length > 0
                      ? 'text-rose-400'
                      : followUpsDueCount > 0
                      ? 'text-amber-300'
                      : 'text-white'
                  }`}
                >
                  {followUpsDueCount}
                </div>
              </button>
            </div>

            {/* Search + Simple Status Filters */}
            <div className="space-y-3">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                {/* Search Input */}
                <div className="relative w-full lg:max-w-sm">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name, phone, or service..."
                    className="w-full min-h-[44px] sm:min-h-[40px] bg-slate-900 border border-slate-800 focus:border-emerald-500 rounded-xl pl-10 pr-9 py-2 text-xs sm:text-sm text-white placeholder-slate-500 outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white cursor-pointer"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Simple Lead Status Filter Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 lg:pb-0">
                  {(['All', 'New', 'Contacted', 'Follow-up', 'Qualified', 'Won', 'Lost'] as const).map(
                    (tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          activeTab === tab
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                        }`}
                      >
                        {tab}
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Lead List: Empty State, Mobile Cards, and Desktop Table */}
            {filteredLeads.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center space-y-3">
                <div className="w-11 h-11 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                  <User className="w-5 h-5" />
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-white">
                  {currentClientLeads.length > 0
                    ? 'No leads match this filter'
                    : 'No leads yet'}
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  {currentClientLeads.length > 0
                    ? `You have ${currentClientLeads.length} lead(s) in your CRM. Clear filters to view all of them.`
                    : 'Add your first enquiry manually or wait for enquiries from your website.'}
                </p>
                <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                  {currentClientLeads.length > 0 && (activeTab !== 'All' || searchQuery) ? (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('All');
                        setSearchQuery('');
                      }}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Show All {currentClientLeads.length} Leads
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setIsAddLeadModalOpen(true)}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Add First Lead
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Mobile Card List (Full-width stacked cards, zero horizontal scroll) */}
                <div className="md:hidden space-y-3">
                  {filteredLeads.map((lead, idx) => {
                    const formattedDate = new Date(lead.timestamp).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    });
                    return (
                      <div
                        key={`${lead.id}-mobile-${idx}`}
                        onClick={() => {
                          setSelectedLead(lead);
                          setEditedPhoneInput(lead.phone);
                          setIsEditingPhone(false);
                        }}
                        className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 cursor-pointer active:bg-slate-800/70 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-white truncate">
                              {lead.name}
                            </h3>
                            <p className="text-xs text-slate-300 mt-0.5 truncate">
                              {lead.service || 'General enquiry'}
                            </p>
                          </div>
                          <span
                            className={`text-xs font-semibold shrink-0 ${
                              STATUS_DOT_COLOR[lead.status] || 'text-slate-300'
                            }`}
                          >
                            {lead.status}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400 tabular-nums">
                          <span className="font-mono text-slate-200">
                            {formatDisplayPhone(lead.phone, selectedCountryCode)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{formattedDate}</span>
                          {lead.address && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="truncate max-w-[160px]">{lead.address}</span>
                            </>
                          )}
                        </div>

                        {lead.followUpDate && lead.status !== 'Won' && lead.status !== 'Lost' && (
                          <div className="text-xs pt-0.5">{formatFollowUpInline(lead)}</div>
                        )}

                        <div
                          className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={(e) => handleActionCall(lead, e)}
                            className="min-h-[44px] bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Phone className="w-3.5 h-3.5 text-sky-400" />
                            <span>Call</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleActionWhatsApp(lead, e)}
                            className="min-h-[44px] bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedLead(lead);
                              setEditedPhoneInput(lead.phone);
                              setIsEditingPhone(false);
                            }}
                            className="min-h-[44px] bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <span>Details</span>
                            <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Table View (Clean, balanced spacing, zero pill sandwiches) */}
                <div className="hidden md:block bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300 border-collapse">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold bg-slate-950/60">
                          <th className="py-3.5 px-4">Customer</th>
                          <th className="py-3.5 px-4">Contact</th>
                          <th className="py-3.5 px-4">Service</th>
                          <th className="py-3.5 px-4">Status</th>
                          <th className="py-3.5 px-4">Follow-up</th>
                          <th className="py-3.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/70">
                        {filteredLeads.map((lead, idx) => {
                          const formattedDate = new Date(lead.timestamp).toLocaleDateString(
                            undefined,
                            {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            }
                          );
                          return (
                            <tr
                              key={`${lead.id}-${idx}`}
                              onClick={() => {
                                setSelectedLead(lead);
                                setEditedPhoneInput(lead.phone);
                                setIsEditingPhone(false);
                              }}
                              className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                            >
                              <td className="py-3.5 px-4">
                                <div className="font-semibold text-white text-sm">{lead.name}</div>
                                <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                                  <span className="font-mono">{lead.id}</span>
                                  <span aria-hidden="true"> · </span>
                                  <span>{formattedDate}</span>
                                </div>
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <div className="font-mono font-medium text-slate-200 tabular-nums">
                                  {formatDisplayPhone(lead.phone, selectedCountryCode)}
                                </div>
                                {lead.email && (
                                  <div className="text-xs text-slate-400 truncate max-w-[200px] mt-0.5">
                                    {lead.email}
                                  </div>
                                )}
                              </td>

                              <td className="py-3.5 px-4 max-w-[220px]">
                                <div className="font-medium text-slate-200 truncate">
                                  {lead.service || 'General enquiry'}
                                </div>
                                <div className="text-xs text-slate-400 truncate mt-0.5">
                                  {lead.address || lead.leadSource || 'Direct enquiry'}
                                </div>
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span
                                  className={`font-semibold ${
                                    STATUS_DOT_COLOR[lead.status] || 'text-slate-300'
                                  }`}
                                >
                                  {lead.status}
                                </span>
                              </td>

                              <td className="py-3.5 px-4 whitespace-nowrap">
                                {formatFollowUpInline(lead)}
                              </td>

                              <td
                                className="py-3.5 px-4 text-right whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => handleActionCall(lead, e)}
                                    title="Call"
                                    className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <Phone className="w-3.5 h-3.5 text-sky-400" />
                                    <span>Call</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => handleActionWhatsApp(lead, e)}
                                    title="WhatsApp"
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    <span>WhatsApp</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setSelectedLead(lead);
                                      setEditedPhoneInput(lead.phone);
                                      setIsEditingPhone(false);
                                    }}
                                    className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded-lg text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <span>Open</span>
                                  </button>
                                  {currentUserRole !== 'client_staff' && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setLeadToDelete(lead);
                                      }}
                                      title={`Delete ${lead.name}`}
                                      aria-label={`Delete ${lead.name}`}
                                      className="p-1.5 bg-slate-950 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-800 hover:border-rose-500/40 transition-colors cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
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
              </>
            )}
          </div>
        )}

        {/* VIEW 2: FOLLOW-UPS */}
        {currentNav === 'followups' && (
          <CrmFollowUpsView
            overdueFollowUps={overdueFollowUps}
            todayFollowUps={todayFollowUps}
            upcomingFollowUps={upcomingFollowUps}
            selectedCountryCode={selectedCountryCode}
            formatFollowUpDisplay={formatFollowUpDisplay}
            onSelectLead={(lead) => {
              setSelectedLead(lead);
              setEditedPhoneInput(lead.phone);
              setIsEditingPhone(false);
            }}
            onCall={handleActionCall}
            onWhatsApp={handleActionWhatsApp}
            onSms={handleActionSms}
            onEmail={handleActionEmail}
            onBackToLeads={() => setCurrentNav('leads')}
          />
        )}

        {/* VIEW 3: MORE / SETTINGS */}
        {currentNav === 'more' && (
          <CrmMoreSettingsView
            currentConfig={currentConfig}
            appMode={appMode}
            currentUserRole={currentUserRole}
            currentUserUid={currentUserUid}
            activeTenantScope={activeTenantScope}
            leads={currentClientLeads}
            endpoint={endpoint}
            isGatewayMode={isCloudflareGatewayMode()}
            isSyncing={isSyncing}
            lastSyncTime={lastSyncTime}
            syncSummary={syncSummary}
            autoSyncEnabled={autoSyncEnabled}
            connStatus={connStatus}
            connMsg={connMsg}
            isTestingConn={isTestingConn}
            selectedCountryCode={selectedCountryCode}
            clientIdsList={clientIdsList}
            selectedClientId={selectedClientId}
            onChangeClientId={setSelectedClientId}
            onChangeCountryCode={setSelectedCountryCode}
            onToggleAutoSync={() => setAutoSyncEnabled((prev) => !prev)}
            onSyncNow={() => handleSyncRemoteLeads(false)}
            onTestConnection={runConnectionTest}
            onOpenImportModal={() => setIsImportModalOpen(true)}
            onOpenTestOnboarding={
              appMode === 'development' ? () => setIsTestOnboardingModalOpen(true) : undefined
            }
            onExportMessage={(type, message) => setActionNotification({ type, message })}
          />
        )}
      </div>

      {/* LEAD DETAIL MODAL */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-white truncate">
                    {selectedLead.name}
                  </h2>
                  <span
                    className={`text-xs font-semibold ${
                      STATUS_DOT_COLOR[selectedLead.status] || 'text-slate-300'
                    }`}
                  >
                    {selectedLead.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono tabular-nums">
                  {selectedLead.id} · {new Date(selectedLead.timestamp).toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {currentUserRole !== 'client_staff' && (
                  <button
                    type="button"
                    onClick={() => setLeadToDelete(selectedLead)}
                    className="min-h-[40px] sm:min-h-[34px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 px-3 py-1.5 rounded-lg font-semibold text-xs inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLead(null)}
                  className="min-h-[40px] sm:min-h-[34px] bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg font-semibold text-xs border border-slate-700 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Direct Communication Actions */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => handleActionCall(selectedLead)}
                className="min-h-[52px] bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-1 border border-slate-700 transition-colors cursor-pointer"
              >
                <Phone className="w-4 h-4 text-sky-400" />
                <span>Call</span>
              </button>

              <button
                type="button"
                onClick={() => handleActionWhatsApp(selectedLead, undefined, customLeadWhatsAppMsg)}
                className="min-h-[52px] bg-emerald-600 hover:bg-emerald-500 text-white p-3 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleActionSms(selectedLead)}
                className="min-h-[52px] bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-1 border border-slate-700 transition-colors cursor-pointer"
              >
                <Send className="w-4 h-4 text-slate-300" />
                <span>SMS</span>
              </button>

              {selectedLead.email ? (
                <button
                  type="button"
                  onClick={() => handleActionEmail(selectedLead)}
                  className="min-h-[52px] bg-slate-800 hover:bg-slate-700 text-white p-3 rounded-xl font-semibold text-xs flex flex-col items-center justify-center gap-1 border border-slate-700 transition-colors cursor-pointer"
                >
                  <Mail className="w-4 h-4 text-amber-400" />
                  <span>Email</span>
                </button>
              ) : (
                <div className="min-h-[52px] bg-slate-950 border border-slate-800 text-slate-500 p-3 rounded-xl text-xs flex flex-col items-center justify-center gap-1">
                  <Mail className="w-4 h-4" />
                  <span>No email</span>
                </div>
              )}
            </div>

            {/* Phone & WhatsApp Message */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-slate-400">Phone:</span>
                  <strong className="text-white font-mono text-sm tabular-nums">
                    {formatDisplayPhone(selectedLead.phone, selectedCountryCode)}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingPhone(!isEditingPhone);
                    setEditedPhoneInput(selectedLead.phone);
                  }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  <span>{isEditingPhone ? 'Cancel' : 'Edit number'}</span>
                </button>
              </div>

              {isEditingPhone ? (
                <div className="pt-2 border-t border-slate-800 flex items-center gap-2">
                  <input
                    type="text"
                    value={editedPhoneInput}
                    onChange={(e) => setEditedPhoneInput(e.target.value)}
                    placeholder="Enter phone number..."
                    className="min-h-[40px] bg-slate-900 border border-slate-700 text-white text-xs px-3 py-1.5 rounded-lg flex-1 outline-none font-mono focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleSaveEditedPhone}
                    className="min-h-[40px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-medium text-slate-300 block">
                    WhatsApp message
                  </label>
                  <textarea
                    rows={3}
                    value={customLeadWhatsAppMsg}
                    onChange={(e) => setCustomLeadWhatsAppMsg(e.target.value)}
                    placeholder="Type WhatsApp message..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-white text-xs leading-relaxed focus:border-emerald-500 outline-none"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(customLeadWhatsAppMsg);
                        setActionNotification({ type: 'success', message: 'Message copied to clipboard.' });
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                    >
                      Copy text
                    </button>
                    <button
                      type="button"
                      onClick={() => handleActionWhatsApp(selectedLead, undefined, customLeadWhatsAppMsg)}
                      className="min-h-[40px] bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Send on WhatsApp</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Status Workflow */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Status</label>
              <div className="flex flex-wrap gap-1.5">
                {(['New', 'Contacted', 'Follow-up', 'Qualified', 'Won', 'Lost'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(selectedLead.id, st)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border cursor-pointer ${
                      selectedLead.status === st
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer & Service Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-400 block">Service Requested</span>
                <span className="text-white font-semibold mt-0.5 block">{selectedLead.service}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Address / Area</span>
                <span className="text-white font-semibold mt-0.5 block">
                  {selectedLead.address || 'Local area'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Lead Source</span>
                <span className="text-slate-200 mt-0.5 block">{selectedLead.leadSource}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Email</span>
                <span className="text-slate-200 mt-0.5 block break-all">
                  {selectedLead.email || 'Not provided'}
                </span>
              </div>
              <div className="sm:col-span-2 border-t border-slate-800 pt-2.5">
                <span className="text-slate-400 block mb-1">Enquiry Details</span>
                <p className="text-slate-200 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  {selectedLead.details}
                </p>
              </div>
            </div>

            {/* Follow-up Scheduler */}
            <form
              onSubmit={handleSetFollowUp}
              className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3"
            >
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-amber-300 inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>Schedule Follow-up</span>
                </label>
                {selectedLead.followUpDate && (
                  <button
                    type="button"
                    onClick={handleClearFollowUp}
                    className="text-xs text-slate-400 hover:text-rose-400 underline font-medium cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={followUpDateInput}
                    onChange={(e) => setFollowUpDateInput(e.target.value)}
                    className="w-full min-h-[40px] bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-lg outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Time</label>
                  <input
                    type="time"
                    value={followUpTimeInput}
                    onChange={(e) => setFollowUpTimeInput(e.target.value)}
                    className="w-full min-h-[40px] bg-slate-900 border border-slate-700 text-white text-xs p-2 rounded-lg outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={handlePresetToday5pm}
                  className="min-h-[34px] bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  Today 5 PM
                </button>
                <button
                  type="button"
                  onClick={handlePresetTomorrow9am}
                  className="min-h-[34px] bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  Tomorrow 9 AM
                </button>
                <button
                  type="button"
                  onClick={handlePresetIn2Days10am}
                  className="min-h-[34px] bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 text-xs font-medium px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  In 2 Days 10 AM
                </button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-800">
                <div className="text-xs text-slate-400 tabular-nums">
                  {selectedLead.followUpDate ? (
                    <span className="text-amber-300 font-medium inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Scheduled: {formatFollowUpDisplay(selectedLead.followUpDate)}</span>
                    </span>
                  ) : (
                    <span>No follow-up scheduled</span>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!followUpDateInput}
                  className="min-h-[40px] bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Save Follow-up
                </button>
              </div>
            </form>

            {/* Add Note */}
            <form onSubmit={handleAddNote} className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 block">Add Note</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <textarea
                  rows={2}
                  value={newNoteText}
                  onChange={(e) => setNewNoteText(e.target.value)}
                  placeholder="Write a note about your call or estimate..."
                  className="bg-slate-950 border border-slate-800 text-white text-xs p-2.5 rounded-xl flex-1 outline-none focus:border-emerald-500 resize-none"
                />
                <button
                  type="submit"
                  disabled={!newNoteText.trim()}
                  className="min-h-[44px] sm:min-h-0 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold text-xs px-4 py-2 rounded-xl cursor-pointer shrink-0"
                >
                  Add Note
                </button>
              </div>
            </form>

            {/* Activity History */}
            <div className="space-y-2.5 pt-2 border-t border-slate-800">
              <h3 className="text-xs font-semibold text-slate-300">
                Activity History ({selectedLead.notes.length})
              </h3>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedLead.notes.length === 0 ? (
                  <p className="text-xs text-slate-500">No notes recorded yet.</p>
                ) : (
                  selectedLead.notes.map((n, idx) => (
                    <div
                      key={`${n.id}-${idx}`}
                      className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-1"
                    >
                      <div className="flex justify-between text-[11px] text-slate-400 tabular-nums">
                        <span className="font-medium text-slate-300">{n.author || 'System'}</span>
                        <span>{new Date(n.createdAt).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-200">{n.text}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ManualLeadModal
        isOpen={isAddLeadModalOpen}
        onClose={() => setIsAddLeadModalOpen(false)}
        currentConfig={currentConfig}
        onLeadAdded={handleLeadAdded}
      />

      <DeleteLeadModal
        isOpen={Boolean(leadToDelete)}
        lead={leadToDelete}
        onClose={() => setLeadToDelete(null)}
        onConfirmDelete={handleConfirmDeleteLead}
      />

      <LeadImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentConfig={currentConfig}
        onImportSuccess={handleImportSuccess}
      />

      {appMode === 'development' && (
        <TestOnboardingModal
          isOpen={isTestOnboardingModalOpen}
          onClose={() => setIsTestOnboardingModalOpen(false)}
        />
      )}
    </div>
  );
};
