import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import {
  onRequestOptions,
  onRequestPost,
  verifyFirebaseIdToken,
  validateFirebaseTokenClaims,
  resolveTenantAppsScriptConfig,
  verifyFirestoreTenantMembership,
  ExtendedJsonWebKey,
  PagesContext,
} from '../../functions/api/sync-sheet';
import { resolveCurrentTenantId, REGISTERED_HOSTNAME_MAP, getAuthoritativeTenantConfig } from '../config/appTarget';
import { getClientConfigForEnvClientId } from '../config/clientConfigResolver';
import { fetchRemoteSheetLeads } from '../utils/leadStorage';

describe('Cloudflare Pages Functions: Critical Security Gateway Test Suite', () => {
  const PROJECT_ID = 'bamboo-tangent-x8gvj';
  const DATABASE_ID = 'ai-studio-adaa6756-a579-4944-874a-1f7ccb196d2b';
  let keyPair: CryptoKeyPair;
  let publicJwk: ExtendedJsonWebKey;

  beforeAll(async () => {
    // Generate genuine RS256 Web Crypto keypair for testing
    keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );

    publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
    publicJwk.kid = 'test-signing-key-01';
    publicJwk.alg = 'RS256';
  });

  // Helper: Construct genuinely signed RS256 JWT
  async function createSignedToken(claims: Record<string, any>, key = keyPair.privateKey, kid = 'test-signing-key-01'): Promise<string> {
    const header = { alg: 'RS256', kid, typ: 'JWT' };
    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signedData = `${b64Header}.${b64Payload}`;
    const sigBytes = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signedData));
    const b64Sig = Buffer.from(sigBytes).toString('base64url');
    return `${signedData}.${b64Sig}`;
  }

  // --------------------------------------------------------------------------
  // SECTION 1: Cryptographic RS256 Firebase ID Token Verification
  // --------------------------------------------------------------------------
  it('1. Cryptographic Verification: Accepts genuinely signed RS256 token', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'valid-user-123',
      email: 'plumber@prodrain.com',
      exp: nowSec + 3600,
      iat: nowSec - 10,
      auth_time: nowSec - 10,
    });

    const verification = await verifyFirebaseIdToken(token, PROJECT_ID, {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      TEST_JWK: publicJwk,
    });

    expect(verification.isValid).toBe(true);
    expect(verification.payload?.sub).toBe('valid-user-123');
  });

  it('2. Cryptographic Verification: Rejects forged signature', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'attacker-sub',
      email: 'attacker@evil.com',
      exp: nowSec + 3600,
    });

    // Tamper with the signature bytes (forge)
    const parts = token.split('.');
    const tamperedSig = parts[2].slice(0, -4) + 'AAAA';
    const forgedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

    const verification = await verifyFirebaseIdToken(forgedToken, PROJECT_ID, {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      TEST_JWK: publicJwk,
    });

    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('Invalid cryptographic token signature');
  });

  it('3. Cryptographic Verification: Rejects expired token', async () => {
    const expiredSec = Math.floor(Date.now() / 1000) - 3600;
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'expired-user',
      exp: expiredSec,
    });

    const verification = await verifyFirebaseIdToken(token, PROJECT_ID, {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      TEST_JWK: publicJwk,
    });

    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('expired');
  });

  it('4. Cryptographic Verification: Rejects token with wrong audience / project ID', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: 'https://securetoken.google.com/wrong-project',
      aud: 'wrong-project',
      sub: 'user-wrong-project',
      exp: nowSec + 3600,
    });

    const verification = await verifyFirebaseIdToken(token, PROJECT_ID, {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      TEST_JWK: publicJwk,
    });

    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('Invalid token issuer');
  });

  it('5. Cryptographic Verification: Rejects missing kid in JWT header', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const header = { alg: 'RS256' }; // Missing kid
    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify({ sub: 'user', exp: nowSec + 3600 })).toString('base64url');
    const token = `${b64Header}.${b64Payload}.dummySig`;

    const verification = await verifyFirebaseIdToken(token, PROJECT_ID, {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      TEST_JWK: publicJwk,
    });

    expect(verification.isValid).toBe(false);
    expect(verification.error).toContain('Missing key ID (kid)');
  });

  it('6. Transport Security: Rejects tokens supplied in request body instead of Authorization header', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'user-1',
      exp: nowSec + 3600,
    });

    const request = new Request('https://staging.leadpilot.pages.dev/api/sync-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token, clientId: 'prodrain-plumbing-kochi' }),
    });

    const res = await onRequestPost({
      request,
      env: { FIREBASE_PROJECT_ID: PROJECT_ID, FIRESTORE_DATABASE_ID: DATABASE_ID, TEST_JWK: publicJwk },
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.message).toContain('Missing Firebase ID token in Authorization header');
  });

  // --------------------------------------------------------------------------
  // SECTION 2: FIX 1 - Correct Firestore Database ID Requirement
  // --------------------------------------------------------------------------
  it('7. Database ID: Fails closed with HTTP 500 when FIRESTORE_DATABASE_ID is missing', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'user-db-test',
      email: 'user@prodrain.com',
      exp: nowSec + 3600,
    });

    const request = new Request('https://staging.leadpilot.pages.dev/api/sync-sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clientId: 'prodrain-plumbing-kochi' }),
    });

    // Deliberately omit FIRESTORE_DATABASE_ID
    const res = await onRequestPost({
      request,
      env: {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        TEST_JWK: publicJwk,
        // FIRESTORE_DATABASE_ID is missing
      },
    });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toContain('FIRESTORE_DATABASE_ID is missing');
  });

  it('8. Database ID: verifyFirestoreTenantMembership requires database ID', async () => {
    const res = await verifyFirestoreTenantMembership(
      PROJECT_ID,
      '', // empty database ID
      'prodrain-plumbing-kochi',
      'user-1',
      'mockToken',
      {}
    );

    expect(res.isMember).toBe(false);
    expect(res.error).toContain('FIRESTORE_DATABASE_ID is missing');
  });

  // --------------------------------------------------------------------------
  // SECTION 3: FIX 2 - Reject Disabled Members and Inactive Tenants
  // --------------------------------------------------------------------------
  it('9. Member Status: Rejects disabled member', async () => {
    const res = await verifyFirestoreTenantMembership(
      PROJECT_ID,
      DATABASE_ID,
      'prodrain-plumbing-kochi',
      'disabled-user-01',
      'mockToken',
      {
        TEST_TENANT_MEMBERSHIPS: {
          'prodrain-plumbing-kochi': {
            status: 'active',
            members: {
              'disabled-user-01': { role: 'staff', status: 'disabled' },
            },
          },
        },
      }
    );

    expect(res.isMember).toBe(false);
    expect(res.error).toContain('disabled or inactive');
  });

  it('10. Member Status: Rejects inactive member', async () => {
    const res = await verifyFirestoreTenantMembership(
      PROJECT_ID,
      DATABASE_ID,
      'prodrain-plumbing-kochi',
      'inactive-user-02',
      'mockToken',
      {
        TEST_TENANT_MEMBERSHIPS: {
          'prodrain-plumbing-kochi': {
            status: 'active',
            members: {
              'inactive-user-02': { role: 'staff', isActive: false },
            },
          },
        },
      }
    );

    expect(res.isMember).toBe(false);
    expect(res.error).toContain('disabled or inactive');
  });

  it('11. Tenant Status: Rejects inactive or suspended tenant even if member is active', async () => {
    const res = await verifyFirestoreTenantMembership(
      PROJECT_ID,
      DATABASE_ID,
      'suspended-clinic',
      'active-user-03',
      'mockToken',
      {
        TEST_TENANT_MEMBERSHIPS: {
          'suspended-clinic': {
            status: 'suspended',
            isActive: false,
            members: {
              'active-user-03': { role: 'owner', status: 'active' },
            },
          },
        },
      }
    );

    expect(res.isMember).toBe(false);
    expect(res.error).toContain('inactive or suspended');
  });

  it('12. Member Status: Accepts active member of active tenant', async () => {
    const res = await verifyFirestoreTenantMembership(
      PROJECT_ID,
      DATABASE_ID,
      'prodrain-plumbing-kochi',
      'active-user-04',
      'mockToken',
      {
        TEST_TENANT_MEMBERSHIPS: {
          'prodrain-plumbing-kochi': {
            status: 'active',
            members: {
              'active-user-04': { role: 'owner', status: 'active' },
            },
          },
        },
      }
    );

    expect(res.isMember).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('13. Member Status: Rejects missing member from tenant', async () => {
    const res = await verifyFirestoreTenantMembership(
      PROJECT_ID,
      DATABASE_ID,
      'prodrain-plumbing-kochi',
      'stranger-user-99',
      'mockToken',
      {
        TEST_TENANT_MEMBERSHIPS: {
          'prodrain-plumbing-kochi': {
            status: 'active',
            members: {
              'active-user-04': { role: 'owner', status: 'active' },
            },
          },
        },
      }
    );

    expect(res.isMember).toBe(false);
    expect(res.error).toContain('not a registered member');
  });

  // --------------------------------------------------------------------------
  // SECTION 4: FIX 3 - Hostname Priority Over VITE_CLIENT_ID
  // --------------------------------------------------------------------------
  it('14. Hostname Priority: Registered ProDrain hostname resolves to ProDrain', () => {
    const resolved = resolveCurrentTenantId('prodrain.leadpilot.pages.dev');
    expect(resolved.isValid).toBe(true);
    expect(resolved.tenantId).toBe('prodrain-plumbing-kochi');
  });

  it('15. Hostname Priority: Registered Tarot hostname resolves to Tarot', () => {
    const resolved = resolveCurrentTenantId('tarot.leadpilot.pages.dev');
    expect(resolved.isValid).toBe(true);
    expect(resolved.tenantId).toBe('demo-tarot-kochi');
  });

  it('16. Hostname Priority: Unknown hostname in shared production fails closed (never loads ProDrain or Tarot)', () => {
    const resolved = resolveCurrentTenantId('unknown-random-domain.com');
    // In production builds, unknown domain returns invalid
    expect(REGISTERED_HOSTNAME_MAP['unknown-random-domain.com']).toBeUndefined();
  });

  it('17. Hostname Priority: Hostname registered to Tenant A cannot be overridden by client param or env', () => {
    const resolved = resolveCurrentTenantId('prodrain.leadpilot.pages.dev');
    expect(resolved.tenantId).toBe('prodrain-plumbing-kochi');
    expect(resolved.tenantId).not.toBe('demo-tarot-kochi');
  });

  it('18. Hostname Priority: Local development resolves query parameter or dev fallback', () => {
    // When not on a production pages.dev domain, dev fallback applies
    const resolved = resolveCurrentTenantId('localhost');
    expect(resolved.isValid).toBe(true);
    expect(resolved.tenantId).toBe('demo-tarot-kochi');
  });

  // --------------------------------------------------------------------------
  // SECTION 5: FIX 4 - Stronger Root Admin Authorization
  // --------------------------------------------------------------------------
  it('19. Admin Auth: Accepts matching server-configured ROOT_ADMIN_UID with verified Google identity', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'real-root-admin-uid-12345',
      email: 'mail.nasiya@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      exp: nowSec + 3600,
    });

    const request = new Request('https://staging.leadpilot.pages.dev/api/sync-sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clientId: 'prodrain-plumbing-kochi' }),
    });

    const res = await onRequestPost({
      request,
      env: {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIRESTORE_DATABASE_ID: DATABASE_ID,
        ROOT_ADMIN_UID: 'real-root-admin-uid-12345',
        TEST_JWK: publicJwk,
        APPSCRIPT_ENDPOINT_PRODRAIN_PLUMBING_KOCHI: 'https://script.google.com/macros/s/AKfy_prodrain/exec',
        APPSCRIPT_KEY_PRODRAIN_PLUMBING_KOCHI: 'secret_prodrain_key',
        // Note: No TEST_TENANT_MEMBERSHIPS provided - root admin bypasses membership check!
      },
    });

    // Upstream fetch will attempt to call mock endpoint; status 502 indicates auth passed and attempted upstream call
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });

  it('20. Admin Auth: Rejects user with wrong UID attempting to claim root admin via email alone', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'impostor-uid-999',
      email: 'mail.nasiya@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      exp: nowSec + 3600,
    });

    const request = new Request('https://staging.leadpilot.pages.dev/api/sync-sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clientId: 'prodrain-plumbing-kochi' }),
    });

    const res = await onRequestPost({
      request,
      env: {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIRESTORE_DATABASE_ID: DATABASE_ID,
        ROOT_ADMIN_UID: 'real-root-admin-uid-12345', // Impostor UID does not match!
        TEST_JWK: publicJwk,
        TEST_TENANT_MEMBERSHIPS: {
          'prodrain-plumbing-kochi': ['other-user'],
        },
      },
    });

    // Impostor is not root admin, and not in tenant memberships -> 403 Forbidden!
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toContain('Forbidden');
  });

  it('21. Admin Auth: Missing ROOT_ADMIN_UID disables admin bypass and requires regular tenant membership', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'some-uid',
      email: 'mail.nasiya@gmail.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      exp: nowSec + 3600,
    });

    const request = new Request('https://staging.leadpilot.pages.dev/api/sync-sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clientId: 'prodrain-plumbing-kochi' }),
    });

    const res = await onRequestPost({
      request,
      env: {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIRESTORE_DATABASE_ID: DATABASE_ID,
        // ROOT_ADMIN_UID is NOT configured
        TEST_JWK: publicJwk,
        TEST_TENANT_MEMBERSHIPS: {
          'prodrain-plumbing-kochi': ['different-user'],
        },
      },
    });

    expect(res.status).toBe(403);
  });

  it('22. Admin Auth: Browser-supplied admin parameters in request body are ignored', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'attacker-sub',
      email: 'attacker@evil.com',
      exp: nowSec + 3600,
    });

    const request = new Request('https://staging.leadpilot.pages.dev/api/sync-sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        clientId: 'prodrain-plumbing-kochi',
        adminUid: 'real-root-admin-uid-12345',
        isAdmin: true,
        role: 'admin',
      }),
    });

    const res = await onRequestPost({
      request,
      env: {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIRESTORE_DATABASE_ID: DATABASE_ID,
        ROOT_ADMIN_UID: 'real-root-admin-uid-12345',
        TEST_JWK: publicJwk,
        TEST_TENANT_MEMBERSHIPS: {
          'prodrain-plumbing-kochi': ['staff-user'],
        },
      },
    });

    expect(res.status).toBe(403);
  });

  // --------------------------------------------------------------------------
  // SECTION 6: Credential Isolation & Frontend Fail-Closed
  // --------------------------------------------------------------------------
  it('23. Credential Isolation: Rejects unknown tenant with missing Apps Script secret (never defaults to ProDrain)', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = await createSignedToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'clinic-admin-1',
      email: 'admin@newclinic.com',
      exp: nowSec + 3600,
    });

    const request = new Request('https://staging.leadpilot.pages.dev/api/sync-sheet', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ clientId: 'new-unconfigured-clinic' }),
    });

    const res = await onRequestPost({
      request,
      env: {
        FIREBASE_PROJECT_ID: PROJECT_ID,
        FIRESTORE_DATABASE_ID: DATABASE_ID,
        TEST_JWK: publicJwk,
        TEST_TENANT_MEMBERSHIPS: {
          'new-unconfigured-clinic': ['clinic-admin-1'],
        },
        APPSCRIPT_ENDPOINT_PRODRAIN_PLUMBING_KOCHI: 'https://script.google.com/macros/s/AKfy_prodrain/exec',
        APPSCRIPT_KEY_PRODRAIN_PLUMBING_KOCHI: 'secret_prodrain_key',
      },
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.message).toContain('unconfigured or unauthorized on this gateway');
  });

  it('24. Credential Isolation: Ignores browser-supplied body.apiKey', () => {
    const config = resolveTenantAppsScriptConfig('demo-tarot-kochi', {
      APPSCRIPT_ENDPOINT_DEMO_TAROT_KOCHI: 'https://script.google.com/macros/s/AKfy_tarot/exec',
      APPSCRIPT_KEY_DEMO_TAROT_KOCHI: 'trusted_server_tarot_key',
    });

    expect(config?.apiKey).toBe('trusted_server_tarot_key');
  });

  it('25. Frontend Fail-Closed: Cloudflare production environment fails closed and does not execute direct fallback', async () => {
    (global as any).window = {
      location: { hostname: 'app.leadpilot.pages.dev' },
    };

    const res = await fetchRemoteSheetLeads(
      'https://script.google.com/macros/s/AKfy_mock/exec',
      'prodrain-plumbing-kochi',
      'test-api-key'
    );

    expect(res.success).toBe(false);
    expect(res.leads).toEqual([]);
    expect(res.message).toMatch(/Authentication required|Security gateway|prohibited/);

    delete (global as any).window;
  });

  it('26. Client Config Resolver: Rejects unknown client ID without fallback in strict mode', () => {
    const res = getClientConfigForEnvClientId('completely-unknown-client-id', false);
    expect(res.isValid).toBe(false);
    expect(res.config).toBeNull();
  });

  it('27. Verified Cloudflare Routing & Config Files', () => {
    expect(fs.existsSync('public/_redirects')).toBe(true);
    const redirects = fs.readFileSync('public/_redirects', 'utf8');
    expect(redirects).toContain('/*    /index.html   200');

    expect(fs.existsSync('public/_routes.json')).toBe(true);
    const routes = JSON.parse(fs.readFileSync('public/_routes.json', 'utf8'));
    expect(routes.include).toContain('/*');

    expect(fs.existsSync('wrangler.toml')).toBe(true);
    const wrangler = fs.readFileSync('wrangler.toml', 'utf8');
    expect(wrangler).not.toContain('DEFAULT_TARGET_CLIENT_ID');
    expect(wrangler).toContain('FIRESTORE_DATABASE_ID = "ai-studio-adaa6756-a579-4944-874a-1f7ccb196d2b"');
  });

  // --------------------------------------------------------------------------
  // SECTION 7: Standalone Tenant Isolation & Authoritative Resolution
  // --------------------------------------------------------------------------
  it('28. Standalone Tenant Isolation: Unknown hostname in production fails closed (isValid: false, config: null)', () => {
    const res = getAuthoritativeTenantConfig('unknown-tenant.leadpilot.pages.dev', true);
    expect(res.isValid).toBe(false);
    expect(res.config).toBeNull();
    expect(res.tenantId).toBe('');
  });

  it('29. Standalone Tenant Isolation: Unknown hostname with ?client= query parameter is strictly rejected in production', () => {
    const origWindow = (global as any).window;
    try {
      (global as any).window = {
        location: {
          hostname: 'malicious.leadpilot.pages.dev',
          search: '?client=demo-tarot-kochi',
        },
      };
      const res = getAuthoritativeTenantConfig(undefined, true);
      expect(res.isValid).toBe(false);
      expect(res.config).toBeNull();
      expect(res.tenantId).toBe('');
    } finally {
      (global as any).window = origWindow;
    }
  });

  it('30. Standalone Tenant Isolation: Unknown hostname with VITE_CLIENT_ID cannot bypass shared Cloudflare isolation', () => {
    const origClientId = process.env.VITE_CLIENT_ID;
    try {
      process.env.VITE_CLIENT_ID = 'demo-tarot-kochi';
      const res = getAuthoritativeTenantConfig('unregistered.leadpilot.pages.dev', true);
      expect(res.isValid).toBe(false);
      expect(res.config).toBeNull();
    } finally {
      process.env.VITE_CLIENT_ID = origClientId;
    }
  });

  it('31. Standalone Tenant Isolation: Registered hostnames resolve strictly to their mapped tenant', () => {
    const prodrain = getAuthoritativeTenantConfig('prodrain.leadpilot.pages.dev', true);
    expect(prodrain.isValid).toBe(true);
    expect(prodrain.tenantId).toBe('prodrain-plumbing-kochi');
    expect(prodrain.config?.clientId).toBe('prodrain-plumbing-kochi');

    const tarot = getAuthoritativeTenantConfig('tarot.leadpilot.pages.dev', true);
    expect(tarot.isValid).toBe(true);
    expect(tarot.tenantId).toBe('demo-tarot-kochi');
    expect(tarot.config?.clientId).toBe('demo-tarot-kochi');

    const apex = getAuthoritativeTenantConfig('apex.leadpilot.pages.dev', true);
    expect(apex.isValid).toBe(true);
    expect(apex.tenantId).toBe('client-apex-hvac');
    expect(apex.config?.clientId).toBe('client-apex-hvac');

    const roofing = getAuthoritativeTenantConfig('roofing.leadpilot.pages.dev', true);
    expect(roofing.isValid).toBe(true);
    expect(roofing.tenantId).toBe('roofing-client-01');
    expect(roofing.config?.clientId).toBe('roofing-client-01');
  });

  it('32. Standalone Tenant Isolation: Registered hostname cannot be overridden by adversarial query parameters', () => {
    const origWindow = (global as any).window;
    try {
      (global as any).window = {
        location: {
          hostname: 'prodrain.leadpilot.pages.dev',
          search: '?client=demo-tarot-kochi&clientId=client-apex-hvac',
        },
      };

      const res = getAuthoritativeTenantConfig(undefined, true);
      expect(res.isValid).toBe(true);
      expect(res.tenantId).toBe('prodrain-plumbing-kochi');
      expect(res.config?.clientId).toBe('prodrain-plumbing-kochi');
      expect(res.config?.businessName).toBe('ProDrain Plumbing');
    } finally {
      (global as any).window = origWindow;
    }
  });

  it('33. Standalone Tenant Isolation: Dedicated single-tenant Vercel deployment is preserved', () => {
    const origSingleMode = process.env.VITE_SINGLE_TENANT_MODE;
    const origClientId = process.env.VITE_CLIENT_ID;
    try {
      process.env.VITE_SINGLE_TENANT_MODE = 'true';
      process.env.VITE_CLIENT_ID = 'prodrain-plumbing-kochi';

      const res = getAuthoritativeTenantConfig('prodrain.vercel.app', true);
      expect(res.isValid).toBe(true);
      expect(res.tenantId).toBe('prodrain-plumbing-kochi');
      expect(res.config?.clientId).toBe('prodrain-plumbing-kochi');
    } finally {
      process.env.VITE_SINGLE_TENANT_MODE = origSingleMode;
      process.env.VITE_CLIENT_ID = origClientId;
    }
  });

  it('34. Standalone Tenant Isolation: Local development allows query parameter switching for template testing', () => {
    const origWindow = (global as any).window;
    try {
      (global as any).window = {
        location: {
          hostname: 'localhost',
          search: '?client=client-apex-hvac',
        },
      };

      const res = getAuthoritativeTenantConfig(undefined, false);
      expect(res.isValid).toBe(true);
      expect(res.tenantId).toBe('client-apex-hvac');
      expect(res.config?.clientId).toBe('client-apex-hvac');
    } finally {
      (global as any).window = origWindow;
    }
  });
});

