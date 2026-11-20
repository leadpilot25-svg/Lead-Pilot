# LeadPilot — High-Converting Multi-Tenant Landing & CRM Platform

LeadPilot is a production-hardened multi-tenant platform combining high-converting industry landing websites with a dedicated customer CRM, Google Sheets bi-directional synchronization, and Google Firebase authentication.

---

## Architecture Overview

LeadPilot supports three distinct deployment targets and multiple hosting environments:

1. **Standalone Landing Website (`dist-landing/`)**:
   - Public customer-facing landing page, Google Business Profile info, lead capture form, and WhatsApp CTA.
   - Zero CRM dashboard or administrative dev controls exposed.
   - Built via `npm run build:landing` (entry: `src/AppLanding.tsx`).

2. **Standalone Customer CRM (`dist-crm/`)**:
   - Client login/logout, lead dashboard, status pipelines, follow-ups, and WhatsApp quick actions.
   - Built via `npm run build:crm` (entry: `src/AppCrm.tsx`).

3. **Master Internal Development Suite (`dist/`)**:
   - Internal dev suite with industry template switchers, Config Editor Drawer, and Code Exporter.
   - Built via `npm run build` (entry: `src/App.tsx`).

4. **Cloudflare Pages & Edge API Gateway (`functions/api/sync-sheet.ts`)**:
   - Cryptographic RS256 Firebase ID token signature verification via Google Public JWKS.
   - Independent Firestore tenant membership verification using named database `ai-studio-adaa6756-a579-4944-874a-1f7ccb196d2b`.
   - Server-authoritative Apps Script secret resolution (`APPSCRIPT_ENDPOINT_<TENANT>` and `APPSCRIPT_KEY_<TENANT>`).
   - SPA routing via `public/_redirects` (`/* /index.html 200`) and API routing via `public/_routes.json`.

5. **Dedicated Single-Tenant Vercel Deployments**:
   - Fully supported via `VITE_SINGLE_TENANT_MODE=true` and `VITE_CLIENT_ID=<tenant-id>`.

---

## Windows Installation & Local Setup

### Prerequisites
- **Node.js**: v18.0.0 or higher (v20+ or v22+ LTS recommended). Download from [nodejs.org](https://nodejs.org/).
- **Terminal**: Windows Terminal, PowerShell, or Command Prompt (CMD).

### Step-by-Step Instructions

1. **Extract the ZIP Archive**:
   Extract `leadpilot-final.zip` to your desired folder (e.g., `C:\Projects\leadpilot`).

2. **Open PowerShell / Terminal**:
   Press `Win + X` and select **Terminal** or **PowerShell**, then navigate to the project directory:
   ```powershell
   cd C:\Projects\leadpilot
   ```

3. **Install Dependencies**:
   ```powershell
   npm install
   ```

4. **Configure Local Environment (Optional)**:
   A sample configuration file `.env.example` is included. To customize local settings:
   ```powershell
   Copy-Item .env.example .env
   ```
   *Default values allow full local development without extra configuration.*

5. **Start the Local Development Server**:
   ```powershell
   npm run dev
   ```
   Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## Local Verification & Test Suite Execution

All test suites can be run locally in Windows PowerShell or CMD:

| Command | Purpose | Expected Result |
| :--- | :--- | :--- |
| `npm run lint` | TypeScript type check (`tsc --noEmit`) | 0 errors |
| `npm run test:cloudflare` | 34 security gateway, RS256 token, and tenant isolation tests | 34 passed |
| `npm run test:security` | 7 CRM multi-tenant access control and mutation guards | 7 passed |
| `npm run test:controlled` | 7 controlled local tenant provisioning and isolation tests | 7 passed |
| `npm run test:sheetsync` | 10 bi-directional Google Sheets sync and idempotency tests | 10 passed |
| `npm run test:appscript` | 44 Google Apps Script security and formula injection tests | 44 passed |
| `npx vitest run src/tests/industryAndPackage.test.ts` | 8 industry preset and package entitlement tests | 8 passed |

To execute all tests consecutively:
```powershell
npm run lint && npm run test:cloudflare && npm run test:security && npm run test:controlled && npm run test:sheetsync && npm run test:appscript && npx vitest run src/tests/industryAndPackage.test.ts
```

---

## Production Build Commands

```powershell
# 1. Master Development & Client Preview Build (outputs to dist/)
npm run build

# 2. Standalone Public Landing Website Build (outputs to dist-landing/)
npm run build:landing

# 3. Standalone Customer CRM Build (outputs to dist-crm/)
npm run build:crm
```

---

## Hostname Resolution in Shared Production

In shared Cloudflare Pages production (`*.leadpilot.pages.dev`), tenant identity is authoritatively dictated by the incoming hostname:

| Hostname | Resolved Tenant ID | Client Business |
| :--- | :--- | :--- |
| `prodrain.leadpilot.pages.dev` | `prodrain-plumbing-kochi` | ProDrain Plumbing |
| `tarot.leadpilot.pages.dev` | `demo-tarot-kochi` | Tarot Coaching & Guidance |
| `apex.leadpilot.pages.dev` | `client-apex-hvac` | Apex Heating & Cooling |
| `roofing.leadpilot.pages.dev` | `roofing-client-01` | Test Client (Roofing) |
| *Any unknown / unmapped hostname* | *None* | **Fails closed to `<PortalNotFound />`** |

*Note: In production builds, URL query parameters (`?client=...` / `?clientId=...`) are strictly prohibited and cannot override tenant identity.*

---

## Cloudflare Pages Staging Deployment Guide

1. **Output Directory**:
   - Landing Build: `dist-landing`
   - CRM Build: `dist-crm`
   - Master Build: `dist`
2. **Environment Variables & Secrets** (Set in Cloudflare Dashboard > Pages > Settings > Environment Variables):
   - `FIREBASE_PROJECT_ID`: `bamboo-tangent-x8gvj`
   - `FIRESTORE_DATABASE_ID`: `ai-studio-adaa6756-a579-4944-874a-1f7ccb196d2b`
   - `ROOT_ADMIN_UID`: `<Firebase UID for mail.nasiya@gmail.com>`
   - `APPSCRIPT_ENDPOINT_PRODRAIN_PLUMBING_KOCHI`: `https://script.google.com/macros/s/.../exec`
   - `APPSCRIPT_KEY_PRODRAIN_PLUMBING_KOCHI`: `<Private Secret API Key>`
   - Additional tenants: `APPSCRIPT_ENDPOINT_<TENANT_ID>` and `APPSCRIPT_KEY_<TENANT_ID>`

---

## Google Apps Script Setup Guide

The hardened backend script is located at `public/downloads/Code.gs`:
1. In your Google Sheet, open **Extensions > Apps Script**.
2. Replace the editor contents with the code from `public/downloads/Code.gs`.
3. Go to **Project Settings > Script Properties** and add:
   - `TARGET_CLIENT_ID`: The exact client tenant ID (e.g., `prodrain-plumbing-kochi`).
   - `API_KEY`: A strong private secret token matching your Cloudflare environment secret.
4. Click **Deploy > New deployment**, select **Web app**, set execute as **Me**, and access to **Anyone**.

---

## License & Support
Proprietary software for LeadPilot. All rights reserved.
