/**
 * Client CRM Authentication & Tenant Session Management
 * 
 * Powered by Firebase Authentication and Firestore Security Rules.
 * Guarantees cryptographic verification of user identity and strict tenant boundary isolation.
 * Demo credentials and master passphrases have been purged from production.
 */

import {
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  runTransaction,
  writeBatch,
  Timestamp,
  serverTimestamp,
  deleteDoc,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { CURRENT_APP_TARGET, IS_DEV_DEPLOYMENT } from '../config/appTarget';
import { TenantRecord, TenantStatus, ClientConfig, SlugMapping } from '../types';

export interface ClientUser {
  userId: string;
  email: string;
  clientId: string;
  businessName: string;
  role: 'client_admin' | 'client_staff';
  createdAt: string;
}

// Memory cache for active session
let activeSessionUser: ClientUser | null = null;

// Standard tenant metadata map for initial tenant assignment
export const TENANT_METADATA_MAP: Record<string, { businessName: string; industry: string }> = {
  'demo-tarot-kochi': {
    businessName: 'Tarot Coaching & Guidance',
    industry: 'tarot',
  },
  'demo-tarot': {
    businessName: 'Tarot Coaching & Guidance',
    industry: 'tarot',
  },
  'client-apex-hvac': {
    businessName: 'Apex Heating & Cooling',
    industry: 'hvac',
  },
  'roofing-client-01': {
    businessName: 'Test Client',
    industry: 'roofing',
  },
  'demo-roofing': {
    businessName: 'Test Client',
    industry: 'roofing',
  },
  'demo-hvac': {
    businessName: 'Apex Heating & Cooling',
    industry: 'hvac',
  },
  'prodrain-plumbing-kochi': {
    businessName: 'ProDrain Plumbing',
    industry: 'plumbing',
  },
  'demo-plumbing': {
    businessName: 'ProDrain Plumbing',
    industry: 'plumbing',
  },
  'demo-physio': {
    businessName: 'Apex Physiotherapy Clinic',
    industry: 'clinic',
  },
  'demo-clinic': {
    businessName: 'Clinical Healthcare & Aesthetics',
    industry: 'clinic',
  },
  'demo-realestate': {
    businessName: 'Vanguard Realty Group',
    industry: 'real-estate',
  },
  'demo-recruitment': {
    businessName: 'Nexus Talent & Executive Search',
    industry: 'recruitment',
  },
  'demo-skin-clinic': {
    businessName: 'GlowAura Skin & Aesthetic Clinic [Example]',
    industry: 'clinic',
  },
  'demo-local-service': {
    businessName: 'PrimePoint Local Home Services [Example]',
    industry: 'general-business',
  },
  'demo-general': {
    businessName: 'PrimePoint Local Home Services [Example]',
    industry: 'general-business',
  },
};

/**
 * Determine tenant ID for a user from their email or profile
 */
export function inferTenantFromEmail(email: string): string {
  const clean = (email || '').toLowerCase().trim();
  if (clean.includes('tarot')) return 'demo-tarot-kochi';
  if (clean.includes('roofing') || clean.includes('roof')) return 'roofing-client-01';
  if (clean.includes('hvac')) return 'client-apex-hvac';
  if (clean.includes('plumb') || clean.includes('prodrain')) return 'prodrain-plumbing-kochi';
  if (clean.includes('physio') || clean.includes('clinic')) return 'demo-clinic';
  if (clean.includes('real') || clean.includes('realty')) return 'demo-realestate';
  if (clean.includes('recruit') || clean.includes('talent')) return 'demo-recruitment';
  
  // Generic fallback slug from email domain/username
  const parts = clean.split('@');
  const slug = (parts[0] || 'client').replace(/[^a-z0-9_-]/g, '-').slice(0, 30);
  return `client-${slug}`;
}

/**
 * Fetch or bootstrap user profile document in Firestore
 */
export async function getOrProvisionUserProfile(user: FirebaseUser, desiredTenantId?: string): Promise<ClientUser> {
  const userRef = doc(db, 'users', user.uid);
  let tenantId = desiredTenantId || '';
  let businessName = 'Business Client Portal';
  let role: 'client_admin' | 'client_staff' = 'client_admin';

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      // Existing user: load securely provisioned tenant assignment and role from profile
      const data = snap.data();
      tenantId = data.tenantId || '';
      const rawRole = (data.role || '').toString().toLowerCase().trim();
      role =
        rawRole === 'owner' || rawRole === 'admin' || rawRole === 'client_admin'
          ? 'client_admin'
          : 'client_staff';
      businessName = data.businessName || TENANT_METADATA_MAP[tenantId]?.businessName || businessName;
      // Note: No redundant background writes to /members or /tenants during existing user sessions
    } else {
      // First-time sign-in: write initial baseline profile conforming to zero-trust rules
      // (Non-admin users cannot self-assign privileged roles or arbitrary tenant IDs)
      tenantId = '';
      role = 'client_staff';
      const newUserData = {
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || user.email?.split('@')[0] || 'Client User',
        tenantId: '',
        businessName: 'Unassigned Client Portal',
        role: 'unassigned',
        createdAt: new Date().toISOString(),
      };

      try {
        await setDoc(userRef, newUserData);
      } catch (writeErr) {
        console.warn('Note: Could not create user profile document:', writeErr);
      }
    }
  } catch (err) {
    console.warn('Reading user profile from Firestore:', err);
  }

  const clientUser: ClientUser = {
    userId: user.uid,
    email: user.email || '',
    clientId: tenantId,
    businessName,
    role,
    createdAt: new Date().toISOString(),
  };

  activeSessionUser = clientUser;
  return clientUser;
}

/**
 * Get active client session ONLY after real Firestore user profile resolution.
 * Never guesses tenantId or role from an email address.
 */
export function getCurrentClientSession(): ClientUser | null {
  return activeSessionUser;
}

/**
 * Listen to Firebase Auth state changes
 */
export function onClientAuthStateChanged(callback: (user: ClientUser | null) => void): () => void {
  return onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser) {
      try {
        const user = await getOrProvisionUserProfile(fbUser);
        activeSessionUser = user;
        callback(user);
      } catch {
        activeSessionUser = null;
        callback(null);
      }
    } else {
      activeSessionUser = null;
      callback(null);
    }
    window.dispatchEvent(new Event('leadpilot_auth_changed'));
  });
}

/**
 * Authenticate client with Firebase Email and Password
 */
