# RC-MOBILE-OPERATIONS-INFORMATION-MODEL-01

## Alcance y dictamen

Esta auditoría es exclusivamente del modelo de información móvil. No se modificó código, UI, backend, APIs, stores, hooks ni lógica operacional.

**Dictamen:** el sistema no dispone hoy de una única representación de una unidad operacional. Existen al menos cuatro autoridades parciales que compiten entre sí:

1. `Vehicle.status` y los datos en vivo de `/locations/live`.
2. `RouteSession.status` y su historial.
3. `FleetControlLog.status`, adaptado en Checklist desde sesiones.
4. `trackerStatus` y `routeProgress`, calculados localmente por `usePointToPointTracker`.

Cada pantalla aplica precedencias y fallback distintos. Por ello dos vistas pueden ser internamente coherentes y, aun así, contradecirse entre sí. La causa raíz del problema cognitivo no es visual: **no existe un selector canónico que produzca un solo snapshot operacional por unidad**.

## Evidencia técnica principal

| Evidencia | Ubicación | Consecuencia |
|---|---|---|
| `Vehicle` contiene estado, ETA, demora, GPS, ruta y progreso persistido | `mobile/src/types/app.ts:623-655` | Es una fuente rica, pero sus campos se solapan con sesiones y tracker. |
| `RouteSession` define `ASSIGNED`, `READY`, `RUNNING`, `PAUSED`, `FINISHED`, `CANCELLED` | `mobile/src/types/app.ts:733-792` | Es otra autoridad de estado de jornada. |
| Los eventos ya modelan GPS, checkpoints, desvío y movimiento | `mobile/src/types/app.ts:735-746`, `863-875` | Existe información operacional que las vistas actuales no presentan de forma uniforme. |
| `LiveLocationsData` agrupa rutas, vehículos e incidencias | `mobile/src/types/app.ts:981-990` | Alimenta mapa e incidencias, pero no resuelve la jornada por unidad. |
| El refresh global solicita la jornada activa solo para `user.vehicleId` | `mobile/src/store/root-store.ts:1760-1805` | Para supervisores, la jornada de otra unidad depende del historial o de consultas locales de cada pantalla. |
| Un evento `route-session:updated` reemplaza el único `activeRouteSession` global | `mobile/src/store/root-store.ts:1322-1325` | El store representa una sesión activa global, no un índice canónico por vehículo. |
| Checklist mantiene un tracker local con su propio estado y progreso | `mobile/src/hooks/use-point-to-point-tracker.ts:141-210` | Puede divergir del estado del mapa y de la sesión del servidor. |

## Fase 1 — Inventario completo por superficie

### 1. Mapa móvil

**Qué muestra**

- Posición de unidades con coordenadas y `locationTimestamp`.
- Ruta asignada/seleccionada, marcadores de unidad e incidencias georreferenciadas.
- Conteo de rutas activas.
- Estado GPS en el HUD.
- Unidad seleccionada y acceso al panel inferior.
- Controles de jornada para conductor.

**Qué estado representa**

- La inclusión espacial usa existencia de posición.
- El conjunto de unidades “en seguimiento” exige estado activo (`online`, `patrolling`, `on-route`) y GPS fresco.
- El conteo de rutas usa exclusivamente `vehicle.status === 'on-route'`.
- Los controles de jornada usan `activeRouteSession.status`.

**De dónde proviene**

- `mapData` del endpoint de ubicaciones en vivo.
- `activeRouteSession` y `routeSessionHistory` del store.
- GPS del teléfono desde `deviceLocation`.
- Selectores en `mobile/src/screens/map/utils/tracking.ts` y `useTrackingData`.

**Duplicación o variación**

- Checklist vuelve a expresar estado, ruta y ETA con reglas diferentes.
- El panel inferior vuelve a calcular estado y GPS.
- El HUD etiqueta como “GPS” el GPS del dispositivo; el panel etiqueta como “GPS” el de la unidad.

### 2. Seguimiento y panel inferior (`BottomTrackingPanel`)

