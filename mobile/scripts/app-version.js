#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const APP_JSON_PATH = path.resolve(__dirname, '..', 'app.json');
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function fail(message) {
  console.error(`[version] ${message}`);
  process.exit(1);
}

function readMetadata() {
  let metadata;

  try {
    metadata = JSON.parse(fs.readFileSync(APP_JSON_PATH, 'utf8'));
  } catch (error) {
    fail(`No se pudo leer mobile/app.json: ${error.message}`);
  }

  return metadata;
}

function validateMetadata(metadata) {
  if (!SEMVER_PATTERN.test(String(metadata.version ?? ''))) {
    fail('app.json.version debe usar SemVer MAYOR.MENOR.PARCHE, por ejemplo 1.1.0.');
  }

  if (!Number.isInteger(metadata.buildNumber) || metadata.buildNumber < 1) {
    fail('app.json.buildNumber debe ser un entero positivo.');
  }
}

function writeMetadata(metadata) {
  fs.writeFileSync(APP_JSON_PATH, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(`[version] ManeComb ${metadata.version} (${metadata.buildNumber})`);
}

function parseBuildNumber(value, currentBuildNumber) {
  if (value === undefined) {
    return currentBuildNumber + 1;
  }

  const buildNumber = Number(value);
  if (!Number.isInteger(buildNumber) || buildNumber <= currentBuildNumber) {
    fail(`El nuevo buildNumber debe ser entero y mayor que ${currentBuildNumber}.`);
  }

  return buildNumber;
}

function bumpVersion(version, level) {
  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    fail(`No se puede incrementar una versión inválida: ${version}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (level === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (level === 'minor') {
    minor += 1;
    patch = 0;
  } else if (level === 'patch') {
    patch += 1;
  } else {
    fail('El incremento debe ser patch, minor o major.');
  }

  return `${major}.${minor}.${patch}`;
}

const metadata = readMetadata();
validateMetadata(metadata);

const command = process.argv[2] ?? 'check';

if (command === 'check') {
  console.log(`[version] ManeComb ${metadata.version} (${metadata.buildNumber}) válido.`);
  process.exit(0);
}

if (command === 'set') {
  const nextVersion = process.argv[3];
  if (!SEMVER_PATTERN.test(String(nextVersion ?? ''))) {
    fail('Uso: npm run version:set -- 1.2.0 [buildNumber]');
  }

  metadata.version = nextVersion;
  metadata.buildNumber = parseBuildNumber(process.argv[4], metadata.buildNumber);
  writeMetadata(metadata);
  process.exit(0);
}

if (command === 'bump') {
  const level = process.argv[3] ?? 'patch';
  metadata.version = bumpVersion(metadata.version, level);
  metadata.buildNumber += 1;
  writeMetadata(metadata);
  process.exit(0);
}

fail('Comando inválido. Usa check, set o bump.');