export async function loginClient(
  identifier: string,
  password: string,
  tenantScope?: string
): Promise<{ success: boolean; user?: ClientUser; error?: string }> {
  const cleanId = (identifier || '').trim();
  const cleanPass = (password || '').trim();

  if (!cleanId || !cleanPass) {
    return { success: false, error: 'Please enter your email and password.' };
  }

  // Format email if username/clientId was provided
  const email = cleanId.includes('@') ? cleanId.toLowerCase() : `${cleanId.toLowerCase()}@leadpilotcrm.internal`;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, cleanPass);
    const clientUser = await getOrProvisionUserProfile(cred.user, tenantScope);
    activeSessionUser = clientUser;
    window.dispatchEvent(new Event('leadpilot_auth_changed'));
    return { success: true, user: clientUser };
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
      // In development mode only, facilitate test-user auto-provisioning for testing
      if (IS_DEV_DEPLOYMENT) {
        try {
          const newCred = await createUserWithEmailAndPassword(auth, email, cleanPass);
          const clientUser = await getOrProvisionUserProfile(newCred.user, tenantScope);
          activeSessionUser = clientUser;
          window.dispatchEvent(new Event('leadpilot_auth_changed'));
          return { success: true, user: clientUser };
        } catch (createErr: any) {
          return { success: false, error: createErr?.message || 'Authentication failed' };
        }
      }
      return { success: false, error: 'Invalid email or password. Please verify your credentials.' };
    }
    if (code === 'auth/wrong-password') {
      return { success: false, error: 'Incorrect password. Please try again.' };
    }
    if (code === 'auth/too-many-requests') {
      return { success: false, error: 'Access temporarily disabled due to many failed attempts. Try again later.' };
    }
    return { success: false, error: err?.message || 'Authentication failed. Please verify your credentials.' };
  }
}

/**
 * Authenticate client using Firebase Google Sign-In Popup
 */
export async function loginWithGoogle(
  desiredTenantId?: string
): Promise<{ success: boolean; user?: ClientUser; error?: string }> {
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const cred = await signInWithPopup(auth, provider);
    const clientUser = await getOrProvisionUserProfile(cred.user, desiredTenantId);
    activeSessionUser = clientUser;
    window.dispatchEvent(new Event('leadpilot_auth_changed'));
    return { success: true, user: clientUser };
  } catch (err: any) {
    console.error('Google Sign-In error:', err);
    return { success: false, error: err?.message || 'Google Sign-In failed or popup was closed.' };
  }
}

/**
 * Register / Create a new client tenant account
 */
export async function registerClient(
  email: string,
  password: string,
  _tenantId?: string,
  _businessName?: string
): Promise<{ success: boolean; user?: ClientUser; error?: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const cleanPass = password.trim();

  if (!cleanEmail || !cleanPass || cleanPass.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters.' };
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, cleanEmail, cleanPass);
    // Secure bootstrap: Creates initial user profile with role: 'unassigned' and tenantId: ''
    // Conforms strictly to zero-trust Firestore rules (non-admins cannot self-assign owner roles or tenant IDs)
    const clientUser = await getOrProvisionUserProfile(cred.user);
    activeSessionUser = clientUser;
    window.dispatchEvent(new Event('leadpilot_auth_changed'));
    return {
      success: true,
      user: clientUser,
      error: 'Account registered. Tenant assignment and owner activation must be provisioned by the platform administrator.',
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Registration failed.' };
  }
}

/**
 * Secure Logout
 */
export async function logoutClient(): Promise<void> {
  activeSessionUser = null;
  try {
    await signOut(auth);
  } catch (err) {
    console.error('Sign out error:', err);
  }
  window.dispatchEvent(new Event('leadpilot_auth_changed'));
}

export const ROOT_ADMIN_EMAIL = 'mail.nasiya@gmail.com';

export interface AdminCapabilities {
  isRootAdmin: boolean;
  isAdmin: boolean;
}

/**
 * Pure helper evaluating whether Firebase auth attributes satisfy Root Admin requirements
 * matching firestore.rules isRootAdmin():
 * - exact email 'mail.nasiya@gmail.com'
 * - emailVerified === true
 * - signInProvider === 'google.com'
 */
export function matchesRootAdminIdentity(params: {
  email?: string | null;
  emailVerified?: boolean;
  signInProvider?: string | null;
  providerIds?: string[];
}): boolean {
  const cleanEmail = (params.email || '').toLowerCase().trim();
  if (cleanEmail !== ROOT_ADMIN_EMAIL) return false;
  if (params.emailVerified !== true) return false;

  if (params.signInProvider !== undefined && params.signInProvider !== null) {
    return params.signInProvider === 'google.com';
  }
  return Array.isArray(params.providerIds) && params.providerIds.includes('google.com');
}

/**
 * Server-side verification separating Root Admin vs Provisioned Admin capabilities.
 * - isRootAdmin: strictly requires verified mail.nasiya@gmail.com signed in via google.com
 * - isAdmin: isRootAdmin OR provisioned document in /admins/{uid}
 */
export async function verifyServerAdminCapabilities(
  user: FirebaseUser | null
): Promise<AdminCapabilities> {
  if (!user) {
    return { isRootAdmin: false, isAdmin: false };
  }

  let signInProvider: string | null = null;
  if (typeof (user as any).getIdTokenResult === 'function') {
    try {
      const tokenResult = await (user as any).getIdTokenResult();
      signInProvider = tokenResult?.signInProvider || null;
    } catch {
      signInProvider = null;
    }
  }

  const providerIds = Array.isArray(user.providerData)
    ? user.providerData.map((p) => p?.providerId).filter((id): id is string => Boolean(id))
    : [];

  if (
    matchesRootAdminIdentity({
      email: user.email,
      emailVerified: user.emailVerified,
      signInProvider,
      providerIds,
    })
  ) {
    return { isRootAdmin: true, isAdmin: true };
  }

  // Provisioned administrator lookup in /admins/{uid}
  try {
    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    if (adminDoc.exists()) {
      return { isRootAdmin: false, isAdmin: true };
    }
  } catch {
    return { isRootAdmin: false, isAdmin: false };
  }

  return { isRootAdmin: false, isAdmin: false };
}

/**
 * Strictly verify Root Administrator status (mail.nasiya@gmail.com + verified + google.com).
 */
export async function verifyRootAdminStatus(user: FirebaseUser | null): Promise<boolean> {
  const caps = await verifyServerAdminCapabilities(user);
  return caps.isRootAdmin;
}

