const fs = jest.requireActual('fs') as {
  readFileSync: (filePath: string, encoding: string) => string;
};

const source = fs.readFileSync('src/components/operational-menu-drawer.tsx', 'utf8');

describe('operational menu drawer responsiveness contract', () => {
  it('keeps the visual transition on the native driver and removes the JS close delay', () => {
    expect(source).toContain('useNativeDriver: true');
    expect(source).toContain('const DRAWER_OPEN_MS = DesignSystem.motion.fast;');
    expect(source).toContain('const DRAWER_CLOSE_MS = 120;');
    expect(source).toContain('requestAnimationFrame(() => {');
    expect(source).not.toContain('setTimeout(');
  });

  it('does not subscribe the drawer to full high-frequency operational payloads', () => {
    expect(source).toContain('mapVehicleCount: state.mapData?.vehicles.length ?? 0');
    expect(source).toContain('conversationCount: state.conversations.length');
    expect(source).toContain('userCount: state.users.length');
    expect(source).not.toContain('mapData: state.mapData,');
    expect(source).not.toContain('conversations: state.conversations,');
    expect(source).not.toContain('users: state.users,');
  });

  it('prewarms heavy drawer content after interactions and reuses it across openings', () => {
    expect(source).toContain('const [hasOpened, setHasOpened] = useState(visible);');
    expect(source).toContain('const canRender = hasOpened || visible;');
    expect(source).toContain('InteractionManager.runAfterInteractions');
    expect(source).toContain("pointerEvents={visible ? 'auto' : 'none'}");
    expect(source).not.toContain('setShouldRender(false)');
  });

  it('uses Android hardware compositing only while the drawer is visible', () => {
    expect(source).toContain('renderToHardwareTextureAndroid={visible}');
    expect(source).toContain('shouldRasterizeIOS={visible}');
  });
});
