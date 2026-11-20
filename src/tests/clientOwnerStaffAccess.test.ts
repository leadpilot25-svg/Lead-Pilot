/**
 * Phase 2D: Client Owner and Staff Access Security Verification Suite
 *
 * Exercises static rules analysis, parsed logic verification, and in-memory evaluation of:
 * 1. Deterministic staff invitations keyed by SHA-256 email hash (/tenants/{tenantId}/invites/{emailHash})
 * 2. Mandatory role == 'staff' for invitations created by Tenant Owners (escalation to 'owner' strictly blocked)
 * 3. 7-day safe expiry window validation (expiresAt > request.time && expiresAt <= request.time + 7 days)
 * 4. Expired invitations rejection during atomic claim
 * 5. Single-use invitation lifecycle (pending -> claimed) & prevention of invite re-use
 * 6. Revocation hardening (only Tenant Owner, pending status only, strictly status field mutated)
 * 7. Verified email match requirement (unverified tokens or mismatched emails blocked)
 * 8. Removal of direct owner staff enrollment (Path B removed; staff MUST claim via verified invite)
 * 9. Preservation of Root Admin ownership provisioning
 * 10. Staff lead boundaries: staff can read/update leads, but CANNOT delete leads
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 2D: Client Owner & Staff Access Security Rules Audit & Simulation', () => {
  const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
  const rulesContent = fs.readFileSync(rulesPath, 'utf8');

  // =========================================================================
  // SECTION A: STATIC SECURITY RULES AUDIT (firestore.rules)
  // =========================================================================
  describe('Section A: Static Security Rules Parsing for Staff Invites & Members', () => {
    it('1. match /invites/{emailHash} exists under /tenants/{tenantId}', () => {
      expect(rulesContent).toContain('match /invites/{emailHash}');
      const inviteBlock = rulesContent.match(/match \/invites\/\{emailHash\}\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
      expect(inviteBlock).not.toBe('');
    });

    it('2. Invite creation enforces role: "staff", status: "pending", and bounded expiresAt', () => {
      const inviteBlock = rulesContent.match(/match \/invites\/\{emailHash\}\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
      expect(inviteBlock).toContain("isTenantOwner(tenantId)");
      expect(inviteBlock).toContain("request.resource.data.role == 'staff'");
      expect(inviteBlock).toContain("request.resource.data.status == 'pending'");
      // Expiry safe bounds: > request.time and <= request.time + 7 days
      expect(inviteBlock).toContain("request.resource.data.expiresAt > request.time");
      expect(inviteBlock).toContain("request.resource.data.expiresAt <= request.time + duration.value(7, 'd')");
      // Must reject if already exists (no overwriting existing invite)
      expect(inviteBlock).toContain("!exists(/databases/$(database)/documents/tenants/$(tenantId)/invites/$(emailHash))");
    });

    it('3. Invite claim enforces verified email match, not expired, and existsAfter member doc', () => {
      const inviteBlock = rulesContent.match(/match \/invites\/\{emailHash\}\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
      expect(inviteBlock).toContain("request.auth.token.email_verified == true");
      expect(inviteBlock).toContain("resource.data.email == request.auth.token.email");
      expect(inviteBlock).toContain("resource.data.status == 'pending'");
      expect(inviteBlock).toContain("request.time < resource.data.expiresAt");
      expect(inviteBlock).toContain("request.resource.data.status == 'claimed'");
      expect(inviteBlock).toContain("existsAfter(/databases/$(database)/documents/tenants/$(tenantId)/members/$(request.auth.uid))");
    });

    it('4. Invite revocation strictly restricts mutation to status only for pending invites', () => {
      const inviteBlock = rulesContent.match(/match \/invites\/\{emailHash\}\s*\{[\s\S]*?\n\s*\}/)?.[0] || '';
      expect(inviteBlock).toContain("isTenantOwner(tenantId)");
      expect(inviteBlock).toContain("resource.data.status == 'pending'");
      expect(inviteBlock).toContain("request.resource.data.status == 'revoked'");
      expect(inviteBlock).toContain("request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status'])");
    });

    it('5. Member create rule removes direct owner enrollment (Path B) and mandates Path C atomic invite claim', () => {
      const memberBlock = rulesContent.match(/match \/members\/\{memberUid\}\s*\{[\s\S]*?allow create: if[\s\S]*?\);/)?.[0] || '';
      // Root admin provisioning is preserved
      expect(memberBlock).toContain("isRootAdmin() && isValidMemberData(request.resource.data, memberUid)");
      // Direct owner enrollment is NOT present
      expect(memberBlock).not.toContain("isValidStaffMemberData(request.resource.data, memberUid)");
      // Atomic claim path is present
      expect(memberBlock).toContain("request.auth.uid == memberUid");
      expect(memberBlock).toContain("request.auth.token.email_verified == true");
      expect(memberBlock).toContain("request.resource.data.role == 'staff'");
      expect(memberBlock).toContain("request.time < getStaffInvite(tenantId, request.resource.data.inviteHash).data.expiresAt");
      expect(memberBlock).toContain("getAfter(/databases/$(database)/documents/tenants/$(tenantId)/invites/$(request.resource.data.inviteHash)).data.status == 'claimed'");
    });

    it('6. Lead deletion remains strictly restricted to Tenant Owner and Root Admin', () => {
      const deleteRule = rulesContent.match(/allow delete:\s*if\s*isTenantOwner\(tenantId\)\s*\|\|\s*isAdmin\(\);/)?.[0] || '';
      expect(deleteRule).not.toBe('');
      // Staff members cannot delete leads (delete rule does not contain isTenantMember)
      expect(deleteRule).not.toContain("isTenantMember");
    });
  });

  // =========================================================================
  // SECTION B: IN-MEMORY EVALUATION OF ATOMIC INVITE LIFECYCLE
  // =========================================================================
  describe('Section B: In-Memory Invitation Lifecycle & Role Validation Simulation', () => {
    interface InviteDoc {
      email: string;
      emailHash: string;
      role: 'staff';
      status: 'pending' | 'claimed' | 'revoked';
      tenantId: string;
      invitedBy: string;
      createdAt: number;
      expiresAt: number;
      claimedBy?: string;
    }

    interface AuthToken {
      uid: string;
      email: string;
      email_verified: boolean;
      firebase?: { sign_in_provider: string };
    }

    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

    // Simulate rule validation for creating an invite
    const evaluateCreateInvite = (
      isOwner: boolean,
      role: string,
      status: string,
      currentTime: number,
      expiresAt: number
    ): boolean => {
      if (!isOwner) return false;
      if (role !== 'staff') return false; // Escalation to owner rejected
      if (status !== 'pending') return false;
      if (expiresAt <= currentTime) return false; // Expiry must be in future
      if (expiresAt > currentTime + SEVEN_DAYS_MS) return false; // Expiry cannot exceed 7 days
      return true;
    };

    // Simulate rule validation for claiming an invite
    const evaluateClaimInvite = (
      auth: AuthToken | null,
      invite: InviteDoc | null,
      currentTime: number,
      willUpdateInviteStatusToClaimed: boolean,
      targetRole: string
    ): boolean => {
      if (!auth) return false;
      if (!auth.email_verified) return false;
      if (!invite) return false;
      if (invite.status !== 'pending') return false; // Re-use of claimed or revoked invites rejected
      if (auth.email.toLowerCase() !== invite.email.toLowerCase()) return false; // Mismatched email rejected
      if (currentTime >= invite.expiresAt) return false; // Expired invite rejected
      if (targetRole !== 'staff') return false; // Member must be staff
      if (!willUpdateInviteStatusToClaimed) return false; // Must atomically mark claimed
      return true;
    };

    // Simulate rule validation for revoking an invite
    const evaluateRevokeInvite = (
      isOwner: boolean,
      invite: InviteDoc | null,
      mutatedKeys: string[]
    ): boolean => {
      if (!isOwner) return false;
      if (!invite || invite.status !== 'pending') return false;
      // Affected keys must ONLY be status
      return mutatedKeys.length === 1 && mutatedKeys[0] === 'status';
    };

    const now = 1700000000000;

    it('1. Owner creates valid staff invite with 7-day expiry', () => {
      const validExpiry = now + SEVEN_DAYS_MS - 60000; // 7 days minus 1 min buffer
      expect(evaluateCreateInvite(true, 'staff', 'pending', now, validExpiry)).toBe(true);
    });

    it('2. Escalation blocked: Owner cannot create an owner invite', () => {
      const validExpiry = now + SEVEN_DAYS_MS - 60000;
      expect(evaluateCreateInvite(true, 'owner', 'pending', now, validExpiry)).toBe(false);
    });

    it('3. Excessive expiry rejected: Expiry exceeding 7 days is blocked', () => {
      const excessiveExpiry = now + (8 * 24 * 60 * 60 * 1000); // 8 days
      expect(evaluateCreateInvite(true, 'staff', 'pending', now, excessiveExpiry)).toBe(false);
    });

    it('4. Non-owner cannot create invites', () => {
      const validExpiry = now + SEVEN_DAYS_MS - 60000;
      expect(evaluateCreateInvite(false, 'staff', 'pending', now, validExpiry)).toBe(false);
    });

    it('5. Atomic claim succeeds for matching verified email before expiry', () => {
      const invite: InviteDoc = {
        email: 'sarah@apex.com',
        emailHash: 'hash_sarah',
        role: 'staff',
        status: 'pending',
        tenantId: 'client-apex-hvac',
        invitedBy: 'owner_uid',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
      };

      const userAuth: AuthToken = {
        uid: 'sarah_uid',
        email: 'sarah@apex.com',
        email_verified: true,
      };

      expect(evaluateClaimInvite(userAuth, invite, now + 1000, true, 'staff')).toBe(true);
    });

    it('6. Re-use rejected: Claiming an already claimed invite fails', () => {
      const claimedInvite: InviteDoc = {
        email: 'sarah@apex.com',
        emailHash: 'hash_sarah',
        role: 'staff',
        status: 'claimed',
        tenantId: 'client-apex-hvac',
        invitedBy: 'owner_uid',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
        claimedBy: 'previous_user',
      };

      const userAuth: AuthToken = {
        uid: 'sarah_uid',
        email: 'sarah@apex.com',
        email_verified: true,
      };

      expect(evaluateClaimInvite(userAuth, claimedInvite, now + 1000, true, 'staff')).toBe(false);
    });

    it('7. Expiry enforced: Claiming an expired invite fails', () => {
      const expiredInvite: InviteDoc = {
        email: 'sarah@apex.com',
        emailHash: 'hash_sarah',
        role: 'staff',
        status: 'pending',
        tenantId: 'client-apex-hvac',
        invitedBy: 'owner_uid',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
      };

      const userAuth: AuthToken = {
        uid: 'sarah_uid',
        email: 'sarah@apex.com',
        email_verified: true,
      };

      // Attempting claim 8 days later
      const eightDaysLater = now + (8 * 24 * 60 * 60 * 1000);
      expect(evaluateClaimInvite(userAuth, expiredInvite, eightDaysLater, true, 'staff')).toBe(false);
    });

    it('8. Identity verification: Unverified email cannot claim invite', () => {
      const invite: InviteDoc = {
        email: 'sarah@apex.com',
        emailHash: 'hash_sarah',
        role: 'staff',
        status: 'pending',
        tenantId: 'client-apex-hvac',
        invitedBy: 'owner_uid',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
      };

      const unverifiedAuth: AuthToken = {
        uid: 'sarah_uid',
        email: 'sarah@apex.com',
        email_verified: false, // Unverified
      };

      expect(evaluateClaimInvite(unverifiedAuth, invite, now + 1000, true, 'staff')).toBe(false);
    });

    it('9. Anti-spoofing: Email mismatch cannot claim invite', () => {
      const invite: InviteDoc = {
        email: 'sarah@apex.com',
        emailHash: 'hash_sarah',
        role: 'staff',
        status: 'pending',
        tenantId: 'client-apex-hvac',
        invitedBy: 'owner_uid',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
      };

      const attackerAuth: AuthToken = {
        uid: 'attacker_uid',
        email: 'attacker@evil.com',
        email_verified: true,
      };

      expect(evaluateClaimInvite(attackerAuth, invite, now + 1000, true, 'staff')).toBe(false);
    });

    it('10. Revocation hardening: Owner can revoke status only', () => {
      const invite: InviteDoc = {
        email: 'sarah@apex.com',
        emailHash: 'hash_sarah',
        role: 'staff',
        status: 'pending',
        tenantId: 'client-apex-hvac',
        invitedBy: 'owner_uid',
        createdAt: now,
        expiresAt: now + SEVEN_DAYS_MS,
      };

      // Valid revocation: modifies status only
      expect(evaluateRevokeInvite(true, invite, ['status'])).toBe(true);

      // Malicious revocation: attempts to mutate email or role
      expect(evaluateRevokeInvite(true, invite, ['status', 'email'])).toBe(false);
      expect(evaluateRevokeInvite(true, invite, ['status', 'role'])).toBe(false);

      // Non-owner cannot revoke
      expect(evaluateRevokeInvite(false, invite, ['status'])).toBe(false);
    });
  });
});
