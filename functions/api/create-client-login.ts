/**
 * Cloudflare Pages Function: Secure Client CRM Owner Login Provisioning (/api/create-client-login)
 *
 * SECURITY ARCHITECTURE:
 * 1. Self-contained Cloudflare Pages Function (zero imports from sibling api/*.ts routes).
 * 2. Cryptographic RS256 Firebase ID Token Verification via Google JWKS + Web Crypto API.
 *    Tokens accepted strictly via "Authorization: Bearer <token>" header (never request body).
 * 3. Server-Authoritative Root Administrator Verification:
 *    - Requires server secret ROOT_ADMIN_UID matching verified token sub (uid)
 *    - Requires verified email 'mail.nasiya@gmail.com' with email_verified === true
 *    - Requires Google Sign-In provider ('google.com')
 * 4. Strict Tenant Validation:
 *    - Verifies /tenants/{tenantId} exists and status === 'active'
 *    - Rejects suspended or missing tenants (never auto-activates suspended tenants)
 *    - Rejects duplicate owner logins on the same tenant
 * 5. Secure User Creation & Password Setup Link via Service Account + Firebase Identity Toolkit Admin API:
 *    - Service account credentials read strictly from server environment secrets
 *      (FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY)
 *    - Rejects emails that already exist in Firebase Auth (HTTP 409) to prevent cross-tenant conflicts
 *    - Creates user in Firebase Auth without a permanent plaintext password
 *    - Writes /users/{uid} (role: 'owner', tenantId) and /tenants/{tenantId}/members/{uid} (role: 'owner')
 *    - Generates a one-time PASSWORD_RESET setup link (returnOobLink: true, no email sent)
 *    - Rolls back created Auth user and Firestore docs cleanly if any downstream step fails
 */

export interface ExtendedJsonWebKey extends JsonWebKey {
  kid?: string;
}

export interface CloudflareEnv {
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_DATABASE_ID?: string;
  ROOT_ADMIN_UID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  GOOGLE_JWKS_URL?: string;
  TEST_JWK?: ExtendedJsonWebKey;
  [key: string]: any;
}

export interface PagesContext {
  request: Request;
  env: CloudflareEnv;
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<any>) => void;
  next?: () => Promise<Response>;
}

export interface ServiceAccountCredentials {
  clientEmail: string;
  privateKeyPem: string;
  projectId?: string;
}

const ROOT_ADMIN_EMAIL = 'mail.nasiya@gmail.com';
const TENANT_ID_REGEX = /^[a-z0-9_-]{1,128}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getCorsHeaders(request?: Request): Record<string, string> {
  const baseHeaders: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };

  if (!request) return baseHeaders;

  const origin = request.headers.get('Origin');
  if (!origin) return baseHeaders;

  try {
    const reqOrigin = new URL(request.url).origin;
    const parsedOrigin = new URL(origin);
    const hostname = parsedOrigin.hostname.toLowerCase();

    const isSameOrigin = origin === reqOrigin;
    const isAllowedStaging =
      parsedOrigin.protocol === 'https:' &&
      (hostname === 'leadpilot-staging.pages.dev' || hostname.endsWith('.leadpilot-staging.pages.dev'));
    const isLocalhost =
      (parsedOrigin.protocol === 'http:' || parsedOrigin.protocol === 'https:') &&
      (hostname === 'localhost' || hostname === '127.0.0.1');

    if (isSameOrigin || isAllowedStaging || isLocalhost) {
      baseHeaders['Access-Control-Allow-Origin'] = origin;
    }
  } catch {
    // Omit Access-Control-Allow-Origin on malformed origin
  }

  return baseHeaders;
}

function jsonResponse(data: any, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...getCorsHeaders(request),
    },
  });
}

// ============================================================================
// 1. Web Crypto, Base64URL & PEM Helpers
// ============================================================================

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function utf8ToBase64Url(input: string): string {
  return bytesToBase64Url(new TextEncoder().encode(input));
}

