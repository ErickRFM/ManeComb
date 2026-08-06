# MDX-09 — Acciones canónicas de Jornada en Mobile

## Objetivo

Conectar las acciones del conductor al ciclo canónico de Jornada sin crear una segunda máquina de estados ni simular transiciones que el backend no aceptó.

## Autoridad

```text
OperationalUnitSnapshot.journey
        ↓
journeyPrimaryAction
        ↓
executeRouteSessionAction
        ↓
POST /api/journeys/:journeyId/transition
        ↓
RouteSession + operational-unit:updated
```

## Acciones

| Acción visible | Estado enviado |
|---|---|
| Confirmar | `READY` |
| Iniciar | `RUNNING` |
| Pausar | `PAUSED` |
| Reanudar | `RUNNING` |
| Finalizar | `FINISHED` |

## Compatibilidad

El servicio existente `route-session-actions.ts` se conserva.

- Cuando existe `currentJourney`, usa el endpoint canónico de Jornada.
- Cuando no existe Jornada canónica, mantiene temporalmente el flujo legado de Navigation.
- `confirm` no está disponible en el flujo legado.

## Política offline

Las transiciones de una Jornada programada no se simulan localmente.

```text
ASSIGNED / READY + sin servidor
              ↓
error visible y reintento
```

No se permite crear localmente una confirmación o inicio ficticio porque el administrador seguiría viendo otro estado.

El comportamiento offline legado permanece únicamente para sesiones creadas por el flujo antiguo mientras se migran sus consumidores.

## Control visual

`FloatingControls` ahora reconoce:

```text
none
assigned
ready
running
paused
```

| Estado | Acción principal |
|---|---|
| `assigned` | Confirmar |
| `ready` | Iniciar |
| `running` | Pausar / Finalizar |
| `paused` | Reanudar / Finalizar |
| `none` | Inicio legado temporal |

## Pruebas

`route-session-actions.journey.test.ts` comprueba:

- endpoint único para las cinco acciones;
- estado exacto enviado;
- finalización devuelve `session: null`;
- no se encola una transición canónica offline;
- no se confirma sin una Jornada asignada.

## Checks

| Check | Estado |
|---|---|
| Segunda máquina de estados | No creada |
| Segundo store | No creado |
| Endpoint paralelo | No creado |
| Confirmación offline ficticia | Bloqueada |
| Compatibilidad temporal | Conservada |
| Control `ASSIGNED/READY` | Implementado |
| Cableado final en `MapScreen` | Pendiente de CI de esta capa |

## Veredicto

```text
MDX_09_ACTION_SERVICE_IMPLEMENTED
MDX_09_CONTROLS_IMPLEMENTED
MAP_SCREEN_WIRING_PENDING
DO_NOT_MERGE
```
