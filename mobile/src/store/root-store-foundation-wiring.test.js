const fs = require('node:fs');
const path = require('node:path');

const rootStorePath = path.join(__dirname, 'root-store.ts');

function readRootStore() {
  return fs.readFileSync(rootStorePath, 'utf8');
}

describe('root-store foundation wiring', () => {
  it('delegates resource/reset factories to app-state-foundation', () => {
    const source = readRootStore();

    expect(source).toMatch(/from ['"]\.\/app-state-foundation['"]/);
    expect(source).toContain('createIdleMobileResources');
    expect(source).toContain('createEmptyOperationalState');
    expect(source).not.toMatch(/function\s+idleMobileResources\s*\(/);
    expect(source).not.toMatch(/function\s+getEmptyOperationalState\s*\(/);
    expect(source).not.toMatch(/const\s+mobileResourceDomains\s*:/);
  });
});
