# MDX-06 — Asignación administrativa y match operativo

## Estado

`IMPLEMENTED_PENDING_FINAL_CI`

## Objetivo

Programar una Jornada sobre `route_sessions` sin crear otra autoridad, separando horario programado de inicio real y evitando duplicados entre la API canónica y Navigation legado.

## Flujo validado

```text
Administrador programa
  ASSIGNED
    ↓ conductor confirma
  READY
    ↓ conductor inicia
  RUNNING
```

## API

```http
POST /api/journeys
```

Payload:

```json
{
  "driverId": "user-driver-01",
  "vehicleId": "vehicle-101",
  "routeId": "route-01",
  "scheduledStartAt": "2026-08-07T12:00:00.000Z",
  "scheduledEndAt": "2026-08-07T20:00:00.000Z",
  "supervisorId": null,
  "notes": "Instrucciones operativas"
}
```

## Reglas de datos

| Regla | Resultado |
|---|---|
| `scheduledStartAt` válido | Obligatorio |
| `scheduledEndAt` válido | Obligatorio |
| Fin posterior al inicio | Obligatorio |
| `startedAt` al asignar | `null` |
| `startedAt` al iniciar | Timestamp real del backend |
| Mismo tenant | Obligatorio |
| Conductor activo | Obligatorio |
| Unidad disponible | Obligatorio |
| Ruta existente | Obligatorio |
| Match conductor-unidad | Debe existir previamente |
| Match unidad-ruta | Debe ser congruente |
| Conflicto de horario | Bloqueado |
| Reintento idéntico | Idempotente |

## Compatibilidad

`journey-store-compatibility.js` amplía temporalmente el concepto de sesión activa para incluir:

```text
ASSIGNED
READY
RUNNING
PAUSED
```

Esto evita que `/api/navigation/sessions/start` cree una segunda sesión mientras existe una asignación pendiente o confirmada.

No se elimina todavía Navigation legado. El cutover se hará después de migrar Mobile y comprobar ausencia de consumidores.

## Códigos controlados

| Código | Significado |
|---|---|
| `assignment_fields_required` | Faltan conductor, unidad o ruta |
| `schedule_invalid` | Ventana horaria inválida |
| `driver_unavailable` | Conductor bloqueado o suspendido |
| `vehicle_unavailable` | Unidad en mantenimiento o retirada |
| `tenant_mismatch` | Recursos de organizaciones distintas |
| `driver_vehicle_mismatch` | No existe match operativo vigente |
| `vehicle_route_mismatch` | La unidad tiene otra ruta |
| `schedule_conflict` | Cruce por conductor o unidad |
| `vehicle_active_journey` | Ya existe una jornada activa |

## Checks de fase

| Check | Estado |
|---|---|
| Usa `RouteSession` existente | PASS |
| No crea colección paralela | PASS |
| Separa horario e inicio real | PASS |
| Tenant cerrado | PASS |
| Reintento idempotente | PASS |
| Bloquea cruce conductor/unidad | PASS |
| Bloquea Navigation legado duplicado | PASS |
| Conductor confirma su propia Jornada | PASS |
| Admin puede cancelar con motivo | PASS |
| Prueba HTTP agregada | PASS |
| Mongo migrado en producción | NOT APPLIED |
| UI administrativa | PENDING |
| UI conductor | PENDING |

## Archivos

- `backend/src/services/journey-assignment-service.js`
- `backend/src/services/journey-store-compatibility.js`
- `backend/src/domain/journey-session-schema.js`
- `backend/src/modules/journeys/routes.js`
- `backend/test/journey-api.test.js`

## Restricciones restantes

1. La API no reasigna conductor, unidad o ruta de forma silenciosa.
2. La migración de tiempos continúa siendo manual y dry-run por defecto.
3. El endpoint legado se conserva por compatibilidad, pero queda protegido.
4. La fase no está lista para merge hasta que CI y APK del SHA final estén verdes.
