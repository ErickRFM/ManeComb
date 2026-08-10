import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ACCEPTANCE_EXPIRES_AT = Date.parse('2026-09-15T00:00:00Z');
const EXPECTED_VULNERABLE_VERSIONS = new Map([
  ['image-size', '1.2.1'],
  ['nanoid', '3.3.11'],
]);
const ACCEPTED_ADVISORY_URLS = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
  'https://github.com/advisories/GHSA-28wg-ghj8-5hjv',
  'https://github.com/advisories/GHSA-2v37-7h3g-55p8',
]);
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function fail(message) {
  console.error(`mobile dependency audit: ${message}`);
  process.exit(1);
}

function readInstalledVersion(packageName) {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  return lock?.packages?.[`node_modules/${packageName}`]?.version || null;
}

function advisoryUrls(vulnerability) {
  return (Array.isArray(vulnerability?.via) ? vulnerability.via : [])
    .filter((entry) => entry && typeof entry === 'object' && typeof entry.url === 'string')
    .map((entry) => entry.url);
}

function dependencyNames(vulnerability) {
  return (Array.isArray(vulnerability?.via) ? vulnerability.via : [])
    .filter((entry) => typeof entry === 'string');
}

function isAcceptedVulnerability(name, vulnerabilities, visiting = new Set()) {
  const vulnerability = vulnerabilities?.[name];
  if (!vulnerability || !BLOCKING_SEVERITIES.has(String(vulnerability.severity || '').toLowerCase())) {
    return true;
  }

  if (visiting.has(name)) {
    return true;
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(name);

  const urls = advisoryUrls(vulnerability);
  if (urls.some((url) => !ACCEPTED_ADVISORY_URLS.has(url))) {
    return false;
  }

  const dependencies = dependencyNames(vulnerability);
  if (!urls.length && !dependencies.length) {
    return false;
  }

  return dependencies.every((dependencyName) =>
    isAcceptedVulnerability(dependencyName, vulnerabilities, nextVisiting)
  );
}

function collectRootAcceptedAdvisories(vulnerabilities) {
  const accepted = [];
  for (const [name, vulnerability] of Object.entries(vulnerabilities || {})) {
    for (const url of advisoryUrls(vulnerability)) {
      if (ACCEPTED_ADVISORY_URLS.has(url)) {
        accepted.push({ name, severity: vulnerability.severity, url });
      }
    }
  }
  return accepted;
}

if (Date.now() >= ACCEPTANCE_EXPIRES_AT) {
  fail('temporary risk acceptance expired on 2026-09-15; review upstream fixes before renewing');
}

for (const [packageName, expectedVersion] of EXPECTED_VULNERABLE_VERSIONS) {
  const installedVersion = readInstalledVersion(packageName);
  if (installedVersion !== expectedVersion) {
    fail(
      `${packageName} changed from reviewed version ${expectedVersion} to ${installedVersion || 'missing'}; ` +
      'remove or re-review the temporary exception'
    );
  }
}

const audit = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  ['audit', '--omit=dev', '--json'],
  { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 }
);

if (audit.error) {
  fail(`npm audit could not run: ${audit.error.message}`);
}

let report;
try {
  report = JSON.parse(audit.stdout || '{}');
} catch (error) {
  if (audit.stderr) console.error(audit.stderr);
  fail(`npm audit did not return valid JSON: ${error.message}`);
}

const vulnerabilities = report?.vulnerabilities || {};
const blockingNames = Object.entries(vulnerabilities)
  .filter(([, vulnerability]) => BLOCKING_SEVERITIES.has(String(vulnerability?.severity || '').toLowerCase()))
  .map(([name]) => name);

if (!blockingNames.length) {
  console.log('ok - no high/critical production dependency vulnerabilities');
  process.exit(0);
}

const unexpected = blockingNames.filter(
  (name) => !isAcceptedVulnerability(name, vulnerabilities)
);

if (unexpected.length) {
  console.error('Unaccepted high/critical dependency vulnerabilities:');
  for (const name of unexpected) {
    const vulnerability = vulnerabilities[name];
    console.error(`- ${name}: severity=${vulnerability?.severity || 'unknown'} via=${JSON.stringify(vulnerability?.via || [])}`);
  }
  process.exit(1);
}

const acceptedAdvisories = collectRootAcceptedAdvisories(vulnerabilities);
const observedAcceptedUrls = new Set(acceptedAdvisories.map((entry) => entry.url));
for (const expectedUrl of ACCEPTED_ADVISORY_URLS) {
  if (!observedAcceptedUrls.has(expectedUrl)) {
    fail(
      `expected temporary advisory ${expectedUrl} is no longer present; ` +
      'remove or re-review the exception instead of carrying stale policy'
    );
  }
}

console.warn('TEMPORARY RISK ACCEPTANCE — Mobile production dependency audit');
console.warn('Expires: 2026-09-15T00:00:00Z');
for (const entry of acceptedAdvisories) {
  console.warn(`- ${entry.name} [${entry.severity}]: ${entry.url}`);
}
console.warn(
  'All high/critical findings resolve exclusively to the reviewed Nano ID and image-size advisories. ' +
  'Any new advisory, package version drift, or expiration fails this job.'
);
