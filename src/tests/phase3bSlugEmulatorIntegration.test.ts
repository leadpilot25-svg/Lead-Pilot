/**
 * Phase 3B: Dynamic Tenant Slug Foundation Emulator Integration Suite
 *
 * Evaluates the real compiled firestore.rules against the Firebase Firestore Emulator
 * for /slugs/{slug} dynamic resolution, access control, and transaction safety.
 *
 * Uses dedicated projectId 'leadpilot-test-phase3b' to avoid state collision with
 * Phase 1 ('leadpilot-test-project') or Phase 2D ('leadpilot-test-phase2d').
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
  getDocs,
  collection,
  runTransaction,
} from 'firebase/firestore';
import {
  validateAndNormalizeSlug,
  RESERVED_SLUGS,
  matchesRootAdminIdentity,
  getCurrentClientSession,
} from '../auth/clientAuth';

const isEmulatorRunning = Boolean(process.env.FIRESTORE_EMULATOR_HOST);

// Unit tests for slug validation (always run in all environments)
describe('Phase 3B: Slug Validation & Normalization Logic', () => {
  it('1. Normalizes uppercase and trims slashes', () => {
    const res = validateAndNormalizeSlug('/Apex-Hvac/');
    expect(res.isValid).toBe(true);
    expect(res.normalizedSlug).toBe('apex-hvac');
  });

  it('2. Rejects empty or whitespace-only slug', () => {
    expect(validateAndNormalizeSlug('').isValid).toBe(false);
    expect(validateAndNormalizeSlug('   ').isValid).toBe(false);
  });

  it('3. Rejects slugs under 3 characters or over 63 characters', () => {
    expect(validateAndNormalizeSlug('ab').isValid).toBe(false);
    expect(validateAndNormalizeSlug('a'.repeat(64)).isValid).toBe(false);
    expect(validateAndNormalizeSlug('abc').isValid).toBe(true);
  });

  it('4. Rejects invalid characters and double hyphens', () => {
    expect(validateAndNormalizeSlug('apex_hvac').isValid).toBe(false);
    expect(validateAndNormalizeSlug('apex--hvac').isValid).toBe(false);
    expect(validateAndNormalizeSlug('apex.hvac').isValid).toBe(false);
    expect(validateAndNormalizeSlug('apex hvac').isValid).toBe(false);
    expect(validateAndNormalizeSlug('apex-hvac-123').isValid).toBe(true);
  });

  it('5. Rejects reserved system paths', () => {
    for (const reserved of RESERVED_SLUGS) {
      const res = validateAndNormalizeSlug(reserved);
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('reserved');
    }
  });

  it('6. Root Admin identity requires verified mail.nasiya@gmail.com via google.com provider', () => {
    expect(
      matchesRootAdminIdentity({
        email: 'mail.nasiya@gmail.com',
        emailVerified: true,
        signInProvider: 'google.com',
      })
    ).toBe(true);

    // Unverified email rejected
    expect(
      matchesRootAdminIdentity({
        email: 'mail.nasiya@gmail.com',
        emailVerified: false,
        signInProvider: 'google.com',
      })
    ).toBe(false);

    // Non-Google sign-in provider rejected even for Root Admin email
    expect(
      matchesRootAdminIdentity({
        email: 'mail.nasiya@gmail.com',
        emailVerified: true,
        signInProvider: 'password',
      })
    ).toBe(false);

    // Provisioned admin email is never treated as Root Admin
    expect(
      matchesRootAdminIdentity({
        email: 'support-admin@leadpilot.io',
        emailVerified: true,
        signInProvider: 'google.com',
      })
    ).toBe(false);
  });

  it('7. getCurrentClientSession returns null instead of guessing tenantId before Firestore profile loads', () => {
    expect(getCurrentClientSession()).toBeNull();
  });
});

// Real Firestore Emulator Security Integration Suite
describe.skipIf(!isEmulatorRunning)(
  'Phase 3B: Real Firestore Emulator Slug Security Suite (@firebase/rules-unit-testing)',
  () => {
    let testEnv: RulesTestEnvironment;
    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    // Fixtures
    const TENANT_ACTIVE = 'tenant-apex-hvac';
    const TENANT_SUSPENDED = 'tenant-suspended-co';
    const TENANT_UNPUBLISHED = 'tenant-draft-co';
    const SLUG_ACTIVE = 'apex-hvac';
    const SLUG_SUSPENDED = 'suspended-biz';
    const SLUG_UNPUBLISHED = 'draft-biz';
    const ROOT_ADMIN_UID = 'admin_root_uid';
    const ROOT_ADMIN_EMAIL = 'mail.nasiya@gmail.com';
    const PROVISIONED_ADMIN_UID = 'admin_provisioned_uid';
    const PROVISIONED_ADMIN_EMAIL = 'ops-admin@leadpilot.local';
    const TENANT_OWNER_UID = 'usr_apex_owner';

    beforeAll(async () => {
      testEnv = await initializeTestEnvironment({
        projectId: 'leadpilot-test-phase3b',
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

          // 1. Root Admin & Provisioned Admin
          await setDoc(doc(db, 'admins', ROOT_ADMIN_UID), {
            uid: ROOT_ADMIN_UID,
            email: ROOT_ADMIN_EMAIL,
            role: 'admin',
          });
          await setDoc(doc(db, 'admins', PROVISIONED_ADMIN_UID), {
            uid: PROVISIONED_ADMIN_UID,
            email: PROVISIONED_ADMIN_EMAIL,
            role: 'admin',
          });

          // 2. Active Tenant with Published Website
          await setDoc(doc(db, 'tenants', TENANT_ACTIVE), {
            id: TENANT_ACTIVE,
            tenantId: TENANT_ACTIVE,
            name: 'Apex Heating & Cooling',
            status: 'active',
            isPublished: true,
            slug: SLUG_ACTIVE,
          });
          await setDoc(doc(db, 'tenants', TENANT_ACTIVE, 'public', 'website'), {
            tenantId: TENANT_ACTIVE,
            businessName: 'Apex Heating & Cooling',
            isPublished: true,
          });
          await setDoc(doc(db, 'slugs', SLUG_ACTIVE), {
            slug: SLUG_ACTIVE,
            tenantId: TENANT_ACTIVE,
            createdAt: '2026-11-12T00:00:00Z',
          });

          // 3. Suspended Tenant with Published Website
          await setDoc(doc(db, 'tenants', TENANT_SUSPENDED), {
            id: TENANT_SUSPENDED,
            tenantId: TENANT_SUSPENDED,
            name: 'Suspended Co',
            status: 'suspended',
            isPublished: true,
            slug: SLUG_SUSPENDED,
          });
          await setDoc(doc(db, 'tenants', TENANT_SUSPENDED, 'public', 'website'), {
            tenantId: TENANT_SUSPENDED,
            businessName: 'Suspended Co',
            isPublished: true,
          });
          await setDoc(doc(db, 'slugs', SLUG_SUSPENDED), {
            slug: SLUG_SUSPENDED,
            tenantId: TENANT_SUSPENDED,
            createdAt: '2026-11-12T00:00:00Z',
          });

          // 4. Active Tenant with Unpublished Website
          await setDoc(doc(db, 'tenants', TENANT_UNPUBLISHED), {
            id: TENANT_UNPUBLISHED,
            tenantId: TENANT_UNPUBLISHED,
            name: 'Draft Co',
            status: 'active',
            isPublished: false,
            slug: SLUG_UNPUBLISHED,
          });
          await setDoc(doc(db, 'tenants', TENANT_UNPUBLISHED, 'public', 'website'), {
            tenantId: TENANT_UNPUBLISHED,
            businessName: 'Draft Co',
            isPublished: false,
          });
          await setDoc(doc(db, 'slugs', SLUG_UNPUBLISHED), {
            slug: SLUG_UNPUBLISHED,
            tenantId: TENANT_UNPUBLISHED,
            createdAt: '2026-11-12T00:00:00Z',
          });

          // 5. Tenant Owner for Tenant A
          await setDoc(doc(db, 'tenants', TENANT_ACTIVE, 'members', TENANT_OWNER_UID), {
            uid: TENANT_OWNER_UID,
            email: 'owner@apex.local',
            role: 'owner',
          });
        });
      }
    });

    // --------------------------------------------------------------------------
    // SCENARIO 1: Valid Public Slug Lookup
    // --------------------------------------------------------------------------
    it('1. Public visitor can read /slugs/{slug} when target tenant is active and website is published', async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      const snap = await assertSucceeds(getDoc(doc(publicDb, 'slugs', SLUG_ACTIVE)));
      expect(snap.exists()).toBe(true);
      expect(snap.data()?.tenantId).toBe(TENANT_ACTIVE);
    });

    // --------------------------------------------------------------------------
    // SCENARIO 2: Unknown Slug Lookup
    // --------------------------------------------------------------------------
    it('2. Public visitor reading non-existent slug returns null/does not exist', async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      const snap = await assertSucceeds(getDoc(doc(publicDb, 'slugs', 'non-existent-slug')));
      expect(snap.exists()).toBe(false);
    });

    // --------------------------------------------------------------------------
    // SCENARIO 3: Unpublished Website Blocked
    // --------------------------------------------------------------------------
    it('3. Public visitor CANNOT read /slugs/{slug} when website is unpublished (fail-closed)', async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(publicDb, 'slugs', SLUG_UNPUBLISHED)));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 4: Suspended Tenant Blocked
    // --------------------------------------------------------------------------
    it('4. Public visitor CANNOT read /slugs/{slug} when tenant is suspended (fail-closed)', async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDoc(doc(publicDb, 'slugs', SLUG_SUSPENDED)));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 5: Public Slug Listing Denied
    // --------------------------------------------------------------------------
    it('5. Public visitor CANNOT list or query the /slugs collection', async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(getDocs(collection(publicDb, 'slugs')));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 6: Duplicate Slug Ownership Prevented
    // --------------------------------------------------------------------------
    it('6. Rules reject overwriting an existing slug document on create', async () => {
      const rootAdminDb = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
        email: ROOT_ADMIN_EMAIL,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }).firestore();

      // Attempt to re-create SLUG_ACTIVE with !exists rule constraint
      await assertFails(
        setDoc(doc(rootAdminDb, 'slugs', SLUG_ACTIVE), {
          slug: SLUG_ACTIVE,
          tenantId: 'other-tenant',
          createdAt: '2026-11-12T00:00:00Z',
        })
      );
    });

    // --------------------------------------------------------------------------
    // SCENARIO 7: Non-Admin Slug Modification Denied
    // --------------------------------------------------------------------------
    it('7. Tenant Owner, Staff, and Public users CANNOT create, update, or delete slugs', async () => {
      const ownerDb = testEnv.authenticatedContext(TENANT_OWNER_UID, {
        email: 'owner@apex.local',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }).firestore();

      const publicDb = testEnv.unauthenticatedContext().firestore();

      // Owner create attempt
      await assertFails(
        setDoc(doc(ownerDb, 'slugs', 'new-slug'), {
          slug: 'new-slug',
          tenantId: TENANT_ACTIVE,
          createdAt: '2026-11-12T00:00:00Z',
        })
      );

      // Owner delete attempt
      await assertFails(deleteDoc(doc(ownerDb, 'slugs', SLUG_ACTIVE)));

      // Public delete attempt
      await assertFails(deleteDoc(doc(publicDb, 'slugs', SLUG_ACTIVE)));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 8: Root Admin Slug Modification Allowed
    // --------------------------------------------------------------------------
    it('8. Root Admin can create, update, and delete valid non-reserved slugs', async () => {
      const rootAdminDb = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
        email: ROOT_ADMIN_EMAIL,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }).firestore();

      // Create new slug pointing to active tenant
      const newSlug = 'apex-comfort';
      await assertSucceeds(
        setDoc(doc(rootAdminDb, 'slugs', newSlug), {
          slug: newSlug,
          tenantId: TENANT_ACTIVE,
          createdAt: '2026-11-12T00:00:00Z',
        })
      );

      // Update slug mapping
      await assertSucceeds(
        updateDoc(doc(rootAdminDb, 'slugs', newSlug), {
          updatedAt: '2026-11-12T01:00:00Z',
        })
      );

      // Delete slug mapping
      await assertSucceeds(deleteDoc(doc(rootAdminDb, 'slugs', newSlug)));

      // Rejection of reserved system paths for Root Admin
      await assertFails(
        setDoc(doc(rootAdminDb, 'slugs', 'crm'), {
          slug: 'crm',
          tenantId: TENANT_ACTIVE,
          createdAt: '2026-11-12T00:00:00Z',
        })
      );
    });

    // --------------------------------------------------------------------------
    // SCENARIO 9: End-to-End Public Slug -> Website Read -> Enquiry Submission
    // --------------------------------------------------------------------------
    it('9. Public visitor resolves slug, reads published website, and submits enquiry to resolved tenantId only', async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();

      // 1. Resolve /slugs/apex-hvac -> TENANT_ACTIVE
      const slugSnap = await assertSucceeds(getDoc(doc(publicDb, 'slugs', SLUG_ACTIVE)));
      expect(slugSnap.exists()).toBe(true);
      const resolvedTenantId = slugSnap.data()?.tenantId;
      expect(resolvedTenantId).toBe(TENANT_ACTIVE);

      // 2. Read /tenants/{resolvedTenantId}/public/website
      const siteSnap = await assertSucceeds(
        getDoc(doc(publicDb, 'tenants', resolvedTenantId, 'public', 'website'))
      );
      expect(siteSnap.exists()).toBe(true);
      expect(siteSnap.data()?.isPublished).toBe(true);

      // 3. Submit public enquiry to /tenants/{resolvedTenantId}/leads/{leadId}
      const leadId = 'LP-20261120-0001';
      await assertSucceeds(
        setDoc(doc(publicDb, 'tenants', resolvedTenantId, 'leads', leadId), {
          id: leadId,
          timestamp: '2026-11-20T10:00:00.000Z',
          clientId: resolvedTenantId,
          businessName: 'Apex Heating & Cooling',
          name: 'Jane Doe',
          phone: '+1 555 234 5678',
          service: 'AC Repair',
          status: 'New',
        })
      );

      // 4. Public visitor CANNOT read leads back
      await assertFails(getDoc(doc(publicDb, 'tenants', resolvedTenantId, 'leads', leadId)));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 10: Public Website & Enquiry Rejection for Suspended/Unpublished/Mismatched Tenant
    // --------------------------------------------------------------------------
    it('10. Public visitor CANNOT read suspended/unpublished website or submit enquiries with mismatched/suspended tenantId', async () => {
      const publicDb = testEnv.unauthenticatedContext().firestore();

      // Suspended website read denied
      await assertFails(
        getDoc(doc(publicDb, 'tenants', TENANT_SUSPENDED, 'public', 'website'))
      );

      // Unpublished website read denied
      await assertFails(
        getDoc(doc(publicDb, 'tenants', TENANT_UNPUBLISHED, 'public', 'website'))
      );

      // Public lead submission to suspended tenant denied
      await assertFails(
        setDoc(doc(publicDb, 'tenants', TENANT_SUSPENDED, 'leads', 'LP-20261120-0002'), {
          id: 'LP-20261120-0002',
          timestamp: '2026-11-20T10:00:00.000Z',
          clientId: TENANT_SUSPENDED,
          name: 'Blocked User',
          phone: '+1 555 999 0000',
          service: 'Repair',
          status: 'New',
        })
      );

      // Public lead submission with mismatched clientId denied
      await assertFails(
        setDoc(doc(publicDb, 'tenants', TENANT_ACTIVE, 'leads', 'LP-20261120-0003'), {
          id: 'LP-20261120-0003',
          timestamp: '2026-11-20T10:00:00.000Z',
          clientId: 'wrong-tenant-id',
          name: 'Spoof User',
          phone: '+1 555 999 0001',
          service: 'Repair',
          status: 'New',
        })
      );
    });

    // --------------------------------------------------------------------------
    // SCENARIO 11: CRM Cross-Tenant Isolation
    // --------------------------------------------------------------------------
    it('11. Authenticated owner of Tenant A CANNOT read or write leads of Tenant B', async () => {
      const ownerADb = testEnv.authenticatedContext(TENANT_OWNER_UID, {
        email: 'owner@apex.local',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }).firestore();

      // Tenant A owner CAN read Tenant A leads
      await assertSucceeds(getDocs(collection(ownerADb, 'tenants', TENANT_ACTIVE, 'leads')));

      // Tenant A owner CANNOT read Tenant B leads (e.g. if navigating to /crm/draft-co)
      await assertFails(getDocs(collection(ownerADb, 'tenants', TENANT_UNPUBLISHED, 'leads')));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 12: Root Admin Atomic Tenant Creation With & Without Slug (existsAfter)
    // --------------------------------------------------------------------------
    it('12. Root Admin can atomically create a new tenant with a slug (using existsAfter) and without a slug', async () => {
      const rootAdminDb = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
        email: ROOT_ADMIN_EMAIL,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }).firestore();

      // With slug inside single transaction
      const newTenantId = 'tenant-atomic-dental';
      const newSlug = 'atomic-dental';
      await assertSucceeds(
        runTransaction(rootAdminDb, async (txn) => {
          txn.set(doc(rootAdminDb, 'tenants', newTenantId), {
            id: newTenantId,
            tenantId: newTenantId,
            name: 'Atomic Dental',
            status: 'active',
            isPublished: false,
            slug: newSlug,
            createdAt: '2026-11-21T00:00:00Z',
          });
          txn.set(doc(rootAdminDb, 'slugs', newSlug), {
            slug: newSlug,
            tenantId: newTenantId,
            createdAt: '2026-11-21T00:00:00Z',
            updatedAt: '2026-11-21T00:00:00Z',
          });
        })
      );

      // Without slug
      const sluglessTenantId = 'tenant-slugless-clinic';
      await assertSucceeds(
        setDoc(doc(rootAdminDb, 'tenants', sluglessTenantId), {
          id: sluglessTenantId,
          tenantId: sluglessTenantId,
          name: 'Slugless Clinic',
          status: 'active',
          isPublished: false,
          createdAt: '2026-11-21T00:00:00Z',
        })
      );
    });

    // --------------------------------------------------------------------------
    // SCENARIO 13: Provisioned Admin Restrictions & Retained CRM Permissions
    // --------------------------------------------------------------------------
    it('13. Provisioned Admin retains CRM access but CANNOT create/delete tenants or modify slugs/ownership/status', async () => {
      const provAdminDb = testEnv.authenticatedContext(PROVISIONED_ADMIN_UID, {
        email: PROVISIONED_ADMIN_EMAIL,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }).firestore();

      // Retained CRM permissions: can read tenant metadata and leads
      await assertSucceeds(getDoc(doc(provAdminDb, 'tenants', TENANT_ACTIVE)));
      await assertSucceeds(getDocs(collection(provAdminDb, 'tenants', TENANT_ACTIVE, 'leads')));

      // Blocked Root Admin permissions:
      // 1) Cannot create tenant
      await assertFails(
        setDoc(doc(provAdminDb, 'tenants', 'tenant-prov-blocked'), {
          id: 'tenant-prov-blocked',
          tenantId: 'tenant-prov-blocked',
          name: 'Blocked Co',
          status: 'active',
          isPublished: false,
        })
      );

      // 2) Cannot delete tenant
      await assertFails(deleteDoc(doc(provAdminDb, 'tenants', TENANT_ACTIVE)));

      // 3) Cannot create/update/delete /slugs/{slug}
      await assertFails(
        setDoc(doc(provAdminDb, 'slugs', 'prov-slug'), {
          slug: 'prov-slug',
          tenantId: TENANT_ACTIVE,
          createdAt: '2026-11-21T00:00:00Z',
        })
      );
      await assertFails(deleteDoc(doc(provAdminDb, 'slugs', SLUG_ACTIVE)));

      // 4) Cannot modify slug, status, isPublished, id, tenantId, ownerEmail on /tenants/{tenantId}
      await assertFails(updateDoc(doc(provAdminDb, 'tenants', TENANT_ACTIVE), { slug: 'hijacked-slug' }));
      await assertFails(updateDoc(doc(provAdminDb, 'tenants', TENANT_ACTIVE), { ownerEmail: 'evil@local' }));
      await assertFails(updateDoc(doc(provAdminDb, 'tenants', TENANT_ACTIVE), { status: 'suspended' }));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 14: Tenant Owner Protected Fields
    // --------------------------------------------------------------------------
    it('14. Tenant Owner CANNOT modify slug, status, isPublished, id, tenantId, or ownerEmail on /tenants/{tenantId}', async () => {
      const ownerDb = testEnv.authenticatedContext(TENANT_OWNER_UID, {
        email: 'owner@apex.local',
        email_verified: true,
        firebase: { sign_in_provider: 'password' },
      }).firestore();

      await assertFails(updateDoc(doc(ownerDb, 'tenants', TENANT_ACTIVE), { slug: 'owner-hijack-slug' }));
      await assertFails(updateDoc(doc(ownerDb, 'tenants', TENANT_ACTIVE), { ownerEmail: 'other@apex.local' }));
      await assertFails(updateDoc(doc(ownerDb, 'tenants', TENANT_ACTIVE), { tenantId: 'other-tenant' }));
      await assertFails(updateDoc(doc(ownerDb, 'tenants', TENANT_ACTIVE), { status: 'suspended' }));
      await assertFails(updateDoc(doc(ownerDb, 'tenants', TENANT_ACTIVE), { isPublished: false }));
    });

    // --------------------------------------------------------------------------
    // SCENARIO 15: Atomic Slug Replacement Retires Old Public URL
    // --------------------------------------------------------------------------
    it('15. Root Admin replacing slug atomically retires old /slugs/{oldSlug} mapping', async () => {
      const rootAdminDb = testEnv.authenticatedContext(ROOT_ADMIN_UID, {
        email: ROOT_ADMIN_EMAIL,
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      }).firestore();
      const publicDb = testEnv.unauthenticatedContext().firestore();

      const replacementSlug = 'apex-hvac-pro';
      await assertSucceeds(
        runTransaction(rootAdminDb, async (txn) => {
          const tenantRef = doc(rootAdminDb, 'tenants', TENANT_ACTIVE);
          const tenantSnap = await txn.get(tenantRef);
          const oldSlug = tenantSnap.data()?.slug;
          if (oldSlug && oldSlug !== replacementSlug) {
            txn.delete(doc(rootAdminDb, 'slugs', oldSlug));
          }
          txn.set(doc(rootAdminDb, 'slugs', replacementSlug), {
            slug: replacementSlug,
            tenantId: TENANT_ACTIVE,
            createdAt: '2026-11-21T00:00:00Z',
            updatedAt: '2026-11-21T00:00:00Z',
          });
          txn.update(tenantRef, {
            slug: replacementSlug,
            updatedAt: '2026-11-21T00:00:00Z',
          });
        })
      );

      // New slug resolves cleanly for public visitor
      const newSlugSnap = await assertSucceeds(getDoc(doc(publicDb, 'slugs', replacementSlug)));
      expect(newSlugSnap.exists()).toBe(true);
      expect(newSlugSnap.data()?.tenantId).toBe(TENANT_ACTIVE);

      // Retired old slug no longer exists
      const oldSlugSnap = await assertSucceeds(getDoc(doc(publicDb, 'slugs', SLUG_ACTIVE)));
      expect(oldSlugSnap.exists()).toBe(false);
    });
  }
);

