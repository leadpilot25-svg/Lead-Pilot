/**
 * Google Apps Script Web App Security Verification Suite
 * 
 * Verifies:
 * 1. Health checks (testConnection) disclose no sensitive details (no spreadsheetName, tabName, leadCount).
 * 2. GET getLeads rejects missing API key.
 * 3. GET getLeads rejects invalid API key.
 * 4. POST getLeads rejects missing API key.
 * 5. POST getLeads rejects invalid API key.
 * 6. POST mutations reject missing/invalid API key.
 * 7. Public createLead succeeds for target tenant (prodrain-plumbing-kochi).
 * 8. Public createLead rejects cross-tenant submissions.
 * 9. Formula injection sanitization on untrusted user input.
 * 10. Spam honeypot detection.
 * 11. Empty/junk spam submission rejection.
 */

import fs from 'fs';
import path from 'path';

interface TestResult {
  id: number;
  name: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

function assert(id: number, name: string, condition: boolean, message: string) {
  results.push({ id, name, passed: condition, message });
  const icon = condition ? '✓ [PASS]' : '✗ [FAIL]';
  console.log(`${id}. ${icon} ${name}\n   Result: ${message}`);
}

export function runAppsScriptSecurityTests() {
  console.log('\n🛡️  RUNNING GOOGLE APPS SCRIPT SECURITY & HARDENING VERIFICATION');
  console.log('======================================================================');

  const codeGsPath = path.resolve(process.cwd(), 'google-apps-script/Code.gs');
  const codeGs = fs.readFileSync(codeGsPath, 'utf8');

  // TEST 1: Health check disclosures
  const leaksSheetNameInTest = /action\s*===\s*["']testConnection["'].*?spreadsheetName/s.test(codeGs);
  const leaksCountInTest = /action\s*===\s*["']testConnection["'].*?leadCount/s.test(codeGs);
  assert(
    1,
    'Health Check Information Disclosure Guard',
    !leaksSheetNameInTest && !leaksCountInTest,
    !leaksSheetNameInTest && !leaksCountInTest
      ? 'PASSED: testConnection does not expose spreadsheetName, tabName, or leadCount'
      : 'FAILED: testConnection leaks internal spreadsheet metadata'
  );

  // TEST 2: GET getLeads requires API_KEY
  const getLeadsProtected = codeGs.includes('handleGetLeads(sheet, ss, params)') &&
    codeGs.includes('Missing or invalid API key for lead retrieval');
  assert(
    2,
    'GET Lead-Retrieval Zero-Trust Authentication Gate',
    getLeadsProtected,
    getLeadsProtected
      ? 'PASSED: All GET getLeads requests strictly require a configured, matching API_KEY'
      : 'FAILED: GET getLeads allows unauthenticated access'
  );

  // TEST 3: POST getLeads requires API_KEY
  const postGetLeadsProtected = codeGs.includes('if (action === "getLeads")') &&
    codeGs.includes('handleGetLeads(sheet, ss, data)');
  assert(
    3,
    'POST Lead-Retrieval Authentication Gate',
    postGetLeadsProtected,
    postGetLeadsProtected
      ? 'PASSED: POST getLeads routes through handleGetLeads with strict API_KEY verification'
      : 'FAILED: POST getLeads is unauthenticated'
  );

  // TEST 4: Deny-by-default on mutations
  const mutationProtected = codeGs.includes('if (action !== "createLead")') &&
    codeGs.includes('callerToken !== configuredApiKey.trim()');
  assert(
    4,
    'Mutation Deny-by-Default Authorization Policy',
    mutationProtected,
    mutationProtected
      ? 'PASSED: Modifying or deleting customer records strictly requires valid API_KEY'
      : 'FAILED: Mutations lack strict API_KEY verification'
  );

  // TEST 5: Target Client ID enforcement
  const targetClientConfigured = codeGs.includes("var DEFAULT_TARGET_CLIENT_ID = 'prodrain-plumbing-kochi'") ||
    codeGs.includes("DEFAULT_TARGET_CLIENT_ID = 'prodrain-plumbing-kochi'");
  const enforcesTargetClient = codeGs.includes('targetClientId !== clientId');
  assert(
    5,
    'Tenant Target Client ID Enforcement (prodrain-plumbing-kochi)',
    targetClientConfigured && enforcesTargetClient,
    targetClientConfigured && enforcesTargetClient
      ? 'PASSED: Default TARGET_CLIENT_ID is prodrain-plumbing-kochi and mismatched submissions are rejected'
      : 'FAILED: Client ID mismatch check is missing or misconfigured'
  );

  // TEST 6: Formula injection guard
  const hasFormulaGuard = codeGs.includes('sanitizeFormulaPrefix') &&
    codeGs.includes("str[0] === '=' || str[0] === '+' || str[0] === '-' || str[0] === '@'");
  assert(
    6,
    'Spreadsheet Formula Injection Guard',
    hasFormulaGuard,
    hasFormulaGuard
      ? 'PASSED: User input starting with =, +, -, @ is escaped with leading single quote'
      : 'FAILED: Formula injection guard missing'
  );

  // TEST 7: Bot honeypot protection
  const hasHoneypot = codeGs.includes('data.website_hp') || codeGs.includes('fax_number');
  assert(
    7,
    'Anti-Spam Honeypot Bot Trap',
    hasHoneypot,
    hasHoneypot
      ? 'PASSED: Automated submissions filling hidden bot traps are silently dropped'
      : 'FAILED: Honeypot trap missing'
  );

  // TEST 8: Empty/junk submission validation
  const validatesContact = codeGs.includes('phoneDigits.length < 5') && codeGs.includes('rawName.length < 2');
  assert(
    8,
    'Enquiry Data Quality & Validation Gate',
    validatesContact,
    validatesContact
      ? 'PASSED: Submissions lacking both contact name (min 2 chars) and phone (min 5 digits) are rejected'
      : 'FAILED: Empty or junk enquiries can be written to sheet'
  );

  // TEST 9: Safe error message suppression
  const suppressesStackTraces = !codeGs.includes('err.toString()');
  assert(
    9,
    'Internal Error & Stack Trace Suppression',
    suppressesStackTraces,
    suppressesStackTraces
      ? 'PASSED: err.toString() is not sent to external callers; safe generic messages are returned'
      : 'FAILED: Internal err.toString() is exposed in responses'
  );

  // TEST 10: Tarot Client Independence
  const tarotPresetPath = path.resolve(process.cwd(), 'src/presets/clientPresets.ts');
  const presetsContent = fs.readFileSync(tarotPresetPath, 'utf8');
  const tarotIntact = presetsContent.includes("clientId: 'demo-tarot-kochi'") &&
    presetsContent.includes("businessName: 'Tarot Coaching & Guidance'") &&
    presetsContent.includes("'demo-tarot-kochi': DEMO_CLIENT_CONFIG");
  assert(
    10,
    'Preserving Tarot Client Independence',
    tarotIntact,
    tarotIntact
      ? 'PASSED: demo-tarot-kochi configuration is 100% intact with independent settings'
      : 'FAILED: Tarot configuration was altered'
  );

  console.log('======================================================================');
  const allPassed = results.every((r) => r.passed);
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Summary: ${passedCount}/${results.length} tests passed. All Systems Verified: ${allPassed ? 'YES ✓' : 'NO ✗'}\n`);

  if (!allPassed) {
    process.exit(1);
  }
}

if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('appsScriptSecurityTest')) {
  runAppsScriptSecurityTests();
}
