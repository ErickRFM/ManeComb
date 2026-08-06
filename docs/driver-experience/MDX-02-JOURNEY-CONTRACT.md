# MDX-02 — Contrato canónico de Jornada

## Base

- Rama: `agent/mdx-journey-consolidation`
- PR: `#47`
- Decisión: `ROUTE_SESSION_IS_JOURNEY_AUTHORITY`
- Estado: `CONTRACT_CLOSED_RUNTIME_PENDING`

## Decisión principal

ManeComb **no creará una colección `journeys` nueva**.

La colección existente `route_sessions` ya representa la ejecución operacional y contiene:

- `organizationId`;
- `routeId`;
- `vehicleId`;
- `driverId`;
- estado controlado;
- inicio y final;
- odómetro inicial y final;
- batería y precisión GPS;
- motivo de finalización;
- distancias, tiempos y métricas;
- checkpoints y vueltas;
- actores de asignación, inicio y final;
- dispositivo;
- procesamiento posterior;
- timestamps de creación y actualización.

Crear otra entidad provocaría doble autoridad. En producto y documentación se llamará **Jornada**; internamente `RouteSession` seguirá siendo el aggregate persistido hasta una migración futura justificada.

## Relación semántica

```text
Jornada (concepto de producto)
└── RouteSession (aggregate backend existente)
    ├── VehicleRouteAssignment
    ├── DriverUnitAssignment / driver lifecycle
    ├── RouteEvent[]
    ├── RouteSessionPosition[]
    ├── CheckpointVisit[]
    ├── Incident[]
    ├── Checklist inicial/final
    └── OperationalUnitSnapshot (read model)
```

## Estados existentes

```text
ASSIGNED
READY
RUNNING
PAUSED
FINISHED
CANCELLED
```

Estos estados cubren el núcleo de Jornada y se conservan.

## Semántica oficial

| Estado | Significado de Jornada | Actor principal |
|---|---|---|
| `ASSIGNED` | Admin hizo match conductor + unidad + ruta | Admin/dispatcher |
| `READY` | Conductor confirmó y completó prerequisitos | Conductor/sistema |
| `RUNNING` | Jornada iniciada y operación activa | Conductor |
| `PAUSED` | Pausa formal registrada | Conductor/admin |
| `FINISHED` | Conductor terminó la ejecución | Conductor/sistema |
| `CANCELLED` | Jornada anulada con motivo | Admin autorizado |

## Cierre administrativo

`FINISHED` ya significa que terminó la conducción, pero no prueba revisión administrativa. Para evitar añadir estados incompatibles al enum operativo, se propone separar el cierre administrativo:

```ts
reviewStatus:
  | 'PENDING'
  | 'IN_REVIEW'
  | 'CLARIFICATION_REQUIRED'
  | 'APPROVED'
```

Campos mínimos propuestos sobre `RouteSession`:

```ts
scheduledStartAt: Date | null
scheduledEndAt: Date | null
confirmedAt: Date | null
confirmedBy: string | null
confirmationStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED'
confirmationReason: string | null
preStartChecklistId: string | null
postShiftChecklistId: string | null
reviewStatus: 'PENDING' | 'IN_REVIEW' | 'CLARIFICATION_REQUIRED' | 'APPROVED'
reviewedAt: Date | null
reviewedBy: string | null
reviewNotes: string
closedAt: Date | null
closedBy: string | null
```

La implementación deberá comprobar primero si checklist e historial ya ofrecen identificadores equivalentes. No se duplicarán evidencias embebidas.

## Regla de estado activo

La autoridad actual considera vigentes:

```text
ASSIGNED
READY
RUNNING
PAUSED
```

Se conserva esta regla en `operational-unit-snapshot`.

Diferencias de presentación:

| Estado backend | Mobile | Portal |
|---|---|---|
| `ASSIGNED` | Jornada asignada | Pendiente de confirmación |
| `READY` | Lista para iniciar | Confirmada/lista |
| `RUNNING` | En jornada | En curso |
| `PAUSED` | Jornada pausada | Pausa activa |
| `FINISHED` + review pendiente | Finalizada | Pendiente de revisión |
| `FINISHED` + review aprobado | Cerrada | Cerrada |
| `CANCELLED` | Cancelada | Cancelada |

## Match administrativo

El match no crea otra entidad. La creación de `RouteSession` en `ASSIGNED` debe:

1. validar tenant;
2. validar conductor activo;
3. validar unidad activa y disponible;
4. validar `VehicleRouteAssignment` disponible/activa;
5. validar ausencia de sesión activa para conductor;
6. validar ausencia de sesión activa para unidad;
7. registrar `assignedBy`;
8. establecer ventana programada;
9. emitir evento/notificación;
10. aparecer en el snapshot operacional.

## Restricciones duras

### Una sola Jornada activa por unidad

Ya existe `activeKey` único para sesiones activas. Se conserva y se valida en dominio, no solamente por UI.

### Una sola Jornada activa por conductor

Debe verificarse si existe índice equivalente. Si no existe, añadir una clave activa de conductor o índice parcial seguro. No confiar únicamente en una consulta previa porque dos solicitudes concurrentes pueden pasarla.

### La ruta debe pertenecer al mismo tenant

No aceptar `routeId`, `vehicleId` o `driverId` de organizaciones distintas.

### No iniciar sin READY

La transición esperada es:

```text
ASSIGNED → READY → RUNNING
```

No debe existir inicio directo desde `ASSIGNED` salvo migración legacy explícita y auditada.

### FINISHED no vuelve a RUNNING

Una jornada terminada es inmutable operacionalmente. Las correcciones administrativas se registran aparte; no reescriben eventos ni GPS.

