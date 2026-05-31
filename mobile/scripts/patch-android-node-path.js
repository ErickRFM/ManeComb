const fs = require('fs');
const path = require('path');

function escapeForGroovy(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function updateFileIfNeeded(filePath, updater) {
  if (!fs.existsSync(filePath)) {
    console.log(`[patch] File not found: ${filePath}`);
    return false;
  }

  const original = fs.readFileSync(filePath, 'utf8');
  const next = updater(original);

  if (next === original) {
    console.log(`[patch] No changes needed for: ${filePath}`);
    return false;
  }

  fs.writeFileSync(filePath, next, 'utf8');
  console.log(`[patch] Updated: ${filePath}`);
  return true;
}

function patchAndroidNodePath(androidDir, nodePath = process.execPath) {
  const escapedNodePath = escapeForGroovy(nodePath);
  const settingsGradlePath = path.join(androidDir, 'settings.gradle');
  const appBuildGradlePath = path.join(androidDir, 'app', 'build.gradle');

  updateFileIfNeeded(settingsGradlePath, (source) => {
    let next = source;
    const nodeExecLine = `def nodeExecutable = System.getenv('NODE_BINARY') ?: '${escapedNodePath}'`;

    next = next.replace(
      /pluginManagement \{[ \t]*(?=def nodeExecutable =)/,
      'pluginManagement {\n  '
    );

    if (next.includes("def nodeExecutable = System.getenv('NODE_BINARY') ?:")) {
      next = next.replace(
        /([ \t]*def nodeExecutable = System\.getenv\('NODE_BINARY'\) \?: '.*?'\r?\n)+/g,
        `  ${nodeExecLine}\n`
      );
    } else {
      next = next.replace(
        /pluginManagement\s*\{/,
        `pluginManagement {\n  ${nodeExecLine}`
      );
    }

    return next.replaceAll('commandLine("node",', 'commandLine(nodeExecutable,');
  });

  updateFileIfNeeded(appBuildGradlePath, (source) => {
    let next = source;
    const nodeExecLine = `def nodeExecutable = System.getenv('NODE_BINARY') ?: '${escapedNodePath}'`;

    next = next.replace(
      /(\.getAbsolutePath\(\))(?=def nodeExecutable =)/,
      '$1\n'
    );

    if (next.includes("def nodeExecutable = System.getenv('NODE_BINARY') ?:")) {
      next = next.replace(
        /([ \t]*def nodeExecutable = System\.getenv\('NODE_BINARY'\) \?: '.*?'\r?\n)+/g,
        `${nodeExecLine}\n`
      );
    } else {
      next = next.replace(
        'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
        `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n${nodeExecLine}`
      );
    }

    return next.split('["node",').join('[nodeExecutable,');
  });
}

module.exports = {
  patchAndroidNodePath,
};
