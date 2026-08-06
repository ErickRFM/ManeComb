# MDX-03 — Ciclo canónico de Jornada

## Estado

`DOMAIN_IMPLEMENTED_NOT_INTEGRATED`

La fase introdujo una máquina de estados única para Jornada sobre la entidad existente `RouteSession`. Todavía no modifica endpoints, esquema Mongo ni UI.

## Base

- Rama: `agent/mdx-journey-consolidation`
- Base inicial: `main@624816d052bceb16d491b321b2dbfcc175037233`
- PR: `#47`

## Hallazgo de runtime

El endpoint actual `POST /api/navigation/sessions/start` crea directamente una `RouteSession` en estado `RUNNING` y asigna `startedAt` en el mismo momento.

Eso impide representar correctamente:

1. asignación administrativa;
2. recepción por el conductor;
3. confirmación del match;
4. preparación/checklist;
5. inicio real de conducción.

La transición actual efectiva es:

```text
SIN SESIÓN → RUNNING
```

La transición objetivo es:

```text
ASSIGNED → READY → RUNNING ↔ PAUSED → FINISHED
     └───────────────→ CANCELLED
```

## Implementación añadida

### `backend/src/domain/journey-lifecycle.js`

Responsabilidad única:

- normalizar estados;
- declarar transiciones permitidas;
- identificar estados activos y terminales;
- reconocer reintentos idempotentes;
- construir el patch de transición;
- separar confirmación, inicio real, pausa, reanudación y cierre;
- preservar como `null` los números opcionales no proporcionados.

No accede a Express, Mongo, Socket.IO ni al store.

### `backend/test/journey-lifecycle.test.js`

Cubre:

- todas las transiciones permitidas;
- transiciones inválidas;
- terminales inmutables;
- reintentos idempotentes;
- confirmación sin inicio falso;
- inicio real desde `READY`;
- finalización con datos operativos;
- cierre sin convertir `null` a `0`;
- clasificación activa/terminal.

## Corrección encontrada durante la prueba

En JavaScript:

```js
Number(null) === 0
```

La normalización anterior usada en varios puntos del runtime puede convertir un dato ausente en un cero aparentemente real. El nuevo dominio usa una normalización opcional explícita:

```text
null / undefined / "" → null
número válido          → Number
otro valor             → null
```

Esto debe aplicarse al integrar odómetro, batería y precisión GPS final.

## Compatibilidad pendiente

El esquema actual exige `startedAt` incluso para estados `ASSIGNED` y `READY`. Antes de integrar el dominio deben añadirse o verificarse:

- `scheduledStartAt`;
- `scheduledEndAt`;
- `confirmedAt`;
- `confirmedBy`;
- `startedAt` nullable hasta `RUNNING`;
- `pausedAt`;
- `resumedAt`;
- política de migración para sesiones existentes.

## Migración propuesta

No reescribir sesiones históricas cerradas.

Para registros existentes:

| Caso | Tratamiento |
|---|---|
| `RUNNING`, `PAUSED`, `FINISHED`, `CANCELLED` con `startedAt` | conservar |
| `ASSIGNED`/`READY` existentes con `startedAt` | tratar temporalmente como dato legado y registrar versión de contrato |
| sesiones nuevas `ASSIGNED` | `startedAt: null`, `scheduledStartAt` obligatorio |
| transición `READY → RUNNING` | asignar `startedAt` una sola vez |

## Integración requerida

1. extender el esquema de `RouteSession` sin colección nueva;
2. adaptar `createRouteSession` en Mongo y store embebido;
3. crear endpoint administrativo de asignación o reutilizar un flujo existente;
4. crear confirmación del conductor `ASSIGNED → READY`;
5. modificar `/sessions/start` para exigir `READY` cuando la sesión sea nueva;
6. conservar compatibilidad temporal con inicio directo solo bajo una ruta explícita de legado;
7. reemplazar el mapa local de transiciones del router por `journey-lifecycle`;
8. emitir eventos distintos para asignación, confirmación, inicio, pausa, reanudación y cierre;
9. ampliar `OperationalUnitSnapshot` para sesiones sin `startedAt`;
10. agregar integración HTTP, Mongo, store y tenant.

## Checks

| Check | Estado |
|---|---|
| Máquina de estados única | PASS |
| Transiciones terminales protegidas | PASS |
| Idempotencia de mismo estado | PASS |
| Confirmación separada de inicio | PASS |
| Números opcionales preservan `null` | PASS |
| Prueba aislada con Node | PASS |
| Integración con router | PENDIENTE |
| Integración con Mongo | PENDIENTE |
| Integración con store embebido | PENDIENTE |
| Integración Socket.IO | PENDIENTE |
| UI conductor/admin | PENDIENTE |
| Suite completa CI | PENDIENTE |

## Veredicto

```text
MDX_03_DOMAIN_PASS
MDX_03_RUNTIME_INTEGRATION_PENDING
DO_NOT_MERGE
```
