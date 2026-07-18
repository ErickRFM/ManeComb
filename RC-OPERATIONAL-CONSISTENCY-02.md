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

---

# Actualización — 2026-07-18, iteración 2

## Corrección de partida: qué son C-1, C-2 y C-3

Las revisiones anteriores trataron `C-1`, `C-2` y `C-3` como escenarios abstractos.
**No lo son: son las tres unidades reales del operador.** El titular aportó capturas
del 2026-07-18 a las 10:08 y 12:42 que las muestran por nombre. Toda la certificación
se reorienta a reproducir el estado real de esas tres combis.

## Defecto observado en producción, con causa localizada

Dos capturas del mismo instante (10:08) se contradicen:

| | Mapa (bottom sheet) | Checklist |
|---|---|---|
| Estado de C-1 | `assigned` | `Disponible` |
| Identidad | C-1, C-2, C-3 visibles | solo C-2 con nombre; **C-1 y C-3 en blanco** |
| Rutas | `RUTAS 0` | "Santa Ana", "Ruta Chida" |
| ETA | — | 21:17 con salida 21:17 (0 min) |

El titular precisó además que **C-2 es una unidad recién dada de alta y no aparece
en el mapa**, mientras que las antiguas sí. El defecto está invertido entre pantallas:

- **Mapa** — `mobile/src/screens/map/utils/tracking.ts:40` exigía
  `ACTIVE_TRACKING_STATUSES.has(status) && isVehicleGpsFresh(v)`. Una unidad nueva no
  cumple ninguna de las dos condiciones: desaparecía del mapa. **Causa confirmada.**
- **Checklist** — `checklist-screen.tsx` construye `vehicleCode` en **tres lugares**
  (líneas 164, 1418 y 1435). C-2 pasa por el camino migrado al snapshot y se lee bien;
  C-1 y C-3 pasan por el camino de historial de sesiones y salen sin nombre.
  **Causa confirmada estructuralmente**; no se instrumentó el valor exacto en runtime.
- **Cuarto ETA** — el detalle de ruta muestra "Estimado 9 min", cálculo distinto de
  `etaMinutes` y de `etaAt`. Cuatro fuentes de ETA para tres unidades.

## Hallazgo nuevo: la capa de datos fabrica rutas

`backend/src/data/store.js:207` escribe `routeName: "Sin ruta"` y `routeCode: "N/A"`
como si fueran datos. La primera versión del snapshot canónico interpretó ese rótulo
como una ruta real y produjo `route: { name: "Sin ruta" }` en lugar de `route: null`.
Detectado por la prueba de integración, no por inspección. Corregido: **la identidad de
una ruta es su `id`; un nombre suelto no constituye una ruta.**

## Cambios realizados en esta iteración

### Fase 1 — Snapshot canónico en backend (completa)

| Archivo | Cambio |
|---|---|
| `backend/src/domain/operational-unit-snapshot.js` | **Nuevo.** Única fuente de verdad. `etaAt` como único ETA, `speedKmh` convertida en backend, umbrales de frescura en constantes exportadas (120 s / 900 s), `driver.source` con orden único sesión→asignación→ninguno, y `visibility` desacoplada de la frescura del GPS. |
| `backend/src/services/operational-units-service.js` | **Nuevo.** Ensambla la colección y la unidad individual; `emitOperationalUnitUpdate` publica el snapshot completo sin merges parciales. |
| `backend/src/modules/operational-units/routes.js` | **Nuevo.** `GET /api/operational-units` y `GET /api/operational-units/:id`. |
| `backend/src/app.js` | Registro del módulo. |
| `backend/src/sockets/index.js`, `backend/src/modules/locations/routes.js` | Emiten `operational-unit:updated` en cada cambio de ubicación. |
| `backend/test/operational-unit-snapshot.test.js` | **Nueva.** 12 bloques: sin ruta, mantenimiento, GPS fresh/stale/missing, incidencias, sin conductor, sesión terminal, datos faltantes, y `visibility === 'visible'` con `freshness === 'missing'`. |
| `backend/test/operational-units-endpoint.test.js` | **Nueva.** Integración con las tres unidades reales; verifica que C-2 sin GPS aparece, paridad REST↔Socket.IO, aislamiento entre tenants y ausencia de `etaMinutes`/`speedMetersPerSecond` en el serializado. |
| `backend/package.json` | Se añaden ambas pruebas a `npm test`, y también `tracking-integrity.test.js`, que **existía pero no estaba en la cadena**. |

