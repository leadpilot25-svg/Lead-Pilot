import { LeadItem, LeadStatus, ContactMethod, LeadNote, LeadContactLog } from '../types';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';

const STORAGE_KEY_PREFIX = 'leadpilot_leads_';

/**
 * Storage key helper strictly scoped by Client ID / Tenant ID
 */
export function getClientStorageKey(clientId?: string): string {
  if (!clientId || clientId === 'all' || clientId === 'master') {
    return 'leadpilot_leads_default';
  }
  return `${STORAGE_KEY_PREFIX}${clientId.trim().toLowerCase()}`;
}

/**
 * Deduplicate leads array to guarantee unique Lead IDs
 */
export function deduplicateLeads(leads: LeadItem[]): LeadItem[] {
  const seen = new Set<string>();
  const clean: LeadItem[] = [];

  for (const lead of leads) {
    if (!lead || !lead.id) continue;
    let uniqueId = lead.id.trim();

    if (seen.has(uniqueId)) {
      let counter = 1;
      while (seen.has(`${uniqueId}-${counter}`)) {
        counter++;
      }
      uniqueId = `${uniqueId}-${counter}`;
    }

    seen.add(uniqueId);
    clean.push({ ...lead, id: uniqueId });
  }

  return clean;
}

/**
 * Helper to strip undefined values so Cloud Firestore does not throw invalid-argument
 */
export function cleanForFirestore<T extends Record<string, any>>(obj: T): Partial<T> {
  const clean: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Initial sample demo leads for realistic local client demos
 */
export function getInitialDemoLeads(clientId?: string): LeadItem[] {
  const clean = (clientId || 'client-apex-hvac').trim().toLowerCase();
  const now = Date.now();

  if (clean.includes('hvac') || clean === 'demo-hvac' || clean === 'client-apex-hvac') {
    return [
      {
        id: 'LP-20261021-0001',
        timestamp: new Date(now - 35 * 60 * 1000).toISOString(),
        clientId: 'client-apex-hvac',
        businessName: 'Apex Heating & Cooling',
        name: 'Marcus Vance [Sample]',
        phone: '+1 (555) 247-4822',
        email: 'marcus.vance@example.com',
        service: 'Emergency AC Repair & Diagnostics',
        details: '[Sample Demo] AC blowing warm air on second floor. Outside fan not spinning. Upfront diagnostic requested.',
        address: '4412 Mockingbird Ln, Dallas, TX 75205',
        leadSource: 'Landing Page Enquiry (Website)',
        status: 'New',
        notes: [
          {
            id: 'note-1',
            text: 'Enquiry submitted via Apex HVAC landing page form.',
            createdAt: new Date(now - 35 * 60 * 1000).toISOString(),
            author: 'Website Form',
          },
        ],
        contactCount: 0,
      },
      {
        id: 'LP-20261021-0002',
        timestamp: new Date(now - 3 * 3600 * 1000).toISOString(),
        clientId: 'client-apex-hvac',
        businessName: 'Apex Heating & Cooling',
        name: 'Sarah Jenkins [Sample]',
        phone: '+1 (555) 389-7711',
        email: 'sarah.jenkins@example.com',
        service: 'Heat Pump & System Installation',
        details: '[Sample Demo] Interested in high-efficiency heat pump replacement for 2,400 sq ft home.',
        address: '1820 Park Blvd, Plano, TX 75074',
        leadSource: 'Google Business Profile / Local Search',
        status: 'Follow-up',
        followUpDate: '2026-10-24',
        notes: [
          {
            id: 'note-2',
            text: 'Estimate consultation scheduled for Thursday morning at 10:00 AM.',
            createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
            author: 'Latasha (Agent)',
          },
        ],
        contactCount: 1,
        lastContacted: new Date(now - 2 * 3600 * 1000).toISOString(),
        lastContactMethod: 'Call',
      },
      {
        id: 'LP-20261021-0003',
        timestamp: new Date(now - 22 * 3600 * 1000).toISOString(),
        clientId: 'client-apex-hvac',
        businessName: 'Apex Heating & Cooling',
        name: 'David Rodriguez [Sample]',
        phone: '+1 (555) 912-3344',
        email: 'david.rodriguez@example.com',
        service: 'Seasonal AC & Heating Tune-Up',
        details: '[Sample Demo] Annual preventative 24-point inspection and filter replacement.',
        address: '3105 MacArthur Blvd, Irving, TX 75062',
        leadSource: 'Phone Call (Direct Inbound)',
        status: 'Contacted',
        notes: [
          {
            id: 'note-3',
            text: 'Customer confirmed arrival window between 1:00 PM and 3:00 PM.',
            createdAt: new Date(now - 18 * 3600 * 1000).toISOString(),
            author: 'Latasha (Agent)',
          },
        ],
        contactCount: 1,
        lastContacted: new Date(now - 18 * 3600 * 1000).toISOString(),
        lastContactMethod: 'Call',
      },
    ];
  }

  if (clean.includes('roofing') || clean === 'roofing-client-01' || clean === 'demo-roofing') {
    return [
      {
        id: 'LP-20261026-0001',
        timestamp: new Date(now - 45 * 60 * 1000).toISOString(),
        clientId: 'roofing-client-01',
        businessName: 'Test Client',
        name: 'Robert Miller [Sample]',
        phone: '+1 (555) 789-2345',
        email: 'robert.miller@example.com',
        service: 'Emergency Roof Leak Repair',
        details: '[Sample Demo] Shingle damage on west ridge following storm. Fast leak inspection requested.',
        address: '1420 Ridgeview Dr, Dallas, TX 75201',
        leadSource: 'Google Business Profile / Local Search',
        status: 'New',
        notes: [
          {
            id: 'note-r1',
            text: 'Initial enquiry submitted through website contact form.',
            createdAt: new Date(now - 45 * 60 * 1000).toISOString(),
            author: 'Website Form',
          },
        ],
        contactCount: 0,
      },
    ];
  }

  if (clean.includes('tarot') || clean === 'demo-tarot' || clean === 'demo-tarot-kochi') {
    return [
      {
        id: 'LP-20261020-0001',
        timestamp: new Date(now - 2 * 3600 * 1000).toISOString(),
        clientId: 'demo-tarot-kochi',
        businessName: 'Tarot Coaching & Guidance',
        name: 'Ananya Nair [Sample]',
        phone: '+91 98460 11223',
        email: 'ananya.nair@example.com',
        service: 'Personal Tarot Reading',
        details: '[Sample Demo] Career path and personal transition guidance session.',
        address: 'Kochi, Kerala & Online',
        leadSource: 'Google Business Profile / Local Search',
        status: 'New',
        notes: [
          {
            id: 'note-t1',
            text: 'Initial enquiry submitted through website contact form.',
            createdAt: new Date(now - 2 * 3600 * 1000).toISOString(),
            author: 'Website Form',
          },
        ],
        contactCount: 0,
      },
    ];
  }

  return [];
}

/**
 * Get stored leads from local client cache
 */
export function getStoredLeads(clientId?: string): LeadItem[] {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return [];
  try {
    const scopedKey = getClientStorageKey(clientId);
    const raw = localStorage.getItem(scopedKey);
    if (raw === null) {
      // First-time visit: seed sample demo leads for this tenant
      const initialLeads = getInitialDemoLeads(clientId);
      if (initialLeads.length > 0) {
        localStorage.setItem(scopedKey, JSON.stringify(initialLeads));
        return initialLeads;
      }
      return [];
    }
    const parsed: LeadItem[] = JSON.parse(raw);
    const deduplicated = deduplicateLeads(parsed);

    if (clientId && clientId !== 'all') {
      return deduplicated.filter((l) => Boolean(l.clientId) && l.clientId.toLowerCase() === clientId.toLowerCase());
    }
    return deduplicated;
  } catch (err) {
    console.error('Error reading leads from storage:', err);
    return [];
  }
}

/**
 * Save leads array to local tenant cache
 */
export function saveAllLeads(leads: LeadItem[], clientId?: string): void {
  if (typeof window === 'undefined' && typeof localStorage === 'undefined') return;
  try {
    const cleanLeads = deduplicateLeads(leads);
    const scopedKey = getClientStorageKey(clientId);
    localStorage.setItem(scopedKey, JSON.stringify(cleanLeads));
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event('leadpilot_leads_updated'));
    }
  } catch (err) {
    console.error('Error saving leads to storage:', err);
  }
}

