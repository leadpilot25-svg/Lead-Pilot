/**
 * Google Apps Script Web App Security Verification Suite (Vitest)
 *
 * Verifies security policies in google-apps-script/Code.gs, src/utils/leadStorage.ts,
 * and src/presets/clientPresets.ts:
 *
 * 1. Health check disclosures: testConnection does not expose spreadsheetName or leadCount.
 * 2. Zero-Trust GET lead retrieval: Requires matching API_KEY from Script Properties.
 * 3. Zero-Trust POST lead retrieval: Enforces strict API_KEY check.
 * 4. Mutation protection: Modifications/deletions require valid API_KEY.
 * 5. Tenant isolation: TARGET_CLIENT_ID defaults to 'prodrain-plumbing-kochi' and rejects mismatches.
 * 6. Public lead creation: Validates contact details without requiring private API key.
 * 7. Formula injection prevention: Sanitizes inputs starting with =, +, -, @.
 * 8. Spam honeypot trap: Intercepts automated submissions.
 * 9. Error stack trace suppression: Returns generic errors without exposing internal traces.
 * 10. Tarot tenant isolation: demo-tarot-kochi preset remains completely intact and separate.
 * 11. Frontend transport security: leadStorage.ts does not leak apiKey in URL search params.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Google Apps Script Security & Tenant Isolation Suite', () => {
  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const leadStoragePath = path.resolve(process.cwd(), 'src/utils/leadStorage.ts');
  const presetsPath = path.resolve(process.cwd(), 'src/presets/clientPresets.ts');

  const codeGs = fs.readFileSync(codeGsPath, 'utf8');
  const leadStorage = fs.readFileSync(leadStoragePath, 'utf8');
  const presets = fs.readFileSync(presetsPath, 'utf8');

  it('1. Health Check Guard: testConnection does not disclose spreadsheetName or lead count', () => {
    const testConnectionBlock = codeGs.match(/action\s*===\s*["']testConnection["'][\s\S]*?return\s+responseJSON\([\s\S]*?\);/);
    expect(testConnectionBlock).not.toBeNull();
    const blockText = testConnectionBlock![0];
    expect(blockText).not.toContain('spreadsheetName');
    expect(blockText).not.toContain('tabName');
    expect(blockText).not.toContain('leadCount');
    expect(blockText).toContain('success');
  });

  it('2. Zero-Trust GET Authentication: GET getLeads strictly requires configured API_KEY', () => {
    expect(codeGs).toContain('handleGetLeads(sheet, ss, params)');
    expect(codeGs).toContain("scriptProps.getProperty('API_KEY')");
    expect(codeGs).toContain('callerToken !== configuredApiKey.trim()');
    expect(codeGs).toContain('Unauthorized: Missing or invalid API key for lead retrieval.');
  });

  it('3. Zero-Trust POST Authentication: POST getLeads strictly requires configured API_KEY', () => {
    expect(codeGs).toContain('if (action === "getLeads")');
    expect(codeGs).toContain('return handleGetLeads(sheet, ss, data);');
  });

  it('4. Mutation Authorization Guard: Mutations require valid API_KEY', () => {
    expect(codeGs).toContain('if (action !== "createLead")');
    expect(codeGs).toContain('callerToken !== configuredApiKey.trim()');
    expect(codeGs).toContain('Unauthorized: Modifying or deleting customer records requires valid API key authentication.');
  });

  it('5. Tenant Target Client ID Enforcement: Default is prodrain-plumbing-kochi and rejects mismatches', () => {
    expect(codeGs).toContain("DEFAULT_TARGET_CLIENT_ID = 'prodrain-plumbing-kochi'");
    expect(codeGs).toContain('targetClientId !== clientId');
    expect(codeGs).toContain('Client ID mismatch');
  });

  it('6. Public Lead Creation Data Quality: Enforces name or phone length check without requiring API key', () => {
    expect(codeGs).toContain('rawName.length < 2 && phoneDigits.length < 5');
    expect(codeGs).toContain('Invalid submission: A valid contact name or phone number is required.');
  });

  it('7. Formula Injection Prevention: Escapes dangerous leading characters (=, +, -, @)', () => {
    expect(codeGs).toContain('function sanitizeFormulaPrefix(val)');
    expect(codeGs).toContain("str[0] === '=' || str[0] === '+' || str[0] === '-' || str[0] === '@'");
    expect(codeGs).toContain('sanitizeFormulaPrefix(data.id');
  });

  it('8. Anti-Spam Honeypot Trap: Intercepts automated bot submissions', () => {
    expect(codeGs).toContain('data.website_hp || data.company_url || data.fax_number');
    expect(codeGs).toContain('Enquiry received.');
  });

  it('9. Error Handling: Catches exceptions and suppresses internal stack traces', () => {
    expect(codeGs).not.toContain('err.toString()');
    expect(codeGs).toContain('An internal error occurred');
  });

  it('10. Tarot Client Independence: demo-tarot-kochi configuration is untouched and isolated', () => {
    expect(presets).toContain("clientId: 'demo-tarot-kochi'");
    expect(presets).toContain("businessName: 'Tarot Coaching & Guidance'");
    expect(presets).toContain("'demo-tarot-kochi': DEMO_CLIENT_CONFIG");
  });

  it('11. Frontend Transport Security: fetchRemoteSheetLeads never sends apiKey in URL query parameters', () => {
    const setsApiKeyInUrl = /url\.searchParams\.set\(["']apiKey["']/i.test(leadStorage);
    expect(setsApiKeyInUrl).toBe(false);
    expect(leadStorage).toContain("action: 'getLeads'");
    expect(leadStorage).toContain('apiKey: apiKey.trim()');
  });
});
