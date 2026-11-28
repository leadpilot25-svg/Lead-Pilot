import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function readPngDimensions(filePath: string): { width: number; height: number; isPng: boolean } {
  const buf = fs.readFileSync(filePath);
  const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const isPng = buf.subarray(0, 8).equals(pngSig);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height, isPng };
}

describe('LeadPilot CRM PWA & Add to Home Screen Support', () => {
  const root = process.cwd();
  const viteConfig = fs.readFileSync(path.resolve(root, 'vite.config.ts'), 'utf8');
  const indexHtml = fs.readFileSync(path.resolve(root, 'index.html'), 'utf8');
  const mainTsx = fs.readFileSync(path.resolve(root, 'src/main.tsx'), 'utf8');
  const moreView = fs.readFileSync(path.resolve(root, 'src/components/CrmMoreSettingsView.tsx'), 'utf8');
  const installCard = fs.readFileSync(path.resolve(root, 'src/components/PWAInstallCard.tsx'), 'utf8');
  const installStore = fs.readFileSync(path.resolve(root, 'src/pwa/installPromptStore.ts'), 'utf8');

  it('1. Configures PWA manifest with LeadPilot name and /crm start_url', () => {
    expect(viteConfig).toContain('VitePWA');
    expect(viteConfig).toContain("name: 'LeadPilot CRM'");
    expect(viteConfig).toContain("short_name: 'LeadPilot'");
    expect(viteConfig).toContain("start_url: '/crm'");
    expect(viteConfig).toContain("id: '/crm'");
    expect(viteConfig).toContain("display: 'standalone'");
    expect(viteConfig).toContain("scope: '/'");
  });

  it('2. Provides valid 192x192 and 512x512 LeadPilot icons including maskable variants and apple-touch-icon', () => {
    const icon192 = readPngDimensions(path.resolve(root, 'public/pwa-192x192.png'));
    const icon512 = readPngDimensions(path.resolve(root, 'public/pwa-512x512.png'));
    const mask192 = readPngDimensions(path.resolve(root, 'public/pwa-maskable-192x192.png'));
    const mask512 = readPngDimensions(path.resolve(root, 'public/pwa-maskable-512x512.png'));
    const apple180 = readPngDimensions(path.resolve(root, 'public/apple-touch-icon.png'));

    expect(icon192).toEqual({ width: 192, height: 192, isPng: true });
    expect(icon512).toEqual({ width: 512, height: 512, isPng: true });
    expect(mask192).toEqual({ width: 192, height: 192, isPng: true });
    expect(mask512).toEqual({ width: 512, height: 512, isPng: true });
    expect(apple180).toEqual({ width: 180, height: 180, isPng: true });
    const iconSvg = fs.readFileSync(path.resolve(root, 'public/icon.svg'), 'utf8');
    expect(iconSvg).toContain('#040c1d');
    expect(iconSvg).toContain('Lead');
    expect(iconSvg).toContain('Pilot');
    expect(iconSvg).not.toContain('M6 22V4');

    expect(viteConfig).toContain("purpose: 'any'");
    expect(viteConfig).toContain("purpose: 'maskable'");
  });

  it('3. Registers service worker cleanly and excludes /api/* from SW navigation fallback', () => {
    expect(mainTsx).toContain("from 'virtual:pwa-register'");
    expect(mainTsx).toContain('registerSW');
    expect(viteConfig).toContain('navigateFallbackDenylist');
    expect(viteConfig).toContain('/^\\/api\\//');
  });

  it('4. Includes Install LeadPilot option in More / Settings page', () => {
    expect(moreView).toContain("id: 'install'");
    expect(moreView).toContain("label: 'Install LeadPilot'");
    expect(moreView).toContain('<PWAInstallCard />');
    expect(installCard).toContain('Install LeadPilot');
  });

  it('5. Supports Android Chrome beforeinstallprompt, appinstalled, standalone check, and head meta tags', () => {
    expect(installStore).toContain("'beforeinstallprompt'");
    expect(installStore).toContain("'appinstalled'");
    expect(installStore).toContain('(display-mode: standalone)');
    expect(installStore).toContain('deferredPrompt.prompt()');

    expect(indexHtml).toContain('name="theme-color"');
    expect(indexHtml).toContain('name="mobile-web-app-capable" content="yes"');
    expect(indexHtml).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
  });
});
