const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('Mobile no consume superficies retiradas del backend', () => {
  it('no llama /api/ops: el router responde 410 a todo', () => {
    // backend/src/modules/ops/routes.js monta un unico `router.use` que devuelve
    // 410 platform_authority_required. Mobile pedia /ops/observability en cada
    // refreshAll de un admin; Promise.allSettled se tragaba el rechazo y el
    // panel quedaba permanentemente vacio, escondiendo el 410 tras un estado
    // vacio. La observabilidad vive en la autoridad de plataforma.
    const client = source('src/api/client.ts');

    expect(client).not.toContain('/ops/');
    expect(client).not.toContain('ObservabilityRequest');
  });

  it('no conserva estado ni cache de una superficie que no puede poblarse', () => {
    const store = source('src/store/root-store.ts');
    const cache = source('src/api/offline-cache.ts');
    const profile = source('src/screens/profile-screen.tsx');

    expect(store).not.toContain('observability');
    expect(cache).not.toContain('observability');
    expect(profile).not.toContain('observability');
  });
});
