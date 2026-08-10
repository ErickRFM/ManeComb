# RC-ACTIVATION-ROLLBACK-01

## Estado

Candidato de cierre técnico para la compensación segura del registro de conductores por activation key.

## Base

- PR padre: #68 `agent/enterprise-tenant-boundary-20260809`
- SHA base certificado: `af46bfa840e19f39605f437f870be15786d7d630`
- Rama: `agent/activation-key-rollback-20260809`

## Causa raíz

El flujo de registro realizaba, en orden:

1. reclamar una unidad disponible;
2. consumir la activation key;
3. crear o actualizar el usuario conductor;
4. sincronizar `starterFleet` en la orden comercial.

El `catch` histórico solo liberaba la unidad. Si el paso 3 fallaba, la key permanecía `used` sin un conductor válido.

La primera compensación introducida reveló un segundo borde: si el paso 3 ya había persistido el usuario y luego fallaba el paso 4, revertir key/unidad habría creado una inconsistencia peor.

## Autoridad y commit point

La persistencia exitosa del usuario (`createUser` / `updateUser`) es el commit point del registro.

Antes del commit point:
- la unidad reclamada puede liberarse;
- la key puede restaurarse de `used` a `available`;
- la compensación de key usa compare-and-set con `companyId`, `status: used` y `usedByDriverId` del mismo intento.

Después del commit point:
- no se revierte key;
- no se libera unidad;
- la sincronización de `starterFleet` es best-effort;
- una falla de esa metadata se registra como estado degradado y no invalida la cuenta creada.

## Cambios

- `backend/src/services/activation-keys.js`
  - define `userPersisted` como frontera transaccional;
  - compensa key/unidad solo antes del commit point;
  - convierte `updateStarterFleet()` en sincronización best-effort posterior al commit;
  - conserva el error original cuando falla la fase transaccional.
- `backend/src/data/store.js`
  - `updateActivationKey()` acepta filtro condicional `usedByDriverId`.
- `backend/src/data/mongo-store.js`
  - el mismo filtro se traduce al `findOneAndUpdate` de Mongo para compare-and-set real.
- `backend/test/activation-key-rollback.test.js`
  - cubre rollback antes de persistir usuario;
  - verifica limpieza de campos de uso de key;
  - verifica liberación de unidad;
  - verifica retry exitoso con la misma key;
  - cubre falla de `starterFleet` después del commit y exige que usuario, key y unidad permanezcan comprometidos.
- `backend/package.json`
  - integra la regresión al `npm test` normal.

## Invariantes

- Una key no puede ser restaurada por un intento distinto al que la consumió.
- Una falla de compensación no oculta el error original.
- Una falla de metadata comercial posterior al alta no invalida una identidad ya persistida.
- No se creó un servicio V2, endpoint paralelo ni segundo modelo de activation keys.

## Tooling temporal

Se usaron workflows de codemod de una sola ejecución para aplicar cambios quirúrgicos sobre archivos grandes. Ambos fueron eliminados después de verificar sus resultados y no forman parte del diff final.

## Pruebas targeted

- rollback tras fallo simulado de `createUser`: PASS.
- retry con la misma key restaurada: PASS.
- fallo simulado de `updateCommercialOrder` después del commit: PASS, sin rollback de usuario/key/unidad.

## Criterio de cierre

El SHA que contenga este RC se congela y solo puede declararse cerrado cuando, sobre ese mismo SHA:

- Dependency Audit = SUCCESS;
- CI completo = SUCCESS;
- Backend = SUCCESS;
- Mobile = SUCCESS;
- Ventas = SUCCESS;
- Admin Global = SUCCESS;
- Infrastructure = SUCCESS;
- Communication Service = SUCCESS;
- Android debug APK = SUCCESS con artifact y digest;
- no existan review threads pendientes.