/**
 * Server-side verification of platform administrator permissions (Root Admin OR provisioned /admins/{uid}).
 * Preserved for existing callers that check general admin capability.
 */
export async function verifyServerAdminStatus(user: FirebaseUser | null): Promise<boolean> {
  const caps = await verifyServerAdminCapabilities(user);
  return caps.isAdmin;
}

/**
 * Helper to safely resolve tenant status with fail-closed security.
 * Missing, null, or unexpected status values are NEVER treated as active.
 * Only exact string 'active' is active; everything else is treated as 'suspended'.
 */
export function resolveSafeTenantStatus(rawStatus: any): TenantStatus {
  if (rawStatus === 'active') {
    return 'active';
  }
  return 'suspended';
}

/**
 * Retrieve tenant account metadata from /tenants/{tenantId}
 * Fail-closed: missing, null, or unexpected status is never treated as active.
 */
export async function getTenantRecord(tenantId: string): Promise<TenantRecord | null> {
  const cleanTenant = (tenantId || '').trim().toLowerCase();
  if (!cleanTenant) return null;

  try {
    const snap = await getDoc(doc(db, 'tenants', cleanTenant));
    if (!snap.exists()) return null;
    const data = snap.data();
    return {
      tenantId: data.id || data.tenantId || cleanTenant,
      businessName: data.name || data.businessName || cleanTenant,
      industry: data.industry || 'general-business',
      status: resolveSafeTenantStatus(data.status),
      isPublished: Boolean(data.isPublished),
      ownerEmail: data.ownerEmail || '',
      slug: data.slug || '',
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt,
    };
  } catch (err) {
    console.warn(`Could not read tenant metadata for ${cleanTenant}:`, err);
    return null;
  }
}

/**
 * List all registered tenant accounts from /tenants (Administrator only)
 * Fail-closed: missing, null, or unexpected status is never treated as active.
 */
export async function listTenantRecords(): Promise<TenantRecord[]> {
  try {
    const snap = await getDocs(collection(db, 'tenants'));
    const list: TenantRecord[] = [];
    snap.forEach((d) => {
      const data = d.data();
      list.push({
        tenantId: data.id || data.tenantId || d.id,
        businessName: data.name || data.businessName || d.id,
        industry: data.industry || 'general-business',
        status: resolveSafeTenantStatus(data.status),
        isPublished: Boolean(data.isPublished),
        ownerEmail: data.ownerEmail || '',
        slug: data.slug || '',
        createdAt: data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt,
      });
    });
    return list;
  } catch (err) {
    console.warn('Could not list tenant records:', err);
    return [];
  }
}

/**
 * Create or provision a tenant account in Firestore under /tenants/{tenantId} (Administrator only)
 * Uses runTransaction() to guarantee atomic creation:
 * - Reads document inside the transaction
 * - If document exists, rejects creation immediately
 * - If not, writes the new record within the same transaction
 * - Preserves existing administrator authorization through Firestore rules
 */