**Qué muestra**

- Unidad, estado, GPS, velocidad, ruta, conductor, placas, ocupación, combustible, odómetro, ETA en minutos, demora, tiempo activo y distancia.
- Alerta activa.
- Selector de unidad.
- Historial de sesiones y métricas agregadas.

**Qué estado representa**

- Busca una sesión `RUNNING` o `PAUSED` de la unidad seleccionada.
- Si existe, la sesión domina: `PAUSED` → “Pausada”; `RUNNING` → “En jornada”.
- Si no existe, muestra `Vehicle.status` traducido.

**De dónde proviene**

- `selectedVehicle` desde `mapData.vehicles`.
- Sesión activa global o `routeSessionHistory` mediante `selectVehicleActiveSession`.
- Historial y métricas desde `RouteSession`.

**Duplicación o variación**

- ETA usa `vehicle.etaMinutes`; Checklist y el modal de ruta calculan ETA de otra forma.
- “Última actualización” usa `locationTimestamp || vehicle.updatedAt || lastSyncedAt`, mezclando última posición, actualización de entidad y sincronización global (`BottomTrackingPanel.tsx:222-224`).
- El estado de sesión puede decir “En jornada” mientras el contador superior no la considera ruta activa.

### 3. Checklist / control operativo

**Qué muestra**

- Tarjetas por unidad: unidad, conductor, estado, última ruta terminal, salida, llegada/ETA y ruta.
- Filtros “Historial”, “En ruta”, “Finalizadas”, “Canceladas” y “Rutas”.
- Modal de ruta con planeación, seguimiento, progreso, ETA, checkpoints y desvío.

**Qué estado representa**

- Prioriza un `FleetControlLog` activo o demorado.
- Si no existe, infiere actividad desde `Vehicle.status`.
- Si no coincide, presenta la unidad como “Disponible”.
- Dentro del modal, deja de usar esa regla y usa el `trackerStatus` local.

**De dónde proviene**

- `mapData.vehicles`.
- `routeSessionHistory` adaptado a `FleetControlLog`.
- Consulta adicional de sesión activa para la unidad seleccionada.
- `buildActiveRouteSnapshot` y `usePointToPointTracker`.

**Duplicación o variación**

- El filtro llamado “Historial” muestra registros operacionales actuales por vehículo, no exclusivamente sesiones históricas.
- La salida puede venir del último log terminal aun cuando la unidad ya está disponible (`checklist-screen.tsx:156-181`).
- No incorpora frescura GPS al decidir “En ruta” o “Disponible”.
- El modal usa un estado local diferente del estado mostrado en la tarjeta.

### 4. Tarjetas operacionales

**Qué muestran**

- Un resumen de identidad, conductor, estado, tiempos y ruta.

**Qué estado representan y origen**

- Son la proyección de `OperationalRecord`, construida con `Vehicle` más logs derivados de sesiones.

**Duplicación o variación**

- Repiten estado, ruta y ETA del panel inferior, pero no comparten selector ni reglas.
- No muestran GPS ni incidencias; por ello una tarjeta puede parecer operativa aunque el mapa indique falta de telemetría.

### 5. Historial

**Qué muestra**

- Sesiones terminadas o canceladas, tiempos, distancia, movimiento, detenciones, pausas, velocidad, checkpoints, vueltas, GPS, desvíos, odómetros, batería y razón de cierre.

**Qué estado representa**

- Estado terminal y métricas consolidadas de una `RouteSession`.

**De dónde proviene**

- `routeSessionHistory`, solicitado con límite 500.
- Métricas directas y computadas de `RouteSession`.

**Duplicación o variación**

- Checklist reutiliza este historial para inferir la fila actual.
- El panel inferior conserva una vista histórica distinta, con diferente densidad y nomenclatura.
- El historial terminal se usa como fallback de salida/llegada de una unidad actual, mezclando presente con pasado.

### 6. Rutas

**Qué muestra**

- Ruta asignada, origen, destino, paradas, polyline, distancia y duración.
- En el modal de Checklist: planeación, guardado, asignación y seguimiento local.

