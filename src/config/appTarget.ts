/**
 * Deployment Target & Mode Configuration
 * 
 * Supports 3 distinct environments:
 * 1. 'landing' - Public Landing Website: Client-facing landing page, GBP info, lead form, WhatsApp CTA.
 *                Zero dev tools, zero CRM dashboard, zero admin controls.
 * 2. 'crm'     - Separate Customer CRM: Client login/logout, lead dashboard, follow-ups, WhatsApp buttons.
 *                Zero dev controls, zero config drawer, zero landing page preview.
 * 3. 'dev'     - Internal Development Environment: Master suite with Dev Mode, Client Mode preview,
 *                Config Editor Drawer, Code Exporter, Preset switcher. Available only locally.
 * 
 * Target Resolution Priority:
 * 1. VITE_APP_TARGET environment variable ('landing' | 'crm' | 'dev')
 * 2. URL path: /crm or /portal -> 'crm', /landing -> 'landing'
 * 3. URL query parameter: ?target=landing or ?target=crm or ?target=dev
 * 4. Default: 'dev' in development, or fallback based on VITE_APP_MODE
 */

import { ClientConfig } from '../types';
import { getClientConfigForEnvClientId } from './clientConfigResolver';

export type AppTarget = 'landing' | 'crm' | 'dev';

/**
 * Reserved system paths that cannot be used as public tenant slugs
 */
export const RESERVED_SYSTEM_PATHS = [
  'crm',
  'portal',
  'admin',
  'api',
  'assets',
  'downloads',
  'site',
  'landing',
] as const;

export type ReservedSystemPath = (typeof RESERVED_SYSTEM_PATHS)[number];

export function isReservedSystemPath(segment: string): boolean {
  const normalized = (segment || '').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  return (RESERVED_SYSTEM_PATHS as readonly string[]).includes(normalized);
}

export interface ParsedAppRoute {
  rawPath: string;
  isCrmRoute: boolean;
  isReserved: boolean;
  isMultiSegment?: boolean;
  crmSubPath: string | null;
  tenantSlug: string | null;
  target: AppTarget;
}

/**
 * Pure route parser for unified runtime routing
 * Evaluates pathname segments into route type, reserved status, and optional tenant slug.
 */
export function parseAppRoute(rawPathname?: string): ParsedAppRoute {
  const path = typeof rawPathname === 'string'
    ? rawPathname
    : (typeof window !== 'undefined' ? window.location.pathname : '/');

  const clean = (path || '/').trim();
  const normalized = clean.startsWith('/') ? clean : `/${clean}`;
  const segments = normalized.split('/').filter(Boolean);

  if (segments.length === 0) {
    return {
      rawPath: normalized,
      isCrmRoute: false,
      isReserved: false,
      isMultiSegment: false,
      crmSubPath: null,
      tenantSlug: null,
      target: 'landing',
    };
  }

  const firstSegment = segments[0].toLowerCase();

  // CRM routes: /crm, /crm/*, /portal, /portal/*
  if (firstSegment === 'crm' || firstSegment === 'portal') {
    const crmSubPath = segments.slice(1).join('/') || null;
    return {
      rawPath: normalized,
      isCrmRoute: true,
      isReserved: true,
      isMultiSegment: false,
      crmSubPath,
      tenantSlug: null,
      target: 'crm',
    };
  }

  // Reserved system paths: /admin, /api, /assets, /downloads, etc.
  if (isReservedSystemPath(firstSegment)) {
    return {
      rawPath: normalized,
      isCrmRoute: false,
      isReserved: true,
      isMultiSegment: false,
      crmSubPath: null,
      tenantSlug: null,
      target: 'landing',
    };
  }

  // Only single-segment public URLs (e.g. /apex-hvac, /tarot-kochi, /prodrain-plumbing)
  // are valid tenant slug candidates; multi-segment non-CRM paths fail closed.
  if (segments.length > 1) {
    return {
      rawPath: normalized,
      isCrmRoute: false,
      isReserved: false,
      isMultiSegment: true,
      crmSubPath: null,
      tenantSlug: null,
      target: 'landing',
    };
  }

  // Public tenant slug route: e.g. /apex-hvac, /prodrain-plumbing-kochi
  return {
    rawPath: normalized,
    isCrmRoute: false,
    isReserved: false,
    isMultiSegment: false,
    crmSubPath: null,
    tenantSlug: firstSegment,
    target: 'landing',
  };
}

