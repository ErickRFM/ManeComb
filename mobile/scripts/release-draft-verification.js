#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const digestPattern = /^[a-f0-9]{64}$/i;
const commitPattern = /^[a-f0-9]{40}$/i;

function fail(message) {
  throw new Error(`[release-draft] ${message}`);
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

function readJson(filePath, label) {
  const absolutePath = path.resolve(filePath || '');
  if (!filePath || !fs.existsSync(absolutePath)) fail(`No existe ${label}: ${absolutePath}`);
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function requireText(value, label) {
  const text = String(value || '').trim();
  if (!text) fail(`${label} es obligatorio.`);
  return text;
}

function inspectDraftRelease({ release, manifest, expectedTag, expectedSource, expectedAab }) {
  const tag = requireText(expectedTag, 'tag');
  const source = requireText(expectedSource, 'source').toLowerCase();
  const aab = requireText(expectedAab, 'aab');
  if (!commitPattern.test(source)) fail('source debe ser un SHA Git completo.');
  if (!release || typeof release !== 'object' || Array.isArray(release)) fail('Release JSON invalido.');
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('Manifest JSON invalido.');
  if (release.draft !== true || release.published_at) fail('El Release debe seguir privado como Draft.');
  if (release.tag_name !== tag) fail('El tag del Draft no coincide con la identidad congelada.');
  if (String(release.target_commitish || '').toLowerCase() !== source) {
    fail('El Draft no apunta al source SHA congelado.');
  }
  if (String(manifest.sourceCommit || '').toLowerCase() !== source) {
    fail('El manifiesto no apunta al source SHA congelado.');
  }
  if (!digestPattern.test(String(manifest.sha256 || ''))) fail('El manifiesto no contiene SHA-256 valido.');
  if (!Number.isInteger(manifest.sizeBytes) || manifest.sizeBytes < 1) {
    fail('El manifiesto no contiene un tamaño de APK valido.');
  }

  const requiredAssetNames = [
    manifest.artifactFileName,
    aab,
    'release-manifest.json',
    'app-release.sha256',
  ];
  if (requiredAssetNames.some((name) => !String(name || '').trim())) {
    fail('La lista de assets esperados es incompleta.');
  }
  if (new Set(requiredAssetNames).size !== requiredAssetNames.length) {
    fail('La lista de assets esperados contiene nombres duplicados.');
  }

  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (assets.length !== requiredAssetNames.length) {
    fail('El Draft debe contener exclusivamente los assets esperados.');
  }
  for (const name of requiredAssetNames) {
    const matches = assets.filter((asset) => asset?.name === name);
    if (matches.length !== 1) fail(`El Draft debe contener exactamente un asset ${name}.`);
    if (matches[0].state !== 'uploaded' || !Number.isInteger(matches[0].size) || matches[0].size < 1) {
      fail(`El asset ${name} no terminó de subirse.`);
    }
  }

  const apkAsset = assets.find((asset) => asset?.name === manifest.artifactFileName);
  if (!Number.isInteger(apkAsset?.id) || apkAsset.id < 1) fail('El APK remoto no tiene asset id valido.');
  if (apkAsset.size !== manifest.sizeBytes) fail('El tamaño del APK remoto no coincide con el manifiesto.');
  if (apkAsset.digest && apkAsset.digest !== `sha256:${String(manifest.sha256).toLowerCase()}`) {
    fail('El digest reportado por GitHub no coincide con el manifiesto.');
  }
  if (apkAsset.browser_download_url !== manifest.publicUrl) {
    fail('La URL pública prevista no coincide con el asset remoto.');
  }

  return { assetId: apkAsset.id };
}

function verifyDownloadedDraftAsset(options) {
  const inspected = inspectDraftRelease(options);
  const artifactPath = path.resolve(options.artifactPath || '');
  if (!options.artifactPath || !fs.existsSync(artifactPath)) fail(`No existe el APK descargado: ${artifactPath}`);
  if (fs.statSync(artifactPath).size !== options.manifest.sizeBytes) {
    fail('El tamaño del APK descargado no coincide con el manifiesto.');
  }
  if (sha256File(artifactPath) !== String(options.manifest.sha256).toLowerCase()) {
    fail('El SHA-256 del APK descargado no coincide con el manifiesto.');
  }
  return inspected;
}

function runCli() {
  const command = process.argv[2];
  const options = parseOptions(process.argv.slice(3));
  const common = {
    release: readJson(options['release-json'], 'release-json'),
    manifest: readJson(options.manifest, 'manifest'),
    expectedTag: options.tag,
    expectedSource: options.source,
    expectedAab: options.aab,
  };

  if (command === 'inspect') {
    process.stdout.write(String(inspectDraftRelease(common).assetId));
    return;
  }
  if (command === 'verify') {
    verifyDownloadedDraftAsset({ ...common, artifactPath: options.artifact });
    console.log('[release-draft] OK Draft privado, assets completos y APK remoto verificado.');
    return;
  }
  fail('Comando invalido. Usa inspect o verify.');
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
  inspectDraftRelease,
  sha256File,
  verifyDownloadedDraftAsset,
};
