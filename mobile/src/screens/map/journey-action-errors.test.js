import fs from 'node:fs';
import path from 'node:path';

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
}

describe('journey action error surfacing', () => {
  // MapScreen no se puede renderizar bajo Jest sin una capa de mocks de Mapbox y
  // permisos nativos que el repositorio no tiene, asi que el invariante se fija
  // sobre el fuente, igual que en background-location-authority.
  const map = source('../map-screen.native.tsx');

  function journeyHandler() {
    const from = map.indexOf('const handleJourneyAction = async () => {');
    const to = map.indexOf('const handleConfirmJourney', from);
    expect(from).toBeGreaterThanOrEqual(0);
    expect(to).toBeGreaterThan(from);
    return map.slice(from, to);
  }

  it('no descarta la causa que backend ya explico', () => {
    // Backend distingue 403 "Solo el chofer asignado puede iniciar la jornada",
    // 409 "La unidad no tiene chofer asignado" y 409 por transicion invalida.
    // Un catch sin binding convierte las tres en el mismo fallo indistinguible.
    const handler = journeyHandler();

    expect(handler).toMatch(/catch \(\w+\)/);
    expect(handler).not.toContain('} catch {');
  });

  it('usa la autoridad de copy de error ya existente', () => {
    const handler = journeyHandler();

    expect(handler).toMatch(/getApiErrorMessage\(\w+,/);
    expect(map).toContain("import { getApiErrorMessage } from '@/src/api/client'");
  });

  it('conserva un texto de respaldo cuando el error no trae mensaje', () => {
    expect(journeyHandler()).toContain("'No fue posible actualizar la jornada.'");
  });
});
