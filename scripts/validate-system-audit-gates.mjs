import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const contractPath = path.join(repositoryRoot, 'docs', 'architecture', 'system-audit-gates.json');
const authorityPath = path.join(repositoryRoot, 'docs', 'architecture', 'system-authorities.json');
const ciPath = path.join(repositoryRoot, '.github', 'workflows', 'ci.yml');
const errors = [];

function fail(message) {
  errors.push(message);
}

function git(...args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function gitRefExists(ref) {
  try {
    git('rev-parse', '--verify', ref);
    return true;
  } catch {
    return false;
  }
}

function assertFile(filePath, label) {
  if (!fs.existsSync(filePath)) fail(`${label} is missing: ${path.relative(repositoryRoot, filePath)}`);
}

function commitDrift(base, head) {
  return Number(git('rev-list', '--count', `${base}..${head}`));
}

assertFile(contractPath, 'System audit gate contract');
assertFile(authorityPath, 'System authority map');
assertFile(ciPath, 'Main CI workflow');

if (errors.length === 0) {
  const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
  const expectedGates = [
    'AUTHORITY',
    'RACE_LIFECYCLE',
    'PLATFORM',
    'INTEGRATION',
    'CI_RELEASE',
    'PHYSICAL',
  ];
  const freshnessRef = gitRefExists('origin/main') ? 'origin/main' : 'HEAD';

  if (contract.schemaVersion !== 1) fail('system-audit-gates schemaVersion must be 1.');

  const baseline = String(contract.baseline?.commit || '').trim();
  if (!/^[a-f0-9]{40}$/.test(baseline)) {
    fail('system-audit-gates baseline.commit must be a full 40-character Git SHA.');
  }

  const gateIds = Array.isArray(contract.requiredGates)
    ? contract.requiredGates.map((gate) => String(gate?.id || '').trim())
    : [];
  if (JSON.stringify(gateIds) !== JSON.stringify(expectedGates)) {
    fail(`requiredGates must be exactly: ${expectedGates.join(', ')}.`);
  }

  if (!Array.isArray(contract.crossLayerSurfaces) || contract.crossLayerSurfaces.length < 6) {
    fail('crossLayerSurfaces must contain the system surfaces covered by the cross-layer audit.');
  } else {
    const requiredCrossLayerSurfaces = [
      'journey-tenant-transitions',
      'repository-change-governance',
    ];
    for (const surface of requiredCrossLayerSurfaces) {
      if (!contract.crossLayerSurfaces.includes(surface)) {
        fail(`crossLayerSurfaces lost required audited surface: ${surface}.`);
      }
    }
  }

  if (!Array.isArray(contract.blockingSeverities) ||
      !contract.blockingSeverities.includes('P0') ||
      !contract.blockingSeverities.includes('P1')) {
    fail('P0 and P1 must remain merge-blocking severities.');
  }

  const maxDrift = Number(contract.maxBaselineDriftCommits);
  if (!Number.isInteger(maxDrift) || maxDrift < 1) {
    fail('maxBaselineDriftCommits must be a positive integer.');
  }

  const maxAuthorityMapDrift = Number(contract.maxAuthorityMapDriftCommits);
  if (!Number.isInteger(maxAuthorityMapDrift) || maxAuthorityMapDrift < 1) {
    fail('maxAuthorityMapDriftCommits must be a positive integer.');
  }

  if (errors.length === 0) {
    try {
      git('merge-base', '--is-ancestor', baseline, 'HEAD');
    } catch {
      fail(`Audit baseline ${baseline} is not an ancestor of HEAD. Reconcile the branch before trusting the audit.`);
    }

    try {
      git('merge-base', '--is-ancestor', baseline, freshnessRef);
    } catch {
      fail(`Audit baseline ${baseline} is not an ancestor of ${freshnessRef}. Refresh from current main.`);
    }

    if (errors.length === 0) {
      const drift = commitDrift(baseline, freshnessRef);
      if (drift > maxDrift) {
        fail(`Audit baseline is ${drift} commits behind ${freshnessRef} (max ${maxDrift}). Refresh the audit before merge.`);
      }
      console.log(`System audit baseline drift vs ${freshnessRef}: ${drift}/${maxDrift} commits.`);
    }
  }

  const ci = fs.readFileSync(ciPath, 'utf8');
  const requiredCiMarkers = [
    'Backend tests',
    'Mobile quality',
    'Mobile Jest (Windows)',
    'Android debug APK certification',
    'Infrastructure validation',
    'validate-system-authorities.mjs',
  ];
  for (const marker of requiredCiMarkers) {
    if (!ci.includes(marker)) fail(`Main CI contract lost required gate: ${marker}`);
  }

  const authorityDocument = JSON.parse(fs.readFileSync(authorityPath, 'utf8'));
  const authorityBaseline = String(authorityDocument.baseline?.commit || '').trim();
  if (/^[a-f0-9]{40}$/.test(authorityBaseline)) {
    try {
      git('merge-base', '--is-ancestor', authorityBaseline, freshnessRef);
      const authorityDrift = commitDrift(authorityBaseline, freshnessRef);
      if (authorityDrift > maxAuthorityMapDrift) {
        fail(
          `System authority map is ${authorityDrift} commits behind ${freshnessRef} ` +
          `(max ${maxAuthorityMapDrift}). Refresh the semantic authority audit before merge.`
        );
      } else {
        console.log(
          `System authority map drift vs ${freshnessRef}: ${authorityDrift}/${maxAuthorityMapDrift} commits.`
        );
      }
    } catch {
      fail(
        `System authority map baseline is not an ancestor of ${freshnessRef}. ` +
        'Run a dedicated semantic authority reconciliation before merge.'
      );
    }
  } else {
    fail('system-authorities baseline.commit is not a full Git SHA.');
  }
}

if (errors.length > 0) {
  console.error('System audit gate validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('System audit gate contract valid.');