export async function createTenantRecord(
  tenant: Omit<TenantRecord, 'createdAt' | 'updatedAt'>
): Promise<{ success: boolean; tenant?: TenantRecord; error?: string }> {
  const cleanId = (tenant.tenantId || '').trim().toLowerCase();
  if (!cleanId) {
    return { success: false, error: 'Tenant ID is required.' };
  }

  let normalizedSlug = '';
  if (tenant.slug && tenant.slug.trim()) {
    const slugCheck = validateAndNormalizeSlug(tenant.slug);
    if (!slugCheck.isValid) {
      return { success: false, error: slugCheck.error || 'Invalid URL slug.' };
    }
    normalizedSlug = slugCheck.normalizedSlug;
  }

  const timestamp = new Date().toISOString();
  const safeStatus = resolveSafeTenantStatus(tenant.status);
  const newRecord: TenantRecord = {
    tenantId: cleanId,
    businessName: tenant.businessName.trim(),
    industry: tenant.industry.trim() || 'general-business',
    status: safeStatus,
    isPublished: Boolean(tenant.isPublished),
    ownerEmail: tenant.ownerEmail ? tenant.ownerEmail.trim().toLowerCase() : '',
    ...(normalizedSlug ? { slug: normalizedSlug } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  try {
    const tenantDocRef = doc(db, 'tenants', cleanId);
    const slugDocRef = normalizedSlug ? doc(db, 'slugs', normalizedSlug) : null;

    const result = await runTransaction(db, async (transaction) => {
      const existingSnap = await transaction.get(tenantDocRef);
      const existingSlugSnap = slugDocRef ? await transaction.get(slugDocRef) : null;

      if (existingSnap.exists()) {
        throw new Error(`Tenant "${cleanId}" already exists. Duplicate tenant creation rejected.`);
      }

      if (existingSlugSnap && existingSlugSnap.exists()) {
        throw new Error(
          `Slug "${normalizedSlug}" is already registered to "${existingSlugSnap.data()?.tenantId}". Choose a different public URL slug.`
        );
      }

      const payload: Record<string, any> = {
        id: cleanId,
        tenantId: cleanId,
        name: newRecord.businessName,
        businessName: newRecord.businessName,
        industry: newRecord.industry,
        status: newRecord.status,
        isPublished: newRecord.isPublished,
        ownerEmail: newRecord.ownerEmail,
        createdAt: newRecord.createdAt,
        updatedAt: newRecord.updatedAt,
      };
      if (normalizedSlug) {
        payload.slug = normalizedSlug;
      }

      transaction.set(tenantDocRef, payload);

      if (slugDocRef && normalizedSlug) {
        transaction.set(slugDocRef, {
          slug: normalizedSlug,
          tenantId: cleanId,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
      }

      return newRecord;
    });

    return { success: true, tenant: result };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create tenant record in Firestore.' };
  }
}

/**
 * Update tenant status (active | suspended) in Firestore (Administrator only)
 */
export async function updateTenantStatus(
  tenantId: string,
  status: TenantStatus
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, error: 'Tenant ID is required.' };

  const timestamp = new Date().toISOString();
  try {
    const tenantRef = doc(db, 'tenants', cleanId);
    await setDoc(tenantRef, { status, updatedAt: timestamp }, { merge: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update tenant status.' };
  }
}

/**
 * Update tenant publish state in Firestore (Administrator only)
 */
export async function updateTenantPublishState(
  tenantId: string,
  isPublished: boolean
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, error: 'Tenant ID is required.' };

  const timestamp = new Date().toISOString();
  try {
    const tenantRef = doc(db, 'tenants', cleanId);
    await setDoc(tenantRef, { isPublished, updatedAt: timestamp }, { merge: true });

    // Keep public website document in sync if present
    const websiteRef = doc(db, 'tenants', cleanId, 'public', 'website');
    await setDoc(websiteRef, { isPublished, updatedAt: timestamp }, { merge: true });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update publication state.' };
  }
}

/**
 * Save in-progress website working draft at /tenants/{tenantId}/private/websiteDraft (Root Admin only)
 * CRITICAL REQUIREMENT: This writes ONLY to the private draft document.
 * The live public document at /tenants/{tenantId}/public/website is NEVER touched.
 */
export async function saveTenantWebsiteDraft(
  tenantId: string,
  config: Partial<ClientConfig>
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, error: 'Tenant ID is required.' };

  const timestamp = new Date().toISOString();
  try {
    const draftRef = doc(db, 'tenants', cleanId, 'private', 'websiteDraft');
    const payload = {
      tenantId: cleanId,
      businessName: config.businessName || cleanId,
      updatedAt: timestamp,
      config: JSON.parse(JSON.stringify(config)),
    };
    await setDoc(draftRef, payload, { merge: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save website draft.' };
  }
}

/**
 * Load website configuration for editing (Root Admin only):
 * 1. Checks /tenants/{tenantId}/private/websiteDraft first.
 * 2. If missing, falls back to the existing live /tenants/{tenantId}/public/website.
 * 3. Does NOT modify the live website during loading.
 */
export async function fetchTenantWebsiteDraft(
  tenantId: string
): Promise<{
  success: boolean;
  config: Partial<ClientConfig> | null;
  source: 'draft' | 'public' | 'none';
  isPublished: boolean;
  error?: string;
}> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, config: null, source: 'none', isPublished: false, error: 'Invalid tenant ID' };

  try {
    // 1. Check private working draft
    const draftRef = doc(db, 'tenants', cleanId, 'private', 'websiteDraft');
    const draftSnap = await getDoc(draftRef);
    if (draftSnap.exists() && draftSnap.data()?.config) {
      // Also check tenant's published flag
      const tenantRec = await getTenantRecord(cleanId);
      return {
        success: true,
        config: draftSnap.data().config as Partial<ClientConfig>,
        source: 'draft',
        isPublished: Boolean(tenantRec?.isPublished),
      };
    }

    // 2. Fall back to existing public website document
    const publicRef = doc(db, 'tenants', cleanId, 'public', 'website');
    const publicSnap = await getDoc(publicRef);
    if (publicSnap.exists() && publicSnap.data()?.config) {
      const publicData = publicSnap.data();
      return {
        success: true,
        config: publicData.config as Partial<ClientConfig>,
        source: 'public',
        isPublished: Boolean(publicData.isPublished),
      };
    }

    // 3. Neither exists
    const tenantRec = await getTenantRecord(cleanId);
    return {
      success: true,
      config: null,
      source: 'none',
      isPublished: Boolean(tenantRec?.isPublished),
    };
  } catch (err: any) {
    return {
      success: false,
      config: null,
      source: 'none',
      isPublished: false,
      error: err?.message || 'Could not load website draft configuration.',
    };
  }
}

/**
 * Atomically publish a tenant's website (Root Admin only)
 * Requirements:
 * 1. Verifies tenant document status is strictly 'active'. Suspended tenants can NEVER be published.
 * 2. Uses Firestore writeBatch() to commit updates to /tenants/{tenantId} and /tenants/{tenantId}/public/website atomically.
 * 3. Never mutates tenant 'status' (status remains active, never touches suspended).
 * 4. Also persists the current draft in /tenants/{tenantId}/private/websiteDraft atomically.
 */
export async function publishTenantWebsiteAtomic(
  tenantId: string,
  config: Partial<ClientConfig>
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, error: 'Tenant ID is required.' };

  try {
    // Pre-flight check: Verify tenant exists and status is strictly 'active'
    const tenantRec = await getTenantRecord(cleanId);
    if (!tenantRec) {
      return { success: false, error: `Tenant "${cleanId}" does not exist.` };
    }
    if (tenantRec.status !== 'active') {
      return {
        success: false,
        error: `Publishing blocked: Tenant account status is "${tenantRec.status}". Only active tenants can be published. Suspended tenants cannot be published.`,
      };
    }

    const timestamp = new Date().toISOString();
    const cleanConfig = JSON.parse(JSON.stringify(config));

    // Construct atomic batch
    const batch = writeBatch(db);

    // 1. Update /tenants/{tenantId} publication flag
    const tenantRef = doc(db, 'tenants', cleanId);
    batch.update(tenantRef, {
      isPublished: true,
      updatedAt: timestamp,
    });

    // 2. Set /tenants/{tenantId}/public/website live configuration
    const publicWebsiteRef = doc(db, 'tenants', cleanId, 'public', 'website');
    batch.set(publicWebsiteRef, {
      tenantId: cleanId,
      businessName: config.businessName || tenantRec.businessName || cleanId,
      isPublished: true,
      updatedAt: timestamp,
      config: cleanConfig,
    }, { merge: true });

    // 3. Keep /tenants/{tenantId}/private/websiteDraft in sync
    const draftRef = doc(db, 'tenants', cleanId, 'private', 'websiteDraft');
    batch.set(draftRef, {
      tenantId: cleanId,
      businessName: config.businessName || tenantRec.businessName || cleanId,
      updatedAt: timestamp,
      config: cleanConfig,
    }, { merge: true });

    // Commit atomic batch in a single network round-trip
    await batch.commit();

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to publish website atomically.' };
  }
}

/**
 * Atomically unpublish a tenant's website (Root Admin only)
 * Requirements:
 * 1. Uses Firestore writeBatch() to update isPublished: false on /tenants/{tenantId} and /tenants/{tenantId}/public/website.
 * 2. Non-destructive: Fully preserves all website configuration.
 */
export async function unpublishTenantWebsiteAtomic(
  tenantId: string
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, error: 'Tenant ID is required.' };

  try {
    const timestamp = new Date().toISOString();
    const batch = writeBatch(db);

    // 1. Update tenant root document
    const tenantRef = doc(db, 'tenants', cleanId);
    batch.update(tenantRef, {
      isPublished: false,
      updatedAt: timestamp,
    });

    // 2. Update public website document
    const publicWebsiteRef = doc(db, 'tenants', cleanId, 'public', 'website');
    batch.set(publicWebsiteRef, {
      isPublished: false,
      updatedAt: timestamp,
    }, { merge: true });

    await batch.commit();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to unpublish website atomically.' };
  }
}

/**
 * Persist public website presentation configuration at /tenants/{tenantId}/public/website (Administrator only)
 * Retained for backward-compatibility.
 */
export async function saveTenantWebsiteConfig(
  tenantId: string,
  config: Partial<ClientConfig>,
  isPublished: boolean = true
): Promise<{ success: boolean; error?: string }> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, error: 'Tenant ID is required.' };

  const timestamp = new Date().toISOString();
  try {
    const websiteRef = doc(db, 'tenants', cleanId, 'public', 'website');
    const payload = {
      tenantId: cleanId,
      businessName: config.businessName || cleanId,
      isPublished,
      updatedAt: timestamp,
      config: JSON.parse(JSON.stringify(config)),
    };
    await setDoc(websiteRef, payload, { merge: true });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save website configuration.' };
  }
}

