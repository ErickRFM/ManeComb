const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const ALLOWED_ACTION_FILES = new Set([
  path.normalize('mobile/src/navigation/router.tsx'),
  path.normalize('ventas/src/navigation/router.tsx'),
]);

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry: {
    isDirectory: () => boolean;
    name: string;
  }) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(absolutePath);
    }

    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [absolutePath] : [];
  });
}

describe('navigation architecture boundary', () => {
  it('prevents React Navigation actions outside the central router', () => {
    const mobileRoot = nodeProcess.cwd();
    const projectRoot = path.dirname(mobileRoot);
    const files = [
      path.join(mobileRoot, 'App.tsx'),
      ...collectSourceFiles(path.join(mobileRoot, 'src')),
      path.join(projectRoot, 'ventas', 'src', 'App.tsx'),
      ...collectSourceFiles(path.join(projectRoot, 'ventas', 'src')),
      ...collectSourceFiles(path.join(projectRoot, 'ventas', 'screens')),
      ...collectSourceFiles(path.join(projectRoot, 'ventas', 'features')),
    ];
    const violations: string[] = [];

    files.forEach((file) => {
      const relativePath = path.normalize(path.relative(projectRoot, file));

      if (ALLOWED_ACTION_FILES.has(relativePath) || relativePath.endsWith('.test.ts')) {
        return;
      }

      const source = fs.readFileSync(file, 'utf8');
      const hasDirectMethod = /\bnavigation\s*\.\s*(navigate|push|replace|reset|dispatch|pop|popToTop|goBack)\s*\(/.test(source);
      const importsActions = /\b(CommonActions|StackActions)\b/.test(source);

      if (hasDirectMethod || importsActions) {
        violations.push(relativePath);
      }
    });

    expect(violations).toEqual([]);
  });
});
