import React, { useState, useEffect, Suspense, lazy } from 'react';
import { INDUSTRY_PRESETS } from './presets/industryPresets';
import { CLIENT_PRESETS, DEMO_CLIENT_CONFIG } from './presets/clientPresets';
import { ClientConfig } from './types';
import { HeaderBar } from './components/HeaderBar';
import { LiveWebsitePreview } from './components/LiveWebsitePreview';
import { StandaloneLanding } from './components/StandaloneLanding';
import {
  getAppTarget,
  AppTarget,
  IS_LANDING_DEPLOYMENT,
  IS_CRM_DEPLOYMENT,
  getAuthoritativeTenantConfig,
  parseAppRoute,
} from './config/appTarget';
import {
  INITIAL_CLIENT_CONFIGS,
  getClientConfigForEnvClientId,
} from './config/clientConfigResolver';
import { resolvePublicTenantWebsiteBySlug } from './auth/clientAuth';
import { PortalNotFound } from './components/PortalNotFound';
import { ArrowLeft } from 'lucide-react';

const StandaloneCrm = lazy(() =>
  import('./components/StandaloneCrm').then((m) => ({ default: m.StandaloneCrm }))
);
const LeadPilotDashboard = lazy(() =>
  import('./components/LeadPilotDashboard').then((m) => ({ default: m.LeadPilotDashboard }))
);
const ConfigEditorDrawer = lazy(() =>
  import('./components/ConfigEditorDrawer').then((m) => ({ default: m.ConfigEditorDrawer }))
);
const CodeExporterModal = lazy(() =>
  import('./components/CodeExporterModal').then((m) => ({ default: m.CodeExporterModal }))
);


