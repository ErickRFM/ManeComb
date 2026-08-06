# MDX-10 — Integración de Jornada en el mapa móvil

## Objetivo

Conectar los controles existentes del mapa móvil al contrato canónico de Jornada sin crear otro store, otro contador ni otra máquina de estados.

## Fuente de verdad

```text
RouteSession
  -> operational-unit snapshot v2
  -> OperationalUnitSnapshot.journey
  -> MapScreen
  -> executeRouteSessionAction
  -> POST /api/journeys/:id/transition
```

## Estados y acciones

| Estado backend | Estado UI | Acción principal |
|---|---|---|
| `ASSIGNED` | `assigned` | Confirmar |
| `READY` | `ready` | Iniciar |
| `RUNNING` | `running` | Pausar / Finalizar |
| `PAUSED` | `paused` | Reanudar / Finalizar |

El estado `none` se conserva únicamente para compatibilidad temporal con sesiones antiguas iniciadas por Navigation.

## Reglas de congruencia

- El conductor usa la Jornada de su propia unidad (`ownOperationalUnit.journey`), no la unidad que un administrador pueda seleccionar visualmente en el mapa.
- Confirmar no inicia GPS ni conducción.
- Iniciar o reanudar activa el servicio de ubicación en segundo plano únicamente después de recibir una sesión con estado `RUNNING` desde backend.
- Finalizar detiene el servicio de ubicación en segundo plano.
- La pantalla refresca el snapshot después de una transición aceptada.
- Una transición canónica sin conexión no genera estados optimistas falsos.
- Los mensajes de confirmación explican la diferencia entre confirmar e iniciar.

## Archivos

- `mobile/src/screens/map-screen.native.tsx`
- `mobile/src/screens/map/components/FloatingControls.tsx`
- `mobile/src/services/route-session-actions.ts`
- `mobile/src/services/route-session-actions.journey.test.ts`
- `shared/operational-contract/journey-selectors.ts`

## Checklist

| Check | Estado |
|---|---|
| Jornada propia separada de unidad seleccionada | Implementado |
| `ASSIGNED -> READY` desde Mobile | Implementado |
| `READY -> RUNNING` desde Mobile | Implementado |
| GPS no inicia al confirmar | Implementado |
| GPS requiere respuesta `RUNNING` | Implementado |
| Pausa y reanudación canónicas | Implementado |
| Finalización detiene GPS | Implementado |
| Compatibilidad Navigation | Conservada temporalmente |
| Typecheck móvil | Pendiente de CI |
| Pruebas móviles | Pendiente de CI |
| APK Android | Pendiente de CI |

## Veredicto provisional

`MDX_10_IMPLEMENTED_CI_PENDING`

No debe hacerse merge hasta que el SHA final complete la matriz de CI.