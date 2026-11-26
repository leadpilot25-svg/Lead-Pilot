import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import vm from 'vm';
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

interface MockSheetState {
  name: string;
  rows: any[][];
  formats: Record<string, string>;
  maxRows?: number;
}

function createGasHarness(opts: {
  scriptProps?: Record<string, string>;
  activeSpreadsheet?: { id: string; name: string; sheets: MockSheetState[] } | null;
  spreadsheetsById?: Record<string, { id: string; name: string; sheets: MockSheetState[] }>;
  onFlush?: () => void;
}) {
  const gsCode = fs.readFileSync(path.resolve(process.cwd(), 'google-apps-script/Code.gs'), 'utf8');
  const logs: Array<{ level: 'log' | 'warn' | 'error'; args: any[] }> = [];
  let flushCount = 0;

  function wrapSheet(state: MockSheetState) {
    const ensureGrid = (rowCount: number, colCount: number) => {
      while (state.rows.length < rowCount) {
        state.rows.push([]);
      }
      for (let r = 0; r < state.rows.length; r++) {
        while (state.rows[r].length < colCount) {
          state.rows[r].push('');
        }
      }
    };

    const getLastRow = () => {
      for (let r = state.rows.length - 1; r >= 0; r--) {
        const row = state.rows[r] || [];
        if (row.some((v) => v !== '' && v !== null && v !== undefined)) {
          return r + 1;
        }
      }
      return 0;
    };

    const getLastColumn = () => {
      let maxCol = 0;
      for (let r = 0; r < state.rows.length; r++) {
        const row = state.rows[r] || [];
        for (let c = row.length - 1; c >= 0; c--) {
          if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
            maxCol = Math.max(maxCol, c + 1);
            break;
          }
        }
      }
      return maxCol;
    };

    const makeRange = (rowStart: number, colStart: number, numRows = 1, numCols = 1) => ({
      getValues() {
        ensureGrid(rowStart - 1 + numRows, colStart - 1 + numCols);
        const out: any[][] = [];
        for (let r = 0; r < numRows; r++) {
          const rowSlice: any[] = [];
          for (let c = 0; c < numCols; c++) {
            rowSlice.push(state.rows[rowStart - 1 + r][colStart - 1 + c]);
          }
          out.push(rowSlice);
        }
        return out;
      },
      setValues(vals: any[][]) {
        ensureGrid(rowStart - 1 + vals.length, colStart - 1 + (vals[0]?.length || numCols));
        for (let r = 0; r < vals.length; r++) {
          for (let c = 0; c < vals[r].length; c++) {
            state.rows[rowStart - 1 + r][colStart - 1 + c] = vals[r][c];
          }
        }
        return this;
      },
      getValue() {
        ensureGrid(rowStart, colStart);
        return state.rows[rowStart - 1][colStart - 1];
      },
      setValue(val: any) {
        ensureGrid(rowStart, colStart);
        state.rows[rowStart - 1][colStart - 1] = val;
        return this;
      },
      setNumberFormat(fmt: string) {
        for (let r = 0; r < numRows; r++) {
          for (let c = 0; c < numCols; c++) {
            state.formats[`${rowStart + r}:${colStart + c}`] = fmt;
          }
        }
        return this;
      },
      setFontWeight() { return this; },
      setBackground() { return this; },
      setFontColor() { return this; },
    });

    return {
      getName: () => state.name,
      setName: (n: string) => { state.name = n; },
      getLastRow,
      getLastColumn,
      getMaxRows: () => Math.max(state.maxRows || 100, state.rows.length),
      getDataRange: () => {
        const lr = Math.max(getLastRow(), 1);
        const lc = Math.max(getLastColumn(), 1);
        return makeRange(1, 1, lr, lc);
      },
      getRange: makeRange,
      appendRow: (rowVals: any[]) => {
        const nextIdx = getLastRow();
        while (state.rows.length <= nextIdx) {
          state.rows.push([]);
        }
        state.rows[nextIdx] = [...rowVals];
      },
      deleteRow: (rowNum: number) => {
        if (rowNum >= 1 && rowNum <= state.rows.length) {
          state.rows.splice(rowNum - 1, 1);
        }
      },
    };
  }

  function wrapSpreadsheet(ssConfig: { id: string; name: string; sheets: MockSheetState[] }) {
    return {
      getId: () => ssConfig.id,
      getName: () => ssConfig.name,
      getSheets: () => ssConfig.sheets.map(wrapSheet),
      getSheetByName: (name: string) => {
        const found = ssConfig.sheets.find((s) => s.name === name);
        return found ? wrapSheet(found) : null;
      },
      insertSheet: (name: string) => {
        const created: MockSheetState = { name, rows: [], formats: {} };
        ssConfig.sheets.push(created);
        return wrapSheet(created);
      },
    };
  }

  const sandbox: any = {
    console: {
      log: (...args: any[]) => logs.push({ level: 'log', args }),
      warn: (...args: any[]) => logs.push({ level: 'warn', args }),
      error: (...args: any[]) => logs.push({ level: 'error', args }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k: string) => (opts.scriptProps && k in opts.scriptProps ? opts.scriptProps[k] : null),
      }),
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => {},
        releaseLock: () => {},
      }),
    },
    SpreadsheetApp: {
      getActiveSpreadsheet: () =>
        opts.activeSpreadsheet ? wrapSpreadsheet(opts.activeSpreadsheet) : null,
      openById: (id: string) => {
        const target = opts.spreadsheetsById?.[id];
        if (!target) throw new Error(`Spreadsheet not found for id: ${id}`);
        return wrapSpreadsheet(target);
      },
      flush: () => {
        flushCount++;
        opts.onFlush?.();
      },
    },
    ContentService: {
      MimeType: { JSON: 'JSON', TEXT: 'TEXT' },
      createTextOutput: (txt: string) => ({
        _txt: txt,
        setMimeType() { return this; },
        getContent: () => txt,
      }),
    },
    Utilities: {
      formatDate: () => '20261125',
      getUuid: () => 'abcd1234-5678-90ef-ghij-klmnopqrstuv',
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(gsCode, sandbox);

  return {
    doPost: (payload: Record<string, any>) => {
      const out = sandbox.doPost({
        postData: { contents: JSON.stringify(payload) },
        parameter: {},
      });
      return JSON.parse(out.getContent());
    },
    logs,
    getFlushCount: () => flushCount,
  };
}

