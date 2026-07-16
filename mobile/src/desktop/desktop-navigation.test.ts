import { getAppSections } from './desktop-navigation';

function hasControl(role: 'owner' | 'admin' | 'supervisor' | 'driver') {
  return getAppSections(role).some((section) => section.key === 'checklist');
}

describe('visibilidad RBAC de Control', () => {
  it('muestra Control a propietario, administrador y supervisor', () => {
    expect(hasControl('owner')).toBe(true);
    expect(hasControl('admin')).toBe(true);
    expect(hasControl('supervisor')).toBe(true);
  });

  it('elimina Control del menu del chofer', () => {
    expect(hasControl('driver')).toBe(false);
  });
});
