import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ACCEPTANCE_EXPIRES_AT = Date.parse('2026-09-15T00:00:00Z');
const JS_YAML_ACCEPTANCE_EXPIRES_AT = Date.parse('2026-09-10T00:00:00Z');
const JS_YAML_ADVISORY_URL = 'https://github.com/advisories/GHSA-2883-xcg3-v3hh';
const EXPECTED_VULNERABLE_VERSIONS = new Map([
  ['image-size', '1.2.1'],
  ['js-yaml', '4.3.1'],
]);
const ACCEPTED_ADVISORY_URLS = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
  JS_YAML_ADVISORY_URL,
]);
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);

function fail(message) {
  console.error(`mobile dependency audit: ${message}`);
  process.exit(1);
}

function readLockfile() {
  return JSON.parse(readFileSync('package-lock.json', 'utf8'));
}

function readInstalledVersion(packageName) {
  const lock = readLockfile();
  return lock?.packages?.[`node_modules/${packageName}`]?.version || null;
}

function assertReviewedJsYamlPlacement() {
  const lock = readLockfile();
  const entries = Object.entries(lock?.packages || {})
    .filter(([path]) => path === 'node_modules/js-yaml' || path.endsWith('/node_modules/js-yaml'));

  if (!entries.length) {
    fail('js-yaml temporary review is stale because no installed js-yaml nodes remain');
  }

  const expectedVersions = new Set(['3.15.1', '4.3.1']);
  for (const [path, entry] of entries) {
    if (!expectedVersions.has(entry?.version)) {
      fail(
        `js-yaml node ${path} changed to ${entry?.version || 'missing'}; ` +
        'remove or re-review the temporary exception'
      );
    }
    if (entry?.dev !== true && entry?.devOptional !== true) {
      fail(
        `js-yaml node ${path} is no longer marked dev/devOptional; ` +
        'the short-lived non-runtime review no longer applies'
      );
    }
  }
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

if (Date.now() >= JS_YAML_ACCEPTANCE_EXPIRES_AT) {
  fail(
    'temporary js-yaml review expired on 2026-09-10; update the lockfile to js-yaml 4.3.2/3.15.2 instead of renewing'
  );
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

assertReviewedJsYamlPlacement();

const auditInvocation = process.platform === 'win32'
  ? {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd audit --omit=dev --json'],
    }
  : {
      command: 'npm',
      args: ['audit', '--omit=dev', '--json'],
    };

const audit = spawnSync(auditInvocation.command, auditInvocation.args, {
  cwd: process.cwd(),
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});

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
console.warn('General acceptance expires: 2026-09-15T00:00:00Z');
console.warn('js-yaml acceptance expires earlier: 2026-09-10T00:00:00Z');
for (const entry of acceptedAdvisories) {
  console.warn(`- ${entry.name} [${entry.severity}]: ${entry.url}`);
}
console.warn(
  'All high/critical findings resolve exclusively to explicitly reviewed temporary advisories. ' +
  'js-yaml remains merge-only accepted for the reviewed dev/devOptional lock placement and must be upgraded to 4.3.2/3.15.2 before 2026-09-10. ' +
  'Any new advisory, package version/placement drift, or expiration fails this job.'
);
