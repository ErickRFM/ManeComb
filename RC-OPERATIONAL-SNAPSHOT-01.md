# RC-OPERATIONAL-SNAPSHOT-01

## Resultado ejecutivo

Se confirmó que ManeComb no tenía una única fuente de verdad operacional. El estado de una unidad se derivaba de forma independiente en backend, mapa móvil, Bottom Sheet, Checklist y portal web.

Esta fase deja preparada una fuente canónica, sin conectarla todavía a ninguna pantalla:

- Contrato inmutable `OperationalUnitSnapshot`.
- Adaptador puro `buildOperationalUnitSnapshot`.
- Pruebas contractuales de precedencia y aislamiento por unidad.

No se migró ningún consumidor. Por tanto, esta RC no altera todavía los cálculos visibles existentes; crea el punto arquitectónico al que deberán migrarse incrementalmente.

## Alcance inspeccionado

La búsqueda estática abarcó:

- `backend/src`
- `mobile/src`
- `ventas/src`
- `ventas/features/portal`

Se buscaron modelos, serializadores, endpoints, servicios, stores, sockets, hooks, selectores, helpers y componentes que producen o consumen:

- estado, disponibilidad y acciones;
- GPS, ubicación, velocidad y conectividad;
- ruta, ETA, progreso y checkpoints;
- conductor, jornada y último evento;
- incidencias y alertas;
- productividad, distancia, vueltas, tiempo activo y detenido;
- historial.

## 1. Inventario de fuentes de verdad

### Backend — datos persistidos y cálculos oficiales

| Archivo | Símbolo o responsabilidad | Produce |
|---|---|---|
| `backend/src/data/models.js` | Modelos de unidad, jornada, posiciones, eventos y visitas | Estado persistido de vehículo, sesión, eventos, métricas y checkpoints. |
| `backend/src/data/mongo-store.js` | Persistencia Mongo | Lectura/escritura de las entidades operacionales. |
| `backend/src/data/store.js` | Store en memoria/contrato de persistencia | Misma información para ejecución embebida y pruebas. |
| `backend/src/data/repositories/session-repository.js` | Repositorio de sesiones | Sesión activa e historial por unidad. |
| `backend/src/data/serializers.js` | Serialización pública de vehículo | Inicializa `activeRouteProgress` y `etaMinutes`, entre otros campos. |
| `backend/src/modules/locations/routes.js` | `/locations/live` y actualización de posición | Vehículos en vivo, `gpsFreshness`, posición y actualización de progreso. |
| `backend/src/services/tracking-time.js` | `buildGpsFreshness` | Estado fresco/vencido/ausente según timestamp. |
| `backend/src/services/route-progress.js` | Proyección sobre polyline | Progreso, distancia restante, tiempo restante, ETA, desvío y checkpoint virtual. |
| `backend/src/services/route-event-engine.js` | Motor de eventos | GPS perdido/recuperado, fuera/en ruta, detenido/en movimiento y checkpoint alcanzado. |
| `backend/src/services/route-metrics-engine.js` | Consolidación terminal | Distancia, duración, tiempo detenido, vueltas, checkpoints, productividad y cobertura GPS. |
| `backend/src/modules/navigation/routes.js` | Endpoints de rutas y jornadas | Transiciones de sesión, historia, eventos, posiciones, visitas y métricas. |
| `backend/src/modules/vehicles/routes.js` | CRUD de unidades | Estado administrativo `available`/`maintenance` y reglas de mutación. |
| `backend/src/sockets/index.js` | Publicación de eventos | Posiciones, unidad, sesión e incidencias en tiempo real. |

### Mobile — modelos, store y adaptadores existentes

