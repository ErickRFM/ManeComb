# RC-OPERATIONAL-CONSISTENCY-02 — Certificación Integral de Consistencia Operacional

Fecha de auditoría: 2026-07-18  
Dictamen: **No certificado**

## Resumen ejecutivo

La plataforma todavía no cumple el criterio de una representación operacional única. `OperationalUnitSnapshot` existía con pruebas contractuales, pero al inicio de esta RC no tenía consumidores. Se migraron Checklist y el Bottom Sheet móvil para que identidad, estado, GPS, ruta, conductor, ETA y última actualización provengan del snapshot. El Portal, los selectores del mapa y otras superficies aún contienen interpretaciones propias; por ello no existe evidencia suficiente para afirmar paridad extremo a extremo ni para certificar C-1, C-2 y C-3 en producción.

No se crearon modelos, snapshots ni fallbacks específicos por unidad. Se retiró el cálculo móvil `Date.now() + etaMinutes`: el ETA visible migrado ahora usa la medición canónica `activeRouteProgress`.

## Inventario de consumidores

| Superficie | Consumidor principal | Fuente actual | Estado |
|---|---|---|---|
| Centro de Control / Checklist | `mobile/src/screens/checklist-screen.tsx` | `OperationalUnitSnapshot` para campos operacionales; historial conserva presentación histórica | Migrado parcialmente |
| Mapa | `mobile/src/screens/map-screen.native.tsx`, `map/utils/tracking.ts`, `MapCanvas.tsx` | `Vehicle`, frescura y filtros propios | Pendiente |
| Bottom Sheet | `mobile/src/screens/map/components/BottomTrackingPanel.tsx` | `OperationalUnitSnapshot` para estado, GPS, ruta, conductor, ETA y recencia | Migrado parcialmente |
| Seguimiento | `mobile/src/hooks/use-point-to-point-tracker.ts`, `utils/active-route.ts` | tracker/proyección local | Pendiente |
| Dashboard / Portal | `ventas/features/portal/screens/portal-dashboard-screen.tsx` | helpers locales de estado, GPS, ruta, ETA, jornada y métricas | Pendiente crítico |
| Mapa Portal | `ventas/features/portal/components/operations-map.tsx` | `Vehicle` y reglas visuales propias | Pendiente |
| Unidades Portal | `ventas/features/portal/screens/portal-units-screen.tsx` | `Vehicle` | Pendiente |
| Rutas Portal | `ventas/features/portal/screens/portal-routes-screen.tsx` | asignación y jornada reinterpretadas | Pendiente |
| Incidencias | `mobile/src/screens/incidents-screen.tsx`, `ventas/features/portal/screens/portal-incidents-screen.tsx` | vehículo/incidencia sin snapshot común | Pendiente |
| Usuarios | `mobile/src/screens/users-screen.tsx`, Portal Users | fallback propio de ruta/asignación | Pendiente |
| Historial | Bottom Sheet, Checklist, Portal Dashboard | `RouteSession` histórico | Correcto como dominio histórico; presentación no unificada |

## Flujo de datos auditado

```text
Mongo / store embebido
  -> store y repositorios backend
  -> serializers.js
  -> REST (/locations, /vehicles, /navigation, /incidents)
  -> Socket.IO (vehicle/location/session/incident)
  -> Zustand mobile / Portal
  -> OperationalUnitSnapshot (solo mobile)
  -> Checklist y Bottom Sheet migrados

Ramas todavía divergentes:
  Zustand -> selectores de mapa / tracker local
  Zustand Portal -> helpers locales / mapa Portal / unidades / rutas
```

REST y Socket.IO publican el mismo contrato de vehículo enriquecido, pero los merges parciales y la combinación posterior con sesiones/incidencias no producen todavía una colección canónica compartida por ambos runtimes.

## Matriz de comparación por pantalla

| Campo | Mapa | Bottom Sheet | Checklist | Portal/Dashboard | Resultado |
|---|---|---|---|---|---|
| Identidad | Vehicle | Snapshot | Snapshot | Vehicle | Parcial |
| Estado/jornada | filtros por `vehicle.status` | Snapshot + sesión | Snapshot + presentación compacta | helper local | Divergente |
| GPS/frescura | helper local | Snapshot | Snapshot disponible en registro | helper Portal | Divergente |
| Ruta | assignedRoute local | Snapshot | Snapshot | helper local | Divergente |
| Conductor efectivo | Vehicle | Snapshot | Snapshot | sesión/usuarios/Vehicle | Divergente |
| ETA | progreso/Vehicle según superficie | Snapshot `remainingTimeSeconds` | Snapshot `etaAt` | `etaAt` o `etaMinutes` | Divergente |
| Progreso/desvío | backend + tracker local | Snapshot en detalle operativo | tracker local en modal | helper local | Divergente |
| Métricas | sesión | sesión | tracker/sesión | sesión/helper | No demostrada |
| Incidencias | colección del mapa | snapshot + historial | no consolidada en tarjeta | colección Portal | Divergente |
| Último evento | no uniforme | no mostrado desde snapshot | no uniforme | detalle de sesión | Divergente |

## Paridad de casos representativos