**Qué estado representa**

- La ruta planificada y asignada, más un progreso calculado localmente cuando el tracker está activo.

**De dónde proviene**

- `Vehicle.routeId`, `Vehicle.route`, `Vehicle.assignedRoute`, `routeName`, `routeCode` y el catálogo `mapData.routes`.

**Duplicación o variación**

- Hay múltiples representaciones de una misma ruta y distintos órdenes de fallback según la vista.
- El progreso puede provenir de `vehicle.activeRouteProgress`, de una proyección local o del tracker del modal.

### 7. Incidencias

**Qué muestra**

- Tipo, severidad, estado, unidad, ruta, ubicación, archivos y acciones de resolución.

**Qué estado representa**

- Ciclo de vida propio de la incidencia: abierta, en progreso o resuelta.

**De dónde proviene**

- Lista de incidencias del store y `mapData.incidents`.
- Para crear una incidencia, el contexto usa la unidad del conductor y solo adjunta ubicación si su GPS es fresco (`incidents-screen.tsx:217-236`).

**Duplicación o variación**

- El mapa rota incidencias visibles globales; el panel muestra una alerta activa, no necesariamente un resumen completo y estable de la unidad seleccionada.
- Checklist no refleja incidencias en el estado de sus tarjetas.

## Fase 2 — Modelo operacional único propuesto

Se propone un único `OperationalUnitSnapshot`, generado por un selector compartido y de solo lectura. No implica un nuevo estado de negocio: normaliza los estados ya existentes.

| Campo canónico | Definición exacta | Autoridad y precedencia | Regla de ausencia |
|---|---|---|---|
| Estado | Estado actual de la jornada, separado de alertas de salud | Sesión activa de esa unidad (`RUNNING`/`PAUSED`) → estado operacional normalizado de `Vehicle` → `READY/ASSIGNED` si existe sesión no iniciada | `unknown`, nunca “Disponible” por descarte |
| Ruta | Ruta actualmente asignada a la unidad | `assignedRoute.routeId`/`routeId` resuelto en catálogo → `assignedRoute` → `vehicle.route` | “Sin ruta asignada” |
| ETA | Fecha/hora estimada de llegada | `activeRouteProgress.etaAt` vigente y asociado a la ruta activa | `null`; no inventar una hora en cada render |
| Hora de salida | Inicio real de la jornada actual | `activeSession.startedAt` | `null`; nunca reutilizar la última jornada terminada |
| Tiempo estimado | Duración restante, distinta de ETA absoluta | Progreso canónico de ruta (`timeRemainingSeconds`) | `null` |
| GPS | Salud de telemetría de la unidad | `gpsFreshness.state` validado contra `locationTimestamp` | `missing`; etiquetar el GPS del teléfono como “Mi GPS” |
| Última posición | Coordenada y timestamp del último fix de la unidad | `vehicle.location` + `vehicle.locationTimestamp` como par indivisible | `null`; no sustituir con `updatedAt` o sincronización global |
| Conductor | Conductor efectivo de la jornada | `activeSession.driverId` resuelto → `vehicle.driver` → `vehicle.driverName` | “Sin conductor asignado” |
| Checkpoints | Planeados, alcanzados, actual y siguiente | Definición de ruta + progreso/eventos de la sesión activa | Ceros explícitos solo si la ruta define checkpoints; de otro modo “No aplica” |
| Incidencias | Incidencias activas asociadas a esa unidad | Incidencias `open`/`in_progress` filtradas por `vehicleId` | Lista vacía |
| Último evento | Evento operacional más reciente de la sesión | Último `RouteEvent.timestamp` de la sesión activa | `null`; no sustituir con actualización genérica |
| Progreso | Avance único sobre la ruta activa | Snapshot persistido vigente o una única proyección central compartida | `null`; no presentar 0% como dato real sin ruta |
| Acciones disponibles | Acciones válidas por rol y estado actual | Matriz compartida derivada de rol + sesión + ruta + GPS | Lista vacía con razón explícita |

