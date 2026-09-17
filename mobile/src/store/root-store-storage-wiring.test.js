const fs = require('node:fs');
const path = require('node:path');

const rootStorePath = path.join(__dirname, 'root-store.ts');

function readRootStore() {
  return fs.readFileSync(rootStorePath, 'utf8');
}

describe('root-store storage wiring', () => {
  it('delegates storage behavior to the generic runtime', () => {
    const source = readRootStore();

    expect(source).toMatch(/from ['"]\.\/runtime\/store-storage['"]/);
    expect(source).toContain('createStoreStorageRuntime');
    expect(source).toContain('getStoredItem = storeStorage.getItem');
    expect(source).toContain('setStoredItem = storeStorage.setItem');
    expect(source).toContain('deleteStoredItem = storeStorage.deleteItem');

    expect(source).not.toMatch(/async function\s+withStorageTimeout/);
    expect(source).not.toMatch(/async function\s+getStoredItem/);
    expect(source).not.toMatch(/async function\s+setStoredItem/);
    expect(source).not.toMatch(/async function\s+deleteStoredItem/);
    expect(source).not.toContain('STORAGE_TIMEOUT_MS');
    expect(source).not.toContain('safeWebStorageGetItem');
    expect(source).not.toContain('safeWebStorageSetItem');
    expect(source).not.toContain('safeWebStorageRemoveItem');
  });
});
