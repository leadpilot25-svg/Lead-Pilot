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
