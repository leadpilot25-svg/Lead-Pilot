import React, { useState } from 'react';
import { Check, Download, Share, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../pwa/installPromptStore';

export const PWAInstallCard: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [installFeedback, setInstallFeedback] = useState<string | null>(null);
  const [isPrompting, setIsPrompting] = useState(false);

  const handleInstallClick = async () => {
    setIsPrompting(true);
    setInstallFeedback(null);
    try {
      const outcome = await install();
      if (outcome === 'accepted') {
        setInstallFeedback('LeadPilot CRM is being added to your home screen.');
      } else if (outcome === 'dismissed') {
        setInstallFeedback('Installation was dismissed. You can install anytime from here.');
      }
    } catch {
      setInstallFeedback('Could not open the install prompt. Use your browser menu to install.');
    } finally {
      setIsPrompting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-4 border-b border-slate-800">
        <h3 className="text-lg font-bold text-white">Install LeadPilot</h3>
        <p className="text-xs text-slate-400 mt-1">
          Add LeadPilot CRM to your phone or desktop home screen for instant launch directly into your leads.
        </p>
      </div>

      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 space-y-5">
        <div className="flex items-center gap-4">
          <img
            src="/pwa-192x192.png"
            alt="LeadPilot CRM icon"
            className="w-14 h-14 rounded-2xl border border-slate-700/80 shrink-0"
          />
          <div className="min-w-0">
            <div className="text-sm font-bold text-white">LeadPilot CRM</div>
            <div className="text-xs text-slate-400 mt-0.5">
              Opens directly at <span className="font-mono text-slate-300">/crm</span> in full-screen app mode
            </div>
          </div>
        </div>

        {isInstalled ? (
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-xs text-emerald-200 flex items-center gap-2.5">
            <Check className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>LeadPilot CRM is already installed and running in app mode on this device.</span>
          </div>
        ) : isInstallable ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={isPrompting}
              className="min-h-[44px] w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isPrompting ? 'Opening Install Prompt...' : 'Install LeadPilot'}</span>
            </button>
            <p className="text-xs text-slate-400">
              {isAndroid
                ? 'Tap Install LeadPilot to add the app icon to your Android home screen.'
                : 'Tap Install LeadPilot to install the CRM app on this device.'}
            </p>
          </div>
        ) : isIOS ? (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs text-slate-300">
            <div className="font-semibold text-white flex items-center gap-2">
              <Share className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Install on iPhone or iPad (Safari)</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-slate-400 leading-relaxed">
              <li>
                Tap the <strong className="text-slate-200">Share</strong> button in the Safari toolbar.
              </li>
              <li>
                Scroll down and tap <strong className="text-slate-200">Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong className="text-slate-200">Add</strong> to place LeadPilot on your home screen.
              </li>
            </ol>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2.5 text-xs text-slate-300">
            <div className="font-semibold text-white flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{isAndroid ? 'Install via Chrome Menu' : 'Browser Install Instructions'}</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              {isAndroid
                ? 'Open the Chrome menu (⋮) in the top-right corner and tap Add to home screen or Install app.'
                : 'Open your browser menu or address-bar install icon and choose Install LeadPilot CRM (or Add to home screen on mobile Chrome).'}
            </p>
          </div>
        )}

        {installFeedback && (
          <div className="text-xs text-slate-300 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5">
            {installFeedback}
          </div>
        )}
      </div>
    </div>
  );
};