/**
 * Fetch leads directly from Firestore subcollection /tenants/{tenantId}/leads
 * Enforces backend tenant isolation via Firestore Security Rules.
 */
export async function fetchFirestoreLeads(tenantId: string): Promise<LeadItem[]> {
  if (!tenantId || tenantId === 'all') return getStoredLeads(tenantId);

  const cleanTenant = tenantId.trim().toLowerCase();
  const leadsPath = `tenants/${cleanTenant}/leads`;

  try {
    const leadsCol = collection(db, 'tenants', cleanTenant, 'leads');
    const q = query(leadsCol, orderBy('timestamp', 'desc'));
    const snapshot = await getDocs(q);

    const firestoreLeads: LeadItem[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as LeadItem;
      firestoreLeads.push({
        ...data,
        id: docSnap.id,
        clientId: cleanTenant,
        notes: Array.isArray(data.notes) ? data.notes : [],
        contactCount: typeof data.contactCount === 'number' ? data.contactCount : 0,
        contactLogs: Array.isArray(data.contactLogs) ? data.contactLogs : [],
      });
    });

    // Update local cache
    saveAllLeads(firestoreLeads, cleanTenant);
    return firestoreLeads;
  } catch (error) {
    console.warn(`Firestore read warning for ${leadsPath} (using cached leads):`, error);
    // If permission denied or network error, return existing local cache
    return getStoredLeads(cleanTenant);
  }
}

/**
 * Realtime subscription to tenant leads in Firestore
 */
export function subscribeTenantLeads(
  tenantId: string,
  onUpdate: (leads: LeadItem[]) => void,
  onError?: (err: any) => void
): () => void {
  if (!tenantId || tenantId === 'all') {
    onUpdate(getStoredLeads());
    return () => {};
  }

  const cleanTenant = tenantId.trim().toLowerCase();
  const leadsPath = `tenants/${cleanTenant}/leads`;
  const leadsCol = collection(db, 'tenants', cleanTenant, 'leads');
  const q = query(leadsCol, orderBy('timestamp', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const leads: LeadItem[] = [];
      snapshot.forEach((docSnap) => {
        const item = docSnap.data() as LeadItem;
        leads.push({
          ...item,
          id: docSnap.id,
          clientId: cleanTenant,
          notes: Array.isArray(item.notes) ? item.notes : [],
          contactCount: typeof item.contactCount === 'number' ? item.contactCount : 0,
          contactLogs: Array.isArray(item.contactLogs) ? item.contactLogs : [],
        });
      });
      saveAllLeads(leads, cleanTenant);
      onUpdate(leads);
    },
    (error) => {
      console.warn(`Firestore onSnapshot notice for ${leadsPath}:`, error);
      if (onError) onError(error);
      onUpdate(getStoredLeads(cleanTenant));
    }
  );
}

/**
 * Helper to generate a unique Lead ID (e.g., LP-20261022-0001-K9X2)
 */
