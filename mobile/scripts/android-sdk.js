const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const MIN_NODE_VERSION = [20, 19, 4];

function parseNodeVersion(versionText) {
  const match = String(versionText).match(/v?(\d+)\.(\d+)\.(\d+)/);

  if (!match) {
    return null;
  }

  return match.slice(1).map((value) => Number(value));
}

function isVersionAtLeast(version, minimum) {
  if (!version) {
    return false;
  }

  for (let index = 0; index < minimum.length; index += 1) {
    if (version[index] > minimum[index]) {
      return true;
    }

    if (version[index] < minimum[index]) {
      return false;
    }
  }

  return true;
}

function getNodeCandidates() {
  return Array.from(
    new Set(
      [
        process.env.NODE_BINARY,
        process.execPath,
        'C:\\Program Files\\nodejs\\node.exe',
      ].filter(Boolean)
    )
  );
}

function getNodeVersion(candidate) {
  if (!candidate || !fs.existsSync(candidate)) {
    return null;
  }

  const result = spawnSync(candidate, ['--version'], {
    encoding: 'utf8',
    shell: false,
  });

  if (result.status !== 0) {
    return null;
  }

  return parseNodeVersion(result.stdout || result.stderr);
}

function resolveNodeExecutable() {
  const candidates = getNodeCandidates();
  const compatibleNode = candidates.find((candidate) =>
    isVersionAtLeast(getNodeVersion(candidate), MIN_NODE_VERSION)
  );

  return compatibleNode || candidates.find((candidate) => fs.existsSync(candidate)) || process.execPath;
}

function getLocalGradleJdkCandidates() {
  const jdksDir = path.join(projectRoot, '.gradle-local', 'jdks');

  if (!fs.existsSync(jdksDir)) {
    return [];
  }

  return fs
    .readdirSync(jdksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(jdksDir, entry.name));
}

function getJavaHomeCandidates() {
  return Array.from(
    new Set(
      [
        process.env.JAVA_HOME,
        ...getLocalGradleJdkCandidates(),
        'C:\\Program Files\\Android\\Android Studio\\jbr',
        'C:\\Program Files\\Android\\Android Studio\\jre',
        'C:\\Program Files\\Java\\jdk-21',
        'C:\\Program Files\\Java\\jdk-17',
        'C:\\Program Files\\Microsoft\\jdk-17.0.0.8-hotspot',
      ].filter(Boolean)
    )
  );
}

function getAndroidSdkCandidates() {
  return Array.from(
    new Set(
      [
        process.env.ANDROID_SDK_ROOT,
        process.env.ANDROID_HOME,
        process.env.LOCALAPPDATA
          ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
          : null,
        path.join(projectRoot, '.android-sdk'),
        'C:\\Android\\Sdk',
        'C:\\Users\\Public\\Android\\Sdk',
      ].filter(Boolean)
    )
  );
}

function isValidAndroidSdkRoot(candidate) {
  if (!candidate) {
    return false;
  }

  return (
    fs.existsSync(path.join(candidate, 'platform-tools', 'adb.exe')) ||
    fs.existsSync(path.join(candidate, 'platform-tools', 'adb'))
  );
}

function resolveAndroidSdkRoot() {
  return getAndroidSdkCandidates().find(isValidAndroidSdkRoot) || null;
}

function isValidJavaHome(candidate) {
  if (!candidate) {
    return false;
  }

  return (
    fs.existsSync(path.join(candidate, 'bin', 'java.exe')) ||
    fs.existsSync(path.join(candidate, 'bin', 'java'))
  );
}

function resolveJavaHome() {
  return getJavaHomeCandidates().find(isValidJavaHome) || null;
}

function withAndroidSdkEnv(baseEnv = process.env) {
  const sdkRoot = resolveAndroidSdkRoot();
  const javaHome = resolveJavaHome();
  const nodeExecutable = resolveNodeExecutable();
  const nodeBinDir = path.dirname(nodeExecutable);
  const gradleUserHome =
    baseEnv.GRADLE_USER_HOME || path.resolve(__dirname, '..', '.gradle-local');

  // Check for long paths on Windows (Max 260 chars)
  if (process.platform === 'win32') {
    const projectPath = path.resolve(projectRoot, '..');
    if (projectPath.length > 80) {
      console.warn('\n[!] ADVERTENCIA: La ruta del proyecto es muy larga (' + projectPath.length + ' caracteres).');
      console.warn('    Esto causa errores en compilaciones de C++ (Ninja/CMake).');
      console.warn('    RECOMENDACION: Mueve el proyecto a C:\\combis-app\n');
    }
  }

  if (!sdkRoot) {
    const candidates = getAndroidSdkCandidates()
      .map((candidate) => `- ${candidate}`)
      .join('\n');

    throw new Error(
      `No se encontro Android SDK para Detox.\nDefine ANDROID_SDK_ROOT o instala el SDK en una ruta comun.\nBuscado en:\n${candidates || '- (sin rutas candidatas disponibles)'}`
    );
  }

  if (!javaHome) {
    const candidates = getJavaHomeCandidates()
      .map((candidate) => `- ${candidate}`)
      .join('\n');

    throw new Error(
      `No se encontro JAVA_HOME para Android/Gradle.\nDefine JAVA_HOME o instala JBR/JDK en una ruta comun.\nBuscado en:\n${candidates || '- (sin rutas candidatas disponibles)'}`
    );
  }

  const extraPaths = [
    nodeBinDir,
    path.join(javaHome, 'bin'),
    path.join(sdkRoot, 'platform-tools'),
    path.join(sdkRoot, 'emulator'),
  ].filter((candidate) => fs.existsSync(candidate));
  const nextEnv = {
    ...baseEnv,
    JAVA_HOME: javaHome,
    ANDROID_HOME: sdkRoot,
    ANDROID_SDK_ROOT: sdkRoot,
    NODE_BINARY: nodeExecutable,
    GRADLE_USER_HOME: gradleUserHome,
    PATH: [...extraPaths, baseEnv.PATH || ''].filter(Boolean).join(path.delimiter),
  };

  return {
    sdkRoot,
    javaHome,
    gradleUserHome,
    env: nextEnv,
  };
}

module.exports = {
  getAndroidSdkCandidates,
  getJavaHomeCandidates,
  resolveAndroidSdkRoot,
  resolveJavaHome,
  resolveNodeExecutable,
  withAndroidSdkEnv,
};
