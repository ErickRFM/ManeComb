import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const testFilePath = path.resolve(scriptDir, '../test/point-to-point-tracker-core.test.mts');
const testNodeArgs = ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', testFilePath];
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

function runNodeExecutable(nodeExecutable, { quiet = false } = {}) {
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

function runWithPreferredWindowsNode() {
  process.exit(runNodeExecutable(preferredWindowsNode));
}

async function runWithCurrentNode() {
  const shouldKeepFirstAttemptQuiet = canFallbackToPreferredWindowsNode();
  const status = runNodeExecutable(process.execPath, { quiet: shouldKeepFirstAttemptQuiet });

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
}