export function generateLeadId(existingCount: number = 0): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const existingLeads = getStoredLeads();
  const randomEntropy = Math.random().toString(36).substring(2, 6).toUpperCase();

  let num = existingCount + 1;
  let candidate = `LP-${dateStr}-${String(num).padStart(4, '0')}-${randomEntropy}`;

  while (existingLeads.some((l) => l.id === candidate)) {
    num++;
    const nextEntropy = Math.random().toString(36).substring(2, 6).toUpperCase();
    candidate = `LP-${dateStr}-${String(num).padStart(4, '0')}-${nextEntropy}`;
  }

  return candidate;
}

/**
 * Save a new lead or update an existing lead with Firestore persistence
 */
export async function saveLead(
  input: Partial<LeadItem> & { name: string; phone: string; service: string },
  endpointUrl?: string
): Promise<{ success: boolean; message: string; lead: LeadItem }> {
  if (!input.clientId || !input.clientId.trim()) {
    return {
      success: false,
      message: 'Client ID is required to submit an enquiry.',
      lead: null as any,
    };
  }

  const targetTenant = input.clientId.trim().toLowerCase();
  if (!/^[a-zA-Z0-9_-]+$/.test(targetTenant)) {
    return {
      success: false,
      message: 'Invalid Client ID format for enquiry submission.',
      lead: null as any,
    };
  }

  const leads = getStoredLeads(targetTenant);

  let existingIndex = input.id ? leads.findIndex((l) => l.id === input.id) : -1;

  if (existingIndex === -1) {
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    existingIndex = leads.findIndex(
      (l) =>
        l.phone.replace(/\D/g, '') === input.phone.replace(/\D/g, '') &&
        l.service.toLowerCase() === input.service.toLowerCase() &&
        l.timestamp >= fiveMinsAgo
    );
  }

  const nowIso = new Date().toISOString();
  let targetLead: LeadItem;

  if (existingIndex !== -1) {
    const existing = leads[existingIndex];
    targetLead = {
      ...existing,
      name: input.name || existing.name,
      phone: input.phone || existing.phone,
      email: input.email || existing.email,
      service: input.service || existing.service,
      details: input.details ? `${existing.details} | Update: ${input.details}` : existing.details,
      address: input.address || existing.address,
      clientId: targetTenant,
      businessName: input.businessName || existing.businessName,
      leadSource: input.leadSource || existing.leadSource,
      pageUrl: input.pageUrl || existing.pageUrl,
    };
    leads[existingIndex] = targetLead;
  } else {
    const newLeadId = input.id || generateLeadId(leads.length);
    targetLead = {
      id: newLeadId,
      timestamp: input.timestamp || nowIso,
      clientId: targetTenant,
      businessName: input.businessName || 'Tarot Coaching & Guidance',
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email ? input.email.trim() : undefined,
      service: input.service.trim(),
      details: input.details || 'No additional details provided.',
      address: input.address || '',
      leadSource: input.leadSource || 'Landing Page Enquiry (Website)',
      pageUrl: input.pageUrl || '',
      status: (input.status as LeadStatus) || 'New',
      notes: input.notes || [],
      followUpDate: input.followUpDate,
      lastContacted: input.lastContacted,
      lastContactMethod: input.lastContactMethod,
      contactCount: input.contactCount || 0,
      contactLogs: input.contactLogs || [],
    };
    leads.unshift(targetLead);
  }

  // 1. Update local cache immediately
  saveAllLeads(leads, targetTenant);

  // 2. Persist to Firestore: /tenants/{tenantId}/leads/{leadId}
  let firestoreErrDetail: string | null = null;
  try {
    const leadDocRef = doc(db, 'tenants', targetTenant, 'leads', targetLead.id);
    
    // Decouple public landing submissions from CRM internal audit fields:
    // If submission is unauthenticated (anonymous public visitor), write ONLY the approved 13 public fields.
    // Internal CRM fields (notes, contactCount, contactLogs) are excluded from the public Firestore write
    // so rules strictly reject unauthorized fields while keeping Google Sheets sync completely intact.
    const firestorePayload = auth.currentUser
      ? cleanForFirestore(targetLead)
      : cleanForFirestore({
          id: targetLead.id,
          timestamp: targetLead.timestamp,
          clientId: targetLead.clientId,
          businessName: targetLead.businessName,
          name: targetLead.name,
          phone: targetLead.phone,
          email: targetLead.email,
          service: targetLead.service,
          details: targetLead.details,
          address: targetLead.address,
          leadSource: targetLead.leadSource,
          pageUrl: targetLead.pageUrl,
          status: targetLead.status, // Strictly 'New'
        });

    await setDoc(leadDocRef, firestorePayload, { merge: true });
  } catch (firestoreErr: any) {
    console.error('Error persisting lead to Firestore:', firestoreErr);
    firestoreErrDetail = firestoreErr?.message || 'Database permission or connection error';
  }

  // 3. Optional Google Sheet webhook sync if configured
  let syncMessage = '';
  if (endpointUrl && endpointUrl.startsWith('http')) {
    try {
      const syncRes = await syncLeadActionToRemote(endpointUrl, { action: 'createLead', ...targetLead });
      if (syncRes.success) {
        syncMessage = ' and synced to Google Sheet';
      } else {
        console.error('Google Sheet sync failure:', syncRes.message);
        return {
          success: false,
          message: `Google Sheet recording error: ${syncRes.message}`,
          lead: targetLead,
        };
      }
    } catch (e: any) {
      console.error('Google Sheet sync exception:', e);
      return {
        success: false,
        message: `Network error connecting to Google Sheet Web App: ${e?.message || 'Check connection'}`,
        lead: targetLead,
      };
    }
  }

  // If Firestore write failed, report real error rather than pretending CRM saved the lead
  if (firestoreErrDetail) {
    return {
      success: false,
      message: `Enquiry logged to Google Sheet, but CRM database write failed: ${firestoreErrDetail}.`,
      lead: targetLead,
    };
  }

  return { success: true, message: `Lead saved to CRM${syncMessage}.`, lead: targetLead };
}

