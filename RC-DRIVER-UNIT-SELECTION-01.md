# RC-DRIVER-UNIT-SELECTION-01 — Selección de Unidad Disponible durante el Registro

## Dictamen final

Implementación terminada y certificada para el alcance solicitado. El registro de conductor exige ahora seleccionar una unidad existente y disponible de la empresa asociada a la Key. Ya no se crea una unidad provisional ni se permite completar una cuenta sin unidad.

## Flujo auditado

1. La aplicación valida la Key mediante `POST /driver/activation/validate`.
2. `validateDriverActivationKey` resuelve la empresa y el plan con la lógica existente.
3. `listAvailableActivationUnits` obtiene la flota existente y devuelve únicamente unidades de esa organización con estado `available` y sin `driverId`.
4. La aplicación muestra esas unidades en el campo existente **Unidad asignada**, ahora como Combo colapsable.
5. La aplicación envía exclusivamente `unit.vehicleId` a `POST /driver/activation/register`.
6. `claimSelectedUnit` vuelve a validar organización y reclama la unidad mediante `claimVehicleForDriver`.
7. El claim existente realiza una escritura condicional sobre una unidad todavía `available` y sin conductor.
8. Solo después del claim se consume la Key y se crea/actualiza el conductor.
9. Si falla el registro posterior, la lógica existente libera la unidad. Si falla el claim, la Key permanece disponible.

## Causa raíz

- El backend listaba unidades sin conductor, pero no exigía el estado `available`.
- El claim atómico comprobaba la organización y el conductor, pero no el estado disponible.
- El registro aceptaba la ausencia de `vehicleId` y creaba una unidad provisional con código y placa generados.
- El móvil presentaba las unidades como una lista vertical de radios, no como Combo.
- Cuando la validación devolvía cero unidades, el móvil permitía continuar y mostraba un mensaje que sugería asignación manual posterior.

## Código reutilizado

- Endpoints existentes `/driver/activation/validate` y `/driver/activation/register`.
- Resolución existente de Key, empresa, orden, plan y cupo.
- Consulta existente `listAvailableActivationUnits`.
- Claim atómico existente `claimVehicleForDriver`, tanto en el store embebido como en Mongo.
- Liberación compensatoria existente `releaseVehicleFromDriver`.
- Campo y pantalla existentes de registro; no se agregó pantalla, módulo, store, hook, modelo, servicio ni endpoint.

## Código eliminado

- Fallback `buildVehiclePayload`, que fabricaba una unidad durante el registro.
- Campos redundantes de `DriverActivationRegisterPayload.unit` (`code`, `vehicleCode`, `plate`, `routeId` y `capacity`).
- Lista visual tipo radio y su mensaje de asignación manual posterior.
- Registro móvil sin `vehicleId`.

## Archivos modificados

- `backend/src/services/activation-keys.js`
- `backend/src/data/store.js`
- `backend/src/data/mongo-store.js`
- `backend/test/activation-keys.test.js`
- `backend/test/driver-unit-assignment.test.js`
- `mobile/src/screens/customer-auth-screen.tsx`
- `mobile/src/types/app.ts`

## Comportamiento resultante

- Varias unidades: el Combo muestra todas las elegibles.
- Una unidad: se preselecciona la única opción disponible.
- Cero unidades: se muestra “No hay unidades disponibles para esta empresa.” y no se registra.
- Key modificada: se descarta inmediatamente la selección obtenida con la Key anterior.
- Unidad ocupada mientras el formulario está abierto: el claim rechaza el registro, conserva la Key y la aplicación actualiza el Combo.
- Otra organización: la consulta no expone la unidad y el registro la rechaza.
- Unidad inactiva, ocupada o eliminada: no aparece como disponible.

## Validaciones realizadas

- Suite completa de backend: aprobada.
- Prueba de dos registros concurrentes sobre la misma unidad: aprobada; un ganador, un rechazo y Key del perdedor intacta.
- Empresa sin unidades disponibles: aprobada; no crea usuario y no consume la Key.
- Filtro de unidad inactiva: aprobado.
- Aislamiento por organización existente: aprobado por la suite de backend.
- TypeScript móvil (`tsc --noEmit`): aprobado.
- ESLint de los archivos modificados: aprobado.
- `git diff --check`: aprobado.
- Build Android: no ejecutado, conforme a la indicación del responsable de la aplicación.

El ESLint global conserva un error preexistente y fuera de alcance en `mobile/src/screens/map/hooks/use-map-selector.ts:240` por la dependencia `hasUserMovedMapRef`. No fue modificado en esta RC.

## Riesgos remanentes

- La verificación contra Mongo está cubierta por el filtro atómico implementado y por las pruebas de contrato con el store embebido; no se ejecutó una carrera contra una instancia Mongo real en esta sesión.
- La comprobación visual final en dispositivo queda pendiente del ciclo manual del responsable de la aplicación; no se generó APK.

## Certificación

La RC cumple el flujo único solicitado: la unidad procede del Portal, se consulta después de validar la Key, se selecciona en un Combo, se revalida mediante el claim atómico existente y queda asignada dentro del mismo registro. No se introdujeron capacidades fuera del alcance ni pasos manuales alternativos.
