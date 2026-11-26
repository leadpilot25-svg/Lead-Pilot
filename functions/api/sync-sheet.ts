/**
 * Cloudflare Pages Function: Public Website Enquiry -> Google Sheets Gateway (/api/submit-lead)
 *
 * Purpose:
 * Allows public tenant landing pages deployed on Cloudflare Pages (e.g. leadpilot-staging.pages.dev)
 * to forward `createLead` enquiries to the tenant's authoritative server-configured Apps Script Web App
 * URL (`APPSCRIPT_ENDPOINT_<TENANT>`) without exposing server environment secrets or relying on stale
 * browser build-time variables.
 *
 * Security Guarantees:
 * 1. Action Allowlist: Strictly permits ONLY `action === 'createLead'`. Reads (`getLeads`) and CRM
 *    mutations (`updateStatus`, `addNote`, `deleteLead`, etc.) are rejected with HTTP 403.
 * 2. Tenant Boundary: Resolves Apps Script endpoint strictly per validated `clientId` from server env.
 *    Never falls back to another tenant's Apps Script URL.
 * 3. Input Validation & Anti-Abuse: Validates `clientId`, honeypot traps, and contact presence.
 * 4. Verified Persistence Reporting: Returns HTTP 200 only when Google Apps Script confirms a valid
 *    JSON success response (`writeVerified !== false`). Fails cleanly with HTTP 400/502 otherwise.
 */

