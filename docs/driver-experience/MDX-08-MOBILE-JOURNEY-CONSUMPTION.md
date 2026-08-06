# MDX-08 — Consumo canonico de Jornada en Mobile

## Objetivo

Conectar Mobile a la Jornada que ya forma parte de `OperationalUnitSnapshot`, sin crear otra consulta, store, contador o maquina de estados en React Native.

## Fuente de verdad

```text
Backend RouteSession
  -> operational-unit-snapshot
  -> OperationalUnitSnapshot.journey
  -> useTrackingData.selectedJourney
  -> componentes de presentacion
```

## Cambios

- Se agregaron selectores compartidos para etiqueta, accion primaria y busqueda de Jornada por conductor.
- `shared/operational-contract/index.ts` exporta los selectores de Jornada.
- `useTrackingData` expone `selectedJourney` directamente desde `selectedUnit.journey`.
- No se reconstruyen tiempos, estados ni permisos en Mobile.

## Reglas

| Regla | Resultado |
|---|---|
| Estado de Jornada | Backend |
| Tiempo transcurrido | Backend snapshot |
| Accion primaria | Banderas del snapshot |
| Unidad seleccionada | Inventario operacional existente |
| Nueva consulta REST | No |
| Nuevo store Mobile | No |
| Nuevo temporizador local | No |
| Compatibilidad `session` | Conservada |

## Selectores

```text
journeyStatusLabel
journeyPrimaryAction
selectJourneyForDriver
selectUnitForDriverJourney
```

Los selectores no cambian estado ni calculan horarios. Solo eligen o presentan datos ya resueltos.

## Checks

- [x] El tipo compartido incluye `journey`.
- [x] Mobile importa el contrato compartido existente.
- [x] El hook no deriva estados.
- [x] El hook no usa `Date.now()` para duración.
- [x] No se agregó un segundo endpoint de lectura.
- [x] No se agregó un segundo canal Socket.IO.
- [ ] Typecheck Mobile del SHA final.
- [ ] Pruebas Mobile del SHA final.
- [ ] APK Android del SHA final.
- [ ] Integración visual de acciones, pendiente de CI verde.

## Estado

```text
MDX_08_DATA_CONSUMPTION_IMPLEMENTED
VISUAL_ACTIONS_PENDING
DO_NOT_MERGE
```
