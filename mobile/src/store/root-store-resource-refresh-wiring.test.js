const fs = require('node:fs');
const path = require('node:path');

const rootStorePath = path.join(__dirname, 'root-store.ts');

function readRootStore() {
  return fs.readFileSync(rootStorePath, 'utf8');
}

describe('root-store resource refresh projection wiring', () => {
  it('delegates result projection while retaining orchestration in root-store', () => {
    const source = readRootStore();

    expect(source).toMatch(/from ['"]\.\/runtime\/resource-refresh-projection['"]/);
    expect(source).toContain('beginMobileResourceRefresh');
    expect(source).toContain('failMobileResourceRefresh');
    expect(source).toContain('projectMobileRefreshResults');
    expect(source).toContain('resources: beginMobileResourceRefresh(state.resources)');
    expect(source).toContain('resources: failMobileResourceRefresh(');
    expect(source).toContain('const projection = projectMobileRefreshResults({');
    expect(source).toContain('normalizeMapData: (value) => normalizeLiveLocationsData');
    expect(source).toContain('const data: any = projection.data;');
    expect(source).toContain('const fulfilledCount = projection.fulfilledCount;');
    expect(source).toContain('data.resources = projection.resources;');

    expect(source).not.toContain("const keys = ['mapData'");
    expect(source).not.toContain('const resourceIndex: Partial<Record<MobileResourceDomain, number>>');
    expect(source).not.toContain('resourceStates[domain] = completeResourceAttempt');
    expect(source).not.toContain('beginResourceAttempt(state.resources');
    expect(source).not.toContain('failResourceAttempt(get().resources');
  });
});
