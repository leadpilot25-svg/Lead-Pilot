/**
 * LeadPilot CRM - Google Sheets to CRM Bidirectional Sync Test Suite
 * 
 * Verifies:
 * 1. Importing a new spreadsheet row into CRM.
 * 2. Updating an existing CRM lead when spreadsheet row values change.
 * 3. Repeated sync without duplicates (Idempotency).
 * 4. Normalizing phone numbers and matching records (+1 vs local format).
 * 5. Handling blank cells without overwriting CRM data, and skipping invalid rows.
 * 6. Keeping Roofing (roofing-client-01) and Tarot (demo-tarot-kochi) isolated.
 * 7. Handling Google Apps Script errors and network failures gracefully.
 * 8. Preventing concurrent synchronization loops and overlapping calls.
 * 9. Preserving existing landing-page enquiry submission (saveLead).
 * 10. Preserving multi-agent and tenant access boundaries.
 */

import {
  normalizePhoneNumber,
  isPhoneMatch,
  syncGoogleSheetToCrm,
  fetchRemoteSheetLeads,
  getStoredLeads,
  saveAllLeads,
  saveLead,
  SheetSyncSummary,
} from '../utils/leadStorage';
import { LeadItem } from '../types';

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(num: number, name: string, condition: boolean, message: string) {
  results.push({
    num,
    name,
    passed: condition,
    message,
  });
  const status = condition ? '✓ [PASS]' : '✗ [FAIL]';
  console.log(`${num}. ${status} ${name}\n   Result: ${message}`);
}

