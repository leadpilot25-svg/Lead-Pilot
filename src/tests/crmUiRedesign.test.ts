import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('LeadPilot CRM UI Simplification & Responsive Redesign', () => {
  const dashboardSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/LeadPilotDashboard.tsx'),
    'utf8'
  );
  const standaloneCrmSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/StandaloneCrm.tsx'),
    'utf8'
  );
  const followUpsSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CrmFollowUpsView.tsx'),
    'utf8'
  );
  const moreViewSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/CrmMoreSettingsView.tsx'),
    'utf8'
  );

  it('1. Main CRM page renders only 3 essential summary KPIs and omits duplicate Import Leads buttons', () => {
    expect(dashboardSource).toContain('Total leads');
    expect(dashboardSource).toContain('New leads');
    expect(dashboardSource).toContain('Follow-ups due');
    expect(dashboardSource).not.toContain('Conversion Funnel');
    expect(dashboardSource).not.toContain('Performance Metrics');

    const importButtonMatches = dashboardSource.match(/Import Leads/g) || [];
    expect(importButtonMatches.length).toBe(0);
  });

  it('2. Main CRM page includes search, status filters, single Add Lead trigger, and mobile card layout', () => {
    expect(dashboardSource).toContain('Search name, phone, or service...');
    expect(dashboardSource).toContain('md:hidden space-y-3');
    expect(dashboardSource).toContain('hidden md:block bg-slate-900');
    expect(dashboardSource).toContain('setIsAddLeadModalOpen(true)');
  });

  it('3. Google Sheets sync uses compact indicator and avoids large permanent summary banner on main page', () => {
    expect(dashboardSource).toContain('Syncing Google Sheets...');
    expect(dashboardSource).toContain('Sheet sync issue');
    expect(dashboardSource).toContain('Retry Sync');
    expect(dashboardSource).not.toContain('Google Sheets Synchronization');
  });

  it('4. Navigation supports Leads, Follow-ups, and More on both desktop header and mobile bottom bar', () => {
    expect(standaloneCrmSource).toContain('aria-label="Primary CRM Navigation"');
    expect(standaloneCrmSource).toContain('aria-label="Mobile CRM Navigation"');
    expect(standaloneCrmSource).toContain('md:hidden fixed bottom-0 left-0 right-0');
    expect(standaloneCrmSource).toContain("handleSelectPrimaryNav('leads')");
    expect(standaloneCrmSource).toContain("handleSelectPrimaryNav('followups')");
    expect(standaloneCrmSource).toContain("handleSelectPrimaryNav('more')");
  });

  it('5. More / Settings page houses Business Profile, Google Sheets Sync, Import, Export, Team Access, CRM Settings, and Integration Status', () => {
    expect(moreViewSource).toContain('Business Profile');
    expect(moreViewSource).toContain('Google Sheets Sync');
    expect(moreViewSource).toContain('Import Leads');
    expect(moreViewSource).toContain('Export Leads');
    expect(moreViewSource).toContain('Team Access');
    expect(moreViewSource).toContain('CRM Settings');
    expect(moreViewSource).toContain('Integration Status');
    expect(moreViewSource).toContain('XLSX.writeFile');
  });

  it('6. Follow-ups page organizes Overdue, Due Today, and Upcoming tasks cleanly', () => {
    expect(followUpsSource).toContain('Overdue (');
    expect(followUpsSource).toContain('Due Today (');
    expect(followUpsSource).toContain('Upcoming (');
  });
});
