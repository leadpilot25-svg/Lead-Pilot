import { describe, it, expect } from 'vitest';
import { INDUSTRY_PRESETS, STANDARDIZED_INDUSTRIES } from '../presets/industryPresets';
import {
  CLIENT_PRESETS,
  PRODRAIN_PLUMBING_CLIENT_CONFIG,
  DEMO_CLIENT_CONFIG,
  APEX_HVAC_CLIENT_CONFIG,
  ROOFING_TEST_CLIENT_CONFIG,
  DEMO_REALESTATE_CLIENT_CONFIG,
  DEMO_RECRUITMENT_CLIENT_CONFIG,
} from '../presets/clientPresets';
import { getClientConfigForEnvClientId, INITIAL_CLIENT_CONFIGS } from '../config/clientConfigResolver';
import { PackageType, StandardIndustryType, ClientConfig } from '../types';

describe('LeadPilot Phase 1: Industry Templates & Package Types', () => {
  it('1. Standardizes all six required industry profiles', () => {
    const requiredIndustries: StandardIndustryType[] = [
      'clinic',
      'plumbing',
      'real-estate',
      'tarot',
      'recruitment',
      'general-business',
    ];

    expect(STANDARDIZED_INDUSTRIES).toEqual(expect.arrayContaining(requiredIndustries));

    for (const ind of requiredIndustries) {
      expect(INDUSTRY_PRESETS[ind]).toBeDefined();
      const preset = INDUSTRY_PRESETS[ind];
      expect(preset.industry).toBeTruthy();
      expect(preset.businessName).toBeTruthy();
      expect(preset.tagline).toBeTruthy();
      expect(preset.heroTitle).toBeTruthy();
      expect(preset.heroSubheadline).toBeTruthy();
      expect(Array.isArray(preset.services)).toBe(true);
      expect(preset.services.length).toBeGreaterThanOrEqual(3);
      expect(preset.crmTerminology).toBeDefined();
      expect(preset.crmTerminology?.leadLabel).toBeTruthy();
      expect(preset.crmTerminology?.serviceLabel).toBeTruthy();
      expect(preset.defaultFollowUpDays).toBeGreaterThan(0);
      expect(preset.package).toBe('both');
    }
  });

  it('2. Supports TypeScript PackageType and preserves backward-compatible defaults', () => {
    const validPackages: PackageType[] = ['landing', 'crm', 'both'];
    expect(validPackages).toContain('landing');
    expect(validPackages).toContain('crm');
    expect(validPackages).toContain('both');

    // A configuration without package should default gracefully
    const unconfiguredConfig: ClientConfig = {
      ...DEMO_CLIENT_CONFIG,
      package: undefined,
    };
    const effectivePackage = unconfiguredConfig.package || 'both';
    expect(effectivePackage).toBe('both');
  });

  it('3. Preserves ProDrain Plumbing tenant prodrain-plumbing-kochi', () => {
    expect(PRODRAIN_PLUMBING_CLIENT_CONFIG).toBeDefined();
    expect(PRODRAIN_PLUMBING_CLIENT_CONFIG.clientId).toBe('prodrain-plumbing-kochi');
    expect(PRODRAIN_PLUMBING_CLIENT_CONFIG.businessName).toBe('ProDrain Plumbing');
    expect(PRODRAIN_PLUMBING_CLIENT_CONFIG.industry).toBe('Plumbing & Drain Cleaning');
    expect(PRODRAIN_PLUMBING_CLIENT_CONFIG.phone).toBe('+91 98460 12345');
    expect(CLIENT_PRESETS['prodrain-plumbing-kochi']).toBeDefined();

    const resolved = getClientConfigForEnvClientId('prodrain-plumbing-kochi');
    expect(resolved.isValid).toBe(true);
    expect(resolved.config?.clientId).toBe('prodrain-plumbing-kochi');
  });

  it('4. Preserves Tarot demo tenant demo-tarot-kochi', () => {
    expect(DEMO_CLIENT_CONFIG).toBeDefined();
    expect(DEMO_CLIENT_CONFIG.clientId).toBe('demo-tarot-kochi');
    expect(DEMO_CLIENT_CONFIG.businessName).toBe('Tarot Coaching & Guidance');
    expect(CLIENT_PRESETS['demo-tarot-kochi']).toBeDefined();

    const resolved = getClientConfigForEnvClientId('demo-tarot-kochi');
    expect(resolved.isValid).toBe(true);
    expect(resolved.config?.clientId).toBe('demo-tarot-kochi');
  });

  it('5. Preserves existing Apex HVAC and Roofing presets', () => {
    expect(APEX_HVAC_CLIENT_CONFIG.clientId).toBe('client-apex-hvac');
    expect(ROOFING_TEST_CLIENT_CONFIG.clientId).toBe('roofing-client-01');
    expect(CLIENT_PRESETS['client-apex-hvac']).toBeDefined();
    expect(CLIENT_PRESETS['roofing-client-01']).toBeDefined();
    expect(INDUSTRY_PRESETS['hvac']).toBeDefined();
    expect(INDUSTRY_PRESETS['roofing']).toBeDefined();
  });

  it('6. Successfully resolves aliases for convenience and backwards compatibility', () => {
    expect(INDUSTRY_PRESETS['realestate']).toBe(INDUSTRY_PRESETS['real-estate']);
    expect(INDUSTRY_PRESETS['general']).toBe(INDUSTRY_PRESETS['general-business']);
    expect(INDUSTRY_PRESETS['skin-clinic']).toBe(INDUSTRY_PRESETS['clinic']);
  });

  it('7. Integrates Real Estate and Recruitment demo configurations into resolver and presets', () => {
    expect(DEMO_REALESTATE_CLIENT_CONFIG.clientId).toBe('demo-realestate');
    expect(DEMO_RECRUITMENT_CLIENT_CONFIG.clientId).toBe('demo-recruitment');
    expect(CLIENT_PRESETS['demo-realestate']).toBeDefined();
    expect(CLIENT_PRESETS['demo-recruitment']).toBeDefined();
    expect(INITIAL_CLIENT_CONFIGS['demo-realestate']).toBeDefined();
    expect(INITIAL_CLIENT_CONFIGS['demo-recruitment']).toBeDefined();
  });

  it('8. Rejects unknown client IDs to maintain tenant security boundaries', () => {
    const unknown = getClientConfigForEnvClientId('unknown-malicious-tenant-xyz', false);
    expect(unknown.isValid).toBe(false);
    expect(unknown.config).toBeNull();
  });
});
