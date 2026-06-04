const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = process.env.MANECOMB_RNCLI_SHORT_LINK
  ? path.join(process.env.MANECOMB_RNCLI_SHORT_LINK, 'apps', 'mobile-rn-cli')
  : path.resolve(__dirname, '..');
const androidDir = path.join(projectRoot, 'android');
const task = process.argv[2] || 'assembleDebug';
const extraArgs = process.argv.slice(3);
const nodeSymlinkOptions = '--preserve-symlinks --preserve-symlinks-main';

function withNodeOptions(env) {
  const currentOptions = env.NODE_OPTIONS || '';
  const options = nodeSymlinkOptions
    .split(' ')
    .filter((option) => !currentOptions.includes(option));

  return {
    ...env,
    NODE_OPTIONS: [currentOptions, ...options].filter(Boolean).join(' '),
  };
}

function samePath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function removeOwnedJunction(linkRoot, targetRoot) {
  if (!fs.existsSync(linkRoot)) {
    return;
  }

  const actualTarget = fs.realpathSync(linkRoot);
  if (!samePath(actualTarget, targetRoot)) {
    throw new Error(`[android] La ruta corta ya existe y no apunta a ManeComb: ${linkRoot}`);
  }

  try {
    fs.rmdirSync(linkRoot);
  } catch (error) {
    throw new Error(`[android] No se pudo remover la union temporal: ${linkRoot}`);
  }
}

function runFromShortWindowsPathIfNeeded() {
  const repoRoot = path.resolve(projectRoot, '..', '..');
  const shouldUseShortLink =
    process.platform === 'win32' &&
    process.env.MANECOMB_RNCLI_USE_SHORT_LINK === '1' &&
    !process.env.MANECOMB_RNCLI_SHORT_LINK &&
    projectRoot.length > 40;

  if (!shouldUseShortLink) {
    return;
  }

  const linkRoot = process.env.MANECOMB_RNCLI_LINK_ROOT || 'C:\\mcrn';
  const linkProjectRoot = path.join(linkRoot, 'apps', 'mobile-rn-cli');
  const linkScript = path.join(linkProjectRoot, 'scripts', 'run-android-gradle.js');

  console.log(`[android] Ruta larga detectada (${projectRoot.length} caracteres).`);
  console.log(`[android] Usando union temporal ${linkRoot} para evitar limites de CMake/Ninja.`);

  try {
    removeOwnedJunction(linkRoot, repoRoot);
  } catch (error) {
    console.warn(error.message);
    console.warn('[android] Continuando en la ruta actual.');
    return;
  }

  const mount = spawnSync('cmd.exe', ['/d', '/s', '/c', `mklink /J "${linkRoot}" "${repoRoot}"`], {
    shell: false,
    stdio: 'inherit',
  });

  if (mount.status !== 0) {
    console.warn('[android] No se pudo crear la union temporal; continuando en la ruta actual.');
    return;
  }

  const child = spawnSync(process.execPath, [linkScript, task, ...extraArgs], {
    cwd: linkProjectRoot,
    env: withNodeOptions({
      ...process.env,
      MANECOMB_RNCLI_SHORT_LINK: linkRoot,
      MANECOMB_RNCLI_REAL_PROJECT_ROOT: projectRoot,
    }),
    shell: false,
    stdio: 'inherit',
  });

  removeOwnedJunction(linkRoot, repoRoot);

  process.exit(child.status || 0);
}

function findAndroidSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : null,
    path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'platform-tools')));
}

function findJavaHome() {
  const repoRoot = path.resolve(projectRoot, '..', '..');
  const localJdksDir = path.join(repoRoot, 'mobile', '.gradle-local', 'jdks');
  const candidates = [
    fs.existsSync(localJdksDir)
      ? fs
          .readdirSync(localJdksDir)
          .map((entry) => path.join(localJdksDir, entry))
          .find((entry) => fs.existsSync(path.join(entry, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')))
      : null,
    process.env.JAVA_HOME,
  ].filter(Boolean);

  return candidates[0] || null;
}

function removeInsideAndroidDir(targetPath) {
  const resolvedAndroidDir = path.resolve(androidDir);
  const resolvedTarget = path.resolve(targetPath);

  if (
    resolvedTarget !== resolvedAndroidDir &&
    !resolvedTarget.startsWith(`${resolvedAndroidDir}${path.sep}`)
  ) {
    throw new Error(`[android] Ruta fuera de android/: ${resolvedTarget}`);
  }

  if (fs.existsSync(resolvedTarget)) {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
    console.log(`[android] Cache nativa removida: ${resolvedTarget}`);
  }
}

runFromShortWindowsPathIfNeeded();

const sdkRoot = findAndroidSdk();
const javaHome = findJavaHome();

if (!sdkRoot) {
  console.error('[android] No se encontró Android SDK. Define ANDROID_HOME o ANDROID_SDK_ROOT.');
  process.exit(2);
}

const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
const env = {
  ...process.env,
  ANDROID_HOME: sdkRoot,
  ANDROID_SDK_ROOT: sdkRoot,
  ...(javaHome ? { JAVA_HOME: javaHome, PATH: `${path.join(javaHome, 'bin')}${path.delimiter}${process.env.PATH || ''}` } : {}),
};
const gradleEnv = withNodeOptions(env);

console.log(`[android] SDK: ${sdkRoot}`);
if (javaHome) {
  console.log(`[android] JAVA_HOME: ${javaHome}`);
}
console.log(`[android] Task: ${task}`);

removeInsideAndroidDir(path.join(androidDir, 'app', '.cxx'));

const result = spawnSync(gradlew, [task, '--no-daemon', ...extraArgs], {
  cwd: androidDir,
  env: gradleEnv,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

process.exit(result.status || 0);
