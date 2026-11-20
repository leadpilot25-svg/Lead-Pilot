/**
 * LeadPilot Firestore Security Rules Automated Test Suite
 * 
 * Tests the hardened Attribute-Based Access Control (ABAC) rules:
 * 1. Anonymous landing form submission with approved fields only (status: 'New')
 * 2. Rejection of anonymous submissions with CRM-only fields (notes, contactCount, contactLogs)
 * 3. Rejection of anonymous submissions with management fields (assignedTo, followUpDate, lastContacted, lastContactMethod)
 * 4. Rejection of arbitrary unapproved ghost fields
 * 5. Rejection of non-New status in public submissions
 * 6. Nonexistent target tenant rejection
 * 7. Duplicate lead ID overwrite prevention
 * 8. Rejection of anonymous submissions with ghost fields
 * 9. Rejection of non-New status
 * 10. Nonexistent target tenant rejection
 * 11. Duplicate lead ID overwrite prevention
 * 12. Tenant owner CANNOT promote staff to owner
 * 13. Tenant owner CANNOT modify or delete their own member record (self-tampering)
 * 14. Staff member CANNOT promote themselves to owner
 * 15. Tenant owner CAN add and remove staff members
 * 16. Root Administrator (mail.nasiya@gmail.com) CAN provision owner role
 * 17. Normal user profile updates preserving immutable role and tenantId
 * 18. Cross-tenant isolation (Tenant A cannot read, create CRM leads, or update leads in Tenant B)
 * 19. Authenticated tenant member CAN read own tenant leads
 * 20. Authenticated tenant member CAN create CRM lead with internal fields (Path B)
 * 21. Authenticated tenant member CAN update status and append notes
 * 22. Authenticated tenant member CAN log contact history
 * 23. Tenant Owner CAN delete a lead; Staff member CANNOT delete a lead
 * 24. Rejection of authenticated CRM lead create with unexpected field (isAdmin: true)
 * 25. Rejection of authenticated tenant lead update adding unexpected field (internalRole: "owner")
 */

import { beforeAll, afterAll, beforeEach, describe, test, it, expect } from 'vitest';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'bamboo-tangent-x8gvj',
    firestore: {
      rules: fs.readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
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
    // Seed baseline tenant and members in isolated test database
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenants/demo-tarot-kochi').set({ id: 'demo-tarot-kochi', name: 'Tarot Demo' });
      await db.doc('tenants/demo-tarot-kochi/members/tarot_owner_uid').set({
        uid: 'tarot_owner_uid',
        role: 'owner',
        email: 'tarotdemo@leadpilotcrm.internal',
      });
      await db.doc('tenants/demo-tarot-kochi/members/tarot_staff_uid').set({
        uid: 'tarot_staff_uid',
        role: 'staff',
        email: 'staff@leadpilotcrm.internal',
      });
      await db.doc('users/tarot_owner_uid').set({
        uid: 'tarot_owner_uid',
        email: 'tarotdemo@leadpilotcrm.internal',
        displayName: 'Latasha Tarot',
        role: 'owner',
        tenantId: 'demo-tarot-kochi',
      });
    });
  }
});

