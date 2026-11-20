import React, { useState } from 'react';
import { StandaloneLanding } from './components/StandaloneLanding';
import { getAuthoritativeTenantConfig, AuthoritativeTenantResult } from './config/appTarget';
import { PortalNotFound } from './components/PortalNotFound';

export default function AppLanding() {
  const [resolvedState] = useState<AuthoritativeTenantResult>(() => getAuthoritativeTenantConfig());

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

