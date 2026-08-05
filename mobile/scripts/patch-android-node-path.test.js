const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  hasNodeExecutableDeclaration,
  patchAndroidNodePath,
} = require('./patch-android-node-path');

function createAndroidFixture(appBuildGradle, settingsGradle = 'pluginManagement {\n}\n') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'manecomb-node-patch-'));
  const appDir = path.join(root, 'app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(root, 'settings.gradle'), settingsGradle, 'utf8');
  fs.writeFileSync(path.join(appDir, 'build.gradle'), appBuildGradle, 'utf8');
  return root;
}

function readAppBuildGradle(androidDir) {
  return fs.readFileSync(path.join(androidDir, 'app', 'build.gradle'), 'utf8');
}

function countNodeDeclarations(source) {
  return (source.match(/def\s+nodeExecutable\s*=/g) || []).length;
}

describe('patchAndroidNodePath', () => {
  const fixtures = [];

  afterEach(() => {
    while (fixtures.length) {
      fs.rmSync(fixtures.pop(), { recursive: true, force: true });
    }
  });

  it('recognizes the cross-platform multiline declaration', () => {
    const source = [
      "def nodeExecutable = System.getenv('NODE_BINARY')",
      "    ?: (org.gradle.internal.os.OperatingSystem.current().isWindows() ? 'node.exe' : 'node')",
    ].join('\n');

    expect(hasNodeExecutableDeclaration(source)).toBe(true);
  });

  it('does not duplicate a multiline declaration and is idempotent', () => {
    const androidDir = createAndroidFixture([
      'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
      "def nodeExecutable = System.getenv('NODE_BINARY')",
      "    ?: (org.gradle.internal.os.OperatingSystem.current().isWindows() ? 'node.exe' : 'node')",
      'react {',
      '  nodeExecutableAndArgs = [nodeExecutable]',
      '}',
      '',
    ].join('\n'));
    fixtures.push(androidDir);

    patchAndroidNodePath(androidDir, 'C:\\Program Files\\nodejs\\node.exe');
    const first = readAppBuildGradle(androidDir);
    patchAndroidNodePath(androidDir, 'C:\\Program Files\\nodejs\\node.exe');
    const second = readAppBuildGradle(androidDir);

    expect(countNodeDeclarations(first)).toBe(1);
    expect(second).toBe(first);
  });

  it('adds one declaration when missing and replaces hard-coded node arrays', () => {
    const androidDir = createAndroidFixture([
      'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
      'react {',
      '  reactNativeDir = new File(["node", "--print", "require.resolve(\\\'react-native/package.json\\\')"].execute(null, rootDir).text.trim())',
      '}',
      '',
    ].join('\n'));
    fixtures.push(androidDir);

    patchAndroidNodePath(androidDir, 'C:\\Program Files\\nodejs\\node.exe');
    const result = readAppBuildGradle(androidDir);

    expect(countNodeDeclarations(result)).toBe(1);
    expect(result).toContain("System.getenv('NODE_BINARY') ?: 'C:\\\\Program Files\\\\nodejs\\\\node.exe'");
    expect(result).toContain('[nodeExecutable, "--print"');
  });

  it('refreshes a legacy literal fallback without adding another variable', () => {
    const androidDir = createAndroidFixture([
      'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
      "def nodeExecutable = System.getenv('NODE_BINARY') ?: 'C:\\\\old\\\\node.exe'",
      'react {',
      '  nodeExecutableAndArgs = [nodeExecutable]',
      '}',
      '',
    ].join('\n'));
    fixtures.push(androidDir);

    patchAndroidNodePath(androidDir, 'C:\\Program Files\\nodejs\\node.exe');
    const result = readAppBuildGradle(androidDir);

    expect(countNodeDeclarations(result)).toBe(1);
    expect(result).toContain("'C:\\\\Program Files\\\\nodejs\\\\node.exe'");
    expect(result).not.toContain("'C:\\\\old\\\\node.exe'");
  });
});
