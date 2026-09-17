const fs = require('node:fs');
const path = require('node:path');

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(absolute) : [absolute];
  });
}

describe('mobile store module boundaries', () => {
  it('keeps extracted slices/runtime independent from public root store', () => {
    const storeDir = __dirname;
    const candidates = [
      ...collectFiles(path.join(storeDir, 'slices')),
      ...collectFiles(path.join(storeDir, 'runtime')),
    ].filter((file) => /\.(ts|tsx|js|jsx)$/.test(file));

    for (const file of candidates) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from\s+['"][^'"]*root-store['"]/);
      expect(source).not.toMatch(/from\s+['"][^'"]*use-app-store['"]/);
    }
  });
});
