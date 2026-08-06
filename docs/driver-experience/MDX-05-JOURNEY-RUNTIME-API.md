# MDX-05 — Integración runtime de Jornada

## Estado

`IMPLEMENTED_PENDING_CI`

## Objetivo

Exponer una API canónica de Jornada sobre la autoridad persistida existente `route_sessions`, sin crear una colección, store o máquina de estados paralelos.

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `backend/src/domain/journey-session-schema.js` | Extiende de forma compatible el schema compilado de `RouteSession` |
| `backend/src/modules/journeys/routes.js` | Lectura y transición canónica |
| `backend/src/app.js` | Montaje `/api/journeys` |
| `backend/test/journey-api.test.js` | Contrato HTTP real |
| `backend/package.json` | Inclusión de todas las pruebas MDX en CI |

## Endpoints

### Consultar

```http
GET /api/journeys/:sessionId
```

Devuelve la sesión serializada con tiempos programados y reales diferenciados.

### Transicionar

```http
POST /api/journeys/:sessionId/transition
Content-Type: application/json

{
  "status": "PAUSED"
}
```

Estados válidos según el contrato:

```text
ASSIGNED -> READY -> RUNNING
RUNNING <-> PAUSED
RUNNING/PAUSED -> FINISHED
ASSIGNED/READY/RUNNING/PAUSED -> CANCELLED
```

## Compatibilidad

La ruta histórica `/api/navigation/sessions/:sessionId/status` continúa disponible temporalmente. No se elimina en este corte porque Mobile todavía la consume.

Ambas rutas operan sobre el mismo `RouteSession`; sin embargo, la nueva API es la autoridad objetivo. La eliminación del escritor histórico requiere primero:

1. migrar Mobile;
2. migrar Portal;
3. comprobar telemetría sin consumidores;
4. ejecutar regresión completa;
5. retirar el endpoint legado en una fase separada.

## Eventos

| Transición | Evento existente reutilizado |
|---|---|
| `READY -> RUNNING` | `SESSION_STARTED` |
| `PAUSED -> RUNNING` | `SESSION_RESUMED` |
| `RUNNING -> PAUSED` | `SESSION_PAUSED` |
| `RUNNING/PAUSED -> FINISHED` | `SESSION_FINISHED` |
| Cualquier estado no terminal -> `CANCELLED` | `SESSION_FINISHED` con razón |
| `ASSIGNED -> READY` | Campos `confirmedAt` y `confirmedBy`; sin evento nuevo incompatible |

## Seguridad

- autenticación obligatoria;
- acceso operativo obligatorio;
- el conductor solo puede actuar sobre su propia jornada;
- roles administrativos requieren `canManageRoutes`;
- aislamiento por organización;
- administradores Platform conservan alcance global explícito;
- mismo estado es idempotente;
- escrituras concurrentes fallan con `409`;
- jornadas terminales no se reabren.

## Socket.IO

Se conserva el evento existente:

```text
route-session:updated
```

Audiencias:

- roles de la organización con `canViewAnalytics`;
- conductor asignado;
- administración Platform.

## Métricas y aprendizaje

Al finalizar correctamente:

1. se registra `SESSION_FINISHED`;
2. se calculan métricas de ruta;
3. se persiste el resultado;
4. se dispara el aprendizaje de ruta existente;
5. se emite la sesión actualizada.

No se duplican motores de métricas ni aprendizaje.

## Checks

| Check | Estado |
|---|---|
| Misma colección `route_sessions` | PASS |
| Misma máquina de estados | PASS |
| Mismos eventos operativos | PASS |
| Mismo motor de métricas | PASS |
| Mismo aprendizaje de rutas | PASS |
| Mismo evento Socket.IO | PASS |
| Lectura compatible legacy/nueva | PASS |
| Prueba HTTP agregada | PASS |
| Suite oficial actualizada | PASS |
| CI completo | PENDIENTE |
| Mongo real | PENDIENTE DE CI/ENTORNO |
| Migración aplicada | NO, por diseño |

## Veredicto provisional

La integración no crea una autoridad paralela. El endpoint histórico se conserva únicamente como compatibilidad temporal y deberá retirarse después de migrar consumidores.
