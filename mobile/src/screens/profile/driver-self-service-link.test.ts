import fs from 'node:fs';
import path from 'node:path';

const profileSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'profile-screen.tsx'),
  'utf8'
);
const routeRegistrySource = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'navigation', 'route-registry.ts'),
  'utf8'
);

describe('driver profile self-service entrypoints', () => {
  it('keeps Mis documentos reachable only from the driver profile', () => {
    expect(profileSource).toContain("const isDriver = user.role === 'driver'");
    expect(profileSource).toContain("router.push('/mis-documentos')");
    expect(profileSource).toContain('Mis documentos');
    expect(routeRegistrySource).toContain("export const DRIVER_DOCUMENT_ALLOWED_ROLES: Role[] = ['driver']");
    expect(routeRegistrySource).toContain("'/mis-documentos'");
  });
});