describe('LeadPilot Hardened Firestore Security Rules', () => {
  // ----------------------------------------------------
  // 1. Anonymous Public Form Submission Boundaries
  // ----------------------------------------------------

  test('1. PASS: Valid public landing page payload (approved fields only, status New)', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const validPublicLead = {
      id: 'LP-20261023-0001',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      businessName: 'Tarot Coaching & Guidance',
      name: 'Priya Sharma',
      phone: '+91 98460 11223',
      email: 'priya@example.com',
      service: 'Personal Tarot Reading',
      details: 'Career guidance consultation',
      address: 'Kochi, Kerala',
      leadSource: 'Landing Page Enquiry (Website)',
      pageUrl: 'https://demo.leadpilot.com',
      status: 'New',
    };
    await assertSucceeds(
      unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').set(validPublicLead)
    );
  });

  test('2. FAIL: Public submission with notes (even empty array) is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWithNotes = {
      id: 'LP-20261023-0002',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
      notes: [], // FORBIDDEN IN PUBLIC PAYLOAD
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0002').set(leadWithNotes));
  });

  test('3. FAIL: Public submission with contactCount (even 0) is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWithCount = {
      id: 'LP-20261023-0003',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
      contactCount: 0, // FORBIDDEN IN PUBLIC PAYLOAD
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0003').set(leadWithCount));
  });

  test('4. FAIL: Public submission with contactLogs (even empty array) is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWithLogs = {
      id: 'LP-20261023-0004',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
      contactLogs: [], // FORBIDDEN IN PUBLIC PAYLOAD
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0004').set(leadWithLogs));
  });

  test('5. FAIL: Public submission with assignedTo is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWithAssignee = {
      id: 'LP-20261023-0005',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
      assignedTo: 'agent_latasha', // FORBIDDEN
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0005').set(leadWithAssignee));
  });

  test('6. FAIL: Public submission with followUpDate is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWithFollowUp = {
      id: 'LP-20261023-0006',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
      followUpDate: '2026-10-25', // FORBIDDEN
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0006').set(leadWithFollowUp));
  });

  test('7. FAIL: Public submission with lastContacted & lastContactMethod is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWithContactHistory = {
      id: 'LP-20261023-0007',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
      lastContacted: '2026-10-23T12:00:00Z',
      lastContactMethod: 'Call',
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0007').set(leadWithContactHistory));
  });

  test('8. FAIL: Public submission with arbitrary unapproved field is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWithGhostField = {
      id: 'LP-20261023-0008',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
      isVipCustomer: true, // UNAPPROVED FIELD
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0008').set(leadWithGhostField));
  });

  test('9. FAIL: Public submission with non-New status is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const leadWonStatus = {
      id: 'LP-20261023-0009',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'Won', // MUST BE 'New'
    };
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0009').set(leadWonStatus));
  });

  test('10. FAIL: Public submission to nonexistent tenant is REJECTED', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const ghostTenantLead = {
      id: 'LP-20261023-0010',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'nonexistent-tenant-xyz',
      name: 'Attacker',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
    };
    await assertFails(unauthDb.doc('tenants/nonexistent-tenant-xyz/leads/LP-20261023-0010').set(ghostTenantLead));
  });

  test('11. FAIL: Public submission cannot overwrite existing lead ID', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const lead = {
      id: 'LP-20261023-DUPE',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      name: 'Original Customer',
      phone: '1234567890',
      service: 'Reading',
      status: 'New',
    };
    await assertSucceeds(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-DUPE').set(lead));
    // Overwrite attempt fails
    await assertFails(unauthDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-DUPE').set({ ...lead, name: 'Hacked Customer' }));
  });

  // ----------------------------------------------------
  // 2. Tenant Role Governance & Anti-Escalation
  // ----------------------------------------------------

  test('12. FAIL: Tenant Owner CANNOT promote staff to owner', async () => {
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();
    await assertFails(
      ownerDb.doc('tenants/demo-tarot-kochi/members/tarot_staff_uid').update({ role: 'owner' })
    );
  });

  test('13. FAIL: Tenant Owner CANNOT modify or delete their own member record (self-tampering)', async () => {
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();
    await assertFails(
      ownerDb.doc('tenants/demo-tarot-kochi/members/tarot_owner_uid').update({ email: 'new@test.com' })
    );
    await assertFails(
      ownerDb.doc('tenants/demo-tarot-kochi/members/tarot_owner_uid').delete()
    );
  });

  test('14. FAIL: Staff member CANNOT promote themselves to owner', async () => {
    const staffDb = testEnv.authenticatedContext('tarot_staff_uid').firestore();
    await assertFails(
      staffDb.doc('tenants/demo-tarot-kochi/members/tarot_staff_uid').update({ role: 'owner' })
    );
  });

  test('15. PASS: Tenant Owner CAN add and remove staff members', async () => {
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();
    // Add staff member
    await assertSucceeds(
      ownerDb.doc('tenants/demo-tarot-kochi/members/new_staff_uid').set({
        uid: 'new_staff_uid',
        role: 'staff',
        email: 'newstaff@test.com',
      })
    );
    // Delete staff member
    await assertSucceeds(
      ownerDb.doc('tenants/demo-tarot-kochi/members/new_staff_uid').delete()
    );
  });

  test('16. PASS: Root Administrator (mail.nasiya@gmail.com) CAN provision owner role', async () => {
    const rootAdminDb = testEnv
      .authenticatedContext('root_admin_uid', {
        email: 'mail.nasiya@gmail.com',
        email_verified: true,
        firebase: { sign_in_provider: 'google.com' },
      })
      .firestore();

    await assertSucceeds(
      rootAdminDb.doc('tenants/demo-tarot-kochi/members/second_owner_uid').set({
        uid: 'second_owner_uid',
        role: 'owner',
        email: 'owner2@test.com',
      })
    );
  });

  test('17. PASS: Existing user profile updates preserve immutable role and tenantId', async () => {
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();
    // Safe update to displayName
    await assertSucceeds(
      ownerDb.doc('users/tarot_owner_uid').update({
        displayName: 'Latasha Tarot Guidance',
      })
    );
    // Tamper attempt on tenantId
    await assertFails(
      ownerDb.doc('users/tarot_owner_uid').update({
        tenantId: 'hacked-tenant',
      })
    );
  });

  // ----------------------------------------------------
  // 3. Cross-Tenant Isolation
  // ----------------------------------------------------

  test('18. FAIL: Member of Tenant A CANNOT read, create CRM leads, or update leads in Tenant B', async () => {
    // Seed Tenant B
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenants/client-apex-hvac').set({ id: 'client-apex-hvac', name: 'Apex HVAC' });
      await db.doc('tenants/client-apex-hvac/members/hvac_user_uid').set({
        uid: 'hvac_user_uid',
        role: 'owner',
        email: 'apex.admin@leadpilotcrm.internal',
      });
      // Seed an existing lead in Tenant A
      await db.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').set({
        id: 'LP-20261023-0001',
        timestamp: '2026-10-23T19:00:00.000Z',
        clientId: 'demo-tarot-kochi',
        businessName: 'Tarot Coaching & Guidance',
        name: 'Priya Sharma',
        phone: '+91 98460 11223',
        service: 'Personal Tarot Reading',
        status: 'New',
        notes: [],
      });
    });

    const hvacDb = testEnv.authenticatedContext('hvac_user_uid').firestore();

    // Cross-tenant read rejected
    await assertFails(hvacDb.collection('tenants/demo-tarot-kochi/leads').get());

    // Cross-tenant CRM lead create with complete, valid schema and internal CRM fields is rejected specifically by membership gate
    const crossTenantCrmLead = {
      id: 'LP-CROSS-01',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      businessName: 'Tarot Coaching & Guidance',
      name: 'Cross Tenant Injected Lead',
      phone: '+91 98460 11223',
      service: 'Personal Tarot Reading',
      details: 'Attempted cross-tenant CRM write',
      status: 'New',
      notes: [{ id: 'n-cross', text: 'Cross-tenant CRM injection', createdAt: '2026-10-23T19:00:00.000Z', author: 'Attacker' }],
      contactCount: 1,
    };
    await assertFails(
      hvacDb.doc('tenants/demo-tarot-kochi/leads/LP-CROSS-01').set(crossTenantCrmLead)
    );

    // Cross-tenant update to existing lead in Tenant A is rejected
    await assertFails(
      hvacDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').update({
        status: 'Contacted',
        notes: [{ id: 'n-tamper', text: 'Tampered by HVAC user', createdAt: '2026-10-23T19:05:00.000Z', author: 'Attacker' }],
      })
    );
  });

  // ----------------------------------------------------
  // 4. Authenticated CRM Operations (Legitimate Member Actions)
  // ----------------------------------------------------

  test('19. PASS: Authenticated tenant member CAN read own tenant leads', async () => {
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();
    const staffDb = testEnv.authenticatedContext('tarot_staff_uid').firestore();

    await assertSucceeds(ownerDb.collection('tenants/demo-tarot-kochi/leads').get());
    await assertSucceeds(staffDb.collection('tenants/demo-tarot-kochi/leads').get());
  });

  test('20. PASS: Authenticated tenant member CAN create CRM lead with internal fields (Path B)', async () => {
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();
    const crmLead = {
      id: 'LP-20261023-CRM01',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      businessName: 'Tarot Coaching & Guidance',
      name: 'Walk-in Client',
      phone: '+91 98460 99887',
      service: 'Personal Tarot Reading',
      details: 'Client visited office in person',
      status: 'Contacted',
      notes: [{ id: 'n1', text: 'Initial intake completed', createdAt: '2026-10-23T19:00:00.000Z', author: 'Latasha' }],
      contactCount: 1,
      contactLogs: [{ id: 'l1', method: 'Call', timestamp: '2026-10-23T19:00:00.000Z', notes: 'Intake call' }],
    };
    await assertSucceeds(
      ownerDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-CRM01').set(crmLead)
    );
  });

  test('21. PASS: Authenticated tenant member CAN update status and append notes', async () => {
    // Seed initial lead
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').set({
        id: 'LP-20261023-0001',
        timestamp: '2026-10-23T19:00:00.000Z',
        clientId: 'demo-tarot-kochi',
        name: 'Priya Sharma',
        phone: '+91 98460 11223',
        service: 'Personal Tarot Reading',
        status: 'New',
        notes: [],
      });
    });

    const staffDb = testEnv.authenticatedContext('tarot_staff_uid').firestore();
    await assertSucceeds(
      staffDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').update({
        status: 'Follow-up',
        followUpDate: '2026-10-26T10:00:00Z',
        notes: [
          { id: 'note-2', text: 'Consultation scheduled', createdAt: '2026-10-23T19:30:00Z', author: 'Staff' },
        ],
      })
    );
  });

  test('22. PASS: Authenticated tenant member CAN log contact history', async () => {
    // Seed initial lead
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').set({
        id: 'LP-20261023-0001',
        timestamp: '2026-10-23T19:00:00.000Z',
        clientId: 'demo-tarot-kochi',
        name: 'Priya Sharma',
        phone: '+91 98460 11223',
        service: 'Personal Tarot Reading',
        status: 'New',
        contactCount: 0,
        contactLogs: [],
      });
    });

    const staffDb = testEnv.authenticatedContext('tarot_staff_uid').firestore();
    await assertSucceeds(
      staffDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').update({
        status: 'Contacted',
        lastContacted: '2026-10-23T19:40:00Z',
        lastContactMethod: 'WhatsApp',
        contactCount: 1,
        contactLogs: [
          { id: 'log-1', method: 'WhatsApp', timestamp: '2026-10-23T19:40:00Z', notes: 'Intro message sent' },
        ],
      })
    );
  });

  test('23. PASS: Tenant Owner CAN delete a lead; Staff member CANNOT delete a lead', async () => {
    // Seed initial lead
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenants/demo-tarot-kochi/leads/LP-20261023-DEL01').set({
        id: 'LP-20261023-DEL01',
        timestamp: '2026-10-23T19:00:00.000Z',
        clientId: 'demo-tarot-kochi',
        name: 'Client to Delete',
        phone: '+91 98460 11223',
        service: 'Personal Tarot Reading',
        status: 'New',
      });
    });

    const staffDb = testEnv.authenticatedContext('tarot_staff_uid').firestore();
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();

    // Staff deletion fails (only owner/admin can delete)
    await assertFails(staffDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-DEL01').delete());

    // Owner deletion succeeds
    await assertSucceeds(ownerDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-DEL01').delete());
  });

  // ----------------------------------------------------
  // 5. Unexpected Fields in Authenticated CRM Lead Documents
  // ----------------------------------------------------

  test('24. FAIL: Authenticated tenant CRM lead create with unexpected field (isAdmin: true) is REJECTED', async () => {
    const ownerDb = testEnv.authenticatedContext('tarot_owner_uid').firestore();
    const crmLeadWithGhostField = {
      id: 'LP-20261023-CRM-GHOST',
      timestamp: '2026-10-23T19:00:00.000Z',
      clientId: 'demo-tarot-kochi',
      businessName: 'Tarot Coaching & Guidance',
      name: 'Walk-in Client',
      phone: '+91 98460 99887',
      service: 'Full Deck Reading',
      details: 'Client visited office in person',
      status: 'New',
      notes: [{ id: 'n1', text: 'Initial note', createdAt: '2026-10-23T19:00:00.000Z', author: 'Latasha' }],
      contactCount: 0,
      contactLogs: [],
      isAdmin: true, // UNEXPECTED FIELD
    };
    await assertFails(
      ownerDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-CRM-GHOST').set(crmLeadWithGhostField)
    );
  });

  test('25. FAIL: Authenticated tenant lead update adding unexpected field (internalRole: "owner") is REJECTED', async () => {
    // Seed initial lead
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').set({
        id: 'LP-20261023-0001',
        timestamp: '2026-10-23T19:00:00.000Z',
        clientId: 'demo-tarot-kochi',
        name: 'Priya Sharma',
        phone: '+91 98460 11223',
        service: 'Personal Tarot Reading',
        status: 'New',
        notes: [],
      });
    });

    const staffDb = testEnv.authenticatedContext('tarot_staff_uid').firestore();
    await assertFails(
      staffDb.doc('tenants/demo-tarot-kochi/leads/LP-20261023-0001').update({
        status: 'Contacted',
        internalRole: 'owner', // UNEXPECTED FIELD
      })
    );
  });
});