describe('Google Apps Script doPost write-path diagnostics & fixes (roofing-client-01)', () => {
  it('writes roofing-client-01 website enquiry to existing Leads tab even with quoted Script Property & logs non-PII diagnostics only', () => {
    const leadsSheet: MockSheetState = {
      name: 'Leads',
      rows: [
        [
          'Lead ID', 'Timestamp', 'Client ID', 'Business Name',
          'Name', 'Phone', 'Service', 'Details', 'Address',
          'Lead Source', 'Page URL', 'Status', 'Notes', 'Follow-up Date',
        ],
      ],
      formats: {},
    };
    const harness = createGasHarness({
      scriptProps: {
        TARGET_CLIENT_ID: ' "roofing-client-01" ',
        API_KEY: 'super-secret-api-key-999',
      },
      activeSpreadsheet: {
        id: 'sheet-roofing-test-01',
        name: 'LeadPilot Roofing Test',
        sheets: [leadsSheet],
      },
    });

    const response = harness.doPost({
      action: 'createLead',
      id: 'LP-20261125-7777',
      clientId: 'roofing-client-01',
      businessName: 'Test Client',
      name: 'Alex Morgan',
      phone: '+1 (555) 234-9876',
      email: 'alex.morgan@example.com',
      service: 'Roof Replacement',
      details: 'Storm shingle damage on west slope',
      address: '742 Evergreen Ave, Dallas, TX',
      leadSource: 'Landing Page Enquiry (Website)',
      pageUrl: 'https://leadpilot-staging.pages.dev/',
    });

    expect(response.status).toBe('success');
    expect(response.clientId).toBe('roofing-client-01');
    expect(harness.getFlushCount()).toBe(1);
    expect(leadsSheet.rows.length).toBe(2);
    expect(leadsSheet.rows[1][0]).toBe('LP-20261125-7777');
    expect(leadsSheet.rows[1][2]).toBe('roofing-client-01');
    expect(leadsSheet.rows[1][4]).toBe('Alex Morgan');
    expect(leadsSheet.rows[1][5]).toBe('+1 (555) 234-9876');
    expect(leadsSheet.formats['2:6']).toBe('@');

    const serializedLogs = JSON.stringify(harness.logs);
    expect(serializedLogs).toContain('LeadPilot Roofing Test');
    expect(serializedLogs).toContain('sheet-roofing-test-01');
    expect(serializedLogs).toContain('createLead succeeded');
    expect(serializedLogs).not.toContain('super-secret-api-key-999');
    expect(serializedLogs).not.toContain('Alex Morgan');
    expect(serializedLogs).not.toContain('+1 (555) 234-9876');
    expect(serializedLogs).not.toContain('alex.morgan@example.com');
  });

  it('writes into row 2 when Leads tab has trailing pre-formatted/checkbox rows, case-insensitive tab name, or blank Row 1', () => {
    const checkboxesBelow: any[][] = [
      ['', '', '', '', '', '', '', '', '', '', '', '', '', ''], // blank formatted Row 1
      [false, '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [false, '', '', '', '', '', '', '', '', '', '', '', '', ''],
      [false, '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ];
    const leadsSheet: MockSheetState = {
      name: 'leads ',
      rows: checkboxesBelow,
      formats: {},
    };

    const harness = createGasHarness({
      scriptProps: { TARGET_CLIENT_ID: 'roofing-client-01' },
      activeSpreadsheet: {
        id: 'sheet-roofing-test-02',
        name: 'LeadPilot Roofing Test',
        sheets: [leadsSheet],
      },
    });

    const response = harness.doPost({
      action: 'createLead',
      clientId: 'roofing-client-01',
      name: 'Priya Nair',
      phone: '+1 555 888 1234',
      service: 'Emergency Roof Leak Repair',
    });

    expect(response.status).toBe('success');
    expect(leadsSheet.rows[0][0]).toBe('Lead ID');
    expect(leadsSheet.rows[0][4]).toBe('Name');
    // Must overwrite blank checkbox Row 2 (index 1) rather than appending to row 5
    expect(leadsSheet.rows[1][2]).toBe('roofing-client-01');
    expect(leadsSheet.rows[1][4]).toBe('Priya Nair');
  });

  it('resolves TARGET_SPREADSHEET_ID from full Google Sheets URL when standalone script has null getActiveSpreadsheet()', () => {
    const leadsSheet: MockSheetState = { name: 'Leads', rows: [], formats: {} };
    const harness = createGasHarness({
      scriptProps: {
        TARGET_CLIENT_ID: 'roofing-client-01',
        TARGET_SPREADSHEET_ID: 'https://docs.google.com/spreadsheets/d/1AbC_RoofingSheetId123/edit#gid=0',
      },
      activeSpreadsheet: null,
      spreadsheetsById: {
        '1AbC_RoofingSheetId123': {
          id: '1AbC_RoofingSheetId123',
          name: 'LeadPilot Roofing Test',
          sheets: [leadsSheet],
        },
      },
    });

    const response = harness.doPost({
      action: 'createLead',
      clientId: 'roofing-client-01',
      name: 'Jordan Lee',
      phone: '+1 555 901 2233',
      service: 'Metal Roofing Quote',
    });

    expect(response.status).toBe('success');
    expect(response.writeVerified).toBe(true);
    expect(response.rowNumber).toBe(2);
    expect(leadsSheet.rows.length).toBe(2);
    expect(leadsSheet.rows[1][4]).toBe('Jordan Lee');
  });

  it('enforces tenant isolation when TARGET_CLIENT_ID belongs to a different tenant without writing a row', () => {
    const leadsSheet: MockSheetState = { name: 'Leads', rows: [], formats: {} };
    const harness = createGasHarness({
      scriptProps: { TARGET_CLIENT_ID: 'prodrain-plumbing-kochi' },
      activeSpreadsheet: {
        id: 'sheet-prodrain',
        name: 'ProDrain Sheet',
        sheets: [leadsSheet],
      },
    });

    const response = harness.doPost({
      action: 'createLead',
      clientId: 'roofing-client-01',
      name: 'Cross Tenant Test',
      phone: '+1 555 000 1111',
      service: 'Roof Inspection',
    });

    expect(response.status).toBe('error');
    expect(response.message).toContain('prodrain-plumbing-kochi');
    // Only header row initialized; no cross-tenant lead row written
    expect(leadsSheet.rows.length).toBe(1);
    expect(JSON.stringify(harness.logs)).toContain('tenant mismatch');
  });

  it('fails closed when post-flush row verification finds an empty written row', () => {
    const leadsSheet: MockSheetState = {
      name: 'Leads',
      rows: [
        [
          'Lead ID', 'Timestamp', 'Client ID', 'Business Name',
          'Name', 'Phone', 'Service', 'Details', 'Address',
          'Lead Source', 'Page URL', 'Status', 'Notes', 'Follow-up Date',
        ],
      ],
      formats: {},
    };
    const harness = createGasHarness({
      scriptProps: { TARGET_CLIENT_ID: 'roofing-client-01' },
      activeSpreadsheet: {
        id: 'sheet-wipe-test',
        name: 'LeadPilot Roofing Test',
        sheets: [leadsSheet],
      },
      onFlush: () => {
        // Simulate unpersisted row write after SpreadsheetApp.flush()
        if (leadsSheet.rows.length > 1) {
          leadsSheet.rows[1] = leadsSheet.rows[1].map(() => '');
        }
      },
    });

    const response = harness.doPost({
      action: 'createLead',
      clientId: 'roofing-client-01',
      name: 'Wipe Test',
      phone: '+1 555 000 9999',
      service: 'Roof Repair',
    });

    expect(response.status).toBe('error');
    expect(response.writeVerified).toBe(false);
    expect(response.message).toContain('could not be verified');
  });
});