/**
 * Fetch public website configuration from /tenants/{tenantId}/public/website for public visitors
 */
export async function fetchPublicWebsiteConfig(
  tenantId: string
): Promise<{
  success: boolean;
  config: Partial<ClientConfig> | null;
  isPublished: boolean;
  businessName?: string;
  error?: string;
}> {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return { success: false, config: null, isPublished: false, error: 'Invalid tenant ID' };

  try {
    const websiteRef = doc(db, 'tenants', cleanId, 'public', 'website');
    const snap = await getDoc(websiteRef);
    if (!snap.exists()) {
      return { success: false, config: null, isPublished: false, error: 'Website configuration not found.' };
    }
    const data = snap.data();
    if (data?.tenantId && String(data.tenantId).trim().toLowerCase() !== cleanId) {
      return {
        success: false,
        config: null,
        isPublished: false,
        error: 'Website configuration tenant mismatch.',
      };
    }
    return {
      success: true,
      config: (data.config as Partial<ClientConfig>) || null,
      isPublished: Boolean(data.isPublished),
      businessName: typeof data.businessName === 'string' ? data.businessName : undefined,
    };
  } catch (err: any) {
    return { success: false, config: null, isPublished: false, error: err?.message || 'Could not load website configuration.' };
  }
}

/**
 * Compute lowercase hex SHA-256 hash of an email address for deterministic invite lookups.
 * Runs in all modern browsers via window.crypto.subtle (fallback to lightweight JS if unavailable).
 */
export async function computeEmailHash(email: string): Promise<string> {
  const clean = (email || '').trim().toLowerCase();
  if (!clean) return '';

  try {
    if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
      const msgBuffer = new TextEncoder().encode(clean);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (err) {
    console.warn('Web Crypto unavailable, falling back to deterministic string hash:', err);
  }

  // Fallback deterministic alphanumeric slug
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = ((hash << 5) - hash) + clean.charCodeAt(i);
    hash |= 0;
  }
  return `hash_${Math.abs(hash).toString(16)}_${clean.replace(/[^a-z0-9]/g, '').slice(0, 20)}`;
}

export interface TenantStaffInvite {
  email: string;
  emailHash: string;
  role: 'staff';
  status: 'pending' | 'claimed' | 'revoked';
  tenantId: string;
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
  claimedBy?: string;
  claimedAt?: string;
}

export interface TenantMemberRecord {
  uid: string;
  email: string;
  role: 'owner' | 'staff';
  addedAt?: string;
}

/**
 * Create a staff invitation at /tenants/{tenantId}/invites/{emailHash} (Tenant Owner only)
 * Requirements:
 * - Role is strictly 'staff'
 * - Expires in 7 days (safe server-time window: expiresAt > request.time && expiresAt <= request.time + 7d)
 * - Single pending invite per email
 */
export async function createStaffInvite(
  tenantId: string,
  staffEmail: string
): Promise<{ success: boolean; invite?: TenantStaffInvite; inviteLink?: string; error?: string }> {
  const cleanTenant = (tenantId || '').trim().toLowerCase();
  const cleanEmail = (staffEmail || '').trim().toLowerCase();

  if (!cleanTenant) return { success: false, error: 'Tenant ID is required.' };
  if (!cleanEmail || !cleanEmail.includes('@')) {
    return { success: false, error: 'A valid email address is required.' };
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'Authentication required to invite team members.' };
  }

  try {
    const emailHash = await computeEmailHash(cleanEmail);
    const inviteRef = doc(db, 'tenants', cleanTenant, 'invites', emailHash);

    // Check if an invite already exists
    const existingSnap = await getDoc(inviteRef);
    if (existingSnap.exists()) {
      const data = existingSnap.data();
      if (data.status === 'pending') {
        const expiresAtMillis = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : new Date(data.expiresAt).getTime();
        if (Date.now() < expiresAtMillis) {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const inviteLink = `${origin}/?target=crm&inviteTenant=${encodeURIComponent(cleanTenant)}&inviteHash=${encodeURIComponent(emailHash)}`;
          return {
            success: false,
            error: `An active invitation already exists for "${cleanEmail}".`,
            inviteLink,
          };
        }
      }
    }

    // Set expiry 7 days in the future (minus 1 min buffer to safely ensure <= request.time + 7 days)
    const nowMillis = Date.now();
    const sevenDaysFromNow = Timestamp.fromMillis(nowMillis + (7 * 24 * 60 * 60 * 1000) - 60000);

    const payload = {
      email: cleanEmail,
      emailHash,
      role: 'staff' as const,
      status: 'pending' as const,
      tenantId: cleanTenant,
      invitedBy: currentUser.uid,
      createdAt: serverTimestamp(),
      expiresAt: sevenDaysFromNow,
    };

    await setDoc(inviteRef, payload);

    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const inviteLink = `${origin}/?target=crm&inviteTenant=${encodeURIComponent(cleanTenant)}&inviteHash=${encodeURIComponent(emailHash)}`;

    const inviteObj: TenantStaffInvite = {
      email: cleanEmail,
      emailHash,
      role: 'staff',
      status: 'pending',
      tenantId: cleanTenant,
      invitedBy: currentUser.uid,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(sevenDaysFromNow.toMillis()).toISOString(),
    };

    return { success: true, invite: inviteObj, inviteLink };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create staff invitation in Firestore.' };
  }
}

/**
 * Revoke a pending staff invitation (Tenant Owner only)
 * Requirements:
 * - Only pending invites can be revoked
 * - Mutates strictly the status field (affectedKeys().hasOnly(['status']))
 */
