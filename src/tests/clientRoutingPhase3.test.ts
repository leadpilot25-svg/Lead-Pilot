/**
 * LeadPilot Phase 3A: Unified Runtime Routing & Path Architecture Tests
 * 
 * Verifies:
 * 1. Reserved system paths (/crm, /portal, /admin, /api, /assets, /downloads, /site, /landing).
 * 2. Unified route parser (parseAppRoute):
 *    - /crm, /crm/, /crm/apex-hvac route to CRM.
 *    - /portal, /portal/prodrain route to CRM.
 *    - /admin, /api/*, /assets/* are recognized as reserved and never as tenant slugs.
 *    - Root / and empty paths are cleanly handled.
 *    - Public tenant slugs (e.g. /apex-hvac, /prodrain-plumbing-kochi) extract the slug.
 * 3. App target detection (getAppTarget):
 *    - Preserves build-time overrides (VITE_APP_TARGET=crm / VITE_APP_TARGET=landing).
 *    - Routes path-based /crm and /portal to 'crm'.
 *    - Defaults to 'landing' in production and 'dev' locally.
 * 4. Tenant slug extractor (extractTenantSlugFromPath):
 *    - Extracts valid public tenant slugs while rejecting reserved system paths.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RESERVED_SYSTEM_PATHS,
  isReservedSystemPath,
  parseAppRoute,
  extractTenantSlugFromPath,
  getAppTarget,
} from '../config/appTarget';

describe('Phase 3A: Unified Runtime Routing Architecture Suite', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset env
    process.env = { ...originalEnv };
    delete (process.env as any).VITE_APP_TARGET;
    delete (process.env as any).VITE_APP_MODE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // SECTION 1: RESERVED SYSTEM PATHS INTEGRITY
  // =========================================================================
  describe('Section 1: Reserved System Paths', () => {
    it('1. Contains all mandatory system path reservations', () => {
      const required = ['crm', 'portal', 'admin', 'api', 'assets', 'downloads', 'site', 'landing'];
      for (const req of required) {
        expect(RESERVED_SYSTEM_PATHS).toContain(req);
      }
    });

    it('2. isReservedSystemPath correctly identifies reserved segments regardless of case or slashes', () => {
      expect(isReservedSystemPath('crm')).toBe(true);
      expect(isReservedSystemPath('CRM')).toBe(true);
      expect(isReservedSystemPath('/crm/')).toBe(true);
      expect(isReservedSystemPath('portal')).toBe(true);
      expect(isReservedSystemPath('admin')).toBe(true);
      expect(isReservedSystemPath('api')).toBe(true);
      expect(isReservedSystemPath('assets')).toBe(true);
      expect(isReservedSystemPath('downloads')).toBe(true);
      expect(isReservedSystemPath('site')).toBe(true);
      expect(isReservedSystemPath('landing')).toBe(true);
    });

    it('3. isReservedSystemPath returns false for legitimate tenant slugs', () => {
      expect(isReservedSystemPath('apex-hvac')).toBe(false);
      expect(isReservedSystemPath('prodrain-plumbing-kochi')).toBe(false);
      expect(isReservedSystemPath('demo-tarot-kochi')).toBe(false);
      expect(isReservedSystemPath('dr-smith-clinic')).toBe(false);
      expect(isReservedSystemPath('roofing-client-01')).toBe(false);
    });
  });

  // =========================================================================
  // SECTION 2: UNIFIED ROUTE PARSER (parseAppRoute)
  // =========================================================================
  describe('Section 2: Unified Route Parser (parseAppRoute)', () => {
    it('1. Root path "/" resolves to default landing target without tenant slug', () => {
      const route = parseAppRoute('/');
      expect(route.rawPath).toBe('/');
      expect(route.isCrmRoute).toBe(false);
      expect(route.isReserved).toBe(false);
      expect(route.crmSubPath).toBeNull();
      expect(route.tenantSlug).toBeNull();
      expect(route.target).toBe('landing');
    });

    it('2. Empty string path resolves identically to root path', () => {
      const route = parseAppRoute('');
      expect(route.rawPath).toBe('/');
      expect(route.isCrmRoute).toBe(false);
      expect(route.tenantSlug).toBeNull();
    });

    it('3. /crm and /crm/ route to CRM target', () => {
      const routeA = parseAppRoute('/crm');
      expect(routeA.isCrmRoute).toBe(true);
      expect(routeA.isReserved).toBe(true);
      expect(routeA.crmSubPath).toBeNull();
      expect(routeA.tenantSlug).toBeNull();
      expect(routeA.target).toBe('crm');

      const routeB = parseAppRoute('/crm/');
      expect(routeB.isCrmRoute).toBe(true);
      expect(routeB.target).toBe('crm');
    });

    it('4. /crm/:tenantSlug captures subpath and routes to CRM', () => {
      const route = parseAppRoute('/crm/client-apex-hvac');
      expect(route.isCrmRoute).toBe(true);
      expect(route.isReserved).toBe(true);
      expect(route.crmSubPath).toBe('client-apex-hvac');
      expect(route.tenantSlug).toBeNull();
      expect(route.target).toBe('crm');
    });

    it('5. Legacy /portal and /portal/:tenantSlug route to CRM', () => {
      const routeA = parseAppRoute('/portal');
      expect(routeA.isCrmRoute).toBe(true);
      expect(routeA.target).toBe('crm');

      const routeB = parseAppRoute('/portal/prodrain-plumbing-kochi');
      expect(routeB.isCrmRoute).toBe(true);
      expect(routeB.crmSubPath).toBe('prodrain-plumbing-kochi');
      expect(routeB.target).toBe('crm');
    });

    it('6. Reserved system paths are marked reserved and never produce a public tenant slug', () => {
      const adminRoute = parseAppRoute('/admin');
      expect(adminRoute.isCrmRoute).toBe(false);
      expect(adminRoute.isReserved).toBe(true);
      expect(adminRoute.tenantSlug).toBeNull();

      const apiRoute = parseAppRoute('/api/sync-sheet');
      expect(apiRoute.isCrmRoute).toBe(false);
      expect(apiRoute.isReserved).toBe(true);
      expect(apiRoute.tenantSlug).toBeNull();

      const assetsRoute = parseAppRoute('/assets/main.js');
      expect(assetsRoute.isCrmRoute).toBe(false);
      expect(assetsRoute.isReserved).toBe(true);
      expect(assetsRoute.tenantSlug).toBeNull();

      const downloadsRoute = parseAppRoute('/downloads/guide.pdf');
      expect(downloadsRoute.isCrmRoute).toBe(false);
      expect(downloadsRoute.isReserved).toBe(true);
      expect(downloadsRoute.tenantSlug).toBeNull();
    });

    it('7. Public tenant paths extract tenantSlug and resolve to landing target', () => {
      const apexRoute = parseAppRoute('/apex-hvac');
      expect(apexRoute.isCrmRoute).toBe(false);
      expect(apexRoute.isReserved).toBe(false);
      expect(apexRoute.tenantSlug).toBe('apex-hvac');
      expect(apexRoute.target).toBe('landing');

      const prodrainRoute = parseAppRoute('/prodrain-plumbing-kochi');
      expect(prodrainRoute.isCrmRoute).toBe(false);
      expect(prodrainRoute.isReserved).toBe(false);
      expect(prodrainRoute.tenantSlug).toBe('prodrain-plumbing-kochi');
      expect(prodrainRoute.target).toBe('landing');
    });
  });

  // =========================================================================
  // SECTION 3: APP TARGET RESOLUTION INTEGRATION (getAppTarget)
  // =========================================================================
  describe('Section 3: App Target Resolution Integration (getAppTarget)', () => {
    it('1. /crm returns "crm" target', () => {
      expect(getAppTarget('/crm')).toBe('crm');
      expect(getAppTarget('/crm/')).toBe('crm');
      expect(getAppTarget('/crm/apex-hvac')).toBe('crm');
    });

    it('2. /portal returns "crm" target', () => {
      expect(getAppTarget('/portal')).toBe('crm');
      expect(getAppTarget('/portal/test')).toBe('crm');
    });

    it('3. /landing returns "landing" target', () => {
      expect(getAppTarget('/landing')).toBe('landing');
    });

    it('4. Preserves build-time environment variable overrides (standalone builds)', () => {
      // Standalone CRM build
      process.env.VITE_APP_TARGET = 'crm';
      expect(getAppTarget('/')).toBe('crm');

      // Standalone Landing build
      process.env.VITE_APP_TARGET = 'landing';
      expect(getAppTarget('/')).toBe('landing');

      // Reset
      delete process.env.VITE_APP_TARGET;
    });
  });

  // =========================================================================
  // SECTION 4: TENANT SLUG EXTRACTION HELPER
  // =========================================================================
  describe('Section 4: extractTenantSlugFromPath Helper', () => {
    it('1. Extracts tenant slug from valid public path', () => {
      expect(extractTenantSlugFromPath('/apex-hvac')).toBe('apex-hvac');
      expect(extractTenantSlugFromPath('/prodrain-plumbing-kochi')).toBe('prodrain-plumbing-kochi');
      expect(extractTenantSlugFromPath('demo-tarot-kochi')).toBe('demo-tarot-kochi');
    });

    it('2. Returns null for reserved system paths and CRM routes', () => {
      expect(extractTenantSlugFromPath('/crm')).toBeNull();
      expect(extractTenantSlugFromPath('/crm/apex-hvac')).toBeNull();
      expect(extractTenantSlugFromPath('/portal')).toBeNull();
      expect(extractTenantSlugFromPath('/admin')).toBeNull();
      expect(extractTenantSlugFromPath('/api/test')).toBeNull();
      expect(extractTenantSlugFromPath('/assets/icon.svg')).toBeNull();
      expect(extractTenantSlugFromPath('/')).toBeNull();
    });
  });
});