/**
 * Update lead status in Firestore & local cache
 */
export async function updateLeadStatus(
  leadId: string,
  status: LeadStatus,
  tenantId?: string,
  endpointUrl?: string
): Promise<{ success: boolean; message: string; lead: LeadItem | null }> {
  const cleanTenant = (tenantId || 'demo-tarot-kochi').trim().toLowerCase();
  const leads = getStoredLeads(cleanTenant);
  const idx = leads.findIndex((l) => l.id === leadId);

  const autoNote: LeadNote = {
    id: `note-${Date.now()}`,
    text: `Status updated to "${status}"`,
    createdAt: new Date().toISOString(),
    author: 'Agent',
  };

  let updatedLead: LeadItem | null = null;
  if (idx !== -1) {
    leads[idx].status = status;
    leads[idx].notes = [autoNote, ...(leads[idx].notes || [])];
    updatedLead = leads[idx];
    saveAllLeads(leads, cleanTenant);
  }

  // Persist to Firestore
  try {
    const leadRef = doc(db, 'tenants', cleanTenant, 'leads', leadId);
    await updateDoc(leadRef, {
      status,
      notes: updatedLead?.notes || [autoNote],
    });
  } catch (err) {
    console.warn('Firestore updateLeadStatus notice:', err);
  }

  // Optional Google Sheet webhook sync
  if (endpointUrl && endpointUrl.startsWith('http')) {
    try {
      await syncLeadActionToRemote(endpointUrl, {
        action: 'updateStatus',
        leadId,
        clientId: cleanTenant,
        status,
      });
    } catch {
      // Non-blocking
    }
  }

  return { success: true, message: `Status updated to ${status}`, lead: updatedLead };
}

/**
 * Add a note to a lead in Firestore & local cache
 */
export async function addLeadNote(
  leadId: string,
  text: string,
  author = 'Agent',
  tenantId?: string,
  endpointUrl?: string
): Promise<{ success: boolean; message: string; lead: LeadItem | null }> {
  const cleanTenant = (tenantId || 'demo-tarot-kochi').trim().toLowerCase();
  const leads = getStoredLeads(cleanTenant);
  const idx = leads.findIndex((l) => l.id === leadId);

  const newNote: LeadNote = {
    id: `note-${Date.now()}`,
    text: text.trim(),
    createdAt: new Date().toISOString(),
    author,
  };

  let updatedLead: LeadItem | null = null;
  if (idx !== -1) {
    leads[idx].notes = [newNote, ...(leads[idx].notes || [])];
    updatedLead = leads[idx];
    saveAllLeads(leads, cleanTenant);
  }

  // Persist to Firestore
  try {
    const leadRef = doc(db, 'tenants', cleanTenant, 'leads', leadId);
    await updateDoc(leadRef, {
      notes: updatedLead?.notes || [newNote],
    });
  } catch (err) {
    console.warn('Firestore addLeadNote notice:', err);
  }

  if (endpointUrl && endpointUrl.startsWith('http')) {
    try {
      await syncLeadActionToRemote(endpointUrl, {
        action: 'addNote',
        leadId,
        clientId: cleanTenant,
        text: text.trim(),
        author,
      });
    } catch {
      // Non-blocking
    }
  }

  return { success: true, message: 'Note added successfully', lead: updatedLead };
}

/**
 * Schedule follow-up date for a lead in Firestore
 */
export async function scheduleLeadFollowUp(
  leadId: string,
  followUpDate: string,
  tenantId?: string,
  endpointUrl?: string
): Promise<{ success: boolean; message: string; lead: LeadItem | null }> {
  const cleanTenant = (tenantId || 'demo-tarot-kochi').trim().toLowerCase();
  const leads = getStoredLeads(cleanTenant);
  const idx = leads.findIndex((l) => l.id === leadId);

  const autoNote: LeadNote = {
    id: `note-${Date.now()}`,
    text: followUpDate ? `Follow-up scheduled for ${new Date(followUpDate).toLocaleString()}` : 'Follow-up date cleared',
    createdAt: new Date().toISOString(),
    author: 'System',
  };

  let updatedLead: LeadItem | null = null;
  if (idx !== -1) {
    leads[idx].followUpDate = followUpDate;
    if (leads[idx].status === 'New') {
      leads[idx].status = 'Follow-up';
    }
    leads[idx].notes = [autoNote, ...(leads[idx].notes || [])];
    updatedLead = leads[idx];
    saveAllLeads(leads, cleanTenant);
  }

  try {
    const leadRef = doc(db, 'tenants', cleanTenant, 'leads', leadId);
    await updateDoc(leadRef, {
      followUpDate,
      status: updatedLead?.status || 'Follow-up',
      notes: updatedLead?.notes || [autoNote],
    });
  } catch (err) {
    console.warn('Firestore scheduleLeadFollowUp notice:', err);
  }

  if (endpointUrl && endpointUrl.startsWith('http')) {
    try {
      await syncLeadActionToRemote(endpointUrl, {
        action: 'scheduleFollowUp',
        leadId,
        clientId: cleanTenant,
        followUpDate,
        status: 'Follow-up',
      });
    } catch {
      // Non-blocking
    }
  }

  return { success: true, message: 'Follow-up scheduled successfully', lead: updatedLead };
}

/**
 * Log a contact attempt (Call, WhatsApp, SMS, Email) in Firestore
 */