export function extractTenantSlugFromPath(rawPathname?: string): string | null {
  const parsed = parseAppRoute(rawPathname);
  return parsed.tenantSlug;
}

export function getAppTarget(rawPathname?: string): AppTarget {
  const isProd = Boolean((import.meta as any).env?.PROD);

  // 1. Explicit Vite Environment Variable (Highest precedence, embedded at build time)
  const envTarget = (
    (import.meta as any).env?.VITE_APP_TARGET ||
    (typeof process !== 'undefined' ? process.env?.VITE_APP_TARGET : '')
  )?.toString().trim().toLowerCase();
  if (envTarget === 'landing') return 'landing';
  if (envTarget === 'crm') return 'crm';
  if (envTarget === 'dev' && !isProd) return 'dev';

  // Fallback for legacy VITE_APP_MODE
  const envMode = (
    (import.meta as any).env?.VITE_APP_MODE ||
    (typeof process !== 'undefined' ? process.env?.VITE_APP_MODE : '')
  )?.toString().trim().toLowerCase();
  if (envMode === 'landing') return 'landing';
  if (envMode === 'crm') return 'crm';

  // 2. URL Pathname (/crm, /crm/*, /portal, /portal/* -> 'crm', /landing or tenant slug -> 'landing')
  const parsedRoute = parseAppRoute(rawPathname);
  if (parsedRoute.isCrmRoute) {
    return 'crm';
  }
  if (parsedRoute.rawPath.startsWith('/landing') || parsedRoute.tenantSlug !== null || parsedRoute.isMultiSegment) {
    return 'landing';
  }

  // 3. Security Lockdown: In production builds, DEV mode is strictly forbidden.
  // URL query parameters (?target=dev or ?mode=dev) are completely ignored in production builds.
  if (isProd) {
    return 'landing';
  }

  // 4. Local Development only: Allow query parameter testing (?target=landing | ?target=crm | ?target=dev)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const targetParam = (params.get('target') || params.get('mode'))?.toLowerCase();
    if (targetParam === 'landing' || targetParam === 'crm' || targetParam === 'dev') {
      return targetParam as AppTarget;
    }
  }

  // Default to internal dev suite locally
  return 'dev';
}

export const CURRENT_APP_TARGET: AppTarget = getAppTarget();

export const IS_LANDING_DEPLOYMENT = CURRENT_APP_TARGET === 'landing';
export const IS_CRM_DEPLOYMENT = CURRENT_APP_TARGET === 'crm';
export const IS_DEV_DEPLOYMENT = CURRENT_APP_TARGET === 'dev';

export const REGISTERED_HOSTNAME_MAP: Record<string, string> = {
  'prodrain.leadpilot.pages.dev': 'prodrain-plumbing-kochi',
  'tarot.leadpilot.pages.dev': 'demo-tarot-kochi',
  'apex.leadpilot.pages.dev': 'client-apex-hvac',
  'roofing.leadpilot.pages.dev': 'roofing-client-01',
  'leadpilot-staging.pages.dev': 'roofing-client-01',
};

