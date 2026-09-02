#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawnSync } = require('node:child_process');

const defaultRepositoryRoot = path.resolve(__dirname, '..', '..');

function gitOutput(args, repositoryRoot = defaultRepositoryRoot) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false
  });

  if (result.status !== 0) {
    throw new Error(`[worktree] git ${args.join(' ')} fallo.`);
  }

  return String(result.stdout || '');
}

function trackedWorktreeStatus(repositoryRoot = defaultRepositoryRoot) {
  return gitOutput(
    ['status', '--porcelain=v1', '--untracked-files=no'],
    repositoryRoot
  )
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function assertCleanTrackedWorktree({
  repositoryRoot = defaultRepositoryRoot,
  errorPrefix = '[worktree]'
} = {}) {
  const statusLines = trackedWorktreeStatus(repositoryRoot);
  if (!statusLines.length) return true;

  throw new Error(
    `${errorPrefix} El arbol de trabajo tiene cambios rastreados; ` +
      'el artefacto no tendria procedencia exacta.\n' +
      `${errorPrefix} Estado y ruta (sin contenido):\n` +
      statusLines.map((line) => `${errorPrefix} ${line}`).join('\n')
  );
}

function parseCliArguments(values) {
  let label = 'checkpoint';
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] !== '--label' || !values[index + 1]) {
      throw new Error('[worktree] Uso: tracked-worktree-status.js [--label texto]');
    }
    label = values[index + 1];
    index += 1;
  }
  return { label };
}

function runCli() {
  const { label } = parseCliArguments(process.argv.slice(2));
  const statusLines = trackedWorktreeStatus();

  console.log(`::group::Tracked worktree - ${label}`);
  try {
    if (!statusLines.length) {
      console.log('[worktree] clean');
      return;
    }

    console.error('[worktree] Estado y ruta (sin contenido):');
    for (const line of statusLines) console.error(`[worktree] ${line}`);
    process.exitCode = 1;
  } finally {
    console.log('::endgroup::');
  }
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
  assertCleanTrackedWorktree,
  gitOutput,
  trackedWorktreeStatus
};