### Separación obligatoria de dimensiones

Un solo rótulo no debe intentar representar todo. El snapshot debe conservar dimensiones distintas:

- **Jornada:** lista, en curso, pausada, finalizada o cancelada.
- **Telemetría:** fresca, vencida o ausente.
- **Navegación:** en ruta, fuera de ruta, llegada.
- **Excepciones:** retraso e incidencias activas.

La vista puede destacar una dimensión, pero no convertir “Sin GPS” en estado de jornada ni “En ruta” en prueba de GPS saludable.

## Fase 3 — Inconsistencias demostradas

| ID | Vista A | Vista B | Causa exacta | Impacto |
|---|---|---|---|---|
| IM-01 | Checklist: “En ruta” por log activo o `Vehicle.status` | Panel: “Sin GPS”/“GPS vencido” | `getVehicleOperationalStatus` no evalúa `gpsFreshness` | Una unidad parece operacional y rastreable cuando no existe telemetría válida. |
| IM-02 | Checklist: “Disponible” como fallback | Panel/mapa: sesión `RUNNING` recuperada del historial | Checklist y panel no comparten la misma selección de sesión activa | Contradicción directa de estado. |
| IM-03 | HUD: “GPS” del teléfono | Panel: “GPS” de la unidad seleccionada | Dos sujetos bajo la misma etiqueta | El operador no sabe qué dispositivo perdió señal. |
| IM-04 | Contador del mapa: ruta activa solo si `vehicle.status === 'on-route'` | Panel: “En jornada” si hay sesión `RUNNING` | Dos autoridades y dos taxonomías | Conteo 0 mientras una unidad aparece en jornada. |
| IM-05 | Mapa del conductor omite unidades sin GPS fresco del conjunto de seguimiento | Checklist conserva la unidad y puede llamarla disponible/en ruta | Filtro espacial y estado de tarjeta tienen requisitos distintos | La unidad desaparece de una vista y sigue normal en otra. |
| IM-06 | Panel: ETA desde `vehicle.etaMinutes` | Checklist: `activeRouteProgress.etaAt` o `Date.now()+etaMinutes`; modal: tiempo restante local | Tres cálculos/fuentes | ETA cambia al abrir otra vista o con cada render. |
| IM-07 | Checklist muestra salida del último log | Panel actual no muestra salida; historial sí muestra inicio de sesión | `latestLog` se usa incluso sin jornada activa | Un dato histórico parece pertenecer al estado actual. |
| IM-08 | Panel: “Última actualización” | Mapa: posición real | El panel sustituye `locationTimestamp` por `vehicle.updatedAt` o `lastSyncedAt` | Puede reportar actualización reciente con coordenada antigua. |
| IM-09 | Panel: conductor desde objeto anidado/nombre del vehículo | Snapshot de ruta: `driverName/driverId`; sesión tiene `driverId` propio | No hay resolución única del conductor efectivo | Una reasignación puede producir nombres distintos. |
| IM-10 | Modal de ruta: `trackerStatus` local | Tarjeta: log/vehículo; mapa: sesión global | Cuatro máquinas de estado no reconciliadas | Pausar o recuperar una jornada no garantiza el mismo rótulo en todas las vistas. |
| IM-11 | Modal: checkpoints calculados por proyección | Historial: `completedCheckpoints` consolidado | “Checkpoint” designa cálculo en vivo y métrica final sin contrato común | El conteo puede saltar al terminar la jornada. |
| IM-12 | Mapa/panel: una alerta activa rotatoria | Incidencias: lista completa por ciclo de vida; Checklist: ninguna | No existe resumen de incidencias por unidad | El estado operacional ignora una excepción crítica. |
| IM-13 | Mapa usa `vehicle.route`, `routeId` y asignación para elegir geometría | Checklist normaliza `assignedRoute`; tarjetas usan etiqueta resuelta | Orden de fallback diferente | Nombre, código y geometría pueden referirse a rutas distintas. |
| IM-14 | Historial terminal alimenta la fila actual | Modelo actual debería depender de sesión activa | Presente e historial comparten `OperationalRecord` | Estado actual contaminado por datos pasados. |
| IM-15 | Tipos incluyen `RouteEvent` completo | Panel y Checklist no muestran un último evento canónico | El evento no forma parte del snapshot de unidad | Falta explicación de por qué cambió el estado. |