export async function revokeStaffInvite(
  tenantId: string,
  emailHash: string
): Promise<{ success: boolean; error?: string }> {
  const cleanTenant = (tenantId || '').trim().toLowerCase();
  const cleanHash = (emailHash || '').trim();

  if (!cleanTenant || !cleanHash) {
    return { success: false, error: 'Tenant ID and invite hash are required.' };
  }

  try {
    const inviteRef = doc(db, 'tenants', cleanTenant, 'invites', cleanHash);
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(inviteRef);
      if (!snap.exists()) {
        throw new Error('Invitation document not found.');
      }
      if (snap.data().status !== 'pending') {
        throw new Error(`Cannot revoke invitation with status "${snap.data().status}".`);
      }
      txn.update(inviteRef, { status: 'revoked' });
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to revoke staff invitation.' };
  }
}

/**
 * Atomically claim an invitation and enroll as staff member (Verified Invited User only)
 * Requirements:
 * - Verified email must match invite.email
 * - Request time must be strictly before expiresAt
 * - Atomic transaction writes /tenants/{tenantId}/members/{user.uid} and updates invite to 'claimed'
 */
export async function claimStaffInviteAtomic(
  tenantId: string,
  emailHash: string
): Promise<{ success: boolean; tenantId?: string; role?: 'staff'; error?: string }> {
  const cleanTenant = (tenantId || '').trim().toLowerCase();
  const cleanHash = (emailHash || '').trim();

  if (!cleanTenant || !cleanHash) {
    return { success: false, error: 'Tenant ID and invitation hash are required.' };
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    return { success: false, error: 'You must be signed in to claim this invitation.' };
  }

  const userEmail = (currentUser.email || '').trim().toLowerCase();
  if (!userEmail) {
    return { success: false, error: 'Authenticated account has no email address.' };
  }

  try {
    const inviteRef = doc(db, 'tenants', cleanTenant, 'invites', cleanHash);
    const memberRef = doc(db, 'tenants', cleanTenant, 'members', currentUser.uid);
    const userProfileRef = doc(db, 'users', currentUser.uid);

    await runTransaction(db, async (txn) => {
      // 1. Read invite document
      const inviteSnap = await txn.get(inviteRef);
      if (!inviteSnap.exists()) {
        throw new Error('Invitation not found or invalid link.');
      }

      const inviteData = inviteSnap.data();
      if (inviteData.status !== 'pending') {
        throw new Error(`This invitation has already been ${inviteData.status}.`);
      }

      // 2. Email verification match
      if ((inviteData.email || '').toLowerCase().trim() !== userEmail) {
        throw new Error(
          `Email mismatch: You are signed in as "${userEmail}", but this invitation was issued to "${inviteData.email}". Please sign in with the invited email address.`
        );
      }

      // 3. Expiry check
      const expiresAtMillis = inviteData.expiresAt?.toMillis
        ? inviteData.expiresAt.toMillis()
        : new Date(inviteData.expiresAt).getTime();
      if (Date.now() >= expiresAtMillis) {
        throw new Error('This invitation has expired. Please ask your organization owner for a new invite link.');
      }

      // 4. Atomic writes: Create member record and mark invite as claimed
      txn.set(memberRef, {
        uid: currentUser.uid,
        email: userEmail,
        role: 'staff',
        inviteHash: cleanHash,
        addedAt: new Date().toISOString(),
      });

      txn.update(inviteRef, {
        status: 'claimed',
        claimedBy: currentUser.uid,
        claimedAt: serverTimestamp(),
      });

      // 5. Update user profile with assigned tenant and staff role
      txn.set(
        userProfileRef,
        {
          uid: currentUser.uid,
          email: userEmail,
          tenantId: cleanTenant,
          role: 'staff',
        },
        { merge: true }
      );
    });

    // Refresh active session cache
    if (activeSessionUser) {
      activeSessionUser.clientId = cleanTenant;
      activeSessionUser.role = 'client_staff';
    }

    return { success: true, tenantId: cleanTenant, role: 'staff' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to claim invitation.' };
  }
}

/**
 * List all active staff and owner members of a tenant (/tenants/{tenantId}/members)
 */
export async function listTenantMembers(tenantId: string): Promise<TenantMemberRecord[]> {
  const cleanTenant = (tenantId || '').trim().toLowerCase();
  if (!cleanTenant) return [];

  try {
    const snap = await getDocs(collection(db, 'tenants', cleanTenant, 'members'));
    const members: TenantMemberRecord[] = [];
    snap.forEach((d) => {
      const data = d.data();
      members.push({
        uid: data.uid || d.id,
        email: data.email || '',
        role: data.role === 'owner' ? 'owner' : 'staff',
        addedAt: data.addedAt,
      });
    });
    return members;
  } catch (err) {
    console.warn(`Could not list members for ${cleanTenant}:`, err);
    return [];
  }
}

/**
 * List all pending staff invitations for a tenant (/tenants/{tenantId}/invites)
 */
export async function listTenantInvites(tenantId: string): Promise<TenantStaffInvite[]> {
  const cleanTenant = (tenantId || '').trim().toLowerCase();
  if (!cleanTenant) return [];

  try {
    const snap = await getDocs(collection(db, 'tenants', cleanTenant, 'invites'));
    const list: TenantStaffInvite[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const expiresAtStr = data.expiresAt?.toMillis
        ? new Date(data.expiresAt.toMillis()).toISOString()
        : String(data.expiresAt || '');
      list.push({
        email: data.email || '',
        emailHash: data.emailHash || d.id,
        role: 'staff',
        status: data.status || 'pending',
        tenantId: cleanTenant,
        invitedBy: data.invitedBy || '',
        createdAt: data.createdAt?.toMillis
          ? new Date(data.createdAt.toMillis()).toISOString()
          : String(data.createdAt || ''),
        expiresAt: expiresAtStr,
        claimedBy: data.claimedBy,
        claimedAt: data.claimedAt?.toMillis
          ? new Date(data.claimedAt.toMillis()).toISOString()
          : String(data.claimedAt || ''),
      });
    });
    return list;
  } catch (err) {
    console.warn(`Could not list invites for ${cleanTenant}:`, err);
    return [];
  }
}

/**
 * Remove a staff member from a tenant (Tenant Owner or Root Admin only)
 * Rules prohibit removing owners or self-deletion.
 */