export async function logLeadContact(
  leadId: string,
  method: ContactMethod,
  customNote?: string,
  tenantId?: string,
  endpointUrl?: string
): Promise<{ success: boolean; message: string; lead: LeadItem | null }> {
  const cleanTenant = (tenantId || 'demo-tarot-kochi').trim().toLowerCase();
  const leads = getStoredLeads(cleanTenant);
  const idx = leads.findIndex((l) => l.id === leadId);

  const nowIso = new Date().toISOString();
  const logEntry: LeadContactLog = {
    id: `log-${Date.now()}`,
    method,
    timestamp: nowIso,
    notes: customNote || `Outbound ${method} initiated`,
  };

  const autoNote: LeadNote = {
    id: `note-${Date.now()}`,
    text: `Initiated outbound ${method} contact.${customNote ? ` Note: ${customNote}` : ''}`,
    createdAt: nowIso,
    author: 'System',
  };

  let updatedLead: LeadItem | null = null;
  if (idx !== -1) {
    leads[idx].lastContacted = nowIso;
    leads[idx].lastContactMethod = method;
    leads[idx].contactCount = (leads[idx].contactCount || 0) + 1;
    if (leads[idx].status === 'New') {
      leads[idx].status = 'Contacted';
    }
    leads[idx].contactLogs = [logEntry, ...(leads[idx].contactLogs || [])];
    leads[idx].notes = [autoNote, ...(leads[idx].notes || [])];
    updatedLead = leads[idx];
    saveAllLeads(leads, cleanTenant);
  }

  try {
    const leadRef = doc(db, 'tenants', cleanTenant, 'leads', leadId);
    await updateDoc(leadRef, {
      lastContacted: nowIso,
      lastContactMethod: method,
      contactCount: updatedLead?.contactCount || 1,
      status: updatedLead?.status || 'Contacted',
      contactLogs: updatedLead?.contactLogs || [logEntry],
      notes: updatedLead?.notes || [autoNote],
    });
  } catch (err) {
    console.warn('Firestore logLeadContact notice:', err);
  }

  if (endpointUrl && endpointUrl.startsWith('http')) {
    try {
      await syncLeadActionToRemote(endpointUrl, {
        action: 'logContact',
        leadId,
        clientId: cleanTenant,
        method,
        customNote,
      });
    } catch {
      // Non-blocking
    }
  }

  return { success: true, message: `Logged ${method} contact`, lead: updatedLead };
}

/**
 * Delete a lead from Firestore and local cache, and optionally synchronize deletion to Google Sheets
 */
export async function deleteLead(
  leadId: string,
  tenantId: string,
  endpointUrl?: string
): Promise<{ success: boolean; message: string }> {
  const cleanTenant = (tenantId || 'demo-tarot-kochi').trim().toLowerCase();
  const leads = getStoredLeads(cleanTenant);
  const targetLead = leads.find((l) => l.id === leadId);

  // 1. Enforce backend deletion FIRST to respect role-based access rules (Owners/Admins only)
  try {
    const leadRef = doc(db, 'tenants', cleanTenant, 'leads', leadId);
    await deleteDoc(leadRef);
  } catch (err: any) {
    console.error('Firestore deleteLead error:', err);
    return {
      success: false,
      message: `Failed to delete lead from database: ${err?.message || 'Permission denied. Only Tenant Owners can delete leads.'}`,
    };
  }

  // 2. Update local cache ONLY after successful database deletion
  const filtered = leads.filter((l) => l.id !== leadId);
  saveAllLeads(filtered, cleanTenant);

  // 3. Synchronize deletion with Google Sheets only if database deletion succeeded
  if (endpointUrl && endpointUrl.startsWith('http')) {
    try {
      await syncLeadActionToRemote(endpointUrl, {
        action: 'deleteLead',
        leadId,
        clientId: cleanTenant,
      });
    } catch (syncErr) {
      console.warn('Google Sheets delete sync notice:', syncErr);
    }
  }

  return {
    success: true,
    message: targetLead
      ? `Lead "${targetLead.name}" (${leadId}) deleted successfully.`
      : `Lead ${leadId} deleted successfully.`,
  };
}

/**
 * Safe Migration Plan:
 * Migrates existing legacy localStorage leads to Firestore without deleting or overwriting any existing data.
 */
export async function migrateLocalStorageToFirestore(tenantId: string): Promise<{
  migratedCount: number;
  skippedCount: number;
  message: string;
}> {
  const cleanTenant = tenantId.trim().toLowerCase();
  let candidateLeads: LeadItem[] = [];

  // 1. Gather all candidate leads from both scoped key and legacy master key
  try {
    const scopedKey = getClientStorageKey(cleanTenant);
    const scopedRaw = localStorage.getItem(scopedKey);
    if (scopedRaw) {
      const parsed: LeadItem[] = JSON.parse(scopedRaw);
      candidateLeads.push(...parsed);
    }

    const legacyRaw = localStorage.getItem('leadpilot_leads_v1');
    if (legacyRaw) {
      const parsed: LeadItem[] = JSON.parse(legacyRaw);
      const filtered = parsed.filter((l) => l.clientId && l.clientId.toLowerCase() === cleanTenant);
      candidateLeads.push(...filtered);
    }
  } catch (err) {
    console.error('Error reading legacy storage:', err);
  }

  const uniqueCandidates = deduplicateLeads(candidateLeads);
  if (uniqueCandidates.length === 0) {
    return {
      migratedCount: 0,
      skippedCount: 0,
      message: 'No legacy localStorage leads found to migrate.',
    };
  }

  // 2. Query Firestore to avoid overwriting existing documents
  let migrated = 0;
  let skipped = 0;

  try {
    const batch = writeBatch(db);
    for (const lead of uniqueCandidates) {
      const leadRef = doc(db, 'tenants', cleanTenant, 'leads', lead.id);
      batch.set(leadRef, { ...lead, clientId: cleanTenant }, { merge: true });
      migrated++;
    }
    await batch.commit();
  } catch (batchErr) {
    console.warn('Batch migration fallback to individual sets:', batchErr);
    for (const lead of uniqueCandidates) {
      try {
        const leadRef = doc(db, 'tenants', cleanTenant, 'leads', lead.id);
        await setDoc(leadRef, { ...lead, clientId: cleanTenant }, { merge: true });
        migrated++;
      } catch {
        skipped++;
      }
    }
  }

  return {
    migratedCount: migrated,
    skippedCount: skipped,
    message: `Migration complete: ${migrated} lead(s) safely synced to Firestore, ${skipped} skipped.`,
  };
}

