# RC-MOBILE-AUDIT-M0

## Objetivo

Cerrar la infraestructura de pruebas Mobile antes de modificar GPS, Radio, Startup/Auth o Push.

## Base

- Base congelada: `main@1d30cb95391a8557bd21684d03d6c7f561cd71f4`
- Rama de validacion: `audit/mobile-m0-test-infrastructure-20260806`
- Admin #56: fuera de alcance
- Startup/Auth #55: fuera de alcance
- Merge: NO

## Cambios

1. Jest deja de depender de una lista manual de archivos en `package.json`.
2. La politica de descubrimiento vive en `mobile/test/unit-test-policy.cjs` y es consumida por Jest y por el inventario.
3. `npm test` ejecuta el test punto-a-punto existente, valida inventario y despues ejecuta todas las pruebas unitarias descubiertas.
4. Se agrega `makeOperationalUnitSnapshot` como factory canonica y tipada para fixtures Mobile.
5. Tracking y Checklist dejan de reconstruir manualmente `OperationalUnitSnapshot`.
6. Se agrega una prueba de la factory; su inclusion automatica valida que una prueba nueva no necesita editar `package.json`.

## Invariantes

- Una sola politica de roots/extensiones de pruebas.
- Ninguna lista manual de suites en `npm test`.
- `snapshotVersion` se obtiene de la factory canonica.
- `journey` y campos anidados obligatorios no se omiten por accidente.
- E2E permanece separado de Jest unitario.

## Gate M0

- `mobile npm run test:inventory`
- `mobile npm run typecheck`
- `mobile npm run lint`
- `mobile npm test`
- CI completa del repositorio

## Estado

- `M0_IMPLEMENTED`
- `M0_CI_PENDING`
- `M1_LOCKED`
- `MERGE=NO`