## Fase 4 — Responsabilidad de cada pantalla

### Mapa

Responsabilidad única: **dónde está cada unidad y qué excepción espacial requiere atención**.

Debe mostrar posición, ruta activa, progreso espacial, GPS de la unidad, desvío, incidencias activas y selección. No debe inferir estado actual desde historial ni presentar métricas terminales.

### Panel inferior

Responsabilidad única: **resumen operacional de la unidad seleccionada y acciones inmediatas**.

Debe consumir el mismo snapshot que el mapa. Puede expandir detalles actuales, pero el historial debe ser una vista secundaria y no un fallback del presente.

### Checklist

Responsabilidad única: **comparar rápidamente el estado actual de todas las unidades y detectar qué requiere intervención**.

Cada tarjeta debe ser una proyección del mismo snapshot. No debe crear su propia interpretación de estado, ETA o salida. La gestión de rutas puede seguir accesible, pero sus datos planificados no deben sustituir el estado operacional.

### Historial

Responsabilidad única: **evidencia inmutable de jornadas terminadas o canceladas**.

No debe determinar el estado presente. Solo puede mostrarse junto al presente cuando esté rotulado explícitamente como “última jornada”.

### Rutas

Responsabilidad única: **definición, asignación y topología planificada**.

Debe ser autoridad de geometría, paradas y duración base; no de jornada, GPS, incidencias o conductor efectivo.

### Incidencias

Responsabilidad única: **ciclo de vida y resolución de excepciones**.

El snapshot consume un resumen por unidad; la pantalla de incidencias conserva el detalle y las acciones de gestión.

## Fase 5 — Auditoría específica del Bottom Sheet

### Información faltante

- Progreso actual canónico de ruta.
- ETA absoluta y tiempo restante distinguidos.
- Hora real de salida de la jornada activa.
- Checkpoint actual/siguiente y conteo alcanzado.
- Incidencias activas filtradas por la unidad seleccionada.
- Último evento operacional.
- Estado de desvío.
- Timestamp explícito de última posición, sin fallback genérico.

### Información que sobra o está fuera de responsabilidad

- Historial técnico completo dentro del mismo panel principal; debe permanecer secundario.
- Métricas no críticas para seguimiento inmediato como combustible/ocupación cuando desplazan progreso, ETA o excepciones.
- Aviso de GPS del teléfono mezclado con el GPS de la unidad.
- “Última actualización” si no identifica si corresponde a posición, entidad o sincronización.

### Información que debe estar siempre visible

1. Unidad seleccionada y conductor efectivo.
2. Estado de jornada.
3. Estado GPS de la **unidad** y edad del último fix.
4. Ruta activa.
5. Progreso y ETA, si existen.
6. Excepción prioritaria: fuera de ruta, retraso o incidencia crítica.

### Acciones disponibles sin abandonar el mapa

Reutilizando las acciones actuales y gobernadas por una matriz única:

- Centrar/seguir unidad.
- Iniciar jornada cuando está lista.
- Pausar o reanudar cuando corresponde.
- Finalizar una jornada activa.
- Abrir la incidencia activa de la unidad.
- Abrir detalle de ruta/checkpoints.

No deben aparecer simultáneamente acciones mutuamente excluyentes ni acciones habilitadas por una interpretación local diferente del snapshot.

## Fase 6 — Contrato de Checklist con el mapa

Checklist y mapa deben recibir exactamente el mismo `OperationalUnitSnapshot` por `vehicleId`. La conformidad mínima es:

- Mismo estado principal y mismos modificadores.
- Mismo conductor efectivo.
- Misma ruta identificada por el mismo `routeId` canónico.
- Misma ETA y progreso.
- Mismo estado GPS y mismo timestamp de posición.
- Mismo conteo de incidencias activas.
- Misma sesión activa.