export async function removeTenantStaffMember(
  tenantId: string,
  memberUid: string
): Promise<{ success: boolean; error?: string }> {
  const cleanTenant = (tenantId || '').trim().toLowerCase();
  const cleanUid = (memberUid || '').trim();

  if (!cleanTenant || !cleanUid) {
    return { success: false, error: 'Tenant ID and Member UID are required.' };
  }

  try {
    const memberRef = doc(db, 'tenants', cleanTenant, 'members', cleanUid);
    await deleteDoc(memberRef);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to remove staff member.' };
  }
}

// ==============================================================================
// PHASE 3B: AUTHORITATIVE DYNAMIC TENANT SLUG RESOLUTION & MANAGEMENT
// ==============================================================================

export const RESERVED_SLUGS: readonly string[] = [
  'crm',
  'portal',
  'admin',
  'api',
  'assets',
  'downloads',
  'site',
  'landing',
];

/**
 * Validate and normalize a URL slug for public tenant routing.
 * Enforces lowercase alphanumeric with single hyphens, length 3-63 chars, and reserved path blocking.
 */
export function validateAndNormalizeSlug(rawSlug: string): {
  isValid: boolean;
  normalizedSlug: string;
  error?: string;
} {
  if (!rawSlug || typeof rawSlug !== 'string') {
    return { isValid: false, normalizedSlug: '', error: 'Slug is required.' };
  }

  const normalized = rawSlug
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '');

  if (!normalized) {
    return { isValid: false, normalizedSlug: '', error: 'Slug cannot be empty.' };
  }

  if (normalized.length < 3) {
    return { isValid: false, normalizedSlug: '', error: 'Slug must be at least 3 characters long.' };
  }

  if (normalized.length > 63) {
    return { isValid: false, normalizedSlug: '', error: 'Slug must not exceed 63 characters.' };
  }

  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(normalized)) {
    return {
      isValid: false,
      normalizedSlug: '',
      error: 'Slug must contain only lowercase alphanumeric characters separated by single hyphens.',
    };
  }

  if (RESERVED_SLUGS.includes(normalized)) {
    return {
      isValid: false,
      normalizedSlug: '',
      error: `The slug "${normalized}" is a reserved system path and cannot be assigned to a tenant.`,
    };
  }

  return { isValid: true, normalizedSlug: normalized };
}

/**
 * Resolve a public URL slug to its underlying Firestore tenant ID.
 * Reads directly from /slugs/{normalizedSlug}.
 * If the tenant is suspended or unpublished, Firestore rules reject the getDoc call with permission-denied.
 */
export async function resolveSlugToTenant(
  slug: string
): Promise<{ success: boolean; tenantId: string | null; error?: string }> {
  const validation = validateAndNormalizeSlug(slug);
  if (!validation.isValid) {
    return { success: false, tenantId: null, error: validation.error };
  }

  try {
    const slugRef = doc(db, 'slugs', validation.normalizedSlug);
    const snap = await getDoc(slugRef);
    if (!snap.exists()) {
      return { success: false, tenantId: null, error: 'Slug not found.' };
    }

    const data = snap.data();
    const targetTenantId = data?.tenantId;
    if (!targetTenantId || typeof targetTenantId !== 'string') {
      return { success: false, tenantId: null, error: 'Corrupt slug mapping: missing tenant ID.' };
    }

    return { success: true, tenantId: targetTenantId };
  } catch (err: any) {
    return {
      success: false,
      tenantId: null,
      error: err?.message || 'Failed to resolve slug mapping.',
    };
  }
}

/**
 * Safely create or replace a unique slug mapping at /slugs/{slug} in an atomic transaction.
 * Delegates to updateTenantSlugAtomic so any previous /slugs/{oldSlug} mapping for the tenant
 * is retired atomically and no obsolete public URLs remain.
 */
export async function createSlugMappingAtomic(
  slug: string,
  tenantId: string
): Promise<{ success: boolean; slugMapping?: SlugMapping; error?: string }> {
  return updateTenantSlugAtomic(tenantId, slug);
}

/**
 * Atomically assign or change a tenant's public URL slug inside a Firestore transaction.
 * - Reads /tenants/{tenantId} and /slugs/{newSlug} (plus any previous /slugs/{oldSlug}) before writes.
 * - Rejects if tenant does not exist or newSlug is owned by a different tenant.
 * - Cleans up the previous /slugs/{oldSlug} mapping when changing slugs so stale URLs fail closed.
 * - Updates /tenants/{tenantId}.slug atomically.
 */