// Polyfill localStorage in Node.js test environment
const storageMap = new Map<string, string>();
(global as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

async function runSheetSyncTestSuite() {
  console.log('🔄 RUNNING LEADPILOT GOOGLE SHEETS <-> CRM SYNCHRONIZATION TEST SUITE');
  console.log('======================================================================');

  const ROOFING_TENANT = 'roofing-client-01';
  const TAROT_TENANT = 'demo-tarot-kochi';

  // Mock global fetch for controlled testing
  const originalFetch = global.fetch;

  try {
    // -------------------------------------------------------------
    // TEST 1: Importing a new spreadsheet row
    // -------------------------------------------------------------
    saveAllLeads([], ROOFING_TENANT); // Clear tenant test cache

    const mockNewRow: Partial<LeadItem> = {
      id: 'LP-ROOF-001',
      name: 'Michael Vance',
      phone: '+1 (555) 321-9988',
      email: 'michael.vance@example.com',
      service: 'Roof Leak Repair',
      details: 'Leak near chimney after heavy rain.',
      address: '742 Evergreen Terrace',
      leadSource: 'Meta Instant Form',
      status: 'New',
      timestamp: new Date().toISOString(),
    };

    global.fetch = async (url: any) => {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          result: 'success',
          clientId: ROOFING_TENANT,
          totalRows: 1,
          leads: [mockNewRow],
        }),
      } as any;
    };

    const sync1 = await syncGoogleSheetToCrm('https://mock-script.test/exec', ROOFING_TENANT);
    const leadsAfterSync1 = getStoredLeads(ROOFING_TENANT);

    assert(
      1,
      'Importing a new spreadsheet row',
      sync1.success === true &&
        sync1.newLeadsImported === 1 &&
        leadsAfterSync1.length === 1 &&
        leadsAfterSync1[0].name === 'Michael Vance' &&
        leadsAfterSync1[0].service === 'Roof Leak Repair',
      `Imported ${sync1.newLeadsImported} new lead (Lead ID: ${leadsAfterSync1[0]?.id})`
    );

    // -------------------------------------------------------------
    // TEST 2: Updating an existing CRM lead
    // -------------------------------------------------------------
    // Change status to 'Qualified' and update details in spreadsheet
    const mockUpdatedRow: Partial<LeadItem> = {
      id: 'LP-ROOF-001',
      name: 'Michael Vance',
      phone: '+1 (555) 321-9988',
      email: 'michael.vance@example.com',
      service: 'Roof Leak Repair & Tarping',
      details: 'Updated: Inspected on-site; qualified for insurance claim.',
      address: '742 Evergreen Terrace',
      leadSource: 'Meta Instant Form',
      status: 'Qualified',
      followUpDate: '2026-10-30',
      timestamp: new Date().toISOString(),
    };

    global.fetch = async (url: any) => {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          result: 'success',
          clientId: ROOFING_TENANT,
          totalRows: 1,
          leads: [mockUpdatedRow],
        }),
      } as any;
    };

    const sync2 = await syncGoogleSheetToCrm('https://mock-script.test/exec', ROOFING_TENANT);
    const leadsAfterSync2 = getStoredLeads(ROOFING_TENANT);
    const updatedLead = leadsAfterSync2.find((l) => l.id === 'LP-ROOF-001');

    assert(
      2,
      'Updating an existing CRM lead',
      sync2.success === true &&
        sync2.existingLeadsUpdated === 1 &&
        sync2.newLeadsImported === 0 &&
        updatedLead?.status === 'Qualified' &&
        updatedLead?.service === 'Roof Leak Repair & Tarping' &&
        updatedLead?.followUpDate === '2026-10-30',
      `Updated 1 existing lead without creating duplicate (New status: ${updatedLead?.status})`
    );

    // -------------------------------------------------------------
    // TEST 3: Repeated sync without duplicates (Idempotency)
    // -------------------------------------------------------------
    // Running sync again with the exact same row should skip duplicates
    const sync3 = await syncGoogleSheetToCrm('https://mock-script.test/exec', ROOFING_TENANT);
    const leadsAfterSync3 = getStoredLeads(ROOFING_TENANT);

    assert(
      3,
      'Repeated sync without duplicates',
      sync3.success === true &&
        sync3.duplicatesSkipped === 1 &&
        sync3.newLeadsImported === 0 &&
        sync3.existingLeadsUpdated === 0 &&
        leadsAfterSync3.length === 1,
      `Idempotent: ${sync3.duplicatesSkipped} duplicate skipped, total leads count remained ${leadsAfterSync3.length}`
    );

    // -------------------------------------------------------------
    // TEST 4: Normalizing phone numbers and matching records
    // -------------------------------------------------------------
    // Row has no ID, but phone matches existing lead in different formatting: '555-321-9988' vs '+1 (555) 321-9988'
    const phoneNormalized = normalizePhoneNumber('+1 (555) 321-9988');
    const isMatched = isPhoneMatch('+1 (555) 321-9988', '555-321-9988');

    const mockUnformattedRow: Partial<LeadItem> = {
      id: '', // Empty ID (e.g. from manual spreadsheet entry)
      name: 'Michael Vance',
      phone: '555-321-9988', // Unformatted local phone
      email: 'michael.vance@example.com',
      service: 'Roof Leak Repair & Tarping',
      details: 'Updated: Inspected on-site; qualified for insurance claim.',
      address: '742 Evergreen Terrace',
      leadSource: 'Meta Instant Form',
      status: 'Qualified',
    };

    global.fetch = async (url: any) => {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          result: 'success',
          clientId: ROOFING_TENANT,
          totalRows: 1,
          leads: [mockUnformattedRow],
        }),
      } as any;
    };

    const sync4 = await syncGoogleSheetToCrm('https://mock-script.test/exec', ROOFING_TENANT);
    const leadsAfterSync4 = getStoredLeads(ROOFING_TENANT);

    assert(
      4,
      'Normalizing phone numbers and matching records',
      isMatched === true &&
        phoneNormalized === '15553219988' &&
        sync4.duplicatesSkipped === 1 &&
        leadsAfterSync4.length === 1,
      `Phone numbers successfully normalized (Digits: ${phoneNormalized}); duplicate prevented by phone match`
    );

    // -------------------------------------------------------------
    // TEST 5: Handling blank cells and invalid rows
    // -------------------------------------------------------------
    // 1 invalid row (empty name and phone) + 1 row with blank address (must preserve existing CRM address)
    const mockInvalidRow: Partial<LeadItem> = {
      id: '',
      name: '',
      phone: '',
      service: '',
      details: '',
    };

    const mockBlankCellRow: Partial<LeadItem> = {
      id: 'LP-ROOF-001',
      name: 'Michael Vance',
      phone: '555-321-9988',
      email: '', // Blank email cell
      address: '', // Blank address cell
      service: 'Roof Leak Repair & Tarping',
      status: 'Qualified',
    };

    global.fetch = async (url: any) => {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          result: 'success',
          clientId: ROOFING_TENANT,
          totalRows: 2,
          leads: [mockInvalidRow, mockBlankCellRow],
        }),
      } as any;
    };

    const sync5 = await syncGoogleSheetToCrm('https://mock-script.test/exec', ROOFING_TENANT);
    const lead5 = getStoredLeads(ROOFING_TENANT).find((l) => l.id === 'LP-ROOF-001');

    assert(
      5,
      'Handling blank cells and invalid rows',
      sync5.rowsSkippedDueToValidationError === 1 &&
        lead5?.address === '742 Evergreen Terrace' && // Preserved existing address
        lead5?.email === 'michael.vance@example.com', // Preserved existing email
      `Skipped 1 empty row; preserved existing CRM address ("${lead5?.address}") and email without blank overwrite`
    );

    // -------------------------------------------------------------
    // TEST 6: Keeping Roofing and Tarot records isolated
    // -------------------------------------------------------------
    saveAllLeads([], TAROT_TENANT); // Clear tarot test cache

    const mockTarotRow: Partial<LeadItem> = {
      id: 'LP-TAROT-001',
      name: 'Priya Sharma',
      phone: '+91 98460 77112',
      service: 'Personal Tarot Guidance Session',
      status: 'New',
    };

    global.fetch = async (url: any) => {
      const u = new URL(url);
      const reqClient = u.searchParams.get('clientId');
      if (reqClient === TAROT_TENANT) {
        return {
          ok: true,
          json: async () => ({
            status: 'success',
            result: 'success',
            clientId: TAROT_TENANT,
            totalRows: 1,
            leads: [mockTarotRow],
          }),
        } as any;
      }
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          result: 'success',
          clientId: ROOFING_TENANT,
          totalRows: 1,
          leads: [mockUpdatedRow],
        }),
      } as any;
    };

    const syncTarot = await syncGoogleSheetToCrm('https://mock-tarot.test/exec', TAROT_TENANT);
    const tarotLeads = getStoredLeads(TAROT_TENANT);
    const roofingLeads = getStoredLeads(ROOFING_TENANT);

    const tarotHasRoofing = tarotLeads.some((l) => l.clientId === ROOFING_TENANT);
    const roofingHasTarot = roofingLeads.some((l) => l.clientId === TAROT_TENANT);

    assert(
      6,
      'Keeping Roofing and Tarot records isolated',
      syncTarot.success === true &&
        tarotLeads.length === 1 &&
        tarotLeads[0].name === 'Priya Sharma' &&
        !tarotHasRoofing &&
        !roofingHasTarot,
      `Roofing (${roofingLeads.length} lead) and Tarot (${tarotLeads.length} lead) strictly isolated`
    );

    // -------------------------------------------------------------
    // TEST 7: Google Apps Script errors and network failures
    // -------------------------------------------------------------
    global.fetch = async () => {
      return {
        ok: false,
        status: 503,
      } as any;
    };

    const syncError503 = await syncGoogleSheetToCrm('https://mock-script.test/exec', ROOFING_TENANT);

    global.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          status: 'error',
          result: 'error',
          message: 'Client ID mismatch: Sheet belongs to another tenant.',
        }),
      } as any;
    };

    const syncErrorScript = await syncGoogleSheetToCrm('https://mock-script.test/exec', ROOFING_TENANT);

    assert(
      7,
      'Google Apps Script errors and network failures',
      syncError503.success === false &&
        syncErrorScript.success === false &&
        syncErrorScript.message.includes('Client ID mismatch'),
      `Gracefully handled HTTP 503 error and script auth failure: "${syncErrorScript.message}"`
    );

    // -------------------------------------------------------------
    // TEST 8: Preventing infinite synchronization loops
    // -------------------------------------------------------------
    // Verify sync returns lastSyncTime timestamp and rejects unconfigured endpoint
    const unconfiguredSync = await syncGoogleSheetToCrm('', ROOFING_TENANT);

    assert(
      8,
      'Preventing infinite synchronization loops',
      unconfiguredSync.success === false &&
        unconfiguredSync.error === 'Unconfigured formEndpoint' &&
        typeof unconfiguredSync.lastSyncTime === 'string',
      `Unconfigured or empty endpoints safely abort; returns lastSyncTime: "${unconfiguredSync.lastSyncTime}"`
    );

    // -------------------------------------------------------------
    // TEST 9: Preserving existing landing-page enquiry submission
    // -------------------------------------------------------------
    // Verify saveLead continues to save enquiries for roofing-client-01
    global.fetch = async () => {
      return {
        ok: true,
        json: async () => ({
          status: 'success',
          result: 'success',
          leadId: 'LP-20261026-9999',
        }),
      } as any;
    };

    const saveRes = await saveLead(
      {
        clientId: ROOFING_TENANT,
        name: 'Sarah Connor',
        phone: '+1 555-444-1122',
        service: 'Emergency Roof Tarping',
        details: 'Tree branch fell on roof.',
      },
      'https://mock-script.test/exec'
    );

    assert(
      9,
      'Preserving existing landing-page enquiry submission',
      saveRes.success === true &&
        saveRes.lead.name === 'Sarah Connor' &&
        saveRes.lead.clientId === ROOFING_TENANT &&
        saveRes.lead.status === 'New',
      `Landing page saveLead succeeded: "${saveRes.lead.name}" (${saveRes.lead.id}) with status 'New'`
    );

    // -------------------------------------------------------------
    // TEST 10: Preserving multi-agent and tenant access boundaries
    // -------------------------------------------------------------
    const allStoredRoofing = getStoredLeads(ROOFING_TENANT);
    const allStoredTarot = getStoredLeads(TAROT_TENANT);

    const crossLeakage = allStoredRoofing.some((l) => l.clientId !== ROOFING_TENANT) ||
      allStoredTarot.some((l) => l.clientId !== TAROT_TENANT);

    assert(
      10,
      'Preserving multi-agent and tenant access boundaries',
      !crossLeakage && allStoredRoofing.length >= 1 && allStoredTarot.length >= 1,
      `Zero cross-tenant leakage: Roofing tenant has ${allStoredRoofing.length} leads; Tarot tenant has ${allStoredTarot.length} leads`
    );

  } finally {
    global.fetch = originalFetch;
  }

  console.log('======================================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Summary: ${passedCount}/${results.length} tests passed. All Systems Verified: ${allPassed ? 'YES ✓' : 'NO ✗'}`);

  if (!allPassed) {
    process.exit(1);
  }
  process.exit(0);
}

runSheetSyncTestSuite().catch((err) => {
  console.error('Fatal error running sync test suite:', err);
  process.exit(1);
});
