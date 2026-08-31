#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const defaultArtifactPath = path.join(projectRoot, 'dist', 'app-release.apk');
const defaultManifestPath = path.join(projectRoot, 'dist', 'release-manifest.json');
const defaultChecksumPath = path.join(projectRoot, 'dist', 'app-release.sha256');
const commitPattern = /^[a-f0-9]{40}$/i;
const digestPattern = /^[a-f0-9]{64}$/i;
const semverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  throw new Error(`[release] ${message}`);
}

function parseOptions(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const argument = values[index];
    if (!argument.startsWith('--')) fail(`Argumento no reconocido: ${argument}`);
    const key = argument.slice(2);
    const value = values[index + 1];
    if (!value || value.startsWith('--')) fail(`Falta valor para --${key}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

function readAppMetadata(metadataPath = path.join(projectRoot, 'app.json')) {
  const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  if (!semverPattern.test(String(metadata.version || ''))) {
    fail('app.json.version debe ser SemVer MAYOR.MENOR.PARCHE.');
  }
  if (!Number.isInteger(metadata.buildNumber) || metadata.buildNumber < 1) {
    fail('app.json.buildNumber debe ser un entero positivo.');
  }
  return metadata;
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function assertPublicUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('publicUrl debe ser una URL HTTPS valida.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    fail('publicUrl debe ser una URL HTTPS sin credenciales.');
  }
  return parsed.toString();
}

function assertReleaseDate(value) {
  const text = String(value || '');
  const parsed = new Date(`${text}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== text
  ) {
    fail('releaseDate debe usar una fecha real YYYY-MM-DD.');
  }
  return text;
}

function formatSize(sizeBytes) {
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function createReleaseManifest({
  metadata,
  artifactPath,
  sourceCommit,
  publicUrl,
  releaseDate,
  repository = 'ErickRFM/ManeComb'
}) {
  if (!metadata || !semverPattern.test(String(metadata.version || ''))) fail('Version invalida.');
  if (!Number.isInteger(metadata.buildNumber) || metadata.buildNumber < 1) fail('Build invalido.');
  if (!commitPattern.test(String(sourceCommit || ''))) fail('sourceCommit debe ser un SHA Git completo.');
  if (!fs.existsSync(artifactPath)) fail(`No existe el APK: ${artifactPath}`);

  const normalizedUrl = assertPublicUrl(publicUrl);
  const normalizedDate = assertReleaseDate(releaseDate);
  const sizeBytes = fs.statSync(artifactPath).size;
  const sha256 = sha256File(artifactPath);
  const artifactFileName = path.basename(artifactPath);
  const backendPatch = {
    name: 'ManeComb',
    version: metadata.version,
    buildNumber: metadata.buildNumber,
    sourceCommit: sourceCommit.toLowerCase(),
    sha256,
    status: 'disponible',
    apkUrl: normalizedUrl,
    androidMin: '8.0',
    size: formatSize(sizeBytes),
    releaseDate: normalizedDate
  };

  return {
    schemaVersion: 1,
    product: 'ManeComb Android',
    repository,
    version: metadata.version,
    buildNumber: metadata.buildNumber,
    sourceCommit: sourceCommit.toLowerCase(),
    artifactFileName,
    sha256,
    sizeBytes,
    releaseDate: normalizedDate,
    publicUrl: normalizedUrl,
    publicationAuthority: 'Platform PATCH /api/platform/system/app/info',
    backendPatch
  };
}

function verifyReleaseManifest({ manifest, artifactPath, metadata, sourceCommit }) {
  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion');
  if (manifest.version !== metadata.version) errors.push('version');
  if (manifest.buildNumber !== metadata.buildNumber) errors.push('buildNumber');
  if (!commitPattern.test(String(manifest.sourceCommit || ''))) errors.push('sourceCommit');
  if (sourceCommit && manifest.sourceCommit !== String(sourceCommit).toLowerCase()) errors.push('sourceCommit:HEAD');
  if (manifest.artifactFileName !== path.basename(artifactPath)) errors.push('artifactFileName');
  if (manifest.sizeBytes !== fs.statSync(artifactPath).size) errors.push('sizeBytes');
  if (!digestPattern.test(String(manifest.sha256 || '')) || manifest.sha256 !== sha256File(artifactPath)) {
    errors.push('sha256');
  }

  const expectedPatch = createReleaseManifest({
    metadata,
    artifactPath,
    sourceCommit: manifest.sourceCommit,
    publicUrl: manifest.publicUrl,
    releaseDate: manifest.releaseDate,
    repository: manifest.repository
  }).backendPatch;
  if (JSON.stringify(manifest.backendPatch) !== JSON.stringify(expectedPatch)) errors.push('backendPatch');
  if (errors.length) fail(`Manifiesto no verificable: ${errors.join(', ')}`);
  return true;
}

function gitOutput(args) {
  const result = spawnSync('git', args, {
    cwd: path.resolve(projectRoot, '..'),
    encoding: 'utf8',
    shell: false
  });
  if (result.status !== 0) fail(`git ${args.join(' ')} fallo.`);
  return String(result.stdout || '').trim();
}

function assertCleanTrackedWorktree() {
  const status = gitOutput(['status', '--porcelain', '--untracked-files=no']);
  if (status) fail('El arbol de trabajo tiene cambios rastreados; el artefacto no tendria procedencia exacta.');
}

function writeManifest(manifest, manifestPath, checksumPath) {
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(checksumPath, `${manifest.sha256}  ${manifest.artifactFileName}\n`, 'utf8');
}

function runCli() {
  const command = process.argv[2] || 'verify';
  const options = parseOptions(process.argv.slice(3));
  const artifactPath = path.resolve(projectRoot, options.artifact || defaultArtifactPath);
  const manifestPath = path.resolve(projectRoot, options.manifest || defaultManifestPath);
  const checksumPath = path.resolve(projectRoot, options.checksum || defaultChecksumPath);
  const metadata = readAppMetadata();
  const sourceCommit = gitOutput(['rev-parse', 'HEAD']).toLowerCase();
  assertCleanTrackedWorktree();

  if (command === 'create') {
    const manifest = createReleaseManifest({
      metadata,
      artifactPath,
      sourceCommit,
      publicUrl: options['public-url'],
      releaseDate: options['release-date'],
      repository: options.repository
    });
    writeManifest(manifest, manifestPath, checksumPath);
    console.log(`[release] Manifiesto: ${manifestPath}`);
    console.log(`[release] SHA-256: ${manifest.sha256}`);
    console.log(`[release] Backend patch: ${JSON.stringify(manifest.backendPatch)}`);
    return;
  }

  if (command === 'verify') {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    verifyReleaseManifest({ manifest, artifactPath, metadata, sourceCommit });
    console.log(`[release] OK ${manifest.version} (${manifest.buildNumber}) ${manifest.sha256}`);
    return;
  }

  fail('Comando invalido. Usa create o verify.');
}

if (require.main === module) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  assertReleaseDate,
  createReleaseManifest,
  formatSize,
  sha256File,
  verifyReleaseManifest,
  writeManifest
};
