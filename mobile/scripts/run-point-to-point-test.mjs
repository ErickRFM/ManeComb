import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const testFilePath = path.resolve(scriptDir, '../test/point-to-point-tracker-core.test.mts');
const sourceFilePath = path.resolve(scriptDir, '../src/hooks/point-to-point-tracker-core.ts');
const require = createRequire(import.meta.url);
const ts = require('typescript');
const preferredWindowsNode = process.env.ProgramFiles
  ? path.join(process.env.ProgramFiles, 'nodejs', 'node.exe')
  : 'C:\\Program Files\\nodejs\\node.exe';

function canFallbackToPreferredWindowsNode() {
  return (
    process.platform === 'win32' &&
    existsSync(preferredWindowsNode) &&
    path.resolve(process.execPath) !== path.resolve(preferredWindowsNode)
  );
}

function writeCapturedOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function transpileTypeScript(filePath, replacements = {}) {
  const source = Object.entries(replacements).reduce(
    (content, [from, to]) => content.replace(from, to),
    readFileSync(filePath, 'utf8')
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filePath,
    reportDiagnostics: true,
  });
  const diagnostics = output.diagnostics?.filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
  );

  if (diagnostics?.length) {
    const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => '\n',
    });
    throw new Error(message);
  }

  return output.outputText;
}

function prepareCompiledTest() {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'manecomb-tracker-test-'));
  const compiledTestFilePath = path.join(tempRoot, 'test', 'point-to-point-tracker-core.test.mjs');
  const compiledSourceFilePath = path.join(tempRoot, 'src', 'hooks', 'point-to-point-tracker-core.mjs');

  mkdirSync(dirname(compiledTestFilePath), { recursive: true });
  mkdirSync(dirname(compiledSourceFilePath), { recursive: true });
  writeFileSync(compiledSourceFilePath, transpileTypeScript(sourceFilePath));
  writeFileSync(
    compiledTestFilePath,
    transpileTypeScript(testFilePath, {
      '../src/hooks/point-to-point-tracker-core.ts': '../src/hooks/point-to-point-tracker-core.mjs',
    })
  );

  return {
    compiledTestFilePath,
    tempRoot,
  };
}

function runNodeExecutable(nodeExecutable, testNodeArgs, { quiet = false } = {}) {
  const result = spawnSync(nodeExecutable, testNodeArgs, {
    encoding: quiet ? 'utf8' : undefined,
    stdio: quiet ? 'pipe' : 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }

  if (quiet && result.status === 0) {
    writeCapturedOutput(result);
  }

  return result.status ?? 1;
}

const { compiledTestFilePath, tempRoot } = prepareCompiledTest();
const testNodeArgs = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', compiledTestFilePath];

function runWithPreferredWindowsNode() {
  const status = runNodeExecutable(preferredWindowsNode, testNodeArgs);

  if (status !== 0) {
    throw new Error(`La prueba de tracker termino con codigo ${status}.`);
  }
}

async function runWithCurrentNode() {
  const shouldKeepFirstAttemptQuiet = canFallbackToPreferredWindowsNode();
  const status = runNodeExecutable(process.execPath, testNodeArgs, {
    quiet: shouldKeepFirstAttemptQuiet,
  });

  if (status !== 0) {
    throw new Error(`La prueba de tracker termino con codigo ${status}.`);
  }
}

try {
  await runWithCurrentNode();
} catch (error) {
  if (!canFallbackToPreferredWindowsNode()) {
    throw error;
  }

  runWithPreferredWindowsNode();
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
