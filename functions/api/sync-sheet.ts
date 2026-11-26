/**
 * Cloudflare Pages Function: Secure Google Sheets API Proxy (/api/sync-sheet)
 * 
 * SECURITY ARCHITECTURE:
 * 1. Cryptographic RS256 Firebase ID Token Verification:
 *    - Fetches Google's official public keys from Google's Secure Token JWKS endpoint.
 *    - Verifies cryptographic signature using Web Crypto API (crypto.subtle.verify).
 *    - Validates kid, alg (RS256), iss, aud, sub, exp, iat, and auth_time.
 *    - Tokens accepted strictly via "Authorization: Bearer <token>" header (never request body).
 * 2. Independent Firestore Tenant Membership & Status Verification:
 *    - Uses configured named database (env.FIRESTORE_DATABASE_ID); fails closed if missing.
 *    - Verifies parent tenant status (rejects disabled, inactive, suspended, or archived tenants).
 *    - Verifies member document status (rejects disabled, inactive, suspended, or revoked members).
 *    - Authenticated via caller's verified bearer token (enforcing firestore.rules).
 * 3. Stronger Administrator Identity Verification:
 *    - Bound strictly to server-configured ROOT_ADMIN_UID compared against verified token UID.
 *    - Requires verified Google sign-in provider and verified email.
 *    - Email-only admin matching and browser-supplied admin UIDs are strictly rejected.
 * 4. Server-Authoritative Tenant-Specific Apps Script Credentials:
 *    - Apps Script endpoint URLs and API keys resolved strictly from server-side environment secrets.
 *    - Zero browser credential exposure: body.apiKey is stripped and ignored.
 *    - Zero cross-tenant fallback: ProDrain credentials are never used for other tenants.
 *    - Unconfigured tenants are rejected with HTTP 403.
 * 5. Safe Upstream Proxying:
 *    - Forwards authenticated requests to Google Apps Script Web App with automatic 302 following.
 *    - Sanitizes upstream responses to prevent secret leakage.
 */

export interface ExtendedJsonWebKey extends JsonWebKey {
  kid?: string;
}

export interface CloudflareEnv {
  FIREBASE_PROJECT_ID?: string;
  FIRESTORE_DATABASE_ID?: string;
  ROOT_ADMIN_UID?: string;
  GOOGLE_JWKS_URL?: string;
  TEST_JWK?: ExtendedJsonWebKey;
  TEST_TENANT_MEMBERSHIPS?: Record<string, any>;
  TENANT_CONFIGS_JSON?: string;
  [key: string]: any;
}

export interface PagesContext {
  request: Request;
  env: CloudflareEnv;
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<any>) => void;
  next?: () => Promise<Response>;
}

// CORS Headers
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

// ============================================================================
// 1. Web Crypto & Base64URL Helpers
// ============================================================================

export function base64UrlToUint8Array(base64Url: string): Uint8Array {
  let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binaryStr = atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
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

    const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[0].length / 4) * 4, '=')));
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(parts[1].length / 4) * 4, '=')));

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
// 2. Google Public JWKS Cache & Cryptographic RS256 Verification
// ============================================================================

interface JwksCache {
  keys: Map<string, ExtendedJsonWebKey>;
  expiresAt: number;
}

let memoryJwksCache: JwksCache | null = null;

