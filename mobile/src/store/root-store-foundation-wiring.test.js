const fs = require('node:fs');
const path = require('node:path');

describe('root-store foundation wiring', () => {
  it('delegates resource/reset factories and domains', () => {
    const source = fs.readFileSync(path.join(__dirname, 'root-store.ts'), 'utf8');

    expect(source).toMatch(/from ['"]\.\/app-state-foundation['"]/);
    expect(source).toContain('MOBILE_RESOURCE_DOMAINS');
    expect(source).toContain('createIdleMobileResources');
    expect(source).toContain('createEmptyOperationalState');
    expect(source).not.toMatch(/function\s+idleMobileResources\s*\(/);
    expect(source).not.toMatch(/function\s+getEmptyOperationalState\s*\(/);
    expect(source).not.toContain('mobileResourceDomains');
  });
});
