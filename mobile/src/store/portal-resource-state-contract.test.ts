declare const require: (id: string) => any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
export {};

describe('Portal resource-state migration contract', () => {
  const actions = fs.readFileSync(
    path.join(__dirname, '../../../ventas/features/portal/store/portal-actions.ts'),
    'utf8'
  );
  const api = fs.readFileSync(
    path.join(__dirname, '../../../ventas/features/portal/store/portal-api.ts'),
    'utf8'
  );

  it('does not clear global loading while another resource request is pending', () => {
    expect(actions).toContain('const activeLoads = new Map<PortalResourceDomain, number>();');
    expect(actions).toContain("beginResourceLoad(set, 'account')");
    expect(actions).toContain("beginResourceLoad(set, 'billing')");
    expect(actions).toContain('isLoading: activeLoads.size > 0');
    expect(actions).not.toContain('set({ invoices, isLoading: false })');
  });

  it('degrades activation keys only for an expected forbidden capability', () => {
    expect(api).toContain('error.response?.status === 403');
    expect(api).toContain('throw error;');
    expect(api).not.toContain('getAdminActivationKeysRequest().catch(() =>');
  });
});
