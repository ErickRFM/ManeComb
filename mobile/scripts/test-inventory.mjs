import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excludedDirectories = new Set([
  '.git',
  'android',
  'coverage',
  'dist',
  'e2e',
  'ios',
  'node_modules',
  'web-build',
]);
const unitTestPattern = /\.test\.(?:js|jsx|ts|tsx)$/i;
const jestRoots = ['src/', 'scripts/'];

function normalizeRelativePath(filePath) {
  return path.relative(mobileRoot, filePath).split(path.sep).join('/');
}

function collectUnitTests(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectUnitTests(absolutePath, output);
      continue;
    }

    if (entry.isFile() && unitTestPattern.test(entry.name)) {
      output.push(normalizeRelativePath(absolutePath));
    }
  }

  return output;
}

const unitTests = collectUnitTests(mobileRoot).sort();
const outsideJestRoots = unitTests.filter(
  (filePath) => !jestRoots.some((root) => filePath.startsWith(root))
);

if (unitTests.length === 0) {
  console.error('[test:inventory] No se encontraron pruebas unitarias de Mobile.');
  process.exitCode = 1;
} else if (outsideJestRoots.length > 0) {
  console.error(
    '[test:inventory] Hay pruebas unitarias fuera de los roots cubiertos por Jest:\n' +
      outsideJestRoots.map((filePath) => ` - ${filePath}`).join('\n')
  );
  process.exitCode = 1;
} else {
  console.log(
    `[test:inventory] ${unitTests.length} pruebas unitarias cubiertas automaticamente por Jest.`
  );
}
