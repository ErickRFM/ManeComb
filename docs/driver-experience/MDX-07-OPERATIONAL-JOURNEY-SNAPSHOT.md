# MDX-07 — Jornada en snapshot operacional

## Objetivo

Hacer que Mobile, Portal y Socket.IO reciban la misma Jornada sin recalcular estados ni tiempos en clientes.

## Problema encontrado

El contrato historico `session` solo se construia cuando existia `startedAt`. Por eso una jornada `ASSIGNED` o `READY` podia existir en backend y no aparecer en el snapshot operacional.

## Decision

Se conserva `session` para compatibilidad y se agrega `journey` como proyeccion canonica.

```text
OperationalUnitSnapshot v2
├── session   contrato legado de sesion iniciada
└── journey   ciclo completo ASSIGNED/READY/RUNNING/PAUSED
```

## Contrato `journey`

| Campo | Regla |
|---|---|
| `id` | Identificador de `RouteSession` |
| `status` | `ASSIGNED`, `READY`, `RUNNING` o `PAUSED` |
| `driverId` | Conductor de la jornada |
| `vehicleId` | Unidad de la jornada |
| `routeId` | Ruta de la jornada |
| `scheduledStartAt` | Inicio programado |
| `scheduledEndAt` | Final programado |
| `confirmedAt` | Confirmacion real del conductor |
| `confirmedBy` | Actor que confirmo |
| `startedAt` | Inicio real, nulo antes de conducir |
| `pausedAt` | Ultima pausa formal |
| `resumedAt` | Ultima reanudacion |
| `elapsedSeconds` | Solo existe en `RUNNING/PAUSED` |
| `requiresDriverConfirmation` | Verdadero en `ASSIGNED` |
| `canStart` | Verdadero en `READY` |
| `isDriving` | Verdadero en `RUNNING` |
| `isPaused` | Verdadero en `PAUSED` |
| `legacyTiming` | Inconsistencia historica explicitada |

## Reglas de congruencia

- No se inventa `startedAt` para una jornada programada.
- No se calcula duracion antes de iniciar.
- La sesion activa tiene prioridad para resolver conductor y ruta.
- REST y Socket.IO usan el mismo ensamblador.
- El consumidor reemplaza el snapshot completo; no mezcla parches locales.
- `snapshotVersion` aumenta de 1 a 2.
- Estados terminales no aparecen como jornada activa.

## Tiempo real

Cada cambio de Jornada emite:

```text
route-session:updated
operational-unit:updated
```

El segundo evento contiene el snapshot completo y es la autoridad para UI.

## Compatibilidad

`session` no se elimina. Una superficie antigua puede seguir usando sesiones iniciadas mientras Mobile y Portal migran gradualmente a `journey`.

## Checks

| Check | Estado |
|---|---|
| `ASSIGNED` visible sin `startedAt` | Implementado |
| `READY` visible sin duracion falsa | Implementado |
| `RUNNING` calcula tiempo en backend | Implementado |
| Sesion terminal excluida | Implementado |
| Ruta prioriza Jornada | Implementado |
| REST y Socket comparten snapshot | Implementado |
| Prueba de proyeccion | Incluida en suite backend |
| CI completo | Pendiente del SHA final |

## Archivos

- `backend/src/domain/operational-journey-snapshot.js`
- `backend/src/services/operational-units-service.js`
- `backend/src/modules/journeys/routes.js`
- `backend/test/operational-journey-snapshot.test.js`

## Veredicto provisional

```text
MDX_07_IMPLEMENTED
FINAL_CI_PENDING
DO_NOT_MERGE
```