La tarjeta de Checklist puede omitir detalles por densidad, pero **no puede recalcularlos ni reemplazarlos con historial**. Si el mapa dice “En jornada · GPS vencido”, Checklist debe expresar esos mismos dos hechos, no “Disponible” ni solo “En ruta”.

## Fase 7 — Plan de unificación (sin implementación)

### P0 — Autoridad y contrato

1. Definir formalmente `OperationalUnitSnapshot` y la taxonomía normalizada.
2. Crear una tabla de precedencia por campo con casos de ausencia y datos vencidos.
3. Resolver sesiones activas como índice por `vehicleId`, no como un único objeto global para toda la flota.
4. Separar GPS de unidad y GPS del dispositivo en nombres y tipos.
5. Prohibir que historial terminal determine campos actuales.

### P0 — Selector compartido

6. Diseñar un selector puro que reciba vehículo, rutas, sesión activa, progreso, incidencias y último evento.
7. Centralizar resolución de ruta, conductor, última posición, ETA, checkpoints y acciones.
8. Definir vigencia del progreso/ETA para impedir snapshots antiguos.
9. Crear fixtures contractuales para: sin GPS, GPS vencido, lista, en curso, pausada, fuera de ruta, retrasada, con incidencia y finalizada.

### P1 — Migración de consumidores

10. Hacer que mapa, Bottom Sheet y Checklist consuman el snapshot sin reinterpretarlo.
11. Sustituir el estado local del modal como fuente visual por el snapshot; el tracker puede seguir calculando, pero publica al mismo contrato.
12. Usar el historial solo en superficies históricas.
13. Mostrar incidencias actuales como resumen estable por unidad, no como alerta global rotatoria para definir su estado.

### P1 — Validación

14. Añadir pruebas de paridad: el mismo fixture debe producir las mismas etiquetas y valores en mapa, panel y Checklist.
15. Probar transiciones `READY → RUNNING → PAUSED → RUNNING → FINISHED` con GPS fresco, vencido y recuperado.
16. Probar reasignación de ruta/conductor e incidencia durante jornada.
17. Verificar que una actualización de entidad sin nueva coordenada no cambie “última posición”.

### P2 — Claridad semántica

18. Unificar glosario: “jornada”, “ruta”, “seguimiento”, “GPS de unidad”, “Mi GPS”, “checkpoint” y “parada”.
19. Distinguir ETA (hora de llegada) de tiempo restante (duración).
20. Documentar qué campos pueden omitirse por pantalla sin alterar su significado.

## Impacto esperado

| Área | Impacto |
|---|---|
| Operación | Menos decisiones basadas en estados contradictorios. |
| UX | La unidad conserva identidad y estado al cambiar de pantalla. |
| Ingeniería | Una sola regla de negocio de presentación en vez de fallbacks locales. |
| QA | Casos verificables por snapshot y transición, no por pantalla aislada. |
| Soporte | Menor ambigüedad entre problema de GPS, jornada, ruta e incidencia. |
| Riesgo | Medio-alto si se migra todo a la vez; debe hacerse por contrato, fixtures y paridad antes de retirar selectores locales. |

## Prioridad consolidada

- **P0:** estado, sesión activa por unidad, GPS/última posición, ruta, ETA/progreso y separación presente-historial.
- **P1:** conductor, checkpoints, incidencias, último evento y matriz de acciones.
- **P2:** glosario, densidad por pantalla y retiro de duplicaciones informativas.

## Conclusión

La inconsistencia queda demostrada en el código: mapa, panel y Checklist no proyectan una misma entidad operacional; ensamblan versiones distintas con fuentes y precedencias propias. La unificación debe comenzar por el contrato y el selector canónico, no por cambios visuales. Hasta que todas las superficies consuman el mismo snapshot por `vehicleId`, cualquier ajuste de UI solo ocultará contradicciones que seguirán existiendo en el modelo de información.
