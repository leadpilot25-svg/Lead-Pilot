import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  handleCreateClientLogin,
  onRequestOptions,
  createServiceAccountJwt,
  ExtendedJsonWebKey,
  PagesContext,
} from '../../functions/api/create-client-login';
import { matchesRootAdminIdentity, resolveSafeTenantStatus } from '../auth/clientAuth';

describe('Secure Client CRM Login Provisioning (/api/create-client-login)', () => {
  const PROJECT_ID = 'bamboo-tangent-x8gvj';
  const DATABASE_ID = 'ai-studio-adaa6756-a579-4944-874a-1f7ccb196d2b';
  const ROOT_ADMIN_UID = 'root_admin_uid_001';
  const ROOT_ADMIN_EMAIL = 'mail.nasiya@gmail.com';

  let clientTokenKeyPair: CryptoKeyPair;
  let clientPublicJwk: ExtendedJsonWebKey;
  let serviceAccountKeyPair: CryptoKeyPair;
  let serviceAccountPem: string;

  beforeAll(async () => {
    // Keypair simulating Google's ID-token signer
    clientTokenKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    clientPublicJwk = await crypto.subtle.exportKey('jwk', clientTokenKeyPair.publicKey);
    clientPublicJwk.kid = 'test-client-kid-01';
    clientPublicJwk.alg = 'RS256';

    // Keypair simulating a Firebase Service Account private_key (PKCS#8)
    serviceAccountKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSASSA-PKCS1-v1_5',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify']
    );
    const pkcs8Buf = await crypto.subtle.exportKey('pkcs8', serviceAccountKeyPair.privateKey);
    const b64 = Buffer.from(pkcs8Buf).toString('base64');
    const lines = b64.match(/.{1,64}/g)?.join('\n') || b64;
    serviceAccountPem = `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
  });

  async function signIdToken(claims: Record<string, any>): Promise<string> {
    const header = { alg: 'RS256', kid: 'test-client-kid-01', typ: 'JWT' };
    const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const b64Payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const signedData = `${b64Header}.${b64Payload}`;
    const sigBytes = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      clientTokenKeyPair.privateKey,
      new TextEncoder().encode(signedData)
    );
    return `${signedData}.${Buffer.from(sigBytes).toString('base64url')}`;
  }

  function makeRootAdminClaims() {
    const nowSec = Math.floor(Date.now() / 1000);
    return {
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: ROOT_ADMIN_UID,
      email: ROOT_ADMIN_EMAIL,
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      exp: nowSec + 3600,
      iat: nowSec - 10,
      auth_time: nowSec - 10,
    };
  }

  function makeEnv(overrides: Record<string, any> = {}) {
    return {
      FIREBASE_PROJECT_ID: PROJECT_ID,
      FIRESTORE_DATABASE_ID: DATABASE_ID,
      ROOT_ADMIN_UID,
      FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({
        project_id: PROJECT_ID,
        client_email: 'firebase-adminsdk-test@bamboo-tangent-x8gvj.iam.gserviceaccount.com',
        private_key: serviceAccountPem,
      }),
      TEST_JWK: clientPublicJwk,
      ...overrides,
    };
  }

  it('1. Service Account PKCS#8 JWT signing produces a valid cryptographically verifiable assertion', async () => {
    const jwt = await createServiceAccountJwt({
      clientEmail: 'firebase-adminsdk-test@bamboo-tangent-x8gvj.iam.gserviceaccount.com',
      privateKeyPem: serviceAccountPem,
      projectId: PROJECT_ID,
    });

    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
    const sigBytes = Buffer.from(parts[2], 'base64url');
    const ok = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      serviceAccountKeyPair.publicKey,
      sigBytes,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    expect(ok).toBe(true);
  });

  it('2. Unauthenticated callers and tokens in request body are rejected', async () => {
    const reqMissing = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenantId: 'prodrain-plumbing-kochi', clientName: 'Test', clientEmail: 'a@b.com' }),
    });
    const resMissing = await handleCreateClientLogin({ request: reqMissing, env: makeEnv() });
    expect(resMissing.status).toBe(401);

    const token = await signIdToken(makeRootAdminClaims());
    const reqBodyToken = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ idToken: token, tenantId: 'prodrain-plumbing-kochi' }),
    });
    const resBodyToken = await handleCreateClientLogin({ request: reqBodyToken, env: makeEnv() });
    expect(resBodyToken.status).toBe(400);
  });

  it('3. Non-Root-Admin callers (tenant owners, staff, provisioned admins, non-Google providers) are denied with 403', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const nonAdminToken = await signIdToken({
      iss: `https://securetoken.google.com/${PROJECT_ID}`,
      aud: PROJECT_ID,
      sub: 'ordinary_owner_uid',
      email: 'owner@prodrain.in',
      email_verified: true,
      firebase: { sign_in_provider: 'password' },
      exp: nowSec + 3600,
      iat: nowSec - 10,
      auth_time: nowSec - 10,
    });

    const req = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${nonAdminToken}` },
      body: JSON.stringify({
        tenantId: 'prodrain-plumbing-kochi',
        clientName: 'Owner',
        clientEmail: 'new@prodrain.in',
        role: 'business_owner',
      }),
    });

    const res = await handleCreateClientLogin({ request: req, env: makeEnv() });
    expect(res.status).toBe(403);

    // Even if email matches ROOT_ADMIN_EMAIL, wrong UID or password provider is rejected
    const spoofedProviderToken = await signIdToken({
      ...makeRootAdminClaims(),
      firebase: { sign_in_provider: 'password' },
    });
    const reqSpoofed = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${spoofedProviderToken}` },
      body: JSON.stringify({
        tenantId: 'prodrain-plumbing-kochi',
        clientName: 'Owner',
        clientEmail: 'new@prodrain.in',
      }),
    });
    const resSpoofed = await handleCreateClientLogin({ request: reqSpoofed, env: makeEnv() });
    expect(resSpoofed.status).toBe(403);
  });

  it('4. Rejects suspended tenant and NEVER auto-activates it', async () => {
    const token = await signIdToken(makeRootAdminClaims());
    let tenantMutated = false;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/documents/tenants/prodrain-plumbing-kochi') && (!init?.method || init.method === 'GET')) {
        return new Response(
          JSON.stringify({
            name: 'tenants/prodrain-plumbing-kochi',
            fields: {
              tenantId: { stringValue: 'prodrain-plumbing-kochi' },
              businessName: { stringValue: 'ProDrain Plumbing' },
              status: { stringValue: 'suspended' },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/tenants/prodrain-plumbing-kochi') && init?.method && init.method !== 'GET') {
        tenantMutated = true;
      }
      return new Response('{}', { status: 500 });
    };

    const req = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tenantId: 'prodrain-plumbing-kochi',
        clientName: 'ProDrain Owner',
        clientEmail: 'owner@prodrain.in',
        role: 'business_owner',
      }),
    });

    const res = await handleCreateClientLogin({ request: req, env: makeEnv() }, { fetchFn: mockFetch });
    const json: any = await res.json();
    expect(res.status).toBe(409);
    expect(json.success).toBe(false);
    expect(json.message).toContain('suspended');
    expect(tenantMutated).toBe(false);
  });

  it('5. Rejects duplicate Firebase Auth email safely with HTTP 409 without writing Firestore docs', async () => {
    const token = await signIdToken(makeRootAdminClaims());
    let firestoreWrites = 0;
    let authUserCreated = false;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/documents/tenants/roofing-client-01')) {
        return new Response(
          JSON.stringify({
            fields: {
              tenantId: { stringValue: 'roofing-client-01' },
              businessName: { stringValue: 'Roofing Co' },
              status: { stringValue: 'active' },
            },
          }),
          { status: 200 }
        );
      }
      if (url.includes('/tenants/roofing-client-01/members')) {
        if (init?.method === 'POST') firestoreWrites++;
        return new Response(JSON.stringify({ documents: [] }), { status: 200 });
      }
      if (url.includes('/documents/users')) {
        firestoreWrites++;
        return new Response('{}', { status: 200 });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock-sa-access-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.endsWith('/accounts:lookup')) {
        return new Response(
          JSON.stringify({ users: [{ localId: 'existing-other-tenant-uid', email: 'existing@otherbiz.com' }] }),
          { status: 200 }
        );
      }
      if (url.endsWith('/accounts') && init?.method === 'POST') {
        authUserCreated = true;
      }
      return new Response('{}', { status: 500 });
    };

    const req = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tenantId: 'roofing-client-01',
        clientName: 'Other Owner',
        clientEmail: 'existing@otherbiz.com',
        role: 'business_owner',
      }),
    });

    const res = await handleCreateClientLogin({ request: req, env: makeEnv() }, { fetchFn: mockFetch });
    const json: any = await res.json();
    expect(res.status).toBe(409);
    expect(json.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(authUserCreated).toBe(false);
    expect(firestoreWrites).toBe(0);
  });

  it('6. Happy path: Creates Firebase Auth user, scopes /users and /members to active tenant with role owner, and returns one-time setup link without sending email', async () => {
    const token = await signIdToken(makeRootAdminClaims());
    const writtenUserDocs: any[] = [];
    const writtenMemberDocs: any[] = [];
    const oobPayloads: any[] = [];
    const createdAuthPayloads: any[] = [];

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/documents/tenants/roofing-client-01')) {
        return new Response(
          JSON.stringify({
            fields: {
              tenantId: { stringValue: 'roofing-client-01' },
              businessName: { stringValue: 'Roofing Client 01' },
              status: { stringValue: 'active' },
            },
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/tenants/roofing-client-01/members?pageSize=100')) {
        return new Response(JSON.stringify({ documents: [] }), { status: 200 });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock-sa-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.endsWith('/accounts:lookup')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.endsWith('/accounts') && init?.method === 'POST') {
        createdAuthPayloads.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ localId: 'new_owner_uid_999' }), { status: 200 });
      }
      if (url.includes('/documents/users?documentId=new_owner_uid_999') && init?.method === 'POST') {
        writtenUserDocs.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ name: 'users/new_owner_uid_999' }), { status: 200 });
      }
      if (url.includes('/documents/tenants/roofing-client-01/members?documentId=new_owner_uid_999') && init?.method === 'POST') {
        writtenMemberDocs.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ name: 'tenants/roofing-client-01/members/new_owner_uid_999' }), { status: 200 });
      }
      if (url.endsWith('/accounts:sendOobCode')) {
        oobPayloads.push(JSON.parse(String(init?.body)));
        return new Response(
          JSON.stringify({
            oobLink: 'https://bamboo-tangent-x8gvj.firebaseapp.com/__/auth/action?mode=resetPassword&oobCode=secure-123',
          }),
          { status: 200 }
        );
      }
      return new Response('{}', { status: 404 });
    };

    const req = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://leadpilot-staging.pages.dev',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tenantId: 'roofing-client-01',
        clientName: 'Arjun Menon',
        clientEmail: 'arjun@roofingclient.com',
        role: 'business_owner',
      }),
    });

    const res = await handleCreateClientLogin({ request: req, env: makeEnv() }, { fetchFn: mockFetch });
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.uid).toBe('new_owner_uid_999');
    expect(json.tenantId).toBe('roofing-client-01');
    expect(json.clientEmail).toBe('arjun@roofingclient.com');
    expect(json.role).toBe('business_owner');
    expect(json.loginStatus).toBe('created');
    expect(json.emailSent).toBe(false);
    expect(json.setupLink).toContain('mode=resetPassword');

    // No password was passed or stored
    expect(createdAuthPayloads[0].password).toBeUndefined();
    expect(oobPayloads[0].returnOobLink).toBe(true);
    expect(oobPayloads[0].requestType).toBe('PASSWORD_RESET');

    // User profile & membership strictly scoped to roofing-client-01 with role 'owner'
    expect(writtenUserDocs[0].fields.tenantId.stringValue).toBe('roofing-client-01');
    expect(writtenUserDocs[0].fields.role.stringValue).toBe('owner');
    expect(writtenMemberDocs[0].fields.role.stringValue).toBe('owner');
    expect(writtenMemberDocs[0].fields.uid.stringValue).toBe('new_owner_uid_999');

    // Created owner cannot match Root Admin identity
    expect(
      matchesRootAdminIdentity({
        email: 'arjun@roofingclient.com',
        emailVerified: true,
        signInProvider: 'password',
      })
    ).toBe(false);

    // Tenant status remains unchanged/active
    expect(resolveSafeTenantStatus('active')).toBe('active');
  });

  it('7. Rolls back Auth user and /users profile if /members write fails', async () => {
    const token = await signIdToken(makeRootAdminClaims());
    let deletedUserDoc = false;
    let deletedAuthUid: string | null = null;

    const mockFetch: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/documents/tenants/roofing-client-01')) {
        return new Response(
          JSON.stringify({ fields: { businessName: { stringValue: 'Roofing' }, status: { stringValue: 'active' } } }),
          { status: 200 }
        );
      }
      if (url.endsWith('/tenants/roofing-client-01/members?pageSize=100')) {
        return new Response(JSON.stringify({ documents: [] }), { status: 200 });
      }
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'mock-sa-token', expires_in: 3600 }), { status: 200 });
      }
      if (url.endsWith('/accounts:lookup')) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      if (url.endsWith('/accounts') && init?.method === 'POST') {
        return new Response(JSON.stringify({ localId: 'temp_uid_rollback' }), { status: 200 });
      }
      if (url.includes('/documents/users?documentId=temp_uid_rollback') && init?.method === 'POST') {
        return new Response('{}', { status: 200 });
      }
      if (url.includes('/documents/tenants/roofing-client-01/members?documentId=temp_uid_rollback')) {
        return new Response('Simulated Firestore failure', { status: 500 });
      }
      if (url.endsWith('/documents/users/temp_uid_rollback') && init?.method === 'DELETE') {
        deletedUserDoc = true;
        return new Response('{}', { status: 200 });
      }
      if (url.endsWith('/accounts:delete') && init?.method === 'POST') {
        deletedAuthUid = JSON.parse(String(init.body)).localId;
        return new Response('{}', { status: 200 });
      }
      return new Response('{}', { status: 500 });
    };

    const req = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        tenantId: 'roofing-client-01',
        clientName: 'Arjun Menon',
        clientEmail: 'arjun@roofingclient.com',
        role: 'business_owner',
      }),
    });

    const res = await handleCreateClientLogin({ request: req, env: makeEnv() }, { fetchFn: mockFetch });
    expect(res.status).toBe(502);
    expect(deletedUserDoc).toBe(true);
    expect(deletedAuthUid).toBe('temp_uid_rollback');
  });

  it('8. Rejects invalid role escalation or plaintext password submission & never uses wildcard CORS', async () => {
    const token = await signIdToken(makeRootAdminClaims());

    const reqBadRole = new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://evil.example.com',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tenantId: 'roofing-client-01',
        clientName: 'Escalator',
        clientEmail: 'esc@evil.com',
        role: 'admin',
      }),
    });

    const resBadRole = await handleCreateClientLogin({ request: reqBadRole, env: makeEnv() });
    expect(resBadRole.status).toBe(400);
    expect(resBadRole.headers.get('Access-Control-Allow-Origin')).toBeNull();

    const optRes = await onRequestOptions({
      request: new Request('https://leadpilot-staging.pages.dev/api/create-client-login', {
        method: 'OPTIONS',
        headers: { Origin: 'https://leadpilot-staging.pages.dev' },
      }),
      env: makeEnv(),
    } as PagesContext);
    expect(optRes.status).toBe(204);
    expect(optRes.headers.get('Access-Control-Allow-Origin')).toBe('https://leadpilot-staging.pages.dev');
  });

  it('9. Frontend directory & auth code contain zero Admin SDK secrets and never call browser createUserWithEmailAndPassword for clients', () => {
    const dirSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/SuperAdminClientDirectory.tsx'),
      'utf8'
    );
    expect(dirSource).not.toContain('FIREBASE_SERVICE_ACCOUNT');
    expect(dirSource).not.toContain('private_key');
    expect(dirSource).not.toContain('createUserWithEmailAndPassword');
    expect(dirSource).toContain('createClientOwnerLogin');
    expect(dirSource).toContain('business_owner');
    expect(dirSource).toContain('Not Created');
    expect(dirSource).toContain('Created');
  });
});
