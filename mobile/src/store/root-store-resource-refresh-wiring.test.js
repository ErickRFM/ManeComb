const fs = require('node:fs');
const path = require('node:path');

describe('root-store resource refresh wiring', () => {
  it('keeps orchestration in root while delegating state projection', () => {
    const source = fs.readFileSync(path.join(__dirname, 'root-store.ts'), 'utf8');

    expect(source).toMatch(/from ['"]\.\/runtime\/resource-refresh-projection['"]/);
    expect(source).toContain('resources: beginMobileResourceRefresh(state.resources)');
    expect(source).toContain('const projection = projectMobileRefreshResults({');
    expect(source).toContain('resources: failMobileResourceRefresh(');
    expect(source).not.toContain("const keys = ['mapData'");
    expect(source).not.toContain('const resourceIndex: Partial<Record<MobileResourceDomain, number>>');
    expect(source).not.toContain('beginResourceAttempt(state.resources');
    expect(source).not.toContain('failResourceAttempt(get().resources');
  });
});
