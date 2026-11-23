import React, { useEffect, useState } from 'react';
import { StandaloneLanding } from './components/StandaloneLanding';
import {
  getAuthoritativeTenantConfig,
  AuthoritativeTenantResult,
  parseAppRoute,
} from './config/appTarget';
import { resolvePublicTenantWebsiteBySlug } from './auth/clientAuth';
import { PortalNotFound } from './components/PortalNotFound';
import { ClientConfig } from './types';

export default function AppLanding() {
  const [currentRoute, setCurrentRoute] = useState(() => parseAppRoute());
  const [resolvedState] = useState<AuthoritativeTenantResult>(() => getAuthoritativeTenantConfig());
  const [dynamicTenantState, setDynamicTenantState] = useState<{
    status: 'idle' | 'loading' | 'resolved' | 'not_found';
    slug: string | null;
    config: ClientConfig | null;
  }>(() => {
    const initialRoute = parseAppRoute();
    if (!initialRoute.isCrmRoute && initialRoute.tenantSlug) {
      return { status: 'loading', slug: initialRoute.tenantSlug, config: null };
    }
    return { status: 'idle', slug: null, config: null };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => setCurrentRoute(parseAppRoute());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const slug = currentRoute.tenantSlug;
    if (!slug) {
      setDynamicTenantState({ status: 'idle', slug: null, config: null });
      return;
    }

    let cancelled = false;
    setDynamicTenantState({ status: 'loading', slug, config: null });

    resolvePublicTenantWebsiteBySlug(slug)
      .then((res) => {
        if (cancelled) return;
        if (res.success && res.tenantId && res.config) {
          setDynamicTenantState({ status: 'resolved', slug, config: res.config });
        } else {
          setDynamicTenantState({ status: 'not_found', slug, config: null });
        }
      })
      .catch(() => {
        if (cancelled) return;
        setDynamicTenantState({ status: 'not_found', slug, config: null });
      });

    return () => {
      cancelled = true;
    };
  }, [currentRoute.tenantSlug]);

  if (currentRoute.tenantSlug) {
    if (dynamicTenantState.status === 'loading' || dynamicTenantState.status === 'idle') {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center font-sans text-sm">
          Loading business portal...
        </div>
      );
    }
    if (dynamicTenantState.status !== 'resolved' || !dynamicTenantState.config) {
      return <PortalNotFound requestedId={currentRoute.tenantSlug} />;
    }
    return (
      <div className="relative">
        <StandaloneLanding config={dynamicTenantState.config} />
      </div>
    );
  }

  if (
    currentRoute.isMultiSegment ||
    (currentRoute.isReserved && !currentRoute.isCrmRoute && currentRoute.rawPath !== '/landing')
  ) {
    return <PortalNotFound requestedId={currentRoute.rawPath} />;
  }

  // Fail-closed tenant isolation check:
  // In production, unmapped hostnames or query-param overrides have isValid: false and config: null
  if (!resolvedState.isValid || !resolvedState.config) {
    const displayHost = resolvedState.tenantId || (typeof window !== 'undefined' ? window.location.hostname : '');
    return <PortalNotFound requestedId={displayHost} />;
  }

  return (
    <div className="relative">
      <StandaloneLanding config={resolvedState.config} />
    </div>
  );
}