| Archivo | Símbolo o responsabilidad | Produce o transforma |
|---|---|---|
| `mobile/src/types/app.ts:623-655` | `Vehicle` | Estado, ETA, demora, GPS, ruta, conductor y progreso en una sola entidad mutable. |
| `mobile/src/types/app.ts:733-875` | `RouteSession`, `RouteEvent` | Segunda taxonomía de estado y eventos operacionales. |
| `mobile/src/types/app.ts:1040-1053` | `FleetControlLog` | Tercera taxonomía: active/completed/cancelled/delayed. |
| `mobile/src/store/root-store.ts:1760-1805` | `refreshAll` | Carga ubicaciones, incidencias, sesión activa e historial. |
| `mobile/src/store/root-store.ts:1249-1325` | listeners Socket.IO | Mezcla incremental de vehículos y reemplazo de `activeRouteSession`. |
| `mobile/src/utils/navigation-data.ts` | normalizadores | Normaliza ubicación, ruta y asignación. |
| `mobile/src/utils/active-route.ts` | `buildActiveRouteSnapshot`, `buildRouteProgressSnapshot` | Cuarta representación: estado y progreso de ruta calculados localmente. |
| `mobile/src/hooks/use-point-to-point-tracker.ts` | `trackerStatus`, `routeProgress` | Quinta máquina de estado, temporal y local al hook. |
| `mobile/src/hooks/point-to-point-tracker-core.ts` | transiciones del tracker | Inicio, llegada, desvío y cierre local. |
| `mobile/src/services/route-session-actions.ts` | acciones de jornada | Valida y ejecuta start/pause/resume/finish. |

### Mobile — consumidores que vuelven a interpretar

| Superficie | Archivo | Interpretación propia |
|---|---|---|
| Mapa | `mobile/src/screens/map-screen.native.tsx` | Jornada desde `activeRouteSession`; GPS del dispositivo; selección desde ubicaciones. |
| Selectores del mapa | `mobile/src/screens/map/utils/tracking.ts` | Unidad rastreable = estado activo + GPS fresco; ruta activa = `status === 'on-route'`. |
| Bottom Sheet | `mobile/src/screens/map/components/BottomTrackingPanel.tsx` | Sesión activa domina estado; GPS desde vehículo; ETA desde `etaMinutes`; actualización con tres fallbacks. |
| Selector de sesión del panel | `mobile/src/screens/map/components/bottom-tracking-panel-data.ts` | Busca RUNNING/PAUSED en sesión global o historial. |
| Checklist | `mobile/src/screens/checklist-screen.tsx:98-184` | Estado desde log o vehículo; ETA recalculada; salida actual mezclada con último log. |
| Modal de ruta | `mobile/src/screens/checklist-screen.tsx`, `use-point-to-point-tracker.ts` | Estado, ETA, progreso y checkpoints desde tracker local. |
| Incidencias | `mobile/src/screens/incidents-screen.tsx:217-236` | Contexto GPS de la unidad del conductor y ciclo de vida de incidencias. |
| Usuarios/tarjetas | `mobile/src/screens/users-screen.tsx` | Ruta resuelta con otro orden de fallbacks. |

### Portal web — modelos, store y consumidores

| Archivo | Símbolo o responsabilidad | Produce o interpreta |
|---|---|---|
| `ventas/src/types/app.ts` | Tipos duplicados de Vehicle/RouteSession | Contrato similar pero independiente del móvil. |
| `ventas/features/portal/store/use-portal-store.ts` | Store público del portal | Carga cuenta e incidencias; el dashboard consulta operación por separado. |
| `ventas/features/portal/api.ts` | Reexport de APIs | Sesiones, métricas, posiciones, eventos y checkpoints. |
| `ventas/features/portal/utils/tracking.ts` | `isVehicleGpsFresh` | Segunda implementación frontend de frescura GPS. |
| `ventas/features/portal/screens/portal-dashboard-screen.tsx:96-301` | Helpers del centro de operaciones | Calcula estado, conductor, ruta, GPS, jornada, ETA, progreso, métricas y alertas. |
| `ventas/features/portal/screens/portal-dashboard-screen.tsx:422-454` | Conteos y KPIs | Recalcula activas, detenidas, fuera de ruta, GPS perdido, productividad y distancia. |
| `ventas/features/portal/components/operations-map.tsx:60-68` | Marcadores | Vuelve a decidir conductor, desvío, GPS y estado visual de unidad. |
| `ventas/features/portal/screens/portal-units-screen.tsx` | Gestión de unidades | Presenta estado/asignación desde el vehículo. |
| `ventas/features/portal/screens/portal-routes-screen.tsx` | Catálogo y asignación | Llama “En jornada” a una unidad por tener ruta asignada. |
| `ventas/features/portal/screens/portal-incidents-screen.tsx` | Incidencias | Estado y severidad independientes, sin snapshot de unidad. |

## 2. Mapa de dependencias actual

