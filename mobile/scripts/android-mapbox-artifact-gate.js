const fs = require('node:fs');
const { Buffer } = require('node:buffer');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const MAPBOX_STRING_RESOURCE = 'mapbox_access_token';

function fail(message) {
  console.error(message);
  process.exit(1);
}

/**
 * Evidencia real de que el APK quedo configurado para Mapbox.
 *
 * El token llega al artifact por dos vias, ambas generadas desde el ENVFILE:
 *   - BuildConfig.MAPBOX_ACCESS_TOKEN, que react-native-config emite via
 *     dotenv.gradle y termina en classes*.dex;
 *   - los string resources, tanto el que emite dotenv.gradle como el
 *     `mapbox_access_token` declarado en app/build.gradle.
 *
 * El AndroidManifest NO participa: ni los manifests de la app
 * (main/debug/debugOptimized) ni el de @rnmapbox/maps declaran el token, asi que
 * exigirlo alli era una condicion imposible de satisfacer y hacia fallar la
 * certificacion aunque el APK estuviera bien configurado.
 *
 * Devuelve los nombres de la evidencia ausente, nunca el valor del token.
 */
function missingMapboxArtifactEvidence({ dex, resourceValue, resourceEntry }) {
  return [
    dex ? null : 'dex',
    resourceValue ? null : 'resources',
    resourceEntry ? null : `string/${MAPBOX_STRING_RESOURCE}`,
  ].filter(Boolean);
}

function validToken(value) {
  return typeof value === 'string' && value.trim().startsWith('pk.') && value.trim().length > 3;
}

function readTokenFromEnvFile(envFile) {
  const line = fs.readFileSync(envFile, 'utf8').split(/\r?\n/)
    .find((entry) => entry.startsWith('MAPBOX_ACCESS_TOKEN='));
  return line ? line.slice('MAPBOX_ACCESS_TOKEN='.length).trim() : '';
}

function prepare(envFile) {
  const token = String(process.env.MAPBOX_ACCESS_TOKEN || '').trim();
  if (!validToken(token)) fail('Mapbox CI configuration: FAIL');
  fs.writeFileSync(envFile, `MAPBOX_ACCESS_TOKEN=${token}\n`, { mode: 0o600 });
  console.log('Mapbox CI configuration: PASS');
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: null, maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) fail('Mapbox APK configuration: FAIL');
  return result.stdout;
}

function resolveAapt2() {
  const sdkRoot = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  if (!sdkRoot) fail('Mapbox APK configuration: FAIL');
  const buildTools = path.join(sdkRoot, 'build-tools');
  const versions = fs.readdirSync(buildTools, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const executable = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2';
  const found = versions.map((version) => path.join(buildTools, version, executable))
    .find((candidate) => fs.existsSync(candidate));
  if (!found) fail('Mapbox APK configuration: FAIL');
  return found;
}

function certify(apkPath, envFile) {
  const token = readTokenFromEnvFile(envFile);
  if (!validToken(token) || !fs.existsSync(apkPath)) fail('Mapbox APK configuration: FAIL');

  const entries = capture('unzip', ['-Z1', apkPath]).toString('utf8').split(/\r?\n/);
  if (!entries.includes('assets/index.android.bundle')) fail('Android standalone bundle: FAIL');
  const bundle = capture('unzip', ['-p', apkPath, 'assets/index.android.bundle']);
  if (!bundle.includes(Buffer.from('MAPBOX_ACCESS_TOKEN'))) fail('Android standalone bundle: FAIL');
  console.log('Android standalone bundle: PASS');

  const aapt2 = resolveAapt2();
  const resources = capture(aapt2, ['dump', 'resources', apkPath]);
  const tokenBytes = Buffer.from(token);
  const dexContainsToken = entries.filter((entry) => /^classes\d*\.dex$/.test(entry))
    .some((entry) => capture('unzip', ['-p', apkPath, entry]).includes(tokenBytes));

  const missing = missingMapboxArtifactEvidence({
    dex: dexContainsToken,
    resourceValue: resources.includes(tokenBytes),
    resourceEntry: resources.includes(Buffer.from(MAPBOX_STRING_RESOURCE)),
  });

  if (missing.length) {
    // Nombres de evidencia, nunca el valor del token.
    console.error(`Mapbox APK configuration missing: ${missing.join(', ')}`);
    fail('Mapbox APK configuration: FAIL');
  }
  console.log('Mapbox APK configuration: PASS');
}

if (require.main === module) {
  const [command, first, second] = process.argv.slice(2);
  if (command === 'prepare' && first) prepare(first);
  else if (command === 'certify' && first && second) certify(first, second);
  else fail('Uso: android-mapbox-artifact-gate.js prepare <env> | certify <apk> <env>');
}

module.exports = { missingMapboxArtifactEvidence };
