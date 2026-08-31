'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createReleaseManifest,
  verifyReleaseManifest,
  writeManifest
} = require('./release-manifest');

function main() {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'manecomb-release-'));
  try {
    const artifactPath = path.join(temporaryDirectory, 'manecomb-1.3.0-build.22.apk');
    const manifestPath = path.join(temporaryDirectory, 'release-manifest.json');
    const checksumPath = path.join(temporaryDirectory, 'app-release.sha256');
    fs.writeFileSync(artifactPath, 'signed-apk-fixture');

    const metadata = { version: '1.3.0', buildNumber: 22 };
    const sourceCommit = 'a'.repeat(40);
    const publicUrl =
      'https://github.com/ErickRFM/ManeComb/releases/download/v1.3.0-build.22/manecomb-1.3.0-build.22.apk';
    const manifest = createReleaseManifest({
      metadata,
      artifactPath,
      sourceCommit,
      publicUrl,
      releaseDate: '2026-08-30',
      releaseNotes: ['Cierre de estabilidad y seguridad.'],
      mandatory: true
    });

    assert.equal(manifest.version, '1.3.0');
    assert.equal(manifest.buildNumber, 22);
    assert.equal(manifest.sourceCommit, sourceCommit);
    assert.equal(manifest.sizeBytes, 18);
    assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(manifest.backendPatch, {
      name: 'ManeComb',
      version: '1.3.0',
      buildNumber: 22,
      sourceCommit,
      sha256: manifest.sha256,
      status: 'disponible',
      apkUrl: publicUrl,
      androidMin: '8.0',
      size: '0.0 MB',
      releaseDate: '2026-08-30',
      releaseNotes: ['Cierre de estabilidad y seguridad.'],
      mandatory: true
    });
    assert.equal(verifyReleaseManifest({ manifest, artifactPath, metadata, sourceCommit }), true);

    writeManifest(manifest, manifestPath, checksumPath);
    assert.deepEqual(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), manifest);
    assert.equal(
      fs.readFileSync(checksumPath, 'utf8'),
      `${manifest.sha256}  manecomb-1.3.0-build.22.apk\n`
    );

    fs.appendFileSync(artifactPath, '-tampered');
    assert.throws(
      () => verifyReleaseManifest({ manifest, artifactPath, metadata, sourceCommit }),
      /sizeBytes|sha256/
    );
    assert.throws(
      () => createReleaseManifest({
        metadata,
        artifactPath,
        sourceCommit,
        publicUrl: 'http://example.test/app.apk',
        releaseDate: '2026-02-31'
      }),
      /publicUrl|releaseDate/
    );
    assert.throws(
      () => createReleaseManifest({
        metadata,
        artifactPath,
        sourceCommit,
        publicUrl,
        releaseDate: '2026-08-30',
        releaseNotes: [42]
      }),
      /releaseNotes/
    );
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  console.log('ok - release manifest binds version, build, commit, artifact, digest and public URL');
}

if (typeof test === 'function') {
  test('release manifest binds version, build, commit, artifact, digest and public URL', main);
} else {
  main();
}
