/**
 * LeadPilot Phase 3B: Dynamic Tenant Routing Unit & Security Suite
 *
 * Verifies:
 * 1. Single-segment public tenant URLs (/apex-hvac, /tarot-kochi, /prodrain-plumbing)
 *    route to 'landing' dynamically even when VITE_APP_TARGET is unset.
 * 2. Multi-segment unknown paths (/apex-hvac/extra) fail closed (tenantSlug: null, isMultiSegment: true).
 * 3. CRM routes (/crm, /crm/:tenantSlug, /portal) maintain strict priority.
 * 4. resolvePublicTenantWebsiteBySlug resolves dynamically from slug -> tenantId -> public website
 *    without falling back to static presets or demo-tarot-kochi.
 * 5. Unknown, reserved, suspended, and unpublished tenants fail closed.
 * 6. Returned config.clientId is strictly locked to the resolved Firestore tenantId for enquiry routing.
 * 7. saveLead fails closed if clientId is missing or invalid.
 */

import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  parseAppRoute,
  getAppTarget,
  extractTenantSlugFromPath,
  resolveCurrentTenantId,
} from '../config/appTarget';
import {
  hydratePublicClientConfig,
  resolvePublicTenantWebsiteBySlug,
  validateAndNormalizeSlug,
} from '../auth/clientAuth';
import { saveLead } from '../utils/leadStorage';

