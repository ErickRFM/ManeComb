const fs = require('node:fs');
const path = require('node:path');

const rootStorePath = path.join(__dirname, 'root-store.ts');

function readRootStore() {
  return fs.readFileSync(rootStorePath, 'utf8');
}

describe('root-store session storage wiring', () => {
  it('delegates persisted session credentials without moving session authority', () => {
    const source = readRootStore();

    expect(source).toMatch(/from ['"]\.\/runtime\/session-storage['"]/);
    expect(source).toContain('createSessionStorageRuntime');
    expect(source).toContain('const sessionStorage = createSessionStorageRuntime(storeStorage)');
    expect(source).toContain('const persistSession = sessionStorage.persistSession');
    expect(source).toContain('sessionStorage.getToken()');
    expect(source).toContain('sessionStorage.getRefreshToken()');
    expect(source).toContain('sessionStorage.getMode()');

    expect(source).not.toMatch(/const\s+TOKEN_KEY\s*=/);
    expect(source).not.toMatch(/const\s+REFRESH_TOKEN_KEY\s*=/);
    expect(source).not.toMatch(/const\s+MODE_KEY\s*=/);
    expect(source).not.toMatch(/async function\s+persistSession/);
  });
});
