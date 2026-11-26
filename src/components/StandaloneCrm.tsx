import React, { useState, useEffect } from 'react';
import { ClientConfig, TenantRecord } from '../types';
import {
  getCurrentClientSession,
  loginClient,
  loginWithGoogle,
  logoutClient,
  ClientUser,
  onClientAuthStateChanged,
  verifyServerAdminCapabilities,
  claimStaffInviteAtomic,
  fetchPublicWebsiteConfig,
  fetchTenantWebsiteDraft,
  listTenantRecords,
  getTenantRecord,
  getLastGoogleOnboardingError,
  clearLastGoogleOnboardingError,
} from '../auth/clientAuth';
import { auth } from '../firebase';
import { LeadPilotDashboard } from './LeadPilotDashboard';
import { SuperAdminClientDirectory } from './SuperAdminClientDirectory';
import { TenantStaffManager } from './TenantStaffManager';
import { Building2, LogOut, ShieldCheck, UserCheck, Lock, Mail, Key, AlertCircle, RefreshCw, Users, Kanban, UserPlus, CheckCircle2 } from 'lucide-react';
import { CLIENT_PRESETS, DEMO_CLIENT_CONFIG } from '../presets/clientPresets';
import { INDUSTRY_PRESETS } from '../presets/industryPresets';
import { migrateLocalStorageToFirestore } from '../utils/leadStorage';
import { IS_DEV_DEPLOYMENT } from '../config/appTarget';
import { resolveTenantFormEndpoint } from '../config/clientConfigResolver';

interface StandaloneCrmProps {
  defaultClientId?: string;
  initialConfig?: ClientConfig;
}

