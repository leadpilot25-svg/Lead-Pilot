import React, { useState, useEffect } from 'react';
import {
  createStaffInvite,
  revokeStaffInvite,
  listTenantMembers,
  listTenantInvites,
  removeTenantStaffMember,
  TenantMemberRecord,
  TenantStaffInvite,
} from '../auth/clientAuth';
import {
  Users,
  UserPlus,
  Mail,
  Trash2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  MessageSquare,
  X,
  UserMinus,
  KeyRound,
} from 'lucide-react';

interface TenantStaffManagerProps {
  tenantId: string;
  businessName: string;
  currentUserUid: string;
  onClose?: () => void;
  embedded?: boolean;
}

export const TenantStaffManager: React.FC<TenantStaffManagerProps> = ({
  tenantId,
  businessName,
  currentUserUid,
  onClose,
  embedded = false,
}) => {
  const [members, setMembers] = useState<TenantMemberRecord[]>([]);
  const [invites, setInvites] = useState<TenantStaffInvite[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [newStaffEmail, setNewStaffEmail] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [newInviteLink, setNewInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  // Load team members and pending invites
  const loadTeamData = async () => {
    setIsLoading(true);
    try {
      const [membersList, invitesList] = await Promise.all([
        listTenantMembers(tenantId),
        listTenantInvites(tenantId),
      ]);
      setMembers(membersList);
      setInvites(invitesList.filter((inv) => inv.status === 'pending'));
    } catch (err: any) {
      console.warn('Could not load team data:', err);
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Could not load team members or invitations.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTeamData();
  }, [tenantId]);

  // Create Staff Invite
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffEmail || !newStaffEmail.includes('@')) {
      setStatusMessage({ type: 'error', text: 'Please enter a valid email address.' });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    setNewInviteLink(null);
    setCopiedLink(false);

    try {
      const res = await createStaffInvite(tenantId, newStaffEmail);
      if (res.success && res.inviteLink) {
        setNewInviteLink(res.inviteLink);
        setNewStaffEmail('');
        setStatusMessage({
          type: 'success',
          text: `Invitation generated for ${res.invite?.email}. Share the invitation link below.`,
        });
        await loadTeamData();
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to create staff invitation.',
        });
        if (res.inviteLink) {
          setNewInviteLink(res.inviteLink);
        }
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error creating staff invitation.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Revoke Invite
  const handleRevokeInvite = async (emailHash: string, email: string) => {
    if (!window.confirm(`Are you sure you want to revoke the pending invitation for "${email}"?`)) {
      return;
    }

    try {
      const res = await revokeStaffInvite(tenantId, emailHash);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Invitation for "${email}" was revoked.`,
        });
        await loadTeamData();
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to revoke invitation.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error revoking invitation.',
      });
    }
  };

  // Remove Staff Member
  const handleRemoveMember = async (memberUid: string, email: string) => {
    if (memberUid === currentUserUid) {
      setStatusMessage({
        type: 'warning',
        text: 'You cannot remove yourself from the organization.',
      });
      return;
    }

    if (!window.confirm(`Are you sure you want to remove "${email}" from the organization? They will immediately lose access to CRM leads.`)) {
      return;
    }

    try {
      const res = await removeTenantStaffMember(tenantId, memberUid);
      if (res.success) {
        setStatusMessage({
          type: 'success',
          text: `Staff member "${email}" was removed.`,
        });
        await loadTeamData();
      } else {
        setStatusMessage({
          type: 'error',
          text: res.error || 'Failed to remove member.',
        });
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'Error removing staff member.',
      });
    }
  };

  // Copy Invite Link to Clipboard
  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

  // Format expiry display
  const formatExpiryNotice = (expiresAtStr: string) => {
    if (!expiresAtStr) return '7 days';
    const expiresMs = new Date(expiresAtStr).getTime();
    const remainingHours = Math.max(0, Math.round((expiresMs - Date.now()) / (1000 * 60 * 60)));
    if (remainingHours > 24) {
      const days = Math.round(remainingHours / 24);
      return `Expires in ~${days} day${days > 1 ? 's' : ''}`;
    }
    return `Expires in ~${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`;
  };

  return (
    <div
      className={
        embedded
          ? 'text-slate-100'
          : 'bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-8 shadow-xl max-w-4xl mx-auto my-6 text-slate-100'
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Team & Staff Access</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage authorized team members for <strong className="text-slate-200">{businessName}</strong> ({tenantId})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTeamData}
            disabled={isLoading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
            title="Refresh team members"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition cursor-pointer"
              title="Close team management"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status Notifications */}
      {statusMessage && (
        <div
          className={`mt-4 p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-300'
              : statusMessage.type === 'warning'
              ? 'bg-amber-950/60 border border-amber-500/40 text-amber-300'
              : 'bg-rose-950/60 border border-rose-500/40 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <span className="flex-1">{statusMessage.text}</span>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Generated Invite Link Banner */}
      {newInviteLink && (
        <div className="mt-4 p-4 rounded-xl bg-blue-950/70 border border-blue-500/40 text-blue-200">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-blue-300">
              <KeyRound className="w-4 h-4 text-blue-400" />
              <span>Shareable Invitation Link (Expires in 7 Days)</span>
            </div>
            <span className="text-[10px] bg-blue-500/20 px-2 py-0.5 rounded text-blue-300 font-bold uppercase">
              Single-Use
            </span>
          </div>
          <p className="text-xs text-slate-300 mb-3">
            Send this link to the staff member via WhatsApp or Email. They will authenticate with their email address to claim membership.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={newInviteLink}
              className="w-full sm:flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 select-all"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopyLink(newInviteLink)}
                className="min-h-[40px] flex-1 sm:flex-initial px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Hi! Here is your invitation link to join the ${businessName} CRM team on LeadPilot: ${newInviteLink}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] flex-1 sm:flex-initial px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition shadow"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Invite New Staff Form */}
      <div className="mt-6 p-4 rounded-xl bg-slate-950/60 border border-slate-800">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-blue-400" />
          <span>Invite Staff Member</span>
        </h3>
        <p className="text-xs text-slate-400 mb-3">
          Staff members can view and update customer leads in your CRM pipeline. They cannot delete leads or manage team accounts.
        </p>

        <form onSubmit={handleInviteSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="email"
              value={newStaffEmail}
              onChange={(e) => setNewStaffEmail(e.target.value)}
              placeholder="colleague@yourcompany.com"
              required
              className="w-full pl-9 pr-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            {isSubmitting ? (
              <span>Generating...</span>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create Staff Invite</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Pending Invitations Section */}
      <div className="mt-6">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Clock className="w-4 h-4 text-amber-400" />
          <span>Pending Invitations ({invites.length})</span>
        </h3>

        {invites.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-500 text-center">
            No pending invitations. Use the form above to invite team members.
          </div>
        ) : (
          <div className="space-y-2">
            {invites.map((inv) => {
              const origin = typeof window !== 'undefined' ? window.location.origin : '';
              const link = `${origin}/?target=crm&inviteTenant=${encodeURIComponent(tenantId)}&inviteHash=${encodeURIComponent(inv.emailHash)}`;
              return (
                <div
                  key={inv.emailHash}
                  className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                      {inv.email.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-white">{inv.email}</div>
                      <div className="text-[11px] text-amber-400/90 flex items-center gap-1">
                        <span>Role: Staff</span>
                        <span>•</span>
                        <span>{formatExpiryNotice(inv.expiresAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(link)}
                      className="min-h-[38px] px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Copy invitation link"
                    >
                      <Copy className="w-3 h-3" />
                      <span>Copy Link</span>
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(`Hi! Here is your invitation link to join the ${businessName} CRM team on LeadPilot: ${link}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[38px] px-2.5 py-1.5 bg-emerald-600/80 hover:bg-emerald-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition"
                      title="Share link via WhatsApp"
                    >
                      <MessageSquare className="w-3 h-3" />
                      <span>WhatsApp</span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleRevokeInvite(inv.emailHash, inv.email)}
                      className="min-h-[38px] px-2.5 py-1.5 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 text-rose-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Revoke invitation"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Revoke</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Active Team Members Section */}
      <div className="mt-8">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Active Team Members ({members.length})</span>
        </h3>

        {members.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs text-slate-500 text-center">
            Loading team members...
          </div>
        ) : (
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.uid}
                className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      member.role === 'owner'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}
                  >
                    {member.email.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold text-white flex items-center gap-2">
                      <span>{member.email}</span>
                      {member.uid === currentUserUid && (
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">You</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span className="capitalize">{member.role === 'owner' ? 'Organization Owner' : 'Staff Member'}</span>
                      {member.addedAt && (
                        <>
                          <span>•</span>
                          <span>Added {new Date(member.addedAt).toLocaleDateString()}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  {member.role === 'staff' && member.uid !== currentUserUid && (
                    <button
                      onClick={() => handleRemoveMember(member.uid, member.email)}
                      className="px-2.5 py-1.5 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 rounded-lg text-[11px] font-bold flex items-center gap-1 transition cursor-pointer"
                      title="Remove staff member"
                    >
                      <UserMinus className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  )}
                  {member.role === 'owner' && (
                    <span className="text-[11px] text-amber-400/90 font-bold px-2 py-1 bg-amber-500/10 rounded-md border border-amber-500/20">
                      Owner
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Security Notice Footer */}
      <div className="mt-8 pt-4 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <span>
          Enforced by Cloud Firestore Rules: Staff members cannot delete leads, access other tenants, or invite other users.
        </span>
      </div>
    </div>
  );
};