export async function fetchGoogleJwks(jwksUrl?: string): Promise<Map<string, ExtendedJsonWebKey>> {
  const now = Date.now();
  if (memoryJwksCache && memoryJwksCache.expiresAt > now) {
    return memoryJwksCache.keys;
  }

  const url = jwksUrl || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google public JWKS (HTTP ${res.status}).`);
  }

  let maxAge = 3600; // default 1 hour
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

  memoryJwksCache = {
    keys: keysMap,
    expiresAt: now + maxAge * 1000,
  };

  return keysMap;
}

/**
 * Validate Firebase ID Token claims
 */
export function validateFirebaseTokenClaims(
  payload: any,
  expectedProjectId: string
): { isValid: boolean; error?: string } {
  if (!payload || typeof payload !== 'object') {
    return { isValid: false, error: 'Malformed token payload.' };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // 1. Expiration check (with 30-second leeway)
  if (!payload.exp || typeof payload.exp !== 'number' || payload.exp < nowSec - 30) {
    return { isValid: false, error: 'Firebase authentication token has expired.' };
  }

  // 2. Issued-at check (with 30-second leeway)
  if (payload.iat && typeof payload.iat === 'number' && payload.iat > nowSec + 30) {
    return { isValid: false, error: 'Firebase token issued in the future.' };
  }

  // 3. Auth-time check (with 30-second leeway)
  if (payload.auth_time && typeof payload.auth_time === 'number' && payload.auth_time > nowSec + 30) {
    return { isValid: false, error: 'Firebase authentication time is in the future.' };
  }

  // 4. Issuer check
  const expectedIssuer = `https://securetoken.google.com/${expectedProjectId}`;
  if (payload.iss !== expectedIssuer) {
    return { isValid: false, error: `Invalid token issuer: expected ${expectedIssuer}.` };
  }

  // 5. Audience check
  if (payload.aud !== expectedProjectId) {
    return { isValid: false, error: `Invalid token audience: expected ${expectedProjectId}.` };
  }

  // 6. Subject check (Firebase User UID)
  if (!payload.sub || typeof payload.sub !== 'string' || payload.sub.trim().length === 0) {
    return { isValid: false, error: 'Missing user identifier in token.' };
  }

  return { isValid: true };
}

/**
 * Cryptographically verify Firebase ID token signature and claims
 */
export async function verifyFirebaseIdToken(
  token: string,
  expectedProjectId: string,
  env: CloudflareEnv
): Promise<{ isValid: boolean; payload?: any; error?: string }> {
  const parts = decodeJwtParts(token);
  if (!parts) {
    return { isValid: false, error: 'Malformed or invalid JWT format.' };
  }

  const { header, payload, signature, signedData } = parts;

  // 1. Header validations
  if (!header || typeof header !== 'object') {
    return { isValid: false, error: 'Invalid JWT header.' };
  }
  if (header.alg !== 'RS256') {
    return { isValid: false, error: `Unsupported JWT algorithm: expected RS256, got ${header.alg}.` };
  }
  if (!header.kid || typeof header.kid !== 'string') {
    return { isValid: false, error: 'Missing key ID (kid) in JWT header.' };
  }

  // 2. Resolve JWK public key
  let jwk: ExtendedJsonWebKey | undefined;

  // Support test key injection in isolated unit tests
  if (env.TEST_JWK && env.TEST_JWK.kid === header.kid) {
    jwk = env.TEST_JWK;
  } else {
    try {
      const keysMap = await fetchGoogleJwks(env.GOOGLE_JWKS_URL);
      jwk = keysMap.get(header.kid);
    } catch (err: any) {
      return { isValid: false, error: `Failed to retrieve Google signing keys: ${err?.message || 'Network error'}` };
    }
  }

  if (!jwk) {
    return { isValid: false, error: `Signing key (kid "${header.kid}") not found or rotated.` };
  }

  // 3. Cryptographic RS256 signature verification via Web Crypto API
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
    return { isValid: false, error: `Cryptographic signature verification failed: ${err?.message || 'Crypto error'}` };
  }

  // 4. Claims validation (ONLY evaluated after signature verification succeeds)
  const claimsCheck = validateFirebaseTokenClaims(payload, expectedProjectId);
  if (!claimsCheck.isValid) {
    return { isValid: false, error: claimsCheck.error };
  }

  return { isValid: true, payload };
}

// ============================================================================
// 3. Independent Firestore Tenant Membership & Status Verification
// ============================================================================

