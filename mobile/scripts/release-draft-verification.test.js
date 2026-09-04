'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  inspectDraftRelease,
  verifyDownloadedDraftAsset,
} = require('./release-draft-verification');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function main() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'manecomb-draft-'));
  try {
    const source = 'a'.repeat(40);
    const tag = 'v1.3.0-build.22';
    const apk = 'manecomb-1.3.0-build.22.apk';
    const aab = 'manecomb-1.3.0-build.22.aab';
    const artifactPath = path.join(temporaryDirectory, apk);
    fs.writeFileSync(artifactPath, 'signed-apk-fixture');
    const sha256 = crypto.createHash('sha256').update('signed-apk-fixture').digest('hex');
    const publicUrl = `https://github.com/ErickRFM/ManeComb/releases/download/${tag}/${apk}`;
    const manifest = {
      sourceCommit: source,
      artifactFileName: apk,
      sizeBytes: fs.statSync(artifactPath).size,
      sha256,
      publicUrl,
    };
    const release = {
      id: 381667061,
      draft: true,
      published_at: null,
      tag_name: tag,
      target_commitish: source,
      assets: [
        { id: 101, name: apk, state: 'uploaded', size: manifest.sizeBytes, digest: `sha256:${sha256}`, browser_download_url: publicUrl },
        { id: 102, name: aab, state: 'uploaded', size: 24 },
        { id: 103, name: 'release-manifest.json', state: 'uploaded', size: 512 },
        { id: 104, name: 'app-release.sha256', state: 'uploaded', size: 96 },
      ],
    };
    const common = { release, manifest, expectedTag: tag, expectedSource: source, expectedAab: aab };

    assert.deepEqual(inspectDraftRelease(common), { assetId: 101 });
    assert.deepEqual(verifyDownloadedDraftAsset({ ...common, artifactPath }), { assetId: 101 });

    for (const [label, mutate] of [
      ['public release', (value) => { value.draft = false; value.published_at = '2026-09-01T00:00:00Z'; }],
      ['wrong source', (value) => { value.target_commitish = 'b'.repeat(40); }],
      ['partial assets', (value) => { value.assets = value.assets.filter((asset) => asset.name !== aab); }],
      ['duplicate APK', (value) => { value.assets.push({ ...value.assets[0], id: 999 }); }],
      ['unexpected asset', (value) => { value.assets.push({ id: 998, name: 'unexpected.txt', state: 'uploaded', size: 1 }); }],
      ['wrong remote size', (value) => { value.assets[0].size += 1; }],
      ['wrong remote digest', (value) => { value.assets[0].digest = `sha256:${'b'.repeat(64)}`; }],
    ]) {
      const changed = clone(release);
      mutate(changed);
      assert.throws(
        () => inspectDraftRelease({ ...common, release: changed }),
        undefined,
        label
      );
    }

    fs.appendFileSync(artifactPath, '-tampered');
    assert.throws(() => verifyDownloadedDraftAsset({ ...common, artifactPath }), /tamaño|SHA-256/);

    const workflow = fs.readFileSync(
      path.join(__dirname, '../../.github/workflows/android-release-candidate.yml'),
      'utf8'
    );
    const identityIndex = workflow.indexOf('Reject an existing release identity');
    const buildIndex = workflow.indexOf('Build signed APK and AAB');
    const draftIndex = workflow.indexOf('Create private draft GitHub Release');
    const downloadIndex = workflow.indexOf('Inspect draft and download APK through authenticated API');
    const attestationIndex = workflow.indexOf('Verify downloaded APK attestation');
    const cleanupIndex = workflow.indexOf('Remove materialized secrets');
    const publishIndex = workflow.indexOf('Publish only the verified draft');
    assert(identityIndex > 0 && identityIndex < buildIndex);
    assert(draftIndex > buildIndex && draftIndex < downloadIndex);
    assert(downloadIndex < attestationIndex && attestationIndex < cleanupIndex);
    assert(cleanupIndex < publishIndex);
    const draftLookup = workflow.slice(downloadIndex, attestationIndex);
    assert.match(draftLookup, /gh release view "\$TAG" --json databaseId --jq \.databaseId/);
    assert.match(draftLookup, /test -n "\$RELEASE_ID"/);
    assert.match(draftLookup, /repos\/\$GITHUB_REPOSITORY\/releases\/\$RELEASE_ID/);
    assert.doesNotMatch(draftLookup, /releases\/tags\//);

    const releaseId = 381667061;
    const requestDraft = (endpoint) => {
      if (endpoint === `repos/ErickRFM/ManeComb/releases/tags/${tag}`) {
        const error = new Error('Not Found');
        error.status = 404;
        throw error;
      }
      if (endpoint === `repos/ErickRFM/ManeComb/releases/${releaseId}`) return release;
      throw new Error(`Unexpected endpoint: ${endpoint}`);
    };
    assert.throws(
      () => requestDraft(`repos/ErickRFM/ManeComb/releases/tags/${tag}`),
      (error) => error.status === 404
    );
    assert.deepEqual(
      inspectDraftRelease({
        ...common,
        release: requestDraft(`repos/ErickRFM/ManeComb/releases/${releaseId}`),
      }),
      { assetId: 101 }
    );
    assert.equal(workflow.slice(0, publishIndex).includes('--draft=false'), false);
    assert.match(workflow, /mandatory_update:[\s\S]*?default: false/);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log('ok - release draft stays private until remote digest and attestation verification');
}

if (typeof test === 'function') {
  test('release draft stays private until remote digest and attestation verification', main);
} else {
  main();
}
