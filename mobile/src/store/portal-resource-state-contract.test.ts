declare const require: (id: string) => any;
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
export {};

describe('Portal resource-state migration contract', () => {
  const api = fs.readFileSync(
    path.join(__dirname, '../../../ventas/features/portal/store/portal-api.ts'),
    'utf8'
  );

  it('degrades activation keys only for an expected forbidden capability', () => {
    expect(api).toContain('error.response?.status === 403');
    expect(api).toContain('throw error;');
    expect(api).not.toContain('getAdminActivationKeysRequest().catch(() =>');
  });
});
