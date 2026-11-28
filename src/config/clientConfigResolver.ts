import { ClientConfig } from '../types';
import { INDUSTRY_PRESETS } from '../presets/industryPresets';
import {
  CLIENT_PRESETS,
  DEMO_CLIENT_CONFIG,
  APEX_HVAC_CLIENT_CONFIG,
  DEMO_SKIN_CLINIC_CONFIG,
  DEMO_LOCAL_SERVICE_CONFIG,
  ROOFING_TEST_CLIENT_CONFIG,
  PRODRAIN_PLUMBING_CLIENT_CONFIG,
  DEMO_REALESTATE_CLIENT_CONFIG,
  DEMO_RECRUITMENT_CLIENT_CONFIG,
} from '../presets/clientPresets';

export const INITIAL_CLIENT_CONFIGS: Record<string, ClientConfig> = {
  'demo-tarot-kochi': JSON.parse(JSON.stringify(DEMO_CLIENT_CONFIG)),
  'demo-tarot': JSON.parse(JSON.stringify(DEMO_CLIENT_CONFIG)),
  'client-apex-hvac': JSON.parse(JSON.stringify(APEX_HVAC_CLIENT_CONFIG)),
  'demo-hvac': JSON.parse(JSON.stringify(APEX_HVAC_CLIENT_CONFIG)),
  'demo-skin-clinic': JSON.parse(JSON.stringify(DEMO_SKIN_CLINIC_CONFIG)),
  'demo-clinic': JSON.parse(JSON.stringify(DEMO_SKIN_CLINIC_CONFIG)),
  'demo-local-service': JSON.parse(JSON.stringify(DEMO_LOCAL_SERVICE_CONFIG)),
  'demo-general': JSON.parse(JSON.stringify(DEMO_LOCAL_SERVICE_CONFIG)),
  'roofing-client-01': JSON.parse(JSON.stringify(ROOFING_TEST_CLIENT_CONFIG)),
  'demo-roofing': JSON.parse(JSON.stringify(ROOFING_TEST_CLIENT_CONFIG)),
  'prodrain-plumbing-kochi': JSON.parse(JSON.stringify(PRODRAIN_PLUMBING_CLIENT_CONFIG)),
  'demo-plumbing': JSON.parse(JSON.stringify(PRODRAIN_PLUMBING_CLIENT_CONFIG)),
  'demo-realestate': JSON.parse(JSON.stringify(DEMO_REALESTATE_CLIENT_CONFIG)),
  'demo-recruitment': JSON.parse(JSON.stringify(DEMO_RECRUITMENT_CLIENT_CONFIG)),
};

export function getClientConfigForEnvClientId(
  envClientId?: string,
  allowDefaultIfEmpty = !Boolean((import.meta as any).env?.PROD)
): { key: string; config: ClientConfig | null; isValid: boolean } {
  const cleanId = (envClientId || '').trim().toLowerCase();

  if (!cleanId) {
    if (allowDefaultIfEmpty) {
      return {
        key: 'demo-tarot-kochi',
        config: JSON.parse(JSON.stringify(DEMO_CLIENT_CONFIG)),
        isValid: true,
      };
    }
    return { key: '', config: null, isValid: false };
  }

  // 1. Direct match on key in CLIENT_PRESETS or INITIAL_CLIENT_CONFIGS
  if (CLIENT_PRESETS[cleanId]) {
    return {
      key: cleanId,
      config: JSON.parse(JSON.stringify(CLIENT_PRESETS[cleanId])),
      isValid: true,
    };
  }
  if (INITIAL_CLIENT_CONFIGS[cleanId]) {
    return {
      key: cleanId,
      config: JSON.parse(JSON.stringify(INITIAL_CLIENT_CONFIGS[cleanId])),
      isValid: true,
    };
  }

  // 2. Match on clientId property across all preset sources
  for (const [key, cfg] of Object.entries(CLIENT_PRESETS)) {
    if (cfg.clientId.toLowerCase() === cleanId) {
      return { key, config: JSON.parse(JSON.stringify(cfg)), isValid: true };
    }
  }
  for (const [key, cfg] of Object.entries(INITIAL_CLIENT_CONFIGS)) {
    if (cfg.clientId.toLowerCase() === cleanId) {
      return { key, config: JSON.parse(JSON.stringify(cfg)), isValid: true };
    }
  }
  for (const [key, cfg] of Object.entries(INDUSTRY_PRESETS)) {
    if (cfg.clientId.toLowerCase() === cleanId) {
      return { key: `client-${key}`, config: JSON.parse(JSON.stringify(cfg)), isValid: true };
    }
  }

  // 3. Strict rejection: Unknown client IDs MUST NOT fall back to Tarot
  return { key: cleanId, config: null, isValid: false };
}

