const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('Android runtime hardening', () => {
  const mobileRoot = nodeProcess.cwd();

  it('provides Mapbox native configuration before Fabric creates MapView', () => {
    const gradle = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'build.gradle'), 'utf8');
    const releaseScript = fs.readFileSync(path.join(mobileRoot, 'scripts', 'build-android-apk.js'), 'utf8');

    expect(gradle).toContain('resValue "string", "mapbox_access_token", mapboxAccessToken');
    expect(gradle).toContain("!mapboxAccessToken.startsWith('pk.')");
    expect(releaseScript).toContain("fileEnv.MAPBOX_ACCESS_TOKEN || '').startsWith('pk.')");
  });

  it('does not access credential-encrypted preferences during locked boot', () => {
    const manifest = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    const receiver = fs.readFileSync(
      path.join(mobileRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'anonymous', 'combiscontrol', 'location', 'ManeCombBootReceiver.kt'),
      'utf8'
    );

    expect(manifest).not.toContain('android:directBootAware="true"');
    expect(manifest).not.toContain('android.intent.action.LOCKED_BOOT_COMPLETED');
    expect(receiver).not.toContain('Intent.ACTION_LOCKED_BOOT_COMPLETED');
  });
});