### Fase 2 — Contrato compartido (parcial)

| Archivo | Cambio |
|---|---|
| `shared/operational-contract/` | **Nuevo.** Tipo `OperationalUnitSnapshot` y selectores de presentación (`formatEta`, `formatFreshness`, `formatSpeed`, `stateLabel`, `stateColor`, `sortByCriticality`, `summarizeFleet`). No calculan: solo formatean. |
| `mobile/metro.config.js`, `mobile/tsconfig.json`, `ventas/tsconfig.json`, `ventas/vite.config.js` | Alias `@shared`. En Vite se declara **antes** que `@`, porque la coincidencia es por prefijo. |
| `mobile/src/api/client.ts` | `getOperationalUnitsRequest()`. |
| `mobile/src/store/root-store.ts` | Estado `operationalUnits`, carga en bootstrap y suscripción a `operational-unit:updated` con reemplazo íntegro de la unidad. |
| `mobile/src/screens/map/utils/tracking.ts` | **`ACTIVE_TRACKING_STATUSES` eliminado.** Se añaden selectores canónicos y se conserva un camino heredado sobre `Vehicle`, marcado como pendiente, cuya regla de visibilidad ya no oculta unidades. |
| `mobile/src/screens/map/hooks/use-tracking-data.ts` | La selección recorre el inventario completo: una unidad sin GPS puede seleccionarse. |
| `mobile/src/screens/checklist-screen.tsx` | **Los tres constructores de `vehicleCode` quedan reducidos a uno.** Los registros se recorren desde `operationalUnits`, no desde `mapData.vehicles`; identidad, conductor, ruta y ETA salen del snapshot. Se eliminó el uso del constructor de snapshot local. |
| `mobile/src/screens/checklist-screen.test.ts` | Dos pruebas de regresión: identidad presente aunque el vehículo llegue sin `code` (defecto de C-1/C-3), y ausencia de ruta/conductor/ETA inventados en unidad nueva (caso C-2). |
| `mobile/jest.config.js` | Mapeo de `@shared` y `moduleDirectories` para resolver el contrato fuera de `rootDir`. |

## Decisiones de arquitectura tomadas

- **`shared/` con alias, no monorepo con workspaces.** Metro resuelve mal los symlinks
  de workspaces y el build de Android se vuelve intermitente. `metro.config.js` ya
  tenía `workspaceRoot`, así que `watchFolders` + `extraNodeModules` es una extensión
  idiomática. Verificado con typecheck real en ambos runtimes.
- **`etaMinutes` se elimina del esquema y del serializador**, no solo de los clientes.
  Un ETA en minutos se congela al guardarse; uno absoluto no envejece.

## Estado real de la migración

| Superficie | Estado |
|---|---|
| Backend `/operational-units` (REST + Socket.IO) | **Migrado y probado** |
| `shared/operational-contract` | **Publicado y resolviendo en ambos runtimes** |
| Store mobile (`operationalUnits`) | **Migrado** |
| Filtro de visibilidad del mapa móvil | **Corregido** (causa de la desaparición de C-2) |
| `map-screen.native.tsx`, `MapCanvas.tsx`, `BottomTrackingPanel.tsx`, `use-tracking-data.ts` | **Migrado**: árbol del mapa completo sobre el snapshot |
| `incidents-screen.tsx` | **Migrado**: `getIncidentContext` usa `gps.freshness` del contrato |
| `use-point-to-point-tracker.ts`, `utils/active-route.ts` | **Pendiente** |
| `checklist-screen.tsx` (identidad, conductor, ruta, ETA) | **Migrado y probado** |
| `incidents-screen.tsx`, `users-screen.tsx` | **Pendiente** |
| Portal completo (dashboard, mapa, unidades, rutas, incidencias) | **Pendiente** |
| Fases 3, 4 y 5 (registro de chofer, historial, pantalla de inicio) | **No iniciadas** |