/**
 * Resolve per-tenant build-time Vite endpoint variable without leaking another tenant's URL.
 */
export function getEnvFormEndpointForTenant(
  tenantId: string,
  envOverride?: Record<string, any>
): string {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return '';

  const env = envOverride || ((import.meta as any).env as Record<string, any>) || {};
  const normalizedSuffix = cleanId.toUpperCase().replace(/[^A-Z0-9]/g, '_');

  // 1. Explicit per-tenant env var: VITE_FORM_ENDPOINT_<TENANT_ID_UPPER_SNAKE>
  const explicitPerTenant = env[`VITE_FORM_ENDPOINT_${normalizedSuffix}`];
  if (typeof explicitPerTenant === 'string' && explicitPerTenant.trim().startsWith('http')) {
    return explicitPerTenant.trim();
  }

  // 2. Named preset env vars strictly mapped to their respective tenant IDs
  if (cleanId === 'demo-tarot-kochi' || cleanId === 'demo-tarot') {
    const val = env.VITE_FORM_ENDPOINT_TAROT || env.VITE_FORM_ENDPOINT || '';
    return typeof val === 'string' && val.trim().startsWith('http') ? val.trim() : '';
  }
  if (cleanId === 'client-apex-hvac' || cleanId === 'demo-hvac') {
    const val = env.VITE_FORM_ENDPOINT_APEX || '';
    return typeof val === 'string' && val.trim().startsWith('http') ? val.trim() : '';
  }
  if (cleanId === 'roofing-client-01' || cleanId === 'demo-roofing') {
    const val = env.VITE_FORM_ENDPOINT_ROOFING || env.VITE_FORM_ENDPOINT || '';
    return typeof val === 'string' && val.trim().startsWith('http') ? val.trim() : '';
  }
  if (cleanId === 'prodrain-plumbing-kochi' || cleanId === 'demo-plumbing') {
    const val = env.VITE_FORM_ENDPOINT_PRODRAIN || env.VITE_FORM_ENDPOINT || '';
    return typeof val === 'string' && val.trim().startsWith('http') ? val.trim() : '';
  }

  return '';
}

/**
 * Resolve CONFIG.formEndpoint for a specific tenant strictly inside its tenant boundary.
 * Priority:
 * 1. Saved Firestore website configuration (when matching tenantId)
 * 2. Initial runtime config (when matching tenantId)
 * 3. Preset config (when matching tenantId)
 * 4. Tenant-scoped build-time environment variable (VITE_FORM_ENDPOINT_<TENANT> / VITE_FORM_ENDPOINT_TAROT)
 */
export function resolveTenantFormEndpoint(options: {
  tenantId: string;
  firestoreConfig?: Partial<ClientConfig> | null;
  initialConfig?: Partial<ClientConfig> | null;
  presetConfig?: Partial<ClientConfig> | null;
  env?: Record<string, any>;
}): string {
  const cleanId = (options.tenantId || '').trim().toLowerCase();
  if (!cleanId) return '';

  const fsCfg = options.firestoreConfig;
  if (fsCfg) {
    const fsTenant = (fsCfg.clientId || cleanId).trim().toLowerCase();
    const fsUrl = typeof fsCfg.formEndpoint === 'string' ? fsCfg.formEndpoint.trim() : '';
    if (fsTenant === cleanId && fsUrl.startsWith('http')) {
      return fsUrl;
    }
  }

  const initCfg = options.initialConfig;
  if (initCfg && (initCfg.clientId || '').trim().toLowerCase() === cleanId) {
    const initUrl = typeof initCfg.formEndpoint === 'string' ? initCfg.formEndpoint.trim() : '';
    if (initUrl.startsWith('http')) {
      return initUrl;
    }
  }

  const presetCfg = options.presetConfig;
  if (presetCfg && (presetCfg.clientId || cleanId).trim().toLowerCase() === cleanId) {
    const presetUrl = typeof presetCfg.formEndpoint === 'string' ? presetCfg.formEndpoint.trim() : '';
    if (presetUrl.startsWith('http')) {
      return presetUrl;
    }
  }

  return getEnvFormEndpointForTenant(cleanId, options.env);
}