```text
Mongo / store interno
  ├─ Vehicle ───────────────┐
  ├─ RouteSession ──────────┤
  ├─ RouteEvent ────────────┤
  ├─ CheckpointVisit ───────┤
  └─ Incident ──────────────┤
                            v
Backend services + serializers
  ├─ /locations/live ───────────> mobile mapData ──> mapa / panel / checklist
  ├─ /navigation/sessions ───────> stores + consultas locales ──> panel / checklist / portal
  ├─ /incidents ─────────────────> stores independientes ──> mapa / incidencias / portal
  └─ Socket.IO ──────────────────> merges parciales por runtime

Cada consumidor vuelve a combinar las ramas con una precedencia diferente.
```

### Quién calcula y cuántas implementaciones se localizaron

| Dato | Productor oficial | Derivaciones frontend independientes localizadas | Consumidores principales |
|---|---|---:|---|
| Estado de unidad/jornada | Vehicle + RouteSession | 7 | Mapa, HUD, panel, Checklist, portal dashboard, unidades, rutas. |
| GPS/frescura | `buildGpsFreshness` backend | 5 | Mapa, panel, incidencias, portal, marcadores. |
| Ruta/etiqueta | Route + AssignedRoute | 6 | Mapa, panel, Checklist, usuarios, dashboard, rutas. |
| ETA | `activeRouteProgress.etaAt` y legado `etaMinutes` | 4 | Panel, Checklist, modal y portal. |
| Progreso | `route-progress.js` | 3 | Mapa/ruta activa, tracker local y portal. |
| Conductor efectivo | Vehicle + RouteSession | 5 | Panel, Checklist, usuarios, mapa portal y dashboard. |
| Checkpoints | progreso, visitas y métricas | 4 | Modal, historial móvil, portal y backend terminal. |
| Incidencias activas | Incident | 3 | Mapa rotatorio, pantalla de incidencias y portal. |
| Último evento | RouteEvent | 2 | Portal detalle e historial; ausente en snapshot actual móvil. |
| Productividad | motor de métricas | 2 | Historial/panel y KPIs portal. |
| Distancia | sesión/métricas | 3 | Panel, Checklist tracker y portal. |
| Vueltas | sesión/métricas + tracker local | 3 | Historial móvil, tracker y portal. |
| Tiempo detenido | sesión/métricas + velocidad actual | 3 | Panel, filtro “detenidas” y portal. |
| Acciones | servicio de jornada + condiciones UI | 3 | Controles mapa, modal Checklist y portal. |

Los conteos son implementaciones estáticas distintas, no número de renders. El recálculo en runtime crece con cada render, actualización GPS o evento Socket.IO de cada consumidor montado.

## 3. Duplicaciones y transformaciones innecesarias

1. Tipos operacionales duplicados entre `mobile/src/types/app.ts` y `ventas/src/types/app.ts`.
2. Frescura GPS calculada en backend y reinterpretada en dos runtimes frontend.
3. Estado actual derivado desde Vehicle, RouteSession, FleetControlLog y tracker local.
4. ETA expresada como timestamp persistido, minutos relativos y duración local.
5. Ruta resuelta desde `routeId`, `route`, `assignedRoute`, `routeName` y `routeCode` con órdenes distintos.
6. Conductor resuelto desde sesión, `driverId`, objeto `driver`, `driverName` y usuarios asociados.
7. Sesión activa recuperada mediante objeto global, historial filtrado y consulta puntual.
8. Métricas terminales reformateadas por panel móvil y portal.
9. Checkpoint usado para dos conceptos: división virtual de polyline y parada planificada.
10. La UI calcula acciones desde estados locales en vez de recibir capacidades resueltas.

## 4. Inconsistencias demostradas