El criterio de cero resultados para `etaMinutes` **no se cumple**: sigue presente en
`backend/src/data/{models,store,mongo-store,serializers,seedData}.js` y en
`mobile/src/types/app.ts`, `ventas/src/types/app.ts` y `portal-dashboard-screen.tsx`.
El contrato canónico no lo expone —hay una prueba que lo impide—, pero el campo
persiste en el esquema. Además, `.tmp-rc-communication-deploy-01-clean/` contiene una
copia completa del backend versionada en el árbol que duplica esos hallazgos; ese
criterio no se podrá cumplir mientras exista.

## Evidencia de validación — ejecutada en esta iteración

| Validación | Comando | Resultado |
|---|---|---|
| Backend | `cd backend && npm test` | **Pasa.** 20 archivos encadenados, incluidas las 2 nuevas suites |
| Mobile TypeScript | `cd mobile && npm run typecheck` | **Pasa** |
| Mobile ESLint | `cd mobile && npm run lint` | **Pasa**, sin salida |
| Mobile Jest | `cd mobile && npm test` | **Pasa.** 21 suites, 101 pruebas |
| Portal TypeScript | `cd ventas && npm run typecheck` | **Pasa** |
| Portal build | `cd ventas && npm run build` | **Pasa** en 11,03 s; advertencia no bloqueante de chunks >500 kB |
| Higiene de diff | `git diff --check` | **Pasa** (solo avisos LF/CRLF) |

### No ejecutado — se declara explícitamente

- **Sin verificación contra la base de datos real del operador.** Las pruebas usan el
  store embebido con unidades sintéticas llamadas C-1, C-2 y C-3. No se ha confirmado
  que las unidades reales del titular produzcan estos snapshots.
- **Sin ejecución en dispositivo.** No se abrió la app ni se tomaron capturas nuevas;
  la corrección del filtro del mapa está probada en el nivel del contrato, no observada
  en pantalla.
- **Sin prueba de comparación pantalla por pantalla.** La Fase 6 exige comparar el
  snapshot contra lo que renderiza cada superficie; eso requiere que las superficies
  estén migradas, y la mayoría no lo está.
- **Sin build de Android.**
- **`ventas` no tiene runner de pruebas** (`dev, build, preview, typecheck`), así que
  la comparación por campo en Portal no tiene hoy dónde ejecutarse.

## Dictamen

**No certificado.**

Lo que sí cambió respecto a la iteración anterior: existe una proyección operacional
única, producida en backend, con pruebas que fijan sus reglas duras —incluida la que
impide que una unidad desaparezca por falta de GPS, que es la causa demostrada de que
C-2 no se viera en el mapa—. El contrato está publicado y resuelve en los tres runtimes.

Lo que no permite certificar: la mayoría de las superficies sigue reinterpretando los
datos por su cuenta, `etaMinutes` continúa en el esquema, y no hay ninguna evidencia
obtenida contra datos reales ni en dispositivo. La igualdad entre pantallas que exige
el criterio no está demostrada para C-1, C-2 ni C-3.

Checklist ya está unificado: sus tres constructores de identidad se redujeron a uno y
hay pruebas que fijan el comportamiento. El siguiente paso de mayor impacto es el árbol
del mapa (`map-screen.native.tsx` y `MapCanvas.tsx`), que sigue sobre `Vehicle`, y
después el Portal completo.

---

# Actualización — iteración 3: árbol del mapa y eliminación del snapshot duplicado

## Migración completada

`map-screen.native.tsx`, `MapCanvas.tsx`, `BottomTrackingPanel.tsx`,
`use-tracking-data.ts`, `map/utils/tracking.ts` e `incidents-screen.tsx` consumen ahora
el snapshot canónico. Cambios de fondo, no de nombres:

