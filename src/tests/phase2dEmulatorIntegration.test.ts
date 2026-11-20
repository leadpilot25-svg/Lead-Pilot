/**
 * Phase 2D: Real Firestore Security Rules Integration Test Suite
 *
 * Uses @firebase/rules-unit-testing to evaluate the ACTUAL compiled firestore.rules
 * against the Firebase Firestore Emulator for Phase 2D client owner & staff access.
 *
 * PREREQUISITE FOR LIVE EXECUTION ON WINDOWS:
 * Run via Firebase CLI with Firestore emulator running:
 * npx firebase-tools emulators:exec --only firestore "npx cross-env FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run phase2dEmulatorIntegration"
 *
 * When FIRESTORE_EMULATOR_HOST is unset, this suite cleanly skips to prevent container build failures.
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
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';

const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

describe.skipIf(!isEmulatorRunning)(
  'Phase 2D: Real Firestore Emulator Integration Suite (@firebase/rules-unit-testing)',
  () => {
    let testEnv: RulesTestEnvironment;
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    // Identifiers & Fixtures
    const TENANT_A = 'tenant-apex-hvac';
    const TENANT_B = 'tenant-prodrain-plumbing';
    const OWNER_A_UID = 'usr_apex_owner';
    const STAFF_A_UID = 'usr_apex_staff';
    const INVITED_STAFF_UID = 'usr_invited_staff';
    const INVITED_STAFF_EMAIL = 'sarah.connor@apex.local';
    const INVITED_EMAIL_HASH = 'hash_sarah_connor_apex';
    const ATTACKER_UID = 'usr_attacker';
    const ATTACKER_EMAIL = 'attacker@evil.local';
    const ROOT_ADMIN_UID = 'admin_root_uid';
    const ROOT_ADMIN_EMAIL = 'mail.nasiya@gmail.com';

    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'leadpilot-test-phase2d',
        firestore: {
          rules,
          host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
          port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
        },
      });
    });

    afterAll(async () => {
      if (testEnv) {
        await testEnv.cleanup();
      }
    });

    beforeEach(async () => {
      if (testEnv) {
        await testEnv.clearFirestore();

        // Seed baseline data bypassing security rules
        await testEnv.withSecurityRulesDisabled(async (context) => {
          const db = context.firestore();

          // 1. Root Platform Admin
          await setDoc(doc(db, 'admins', ROOT_ADMIN_UID), {
            uid: ROOT_ADMIN_UID,
            email: ROOT_ADMIN_EMAIL,
            role: 'admin',
          });

          // 2. Tenant A (Active, Apex HVAC)
          await setDoc(doc(db, 'tenants', TENANT_A), {
            id: TENANT_A,
            tenantId: TENANT_A,
            name: 'Apex Heating & Cooling',
            status: 'active',
            isPublished: true,
          });

          // Tenant A Owner
          await setDoc(doc(db, 'tenants', TENANT_A, 'members', OWNER_A_UID), {
            uid: OWNER_A_UID,
            email: 'owner@apex.local',
            role: 'owner',
          });

          // Tenant A Staff Member
          await setDoc(doc(db, 'tenants', TENANT_A, 'members', STAFF_A_UID), {
            uid: STAFF_A_UID,
            email: 'existing.staff@apex.local',
            role: 'staff',
          });

          // Tenant A Lead
          await setDoc(doc(db, 'tenants', TENANT_A, 'leads', 'LP-APEX-001'), {
            id: 'LP-APEX-001',
            clientId: TENANT_A,
            name: 'John Apex',
            phone: '+1 555-111-2222',
            service: 'AC Repair',
            status: 'New',
            timestamp: new Date().toISOString(),
          });

          // 3. Tenant B (Active, ProDrain Plumbing) - Cross-tenant isolation target
          await setDoc(doc(db, 'tenants', TENANT_B), {
            id: TENANT_B,
            tenantId: TENANT_B,
            name: 'ProDrain Plumbing',
            status: 'active',
            isPublished: true,
          });

          await setDoc(doc(db, 'tenants', TENANT_B, 'members', 'usr_prodrain_owner'), {
            uid: 'usr_prodrain_owner',
            email: 'owner@prodrain.local',
            role: 'owner',
          });

          await setDoc(doc(db, 'tenants', TENANT_B, 'leads', 'LP-DRAIN-001'), {
            id: 'LP-DRAIN-001',
            clientId: TENANT_B,
            name: 'Bob Drain',
            phone: '+1 555-999-8888',
            service: 'Drain Cleaning',
            status: 'New',
            timestamp: new Date().toISOString(),
          });
        });
      }
    });

    // =========================================================================
    // 1. INVITATION CREATION & PRIVILEGE ESCALATION GUARDS
    // =========================================================================

    it('1. [PASS] Tenant Owner CAN create a pending staff invite with valid 7-day expiry', async () => {
      const ownerContext = testEnv.authenticatedContext(OWNER_A_UID, {
        email: 'owner@apex.local',
        email_verified: true,
      });
      const db = ownerContext.firestore();

      const inviteRef = doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH);
      const futureExpiry = Timestamp.fromMillis(Date.now() + 6 * 24 * 60 * 60 * 1000); // 6 days in future

      await assertSucceeds(
        setDoc(inviteRef, {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: futureExpiry,
        })
      );
    });

    it('2. [REJECT] Tenant Owner CANNOT create an invitation with role: "owner"', async () => {
      const ownerContext = testEnv.authenticatedContext(OWNER_A_UID, {
        email: 'owner@apex.local',
        email_verified: true,
      });
      const db = ownerContext.firestore();

      const inviteRef = doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH);
      const futureExpiry = Timestamp.fromMillis(Date.now() + 6 * 24 * 60 * 60 * 1000);

      await assertFails(
        setDoc(inviteRef, {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'owner', // Malicious privilege escalation
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: futureExpiry,
        })
      );
    });

    it('3. [REJECT] Staff member CANNOT create staff invitations', async () => {
      const staffContext = testEnv.authenticatedContext(STAFF_A_UID, {
        email: 'existing.staff@apex.local',
        email_verified: true,
      });
      const db = staffContext.firestore();

      const inviteRef = doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH);
      const futureExpiry = Timestamp.fromMillis(Date.now() + 6 * 24 * 60 * 60 * 1000);

      await assertFails(
        setDoc(inviteRef, {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: STAFF_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: futureExpiry,
        })
      );
    });

    it('4. [REJECT] Invitation creation with expiresAt exceeding 7 days is rejected', async () => {
      const ownerContext = testEnv.authenticatedContext(OWNER_A_UID, {
        email: 'owner@apex.local',
        email_verified: true,
      });
      const db = ownerContext.firestore();

      const inviteRef = doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH);
      const eightDaysExpiry = Timestamp.fromMillis(Date.now() + 8 * 24 * 60 * 60 * 1000); // 8 days (exceeds limit)

      await assertFails(
        setDoc(inviteRef, {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: eightDaysExpiry,
        })
      );
    });

    it('5. [REJECT] Direct member enrollment by Tenant Owner (Path B) is strictly blocked', async () => {
      const ownerContext = testEnv.authenticatedContext(OWNER_A_UID, {
        email: 'owner@apex.local',
        email_verified: true,
      });
      const db = ownerContext.firestore();

      // Owner directly trying to enroll a member document without the verified invite claim flow
      const directMemberRef = doc(db, 'tenants', TENANT_A, 'members', 'usr_unverified_new');
      await assertFails(
        setDoc(directMemberRef, {
          uid: 'usr_unverified_new',
          email: 'direct@apex.local',
          role: 'staff',
        })
      );
    });

    // =========================================================================
    // 2. ATOMIC INVITATION CLAIM & VERIFIED EMAIL MATCHING
    // =========================================================================

    it('6. [PASS] Verified invited staff member CAN atomically claim invitation', async () => {
      // Seed pending invite first
      const inviteExpiry = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: inviteExpiry,
        });
      });

      // Invited user context with matching verified email
      const staffContext = testEnv.authenticatedContext(INVITED_STAFF_UID, {
        email: INVITED_STAFF_EMAIL,
        email_verified: true,
      });
      const db = staffContext.firestore();

      // Atomic batch claiming invite and creating member document
      const batch = writeBatch(db);
      const memberRef = doc(db, 'tenants', TENANT_A, 'members', INVITED_STAFF_UID);
      const inviteRef = doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH);

      batch.set(memberRef, {
        uid: INVITED_STAFF_UID,
        email: INVITED_STAFF_EMAIL,
        role: 'staff',
        inviteHash: INVITED_EMAIL_HASH,
      });

      batch.update(inviteRef, {
        status: 'claimed',
        claimedBy: INVITED_STAFF_UID,
        claimedAt: Timestamp.now(),
      });

      await assertSucceeds(batch.commit());
    });

    it('7. [REJECT] Unverified email token CANNOT claim an invitation', async () => {
      const inviteExpiry = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: inviteExpiry,
        });
      });

      // Unverified token
      const unverifiedContext = testEnv.authenticatedContext(INVITED_STAFF_UID, {
        email: INVITED_STAFF_EMAIL,
        email_verified: false, // NOT verified
      });
      const db = unverifiedContext.firestore();

      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', TENANT_A, 'members', INVITED_STAFF_UID), {
        uid: INVITED_STAFF_UID,
        email: INVITED_STAFF_EMAIL,
        role: 'staff',
        inviteHash: INVITED_EMAIL_HASH,
      });
      batch.update(doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
        status: 'claimed',
        claimedBy: INVITED_STAFF_UID,
        claimedAt: Timestamp.now(),
      });

      await assertFails(batch.commit());
    });

    it('8. [REJECT] Mismatched email address CANNOT claim an invitation', async () => {
      const inviteExpiry = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL, // Issued to sarah.connor@apex.local
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: inviteExpiry,
        });
      });

      // Attacker authenticated context
      const attackerContext = testEnv.authenticatedContext(ATTACKER_UID, {
        email: ATTACKER_EMAIL, // attacker@evil.local
        email_verified: true,
      });
      const db = attackerContext.firestore();

      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', TENANT_A, 'members', ATTACKER_UID), {
        uid: ATTACKER_UID,
        email: ATTACKER_EMAIL,
        role: 'staff',
        inviteHash: INVITED_EMAIL_HASH,
      });
      batch.update(doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
        status: 'claimed',
        claimedBy: ATTACKER_UID,
        claimedAt: Timestamp.now(),
      });

      await assertFails(batch.commit());
    });

    it('9. [REJECT] Single-use: An already claimed invitation CANNOT be claimed again', async () => {
      // Seed invite as ALREADY claimed
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'claimed', // ALREADY claimed
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000),
          claimedBy: 'previous_user_uid',
        });
      });

      const secondUserUid = 'usr_second_attempt';
      const staffContext = testEnv.authenticatedContext(secondUserUid, {
        email: INVITED_STAFF_EMAIL,
        email_verified: true,
      });
      const db = staffContext.firestore();

      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', TENANT_A, 'members', secondUserUid), {
        uid: secondUserUid,
        email: INVITED_STAFF_EMAIL,
        role: 'staff',
        inviteHash: INVITED_EMAIL_HASH,
      });
      batch.update(doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
        status: 'claimed',
        claimedBy: secondUserUid,
        claimedAt: Timestamp.now(),
      });

      await assertFails(batch.commit());
    });

    it('10. [REJECT] Expired invitation CANNOT be claimed', async () => {
      // Seed invite with expiresAt in the PAST
      const pastExpiry = Timestamp.fromMillis(Date.now() - 3600000); // 1 hour ago
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.fromMillis(Date.now() - 8 * 24 * 60 * 60 * 1000),
          expiresAt: pastExpiry, // EXPIRED
        });
      });

      const staffContext = testEnv.authenticatedContext(INVITED_STAFF_UID, {
        email: INVITED_STAFF_EMAIL,
        email_verified: true,
      });
      const db = staffContext.firestore();

      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', TENANT_A, 'members', INVITED_STAFF_UID), {
        uid: INVITED_STAFF_UID,
        email: INVITED_STAFF_EMAIL,
        role: 'staff',
        inviteHash: INVITED_EMAIL_HASH,
      });
      batch.update(doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
        status: 'claimed',
        claimedBy: INVITED_STAFF_UID,
        claimedAt: Timestamp.now(),
      });

      await assertFails(batch.commit());
    });

    it('11. [REJECT] Non-atomic claim: Creating member document alone without updating invite fails', async () => {
      const inviteExpiry = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: inviteExpiry,
        });
      });

      const staffContext = testEnv.authenticatedContext(INVITED_STAFF_UID, {
        email: INVITED_STAFF_EMAIL,
        email_verified: true,
      });
      const db = staffContext.firestore();

      // Only creating member record without updating invite in same transaction
      const memberRef = doc(db, 'tenants', TENANT_A, 'members', INVITED_STAFF_UID);
      await assertFails(
        setDoc(memberRef, {
          uid: INVITED_STAFF_UID,
          email: INVITED_STAFF_EMAIL,
          role: 'staff',
          inviteHash: INVITED_EMAIL_HASH,
        })
      );
    });

    // =========================================================================
    // 3. INVITATION REVOCATION & HARDENING
    // =========================================================================

    it('12. [PASS] Tenant Owner CAN revoke a pending invitation by updating status to "revoked"', async () => {
      const inviteExpiry = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: inviteExpiry,
        });
      });

      const ownerContext = testEnv.authenticatedContext(OWNER_A_UID, {
        email: 'owner@apex.local',
        email_verified: true,
      });
      const db = ownerContext.firestore();

      const inviteRef = doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH);
      await assertSucceeds(
        updateDoc(inviteRef, {
          status: 'revoked',
        })
      );
    });

    it('13. [REJECT] Owner CANNOT mutate email, role, or tenantId during revocation', async () => {
      const inviteExpiry = Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000);
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'pending',
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: inviteExpiry,
        });
      });

      const ownerContext = testEnv.authenticatedContext(OWNER_A_UID, {
        email: 'owner@apex.local',
        email_verified: true,
      });
      const db = ownerContext.firestore();

      const inviteRef = doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH);
      // Malicious revocation trying to change role or email
      await assertFails(
        updateDoc(inviteRef, {
          status: 'revoked',
          role: 'owner', // FORBIDDEN: diff.affectedKeys().hasOnly(['status'])
        })
      );
    });

    it('14. [REJECT] Revoked invitation CANNOT be claimed by invited user', async () => {
      // Seed invite as REVOKED
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
          email: INVITED_STAFF_EMAIL,
          emailHash: INVITED_EMAIL_HASH,
          role: 'staff',
          status: 'revoked', // REVOKED
          tenantId: TENANT_A,
          invitedBy: OWNER_A_UID,
          createdAt: Timestamp.now(),
          expiresAt: Timestamp.fromMillis(Date.now() + 5 * 24 * 60 * 60 * 1000),
        });
      });

      const staffContext = testEnv.authenticatedContext(INVITED_STAFF_UID, {
        email: INVITED_STAFF_EMAIL,
        email_verified: true,
      });
      const db = staffContext.firestore();

      const batch = writeBatch(db);
      batch.set(doc(db, 'tenants', TENANT_A, 'members', INVITED_STAFF_UID), {
        uid: INVITED_STAFF_UID,
        email: INVITED_STAFF_EMAIL,
        role: 'staff',
        inviteHash: INVITED_EMAIL_HASH,
      });
      batch.update(doc(db, 'tenants', TENANT_A, 'invites', INVITED_EMAIL_HASH), {
        status: 'claimed',
        claimedBy: INVITED_STAFF_UID,
        claimedAt: Timestamp.now(),
      });

      await assertFails(batch.commit());
    });

    // =========================================================================
    // 4. ROLE-BASED ACCESS CONTROL & CROSS-TENANT ISOLATION
    // =========================================================================

    it('15. [REJECT] Staff member CANNOT delete leads', async () => {
      const staffContext = testEnv.authenticatedContext(STAFF_A_UID, {
        email: 'existing.staff@apex.local',
        email_verified: true,
      });
      const db = staffContext.firestore();

      const leadRef = doc(db, 'tenants', TENANT_A, 'leads', 'LP-APEX-001');
      await assertFails(deleteDoc(leadRef));
    });

    it('16. [PASS] Tenant Owner CAN delete leads in their tenant', async () => {
      const ownerContext = testEnv.authenticatedContext(OWNER_A_UID, {
        email: 'owner@apex.local',
        email_verified: true,
      });
      const db = ownerContext.firestore();

      const leadRef = doc(db, 'tenants', TENANT_A, 'leads', 'LP-APEX-001');
      await assertSucceeds(deleteDoc(leadRef));
    });

    it('17. [REJECT] Cross-tenant isolation: Staff of Tenant A CANNOT read Tenant B leads', async () => {
      const staffContext = testEnv.authenticatedContext(STAFF_A_UID, {
        email: 'existing.staff@apex.local',
        email_verified: true,
      });
      const db = staffContext.firestore();

      // Attempting to read Tenant B's lead
      const tenantBLeadRef = doc(db, 'tenants', TENANT_B, 'leads', 'LP-DRAIN-001');
      await assertFails(getDoc(tenantBLeadRef));
    });

    it('18. [PASS] Root Admin CAN provision owner and staff members directly', async () => {
      const rootAdminContext = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
        email: ROOT_ADMIN_EMAIL,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      });
      const db = rootAdminContext.firestore();

      const newOwnerRef = doc(db, 'tenants', TENANT_A, 'members', 'usr_root_provisioned_owner');
      await assertSucceeds(
        setDoc(newOwnerRef, {
          uid: 'usr_root_provisioned_owner',
          email: 'newowner@apex.local',
          role: 'owner',
        })
      );
    });
  }
);