| Caso | Productores en conflicto | Por qué ocurre | Impacto |
|---|---|---|---|
| “En jornada” vs “Disponible” | RouteSession RUNNING vs fallback de Checklist | No comparten selección de sesión activa. | Decisión operativa incorrecta. |
| “En jornada” vs contador 0 | sesión RUNNING vs `vehicle.status === 'on-route'` | Taxonomías diferentes. | KPI contradice el detalle. |
| “Asignada” vs “En jornada” | Portal dashboard usa conductor; rutas usa asignación de ruta | Asignación se confunde con ejecución. | Estado inflado sin salida real. |
| “Finalizada” vs “Disponible” | última sesión terminal vs Vehicle actual | Historial se usa como estado presente en algunos fallbacks. | Pasado contaminando presente. |
| “GPS actualizado” vs “Sin GPS” | GPS del dispositivo vs GPS de unidad | El HUD usa otro sujeto con la misma etiqueta. | Diagnóstico equivocado. |
| “En ruta” con GPS vencido | Checklist ignora frescura | Estado de jornada y salud de telemetría se colapsan. | Unidad aparentemente visible sin señal válida. |
| ETA distinta por pantalla | `etaAt`, `etaMinutes`, `Date.now()+etaMinutes` y tracker | Cuatro fuentes/referencias temporales. | La promesa de llegada cambia al navegar. |
| Ruta/nombre distintos | Cinco representaciones de ruta | Cada helper aplica fallback propio. | Geometría y etiqueta pueden no corresponder. |
| Conductor distinto | Sesión vs asignación de vehículo | No existe resolución de conductor efectivo. | Reasignaciones ambiguas. |
| “Detenida” vs “Pausada” | velocidad ≤ umbral vs sesión PAUSED | Estado físico y estado de jornada mezclados. | Excepción operacional mal clasificada. |
| Progreso distinto | progreso backend vs proyección local | Dos relojes y dos posiciones de referencia. | ETA/checkpoints saltan entre vistas. |
| Checkpoints distintos | checkpoints virtuales vs paradas vs visitas | Un término representa tres entidades. | Totales incomparables. |
| Incidencia ausente | pantalla dedicada vs tarjeta/checklist | No hay resumen activo por unidad. | El estado no incorpora la excepción. |
| Última actualización engañosa | timestamp GPS vs `updatedAt` vs sync global | Fallbacks semánticamente incompatibles. | Posición vieja parece reciente. |
| Acciones contradictorias | sesión global vs tracker local | Cada superficie habilita por su propio estado. | Posibles dobles inicios o controles inválidos. |

## 5. Diseño de `OperationalUnitSnapshot`

### Contrato implementado

```text
OperationalUnitSnapshot
├─ identity: id, unitNumber, plate
├─ status: code, reason
├─ availability
├─ gps: state, ageMs
├─ location: point, recordedAt, heading, speedMetersPerSecond
├─ route: id, code, name
├─ routeProgress
│  ├─ percent
│  ├─ remainingDistanceMeters
│  ├─ remainingTimeSeconds
│  ├─ etaAt
│  ├─ checkpointCount / current / next
│  ├─ isOffRoute
│  └─ measuredAt
├─ driver
├─ activeJourney
├─ journeyMetrics
│  ├─ activeTimeSeconds
│  ├─ stoppedTimeSeconds
│  ├─ distanceMeters
│  ├─ completedLaps
│  └─ productivityPercent
├─ incidents
├─ lastEvent
├─ lastUpdateAt
└─ actions
```

### Justificación campo por campo

| Campo | Justificación | Exclusión de redundancia |
|---|---|---|
| `id` | Correlación estable por unidad. | No replica Vehicle completo. |
| `unitNumber` | Identificador operacional visible. | Sustituye variaciones code/unitNumber. |
| `plate` | Identidad legal secundaria. | Nullable; no inventa fallback. |
| `status.code` | Estado canónico de jornada/unidad. | Una sola taxonomía. |
| `status.reason` | Explica la fuente/precedencia sin texto UI. | Evita recalcular por pantalla. |
| `availability` | Capacidad actual para asignación. | No se deduce visualmente de jornada. |
| `gps` | Salud y edad de telemetría de la unidad. | No mezcla GPS del teléfono. |
| `location` | Último fix como par coordenada-timestamp. | No permite sustituirlo con `updatedAt`. |
| `route` | Identidad resuelta de ruta actual. | No expone cinco variantes. |
| `routeProgress` | Progreso vigente y medido en un instante. | ETA, distancia y checkpoint comparten medición. |
| `driver` | Conductor efectivo resuelto. | No expone simultáneamente todos los fallbacks. |
| `activeJourney` | Sesión no terminal de esa unidad. | Excluye historial. |
| `journeyMetrics` | Acumulados de la jornada activa. | No incluye series ni sesiones pasadas. |
| `incidents` | Solo incidencias activas de la unidad. | El detalle histórico permanece fuera. |
| `lastEvent` | Último cambio operacional explicable. | No duplica lista de eventos. |
| `lastUpdateAt` | Recencia global del snapshot. | No se presenta como “última posición”. |
| `actions` | Capacidades ya resueltas. | La UI no infiere permisos/transiciones. |

No se incluyeron `alerts`, `connectivity` ni `trackingHealth` como campos separados porque duplicarían `status`, `gps`, `routeProgress.isOffRoute` e `incidents`.