export default function App() {
  const isProd = Boolean((import.meta as any).env?.PROD);
  const [currentRoute, setCurrentRoute] = useState(() => parseAppRoute());
  const [authoritativeTenant] = useState(() => getAuthoritativeTenantConfig());
  const [activeTarget, setActiveTarget] = useState<AppTarget>(() => getAppTarget());

  const [dynamicTenantState, setDynamicTenantState] = useState<{
    status: 'idle' | 'loading' | 'resolved' | 'not_found';
    slug: string | null;
    tenantId: string | null;
    config: ClientConfig | null;
    error?: string;
  }>(() => {
    const initialRoute = parseAppRoute();
    if (!IS_CRM_DEPLOYMENT && !initialRoute.isCrmRoute && initialRoute.tenantSlug) {
      return {
        status: 'loading',
        slug: initialRoute.tenantSlug,
        tenantId: null,
        config: null,
      };
    }
    return {
      status: 'idle',
      slug: null,
      tenantId: null,
      config: null,
    };
  });

  const [clientConfigs, setClientConfigs] = useState<Record<string, ClientConfig>>(() => {
    if (IS_LANDING_DEPLOYMENT || IS_CRM_DEPLOYMENT || isProd) {
      if (authoritativeTenant.config) {
        return { [authoritativeTenant.key]: authoritativeTenant.config };
      }
      return {};
    }
    try {
      const saved = localStorage.getItem('master_client_configs');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return parsed;
        }
      }
    } catch {
      // fallback to initial configs
    }
    return INITIAL_CLIENT_CONFIGS;
  });

  const [activePresetKey, setActivePresetKey] = useState<string>(() => {
    if (IS_LANDING_DEPLOYMENT || IS_CRM_DEPLOYMENT || isProd) {
      return authoritativeTenant.key || '';
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const clientParam = params.get('client') || params.get('clientId');
      if (clientParam) {
        if (clientParam.includes('tarot')) return 'demo-tarot-kochi';
        if (clientParam.includes('hvac') || clientParam.includes('apex')) return 'client-apex-hvac';
        if (clientParam.includes('prodrain') || clientParam.includes('plumb')) return 'prodrain-plumbing-kochi';
        if (clientParam.includes('roof')) return 'roofing-client-01';
        return clientParam;
      }
    }
    return 'demo-tarot-kochi';
  });

  const [currentConfig, setCurrentConfig] = useState<ClientConfig | null>(() => {
    if (IS_LANDING_DEPLOYMENT || IS_CRM_DEPLOYMENT || isProd) {
      return authoritativeTenant.config;
    }
    if (activePresetKey && clientConfigs[activePresetKey]) {
      return clientConfigs[activePresetKey];
    }
    if (activePresetKey) {
      const resolved = getClientConfigForEnvClientId(activePresetKey, false);
      if (resolved.isValid && resolved.config) {
        return resolved.config;
      }
    }
    return clientConfigs['demo-tarot-kochi'] || clientConfigs['demo-tarot'] || DEMO_CLIENT_CONFIG;
  });

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'leadpilot' | 'exporter'>(() => {
    try {
      if (typeof window !== 'undefined' && sessionStorage.getItem('leadpilot_restore_onboarding_modal') === 'true') {
        return 'leadpilot';
      }
    } catch {
      // ignore storage access errors
    }
    return 'preview';
  });
  const [appMode, setAppMode] = useState<'development' | 'client'>('development');

  // Keep route state synced on browser history navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      setCurrentRoute(parseAppRoute());
      setActiveTarget(getAppTarget());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Dynamically resolve public tenant website via Firestore /slugs/{slug} -> /tenants/{tenantId}/public/website
  useEffect(() => {
    if (IS_CRM_DEPLOYMENT || activeTarget === 'crm' || currentRoute.isCrmRoute) {
      return;
    }

    const slug = currentRoute.tenantSlug;
    if (!slug) {
      setDynamicTenantState({
        status: 'idle',
        slug: null,
        tenantId: null,
        config: null,
      });
      return;
    }

    let isCancelled = false;
    setDynamicTenantState({
      status: 'loading',
      slug,
      tenantId: null,
      config: null,
    });

    resolvePublicTenantWebsiteBySlug(slug)
      .then((res) => {
        if (isCancelled) return;
        if (res.success && res.tenantId && res.config) {
          setDynamicTenantState({
            status: 'resolved',
            slug,
            tenantId: res.tenantId,
            config: res.config,
          });
        } else {
          setDynamicTenantState({
            status: 'not_found',
            slug,
            tenantId: null,
            config: null,
            error: res.error,
          });
        }
      })
      .catch((err: any) => {
        if (isCancelled) return;
        setDynamicTenantState({
          status: 'not_found',
          slug,
          tenantId: null,
          config: null,
          error: err?.message || 'Failed to resolve tenant website.',
        });
      });

    return () => {
      isCancelled = true;
    };
  }, [currentRoute.tenantSlug, currentRoute.isCrmRoute, activeTarget]);

  // Persist master client configs to localStorage in dev mode
  useEffect(() => {
    if (!IS_LANDING_DEPLOYMENT && !IS_CRM_DEPLOYMENT) {
      try {
        localStorage.setItem('master_client_configs', JSON.stringify(clientConfigs));
      } catch {
        // ignore storage quota errors
      }
    }
  }, [clientConfigs]);

  const handleSelectPreset = (presetKey: string) => {
    if (clientConfigs[presetKey]) {
      setActivePresetKey(presetKey);
      setCurrentConfig(JSON.parse(JSON.stringify(clientConfigs[presetKey])));
      return;
    }

    if (INDUSTRY_PRESETS[presetKey]) {
      const template = INDUSTRY_PRESETS[presetKey];
      const newClientKey = `client-${presetKey}`;

      if (clientConfigs[newClientKey]) {
        setActivePresetKey(newClientKey);
        setCurrentConfig(JSON.parse(JSON.stringify(clientConfigs[newClientKey])));
        return;
      }

      const newClientConfig: ClientConfig = {
        ...JSON.parse(JSON.stringify(template)),
        clientId: `${presetKey}-client-01`,
        businessName: template.businessName || `New ${template.industry} Business`,
      };

      setClientConfigs((prev) => ({
        ...prev,
        [newClientKey]: newClientConfig,
      }));
      setActivePresetKey(newClientKey);
      setCurrentConfig(newClientConfig);
      return;
    }
  };

  const handleUpdateConfig = (newConfig: ClientConfig) => {
    setCurrentConfig(newConfig);
    setClientConfigs((prev) => ({
      ...prev,
      [activePresetKey]: JSON.parse(JSON.stringify(newConfig)),
    }));
  };

  const handleResetPreset = () => {
    const rawKey = activePresetKey.replace(/^client-/, '');
    const source = CLIENT_PRESETS[activePresetKey] || INDUSTRY_PRESETS[rawKey] || INDUSTRY_PRESETS[activePresetKey];
    if (source) {
      const resetConfig = JSON.parse(JSON.stringify(source));
      setCurrentConfig(resetConfig);
      setClientConfigs((prev) => ({
        ...prev,
        [activePresetKey]: resetConfig,
      }));
    }
  };

  const handleSetAppMode = (mode: 'development' | 'client') => {
    setAppMode(mode);
    if (mode === 'client' && viewMode === 'exporter') {
      setViewMode('leadpilot');
    }
  };

  // --------------------------------------------------------------------------
  // 1. DEDICATED CUSTOMER-FACING CRM DEPLOYMENT OR /crm RUNTIME ROUTE
  // --------------------------------------------------------------------------
  if (IS_CRM_DEPLOYMENT || activeTarget === 'crm') {
    const crmTenantSegment = currentRoute.crmSubPath ? currentRoute.crmSubPath.split('/')[0] : null;
    const crmClientId = crmTenantSegment || currentConfig?.clientId || authoritativeTenant.tenantId || 'demo-tarot-kochi';
    return (
      <div className="relative">
        <Suspense fallback={<div className="min-h-screen bg-slate-900 flex items-center justify-center text-slate-400">Loading LeadPilot CRM...</div>}>
          <StandaloneCrm defaultClientId={crmClientId} initialConfig={currentConfig || undefined} />
        </Suspense>

        {/* Floating return badge only if previewed inside Dev Environment */}
        {!IS_CRM_DEPLOYMENT && !isProd && (
          <div className="fixed bottom-4 right-4 z-50 bg-slate-900/95 text-white border border-slate-700 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3 backdrop-blur-md text-xs">
            <span className="bg-emerald-500/20 text-emerald-300 font-extrabold px-2 py-0.5 rounded text-[10px]">
              Dev Preview: CRM
            </span>
            <button
              onClick={() => setActiveTarget('landing')}
              className="hover:text-blue-400 font-bold underline transition cursor-pointer"
            >
              Test Landing
            </button>
            <button
              onClick={() => setActiveTarget('dev')}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 transition cursor-pointer shadow"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dev Suite</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // 2. DYNAMIC PUBLIC TENANT SLUG ROUTE (/apex-hvac, /tarot-kochi, /prodrain-plumbing)
  // --------------------------------------------------------------------------
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

  // Fail closed for multi-segment public paths or non-CRM reserved paths (/admin, /api, /assets, etc.)
  if (
    currentRoute.isMultiSegment ||
    (currentRoute.isReserved && !currentRoute.isCrmRoute && currentRoute.rawPath !== '/landing')
  ) {
    return <PortalNotFound requestedId={currentRoute.rawPath} />;
  }

  // --------------------------------------------------------------------------
  // 3. ROOT / AUTHORITATIVE HOSTNAME OR DEV LANDING GUARDS
  // --------------------------------------------------------------------------
  if (!currentConfig || (isProd && !authoritativeTenant.isValid)) {
    const displayHost = authoritativeTenant.tenantId || (typeof window !== 'undefined' ? window.location.hostname : '');
    return <PortalNotFound requestedId={displayHost} />;
  }

  // --------------------------------------------------------------------------
  // 4. DEDICATED PUBLIC LANDING WEBSITE DEPLOYMENT OR DEV LANDING PREVIEW
  // --------------------------------------------------------------------------
  if (IS_LANDING_DEPLOYMENT || activeTarget === 'landing') {
    return (
      <div className="relative">
        <StandaloneLanding config={currentConfig} />

        {/* Floating return badge only if previewed inside Dev Environment */}
        {!IS_LANDING_DEPLOYMENT && !isProd && (
          <div className="fixed bottom-4 right-4 z-50 bg-slate-900/95 text-white border border-slate-700 rounded-full px-4 py-2 shadow-2xl flex items-center gap-3 backdrop-blur-md text-xs">
            <span className="bg-indigo-500/20 text-indigo-300 font-extrabold px-2 py-0.5 rounded text-[10px]">
              Dev Preview: Landing
            </span>
            <button
              onClick={() => setActiveTarget('crm')}
              className="hover:text-blue-400 font-bold underline transition cursor-pointer"
            >
              Test CRM
            </button>
            <button
              onClick={() => setActiveTarget('dev')}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1 transition cursor-pointer shadow"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Dev Suite</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  // --------------------------------------------------------------------------
  // 4. MASTER INTERNAL DEVELOPMENT SUITE
  // --------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans">
      {/* Top Controller Bar */}
      <HeaderBar
        currentConfig={currentConfig}
        activePresetKey={activePresetKey}
        clientConfigs={clientConfigs}
        onSelectPreset={handleSelectPreset}
        onOpenEditor={() => setIsEditorOpen(true)}
        viewMode={viewMode}
        setViewMode={setViewMode}
        appMode={appMode}
        setAppMode={handleSetAppMode}
        isClientDeployment={false}
        targetOverride={activeTarget}
        setTargetOverride={setActiveTarget}
      />

      {/* Main Mode Area */}
      <main className="flex-1">
        <Suspense fallback={<div className="p-12 text-center text-slate-400">Loading view...</div>}>
          {viewMode === 'preview' ? (
            <LiveWebsitePreview config={currentConfig} appMode={appMode} />
          ) : viewMode === 'leadpilot' ? (
            <LeadPilotDashboard currentConfig={currentConfig} appMode={appMode} />
          ) : (
            <CodeExporterModal
              config={currentConfig}
              onClose={() => setViewMode('preview')}
            />
          )}
        </Suspense>
      </main>

      {/* Config Drawer Editor */}
      <Suspense fallback={null}>
        <ConfigEditorDrawer
          isOpen={isEditorOpen && appMode === 'development'}
          onClose={() => setIsEditorOpen(false)}
          config={currentConfig}
          onChangeConfig={handleUpdateConfig}
          onResetPreset={handleResetPreset}
        />
      </Suspense>
    </div>
  );
}