/**
 * Test health-check connection to Google Apps Script Web App
 */
export async function testGoogleSheetConnection(endpointUrl: string): Promise<{
  success: boolean;
  statusText: string;
  message: string;
  leadCount?: number;
}> {
  if (!endpointUrl || !endpointUrl.trim() || !endpointUrl.startsWith('http')) {
    return {
      success: false,
      statusText: 'Google Apps Script URL Required',
      message: 'Google Apps Script URL is missing or unconfigured in CONFIG.formEndpoint.',
    };
  }

  try {
    const url = new URL(endpointUrl.trim());
    url.searchParams.set('action', 'testConnection');
    url.searchParams.set('t', Date.now().toString());

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      return {
        success: false,
        statusText: 'Google Sheet Connection Failed',
        message: `Endpoint returned HTTP error ${res.status}.`,
      };
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      return {
        success: false,
        statusText: 'Google Sheet Connection Failed',
        message: 'Endpoint did not return valid JSON. Ensure your Google Apps Script is deployed as a Web App with access set to "Anyone".',
      };
    }

    if (!json || (json.status !== 'success' && json.result !== 'success')) {
      return {
        success: false,
        statusText: 'Google Sheet Connection Failed',
        message: json?.message || 'Google Apps Script returned an unsuccessful response.',
      };
    }

    return {
      success: true,
      statusText: 'Google Sheet Connected ✓',
      message: json.message || 'Successfully connected to Google Apps Script Web App.',
      leadCount: typeof json.leadCount === 'number' ? json.leadCount : undefined,
    };
  } catch (err: any) {
    return {
      success: false,
      statusText: 'Google Sheet Connection Failed',
      message: err?.message || 'Failed to reach Google Apps Script Web App URL.',
    };
  }
}

/**
 * POST action to remote Google Apps Script backend
 * Accounts for cross-origin response limitations with fallback handling
 */
export async function syncLeadActionToRemote(
  endpointUrl: string | undefined,
  payload: Record<string, any>
): Promise<{ success: boolean; result?: any; message: string }> {
  if (!endpointUrl || !endpointUrl.trim() || !endpointUrl.startsWith('http')) {
    return { success: false, message: 'Google Apps Script URL is missing or unconfigured in CONFIG.formEndpoint.' };
  }

  const cleanUrl = endpointUrl.trim();
  const serialized = JSON.stringify(payload);

  try {
    const res = await fetch(cleanUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: serialized,
    });

    if (!res.ok) {
      return { success: false, message: `Google Apps Script returned HTTP status ${res.status}` };
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      return {
        success: false,
        message: 'Google Apps Script did not return a valid confirmation JSON. Ensure the script is deployed with access set to "Anyone".',
      };
    }

    const isSuccess = Boolean(json && (json.result === 'success' || json.status === 'success' || json.status === 'ok'));
    return {
      success: isSuccess,
      result: json,
      message: json?.message || (isSuccess ? 'Synced to Google Sheet successfully' : 'Google Apps Script reported an issue'),
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Network error connecting to Google Apps Script Web App.',
    };
  }
}

/**
 * CRM Remote Leads fetcher:
 * Ingests leads from Firestore (the authenticated CRM source of truth) for the active tenant.
 */
export async function fetchRemoteLeads(endpointUrl: string, clientId: string = 'all'): Promise<LeadItem[]> {
  const clean = (clientId === 'all' ? '' : clientId).trim().toLowerCase();
  if (clean) {
    const firestoreLeads = await fetchFirestoreLeads(clean);
    if (firestoreLeads && firestoreLeads.length > 0) {
      return firestoreLeads;
    }
  }
  return getStoredLeads(clientId);
}

/**
 * Summary metrics of a Google Sheets -> CRM sync run
 */
export interface SheetSyncSummary {
  success: boolean;
  message: string;
  newLeadsImported: number;
  existingLeadsUpdated: number;
  duplicatesSkipped: number;
  rowsSkippedDueToValidationError: number;
  totalSpreadsheetRows: number;
  lastSyncTime: string;
  error?: string;
}

/**
 * Normalize phone number to digits only for reliable deduplication
 */
export function normalizePhoneNumber(phone?: string): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Match two phone numbers accounting for national vs international dialing format differences
 */
export function isPhoneMatch(p1?: string, p2?: string): boolean {
  const c1 = normalizePhoneNumber(p1);
  const c2 = normalizePhoneNumber(p2);
  if (!c1 || !c2) return false;
  if (c1 === c2) return true;
  // If at least 7 digits match at the end
  if (c1.length >= 7 && c2.length >= 7) {
    return c1.endsWith(c2) || c2.endsWith(c1);
  }
  return false;
}

/**
 * Fetch raw lead rows from Google Apps Script Web App
 */