export async function verifyFirestoreTenantMembership(
  projectId: string,
  databaseId: string,
  tenantId: string,
  uid: string,
  rawToken: string,
  env: CloudflareEnv
): Promise<{ isMember: boolean; error?: string }> {
  if (!databaseId || !databaseId.trim()) {
    return {
      isMember: false,
      error: 'Server configuration error: FIRESTORE_DATABASE_ID is missing.',
    };
  }

  // Unit test mock support for offline hermetic testing
  if (env.TEST_TENANT_MEMBERSHIPS) {
    const tenantEntry = env.TEST_TENANT_MEMBERSHIPS[tenantId];
    if (!tenantEntry) {
      return { isMember: false, error: `Tenant "${tenantId}" was not found or access is denied.` };
    }

    // Support array of active UIDs: ['user1', 'user2']
    if (Array.isArray(tenantEntry)) {
      const isMember = tenantEntry.includes(uid);
      return {
        isMember,
        error: isMember ? undefined : `Caller UID "${uid}" is not a registered member of tenant "${tenantId}".`,
      };
    }

    // Support structured object: { status, isActive, members: { [uid]: { status, disabled, isActive } } }
    if (typeof tenantEntry === 'object') {
      if (
        tenantEntry.status === 'inactive' ||
        tenantEntry.status === 'disabled' ||
        tenantEntry.status === 'suspended' ||
        tenantEntry.isActive === false
      ) {
        return { isMember: false, error: `Tenant "${tenantId}" is currently inactive or suspended.` };
      }

      const members = tenantEntry.members || {};
      const memberData = members[uid];
      if (!memberData) {
        return { isMember: false, error: `Caller UID "${uid}" is not a registered member of tenant "${tenantId}".` };
      }

      if (
        memberData.status === 'disabled' ||
        memberData.status === 'inactive' ||
        memberData.status === 'suspended' ||
        memberData.status === 'revoked' ||
        memberData.disabled === true ||
        memberData.isActive === false
      ) {
        return { isMember: false, error: `Caller membership in tenant "${tenantId}" is disabled or inactive.` };
      }

      return { isMember: true };
    }
  }

  try {
    // 1. Verify Parent Tenant Document Status
    const tenantUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(databaseId)}/documents/tenants/${encodeURIComponent(tenantId)}`;

    const tenantRes = await fetch(tenantUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'application/json',
      },
    });

    if (tenantRes.status === 404 || tenantRes.status === 403) {
      return { isMember: false, error: `Tenant "${tenantId}" was not found or access is denied.` };
    }

    if (tenantRes.status === 200) {
      const tenantDoc: any = await tenantRes.json();
      const tFields = tenantDoc?.fields || {};
      const tStatus = tFields.status?.stringValue;
      const tActive = tFields.isActive?.booleanValue;
      const tDisabled = tFields.disabled?.booleanValue;

      if (
        (tStatus && ['disabled', 'inactive', 'suspended', 'archived'].includes(tStatus)) ||
        tActive === false ||
        tDisabled === true
      ) {
        return { isMember: false, error: `Tenant "${tenantId}" is currently inactive or suspended.` };
      }
    }

    // 2. Verify Member Document at /tenants/{tenantId}/members/{uid}
    const memberUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      projectId
    )}/databases/${encodeURIComponent(databaseId)}/documents/tenants/${encodeURIComponent(tenantId)}/members/${encodeURIComponent(uid)}`;

    const memberRes = await fetch(memberUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${rawToken}`,
        Accept: 'application/json',
      },
    });

    if (memberRes.status === 404 || memberRes.status === 403) {
      return {
        isMember: false,
        error: `Caller UID "${uid}" does not possess membership in /tenants/${tenantId}/members/${uid}.`,
      };
    }

    if (memberRes.status === 200) {
      const memberDoc: any = await memberRes.json();
      if (!memberDoc || !memberDoc.name) {
        return { isMember: false, error: 'Malformed membership record received from Firestore.' };
      }

      const mFields = memberDoc.fields || {};
      const mStatus = mFields.status?.stringValue;
      const mActive = mFields.isActive?.booleanValue;
      const mDisabled = mFields.disabled?.booleanValue;

      // Reject disabled, inactive, suspended, or revoked members
      if (
        (mStatus && ['disabled', 'inactive', 'suspended', 'revoked'].includes(mStatus)) ||
        mActive === false ||
        mDisabled === true
      ) {
        return { isMember: false, error: `Caller membership in tenant "${tenantId}" is disabled or inactive.` };
      }

      return { isMember: true };
    }

    return {
      isMember: false,
      error: `Firestore membership check returned unexpected HTTP status ${memberRes.status}.`,
    };
  } catch (err: any) {
    return {
      isMember: false,
      error: `Failed to query Firestore membership: ${err?.message || 'Network error'}.`,
    };
  }
}

// ============================================================================
// 4. Strict Server-Authoritative Tenant Apps Script Credential Resolution
// ============================================================================

export interface TenantAppsScriptConfig {
  endpointUrl: string;
  apiKey: string;
}

export function resolveTenantAppsScriptConfig(
  tenantId: string,
  env: CloudflareEnv
): TenantAppsScriptConfig | null {
  const cleanId = tenantId.trim().toLowerCase();

  // 1. Structured JSON configuration binding (e.g. TENANT_CONFIGS_JSON)
  if (env.TENANT_CONFIGS_JSON) {
    try {
      const parsed = typeof env.TENANT_CONFIGS_JSON === 'string'
        ? JSON.parse(env.TENANT_CONFIGS_JSON)
        : env.TENANT_CONFIGS_JSON;
      if (parsed && typeof parsed === 'object' && parsed[cleanId]) {
        const item = parsed[cleanId];
        if (item.endpointUrl && item.apiKey) {
          return {
            endpointUrl: item.endpointUrl.trim(),
            apiKey: item.apiKey.trim(),
          };
        }
      }
    } catch {
      // Ignore JSON parse errors and continue to individual env bindings
    }
  }

  // 2. Tenant-specific environment secret bindings: APPSCRIPT_KEY_<TENANT> and APPSCRIPT_ENDPOINT_<TENANT>
  const envKeySuffix = cleanId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const endpointVar = env[`APPSCRIPT_ENDPOINT_${envKeySuffix}`];
  const keyVar = env[`APPSCRIPT_KEY_${envKeySuffix}`];

  if (endpointVar && keyVar) {
    return {
      endpointUrl: String(endpointVar).trim(),
      apiKey: String(keyVar).trim(),
    };
  }

  // 3. Staging/Demo predefined mappings if explicitly configured in environment
  // Zero default credentials: if an individual key is not bound, return null
  return null;
}

// ============================================================================
// 5. Cloudflare Pages Function Handlers
// ============================================================================

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  // 1. Extract Bearer Token strictly from Authorization header
  const authHeader = request.headers.get('Authorization') || '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(
      { success: false, message: 'Unauthorized: Missing Firebase ID token in Authorization header.' },
      401
    );
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return jsonResponse(
      { success: false, message: 'Unauthorized: Empty Bearer token.' },
      401
    );
  }

  // 2. Parse request body
  let body: any = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return jsonResponse({ success: false, message: 'Invalid JSON request body.' }, 400);
  }

  // Security: Tokens submitted in the request body are strictly rejected
  if (body.idToken) {
    return jsonResponse(
      { success: false, message: 'Security violation: Bearer tokens must be transmitted in Authorization header only.' },
      400
    );
  }

  // 3. Cryptographically verify Firebase ID token
  const expectedProjectId = env.FIREBASE_PROJECT_ID || 'bamboo-tangent-x8gvj';
  const verification = await verifyFirebaseIdToken(token, expectedProjectId, env);

  if (!verification.isValid || !verification.payload) {
    return jsonResponse(
      { success: false, message: `Unauthorized: ${verification.error || 'Token verification failed.'}` },
      401
    );
  }

  const payload = verification.payload;
  const callerUid = payload.sub;
  const callerEmail = (payload.email || '').toLowerCase().trim();

  // Root platform administrator verification:
  // Strict identity gate: Requires explicitly configured ROOT_ADMIN_UID in server secrets.
  // Must match the cryptographically verified token UID, verified Google email, and Google sign-in provider.
  // Browser-supplied UIDs or email-only checks are strictly rejected.
  const configuredAdminUid = env.ROOT_ADMIN_UID ? String(env.ROOT_ADMIN_UID).trim() : '';
  const isRootAdmin = Boolean(
    configuredAdminUid &&
    callerUid === configuredAdminUid &&
    callerEmail === 'mail.nasiya@gmail.com' &&
    payload.email_verified === true &&
    payload.firebase?.sign_in_provider === 'google.com'
  );

  // 4. Validate requested tenant ID
  const requestedClientId = (body.clientId || '').toString().trim().toLowerCase();
  if (!requestedClientId) {
    return jsonResponse({ success: false, message: 'Client ID (clientId) is required for synchronization.' }, 400);
  }

  // 5. Independently verify tenant membership and status (Zero heuristics)
  if (!isRootAdmin) {
    // Verify Firestore database ID is explicitly configured
    const databaseId = env.FIRESTORE_DATABASE_ID ? String(env.FIRESTORE_DATABASE_ID).trim() : '';
    if (!databaseId) {
      return jsonResponse(
        {
          success: false,
          message: 'Server configuration error: FIRESTORE_DATABASE_ID is missing from server environment.',
        },
        500
      );
    }

    const membership = await verifyFirestoreTenantMembership(
      expectedProjectId,
      databaseId,
      requestedClientId,
      callerUid,
      token,
      env
    );

    if (!membership.isMember) {
      return jsonResponse(
        {
          success: false,
          message: `Forbidden: ${membership.error || 'Caller does not possess authorized membership in this tenant.'}`,
        },
        403
      );
    }
  }

  // 6. Server-Authoritative Tenant Apps Script Credential Resolution
  // Private keys and endpoints are never taken from the client
  const tenantConfig = resolveTenantAppsScriptConfig(requestedClientId, env);
  if (!tenantConfig || !tenantConfig.endpointUrl || !tenantConfig.apiKey) {
    return jsonResponse(
      {
        success: false,
        message: `Tenant "${requestedClientId}" Google Apps Script integration is unconfigured or unauthorized on this gateway.`,
      },
      403
    );
  }

  const endpointUrl = tenantConfig.endpointUrl;
  if (!endpointUrl.startsWith('https://script.google.com/macros/s/')) {
    return jsonResponse(
      {
        success: false,
        message: 'Invalid Google Apps Script endpoint URL configured for tenant. Must start with https://script.google.com/macros/s/',
      },
      500
    );
  }

  // 7. Construct Upstream Payload to Google Apps Script
  const action = body.action || 'getLeads';
  const upstreamPayload: Record<string, any> = {
    ...body,
    action,
    clientId: requestedClientId,
    apiKey: tenantConfig.apiKey, // Strictly server-resolved key
    callerUid,
    callerEmail,
  };

  // Ensure client cannot override the API key or pass through internal tokens
  delete upstreamPayload.idToken;

  try {
    const upstreamRes = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(upstreamPayload),
      redirect: 'follow',
    });

    if (!upstreamRes.ok) {
      return jsonResponse(
        {
          success: false,
          message: `Google Apps Script returned upstream HTTP status ${upstreamRes.status}.`,
        },
        502
      );
    }

    let upstreamJson: any = null;
    try {
      upstreamJson = await upstreamRes.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          message: 'Google Apps Script did not return valid JSON.',
        },
        502
      );
    }

    // Sanitize response: Never return any private keys or internal credentials
    if (upstreamJson && typeof upstreamJson === 'object') {
      delete upstreamJson.apiKey;
      delete upstreamJson.token;
    }

    return jsonResponse(upstreamJson, upstreamJson?.status === 'error' ? 400 : 200);
  } catch (err: any) {
    return jsonResponse(
      {
        success: false,
        message: 'Failed to communicate with Google Apps Script Web App backend.',
      },
      502
    );
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method === 'OPTIONS') {
    return onRequestOptions();
  }
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return jsonResponse({ success: false, message: 'Method Not Allowed' }, 405);
}