export function resolveCurrentTenantId(hostname?: string, isProdOverride?: boolean): { tenantId: string; isValid: boolean } {
  const currentHost = (hostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
  const isProd = isProdOverride !== undefined
    ? isProdOverride
    : (Boolean((import.meta as any).env?.PROD) || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'));
  const isDedicatedSingleTenant =
    (import.meta as any).env?.VITE_SINGLE_TENANT_MODE === 'true' ||
    (typeof process !== 'undefined' && process.env?.VITE_SINGLE_TENANT_MODE === 'true');

  // 1. Hostname Resolution (Strict Priority for Shared Multi-Tenant Platform)
  // An explicitly registered domain always dictates the tenant ID
  if (currentHost && REGISTERED_HOSTNAME_MAP[currentHost]) {
    return { tenantId: REGISTERED_HOSTNAME_MAP[currentHost], isValid: true };
  }

  // 2. Explicit Dedicated Single-Tenant Build Mode (e.g. standalone Vercel client deployment)
  // Only permitted if explicitly marked with VITE_SINGLE_TENANT_MODE=true AND not on a shared .pages.dev domain
  if (isDedicatedSingleTenant && !currentHost.endsWith('.pages.dev')) {
    const envId = (
      (import.meta as any).env?.VITE_CLIENT_ID ||
      (typeof process !== 'undefined' ? process.env?.VITE_CLIENT_ID : '')
    )?.toString().trim().toLowerCase();
    if (envId) {
      return { tenantId: envId, isValid: true };
    }
  }

  // 3. Local Development & Hermetic Test Suite only: allow query parameter or development fallback
  if (!isProd) {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const clientParam = params.get('client') || params.get('clientId');
      if (clientParam) {
        return { tenantId: clientParam.trim(), isValid: true };
      }
    }
    // In local dev/test, allow VITE_CLIENT_ID if hostname is localhost/test
    const devEnvId = (
      (import.meta as any).env?.VITE_CLIENT_ID ||
      (typeof process !== 'undefined' ? process.env?.VITE_CLIENT_ID : '')
    )?.toString().trim().toLowerCase();
    if (devEnvId && !currentHost.endsWith('.pages.dev')) {
      return { tenantId: devEnvId, isValid: true };
    }
    return { tenantId: 'demo-tarot-kochi', isValid: true };
  }

  // 4. Fail-closed: In shared production, unknown hostnames are strictly rejected (even if VITE_CLIENT_ID is set)
  return { tenantId: '', isValid: false };
}

export const RESOLVED_TENANT_INFO = resolveCurrentTenantId();
export const CLIENT_ID_ENV: string = RESOLVED_TENANT_INFO.tenantId;

export interface AuthoritativeTenantResult {
  tenantId: string;
  isValid: boolean;
  config: ClientConfig | null;
  key: string;
}

/**
 * Authoritative Tenant Configuration Resolver
 * 
 * Used by Standalone Landing (AppLanding), Standalone CRM (AppCrm), and Master App (App)
 * to resolve tenant configuration with strict isolation guarantees:
 * 
 * 1. In production (isProd === true):
 *    - Unknown or unmapped hostnames IMMEDIATELY fail closed with isValid: false, config: null.
 *    - URL query parameters (?client=... / ?clientId=...) are STRICTLY PROHIBITED and ignored.
 *    - Registered hostnames resolve strictly to their mapped tenant.
 *    - Dedicated single-tenant mode (VITE_SINGLE_TENANT_MODE === 'true' on non-shared domains) is preserved.
 * 2. In local development / hermetic test (!isProd):
 *    - Query parameters and developer fallbacks are permitted for rapid iteration.
 */
export function getAuthoritativeTenantConfig(hostname?: string, isProdOverride?: boolean): AuthoritativeTenantResult {
  const isProd = isProdOverride !== undefined
    ? isProdOverride
    : (Boolean((import.meta as any).env?.PROD) || (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production'));
  const resolved = resolveCurrentTenantId(hostname, isProd);

  // 1. Strict Fail-Closed in Production
  if (isProd) {
    if (!resolved.isValid || !resolved.tenantId) {
      return {
        tenantId: '',
        isValid: false,
        config: null,
        key: '',
      };
    }

    const configResult = getClientConfigForEnvClientId(resolved.tenantId, false);
    return {
      tenantId: resolved.tenantId,
      isValid: configResult.isValid && configResult.config !== null,
      config: configResult.config,
      key: configResult.key,
    };
  }

  // 2. Local Development & Hermetic Test Suite (!isProd)
  let targetTenantId = resolved.tenantId;
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const clientParam = params.get('client') || params.get('clientId');
    if (clientParam) {
      const normalized = clientParam.trim().toLowerCase();
      if (normalized.includes('tarot')) targetTenantId = 'demo-tarot-kochi';
      else if (normalized.includes('hvac') || normalized.includes('apex')) targetTenantId = 'client-apex-hvac';
      else if (normalized.includes('plumb')) targetTenantId = 'demo-plumbing';
      else targetTenantId = clientParam.trim();
    }
  }

  const configResult = getClientConfigForEnvClientId(targetTenantId, true);
  return {
    tenantId: targetTenantId,
    isValid: configResult.isValid,
    config: configResult.config,
    key: configResult.key,
  };
}