export async function fetchRemoteSheetLeads(
  endpointUrl: string,
  tenantId: string,
  apiKey?: string
): Promise<{
  success: boolean;
  leads: Partial<LeadItem>[];
  message: string;
  totalRows?: number;
}> {
  if (!endpointUrl || !endpointUrl.trim() || !endpointUrl.startsWith('http')) {
    return {
      success: false,
      leads: [],
      message: 'Google Apps Script URL is missing or unconfigured in CONFIG.formEndpoint.',
    };
  }

  const cleanTenant = (tenantId || 'roofing-client-01').trim().toLowerCase();

  try {
    let res: Response;
    if (apiKey && apiKey.trim()) {
      // Security: Pass API key strictly in POST body, never expose in URL query parameters
      res = await fetch(endpointUrl.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action: 'getLeads',
          clientId: cleanTenant,
          apiKey: apiKey.trim(),
        }),
      });
    } else {
      const url = new URL(endpointUrl.trim());
      url.searchParams.set('action', 'getLeads');
      url.searchParams.set('clientId', cleanTenant);
      url.searchParams.set('_t', Date.now().toString());

      res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    }

    if (!res.ok) {
      return {
        success: false,
        leads: [],
        message: `Google Apps Script returned HTTP error status ${res.status}.`,
      };
    }

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      return {
        success: false,
        leads: [],
        message: 'Endpoint did not return valid JSON. Verify your Apps Script is deployed as a Web App with access "Anyone".',
      };
    }

    if (!json || (json.status !== 'success' && json.result !== 'success')) {
      return {
        success: false,
        leads: [],
        message: json?.message || 'Google Apps Script reported an unsuccessful response.',
      };
    }

    const rawLeads: any[] = Array.isArray(json.leads) ? json.leads : [];
    return {
      success: true,
      leads: rawLeads,
      message: json.message || `Retrieved ${rawLeads.length} lead(s) from Google Sheet.`,
      totalRows: typeof json.totalRows === 'number' ? json.totalRows : rawLeads.length,
    };
  } catch (err: any) {
    return {
      success: false,
      leads: [],
      message: err?.message || 'Failed to connect to Google Apps Script Web App.',
    };
  }
}

/**
 * Full Bidirectional Synchronization: Google Sheets -> LeadPilot CRM
 * Ingests, updates, and deduplicates spreadsheet rows into Firestore and local CRM cache.
 */