### Reglas de precedencia implementadas

1. Sesión no terminal más reciente de la unidad domina `status`.
2. Una sesión terminal nunca define el presente.
3. Sin sesión activa, se normaliza `Vehicle.status`.
4. GPS exige ubicación y `locationTimestamp` como par.
5. Ruta se resuelve por asignación, catálogo y vehículo en orden estable.
6. Incidencias se filtran por `vehicleId` y solo `open`/`in_progress`.
7. Eventos se filtran por unidad y, si existe, por sesión activa.
8. Acciones son entrada explícita ya autorizada; el adaptador no inventa permisos.

## 6. Clasificación exclusiva de información

Cada dato pertenece a una sola categoría de responsabilidad:

| Categoría | Información |
|---|---|
| Estado actual | `status`, `availability`, `gps`, `location`, `route`, `driver`, `activeJourney`, `incidents`, `lastEvent`. |
| Información histórica | Excluida del snapshot; `RouteSession` terminal, posiciones, visitas y eventos completos viven en historial. |
| Información calculada | `routeProgress`, `journeyMetrics`, `lastUpdateAt`, `actions`. |
| Información persistida | Inputs de identidad y referencias: id, número, placa, ids de ruta/sesión/conductor e incidencia. El adaptador los proyecta, no los vuelve a almacenar. |
| Información temporal | `gps.ageMs` y los timestamps de medición. Se calculan contra `now` inyectable. |

La clasificación describe responsabilidad. El snapshot es una proyección inmutable y no crea una segunda persistencia.

## 7. Responsabilidad única por pantalla

| Pantalla | Responsabilidad | Consume del snapshot |
|---|---|---|
| Mapa | Ver ubicación y excepciones espaciales. | location, route, progress, GPS, desvío, incidentes. |
| Bottom Sheet | Resumen y controles de la unidad seleccionada. | Identidad, estado, conductor, ETA, evento, acciones. |
| Checklist | Comparar unidades y detectar intervención. | Mismos estados y alertas, en formato compacto. |
| Portal | Supervisión detallada de flota en tiempo real. | Colección de snapshots; no helpers locales. |
| Dashboard | Agregados ejecutivos. | Reduce snapshots actuales; métricas históricas vienen del historial, separadas. |
| Historial | Evidencia de jornadas terminales. | No usa snapshot para reconstruir sesiones pasadas. |
| Incidencias | Gestión del ciclo de vida de excepciones. | Snapshot solo enlaza incidencias activas; detalle desde Incident. |
| Rutas | Definición y asignación planificada. | Snapshot indica asignación actual, no sustituye catálogo/editor. |

## 8. Arquitectura objetivo

```text
API + Socket.IO + cache local
           │
           v
   Operational inputs adapter
           │
           v
 buildOperationalUnitSnapshot   (función pura, una unidad)
           │
           v
 OperationalUnitSnapshot[]
           │
     ┌─────┴───────────┐
     v                 v
 selectors de flota   selector por vehicleId
     │                 │
     └───────┬─────────┘
             v
        UI solo renderiza
```

Principios:

- El adapter conoce los contratos de transporte; la UI no.
- El snapshot no contiene JSX, estilos, textos localizados ni dependencias de Mapbox.
- Los selectors pueden agregar/filtrar, pero no reinterpretar campos.
- El tiempo se inyecta para pruebas deterministas.
- El store público actual no se modifica en esta fase.

## 9. Estrategia incremental de migración

### Etapa 0 — completada en esta RC

- Crear contrato, builder puro y pruebas.
- No registrar el snapshot en stores públicos.
- No cambiar consumidores.

### Etapa 1 — Mapa

- Construir snapshots junto a `mapData` mediante selector privado.
- Comparar en telemetría interna resultado antiguo/canónico.
- Migrar marcadores y conteos una propiedad a la vez.
- Mantener rollback por selector anterior.

### Etapa 2 — Bottom Sheet

- Sustituir `selectVehicleActiveSession` y fallbacks por snapshot seleccionado.
- Mantener historial en su modelo propio.
- Migrar acciones solo después de paridad de estado.

### Etapa 3 — Checklist

- Reemplazar `OperationalRecord` actual por proyección del snapshot.
- Separar definitivamente último historial de jornada actual.
- Hacer que el tracker publique entradas al adapter, no un modelo visual alterno.