export function pemToPkcs8Bytes(pem: string): Uint8Array {
  const normalized = pem
    .replace(/\\n/g, '\n')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  if (!normalized) {
    throw new Error('Empty private key PEM.');
  }

  const binaryStr = atob(normalized);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export function decodeJwtParts(token: string): {
  header: any | null;
  payload: any | null;
  signature: string;
  signedData: string;
} | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = JSON.parse(
      atob(parts[0].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[0].length / 4) * 4, '='))
    );
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '='))
    );

    return {
      header,
      payload,
      signature: parts[2],
      signedData: `${parts[0]}.${parts[1]}`,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// 2. Cryptographic Firebase ID Token Verification
// ============================================================================

interface JwksCache {
  keys: Map<string, ExtendedJsonWebKey>;
  expiresAt: number;
}

let memoryJwksCache: JwksCache | null = null;

async function fetchGoogleJwks(
  jwksUrl: string | undefined,
  fetchFn: typeof fetch
): Promise<Map<string, ExtendedJsonWebKey>> {
  const now = Date.now();
  if (!jwksUrl && memoryJwksCache && memoryJwksCache.expiresAt > now) {
    return memoryJwksCache.keys;
  }

  const url =
    jwksUrl || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
  const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google public JWKS (HTTP ${res.status}).`);
  }

  let maxAge = 3600;
  const cacheControl = res.headers.get('Cache-Control') || '';
  const match = cacheControl.match(/max-age=(\d+)/);
  if (match && match[1]) {
    maxAge = parseInt(match[1], 10);
  }

  const data: any = await res.json();
  const keysMap = new Map<string, ExtendedJsonWebKey>();
  if (Array.isArray(data.keys)) {
    for (const key of data.keys) {
      if (key.kid) {
        keysMap.set(key.kid, key);
      }
    }
  }

  if (!jwksUrl) {
    memoryJwksCache = {
      keys: keysMap,
      expiresAt: now + maxAge * 1000,
    };
  }

  return keysMap;
}

export function validateFirebaseTokenClaims(
  payload: any,
  expectedProjectId: string
): { isValid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { isValid: false, error: 'Malformed token payload.' };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  if (!payload.exp || typeof payload.exp !== 'number' || payload.exp < nowSec - 30) {
    return { isValid: false, error: 'Firebase authentication token has expired.' };
  }
  if (payload.iat && typeof payload.iat === 'number' && payload.iat > nowSec + 30) {
    return { isValid: false, error: 'Firebase token issued in the future.' };
  }
  if (payload.auth_time && typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 30) {
    return { isValid: false, error: 'Firebase authentication time is in the future.' };
  }

  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  if (payload.iss !== expectedIssuer) {
    return { isValid: false, error: `Invalid token issuer: expected ${expectedIssuer}.` };
  }
  if (payload.aud !== expectedProjectId) {
    return { isValid: false, error: `Invalid token audience: expected ${expectedProjectId}.` };
  }
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    return { isValid: false, error: 'Missing user identifier in token.' };
  }

  return { isValid: true };
}

export async function verifyFirebaseIdToken(
  token: string,
  expectedProjectId: string,
  env: CloudflareEnv,
  fetchFn: typeof fetch = fetch
): Promise<{ isValid: boolean; payload?: any; error?: string }> {
  const parts = decodeJwtParts(token);
  if (!parts) {
    return { isValid: false, error: 'Malformed or invalid JWT format.' };
  }

  const { header, payload, signature, signedData } = parts;
  if (!header || typeof header !== 'object') {
    return { isValid: false, error: 'Invalid JWT header.' };
  }
  if (header.alg !== 'RS256') {
    return { isValid: false, error: `Unsupported JWT algorithm: expected RS256, got ${header.alg}.` };
  }
  if (!header.kid || typeof header.kid !== 'string') {
    return { isValid: false, error: 'Missing key ID (kid) in JWT header.' };
  }

  let jwk: ExtendedJsonWebKey | undefined;
  if (env.TEST_JWK && env.TEST_JWK.kid === header.kid) {
    jwk = env.TEST_JWK;
  } else {
    try {
      const keysMap = await fetchGoogleJwks(env.GOOGLE_JWKS_URL, fetchFn);
      jwk = keysMap.get(header.kid);
    } catch (err: any) {
      return {
        isValid: false,
        error: `Failed to retrieve Google signing keys: ${err?.message || 'Network error'}`,
      };
    }
  }

  if (!jwk) {
    return { isValid: false, error: `Signing key (kid "${header.kid}") not found or rotated.` };
  }

  try {
    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signedBytes = new TextEncoder().encode(signedData);
    const signatureBytes = base64UrlToUint8Array(signature);

    const isSigValid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      cryptoKey,
      signatureBytes,
      signedBytes
    );

    if (!isSigValid) {
      return { isValid: false, error: 'Invalid cryptographic token signature.' };
    }
  } catch (err: any) {
    return {
      isValid: false,
      error: `Cryptographic signature verification failed: ${err?.message || 'Crypto error'}`,
    };
  }

  const claimsCheck = validateFirebaseTokenClaims(payload, expectedProjectId);
  if (!claimsCheck.isValid) {
    return { isValid: false, error: claimsCheck.error };
  }

  return { isValid: true, payload };
}

// ============================================================================
// 3. Service Account OAuth2 JWT Minting (Web Crypto RS256)
// ============================================================================

export function resolveServiceAccountCredentials(env: CloudflareEnv): ServiceAccountCredentials | null {
  if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed =
        typeof env.FIREBASE_SERVICE_ACCOUNT_JSON === 'string'
          ? JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON)
          : env.FIREBASE_SERVICE_ACCOUNT_JSON;
      const clientEmail = typeof parsed?.client_email === 'string' ? parsed.client_email.trim() : '';
      const privateKeyPem = typeof parsed?.private_key === 'string' ? parsed.private_key : '';
      const projectId = typeof parsed?.project_id === 'string' ? parsed.project_id.trim() : undefined;
      if (clientEmail && privateKeyPem) {
        return { clientEmail, privateKeyPem, projectId };
      }
    } catch {
      return null;
    }
  }

  const clientEmail = typeof env.FIREBASE_CLIENT_EMAIL === 'string' ? env.FIREBASE_CLIENT_EMAIL.trim() : '';
  const privateKeyPem = typeof env.FIREBASE_PRIVATE_KEY === 'string' ? env.FIREBASE_PRIVATE_KEY : '';
  if (clientEmail && privateKeyPem) {
    return { clientEmail, privateKeyPem };
  }

  return null;
}

export async function createServiceAccountJwt(
  credentials: ServiceAccountCredentials,
  scopes = 'https://www.googleapis.com/auth/identitytoolkit'
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: credentials.clientEmail,
    sub: credentials.clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    scope: scopes,
    iat: nowSec,
    exp: nowSec + 3600,
  };

  const signingInput = `${utf8ToBase64Url(JSON.stringify(header))}.${utf8ToBase64Url(JSON.stringify(claimSet))}`;
  const pkcs8Bytes = pemToPkcs8Bytes(credentials.privateKeyPem);

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signatureB64 = bytesToBase64Url(new Uint8Array(signatureBuffer));
  return `${signingInput}.${signatureB64}`;
}

async function fetchGoogleAdminAccessToken(
  credentials: ServiceAccountCredentials,
  fetchFn: typeof fetch
): Promise<string> {
  const assertion = await createServiceAccountJwt(credentials);
  const formBody = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  });

  const tokenRes = await fetchFn('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody.toString(),
  });

  const tokenJson: any = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson?.access_token) {
    throw new Error(
      tokenJson?.error_description || tokenJson?.error || `OAuth2 token exchange failed (HTTP ${tokenRes.status}).`
    );
  }

  return String(tokenJson.access_token);
}

// ============================================================================
// 4. Firestore & Identity Toolkit REST Helpers
// ============================================================================

function parseIdentityToolkitError(data: any, fallback: string): string {
  const rawMessage = data?.error?.message || data?.message || '';
  if (typeof rawMessage === 'string' && rawMessage.trim()) {
    return rawMessage.trim();
  }
  return fallback;
}

function buildContinueUrl(request: Request, tenantId: string): string | undefined {
  const origin = request.headers.get('Origin');
  if (!origin) return undefined;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
      return undefined;
    }
    return `${url.origin}/?target=crm&tenant=${encodeURIComponent(tenantId)}`;
  } catch {
    return undefined;
  }
}

async function rollbackCreatedAccount(params: {
  projectId: string;
  databaseId: string;
  tenantId: string;
  uid: string;
  rawAdminToken: string;
  adminAccessToken: string;
  createdMemberDoc: boolean;
  createdUserDoc: boolean;
  fetchFn: typeof fetch;
}): Promise<void> {
  const {
    projectId,
    databaseId,
    tenantId,
    uid,
    rawAdminToken,
    adminAccessToken,
    createdMemberDoc,
    createdUserDoc,
    fetchFn,
  } = params;

  const baseDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    projectId
  )}/databases/${encodeURIComponent(databaseId)}/documents`;

  if (createdMemberDoc) {
    await fetchFn(
      `${baseDocUrl}/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${rawAdminToken}` },
      }
    ).catch(() => {});
  }

  if (createdUserDoc) {
    await fetchFn(`${baseDocUrl}/users/${encodeURIComponent(uid)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${rawAdminToken}` },
    }).catch(() => {});
  }

  await fetchFn(
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:delete`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ localId: uid }),
    }
  ).catch(() => {});
}

// ============================================================================
// 5. Cloudflare Pages Function Handler
// ============================================================================

export async function onRequestOptions(context: PagesContext): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(context?.request),
  });
}

export async function handleCreateClientLogin(
  context: PagesContext,
  deps?: { fetchFn?: typeof fetch }
): Promise<Response> {
  const { request, env } = context;
  const fetchFn = deps?.fetchFn || fetch;

  // 1. Extract Bearer Token strictly from Authorization header
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(
      { success: false, message: 'Unauthorized: Missing Firebase ID token in Authorization header.' },
      401,
      request
    );
  }
  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) {
    return jsonResponse(
      { success: false, message: 'Unauthorized: Empty Bearer token.' },
      401,
      request
    );
  }

  // 2. Parse request body safely
  let body: any = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return jsonResponse({ success: false, message: 'Invalid JSON request body.' }, 400, request);
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ success: false, message: 'Malformed request body.' }, 400, request);
  }

  if (body.idToken) {
    return jsonResponse(
      { success: false, message: 'Security violation: Bearer tokens must be sent in Authorization header only.' },
      400,
      request
    );
  }

  if (body.password !== undefined) {
    return jsonResponse(
      {
        success: false,
        message: 'Security violation: Permanent passwords cannot be submitted. A secure setup link is generated automatically.',
      },
      400,
      request
    );
  }

  // 3. Cryptographically verify Firebase ID token
  const expectedProjectId = (env.FIREBASE_PROJECT_ID || 'bamboo-tangent-x8gvj').trim();
  const verification = await verifyFirebaseIdToken(rawToken, expectedProjectId, env, fetchFn);
  if (!verification.isValid || !verification.payload) {
    return jsonResponse(
      { success: false, message: `Unauthorized: ${verification.error || 'Token verification failed.'}` },
      401,
      request
    );
  }

  const payload = verification.payload;
  const callerUid = String(payload.sub || '').trim();
  const callerEmail = String(payload.email || '').toLowerCase().trim();

  // 4. Server-authoritative Root Administrator verification (fail-closed)
  const configuredAdminUid = env.ROOT_ADMIN_UID ? String(env.ROOT_ADMIN_UID).trim() : '';
  if (!configuredAdminUid) {
    return jsonResponse(
      {
        success: false,
        code: 'ROOT_ADMIN_UID_MISSING',
        message: 'Server configuration error: ROOT_ADMIN_UID must be configured in Cloudflare Pages secrets.',
      },
      503,
      request
    );
  }

  const isRootAdmin =
    callerUid === configuredAdminUid &&
    callerEmail === ROOT_ADMIN_EMAIL &&
    payload.email_verified === true &&
    payload.firebase?.sign_in_provider === 'google.com';

  if (!isRootAdmin) {
    return jsonResponse(
      {
        success: false,
        message: 'Forbidden: Only the verified Root Administrator may create client CRM logins.',
      },
      403,
      request
    );
  }

  // 5. Validate input fields
  const tenantId = String(body.tenantId || '').trim().toLowerCase();
  const clientName = String(body.clientName || '').trim();
  const clientEmail = String(body.clientEmail || '').trim().toLowerCase();
  const requestedRole = body.role === undefined ? 'business_owner' : String(body.role).trim();

  if (!tenantId || !TENANT_ID_REGEX.test(tenantId)) {
    return jsonResponse({ success: false, message: 'A valid Tenant ID is required.' }, 400, request);
  }
  if (clientName.length < 2 || clientName.length > 100) {
    return jsonResponse(
      { success: false, message: 'Client name must be between 2 and 100 characters.' },
      400,
      request
    );
  }
  if (!clientEmail || clientEmail.length > 150 || !EMAIL_REGEX.test(clientEmail)) {
    return jsonResponse({ success: false, message: 'A valid client email address is required.' }, 400, request);
  }
  if (clientEmail === ROOT_ADMIN_EMAIL) {
    return jsonResponse(
      { success: false, message: 'Root Administrator email cannot be assigned as a client login.' },
      409,
      request
    );
  }
  if (requestedRole !== 'business_owner') {
    return jsonResponse(
      { success: false, message: 'Invalid role: Client CRM logins must use role "business_owner".' },
      400,
      request
    );
  }

  // 6. Verify Firestore configuration & validate tenant existence + active status
  const databaseId = env.FIRESTORE_DATABASE_ID ? String(env.FIRESTORE_DATABASE_ID).trim() : '';
  if (!databaseId) {
    return jsonResponse(
      {
        success: false,
        message: 'Server configuration error: FIRESTORE_DATABASE_ID is missing from server environment.',
      },
      500,
      request
    );
  }

  const firestoreBaseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    expectedProjectId
  )}/databases/${encodeURIComponent(databaseId)}/documents`;

  const tenantRes = await fetchFn(`${firestoreBaseUrl}/tenants/${encodeURIComponent(tenantId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${rawToken}`,
      Accept: 'application/json',
    },
  });

  if (tenantRes.status === 404) {
    return jsonResponse(
      { success: false, message: `Tenant "${tenantId}" does not exist.` },
      404,
      request
    );
  }
  if (!tenantRes.ok) {
    return jsonResponse(
      {
        success: false,
        message: `Failed to verify tenant "${tenantId}" in Firestore (HTTP ${tenantRes.status}).`,
      },
      tenantRes.status === 403 ? 403 : 502,
      request
    );
  }

  const tenantDoc: any = await tenantRes.json().catch(() => ({}));
  const tenantFields = tenantDoc?.fields || {};
  const tenantStatus = String(tenantFields.status?.stringValue || '').trim().toLowerCase();

  if (tenantStatus !== 'active') {
    return jsonResponse(
      {
        success: false,
        message: `Cannot create login: Tenant "${tenantId}" is currently "${tenantStatus || 'inactive'}". Activate the tenant first without auto-activating.`,
      },
      409,
      request
    );
  }

  const businessName = String(
    tenantFields.businessName?.stringValue || tenantFields.name?.stringValue || tenantId
  )
    .trim()
    .slice(0, 150);

  // 7. Check existing tenant members to prevent duplicate owner login on the tenant
  const membersRes = await fetchFn(
    `${firestoreBaseUrl}/tenants/${encodeURIComponent(tenantId)}/members?pageSize=100`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'application/json',
      },
    }
  );

  if (!membersRes.ok) {
    return jsonResponse(
      {
        success: false,
        message: `Could not verify existing tenant members (HTTP ${membersRes.status}).`,
      },
      502,
      request
    );
  }

  const membersData: any = await membersRes.json().catch(() => ({}));
  const existingMembers: any[] = Array.isArray(membersData?.documents) ? membersData.documents : [];
  for (const docItem of existingMembers) {
    const f = docItem?.fields || {};
    const mRole = String(f.role?.stringValue || '').trim().toLowerCase();
    const mEmail = String(f.email?.stringValue || '').trim().toLowerCase();
    if (mRole === 'owner') {
      return jsonResponse(
        {
          success: false,
          code: 'TENANT_OWNER_EXISTS',
          message: `A Business Owner login (${mEmail || 'existing owner'}) is already created for tenant "${tenantId}".`,
        },
        409,
        request
      );
    }
    if (mEmail && mEmail === clientEmail) {
      return jsonResponse(
        {
          success: false,
          code: 'MEMBER_EMAIL_EXISTS',
          message: `Email "${clientEmail}" already has membership in tenant "${tenantId}".`,
        },
        409,
        request
      );
    }
  }

  // 8. Resolve Service Account credentials and mint Google OAuth2 access token
  const serviceAccount = resolveServiceAccountCredentials(env);
  if (!serviceAccount) {
    return jsonResponse(
      {
        success: false,
        code: 'ADMIN_BACKEND_UNCONFIGURED',
        message:
          'Firebase Admin credentials are not configured on the server. Add FIREBASE_SERVICE_ACCOUNT_JSON to Cloudflare Pages environment secrets.',
      },
      503,
      request
    );
  }

  if (serviceAccount.projectId && serviceAccount.projectId !== expectedProjectId) {
    return jsonResponse(
      {
        success: false,
        message: 'Server configuration error: Service account project_id does not match FIREBASE_PROJECT_ID.',
      },
      500,
      request
    );
  }

  let adminAccessToken: string;
  try {
    adminAccessToken = await fetchGoogleAdminAccessToken(serviceAccount, fetchFn);
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        message: `Failed to authenticate Firebase Admin service account: ${err?.message || 'OAuth error'}`,
      },
      502,
      request
    );
  }

  const idpBaseUrl = `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(expectedProjectId)}`;

  // 9. Prevent duplicate or cross-tenant accounts by checking Firebase Auth first
  const lookupRes = await fetchFn(`${idpBaseUrl}/accounts:lookup`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: [clientEmail] }),
  });

  if (!lookupRes.ok) {
    const errJson = await lookupRes.json().catch(() => ({}));
    return jsonResponse(
      {
        success: false,
        message: `Firebase Auth lookup failed: ${parseIdentityToolkitError(errJson, `HTTP ${lookupRes.status}`)}`,
      },
      502,
      request
    );
  }

  const lookupJson: any = await lookupRes.json().catch(() => ({}));
  if (Array.isArray(lookupJson?.users) && lookupJson.users.length > 0) {
    return jsonResponse(
      {
        success: false,
        code: 'EMAIL_ALREADY_EXISTS',
        message: `An account with email "${clientEmail}" already exists in Firebase Authentication. Use a unique email address to avoid duplicate or cross-tenant accounts.`,
      },
      409,
      request
    );
  }

  // 10. Create the client user in Firebase Authentication (no permanent plaintext password)
  const createUserRes = await fetchFn(`${idpBaseUrl}/accounts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminAccessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: clientEmail,
      displayName: clientName,
      emailVerified: false,
      disabled: false,
    }),
  });

  const createUserJson: any = await createUserRes.json().catch(() => ({}));
  if (!createUserRes.ok || !createUserJson?.localId) {
    const errMsg = parseIdentityToolkitError(createUserJson, `HTTP ${createUserRes.status}`);
    const isDuplicate = errMsg.toUpperCase().includes('EMAIL_EXISTS');
    return jsonResponse(
      {
        success: false,
        code: isDuplicate ? 'EMAIL_ALREADY_EXISTS' : 'AUTH_CREATE_FAILED',
        message: isDuplicate
          ? `An account with email "${clientEmail}" already exists in Firebase Authentication.`
          : `Failed to create Firebase Auth user: ${errMsg}`,
      },
      isDuplicate ? 409 : 502,
      request
    );
  }

  const newUid = String(createUserJson.localId).trim();
  const nowIso = new Date().toISOString();
  let createdUserDoc = false;
  let createdMemberDoc = false;

  try {
    // 11a. Store tenantId and role ('owner') in /users/{uid} conforming to firestore.rules isValidUserProfile
    const userWriteRes = await fetchFn(
      `${firestoreBaseUrl}/users?documentId=${encodeURIComponent(newUid)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rawToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            uid: { stringValue: newUid },
            email: { stringValue: clientEmail },
            displayName: { stringValue: clientName },
            businessName: { stringValue: businessName },
            tenantId: { stringValue: tenantId },
            role: { stringValue: 'owner' },
            createdAt: { stringValue: nowIso },
          },
        }),
      }
    );

    if (!userWriteRes.ok) {
      const errBody = await userWriteRes.text().catch(() => '');
      throw new Error(`Failed to write user profile in Firestore (HTTP ${userWriteRes.status}): ${errBody}`);
    }
    createdUserDoc = true;

    // 11b. Store membership in /tenants/{tenantId}/members/{uid} conforming to firestore.rules isValidMemberData
    const memberWriteRes = await fetchFn(
      `${firestoreBaseUrl}/tenants/${encodeURIComponent(tenantId)}/members?documentId=${encodeURIComponent(newUid)}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${rawToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: {
            uid: { stringValue: newUid },
            email: { stringValue: clientEmail },
            role: { stringValue: 'owner' },
            addedAt: { stringValue: nowIso },
          },
        }),
      }
    );

    if (!memberWriteRes.ok) {
      const errBody = await memberWriteRes.text().catch(() => '');
      throw new Error(`Failed to write tenant membership in Firestore (HTTP ${memberWriteRes.status}): ${errBody}`);
    }
    createdMemberDoc = true;

    // 12. Generate a secure one-time password setup link WITHOUT sending email (returnOobLink: true)
    const continueUrl = buildContinueUrl(request, tenantId);
    const oobRequestBody: Record<string, any> = {
      requestType: 'PASSWORD_RESET',
      email: clientEmail,
      returnOobLink: true,
      ...(continueUrl ? { continueUrl } : {}),
    };

    let oobRes = await fetchFn(`${idpBaseUrl}/accounts:sendOobCode`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(oobRequestBody),
    });

    let oobJson: any = await oobRes.json().catch(() => ({}));
    if (
      !oobRes.ok &&
      continueUrl &&
      parseIdentityToolkitError(oobJson, '').toUpperCase().includes('UNAUTHORIZED_DOMAIN')
    ) {
      oobRes = await fetchFn(`${idpBaseUrl}/accounts:sendOobCode`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: clientEmail,
          returnOobLink: true,
        }),
      });
      oobJson = await oobRes.json().catch(() => ({}));
    }

    if (!oobRes.ok || !oobJson?.oobLink) {
      throw new Error(
        `Failed to generate password setup link: ${parseIdentityToolkitError(oobJson, `HTTP ${oobRes.status}`)}`
      );
    }

    return jsonResponse(
      {
        success: true,
        uid: newUid,
        tenantId,
        businessName,
        clientName,
        clientEmail,
        role: 'business_owner',
        firestoreRole: 'owner',
        loginStatus: 'created',
        setupLink: String(oobJson.oobLink),
        emailSent: false,
        message:
          'Client CRM login created. Copy and share the one-time password setup link securely with the business owner.',
      },
      200,
      request
    );
  } catch (err: any) {
    await rollbackCreatedAccount({
      projectId: expectedProjectId,
      databaseId,
      tenantId,
      uid: newUid,
      rawAdminToken: rawToken,
      adminAccessToken,
      createdMemberDoc,
      createdUserDoc,
      fetchFn,
    });

    return jsonResponse(
      {
        success: false,
        message: err?.message || 'Failed to complete client login provisioning; changes were rolled back.',
      },
      502,
      request
    );
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  return handleCreateClientLogin(context);
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method === 'OPTIONS') {
    return onRequestOptions(context);
  }
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return jsonResponse({ success: false, message: 'Method Not Allowed' }, 405, context.request);
}
