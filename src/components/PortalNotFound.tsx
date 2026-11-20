import React from 'react';
import { AlertTriangle } from 'lucide-react';

export function PortalNotFound({ requestedId }: { requestedId?: string }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold text-white mb-2">Client Portal Not Found / Inactive</h1>
        <p className="text-sm text-slate-400 mb-6">
          No active business configuration was found for domain or identifier:
          <br />
          <span className="font-mono text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded text-xs mt-1 inline-block border border-amber-500/20">
            {requestedId || 'unconfigured domain'}
          </span>
        </p>
        <p className="text-xs text-slate-500 mb-2">
          This portal is inactive or unconfigured. Cross-tenant defaults are disabled to protect client data and privacy.
        </p>
      </div>
    </div>
  );
}
