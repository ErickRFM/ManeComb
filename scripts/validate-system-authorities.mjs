import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const authorityFile = path.join(repositoryRoot, 'docs', 'architecture', 'system-authorities.json');
const errors = [];

function fail(message) {
  errors.push(message);
}

function assertNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    fail(`${label} must be a non-empty string.`);
  }
}

function assertUnique(items, label, selector = (item) => item) {
  const seen = new Set();
  for (const item of items) {
    const value = selector(item);
    if (seen.has(value)) fail(`${label} contains duplicate value: ${value}`);
    seen.add(value);
  }
}

function assertRepositoryPath(relativePath, label) {
  assertNonEmptyString(relativePath, label);
  const resolved = path.resolve(repositoryRoot, relativePath);
  const relativeToRoot = path.relative(repositoryRoot, resolved);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    fail(`${label} escapes the repository: ${relativePath}`);
    return;
  }
  if (!fs.existsSync(resolved)) {
    fail(`${label} does not exist: ${relativePath}`);
  }
}

if (!fs.existsSync(authorityFile)) {
  throw new Error(`Authority map not found: ${authorityFile}`);
}

const document = JSON.parse(fs.readFileSync(authorityFile, 'utf8'));

if (document.schemaVersion !== 1) fail('schemaVersion must be 1.');
assertNonEmptyString(document.baseline?.branch, 'baseline.branch');
assertNonEmptyString(document.baseline?.capturedAt, 'baseline.capturedAt');
if (!/^[a-f0-9]{40}$/.test(String(document.baseline?.commit || ''))) {
  fail('baseline.commit must be a full 40-character Git SHA.');
}

if (!Array.isArray(document.products) || document.products.length === 0) {
  fail('products must contain at least one product.');
}
if (!Array.isArray(document.authorities) || document.authorities.length === 0) {
  fail('authorities must contain at least one authority.');
}
if (!Array.isArray(document.knownDivergences)) {
  fail('knownDivergences must be an array.');
}

const products = Array.isArray(document.products) ? document.products : [];
const authorities = Array.isArray(document.authorities) ? document.authorities : [];
const divergences = Array.isArray(document.knownDivergences) ? document.knownDivergences : [];

assertUnique(products, 'products', (product) => product.id);
assertUnique(authorities, 'authorities', (authority) => authority.id);
assertUnique(divergences, 'knownDivergences', (divergence) => divergence.id);

const productIds = new Set(products.map((product) => product.id));
const allowedAuthorityStatuses = new Set([
  'canonical',
  'partial',
  'transitional',
  'external-configuration-pending',
]);
const allowedSeverities = new Set(['P0', 'P1', 'P2', 'P3']);

for (const product of products) {
  assertNonEmptyString(product.id, 'product.id');
  assertNonEmptyString(product.name, `product ${product.id}.name`);
  assertNonEmptyString(product.runtime, `product ${product.id}.runtime`);
  if (!Array.isArray(product.rootPaths) || product.rootPaths.length === 0) {
    fail(`product ${product.id}.rootPaths must contain at least one path.`);
  } else {
    product.rootPaths.forEach((sourcePath, index) =>
      assertRepositoryPath(sourcePath, `product ${product.id}.rootPaths[${index}]`)
    );
  }
}

for (const authority of authorities) {
  assertNonEmptyString(authority.id, 'authority.id');
  assertNonEmptyString(authority.decision, `authority ${authority.id}.decision`);
  if (!productIds.has(authority.owner)) {
    fail(`authority ${authority.id}.owner references unknown product: ${authority.owner}`);
  }
  if (!allowedAuthorityStatuses.has(authority.status)) {
    fail(`authority ${authority.id}.status is invalid: ${authority.status}`);
  }
  if (!Number.isInteger(authority.targetPhase) || authority.targetPhase < 1 || authority.targetPhase > 10) {
    fail(`authority ${authority.id}.targetPhase must be an integer from 1 to 10.`);
  }
  if (!Array.isArray(authority.sourcePaths) || authority.sourcePaths.length === 0) {
    fail(`authority ${authority.id}.sourcePaths must contain at least one path.`);
  } else {
    authority.sourcePaths.forEach((sourcePath, index) =>
      assertRepositoryPath(sourcePath, `authority ${authority.id}.sourcePaths[${index}]`)
    );
  }
  if (!Array.isArray(authority.consumers)) {
    fail(`authority ${authority.id}.consumers must be an array.`);
  } else {
    for (const consumer of authority.consumers) {
      if (!productIds.has(consumer)) {
        fail(`authority ${authority.id}.consumers references unknown product: ${consumer}`);
      }
    }
  }
}

for (const divergence of divergences) {
  assertNonEmptyString(divergence.id, 'divergence.id');
  assertNonEmptyString(divergence.summary, `divergence ${divergence.id}.summary`);
  if (!allowedSeverities.has(divergence.severity)) {
    fail(`divergence ${divergence.id}.severity is invalid: ${divergence.severity}`);
  }
  if (!Number.isInteger(divergence.phase) || divergence.phase < 1 || divergence.phase > 10) {
    fail(`divergence ${divergence.id}.phase must be an integer from 1 to 10.`);
  }
  if (!Array.isArray(divergence.sourcePaths) || divergence.sourcePaths.length === 0) {
    fail(`divergence ${divergence.id}.sourcePaths must contain at least one path.`);
  } else {
    divergence.sourcePaths.forEach((sourcePath, index) =>
      assertRepositoryPath(sourcePath, `divergence ${divergence.id}.sourcePaths[${index}]`)
    );
  }
}

const salesPortal = products.find((product) => product.id === 'sales-portal');
if (!salesPortal?.allowedChannels?.includes('company_portal')) {
  fail('sales-portal must explicitly allow company_portal.');
}
if (salesPortal?.allowedChannels?.includes('mobile_operations')) {
  fail('sales-portal must not allow mobile_operations.');
}

const mobile = products.find((product) => product.id === 'mobile');
if (!mobile?.allowedChannels?.includes('mobile_operations')) {
  fail('mobile must explicitly allow mobile_operations.');
}
if (mobile?.allowedChannels?.includes('company_portal')) {
  fail('mobile must not own company_portal.');
}

const adminGlobal = products.find((product) => product.id === 'admin-global');
if (!adminGlobal?.allowedChannels?.includes('platform_admin')) {
  fail('admin-global must explicitly allow platform_admin.');
}

const rtcLive = authorities.find((authority) => authority.id === 'rtc-live-call');
if (!rtcLive || rtcLive.owner !== 'backend' || rtcLive.status !== 'canonical') {
  fail('rtc-live-call must be a canonical backend authority.');
}
if (!rtcLive?.sourcePaths?.includes('backend/src/modules/rtc/live-authority.js')) {
  fail('rtc-live-call must point to backend/src/modules/rtc/live-authority.js.');
}

const rtcCdr = authorities.find((authority) => authority.id === 'rtc-cdr');
if (!rtcCdr || rtcCdr.owner !== 'backend' || rtcCdr.status !== 'canonical') {
  fail('rtc-cdr must be a canonical backend authority.');
}
if (!rtcCdr?.sourcePaths?.includes('backend/src/data/repositories/session-repository.js')) {
  fail('rtc-cdr must point to the durable session repository.');
}

if (errors.length > 0) {
  console.error('System authority validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `System authority map valid: ${products.length} products, ${authorities.length} authorities, ${divergences.length} tracked divergences.`
);
