'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  assertCleanTrackedWorktree,
  trackedWorktreeStatus
} = require('./tracked-worktree-status');

function git(repositoryRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function main() {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manecomb-worktree-'));
  const trackedRelativePath = 'mobile/android/gradlew';
  const trackedPath = path.join(repositoryRoot, ...trackedRelativePath.split('/'));
  const secretBody = 'SECRET_MATERIAL_MUST_NOT_APPEAR';

  try {
    git(repositoryRoot, ['init', '--quiet']);
    git(repositoryRoot, ['config', 'user.name', 'ManeComb Tests']);
    git(repositoryRoot, ['config', 'user.email', 'tests@manecomb.invalid']);
    fs.mkdirSync(path.dirname(trackedPath), { recursive: true });
    fs.writeFileSync(trackedPath, 'initial\n', 'utf8');
    git(repositoryRoot, ['add', trackedRelativePath]);
    git(repositoryRoot, ['commit', '--quiet', '-m', 'fixture']);

    assert.deepEqual(trackedWorktreeStatus(repositoryRoot), []);
    assert.equal(assertCleanTrackedWorktree({ repositoryRoot }), true);

    fs.writeFileSync(path.join(repositoryRoot, 'ignored-by-status.txt'), secretBody, 'utf8');
    assert.deepEqual(trackedWorktreeStatus(repositoryRoot), []);

    fs.writeFileSync(trackedPath, secretBody, 'utf8');
    const statusLines = trackedWorktreeStatus(repositoryRoot);
    assert.deepEqual(statusLines, [' M mobile/android/gradlew']);

    let failure;
    try {
      assertCleanTrackedWorktree({ repositoryRoot, errorPrefix: '[release]' });
    } catch (error) {
      failure = error;
    }

    assert.ok(failure);
    assert.match(failure.message, /\[release\]\s+M mobile\/android\/gradlew/);
    assert.doesNotMatch(failure.message, new RegExp(secretBody));
  } finally {
    fs.rmSync(repositoryRoot, { recursive: true, force: true });
  }

  console.log('ok - tracked worktree diagnostics report status and path without file content');
}

if (typeof test === 'function') {
  test('tracked worktree diagnostics are safe and fail closed', main);
} else {
  main();
}