- **`MapCanvas`** dibuja `UnitMarkers` en lugar de `VehicleMarkers`. El color sale de
  `stateColor(operationalState)` y la opacidad de `freshnessOpacity(gps.freshness)`.
  Una unidad con GPS vencido se dibuja atenuada; la única exclusión es no tener
  coordenada.
- **`BottomTrackingPanel`** perdió sus cinco formateadores locales
  (`formatVehicleSpeed`, `formatVehicleStatus`, `formatRouteLabel`,
  `formatCompactVehicleMeta` y el mapa `statusLabels` de estado de vehículo). Usa los
  selectores compartidos. El ETA pasó de `remainingTimeSeconds / 60` a `formatEta(route)`,
  es decir de "faltan N minutos" a hora de llegada absoluta.
- **`map-screen`** ya no distingue por rol al poblar el panel: antes el conductor veía
  `trackingVehicles` (filtrado) y el resto `prioritizedVehicles`. Ahora todos ven el
  mismo inventario.
- **`incidents-screen`** dejó de depender por completo de `mapData`; su `locationState`
  es `gps.freshness` del contrato en vez de un cálculo propio.

## Eliminación del snapshot duplicado

Borrado `mobile/src/domain/operations/` completo: `build-operational-unit-snapshot.ts`,
`operational-unit-snapshot.ts` y `build-operational-unit-snapshot.test.ts`. Ya no
existen dos constructores de snapshot. Verificado por grep: **cero referencias** a
`buildOperationalUnitSnapshot` o `domain/operations` en `mobile/src`, `ventas` y `shared`.

De `ACTIVE_TRACKING_STATUSES` queda una sola aparición, en un comentario de
`map/utils/tracking.ts` que documenta por qué se eliminó. No hay código que lo use.

## Hallazgo: pruebas que nunca se ejecutaban

`mobile/package.json` no corre `jest` sobre un patrón, sino sobre una **lista fija de
22 archivos**. `src/domain/operations/build-operational-unit-snapshot.test.ts` **nunca
estuvo en esa lista**. Verificado: `npm test` reportaba 21 suites antes y después de
borrarlo, y `jest --listTests` confirma que el archivo sí era detectable.

Esto significa que la "prueba contractual del snapshot" que las iteraciones anteriores
de esta RC citaban como evidencia **no se estaba ejecutando**. Cualquier archivo de
prueba nuevo tampoco correrá si no se añade explícitamente a esa lista.

## Validaciones — ejecutadas en esta iteración

| Validación | Comando | Resultado |
|---|---|---|
| Mobile TypeScript | `cd mobile && npm run typecheck` | **Pasa**, sin salida |
| Mobile ESLint | `cd mobile && npm run lint` | **Pasa**, sin salida |
| Mobile Jest | `cd mobile && npm test` | **Pasa.** 21 suites, 101 pruebas |
| Backend | `cd backend && npm test` | **Pasa.** 20 archivos encadenados |
| Portal TypeScript | `cd ventas && npm run typecheck` | **Pasa** |
| Portal build | `cd ventas && npm run build` | **Pasa** en 22,05 s |
| Higiene de diff | `git diff --check` | **Pasa** |

En el camino ESLint detectó que `mapData` y `LiveLocationsData` habían quedado sin uso
en `incidents-screen.tsx`. Se eliminaron: es la señal de que la migración fue real y no
un cambio de nombres.

## Sigue pendiente

- `use-point-to-point-tracker.ts` y `utils/active-route.ts` recalculan progreso, desvío
  y ETA en el cliente.
- `users-screen.tsx`.
- Portal completo: dashboard, mapa, unidades, rutas e incidencias.
- `etaMinutes` en el esquema y serializadores del backend, y en los `types/app.ts` de
  ambos clientes.
- Fases 3, 4 y 5.
- **Nada verificado contra la base de datos real ni en dispositivo.**