export const StandaloneCrm: React.FC<StandaloneCrmProps> = ({ defaultClientId = 'demo-tarot-kochi', initialConfig }) => {
  const [currentUser, setCurrentUser] = useState<ClientUser | null>(() => getCurrentClientSession());
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null);
  const [isVerifiedAdmin, setIsVerifiedAdmin] = useState(false);
  const [isRootAdmin, setIsRootAdmin] = useState(false);
  const [isAuthResolving, setIsAuthResolving] = useState<boolean>(() => !getCurrentClientSession());
  const [adminSelectedTenant, setAdminSelectedTenant] = useState<string>('');
  const [adminViewMode, setAdminViewMode] = useState<'crm' | 'directory'>('crm');
  const [clientViewMode, setClientViewMode] = useState<'crm' | 'team'>('crm');
  const [firestoreWebsiteConfig, setFirestoreWebsiteConfig] = useState<{
    tenantId: string;
    config: Partial<ClientConfig>;
  } | null>(null);
  const [adminTenantList, setAdminTenantList] = useState<TenantRecord[]>([]);
  const [onboardingError, setOnboardingError] = useState<string | null>(() => getLastGoogleOnboardingError());
  const [tenantAccessState, setTenantAccessState] = useState<'checking' | 'active' | 'blocked'>('checking');

  // URL Invitation parameters
  const [pendingInvite, setPendingInvite] = useState<{ tenantId: string; hash: string } | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const inviteTenant = params.get('inviteTenant');
      const inviteHash = params.get('inviteHash');
      if (inviteTenant && inviteHash) {
        return { tenantId: inviteTenant.trim(), hash: inviteHash.trim() };
      }
    }
    return null;
  });
  const [claimStatus, setClaimStatus] = useState<{ type: 'loading' | 'success' | 'error'; message: string } | null>(null);

  // Sync auth state with Firebase Auth and resolve admin capabilities before setting user
  useEffect(() => {
    let isMounted = true;
    const unsubscribe = onClientAuthStateChanged(async (user) => {
      if (user && auth.currentUser) {
        const caps = await verifyServerAdminCapabilities(auth.currentUser);
        if (!isMounted) return;
        setIsVerifiedAdmin(caps.isAdmin);
        setIsRootAdmin(caps.isRootAdmin);
        if (caps.isAdmin) {
          setAdminSelectedTenant((prev) => prev || user.clientId || defaultClientId);
          setTenantAccessState('active');
        } else {
          setAdminSelectedTenant('');
        }
        if (!caps.isRootAdmin) {
          setAdminViewMode('crm');
        }
        setOnboardingError(getLastGoogleOnboardingError());
        setCurrentUser(user);
        setIsAuthResolving(false);
      } else {
        if (!isMounted) return;
        setIsVerifiedAdmin(false);
        setIsRootAdmin(false);
        setAdminViewMode('crm');
        setAdminSelectedTenant('');
        setOnboardingError(null);
        setTenantAccessState('checking');
        setCurrentUser(null);
        setIsAuthResolving(false);
      }
    });
    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [defaultClientId]);

  // Verify non-admin tenant membership & active account status on load
  useEffect(() => {
    if (!currentUser) {
      setTenantAccessState('checking');
      return;
    }
    if (isVerifiedAdmin) {
      setTenantAccessState('active');
      return;
    }
    if (!currentUser.clientId) {
      setTenantAccessState('blocked');
      return;
    }

    let isCancelled = false;
    setTenantAccessState('checking');
    getTenantRecord(currentUser.clientId)
      .then((rec) => {
        if (isCancelled) return;
        if (rec && rec.status === 'active') {
          setTenantAccessState('active');
        } else {
          setTenantAccessState('blocked');
        }
      })
      .catch(() => {
        if (!isCancelled) {
          setTenantAccessState('blocked');
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [currentUser?.userId, currentUser?.clientId, isVerifiedAdmin]);

  // Safe migration of existing local records when authenticated
  useEffect(() => {
    if (currentUser?.clientId) {
      migrateLocalStorageToFirestore(currentUser.clientId)
        .then((res) => {
          if (res.migratedCount > 0) {
            setMigrationStatus(res.message);
            setTimeout(() => setMigrationStatus(null), 5000);
          }
        })
        .catch(() => {});
    }
  }, [currentUser?.clientId]);

  // Handle invitation claim automatically when user logs in with an active invite in URL
  useEffect(() => {
    if (currentUser && pendingInvite && auth.currentUser) {
      let isMounted = true;
      const executeClaim = async () => {
        setClaimStatus({ type: 'loading', message: `Verifying invitation for ${pendingInvite.tenantId}...` });
        try {
          const res = await claimStaffInviteAtomic(pendingInvite.tenantId, pendingInvite.hash);
          if (!isMounted) return;
          if (res.success) {
            setClaimStatus({
              type: 'success',
              message: `Invitation accepted! Welcome to the team for ${pendingInvite.tenantId}.`,
            });
            // Update session state
            setCurrentUser((prev) =>
              prev
                ? {
                    ...prev,
                    clientId: pendingInvite.tenantId,
                    role: 'client_staff',
                  }
                : null
            );
            // Clear URL params without full page reload
            if (typeof window !== 'undefined' && window.history) {
              const url = new URL(window.location.href);
              url.searchParams.delete('inviteTenant');
              url.searchParams.delete('inviteHash');
              window.history.replaceState({}, '', url.toString());
            }
            setPendingInvite(null);
            setTimeout(() => setClaimStatus(null), 6000);
          } else {
            setClaimStatus({
              type: 'error',
              message: res.error || 'Failed to claim invitation.',
            });
          }
        } catch (err: any) {
          if (!isMounted) return;
          setClaimStatus({
            type: 'error',
            message: err?.message || 'Error occurred while claiming invitation.',
          });
        }
      };

      executeClaim();
      return () => {
        isMounted = false;
      };
    }
  }, [currentUser, pendingInvite]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsSubmitting(true);

    try {
      const res = await loginClient(loginEmail, loginPassword);
      if (res.success && res.user) {
        const caps = await verifyServerAdminCapabilities(auth.currentUser);
        setIsVerifiedAdmin(caps.isAdmin);
        setIsRootAdmin(caps.isRootAdmin);
        if (caps.isAdmin) {
          setAdminSelectedTenant((prev) => prev || res.user!.clientId || defaultClientId);
        } else {
          setAdminSelectedTenant('');
        }
        if (!caps.isRootAdmin) {
          setAdminViewMode('crm');
        }
        setCurrentUser(res.user);
        setIsAuthResolving(false);
        setLoginEmail('');
        setLoginPassword('');
      } else {
        setLoginError(res.error || 'Authentication failed. Please verify your credentials.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Login failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoginError('');
    setOnboardingError(null);
    clearLastGoogleOnboardingError();
    setIsSubmitting(true);
    try {
      const res = await loginWithGoogle();
      if (res.success && res.user) {
        const caps = await verifyServerAdminCapabilities(auth.currentUser);
        setIsVerifiedAdmin(caps.isAdmin);
        setIsRootAdmin(caps.isRootAdmin);
        if (caps.isAdmin) {
          setAdminSelectedTenant((prev) => prev || res.user!.clientId || defaultClientId);
          setTenantAccessState('active');
        } else {
          setAdminSelectedTenant('');
        }
        if (!caps.isRootAdmin) {
          setAdminViewMode('crm');
        }
        if (!res.user.clientId && res.error) {
          setOnboardingError(res.error);
        }
        setCurrentUser(res.user);
        setIsAuthResolving(false);
      } else {
        setLoginError(res.error || 'Google Sign-In was cancelled or failed.');
      }
    } catch (err: any) {
      setLoginError(err?.message || 'Google Sign-In failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    clearLastGoogleOnboardingError();
    await logoutClient();
    setIsVerifiedAdmin(false);
    setIsRootAdmin(false);
    setAdminViewMode('crm');
    setAdminSelectedTenant('');
    setOnboardingError(null);
    setTenantAccessState('checking');
    setCurrentUser(null);
    setIsAuthResolving(false);
  };

  // Only Root Admin can switch tenants via selector; provisioned admins and regular users stay scoped
  const activeClientId = (isRootAdmin || isVerifiedAdmin) && adminSelectedTenant
    ? adminSelectedTenant
    : (currentUser?.clientId || (IS_DEV_DEPLOYMENT ? defaultClientId : ''));

  // Load Firestore website configuration for the active tenant (picks up saved CONFIG.formEndpoint & branding)
  useEffect(() => {
    const cleanId = (activeClientId || '').trim().toLowerCase();
    if (!currentUser || !cleanId) {
      setFirestoreWebsiteConfig(null);
      return;
    }

    let isCancelled = false;
    async function loadTenantConfig() {
      try {
        if (isVerifiedAdmin) {
          const draftRes = await fetchTenantWebsiteDraft(cleanId);
          if (!isCancelled && draftRes.success && draftRes.config) {
            setFirestoreWebsiteConfig({ tenantId: cleanId, config: draftRes.config });
            return;
          }
        }
        const pubRes = await fetchPublicWebsiteConfig(cleanId);
        if (!isCancelled && pubRes.success && pubRes.config) {
          setFirestoreWebsiteConfig({ tenantId: cleanId, config: pubRes.config });
          return;
        }
        if (!isCancelled) {
          setFirestoreWebsiteConfig(null);
        }
      } catch {
        if (!isCancelled) {
          setFirestoreWebsiteConfig(null);
        }
      }
    }

    loadTenantConfig();
    return () => {
      isCancelled = true;
    };
  }, [activeClientId, currentUser?.userId, isVerifiedAdmin, adminViewMode]);

  // Load registered tenants strictly for Root Admin directory & selector
  useEffect(() => {
    if (!isRootAdmin || !currentUser) {
      setAdminTenantList([]);
      return;
    }
    let isCancelled = false;
    listTenantRecords()
      .then((records) => {
        if (!isCancelled && Array.isArray(records)) {
          setAdminTenantList(records);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [isRootAdmin, currentUser?.userId, adminViewMode]);

  const resolvedConfig: ClientConfig = React.useMemo(() => {
    const cleanId = (activeClientId || '').trim().toLowerCase();
    const rawKey = activeClientId.replace(/^client-/, '').replace(/^demo-/, '');
    const presetConfig: ClientConfig = CLIENT_PRESETS[activeClientId]
      ? CLIENT_PRESETS[activeClientId]
      : INDUSTRY_PRESETS[rawKey]
      ? {
          ...INDUSTRY_PRESETS[rawKey],
          clientId: activeClientId,
          businessName: currentUser?.businessName || INDUSTRY_PRESETS[rawKey].businessName,
        }
      : {
          ...DEMO_CLIENT_CONFIG,
          clientId: activeClientId,
          businessName: currentUser?.businessName || DEMO_CLIENT_CONFIG.businessName,
        };

    const baseline: ClientConfig =
      initialConfig && initialConfig.clientId === activeClientId ? initialConfig : presetConfig;

    // Strict tenant match guard before merging Firestore configuration
    const matchedFirestore =
      firestoreWebsiteConfig && firestoreWebsiteConfig.tenantId === cleanId
        ? firestoreWebsiteConfig.config
        : null;

    const resolvedEndpoint = resolveTenantFormEndpoint({
      tenantId: cleanId,
      firestoreConfig: matchedFirestore,
      initialConfig,
      presetConfig,
    });

    if (matchedFirestore) {
      return {
        ...baseline,
        ...matchedFirestore,
        clientId: activeClientId,
        formEndpoint: resolvedEndpoint,
      };
    }

    return {
      ...baseline,
      formEndpoint: resolvedEndpoint || baseline.formEndpoint || '',
    };
  }, [activeClientId, currentUser, initialConfig, firestoreWebsiteConfig]);

  // Wait for initial Firebase Auth & Firestore profile/admin verification before rendering login or errors
  if (isAuthResolving && !currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col justify-center items-center p-4">
        <RefreshCw className="w-7 h-7 text-blue-400 animate-spin mb-3" />
        <p className="text-sm font-medium">Verifying secure CRM session...</p>
      </div>
    );
  }

  // Production Secure Login Portal
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 selection:bg-blue-600 selection:text-white">
        <div className="w-full max-w-md">
          {/* Brand header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-xl shadow-blue-500/20 mb-4">
              <Building2 className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight">LeadPilot Client CRM</h1>
            <p className="text-sm text-slate-400 mt-1">
              Secure Customer Portal & Lead Management
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
            <div className="flex items-center gap-2 mb-6 pb-4 border-b border-slate-800 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Isolated Tenant Access • Firebase Auth & Security Rules</span>
            </div>

            {pendingInvite && (
              <div className="mb-5 p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-blue-300 mb-1">
                  <UserPlus className="w-4 h-4 text-blue-400" />
                  <span>Team Invitation for "{pendingInvite.tenantId}"</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Please sign in with the email address this invitation was issued to. Your account will be securely enrolled into the organization.
                </p>
              </div>
            )}

            {claimStatus && (
              <div
                className={`mb-5 p-3 rounded-xl text-xs flex items-start gap-2 ${
                  claimStatus.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
                    : claimStatus.type === 'loading'
                    ? 'bg-blue-500/10 border border-blue-500/30 text-blue-300'
                    : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
                }`}
              >
                {claimStatus.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : claimStatus.type === 'loading' ? (
                  <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{claimStatus.message}</span>
              </div>
            )}

            {loginError && (
              <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Google Sign-In Button */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 mb-2 bg-white hover:bg-slate-100 text-slate-800 font-bold rounded-xl shadow transition flex items-center justify-center gap-3 cursor-pointer text-sm disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Sign in with Google</span>
            </button>
            <p className="text-[11px] text-slate-400 text-center mb-4">
              Business owners: Sign in with your approved Google account to connect automatically.
            </p>

            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="px-3 text-slate-500 text-xs uppercase font-medium">Or sign in with email</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 uppercase tracking-wider">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••••••"
                    required
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-sm mt-2"
              >
                {isSubmitting ? (
                  <span>Signing In...</span>
                ) : (
                  <>
                    <Key className="w-4 h-4" />
                    <span>Sign In to CRM Portal</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-800/60 text-center">
              <p className="text-[11px] text-slate-500">
                Data is encrypted and bound to your organization's dedicated tenant boundary.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If authenticated without an assigned tenant (and not verified Root Admin), block access cleanly
  if (!currentUser.clientId && !isVerifiedAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 mb-4 border border-rose-500/30">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">CRM Access Denied</h2>
          <p className="text-xs text-slate-300 mb-3 leading-relaxed">
            {onboardingError ||
              `Signed in as ${currentUser.email}. Your Google account does not have an active business tenant assignment. Access to customer leads is restricted.`}
          </p>
          <p className="text-[11px] text-slate-500 mb-6">
            Signed in as <strong className="text-slate-300">{currentUser.email}</strong>. Ask your LeadPilot administrator to approve your Google email for your business before trying again.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Sign Out & Try Another Account
          </button>
        </div>
      </div>
    );
  }

  // Wait for tenant active verification for non-admin users
  if (!isVerifiedAdmin && tenantAccessState === 'checking') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-300 flex flex-col justify-center items-center p-4">
        <RefreshCw className="w-7 h-7 text-blue-400 animate-spin mb-3" />
        <p className="text-sm font-medium">Checking business account status...</p>
      </div>
    );
  }

  // Block access cleanly if assigned tenant is suspended or membership is inactive
  if (!isVerifiedAdmin && tenantAccessState === 'blocked') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 text-amber-400 mb-4 border border-amber-500/30">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Business Account Inactive or Suspended</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            Signed in as <strong className="text-slate-200">{currentUser.email}</strong>. CRM access for{' '}
            <span className="font-mono text-amber-300">{currentUser.clientId}</span> is currently unavailable because the business account is suspended or your membership is inactive.
          </p>
          <button
            onClick={handleLogout}
            className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl text-xs transition cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // Authenticated Client CRM View
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Migration Notification Banner */}
      {migrationStatus && (
        <div className="bg-emerald-950/80 border-b border-emerald-500/40 px-4 py-2 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>{migrationStatus}</span>
          </div>
          <button
            onClick={() => setMigrationStatus(null)}
            className="text-slate-400 hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Client-Facing Navigation Header */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-600 p-2 rounded-xl text-white shadow-md">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-extrabold text-white leading-tight">
                  {currentUser.businessName || resolvedConfig.businessName}
                </h1>
                <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold px-2 py-0.5 rounded border border-emerald-500/30">
                  Client CRM
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Lead Pipeline & Inquiries • Tenant ID: <span className="font-mono text-emerald-400">{activeClientId}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Server-Verified Root Administrator Navigation Switch */}
            {isRootAdmin && (
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 shadow-inner">
                <button
                  onClick={() => setAdminViewMode('crm')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    adminViewMode === 'crm'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="View CRM Lead Pipeline for Selected Tenant"
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Lead Pipeline</span>
                </button>
                <button
                  onClick={() => setAdminViewMode('directory')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    adminViewMode === 'directory'
                      ? 'bg-amber-500 text-slate-950 font-black shadow'
                      : 'text-amber-400/80 hover:text-amber-300'
                  }`}
                  title="View Platform Client Directory (Root Admin Only)"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Client Directory</span>
                </button>
              </div>
            )}

            {/* Client Owner Team Management Navigation Switch */}
            {currentUser.role === 'client_admin' && !isVerifiedAdmin && (
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 shadow-inner">
                <button
                  onClick={() => setClientViewMode('crm')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    clientViewMode === 'crm'
                      ? 'bg-emerald-600 text-white shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="View Lead Pipeline"
                >
                  <Kanban className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Leads</span>
                </button>
                <button
                  onClick={() => setClientViewMode('team')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    clientViewMode === 'team'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-blue-400/80 hover:text-blue-300'
                  }`}
                  title="Manage Staff & Team Access"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span>Team Access</span>
                </button>
              </div>
            )}

            {/* Root Administrator Tenant Selector (in CRM view) */}
            {isRootAdmin && adminViewMode === 'crm' && (
              <div className="flex items-center gap-2 bg-slate-800/90 border border-amber-500/40 rounded-xl px-3 py-1.5 shadow-sm">
                <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider hidden lg:flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                  Tenant Scope:
                </span>
                <select
                  value={activeClientId}
                  onChange={(e) => setAdminSelectedTenant(e.target.value)}
                  className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2 py-1 focus:outline-none focus:border-amber-500 cursor-pointer"
                >
                  {adminTenantList.map((t) => (
                    <option key={t.tenantId} value={t.tenantId}>
                      {t.businessName} ({t.tenantId})
                    </option>
                  ))}
                  {!adminTenantList.some((t) => t.tenantId === 'demo-tarot-kochi') && (
                    <option value="demo-tarot-kochi">Tarot Coaching & Guidance (demo-tarot-kochi)</option>
                  )}
                  {!adminTenantList.some((t) => t.tenantId === 'roofing-client-01') && (
                    <option value="roofing-client-01">Test Client (roofing-client-01)</option>
                  )}
                  {!adminTenantList.some((t) => t.tenantId === 'client-apex-hvac') && (
                    <option value="client-apex-hvac">Apex Heating & Cooling (client-apex-hvac)</option>
                  )}
                  {!adminTenantList.some((t) => t.tenantId === 'prodrain-plumbing-kochi') && (
                    <option value="prodrain-plumbing-kochi">ProDrain Plumbing (prodrain-plumbing-kochi)</option>
                  )}
                  {!adminTenantList.some((t) => t.tenantId === 'demo-plumbing') && (
                    <option value="demo-plumbing">ProDrain Plumbing (demo-plumbing)</option>
                  )}
                  {!adminTenantList.some((t) => t.tenantId === 'demo-skin-clinic') && (
                    <option value="demo-skin-clinic">GlowAura Skin Clinic (demo-skin-clinic)</option>
                  )}
                </select>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs text-slate-300">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{currentUser.email}</span>
              <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded uppercase font-bold">
                {isRootAdmin ? 'Root Admin' : isVerifiedAdmin ? 'Admin' : currentUser.role === 'client_staff' ? 'Staff' : 'Owner'}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 bg-slate-800 hover:bg-rose-950/40 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 border border-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
              title="Sign out of CRM"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-400" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main View: Root Admin Client Directory, Scoped Client Dashboard, or Tenant Staff Manager */}
      <main className="flex-1">
        {isRootAdmin && adminViewMode === 'directory' ? (
          <SuperAdminClientDirectory
            isRootAdmin={isRootAdmin}
            activeSelectedTenant={activeClientId}
            onSelectTenantScope={(tenantId) => {
              setAdminSelectedTenant(tenantId);
              setAdminViewMode('crm');
            }}
          />
        ) : clientViewMode === 'team' && currentUser.role === 'client_admin' ? (
          <div className="p-4 sm:p-6">
            <TenantStaffManager
              tenantId={activeClientId}
              businessName={currentUser.businessName || resolvedConfig.businessName}
              currentUserUid={currentUser.userId}
              onClose={() => setClientViewMode('crm')}
            />
          </div>
        ) : (
          <LeadPilotDashboard
            currentConfig={resolvedConfig}
            appMode="client"
            currentUserRole={currentUser.role}
          />
        )}
      </main>
    </div>
  );
};
