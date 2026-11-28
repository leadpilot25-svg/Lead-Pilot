import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  getRedirectResult,
  UserCredential,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp(firebaseConfig);

function createFirestoreInstance(firebaseApp: FirebaseApp): Firestore {
  try {
    return initializeFirestore(
      firebaseApp,
      { experimentalAutoDetectLongPolling: true },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
  }
}

// CRITICAL: The app will break without specifying firestoreDatabaseId
export const db = createFirestoreInstance(app);
export const auth = getAuth(app);

// Explicitly configure local persistence to survive redirects and page reloads
const persistenceReadyPromise: Promise<void> =
  typeof window !== 'undefined'
    ? setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.warn('Could not set Firebase Auth persistence:', err);
      })
    : Promise.resolve();

// Global top-level redirect capture executed immediately on script evaluation
export interface GlobalRedirectState {
  isChecking: boolean;
  result: UserCredential | null;
  error: any | null;
}

let redirectState: GlobalRedirectState = {
  isChecking: typeof window !== 'undefined',
  result: null,
  error: null,
};

const redirectListeners: Array<(state: GlobalRedirectState) => void> = [];

export function subscribeRedirectState(listener: (state: GlobalRedirectState) => void) {
  redirectListeners.push(listener);
  listener(redirectState);
  return () => {
    const idx = redirectListeners.indexOf(listener);
    if (idx !== -1) redirectListeners.splice(idx, 1);
  };
}

export function getGlobalRedirectState() {
  return redirectState;
}

if (typeof window !== 'undefined') {
  persistenceReadyPromise
    .then(() => getRedirectResult(auth))
    .then((result) => {
      redirectState = { isChecking: false, result, error: null };
      if (result?.user) {
        try {
          sessionStorage.setItem('leadpilot_last_authenticated_uid', result.user.uid);
        } catch {}
      }
      redirectListeners.forEach((l) => l(redirectState));
    })
    .catch((err) => {
      redirectState = { isChecking: false, result: null, error: err };
      try {
        sessionStorage.setItem(
          'leadpilot_last_redirect_error',
          JSON.stringify({ code: err?.code || 'unknown', message: err?.message || String(err) })
        );
      } catch {}
      redirectListeners.forEach((l) => l(redirectState));
    });
}

// Secondary App, Auth, and Firestore instances for isolated testing without overriding primary admin session
export function getSecondaryProvisioningApp() {
  const SECONDARY_APP_NAME = 'LeadPilotProvisioningSecondaryApp';
  const existingApp = getApps().find((a) => a.name === SECONDARY_APP_NAME);
  return existingApp || initializeApp(firebaseConfig, SECONDARY_APP_NAME);
}

export function getSecondaryProvisioningAuth() {
  return getAuth(getSecondaryProvisioningApp());
}

export function getSecondaryProvisioningDb() {
  return createFirestoreInstance(getSecondaryProvisioningApp());
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isTransientNetworkAuthError(err: unknown): boolean {
  const code = (err as any)?.code || '';
  const message = err instanceof Error ? err.message : String(err || '');
  return (
    code === 'auth/network-request-failed' ||
    message.includes('auth/network-request-failed') ||
    message.includes('Fetching auth token failed')
  );
}

// Validation connection to Firestore on boot
export async function testConnection(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return true;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }

  try {
    await persistenceReadyPromise;
    if (typeof (auth as any).authStateReady === 'function') {
      await (auth as any).authStateReady();
    }

    if (auth.currentUser) {
      try {
        await auth.currentUser.getIdToken();
      } catch (tokenErr) {
        if (isTransientNetworkAuthError(tokenErr)) {
          console.warn('Skipping Firestore boot connection check while auth token refresh is offline.');
          return false;
        }
      }
    }

    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || '');
    if (isTransientNetworkAuthError(error) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      console.warn('Firestore connection check deferred because network is currently unavailable.');
      return false;
    }
    if (message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
      return false;
    }
    // Permission denied or not found is normal for 'test/connection'
    return true;
  }
}

// Initial connection test (browser only)
if (typeof window !== 'undefined') {
  testConnection().catch(() => {});
}

export default app;