export async function updateTenantSlugAtomic(
  tenantId: string,
  newSlug: string
): Promise<{ success: boolean; slugMapping?: SlugMapping; error?: string }> {
  const cleanTenantId = (tenantId || '').trim().toLowerCase();
  if (!cleanTenantId) {
    return { success: false, error: 'Tenant ID is required.' };
  }

  const validation = validateAndNormalizeSlug(newSlug);
  if (!validation.isValid) {
    return { success: false, error: validation.error };
  }

  const normalizedNewSlug = validation.normalizedSlug;
  const timestamp = new Date().toISOString();
  const tenantRef = doc(db, 'tenants', cleanTenantId);
  const newSlugRef = doc(db, 'slugs', normalizedNewSlug);

  try {
    const result = await runTransaction(db, async (transaction) => {
      // 1. Primary reads
      const [tenantSnap, newSlugSnap] = await Promise.all([
        transaction.get(tenantRef),
        transaction.get(newSlugRef),
      ]);

      if (!tenantSnap.exists()) {
        throw new Error(`Tenant "${cleanTenantId}" does not exist.`);
      }

      if (newSlugSnap.exists() && newSlugSnap.data()?.tenantId !== cleanTenantId) {
        throw new Error(
          `Slug "${normalizedNewSlug}" is already assigned to another tenant ("${newSlugSnap.data()?.tenantId}").`
        );
      }

      const previousSlug =
        typeof tenantSnap.data()?.slug === 'string'
          ? tenantSnap.data().slug.trim().toLowerCase()
          : '';
      const hasOldSlugToRemove = Boolean(previousSlug && previousSlug !== normalizedNewSlug);
      const oldSlugRef = hasOldSlugToRemove ? doc(db, 'slugs', previousSlug) : null;
      const oldSlugSnap = oldSlugRef ? await transaction.get(oldSlugRef) : null;

      // 2. Atomic writes
      let slugRecord: SlugMapping;
      if (newSlugSnap.exists()) {
        const existingData = newSlugSnap.data();
        slugRecord = {
          slug: normalizedNewSlug,
          tenantId: cleanTenantId,
          createdAt: existingData?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        transaction.update(newSlugRef, { updatedAt: timestamp });
      } else {
        slugRecord = {
          slug: normalizedNewSlug,
          tenantId: cleanTenantId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        transaction.set(newSlugRef, slugRecord);
      }

      if (oldSlugRef && oldSlugSnap && oldSlugSnap.exists() && oldSlugSnap.data()?.tenantId === cleanTenantId) {
        transaction.delete(oldSlugRef);
      }

      transaction.update(tenantRef, {
        slug: normalizedNewSlug,
        updatedAt: timestamp,
      });

      return slugRecord;
    });

    return { success: true, slugMapping: result };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to update tenant public URL slug.',
    };
  }
}

/**
 * Safely hydrate a published Firestore ClientConfig for standalone landing rendering
 * without ever falling back to hardcoded static client presets for tenant identity.
 * Always locks clientId strictly to the resolved Firestore tenantId.
 */
export function hydratePublicClientConfig(
  tenantId: string,
  rawConfig: Partial<ClientConfig>,
  fallbackBusinessName?: string
): ClientConfig {
  const cleanTenantId = (tenantId || '').trim().toLowerCase();
  const resolvedBusinessName = (
    rawConfig.businessName ||
    fallbackBusinessName ||
    cleanTenantId
  ).trim();

  return {
    ...rawConfig,
    clientId: cleanTenantId,
    businessName: resolvedBusinessName,
    industry: rawConfig.industry || 'Local Services',
    tagline: rawConfig.tagline || '',
    heroTitle: rawConfig.heroTitle || resolvedBusinessName,
    heroSubheadline: rawConfig.heroSubheadline || '',
    yearsInBusiness: typeof rawConfig.yearsInBusiness === 'number' ? rawConfig.yearsInBusiness : 0,
    jobsCompleted: rawConfig.jobsCompleted || '',
    averageRating:
      typeof rawConfig.averageRating === 'number'
        ? rawConfig.averageRating
        : Number(rawConfig.averageRating) || 0,
    reviewCount:
      typeof rawConfig.reviewCount === 'number'
        ? rawConfig.reviewCount
        : Number(rawConfig.reviewCount) || 0,
    phone: rawConfig.phone || rawConfig.businessPhone || '',
    phoneRaw: rawConfig.phoneRaw || rawConfig.phone || rawConfig.businessPhone || '',
    email: rawConfig.email || '',
    address: rawConfig.address || '',
    cityStateZip: rawConfig.cityStateZip || rawConfig.serviceArea || '',
    businessHours: rawConfig.businessHours || '',
    emergencyAvailability: rawConfig.emergencyAvailability || '',
    primaryColor: rawConfig.primaryColor || '#0F172A',
    accentColor: rawConfig.accentColor || '#2563EB',
    fontFamily: rawConfig.fontFamily || 'Inter, sans-serif',
    heroImageUrl: rawConfig.heroImageUrl || '',
    aboutImageUrl: rawConfig.aboutImageUrl || '',
    googleMapsLink: rawConfig.googleMapsLink || '',
    googleMapsEmbedUrl: rawConfig.googleMapsEmbedUrl || '',
    googleReviewLink: rawConfig.googleReviewLink || '',
    googleAnalyticsId: rawConfig.googleAnalyticsId || '',
    facebookPixelId: rawConfig.facebookPixelId || '',
    googleTagManagerId: rawConfig.googleTagManagerId || '',
    socialLinks: rawConfig.socialLinks || {},
    seo: rawConfig.seo || {
      title: resolvedBusinessName,
      metaDescription: rawConfig.heroSubheadline || '',
      keywords: [],
      ogImageUrl: '',
      canonicalUrl: '',
    },
    serviceAreas: Array.isArray(rawConfig.serviceAreas) ? rawConfig.serviceAreas : [],
    services: Array.isArray(rawConfig.services) ? rawConfig.services : [],
    testimonials: Array.isArray(rawConfig.testimonials) ? rawConfig.testimonials : [],
    beforeAfter: Array.isArray(rawConfig.beforeAfter) ? rawConfig.beforeAfter : [],
    faqs: Array.isArray(rawConfig.faqs) ? rawConfig.faqs : [],
    trustBadges: Array.isArray(rawConfig.trustBadges) ? rawConfig.trustBadges : [],
    stats: Array.isArray(rawConfig.stats) ? rawConfig.stats : [],
    sampleDataNoticeEnabled: false,
    heroTrustBadgesEnabled: false,
  };
}

export interface PublicTenantWebsiteResolution {
  success: boolean;
  tenantId: string | null;
  config: ClientConfig | null;
  error?: string;
}

/**
 * Authoritative Phase 3B Dynamic Tenant Public Website Resolver:
 * 1. Resolves URL slug via /slugs/{slug} (resolveSlugToTenant)
 * 2. Loads published website from /tenants/{tenantId}/public/website (fetchPublicWebsiteConfig)
 * 3. Fails closed for unknown, invalid, reserved, suspended, or unpublished tenants
 * 4. Guarantees returned config.clientId equals resolved Firestore tenantId
 */
export async function resolvePublicTenantWebsiteBySlug(
  slug: string,
  deps?: {
    resolveSlug?: typeof resolveSlugToTenant;
    fetchWebsite?: typeof fetchPublicWebsiteConfig;
  }
): Promise<PublicTenantWebsiteResolution> {
  const resolveSlugFn = deps?.resolveSlug || resolveSlugToTenant;
  const fetchWebsiteFn = deps?.fetchWebsite || fetchPublicWebsiteConfig;

  const slugRes = await resolveSlugFn(slug);
  if (!slugRes.success || !slugRes.tenantId) {
    return {
      success: false,
      tenantId: null,
      config: null,
      error: slugRes.error || 'Tenant slug not found or inactive.',
    };
  }

  const resolvedTenantId = slugRes.tenantId.trim().toLowerCase();
  if (!resolvedTenantId) {
    return {
      success: false,
      tenantId: null,
      config: null,
      error: 'Invalid resolved tenant ID.',
    };
  }

  const siteRes = await fetchWebsiteFn(resolvedTenantId);
  if (!siteRes.success || !siteRes.isPublished || !siteRes.config) {
    return {
      success: false,
      tenantId: null,
      config: null,
      error: siteRes.error || 'Published website not found or tenant unavailable.',
    };
  }

  const hydratedConfig = hydratePublicClientConfig(
    resolvedTenantId,
    siteRes.config,
    siteRes.businessName
  );

  return {
    success: true,
    tenantId: resolvedTenantId,
    config: hydratedConfig,
  };
}

