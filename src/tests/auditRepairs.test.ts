import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildOwnerWhatsAppRedirectUrl } from '../components/LiveWebsitePreview';
import {
  syncGoogleSheetToCrm,
  getStoredLeads,
  saveAllLeads,
  saveLead,
  updateLeadPhone,
  updateLeadStatus,
} from '../utils/leadStorage';
import { ClientConfig, LeadItem } from '../types';

describe('LeadPilot Product Audit Repairs Regression Suite', () => {
  const storage = new Map<string, string>();
  const originalFetch = global.fetch;

  beforeEach(() => {
    storage.clear();
    (global as any).localStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, val: string) => storage.set(key, String(val)),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('buildOwnerWhatsAppRedirectUrl builds encoded prefill URL with Reference ID and enquiry details', () => {
    const config: Partial<ClientConfig> = {
      businessName: 'Sacred Tarot Kochi',
      whatsAppNumber: '+91 98470 55511',
    };
    const lead: Partial<LeadItem> = {
      id: 'LP-20261124-9001',
      name: 'Meera Nair',
      phone: '+91 99950 11223',
      service: 'Career & Life Reading',
      details: 'Evening slot preferred',
    };

    const url = buildOwnerWhatsAppRedirectUrl(config, lead);
    expect(url).toBeTruthy();
    expect(url).toContain('https://wa.me/919847055511?text=');
    const decoded = decodeURIComponent(url!.split('?text=')[1]);
    expect(decoded).toContain('Reference ID: LP-20261124-9001');
    expect(decoded).toContain('Name: Meera Nair');
    expect(decoded).toContain('Service: Career & Life Reading');
    expect(decoded).toContain('Details: Evening slot preferred');
  });

  it('buildOwnerWhatsAppRedirectUrl returns null if business phone / WhatsApp is missing or invalid', () => {
    expect(buildOwnerWhatsAppRedirectUrl({ businessName: 'No Phone Biz' }, { id: 'LP-1' })).toBeNull();
    expect(buildOwnerWhatsAppRedirectUrl({ businessName: 'Short Phone', whatsAppNumber: '123' }, { id: 'LP-1' })).toBeNull();
  });

  it('google-apps-script/Code.gs and public/downloads/Code.gs stay identical and route explicit actions cleanly', () => {
    const mainGs = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
    const publicGs = fs.readFileSync(path.resolve(process.cwd(), 'public/downloads/Code.gs'), 'utf8');
    expect(mainGs).toBe(publicGs);

    expect(mainGs).toContain('action === "updateStatus"');
    expect(mainGs).toContain('action === "addNote"');
    expect(mainGs).toContain('action === "scheduleFollowUp"');
    expect(mainGs).toContain('action === "logContact"');
    expect(mainGs).toContain('action === "updatePhone"');
    expect(mainGs).toContain('action === "deleteLead"');
    expect(mainGs).toContain('Unsupported CRM action');
  });

  it('syncGoogleSheetToCrm deduplicates concurrent calls for the same tenant via in-flight mutex', async () => {
    const tenantId = 'demo-tarot-kochi';
    saveAllLeads([], tenantId);

    let fetchCount = 0;
    global.fetch = async () => {
      fetchCount++;
      await new Promise((r) => setTimeout(r, 25));
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          result: 'success',
          clientId: tenantId,
          totalRows: 1,
          leads: [
            {
              id: 'LP-MTX-001',
              name: 'Aarav Menon',
              phone: '+91 98470 77889',
              service: 'Tarot Reading',
              status: 'New',
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      } as any;
    };

    const [r1, r2] = await Promise.all([
      syncGoogleSheetToCrm('https://script.google.com/macros/s/test/exec', tenantId),
      syncGoogleSheetToCrm('https://script.google.com/macros/s/test/exec', tenantId),
    ]);

    expect(fetchCount).toBe(1);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(getStoredLeads(tenantId)).toHaveLength(1);
  });

  it('syncGoogleSheetToCrm enforces crmWins against status downgrade while sheetWins allows sheet override', async () => {
    const tenantId = 'demo-tarot-kochi';
    saveAllLeads(
      [
        {
          id: 'LP-CONF-01',
          timestamp: '2026-11-24T10:00:00Z',
          clientId: tenantId,
          businessName: 'Tarot Kochi',
          name: 'Divya Pillai',
          phone: '+91 98470 44556',
          service: 'Relationship Reading',
          details: '',
          address: 'Kochi',
          leadSource: 'Website',
          status: 'Qualified',
          followUpDate: '2026-12-01',
          notes: [],
          contactCount: 2,
        },
      ],
      tenantId
    );

    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        status: 'success',
        result: 'success',
        clientId: tenantId,
        totalRows: 1,
        leads: [
          {
            id: 'LP-CONF-01',
            name: 'Divya Pillai',
            phone: '+91 98470 44556',
            service: 'Relationship Reading',
            status: 'New',
            followUpDate: '2026-12-10',
          },
        ],
      }),
    } as any);

    await syncGoogleSheetToCrm('https://script.google.com/macros/s/test/exec', tenantId, {
      conflictStrategy: 'crmWins',
    });
    let current = getStoredLeads(tenantId)[0];
    expect(current.status).toBe('Qualified');
    expect(current.followUpDate).toBe('2026-12-01');

    await syncGoogleSheetToCrm('https://script.google.com/macros/s/test/exec', tenantId, {
      conflictStrategy: 'sheetWins',
    });
    current = getStoredLeads(tenantId)[0];
    expect(current.status).toBe('New');
    expect(current.followUpDate).toBe('2026-12-10');
  });

  it('updateLeadPhone & updateLeadStatus fail closed when tenantId missing and report sheetSynced accurately', async () => {
    const missingTenantPhone = await updateLeadPhone('LP-1', '+91 98470 12345', '');
    expect(missingTenantPhone.success).toBe(false);
    expect(missingTenantPhone.sheetSynced).toBe(false);

    const missingTenantStatus = await updateLeadStatus('LP-1', 'Contacted', '');
    expect(missingTenantStatus.success).toBe(false);
    expect(missingTenantStatus.sheetSynced).toBe(false);

    const tenantId = 'demo-tarot-kochi';
    saveAllLeads(
      [
        {
          id: 'LP-PH-01',
          timestamp: new Date().toISOString(),
          clientId: tenantId,
          businessName: 'Tarot Kochi',
          name: 'Neha',
          phone: '+91 98470 00001',
          service: 'General',
          details: '',
          address: 'Kochi',
          leadSource: 'Manual',
          status: 'New',
          notes: [],
          contactCount: 0,
        },
      ],
      tenantId
    );

    const res = await updateLeadPhone('LP-PH-01', '+91 98470 99999', tenantId, '');
    expect(res.success).toBe(true);
    expect(res.sheetSynced).toBe(false);
    expect(res.lead?.phone).toBe('+91 98470 99999');
    expect(getStoredLeads(tenantId)[0].phone).toBe('+91 98470 99999');
  });

  it('saveLead updates local cache without invoking anonymous Firestore write on 5-minute repeat submission', async () => {
    const tenantId = 'demo-tarot-kochi';
    saveAllLeads([], tenantId);

    let persistCalls = 0;
    const first = await saveLead(
      {
        clientId: tenantId,
        name: 'Repeat Visitor',
        phone: '+91 98470 33221',
        email: 'repeat@example.com',
        service: 'Tarot Session',
        details: 'Initial note',
        leadSource: 'Website',
      },
      '',
      {
        persistLeadToFirestore: async () => {
          persistCalls++;
        },
      }
    );
    expect(first.success).toBe(true);
    expect(persistCalls).toBe(1);

    const second = await saveLead(
      {
        clientId: tenantId,
        name: 'Repeat Visitor',
        phone: '+91 98470 33221',
        email: 'repeat@example.com',
        service: 'Tarot Session',
        details: 'Follow-up detail',
        leadSource: 'Website',
      },
      ''
    );
    expect(second.success).toBe(true);
    expect(second.message).toContain('Enquiry already received');
    expect(getStoredLeads(tenantId)).toHaveLength(1);
    expect(getStoredLeads(tenantId)[0].details).toContain('Follow-up detail');
  });
});
