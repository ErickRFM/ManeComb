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

  it('uses IME insets through the keyboard controller and supports orientation changes on Android', () => {
    const manifest = fs.readFileSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8');
    const app = fs.readFileSync(path.join(mobileRoot, 'App.tsx'), 'utf8');
    expect(manifest).toContain('android:windowSoftInputMode="adjustResize"');
    expect(manifest).not.toContain('android:screenOrientation="portrait"');
    expect(app).toContain("import { KeyboardProvider } from 'react-native-keyboard-controller'");
    expect(app).toContain('<KeyboardProvider preload={false}>');
  });

  it('keeps forms and the chat composer on the shared keyboard-controller path', () => {
    const keyboardLayout = fs.readFileSync(path.join(mobileRoot, 'src', 'components', 'keyboard-safe-layout.tsx'), 'utf8');
    const chatView = fs.readFileSync(path.join(mobileRoot, 'src', 'screens', 'chat', 'components', 'chat-screen-view.tsx'), 'utf8');

    expect(keyboardLayout).toContain("from 'react-native-keyboard-controller'");
    expect(keyboardLayout).toContain('<KeyboardAwareScrollView');
    expect(keyboardLayout).toContain('mode="insets"');
    expect(keyboardLayout).not.toMatch(/from 'react-native'.*KeyboardAvoidingView/);
    expect(chatView).not.toContain("Platform.OS === 'android' ? 'height' : undefined");
    expect(chatView).toContain('<KeyboardSafeView');
  });

  it('renders the existing login illustration instead of reserving empty space', () => {
    const authScreen = fs.readFileSync(path.join(mobileRoot, 'src', 'screens', 'customer-auth-screen.tsx'), 'utf8');
    expect(fs.existsSync(path.join(mobileRoot, 'assets', 'images', 'faster.png'))).toBe(true);
    expect(authScreen).toContain("require('../../assets/images/faster.png')");
    expect(authScreen).toContain('source={fasterArtwork}');
    expect(authScreen).not.toContain("marginTop: 'auto'");
  });
});