import { CloudflareEnv, PagesContext, resolveTenantAppsScriptConfig } from './sync-sheet';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function jsonResponse(data: any, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

export function resolvePublicAppsScriptEndpoint(
  tenantId: string,
  env: CloudflareEnv
): string | null {
  const cleanId = (tenantId || '').trim().toLowerCase();
  if (!cleanId) return null;

  const fullConfig = resolveTenantAppsScriptConfig(cleanId, env);
  if (fullConfig?.endpointUrl) {
    return fullConfig.endpointUrl;
  }

  if (env.TENANT_CONFIGS_JSON) {
    try {
      const parsed =
        typeof env.TENANT_CONFIGS_JSON === 'string'
          ? JSON.parse(env.TENANT_CONFIGS_JSON)
          : env.TENANT_CONFIGS_JSON;
      const item = parsed && typeof parsed === 'object' ? parsed[cleanId] : null;
      if (item && typeof item.endpointUrl === 'string' && item.endpointUrl.trim()) {
        return item.endpointUrl.trim();
      }
    } catch {
      // Ignore malformed JSON and check individual env binding
    }
  }

  const envKeySuffix = cleanId.toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const endpointVar = env[`APPSCRIPT_ENDPOINT_${envKeySuffix}`];
  if (typeof endpointVar === 'string' && endpointVar.trim()) {
    return endpointVar.trim();
  }

  return null;
}

export async function onRequestOptions(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const { request, env } = context;

  let body: any = {};
  try {
    const text = await request.text();
    if (text) {
      body = JSON.parse(text);
    }
  } catch {
    return jsonResponse({ success: false, sheetSynced: false, message: 'Invalid JSON request body.' }, 400);
  }

  if (!body || typeof body !== 'object') {
    return jsonResponse({ success: false, sheetSynced: false, message: 'Malformed enquiry payload.' }, 400);
  }

  const action = (body.action || 'createLead').toString().trim();
  if (action !== 'createLead') {
    return jsonResponse(
      {
        success: false,
        sheetSynced: false,
        message: 'Forbidden: Public submission endpoint only permits createLead action.',
      },
      403
    );
  }

  // Honeypot anti-spam trap: silently drop automated bots
  if (body.website_hp || body.company_url || body.fax_number || body.gotcha) {
    return jsonResponse({
      success: true,
      status: 'success',
      result: 'success',
      sheetSynced: true,
      message: 'Enquiry received.',
    });
  }

  const cleanTenant = (body.clientId || '').toString().trim().toLowerCase();
  if (!cleanTenant || !/^[a-zA-Z0-9_-]+$/.test(cleanTenant) || cleanTenant.length > 64) {
    return jsonResponse(
      { success: false, sheetSynced: false, message: 'Missing or invalid tenant clientId.' },
      400
    );
  }

  const rawName = (body.name || '').toString().trim();
  const rawPhone = (body.phone || '').toString().trim();
  const phoneDigits = rawPhone.replace(/\D/g, '');
  if (rawName.length < 2 && phoneDigits.length < 5) {
    return jsonResponse(
      {
        success: false,
        sheetSynced: false,
        message: 'Invalid submission: A valid contact name or phone number is required.',
      },
      400
    );
  }

  const endpointUrl = resolvePublicAppsScriptEndpoint(cleanTenant, env);
  if (!endpointUrl) {
    return jsonResponse(
      {
        success: false,
        sheetSynced: false,
        message: `Tenant "${cleanTenant}" Google Apps Script endpoint is not configured on the gateway.`,
      },
      403
    );
  }

  if (!endpointUrl.startsWith('https://script.google.com/macros/s/')) {
    return jsonResponse(
      {
        success: false,
        sheetSynced: false,
        message: 'Invalid Google Apps Script endpoint URL configured for tenant.',
      },
      500
    );
  }

  const upstreamPayload: Record<string, any> = {
    action: 'createLead',
    id: body.id,
    timestamp: body.timestamp,
    clientId: cleanTenant,
    businessName: body.businessName,
    name: rawName.slice(0, 100),
    phone: rawPhone.slice(0, 50),
    email: typeof body.email === 'string' ? body.email.trim().slice(0, 120) : undefined,
    service: typeof body.service === 'string' ? body.service.trim().slice(0, 150) : 'General Enquiry',
    details: typeof body.details === 'string' ? body.details.trim().slice(0, 1000) : '',
    address: typeof body.address === 'string' ? body.address.trim().slice(0, 200) : '',
    leadSource: typeof body.leadSource === 'string' ? body.leadSource.trim().slice(0, 150) : 'Landing Page Enquiry (Website)',
    pageUrl: typeof body.pageUrl === 'string' ? body.pageUrl.trim().slice(0, 300) : '',
    notes: Array.isArray(body.notes) ? body.notes.slice(0, 10) : undefined,
    followUpDate: typeof body.followUpDate === 'string' ? body.followUpDate.trim().slice(0, 50) : undefined,
  };

  try {
    const upstreamRes = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(upstreamPayload),
      redirect: 'follow',
    });

    if (!upstreamRes.ok) {
      return jsonResponse(
        {
          success: false,
          sheetSynced: false,
          message: `Google Apps Script returned upstream HTTP status ${upstreamRes.status}.`,
        },
        502
      );
    }

    let upstreamJson: any = null;
    try {
      upstreamJson = await upstreamRes.json();
    } catch {
      return jsonResponse(
        {
          success: false,
          sheetSynced: false,
          message: 'Google Apps Script did not return a valid confirmation JSON.',
        },
        502
      );
    }

    const isSuccess = Boolean(
      upstreamJson &&
        (upstreamJson.result === 'success' || upstreamJson.status === 'success' || upstreamJson.status === 'ok') &&
        upstreamJson.writeVerified !== false
    );

    if (!isSuccess) {
      return jsonResponse(
        {
          success: false,
          sheetSynced: false,
          message: upstreamJson?.message || 'Google Apps Script failed to verify row write.',
        },
        upstreamJson?.status === 'error' ? 400 : 502
      );
    }

    return jsonResponse(
      {
        success: true,
        status: 'success',
        result: 'success',
        sheetSynced: true,
        writeVerified: true,
        leadId: upstreamJson.leadId || body.id,
        rowNumber: upstreamJson.rowNumber,
        clientId: cleanTenant,
        message: upstreamJson.message || 'Lead recorded in Google Sheet successfully.',
      },
      200
    );
  } catch {
    return jsonResponse(
      {
        success: false,
        sheetSynced: false,
        message: 'Failed to communicate with Google Apps Script Web App backend.',
      },
      502
    );
  }
}

export async function onRequest(context: PagesContext): Promise<Response> {
  if (context.request.method === 'OPTIONS') {
    return onRequestOptions();
  }
  if (context.request.method === 'POST') {
    return onRequestPost(context);
  }
  return jsonResponse({ success: false, sheetSynced: false, message: 'Method Not Allowed' }, 405);
}
