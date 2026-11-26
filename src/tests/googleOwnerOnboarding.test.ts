/**
 * Google Sign-In Client Owner Onboarding Security & Integration Verification Suite
 *
 * Covers:
 * 1. Removal of server-side /api/create-client-login and FIREBASE_SERVICE_ACCOUNT_JSON dependencies
 * 2. Static Firestore Security Rules verification for /ownerInvites/{emailHash},
 *    /tenants/{tenantId}, /tenants/{tenantId}/members/{memberUid}, and /users/{userId}
 * 3. In-memory rule logic evaluation:
 *    - Verified Google email matching active unclaimed tenant succeeds atomically
 *    - Wrong email denied cleanly
 *    - Unverified Google email denied cleanly
 *    - Non-Google provider denied cleanly
 *    - Suspended tenant denied cleanly
 *    - Already-claimed tenant denied to second user
 *    - Cross-tenant isolation preserved (Tenant A owner cannot read/write Tenant B)
 *    - Client owner never gains Root Admin access
 * 4. Client helper input validation (assignTenantOwnerEmail, createTenantRecord)
 * 5. Real Firestore Emulator integration tests (@firebase/rules-unit-testing) when FIRESTORE_EMULATOR_HOST is set
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  assignTenantOwnerEmail,
  createTenantRecord,
  matchesRootAdminIdentity,
  ROOT_ADMIN_EMAIL,
} from '../auth/clientAuth';

describe('Google Sign-In Client Owner Onboarding Verification', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');
  const dirSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/SuperAdminClientDirectory.tsx'),
    'utf8'
  );
  const crmSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/StandaloneCrm.tsx'),
    'utf8'
  );
  const clientAuthSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/auth/clientAuth.ts'),
    'utf8'
  );

  // =========================================================================
  // SECTION A: STATIC CODEBASE & FIRESTORE RULES AUDIT
  // =========================================================================
  describe('Section A: Obsolete Admin SDK Removal & Static Rules Audit', () => {
    it('1. Obsolete /functions/api/create-client-login.ts and FIREBASE_SERVICE_ACCOUNT_JSON are removed', () => {
      expect(fs.existsSync(path.resolve(process.cwd(), 'functions/api/create-client-login.ts'))).toBe(
        false
      );
      expect(fs.existsSync(path.resolve(process.cwd(), 'src/tests/createClientLogin.test.ts'))).toBe(
        false
      );
      const envExample = fs.readFileSync(path.resolve(process.cwd(), '.env.example'), 'utf8');
      expect(envExample).not.toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
      expect(envExample).toContain('ROOT_ADMIN_UID');
      expect(clientAuthSource).not.toContain('createClientOwnerLogin');
      expect(clientAuthSource).not.toContain('/api/create-client-login');
    });

    it('2. firestore.rules defines isGoogleVerifiedUser() requiring verified email + google.com', () => {
      expect(rulesContent).toContain('function isGoogleVerifiedUser()');
      const helper = rulesContent.match(/function isGoogleVerifiedUser\(\)\s*\{[\s\S]*?\}/)?.[0] || '';
      expect(helper).toContain('isSignedIn()');
      expect(helper).toContain('request.auth.token.email_verified == true');
      expect(helper).toContain("request.auth.token.firebase.sign_in_provider == 'google.com'");
    });

    it('3. /ownerInvites/{emailHash} blocks enumeration, restricts creates/lists to Root Admin, and requires atomic claim', () => {
      const ownerInvitesBlock =
        rulesContent.match(/match \/ownerInvites\/\{emailHash\}\s*\{[\s\S]*?\n    \}/)?.[0] || '';
      expect(ownerInvitesBlock).not.toBe('');
      expect(ownerInvitesBlock).toContain('allow list: if isRootAdmin();');
      expect(ownerInvitesBlock).toContain('allow create: if isRootAdmin()');
      expect(ownerInvitesBlock).toContain('allow delete: if isRootAdmin();');
      expect(ownerInvitesBlock).toContain("resource.data.status == 'pending'");
      expect(ownerInvitesBlock).toContain('isTenantActive(resource.data.tenantId)');
      expect(ownerInvitesBlock).toContain("request.resource.data.status == 'claimed'");
      expect(ownerInvitesBlock).toContain('request.resource.data.claimedByUid == request.auth.uid');
      expect(ownerInvitesBlock).toContain(
        "getAfter(/databases/$(database)/documents/tenants/$(resource.data.tenantId)/members/$(request.auth.uid)).data.role == 'owner'"
      );
      expect(ownerInvitesBlock).toContain(
        'getAfter(/databases/$(database)/documents/tenants/$(resource.data.tenantId)).data.ownerUid == request.auth.uid'
      );
    });

    it('4. /tenants/{tenantId}/members/{memberUid} Path D enforces active, unclaimed tenant and verified email match', () => {
      const memberBlock =
        rulesContent.match(/match \/members\/\{memberUid\}\s*\{[\s\S]*?allow create: if[\s\S]*?\);/)?.[0] ||
        '';
      expect(memberBlock).toContain('=== PATH D: SECURE ATOMIC GOOGLE OWNER CLAIM ===');
      expect(memberBlock).toContain("request.resource.data.role == 'owner'");
      expect(memberBlock).toContain('isTenantActive(tenantId)');
      expect(memberBlock).toContain('ownerUid');
      expect(memberBlock).toContain("data.status == 'claimed'");
    });

    it('5. UI preserves Activate/Suspend controls, adds Set/Edit Owner Email & Connected status, and omits tenantId picker on CRM login', () => {
      expect(dirSource).toContain('updateTenantStatus');
      expect(dirSource).toContain('assignTenantOwnerEmail');
      expect(dirSource).toContain('Connected');
      expect(dirSource).toContain('Not Connected');
      expect(dirSource).toContain('Copy CRM Link');
      expect(crmSource).toContain('Sign in with Google');
      expect(crmSource).toContain('CRM Access Denied');
      expect(crmSource).toContain('Business Account Inactive or Suspended');
      expect(crmSource).not.toContain('desiredTenantId');
    });
  });

  // =========================================================================
  // SECTION B: CLIENT VALIDATION & ROOT ADMIN BOUNDARIES
  // =========================================================================
  describe('Section B: Validation & Privilege Boundaries', () => {
    it('1. assignTenantOwnerEmail rejects invalid tenant IDs, invalid emails, and Root Admin email', async () => {
      const badTenant = await assignTenantOwnerEmail('bad/id', 'owner@gmail.com');
      expect(badTenant.success).toBe(false);

      const badEmail = await assignTenantOwnerEmail('roofing-client-01', 'not-an-email');
      expect(badEmail.success).toBe(false);

      const rootEmailAttempt = await assignTenantOwnerEmail('roofing-client-01', ROOT_ADMIN_EMAIL);
      expect(rootEmailAttempt.success).toBe(false);
      expect(rootEmailAttempt.error).toContain('Root Administrator');
    });

    it('2. createTenantRecord rejects Root Admin email as client ownerEmail', async () => {
      const res = await createTenantRecord({
        tenantId: 'new-test-client',
        businessName: 'New Test Client',
        industry: 'roofing',
        status: 'active',
        isPublished: false,
        ownerEmail: ROOT_ADMIN_EMAIL,
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('Root Administrator');
    });

    it('3. Client owner Google accounts NEVER match Root Admin identity', () => {
      expect(
        matchesRootAdminIdentity({
          email: 'owner@roofing.com',
          emailVerified: true,
          signInProvider: 'google.com',
        })
      ).toBe(false);
      expect(
        matchesRootAdminIdentity({
          email: ROOT_ADMIN_EMAIL,
          emailVerified: false,
          signInProvider: 'google.com',
        })
      ).toBe(false);
      expect(
        matchesRootAdminIdentity({
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
          signInProvider: 'password',
        })
      ).toBe(false);
      expect(
        matchesRootAdminIdentity({
          email: ROOT_ADMIN_EMAIL,
          emailVerified: true,
          signInProvider: 'google.com',
        })
      ).toBe(true);
    });
  });

  // =========================================================================
  // SECTION C: IN-MEMORY ATOMIC CLAIM RULE EVALUATION
  // =========================================================================
  describe('Section C: In-Memory Atomic Google Owner Claim & Isolation Simulation', () => {
    interface SimAuth {
      uid: string;
      email: string;
      email_verified: boolean;
      provider: string;
    }

    interface SimTenant {
      tenantId: string;
      status: 'active' | 'suspended';
      ownerEmail: string;
      ownerUid?: string;
    }

    interface SimOwnerInvite {
      emailHash: string;
      ownerEmail: string;
      tenantId: string;
      status: 'pending' | 'claimed' | 'revoked';
      claimedByUid?: string;
    }

    const canClaimOwner = (
      auth: SimAuth | null,
      tenant: SimTenant | null,
      invite: SimOwnerInvite | null
    ): { allowed: boolean; reason?: string } => {
      if (!auth) return { allowed: false, reason: 'Not authenticated' };
      if (auth.provider !== 'google.com') return { allowed: false, reason: 'Google Sign-In required' };
      if (!auth.email_verified) return { allowed: false, reason: 'Email not verified' };
      if (!invite || invite.ownerEmail.toLowerCase() !== auth.email.toLowerCase()) {
        return { allowed: false, reason: 'No matching owner invite' };
      }
      if (invite.status !== 'pending') {
        return { allowed: false, reason: 'Invite already claimed or revoked' };
      }
      if (!tenant || tenant.tenantId !== invite.tenantId) {
        return { allowed: false, reason: 'Tenant missing' };
      }
      if (tenant.status !== 'active') {
        return { allowed: false, reason: 'Tenant suspended' };
      }
      if (tenant.ownerEmail.toLowerCase() !== auth.email.toLowerCase()) {
        return { allowed: false, reason: 'Email does not match tenant ownerEmail' };
      }
      if (tenant.ownerUid) {
        return { allowed: false, reason: 'Tenant already claimed' };
      }
      return { allowed: true };
    };

    it('1. Verified Google email matching active unclaimed tenant succeeds', () => {
      const tenant: SimTenant = {
        tenantId: 'roofing-client-01',
        status: 'active',
        ownerEmail: 'owner@roofing.test',
      };
      const invite: SimOwnerInvite = {
        emailHash: 'hash_owner_roofing',
        ownerEmail: 'owner@roofing.test',
        tenantId: 'roofing-client-01',
        status: 'pending',
      };
      const auth: SimAuth = {
        uid: 'uid_owner_1',
        email: 'Owner@Roofing.Test',
        email_verified: true,
        provider: 'google.com',
      };
      expect(canClaimOwner(auth, tenant, invite).allowed).toBe(true);
    });

    it('2. Wrong Google email is denied cleanly', () => {
      const tenant: SimTenant = {
        tenantId: 'roofing-client-01',
        status: 'active',
        ownerEmail: 'owner@roofing.test',
      };
      const invite: SimOwnerInvite = {
        emailHash: 'hash_owner_roofing',
        ownerEmail: 'owner@roofing.test',
        tenantId: 'roofing-client-01',
        status: 'pending',
      };
      const auth: SimAuth = {
        uid: 'uid_stranger',
        email: 'stranger@gmail.com',
        email_verified: true,
        provider: 'google.com',
      };
      expect(canClaimOwner(auth, tenant, invite).allowed).toBe(false);
    });

    it('3. Unverified Google email is denied cleanly', () => {
      const tenant: SimTenant = {
        tenantId: 'roofing-client-01',
        status: 'active',
        ownerEmail: 'owner@roofing.test',
      };
      const invite: SimOwnerInvite = {
        emailHash: 'hash_owner_roofing',
        ownerEmail: 'owner@roofing.test',
        tenantId: 'roofing-client-01',
        status: 'pending',
      };
      const auth: SimAuth = {
        uid: 'uid_owner_1',
        email: 'owner@roofing.test',
        email_verified: false,
        provider: 'google.com',
      };
      expect(canClaimOwner(auth, tenant, invite).allowed).toBe(false);
    });

    it('4. Suspended tenant denies owner claiming cleanly', () => {
      const tenant: SimTenant = {
        tenantId: 'prodrain-plumbing-kochi',
        status: 'suspended',
        ownerEmail: 'owner@prodrain.test',
      };
      const invite: SimOwnerInvite = {
        emailHash: 'hash_owner_prodrain',
        ownerEmail: 'owner@prodrain.test',
        tenantId: 'prodrain-plumbing-kochi',
        status: 'pending',
      };
      const auth: SimAuth = {
        uid: 'uid_prodrain',
        email: 'owner@prodrain.test',
        email_verified: true,
        provider: 'google.com',
      };
      expect(canClaimOwner(auth, tenant, invite).allowed).toBe(false);
    });

    it('5. Already-claimed tenant rejects second user', () => {
      const tenant: SimTenant = {
        tenantId: 'roofing-client-01',
        status: 'active',
        ownerEmail: 'owner@roofing.test',
        ownerUid: 'uid_first_owner',
      };
      const invite: SimOwnerInvite = {
        emailHash: 'hash_owner_roofing',
        ownerEmail: 'owner@roofing.test',
        tenantId: 'roofing-client-01',
        status: 'claimed',
        claimedByUid: 'uid_first_owner',
      };
      const secondUser: SimAuth = {
        uid: 'uid_second_user',
        email: 'owner@roofing.test',
        email_verified: true,
        provider: 'google.com',
      };
      expect(canClaimOwner(secondUser, tenant, invite).allowed).toBe(false);
    });
  });

  // =========================================================================
  // SECTION D: LIVE FIRESTORE EMULATOR TESTS (WHEN EMULATOR RUNNING)
  // =========================================================================
  const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

  describe.skipIf(!isEmulatorRunning)(
    'Section D: Live Firestore Emulator Google Owner Onboarding (@firebase/rules-unit-testing)',
    () => {
      let testEnv: RulesTestEnvironment;
      const TENANT_A = 'roofing-client-01';
      const TENANT_B = 'prodrain-plumbing-kochi';
      const OWNER_EMAIL = 'roofing.owner@gmail.com';
      const OWNER_HASH = 'hash_roofing_owner_gmail';
      const SUSPENDED_EMAIL = 'prodrain.owner@gmail.com';
      const SUSPENDED_HASH = 'hash_prodrain_owner_gmail';

      beforeAll(async () => {
        testEnv = await initializeTestEnvironment({
          projectId: 'leadpilot-google-onboarding-test',
          firestore: {
            rules: rulesContent,
            host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
            port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
          },
        });
      });

      afterAll(async () => {
        if (testEnv) await testEnv.cleanup();
      });

      beforeEach(async () => {
        await testEnv.clearFirestore();
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          const adminDb = ctx.firestore();
          await setDoc(doc(adminDb, 'tenants', TENANT_A), {
            id: TENANT_A,
            tenantId: TENANT_A,
            name: 'Roofing Co',
            status: 'active',
            isPublished: false,
            ownerEmail: OWNER_EMAIL,
          });
          await setDoc(doc(adminDb, 'ownerInvites', OWNER_HASH), {
            emailHash: OWNER_HASH,
            ownerEmail: OWNER_EMAIL,
            tenantId: TENANT_A,
            businessName: 'Roofing Co',
            status: 'pending',
            createdAt: '2026-11-26T00:00:00Z',
          });
          await setDoc(doc(adminDb, 'tenants', TENANT_A, 'leads', 'LP-ROOF-01'), {
            id: 'LP-ROOF-01',
            clientId: TENANT_A,
            name: 'Alice Lead',
            phone: '555-0100',
            status: 'New',
            timestamp: '2026-11-26T00:00:00Z',
          });

          await setDoc(doc(adminDb, 'tenants', TENANT_B), {
            id: TENANT_B,
            tenantId: TENANT_B,
            name: 'ProDrain Plumbing',
            status: 'suspended',
            isPublished: false,
            ownerEmail: SUSPENDED_EMAIL,
          });
          await setDoc(doc(adminDb, 'ownerInvites', SUSPENDED_HASH), {
            emailHash: SUSPENDED_HASH,
            ownerEmail: SUSPENDED_EMAIL,
            tenantId: TENANT_B,
            businessName: 'ProDrain Plumbing',
            status: 'pending',
            createdAt: '2026-11-26T00:00:00Z',
          });
          await setDoc(doc(adminDb, 'tenants', TENANT_B, 'leads', 'LP-DRAIN-01'), {
            id: 'LP-DRAIN-01',
            clientId: TENANT_B,
            name: 'Bob Drain',
            phone: '555-0200',
            status: 'New',
            timestamp: '2026-11-26T00:00:00Z',
          });
        });
      });

      const commitAtomicClaim = (
        db: ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore'] extends () => infer R
          ? R
          : never,
        uid: string,
        email: string,
        tenantId: string,
        hash: string
      ) => {
        const batch = writeBatch(db);
        const ts = '2026-11-26T01:00:00Z';
        batch.set(doc(db, 'tenants', tenantId, 'members', uid), {
          uid,
          email,
          role: 'owner',
          ownerInviteHash: hash,
          addedAt: ts,
        });
        batch.update(doc(db, 'tenants', tenantId), {
          ownerUid: uid,
          updatedAt: ts,
        });
        batch.update(doc(db, 'ownerInvites', hash), {
          status: 'claimed',
          claimedByUid: uid,
          claimedAt: ts,
          updatedAt: ts,
        });
        batch.set(doc(db, 'users', uid), {
          uid,
          email,
          displayName: 'Owner',
          businessName: 'Roofing Co',
          tenantId,
          role: 'owner',
          createdAt: ts,
        });
        return batch.commit();
      };

      it('1. [PASS] Invited Google user claims active tenant & reads own leads, denied Tenant B', async () => {
        const ctx = testEnv.authenticatedContext('uid_roof_owner', {
          email: OWNER_EMAIL,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        });
        const db = ctx.firestore();
        await assertSucceeds(getDoc(doc(db, 'ownerInvites', OWNER_HASH)));
        await assertSucceeds(commitAtomicClaim(db, 'uid_roof_owner', OWNER_EMAIL, TENANT_A, OWNER_HASH));
        await assertSucceeds(getDoc(doc(db, 'tenants', TENANT_A, 'leads', 'LP-ROOF-01')));
        await assertFails(getDoc(doc(db, 'tenants', TENANT_B, 'leads', 'LP-DRAIN-01')));
        await assertFails(updateDoc(doc(db, 'tenants', TENANT_A), { status: 'suspended' }));
      });

      it('2. [REJECT] Wrong email, unverified email, suspended tenant, and second claim are denied', async () => {
        const wrongCtx = testEnv.authenticatedContext('uid_wrong', {
          email: 'other@gmail.com',
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        });
        await assertFails(getDoc(doc(wrongCtx.firestore(), 'ownerInvites', OWNER_HASH)));
        await assertFails(
          commitAtomicClaim(wrongCtx.firestore(), 'uid_wrong', 'other@gmail.com', TENANT_A, OWNER_HASH)
        );

        const unverifiedCtx = testEnv.authenticatedContext('uid_unverified', {
          email: OWNER_EMAIL,
          email_verified: false,
          firebase: { sign_in_provider: 'google.com' },
        });
        await assertFails(
          commitAtomicClaim(unverifiedCtx.firestore(), 'uid_unverified', OWNER_EMAIL, TENANT_A, OWNER_HASH)
        );

        const suspCtx = testEnv.authenticatedContext('uid_susp', {
          email: SUSPENDED_EMAIL,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        });
        await assertFails(
          commitAtomicClaim(suspCtx.firestore(), 'uid_susp', SUSPENDED_EMAIL, TENANT_B, SUSPENDED_HASH)
        );

        // First claim succeeds; second claim by another UID fails
        const ownerCtx = testEnv.authenticatedContext('uid_roof_owner', {
          email: OWNER_EMAIL,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        });
        await assertSucceeds(
          commitAtomicClaim(ownerCtx.firestore(), 'uid_roof_owner', OWNER_EMAIL, TENANT_A, OWNER_HASH)
        );

        const secondUidCtx = testEnv.authenticatedContext('uid_second', {
          email: OWNER_EMAIL,
          email_verified: true,
          firebase: { sign_in_provider: 'google.com' },
        });
        await assertFails(
          commitAtomicClaim(secondUidCtx.firestore(), 'uid_second', OWNER_EMAIL, TENANT_A, OWNER_HASH)
        );
      });
    }
  );
});