## Eventos

El sistema ya posee `route_events` con:

```text
SESSION_STARTED
SESSION_PAUSED
SESSION_RESUMED
SESSION_FINISHED
GPS_LOST
GPS_RECOVERED
CHECKPOINT_REACHED
OFF_ROUTE
ON_ROUTE
VEHICLE_STOPPED
VEHICLE_MOVING
```

Se conservarán. Para completar Jornada se proponen, solo si no existe un audit event equivalente:

```text
SESSION_ASSIGNED
SESSION_CONFIRMED
SESSION_REJECTED
PRESTART_CHECKLIST_COMPLETED
POSTSHIFT_CHECKLIST_COMPLETED
VEHICLE_REPLACED
ADMIN_REVIEW_STARTED
CLARIFICATION_REQUESTED
SESSION_APPROVED
SESSION_CANCELLED
```

No se añadirán eventos duplicados cuando `audit_logs` ya cubra la acción con identidad y metadata suficiente. Antes de implementar se decidirá qué eventos son operativos y cuáles administrativos.

## OperationalUnitSnapshot v2

La versión actual contiene:

- unidad;
- estado;
- GPS;
- conductor y fuente;
- ruta;
- sesión activa;
- incidencias;
- último evento;
- visibilidad.

La Jornada debe ampliar `session`, no crear otro bloque contradictorio.

Propuesta:

```ts
export type OperationalSession = {
  id: string;
  status: 'ASSIGNED' | 'READY' | 'RUNNING' | 'PAUSED';
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  startedAt: string | null;
  elapsedSeconds: number;
  confirmationStatus: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  reviewStatus: 'PENDING' | 'IN_REVIEW' | 'CLARIFICATION_REQUIRED' | 'APPROVED';
};
```

Esto requiere elevar `snapshotVersion` de `1` a `2` y actualizar backend, contrato compartido, Mobile y Portal en el mismo commit funcional.

No se realizará un cambio parcial donde backend devuelva v2 y algún consumidor siga esperando v1.

## Compatibilidad

### `user.shift`

Se mantiene temporalmente como etiqueta de presentación. No decide estado.

### `user.vehicleId`

Se mantiene para asignación base/compatibilidad. La sesión activa decide el conductor operacional mostrado.

### `vehicle.assignedRoute`

Se mantiene como proyección de la asignación ACTIVE. Jornada no escribe geometría propia.

### `startedAt`

En sesiones `ASSIGNED` o `READY`, el esquema actual exige `startedAt`. Eso es semánticamente incorrecto porque todavía no empezó.

Decisión de migración:

1. introducir `scheduledStartAt`;
2. permitir `startedAt: null` antes de `RUNNING`;
3. adaptar `buildSession` para representar sesiones preoperativas;
4. migrar registros legacy donde `startedAt` se usó como hora programada;
5. exigir `startedAt` solamente en transición a `RUNNING`.

Este es el cambio de modelo más delicado de la fase.

## Transiciones válidas

```text
ASSIGNED -> READY
ASSIGNED -> CANCELLED
READY -> RUNNING
READY -> CANCELLED
RUNNING -> PAUSED
RUNNING -> FINISHED
PAUSED -> RUNNING
PAUSED -> FINISHED
PAUSED -> CANCELLED (solo política autorizada)
```

Transiciones inválidas:

```text
FINISHED -> RUNNING
CANCELLED -> RUNNING
ASSIGNED -> FINISHED
READY -> FINISHED
```

## Idempotencia

Cada comando debe tolerar repetición:

| Comando repetido | Resultado |
|---|---|
| asignar mismo payload | devuelve misma sesión o conflicto explícito |
| confirmar confirmada | devuelve sesión actual |
| iniciar RUNNING | devuelve sesión actual |
| pausar PAUSED | devuelve sesión actual |
| reanudar RUNNING | devuelve sesión actual |
| finalizar FINISHED | devuelve resumen existente |
| aprobar APPROVED | devuelve revisión existente |

Payload diferente con la misma clave idempotente debe producir conflicto.

## Permisos

| Acción | Roles esperados |
|---|---|
| Asignar/cancelar | owner, admin, dispatcher; supervisor según capability |
| Confirmar/rechazar | conductor asignado |
| Preparar/iniciar | conductor asignado |
| Pausar/reanudar | conductor asignado; admin con razón |
| Finalizar | conductor asignado; admin de emergencia con razón |
| Revisar/aprobar | owner, admin, supervisor autorizado |
| Leer historial propio | conductor |
| Leer historial flotilla | roles con permisos de analytics/operations |

Los permisos finales deben usar capabilities existentes, no una lista de roles duplicada en cada endpoint.

## Checks de Fase 2

- [x] Aggregate persistido seleccionado.
- [x] Nueva colección descartada.
- [x] Estados existentes reutilizados.
- [x] Semántica de Jornada definida.
- [x] Diferencia FINISHED/CLOSED definida.
- [x] Integración con snapshot definida.
- [x] Compatibilidad legacy identificada.
- [x] Problema `startedAt` preoperativo identificado.
- [x] Transiciones válidas definidas.
- [x] Reglas de idempotencia definidas.
- [x] Permisos conceptuales definidos.
- [ ] Modelo modificado.
- [ ] Dominio de transiciones implementado.
- [ ] Migración legacy implementada.
- [ ] Snapshot v2 implementado de forma atómica.
- [ ] Pruebas backend/mobile/portal verdes.

## Veredicto

```text
PHASE_2_CONTRACT_CLOSED
ROUTE_SESSION_IS_CANONICAL_JOURNEY
NO_NEW_JOURNEY_COLLECTION
RUNTIME_IMPLEMENTATION_PENDING
```