### Etapa 4 — Portal

- Extraer el contrato canónico a un paquete compartido consumible por RN y Vite, conservando una sola definición.
- Reemplazar helpers de `portal-dashboard-screen.tsx` gradualmente.
- Migrar mapa, panel y KPIs actuales; los KPIs históricos siguen usando sesiones.

### Etapa 5 — Dashboard, historial e incidencias

- Reducir snapshots para agregados actuales.
- Mantener historial fuera del snapshot.
- Enlazar incidencias activas sin duplicar su detalle.

### Criterio de retiro

Ningún helper anterior se elimina hasta tener pruebas de paridad por fixture, transición y rol. No se realizará un Big Bang.

## 10. Riesgos y mitigaciones

| Riesgo | Severidad | Mitigación |
|---|---|---|
| Doble cálculo durante migración | Media | Memoización por versiones de input y comparación temporal limitada. |
| Renders masivos con miles de unidades | Alta | Snapshot por unidad, identidad estable, selectores indexados y actualización estructural compartida. |
| Relojes cliente/servidor distintos | Alta | Usar timestamps normalizados y `now` de referencia; no recalcular ETA desde minutos en UI. |
| Evento Socket parcial | Alta | Reconciliar por `vehicleId` y versión/timestamp antes de producir snapshot. |
| Sesión global para varias unidades | Alta | Introducir índice privado de sesiones por vehículo antes de migrar supervisión. |
| Progreso vencido | Alta | Validar `measuredAt` y ruta/sesión asociadas. |
| Confundir paradas con checkpoints | Alta | Tipos y nombres distintos en contrato futuro. |
| Duplicación RN/Vite | Alta | Extraer contrato a paquete compartido en la etapa Portal; no copiarlo. |
| Acciones demasiado permisivas | Crítica | El adapter recibe acciones autorizadas; RBAC y servicio siguen siendo autoridad. |
| Historial mezclado con presente | Alta | El snapshot rechaza sesiones terminales como activas. |
| Memoria por eventos/incidencias | Media | Pasar solo último evento e incidencias activas; no series completas. |

## 11. Archivos modificados

### Creados

- `mobile/src/domain/operations/operational-unit-snapshot.ts`
- `mobile/src/domain/operations/build-operational-unit-snapshot.ts`
- `mobile/src/domain/operations/build-operational-unit-snapshot.test.ts`
- `RC-OPERATIONAL-SNAPSHOT-01.md`

### No modificados

- Backend completo.
- Stores públicos.
- Hooks públicos.
- Servicios públicos.
- APIs y Socket.IO.
- Componentes React/React Native.
- Mapbox, CSS, layout y diseño.

El repositorio ya contenía cambios ajenos a esta RC; se preservaron y no se incorporaron a la implementación.

## 12. Evidencia de validación

| Validación | Resultado |
|---|---|
| TypeScript móvil | **PASS** — `tsc --noEmit`. |
| TypeScript portal | **PASS** — `tsc --noEmit`. |
| Pruebas contractuales nuevas | **PASS** — 2/2. |
| Pruebas móviles existentes | **PASS** — 21 suites, 99 pruebas. |
| Pruebas backend | **PASS** — suite completa. |
| Build portal Vite | **PASS** — 465 módulos. |
| Build Android | **OMITIDO por instrucción del usuario** debido a su duración; no se certifica en esta RC. |
| `git diff --check` | **PASS**; los archivos nuevos también se verificaron contra whitespace final. |
| Cambios visuales | **CERO** — no se modificaron ni conectaron componentes. |
| Cambios funcionales | **CERO** — ningún consumidor importa todavía el nuevo dominio. |

Observaciones ajenas a la RC durante el build web:

- `TOKEN_EMPTY` para Mapbox en el entorno local de build.
- Advertencia de chunks Vite superiores a 500 kB.

No se actuó sobre ninguna de ellas.

## Confirmación final

- **NO cambió la UI.**
- **NO cambió Mapbox.**
- **NO cambió ningún componente React Native.**
- **NO cambió el Portal.**
- **NO cambió la lógica operacional existente.**
- **NO se migró ninguna pantalla.**
- **NO se modificaron backend, API REST, Socket.IO, MongoDB, schemas, stores o hooks públicos.**

La infraestructura nueva es aditiva, pura y todavía no consumida. Su siguiente uso seguro es una migración del mapa con pruebas de paridad, no un reemplazo global.
