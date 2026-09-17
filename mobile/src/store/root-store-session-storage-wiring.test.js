const fs = require('node:fs');
const path = require('node:path');

describe('root-store session storage wiring', () => {
  it('uses focused session semantics over main persistent-storage I/O', () => {
    const source = fs.readFileSync(path.join(__dirname, 'root-store.ts'), 'utf8');

    expect(source).toMatch(/from ['"]\.\/persistent-storage['"]/);
    expect(source).toMatch(/from ['"]\.\/runtime\/session-storage['"]/);
    expect(source).toContain('const sessionStorage = createSessionStorageRuntime({');
    expect(source).toContain('getItem: getStoredItem');
    expect(source).toContain('setItem: setStoredItem');
    expect(source).toContain('deleteItem: deleteStoredItem');
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
