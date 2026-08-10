import assert from 'node:assert/strict';
import fs from 'node:fs';
import { getPortalRouteLoadScope } from '../features/portal/store/portal-load-policy.js';

assert.equal(getPortalRouteLoadScope('/portal'), 'none');
assert.equal(getPortalRouteLoadScope('/portal/rutas'), 'none');
assert.equal(getPortalRouteLoadScope('/portal/documentos'), 'none');
assert.equal(getPortalRouteLoadScope('/portal/incidencias'), 'none');
assert.equal(getPortalRouteLoadScope('/portal/app-movil'), 'none');
assert.equal(getPortalRouteLoadScope('/portal/perfil'), 'account');
assert.equal(getPortalRouteLoadScope('/portal/facturacion'), 'billing');
assert.equal(getPortalRouteLoadScope('/portal/plan'), 'overview');
assert.equal(getPortalRouteLoadScope('/portal/pagos'), 'overview');
assert.equal(getPortalRouteLoadScope('/portal/onboarding'), 'overview');

const layout = fs.readFileSync(new URL('../features/portal/components/portal-layout.tsx', import.meta.url), 'utf8');
assert.ok(layout.includes('getPortalRouteLoadScope(pathname)'));
assert.ok(!layout.includes('loadAll({ includeBilling: canManageBilling })'));
assert.ok(layout.includes("case 'billing':"));
assert.ok(layout.includes("case 'account':"));

console.log('ok - Portal carga server state por ruta y no bloquea cada pantalla con loadAll');
