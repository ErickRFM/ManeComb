const fs = require('fs');
const path = require('path');

const NODE_EXECUTABLE_DECLARATION =
  /^[ \t]*def\s+nodeExecutable\s*=\s*System\.getenv\('NODE_BINARY'\)/m;
const NODE_EXECUTABLE_LITERAL_FALLBACK =
  /(^[ \t]*def\s+nodeExecutable\s*=\s*System\.getenv\('NODE_BINARY'\)\s*\?:\s*)'[^'\r\n]*'/m;

function escapeForGroovy(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function hasNodeExecutableDeclaration(source) {
  return NODE_EXECUTABLE_DECLARATION.test(source);
}

function refreshLiteralNodeFallback(source, escapedNodePath) {
  return source.replace(
    NODE_EXECUTABLE_LITERAL_FALLBACK,
    `$1'${escapedNodePath}'`
  );
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

    if (
      !next.includes('commandLine("node",') &&
      !hasNodeExecutableDeclaration(next)
    ) {
      return next;
    }

    next = next.replace(
      /pluginManagement\s*\{\s*includeBuild\(([^)]*)\)\s*\}/,
      'pluginManagement {\n  includeBuild($1)\n}'
    );

    next = next.replace(
      /pluginManagement \{[ \t]*(?=def nodeExecutable =)/,
      'pluginManagement {\n  '
    );

    next = refreshLiteralNodeFallback(next, escapedNodePath);

    if (!hasNodeExecutableDeclaration(next)) {
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

    next = refreshLiteralNodeFallback(next, escapedNodePath);

    if (!hasNodeExecutableDeclaration(next)) {
      next = next.replace(
        'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()',
        `def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()\n${nodeExecLine}`
      );
    }

    return next.split('["node",').join('[nodeExecutable,');
  });
}

module.exports = {
  hasNodeExecutableDeclaration,
  patchAndroidNodePath,
};