export async function syncGoogleSheetToCrm(
  endpointUrl: string,
  tenantId: string,
  options?: { apiKey?: string; conflictStrategy?: 'sheetWins' | 'crmWins' }
): Promise<SheetSyncSummary> {
  const cleanTenant = (tenantId || 'roofing-client-01').trim().toLowerCase();
  const nowStr = new Date().toLocaleTimeString();

  if (!endpointUrl || !endpointUrl.trim() || !endpointUrl.startsWith('http')) {
    return {
      success: false,
      message: 'Google Apps Script URL is missing or unconfigured in CONFIG.formEndpoint.',
      newLeadsImported: 0,
      existingLeadsUpdated: 0,
      duplicatesSkipped: 0,
      rowsSkippedDueToValidationError: 0,
      totalSpreadsheetRows: 0,
      lastSyncTime: nowStr,
      error: 'Unconfigured formEndpoint',
    };
  }

  // 1. Fetch remote sheet rows
  const remoteRes = await fetchRemoteSheetLeads(endpointUrl, cleanTenant, options?.apiKey);
  if (!remoteRes.success) {
    return {
      success: false,
      message: remoteRes.message,
      newLeadsImported: 0,
      existingLeadsUpdated: 0,
      duplicatesSkipped: 0,
      rowsSkippedDueToValidationError: 0,
      totalSpreadsheetRows: 0,
      lastSyncTime: nowStr,
      error: remoteRes.message,
    };
  }

  // 2. Load existing CRM leads for this tenant
  const currentLeads = getStoredLeads(cleanTenant);
  const updatedLeads: LeadItem[] = [...currentLeads];

  let newLeadsImported = 0;
  let existingLeadsUpdated = 0;
  let duplicatesSkipped = 0;
  let rowsSkippedDueToValidationError = 0;

  const validStatuses: LeadStatus[] = ['New', 'Contacted', 'Follow-up', 'Qualified', 'Won', 'Lost'];

  // 3. Process each spreadsheet row
  for (const row of remoteRes.leads) {
    const rawName = (row.name || '').trim();
    const rawPhone = (row.phone || '').trim();
    const rawEmail = (row.email || '').trim().toLowerCase();

    // Validation: Row must contain at least a name or phone number
    if (!rawName && !rawPhone) {
      rowsSkippedDueToValidationError++;
      continue;
    }

    const cleanPhoneDigits = normalizePhoneNumber(rawPhone);
    if (rawPhone && cleanPhoneDigits.length < 5 && !rawName) {
      rowsSkippedDueToValidationError++;
      continue;
    }

    // Match candidate existing lead
    // 1st Priority: Match by stable Lead ID
    let matchIdx = -1;
    if (row.id && row.id.trim()) {
      const targetId = row.id.trim().toLowerCase();
      matchIdx = updatedLeads.findIndex((l) => l.id.toLowerCase() === targetId);
    }

    // 2nd Priority: Match by normalized Phone Number (if no ID match)
    if (matchIdx === -1 && cleanPhoneDigits.length >= 7) {
      matchIdx = updatedLeads.findIndex((l) => isPhoneMatch(l.phone, rawPhone));
    }

    // 3rd Priority: Match by Email (if no ID or phone match)
    if (matchIdx === -1 && rawEmail && rawEmail.includes('@')) {
      matchIdx = updatedLeads.findIndex((l) => (l.email || '').toLowerCase().trim() === rawEmail);
    }

    if (matchIdx !== -1) {
      // MATCH FOUND: Existing lead
      const existing = updatedLeads[matchIdx];
      let hasChanges = false;

      // Safe update: Non-destructive field updates (never replace CRM data with empty spreadsheet cells)
      const updatedItem: LeadItem = { ...existing };

      if (rawName && rawName !== existing.name) {
        updatedItem.name = rawName;
        hasChanges = true;
      }

      if (rawPhone && rawPhone !== existing.phone && !isPhoneMatch(rawPhone, existing.phone)) {
        updatedItem.phone = rawPhone;
        hasChanges = true;
      }

      if (rawEmail && rawEmail !== (existing.email || '').toLowerCase()) {
        updatedItem.email = rawEmail;
        hasChanges = true;
      }

      if (row.service && row.service.trim() && row.service.trim() !== existing.service) {
        updatedItem.service = row.service.trim();
        hasChanges = true;
      }

      if (row.details && row.details.trim() && row.details.trim() !== existing.details) {
        updatedItem.details = row.details.trim();
        hasChanges = true;
      }

      if (row.address && row.address.trim() && row.address.trim() !== existing.address) {
        updatedItem.address = row.address.trim();
        hasChanges = true;
      }

      if (row.leadSource && row.leadSource.trim() && row.leadSource.trim() !== existing.leadSource) {
        updatedItem.leadSource = row.leadSource.trim();
        hasChanges = true;
      }

      if (row.status && row.status.trim()) {
        const matchedStatus = validStatuses.find((s) => s.toLowerCase() === row.status!.trim().toLowerCase());
        if (matchedStatus && matchedStatus !== existing.status) {
          updatedItem.status = matchedStatus;
          hasChanges = true;
        }
      }

      if (row.followUpDate && row.followUpDate.trim() && row.followUpDate.trim() !== existing.followUpDate) {
        updatedItem.followUpDate = row.followUpDate.trim();
        hasChanges = true;
      }

      // Merge Notes safely without wiping CRM notes
      if (Array.isArray(row.notes) && row.notes.length > 0) {
        const existingNoteTexts = new Set((existing.notes || []).map((n) => n.text.trim().toLowerCase()));
        const newNotesToAdd: LeadNote[] = [];
        for (const n of row.notes) {
          if (n && n.text && !existingNoteTexts.has(n.text.trim().toLowerCase())) {
            newNotesToAdd.push({
              id: n.id || `note-sht-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
              text: n.text.trim(),
              createdAt: n.createdAt || new Date().toISOString(),
              author: n.author || 'Spreadsheet',
            });
            existingNoteTexts.add(n.text.trim().toLowerCase());
          }
        }
        if (newNotesToAdd.length > 0) {
          updatedItem.notes = [...newNotesToAdd, ...(existing.notes || [])];
          hasChanges = true;
        }
      }

      if (hasChanges) {
        // Record audit note for Google Sheet update
        const syncAuditNote: LeadNote = {
          id: `note-sync-${Date.now()}`,
          text: `Updated from Google Sheet on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`,
          createdAt: new Date().toISOString(),
          author: 'Google Sheet Sync',
        };
        updatedItem.notes = [syncAuditNote, ...(updatedItem.notes || [])];

        // Persist to Firestore if user is authenticated in CRM
        if (auth.currentUser) {
          try {
            const docRef = doc(db, 'tenants', cleanTenant, 'leads', updatedItem.id);
            await setDoc(docRef, cleanForFirestore(updatedItem), { merge: true });
          } catch (dbErr) {
            console.warn('Firestore update error during sheet sync:', dbErr);
          }
        }

        updatedLeads[matchIdx] = updatedItem;
        existingLeadsUpdated++;
      } else {
        duplicatesSkipped++;
      }
    } else {
      // NEW LEAD: Not present in CRM yet
      const newLeadId = row.id && row.id.trim() ? row.id.trim() : generateLeadId(updatedLeads.length);
      const matchedStatus: LeadStatus = (validStatuses.find((s) => s.toLowerCase() === (row.status || '').trim().toLowerCase())) || 'New';

      const initialNote: LeadNote = {
        id: `note-imp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        text: `Lead imported from Google Sheet on ${new Date().toLocaleDateString()}`,
        createdAt: new Date().toISOString(),
        author: 'Google Sheet Sync',
      };

      const newLead: LeadItem = {
        id: newLeadId,
        timestamp: row.timestamp || new Date().toISOString(),
        clientId: cleanTenant,
        businessName: row.businessName || (cleanTenant === 'roofing-client-01' ? 'Test Client' : 'Tarot Coaching & Guidance'),
        name: rawName || 'Anonymous',
        phone: rawPhone,
        email: rawEmail || undefined,
        service: (row.service || 'General Enquiry').trim(),
        details: (row.details || 'Imported from Google Sheet').trim(),
        address: (row.address || '').trim(),
        leadSource: (row.leadSource || 'Google Sheet Import').trim(),
        pageUrl: row.pageUrl || '',
        status: matchedStatus,
        notes: Array.isArray(row.notes) && row.notes.length > 0 ? [...row.notes, initialNote] : [initialNote],
        followUpDate: row.followUpDate || undefined,
        contactCount: 0,
        contactLogs: [],
      };

      // Persist to Firestore if user is authenticated in CRM
      if (auth.currentUser) {
        try {
          const docRef = doc(db, 'tenants', cleanTenant, 'leads', newLead.id);
          await setDoc(docRef, cleanForFirestore(newLead), { merge: true });
        } catch (dbErr) {
          console.warn('Firestore insert error during sheet sync:', dbErr);
        }
      }

      updatedLeads.unshift(newLead);
      newLeadsImported++;
    }
  }

  // 4. Update local cache
  saveAllLeads(updatedLeads, cleanTenant);

  const summaryMessage = `Sync complete: ${newLeadsImported} new lead(s) imported, ${existingLeadsUpdated} updated, ${duplicatesSkipped} duplicate(s) skipped.`;

  return {
    success: true,
    message: summaryMessage,
    newLeadsImported,
    existingLeadsUpdated,
    duplicatesSkipped,
    rowsSkippedDueToValidationError,
    totalSpreadsheetRows: remoteRes.totalRows || remoteRes.leads.length,
    lastSyncTime: nowStr,
  };
}