No había acceso autenticado a datos productivos ni fixtures integrales por unidad que recorran Backend -> Snapshot -> todas las pantallas. No se inventó evidencia.

| Caso | Backend/Snapshot contractual | Paridad Mobile | Paridad Portal | Dictamen |
|---|---|---|---|---|
| C-1 | No ejecutada con dato real | No demostrada | No demostrada | No certificada |
| C-2 | No ejecutada con dato real | No demostrada | No demostrada | No certificada |
| C-3 | No ejecutada con dato real | No demostrada | No demostrada | No certificada |
| Sin ruta | Snapshot devuelve `route: null` por contrato | Parcial | No demostrada | Condicionada |
| Mantenimiento | Snapshot normaliza `maintenance` | Parcial | helper distinto | No certificada |
| GPS vencido | Prueba/contrato `fresh/stale/missing` | Bottom Sheet migrado | helper distinto | No certificada |
| Con incidencia | Snapshot filtra abiertas/en proceso por unidad | Bottom Sheet migrado | colección separada | No certificada |

## Hallazgos y causa raíz

### Críticos

1. **Portal no consume `OperationalUnitSnapshot`.** Causa: el snapshot está definido dentro del paquete mobile y el Portal mantiene tipos/helpers independientes. Impacto: estado, GPS, ETA, conductor y ruta pueden diferir entre Portal y Mobile.
2. **No existe prueba automática extremo a extremo por C-1/C-2/C-3.** Causa: las pruebas actuales son contractuales y de componentes, no una proyección serializada común para todas las superficies.

### Altos

1. **Mapa filtra unidades con `ACTIVE_TRACKING_STATUSES` y GPS fresco.** Una unidad operacional puede desaparecer del mapa aunque deba seguir visible con GPS vencido. Causa: selección visual mezcla visibilidad con salud GPS.
2. **Tracker móvil recalcula progreso/desvío.** Causa: soporte offline/local anterior al snapshot. Impacto: el modal puede mostrar progreso, ETA o checkpoint distintos al backend.
3. **Portal conserva fallback `etaMinutes`.** Causa: compatibilidad con contrato legado. Impacto: dos ETAs para la misma medición.

### Medios

1. Usuarios y rutas resuelven etiquetas mediante órdenes de fallback distintos.
2. Métricas de jornada se formatean desde sesión en varios consumidores, sin selector canónico compartido.
3. Incidencias no se agregan uniformemente al resumen de cada unidad.

### Bajos

1. El build Portal advierte chunks superiores a 500 kB; afecta rendimiento de carga, no paridad semántica.
2. El snapshot se construye por render en helpers migrados; conviene materializar/memoizar una colección en store cuando todos los consumidores hayan convergido.

## Cambios realizados

| Archivo | Cambio |
|---|---|
| `mobile/src/screens/checklist-screen.tsx` | Identidad, estado actual, ruta, conductor y ETA pasan por `buildOperationalUnitSnapshot`; se eliminó el ETA relativo legado y helpers obsoletos. |
| `mobile/src/screens/map/components/BottomTrackingPanel.tsx` | Estado, GPS, ruta, conductor, placas, ETA y última actualización pasan por el snapshot; velocidad usa explícitamente m/s -> km/h. |
| `RC-OPERATIONAL-CONSISTENCY-02.md` | Evidencia, matriz, riesgos y dictamen de esta RC. |

## Evidencia de validación

| Validación | Resultado |
|---|---|
| Mobile TypeScript (`npm run typecheck`) | Pasa |
| Mobile ESLint (`npm run lint`) | Pasa |
| Mobile Jest + pruebas punto a punto | 22 suites, 101 pruebas, todas pasan |
| Prueba contractual del snapshot | Pasa |
| Backend (`npm test`) | Pasa |
| Portal TypeScript | Pasa |
| Portal build Vite | Pasa; advertencia no bloqueante de tamaño de chunks |
| Android debug | No concluido: el proceso excedió 304 s sin entregar resultado |
| `git diff --check` | Pasa |

No se generaron capturas porque no se contó con una sesión autenticada y datos reales controlados de C-1/C-2/C-3. Los registros automatizados anteriores constituyen la evidencia reproducible disponible.

## Riesgos remanentes y condición para certificar

- Publicar el snapshot como contrato compartido o producirlo en backend para Mobile y Portal, sin duplicarlo.
- Migrar mapa, tracker, Portal Dashboard, mapa Portal, Unidades, Rutas, Usuarios e Incidencias.
- Retirar `etaMinutes` de todos los consumidores y usar únicamente `routeProgress.etaAt/remainingTimeSeconds` de la misma medición.
- Separar visibilidad de unidad y frescura GPS para que GPS vencido no elimine marcadores.
- Agregar fixtures/integración de C-1, C-2, C-3, sin ruta, mantenimiento, GPS vencido e incidencia, comparando objetos proyectados campo por campo.
- Completar build Android y validación visual autenticada.

## Dictamen final

**No certificado.** La RC reduce divergencia real en dos consumidores móviles y todas las validaciones concluidas pasan, pero los criterios explícitos exigen igualdad entre Portal, Mobile, Mapa, Centro de Control, Dashboard, Seguimiento y Bottom Sheet. Esa igualdad todavía no existe ni está demostrada para C-1, C-2 y C-3.
