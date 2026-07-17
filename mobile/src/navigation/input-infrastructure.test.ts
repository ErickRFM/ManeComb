const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

describe('shared input infrastructure', () => {
  const workspaceRoot = path.dirname(nodeProcess.cwd());
  const mobileRoot = path.join(workspaceRoot, 'mobile');
  const ventasRoot = path.join(workspaceRoot, 'ventas');

  it('keeps keyboard avoidance centralized', () => {
    const roots = [path.join(mobileRoot, 'src'), path.join(ventasRoot, 'src'), path.join(ventasRoot, 'screens')];
    const violations: string[] = [];

    const visit = (directory: string) => {
      fs.readdirSync(directory, { withFileTypes: true }).forEach((entry: { isDirectory: () => boolean; name: string }) => {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) return visit(file);
        if (
          !/\.tsx?$/.test(entry.name) ||
          entry.name === 'keyboard-safe-layout.tsx' ||
          entry.name === 'input-infrastructure.test.ts' ||
          entry.name.endsWith('.d.ts')
        ) return;
        if (fs.readFileSync(file, 'utf8').includes('KeyboardAvoidingView')) violations.push(file);
      });
    };

    roots.forEach(visit);
    expect(violations).toEqual([]);
  });

  it('uses one resize owner and supports orientation changes on Android', () => {
    const manifest = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    expect(manifest).not.toContain('android:screenOrientation="portrait"');
  });

  it('scopes Android height avoidance to chat without changing scroll-based forms', () => {
    const keyboardLayout = fs.readFileSync(path.join(mobileRoot, 'src', 'components', 'keyboard-safe-layout.tsx'), 'utf8');
    const chatView = fs.readFileSync(path.join(mobileRoot, 'src', 'screens', 'chat', 'components', 'chat-screen-view.tsx'), 'utf8');

    expect(keyboardLayout).toContain("behavior = Platform.OS === 'ios' ? 'padding' : undefined");
    expect(keyboardLayout).toContain('behavior={behavior}');
    expect(chatView).toContain("Platform.OS === 'android' ? 'height' : undefined");
  });

  it('renders the existing login illustration instead of reserving empty space', () => {
    const authScreen = fs.readFileSync(path.join(mobileRoot, 'src', 'screens', 'customer-auth-screen.tsx'), 'utf8');
    expect(fs.existsSync(path.join(mobileRoot, 'assets', 'images', 'faster.png'))).toBe(true);
    expect(authScreen).toContain("require('../../assets/images/faster.png')");
    expect(authScreen).toContain('source={fasterArtwork}');
    expect(authScreen).not.toContain("marginTop: 'auto'");
  });
});
