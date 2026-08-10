const fs = require('fs');
const path = require('path');
const nodeProcess = require('process');

export {};

const source = fs.readFileSync(path.join(nodeProcess.cwd(), 'src', 'screens', 'users-screen.tsx'), 'utf8');

describe('Directory impact request authority', () => {
  test('driver impact ignores out-of-order responses and invalidates on close', () => {
    expect(source).toContain('const requestId = ++driverImpactRequestId.current;');
    expect(source).toContain('if (requestId !== driverImpactRequestId.current) return;');
    expect(source).toContain('driverImpactRequestId.current += 1;');
  });

  test('vehicle impact ignores out-of-order responses and invalidates on close', () => {
    expect(source).toContain('const requestId = ++vehicleImpactRequestId.current;');
    expect(source).toContain('if (requestId !== vehicleImpactRequestId.current) return;');
    expect(source).toContain('vehicleImpactRequestId.current += 1;');
  });

  test('screen teardown invalidates both pending impact requests', () => {
    expect(source).toMatch(/useEffect\(\(\) => \(\) => \{[\s\S]*driverImpactRequestId\.current \+= 1;[\s\S]*vehicleImpactRequestId\.current \+= 1;/);
  });
});