describe('Phase 3B: Dynamic Public Tenant Routing Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete (process.env as any).VITE_APP_TARGET;
    delete (process.env as any).VITE_APP_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // SECTION 1: SINGLE-SEGMENT SLUG & MULTI-SEGMENT FAIL-CLOSED ROUTING
  // =========================================================================
  describe('Section 1: Single-Segment Public URLs & CRM Priority', () => {
    it('1. Supports single-segment public tenant URLs when VITE_APP_TARGET is unset', () => {
      for (const routePath of ['/apex-hvac', '/tarot-kochi', '/prodrain-plumbing', '/demo-tarot-kochi']) {
        const route = parseAppRoute(routePath);
        const expectedSlug = routePath.slice(1);
        expect(route.isCrmRoute).toBe(false);
        expect(route.isReserved).toBe(false);
        expect(route.isMultiSegment).toBe(false);
        expect(route.tenantSlug).toBe(expectedSlug);
        expect(extractTenantSlugFromPath(routePath)).toBe(expectedSlug);
        expect(getAppTarget(routePath)).toBe('landing');
      }
    });

    it('2. Supports trailing slashes on single-segment tenant URLs', () => {
      const route = parseAppRoute('/apex-hvac/');
      expect(route.tenantSlug).toBe('apex-hvac');
      expect(route.isMultiSegment).toBe(false);
      expect(getAppTarget('/apex-hvac/')).toBe('landing');
    });

    it('3. Rejects multi-segment non-CRM paths as invalid (fail-closed)', () => {
      const route = parseAppRoute('/apex-hvac/extra-path');
      expect(route.isCrmRoute).toBe(false);
      expect(route.isMultiSegment).toBe(true);
      expect(route.tenantSlug).toBeNull();
      expect(extractTenantSlugFromPath('/apex-hvac/extra-path')).toBeNull();
      expect(getAppTarget('/apex-hvac/extra-path')).toBe('landing');
    });

    it('4. Preserves /crm and /crm/:tenantSlug priority over public slug routing', () => {
      const crmRoot = parseAppRoute('/crm');
      expect(crmRoot.isCrmRoute).toBe(true);
      expect(crmRoot.tenantSlug).toBeNull();
      expect(getAppTarget('/crm')).toBe('crm');

      const crmTenant = parseAppRoute('/crm/apex-hvac');
      expect(crmTenant.isCrmRoute).toBe(true);
      expect(crmTenant.crmSubPath).toBe('apex-hvac');
      expect(crmTenant.tenantSlug).toBeNull();
      expect(getAppTarget('/crm/apex-hvac')).toBe('crm');

      const portalTenant = parseAppRoute('/portal/prodrain-plumbing');
      expect(portalTenant.isCrmRoute).toBe(true);
      expect(portalTenant.crmSubPath).toBe('prodrain-plumbing');
      expect(getAppTarget('/portal/prodrain-plumbing')).toBe('crm');
    });

    it('5. Keeps root "/" as "dev" locally when VITE_APP_TARGET is unset', () => {
      const rootRoute = parseAppRoute('/');
      expect(rootRoute.tenantSlug).toBeNull();
      expect(rootRoute.isCrmRoute).toBe(false);
      expect(rootRoute.isMultiSegment).toBe(false);
      expect(getAppTarget('/')).toBe('dev');
    });
  });

  // =========================================================================
  // SECTION 2: DYNAMIC SLUG -> FIRESTORE TENANT WEBSITE RESOLUTION
  // =========================================================================
  describe('Section 2: resolvePublicTenantWebsiteBySlug', () => {
    it('1. Resolves active published tenant when slug differs from Firestore tenantId', async () => {
      const resolveSlug = vi.fn(async (slug: string) => {
        expect(slug).toBe('apex-hvac');
        return { success: true, tenantId: 'tenant-apex-001' };
      });
      const fetchWebsite = vi.fn(async (tenantId: string) => {
        expect(tenantId).toBe('tenant-apex-001');
        return {
          success: true,
          isPublished: true,
          businessName: 'Apex Heating & Cooling LLC',
          config: {
            // Even if stored config had stale/wrong clientId, resolver overrides with Firestore tenantId
            clientId: 'stale-client-id',
            businessName: 'Apex Heating & Cooling LLC',
            industry: 'HVAC',
            heroTitle: '24/7 AC Repair & Cooling',
            services: [
              {
                id: 'srv-1',
                title: 'AC Repair',
                tagline: 'Fast Diagnostics',
                description: 'Same-day repair.',
                iconName: 'snowflake',
                features: ['Upfront Pricing'],
              },
            ],
          },
        };
      });

      const result = await resolvePublicTenantWebsiteBySlug('apex-hvac', {
        resolveSlug,
        fetchWebsite,
      });

      expect(resolveSlug).toHaveBeenCalledTimes(1);
      expect(fetchWebsite).toHaveBeenCalledTimes(1);
      expect(result.success).toBe(true);
      expect(result.tenantId).toBe('tenant-apex-001');
      expect(result.config).not.toBeNull();
      expect(result.config?.clientId).toBe('tenant-apex-001');
      expect(result.config?.businessName).toBe('Apex Heating & Cooling LLC');
      expect(result.config?.heroTitle).toBe('24/7 AC Repair & Cooling');
      expect(result.config?.services).toHaveLength(1);
    });

    it('2. Fails closed for unknown slug without falling back to static presets', async () => {
      const resolveSlug = vi.fn(async () => ({
        success: false,
        tenantId: null,
        error: 'Slug not found.',
      }));
      const fetchWebsite = vi.fn();

      const result = await resolvePublicTenantWebsiteBySlug('unknown-business', {
        resolveSlug,
        fetchWebsite,
      });

      expect(result.success).toBe(false);
      expect(result.tenantId).toBeNull();
      expect(result.config).toBeNull();
      expect(fetchWebsite).not.toHaveBeenCalled();
    });

    it('3. Fails closed when tenant is suspended (Firestore rules reject slug read)', async () => {
      const resolveSlug = vi.fn(async () => ({
        success: false,
        tenantId: null,
        error: 'Missing or insufficient permissions.',
      }));
      const fetchWebsite = vi.fn();

      const result = await resolvePublicTenantWebsiteBySlug('suspended-biz', {
        resolveSlug,
        fetchWebsite,
      });

      expect(result.success).toBe(false);
      expect(result.tenantId).toBeNull();
      expect(result.config).toBeNull();
      expect(fetchWebsite).not.toHaveBeenCalled();
    });

    it('4. Fails closed when website is unpublished (isPublished: false)', async () => {
      const resolveSlug = vi.fn(async () => ({
        success: true,
        tenantId: 'tenant-draft-01',
      }));
      const fetchWebsite = vi.fn(async () => ({
        success: true,
        isPublished: false,
        config: {
          businessName: 'Draft Business',
        },
      }));

      const result = await resolvePublicTenantWebsiteBySlug('draft-biz', {
        resolveSlug,
        fetchWebsite,
      });

      expect(result.success).toBe(false);
      expect(result.tenantId).toBeNull();
      expect(result.config).toBeNull();
    });

    it('5. Fails closed when published website config payload is missing', async () => {
      const resolveSlug = vi.fn(async () => ({
        success: true,
        tenantId: 'tenant-empty-01',
      }));
      const fetchWebsite = vi.fn(async () => ({
        success: true,
        isPublished: true,
        config: null,
      }));

      const result = await resolvePublicTenantWebsiteBySlug('empty-biz', {
        resolveSlug,
        fetchWebsite,
      });

      expect(result.success).toBe(false);
      expect(result.tenantId).toBeNull();
      expect(result.config).toBeNull();
    });

    it('6. Hydrates minimal Firestore configs safely with zero static business preset leak', () => {
      const hydrated = hydratePublicClientConfig(
        'tenant-tarot-99',
        { businessName: 'Kochi Mystic Tarot' },
        'Kochi Mystic Tarot'
      );

      expect(hydrated.clientId).toBe('tenant-tarot-99');
      expect(hydrated.businessName).toBe('Kochi Mystic Tarot');
      expect(Array.isArray(hydrated.services)).toBe(true);
      expect(Array.isArray(hydrated.testimonials)).toBe(true);
      expect(Array.isArray(hydrated.faqs)).toBe(true);
      expect(Array.isArray(hydrated.serviceAreas)).toBe(true);
      expect(hydrated.sampleDataNoticeEnabled).toBe(false);
      expect(hydrated.heroTrustBadgesEnabled).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 3: ENQUIRY SUBMISSION TENANT ID VALIDATION
  // =========================================================================
  describe('Section 3: Public Enquiry Tenant ID Validation', () => {
    it('1. Rejects enquiry submission when clientId is missing or invalid format', async () => {
      const missingRes = await saveLead({
        name: 'Test Customer',
        phone: '+91 9876543210',
        service: 'AC Repair',
        clientId: '',
      });
      expect(missingRes.success).toBe(false);

      const badFormatRes = await saveLead({
        name: 'Test Customer',
        phone: '+91 9876543210',
        service: 'AC Repair',
        clientId: '../evil-tenant',
      });
      expect(badFormatRes.success).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 4: CLOUDFLARE STAGING HOSTNAME & NULL-SAFE SLUG RULES GUARD
  // =========================================================================
  describe('Section 4: Staging Hostname Isolation & Rules Integrity', () => {
    it('1. Shared .pages.dev staging/preview hostnames never accept single-tenant env override in production', () => {
      process.env.VITE_SINGLE_TENANT_MODE = 'true';
      process.env.VITE_CLIENT_ID = 'client-apex-hvac';

      expect(resolveCurrentTenantId('leadpilot-staging.pages.dev', true)).toEqual({
        tenantId: '',
        isValid: false,
      });
      expect(resolveCurrentTenantId('abc123.leadpilot-staging.pages.dev', true)).toEqual({
        tenantId: '',
        isValid: false,
      });
    });

    it('2. validateAndNormalizeSlug accepts demo-tarot-kochi as a valid tenant slug', () => {
      expect(validateAndNormalizeSlug('demo-tarot-kochi')).toEqual({
        isValid: true,
        normalizedSlug: 'demo-tarot-kochi',
      });
    });

    it('3. firestore.rules handles non-existent slugs safely while enforcing active + published checks on existing slugs', () => {
      const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
      const slugMatchBlock = rules.match(/match \/slugs\/\{slug\}\s*\{[\s\S]*?allow list:/)?.[0] || '';
      expect(slugMatchBlock).toContain('resource == null');
      expect(slugMatchBlock).toContain('isSlugTenantActive(resource.data.tenantId)');
      expect(slugMatchBlock).toContain('isSlugTenantWebsitePublished(resource.data.tenantId)');
    });
  });
});
