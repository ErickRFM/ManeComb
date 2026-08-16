# Autoridad operacional y GPS — corte 2026-08-15

Base exclusiva: `origin/main@edf39a74950b7f9d6141667fe81ea894542f859f`.

Este corte corrige defectos demostrables sin declarar terminadas las once fases. No se cambió la cadencia GPS, no se retiró `location:updated`, no se agregó otro store/socket y no se actualizó el baseline de autoridades.

## Hallazgos cerrados

### Velocidad Portal

**SÍNTOMA** → 38 km/h podía mostrarse como 137 km/h. **CAUSA RAÍZ** → `speedKmh` se proyectaba sobre `Vehicle.speed`, cuyo origen histórico y replay están en m/s, y `formatSpeed` multiplicaba por 3.6. **AUTORIDAD** → `OperationalUnitSnapshot.gps.speedKmh` para operación actual; `RouteSessionPosition.speed` en m/s para replay. **RIESGO** → decisión operativa falsa. **SOLUCIÓN** → el panel consume el snapshot directamente, el replay usa un helper nombrado `formatSpeedMetersPerSecond`, y se eliminó la proyección de velocidad. **REGRESIÓN** → test conductual 38 → `38 km/h` y null → `—`. **GATE FÍSICO** → inspección visual Portal con una unidad real; pendiente.

### Calidad/plausibilidad GPS

**SÍNTOMA** → el filtro devolvía un booleano y mezclaba jitter, heartbeat y mala precisión. **CAUSA RAÍZ** → no existía una decisión explícita con semántica observable. **AUTORIDAD** → medición nativa cruda + última medición estable aceptada. **RIESGO** → teletransportes, pérdida de evidencia causal y timestamps atrasados aplicados. **SOLUCIÓN** → `classifyGpsFix` distingue `accepted`, `heartbeat`, `duplicate`, `out_of_order`, `poor_accuracy`, `implausible_jump` y `degraded`; usa distancia/tiempo, descuenta incertidumbre declarada y conserva 180 km/h como límite de plausibilidad, no como regla de negocio. **REGRESIÓN** → tests de duplicado, heartbeat, orden, precisión degradada/mala y salto imposible. **GATE FÍSICO** → recorridos urbanos, estacionamiento, túnel, background y batería; pendiente. La cadencia sigue en 5 s.

### Presencia

**SÍNTOMA** → un socket sano podía expirar de presencia a los 55 s. **CAUSA RAÍZ** → `presence:join` iniciaba el lease, pero `client:heartbeat` no renovaba `lastPresenceHeartbeatAt`. **AUTORIDAD** → Socket.IO ping/pong para transporte; `presence:join` para alta y rooms; `client:heartbeat` para lease de presencia/RTC; REST para reconciliar snapshot actual. **RIESGO** → falsos offline y tentación de repetir joins costosos. **SOLUCIÓN** → `renewPresenceLease` sólo actualiza el timestamp si el socket ya hizo join; no genera snapshot, rooms ni broadcast. **REGRESIÓN** → prueba conductual de socket joined/unjoined y gate RTC. **GATE FÍSICO** → foreground/background y reconexión en dos dispositivos; pendiente.

## Mapa realtime observado

| señal/estado | productor | consumidor | autoridad válida | decisión de este corte |
|---|---|---|---|---|
| `operational-unit:updated` | `operational-units-service`, freshness sweeper | stores Mobile/Portal | estado operacional actual | conservar como realtime primario |
| `location:updated` | ingestion y mutaciones legacy de navegación/usuarios | `vehicles`/`mapData` Mobile y Portal | compatibilidad/metadata legacy | no retirar: aún tiene consumidores necesarios |
| `operationalUnits` | REST canónico + evento anterior | mapa/paneles Mobile y Portal | posición, freshness, conexión, velocidad, conductor, ruta, progreso, ETA | converger consumidores aquí |
| `vehicles` | endpoints fleet + eventos legacy | configuración, identidad y joins UI | entidad relativamente estática | dejar de proyectar velocidad; quedan proyecciones por retirar incrementalmente |
| `mapData` | REST live-locations + eventos legacy | rutas, incidentes y varios joins Mobile | composición legacy | no eliminar hasta separar rutas/incidentes de posición operacional |

`connectionStateRecovery` está configurado, pero el Redis adapter convencional no convierte GPS actual en un log durable/reproducible. Por eso el socket sigue siendo señal primaria y REST el mecanismo canónico de recuperación.

## Matriz obligatoria

| módulo | autoridad | estado actual | duplicidad encontrada | defecto | solución | test | evidencia física | estado final |
|---|---|---|---|---|---|---|---|---|
| Portal velocidad actual | snapshot `speedKmh` | proyección parcial | `Vehicle.speed` m/s vs km/h | doble conversión | lectura directa del snapshot | Jest contrato | pendiente | software cerrado |
| Portal replay | posición `speed` m/s | independiente | helper antes ambiguo | unidad implícita | helper con unidad en nombre | typecheck/build | no aplica | cerrado |
| GPS foreground | raw nativo + stable aceptado | cadencia 5 s | booleano sin razón | no observable/plausible | clasificador explícito | 7 disposiciones | recorrido/batería pendiente | software cerrado, físico abierto |
| Presencia | lease por socket | join + heartbeat | heartbeat no renovaba lease | falso offline | renovación liviana | presence + RTC | dos dispositivos pendiente | software cerrado, físico abierto |
| Realtime operacional | snapshot REST/evento | coexistencia legacy | snapshot + `location:updated` + `mapData` | dos representaciones | inventario y no-retirada insegura | gates existentes | sesión antigua pendiente | abierto incremental |
| Recursos UI | cada dominio remoto | modelos heterogéneos | `[]`/null/loading compartidos | ambigüedad | no modificado en este corte | — | — | abierto |
| Latencia E2E | `packetId` backend | instrumentación parcial existente | timestamps parciales | falta `appliedAt` agregado | no modificado en este corte | ingestion logs | red real pendiente | abierto |
| Modularización | mismo Zustand/Socket.IO | archivos grandes | responsabilidades mezcladas | alto acoplamiento | no crear paralelo; extracción pendiente | gates arquitectura | — | abierto |
| Autoridades | `system-authorities.json` | válido, 8 divergencias rastreadas | baseline con drift reportado | deuda real | no se maquilló baseline | validators | — | abierto |
| UX operacional | snapshot | mapa dominante existente | badges/derivaciones parciales | jerarquía inconsistente | sólo velocidad corregida | build | inspección pendiente | abierto |

## Antes / después

| antes | después | beneficio medible |
|---|---|---|
| 38 km/h → 137 km/h en panel | 38 km/h → 38 km/h | error de unidad eliminado (3.6×) |
| filtro GPS booleano | 7 resultados causales | 100% de decisiones locales clasificables |
| salto imposible aceptable por filtro de distancia | filtro distancia-tiempo con incertidumbre | rechazo determinista probado |
| heartbeat no mantenía presencia | heartbeat renueva sólo el lease joined | evita expiración a 55 s sin re-join |
| cambio tentativo 5 s → 1 s | cadencia intacta | evita aumento de red/batería sin evidencia |

## Certificación ejecutada

- Ventas: typecheck, 12 gates de contrato y build de producción, verdes.
- Mobile: typecheck, lint y 9 tests focales, verdes.
- Backend: snapshot operacional, freshness, ingestion, presencia y RTC, verdes.
- Autoridades: mapa válido (7 productos, 28 autoridades, 8 divergencias); gate contractual válido. El validador reporta drift 10/50 contra `origin/main`; no se actualizó el baseline.
- `git diff --check`: sin errores (sólo avisos de normalización LF/CRLF del entorno).

## Gates físicos pendientes

No se declara certificación física. Faltan: recorrido urbano con paradas y saltos inducidos; pérdida/recuperación GPS; foreground/background/doze; cola offline y fuera de orden; consumo de batería; reconexión Socket.IO/presencia con dos dispositivos; inspección visual Portal/Mapbox. Fases 2, 4, 6, 7, 8, 9 y 10 requieren cortes posteriores, no una ampliación silenciosa de este cambio.

---

# Corte 2 — Presence contract, observabilidad y resource-state audit

Se mantiene la misma base `origin/main@edf39a74`; no se incorporó PR #196 ni `feat/portal-communication-20260812`, no se cambió la cadencia GPS de 5 s y no se retiraron `location:updated`/`mapData`.

## Contratos antes / después

| dominio | antes | después | estado |
|---|---|---|---|
| Mobile presence | timer cada 20 s emitía join + heartbeat | join en conexión/revalidación real; timer sólo heartbeat | software cerrado |
| Portal presence | join al conectar, sin renovación; expiraba a los 55 s | heartbeat cada 20 s sobre el mismo Socket | software cerrado |
| Backend join | cada join emitía online | rooms/snapshot siempre; online sólo en transición real | software cerrado |
| Backend heartbeat | RTC ACK, inicialmente sin lease de presencia | renueva sólo si `presenceJoined`; no join/snapshot/broadcast | software cerrado |
| HTTP trace | `app.js` fijaba `req.traceId`, locations/chat leían `req.requestId` | trace canónico llega a ingestion y Tracking | cerrado |
| Android upload | `lastSentAt === lastConfirmedAt` | sent antes del intento, confirmed en 2xx, timeline por packetId y RTT | físico pendiente |
| Timer metrics | count/total/max/average | histograma de 13 buckets y percentiles aproximados | cerrado |
| Snapshot apply | evento aplicado sin diagnóstico local | socketReceivedAt/appliedAt/receiveToApplyMs, sin ACK | cerrado |
| Portal loading | un `isLoading` compartido podía quedar false por otra request | coordinador por dominio; account/billing migrados | parcial |
| Activation keys | 500/timeout/red se convertía en cero keys | sólo 403 degrada; disponibilidad se propaga | cerrado |

## Productor → consumidor

| productor | señal/salida | consumidor | autoridad/semántica |
|---|---|---|---|
| Mobile/Portal `connect` | `presence:join` | Socket backend | alta, rooms y snapshot una vez por conexión |
| timers Mobile/Portal | `client:heartbeat` | Socket backend | lease presencia/RTC y ACK `serverTime` |
| `app.js` | `req.traceId` | locations/chat → logger | correlación HTTP canónica |
| Android queue item | packetId + captured/sent/confirmed/RTT | módulo RN/status runtime | diagnóstico de un mismo paquete; no negocio |
| ingestion backend | timers GPS | métricas unificadas | agregados con tags acotados |
| operational service | build/emit timers | métricas unificadas | coste backend separado de apply cliente |
| socket clients | receive/apply local | diagnostics de cada store | latencia local sin ACK por viewer |

La revisión de `origin/feat/portal-communication-20260812` encontró productores Mobile/backend equivalentes al contrato anterior y un productor Portal de join. Esa rama no se integró; su futura reconciliación debe preservar el heartbeat ligero y no restaurar re-joins periódicos.

## Métricas añadidas

| métrica | tags usados | significado |
|---|---|---|
| `gps_ingestion_duration_ms` | transport, decision, quality | procesamiento backend del paquete |
| `gps_transport_queue_age_ms` | transport, decision | antigüedad elapsed informada por la cola |
| `operational_snapshot_build_ms` | quality | construcción del snapshot realtime |
| `operational_emit_ms` | decision | emisión Socket.IO local |

`gps_http_round_trip_ms` no se publica como métrica backend: Android conoce correctamente sent/confirmed y lo expone como `lastPacketRoundTripMs`. Enviar el valor en otro paquete mezclaría intentos. Ninguna métrica usa vehicleId, userId, packetId o traceId como tag.

Los percentiles son **aproximaciones acumuladas desde arranque/reset**, representadas por el límite superior del bucket que cruza el cuantil. No son percentiles exactos ni una ventana móvil.

## Resource-state audit

Contrato en `shared/resource-state.ts`: `idle | loading | ready | empty | stale | error`, con `lastSuccessfulAt`, `source`, `errorCode` y `errorMessage`.

Portal prepara account, billing, sessions, documents, incidents, appInfo y operational. En este corte account/billing gobiernan ya su carga. Si overview termina mientras billing continúa, `activeLoads` conserva loading y billing nunca aparece empty antes de resolver.

Mobile conserva `Promise.allSettled`: aplica éxitos, pero un rechazo distinto de plan-required puede dejar el array anterior o vacío sin explicación. Migración posterior, sin modularizar root-store: operational primero; después documents/sessions conservando datos como stale; arrays contienen datos y el resource state decide loading/empty/error.

## Matriz actualizada

| módulo | autoridad | defecto | solución/test | evidencia física | estado final |
|---|---|---|---|---|---|
| Presence backend | socket autenticado + lease | rebroadcast/rejoin y expiración | renovación/expiración; tests unjoined, repetidos, siblings | dos dispositivos pendiente | software cerrado |
| Presence Mobile | socket compartido | join periódico | timer heartbeat-only | background/reconnect pendiente | software cerrado |
| Presence Portal | mismo socket | sin heartbeat | heartbeat 20 s | pestaña suspendida pendiente | software cerrado |
| Trace Tracking | req.traceId | req.requestId inexistente | integración HTTP con trace conocido | no aplica | cerrado |
| Android telemetry | queue item/attempt | sent=confirmed/mezcla | timeline por packetId + Kotlin | red/offline/doze pendiente | ACCEPTED_PENDING |
| Métricas | módulo communication | sin distribución | buckets constantes + tests | carga producción pendiente | software cerrado |
| Apply client | reloj local | sin medición | receive→apply, sin ACK | dispositivos reales pendiente | software cerrado |
| Resource Portal | estado por dominio | loading compartido/catch-all | account/billing + contrato | no aplica | parcial |
| Resource Mobile | contrato futuro | rechazos invisibles | auditoría/orden de migración | offline real pendiente | abierto controlado |

## Certificación Corte 2

- Typecheck Mobile y Ventas: verde.
- Backend: presence, trace HTTP→Tracking, ingestion y communication metrics: verdes.
- Communication service: suite completa verde.
- Android main Kotlin compila. Los tests unitarios propios no pueden aislarse porque la compilación global de tests falla antes en código preexistente de `@rnmapbox/maps` y `RadioReconnectFloorAckTest`; el gate se registra, no se oculta.
- No se actualizó ningún baseline.
- No se declara **PHYSICAL PASS**. GPS/background/batería: **ACCEPTED_PENDING**.

---

# Corte 3 — Resource State Authority, fallos parciales y Android unit gate

La rama segura fue publicada antes de este corte y el Draft PR #198 quedó abierto contra `main`. El merge-base sigue siendo exactamente `edf39a74950b7f9d6141667fe81ea894542f859f`; no se integraron PR #196 ni las ramas excluidas.

## Contratos antes / después

| dominio | antes | después |
|---|---|---|
| ResourceState | refresh podía ocultar datos con `loading` | primera carga usa `loading`; refresh conserva `ready/empty` con `isRefreshing`; fallo posterior produce `stale` |
| Colecciones vacías | algunos consumidores inferían empty desde `[]` | `empty` sólo nace de respuesta autoritativa exitosa |
| Portal `loadAll` | una promesa podía contaminar el lote | `Promise.allSettled` aplica overview, subscription, onboarding, keys, billing y sessions independientemente |
| Activation keys | degradación opcional ambigua | sólo 403 esperado degrada; 5xx/timeout/network producen error o stale |
| Realtime | mutación incremental podía confundirse con snapshot | incremental actualiza datos, pero no promueve idle/stale a ready |
| Mobile cache | dato presente era indistinguible de sincronizado | cache queda `source=cache`, `status=stale` hasta confirmación REST |
| Billing UI | `isLoading` global y longitud decidían skeleton/empty | `resources.billing` decide loading/empty/error/stale; stale conserva facturas |
| Android gate | root test compilaba tests rotos de Mapbox y el fake Radio colisionaba | `:app:testDebugUnitTest` compila main/test de la app y ejecuta 80 pruebas |

## Productor → consumidor

| productor | consumidor | contrato |
|---|---|---|
| respuesta REST por dominio | Portal/Mobile ResourceState | certifica `ready` o `empty`; fija `lastSuccessfulAt`, `source=rest` |
| fallo posterior a éxito | UI del dominio | conserva datos y expone `stale` con error no bloqueante |
| offline cache | Mobile ResourceState | restaura datos como `stale`, nunca como snapshot confirmado |
| evento incremental Socket.IO | colección cargada | actualiza entidad/source; no certifica colección incompleta |
| snapshot operacional REST | estado operacional | certifica colección; `OperationalUnitSnapshot` conserva autoridad GPS/ruta/ETA/journey |
| histograma fijo | snapshot métricas | 13 buckets constantes; percentiles aproximados monotónicos y acotados por max |

## Matriz ResourceState

| Resource | Initial load | Empty | Refresh | Partial failure | Cache | Realtime incremental | Realtime full snapshot | Error | Stale |
|---|---|---|---|---|---|---|---|---|---|
| Portal account | loading | no aplica | conserva dato | independiente | no | no promueve | REST equivalente | sin dato usable | conserva cuenta |
| Portal billing | loading | sólo REST `[]` | conserva facturas | independiente de overview | no | no configurado | REST list | Retry/ErrorState | facturas + aviso |
| Portal sessions | loading | sólo REST `[]` | conserva sesiones | no invalida account | no | no promueve | REST list | sin EmptyState | conserva sesiones |
| Portal documents | loading | sólo REST `[]` | conserva documentos | independiente | no | no certifica lista | REST list | sin dato usable | conserva documentos |
| Portal incidents | loading | sólo REST `[]` | conserva incidencias | independiente | no | upsert sin promover idle/stale | REST list | sin dato usable | conserva lista |
| Portal appInfo | loading | respuesta nula confirmada | conserva info | independiente | no | no configurado | REST object | sin dato usable | conserva info |
| Portal activationKeys | loading | 403 capability o REST `[]` | conserva keys | independiente | no | no promueve idle/stale | REST list | 5xx/red sin dato | conserva keys |
| Mobile operationalUnits | loading | REST `[]` | conserva snapshot | allSettled | cache=stale | unidad incremental no certifica colección | REST list | sin dato usable | conserva unidades |
| Mobile mapData legacy | loading | REST sin vehículos | conserva datos | allSettled | cache=stale | incremental no certifica lista | REST list | sin dato usable | conserva mapa |
| Mobile incidents/documents/notifications/users/conversations/history | loading | sólo REST vacío | conserva datos | cada resultado independiente | cache=stale | no promueve incompletos | REST list | sin dato usable | conserva éxito/cache |

## Android gate hygiene

- Mapbox: `node_modules/@rnmapbox/maps/android/src/test/.../RNMBXStyleValueTest.kt`, test source set, literales Kotlin multicaracter en líneas 30/39. No afecta main ni se cambió producción.
- Radio: `RadioReconnectFloorAckTest.kt`, test source set, clash JVM entre setter de `listener` y `setListener`. Se renombró sólo el backing field del fake.
- El fixture usaba 1 ms, incompatible con el mínimo actual de `RadioReconnectPolicy`; se ajustó sólo el test a 250 ms.
- `npm run android:test:unit` ejecuta `:app:testDebugUnitTest`; no desactiva ni comenta tests.

## Métricas

Se mantienen `gps_ingestion_duration_ms`, `gps_transport_queue_age_ms`, `operational_snapshot_build_ms` y `operational_emit_ms`. Los histogramas tienen memoria constante y reset total; p50/p95/p99 son límites de bucket aproximados desde arranque/reset, recortados por el máximo observado. Se filtran `packetId`, `traceId`, `userId` y `vehicleId`; permanecen tags acotados como transport/decision/quality.

## Certificación Corte 3

- Mobile: 104 suites / 577 tests, lint y typecheck verdes.
- Portal: typecheck, contratos y build producción verdes con URL HTTPS explícita.
- Communication service: suite completa verde.
- Android: main compilado; 80 unit tests verdes, incluida la regresión de ACK tardío.
- Backend: suite completa ejecutada; resultado final registrado en el cierre.
- `git diff --check`: ejecutado al cierre.

Estado: **CODE_AUTOMATED_PASS**, **ANDROID_UNIT_PASS**, **PHYSICAL_GATE=ACCEPTED_PENDING**. No se declara `PHYSICAL_PASS`; GPS/background/batería y pruebas físicas siguen pendientes.

---

# Corte 3.1 — Resource State concurrency hardening

## Coherencia incremental

`applyIncrementalResourceEvent` recibe ahora `hasDataAfterMutation`. Sólo una colección con baseline completo (`ready` o `empty`) puede conservar/cambiar completitud: `empty + create/upsert → ready`, `ready + update → ready`. Los estados `idle`, `stale` y `error` permanecen iguales, por lo que un evento incremental nunca certifica una colección incompleta. Aplica a incidencias Portal/Mobile y snapshots incrementales de unidades operacionales Mobile/Portal.

## Concurrencia same-domain

Se reemplazó el contador sin identidad por generaciones monotónicas por dominio. Cada carga cuenta para el `isLoading` global derivado, pero sólo la generación más reciente puede escribir datos o resolver el ResourceState. Una respuesta vieja jamás pisa una nueva; una carga exitosa seguida por un fallo vigente conserva datos y termina `stale`, nunca `error` con datos utilizables.

Pruebas conductuales cubren:

- A success, B fail: datos previos + stale.
- A fail, B success: datos nuevos + ready.
- B success antes que A: A se ignora.
- `loadBilling` y `loadAll` concurrentes sobre billing.
- dos `loadOverview` concurrentes sobre account.
- empty + upsert, ready + update, y preservación de stale/idle/error.

`isLoading` se conserva únicamente como compatibilidad derivada del conjunto de intentos activos; no decide loading, empty, error ni stale de ninguna pantalla.

## Certificación

Se reejecutan en este corte las suites Mobile, Portal, Backend, Communication y Android, además de `git diff --check`. Los resultados finales se publican en el Draft PR #198. Estado físico permanece **PHYSICAL_GATE=ACCEPTED_PENDING**; no se declara `PHYSICAL_PASS`.

---

# Corte 3.2 — Resource side-effect consistency

Latest-wins protege ahora el conjunto completo de efectos de una carga: data, ResourceState y `error` global. Un coordinador monotónico de efectos invalida tanto escrituras tardías de error como limpiezas tardías; una generación obsoleta queda sin efectos observables.

La cardinalidad posterior a cada mutación incremental se pasa explícitamente al contrato. Incidents y operationalUnits usan `true` porque realizan upsert; activationKeys usa `keys.length > 0`. Por ello, un snapshot previo empty permanece empty ante `keys=[]` y pasa a ready cuando el evento contiene al menos una key.

La política TTL está aislada y probada: sólo un `loadAll` fresco puede omitirse. Los loaders de dominio nunca quedan bloqueados por ese TTL, así que billing/sessions/keys pueden reintentarse inmediatamente después de un fallo parcial.

Pruebas conductuales añadidas:

- fallo tardío de A después de éxito B no altera data, ready ni `error=null`;
- éxito tardío de A después de fallo B no limpia el error vigente;
- activationKeys empty + realtime vacío permanece empty;
- activationKeys empty + realtime con key pasa a ready;
- TTL fresco omite full-load pero permite retry de dominio.

No se tocaron GPS, sockets, Android, Mapbox ni autoridades legacy. Se mantiene **PHYSICAL_GATE=ACCEPTED_PENDING** y no se declara `PHYSICAL_PASS`.
# CORTE 4R — LEGACY OPERATIONAL RETIREMENT POST-RECONCILIATION

Base apilada: `audit/claude-reconcile-20260815@8d06836a8f602b5161e9ffdbdbb845176c1d1ae1`. Este corte no altera la resolución histórica `requestedSession -> historicalSession -> activeSession`, el writer de `RouteSessionPosition`, la autoridad del resultado CAS ni los flags V3 (continúan desactivados).

## Autoridades y flujo resultante

| Dominio | Productor | Autoridad/consumidor final | Legacy retirado |
|---|---|---|---|
| Identidad/configuración | REST de Vehicle/Route/User | `Vehicle`, `Route`, eventos lifecycle/config | campos live proyectados en Vehicle |
| Runtime operacional | ingestión GPS, asignación, ruta y lifecycle | `OperationalUnitSnapshot` por REST y `operational-unit:updated` | `location:updated` |
| Historia/replay | ingestión idempotente | `RouteSessionPosition` (speed histórico en m/s) | ninguno |
| Incidencias | REST y eventos incident | `incidents[]`; render efímero con geometría | mirror mutable `mapData.incidents` |
| Mapa Mobile | route geometry + metadata Vehicle | `operationalUnits` para posición live | posición en `mapData.vehicles` |

El Portal calcula una vista efímera pura desde `Vehicle + OperationalUnitSnapshot`; no se persiste ni se envía como payload. Una unidad `never_reported` permanece en listas/paneles y simplemente no produce pin. Mobile conserva `mapData` para geometría y joins estáticos; cache sigue la política ResourceState (`stale`, visible hasta confirmación).

## Inventario 8d06836a (BEFORE) y resultado (AFTER)

Los conteos BEFORE son coincidencias exactas levantadas del árbol base. Los AFTER operacionales excluyen tests, documentación y el propio gate (las coincidencias raw remanentes se clasificaron como HISTORY_REPLAY, STATIC_CONFIG, comentarios o aserciones anti-regresión).

| Métrica | BEFORE raw | AFTER operacional | Estado |
|---|---:|---:|---|
| `applyOperationalSnapshot` referencias | 8 | 0 consumidores | RETIRED |
| Portal `location:updated` listeners | 1 | 0 | RETIRED |
| Mobile `location:updated` listeners | 1 | 0 | RETIRED |
| lectores live Portal de `Vehicle.location` | 4 | 0 | RETIRED |
| lectores live de `Vehicle.gpsFreshness` | 3 | 0 | RETIRED |
| lectores live Portal de `Vehicle.speed` | 2 | 0 | RETIRED |
| lectores live Portal de `Vehicle.activeRouteProgress` | 5 | 0 | RETIRED |
| lectores live Mobile de `mapData.vehicles` | 1 | 0 (joins estáticos permanecen) | RETIRED |
| writers de mirror mutable `mapData.incidents` | 5 | 0 | RETIRED |
| productores backend `location:updated` | 8 sitios / 11 emits | 0 | RETIRED |

El gate `scripts/validate-operational-legacy-retirement.mjs` bloquea la reintroducción en superficies productivas de la proyección, listeners/emisores legacy, mirror mutable de incidencias y lectores live Portal sobre Vehicle.

## Contratos conductuales

- Vehicle A + unit B muestra B; B→C mueve el marker sin `location:updated`; un evento legacy tardío no puede retroceder C.
- `unit.gps.speedKmh` se presenta directamente; no se reconvierte dos veces.
- Incidencias se actualizan una sola vez en `incidents[]` y la geometría de mapa se deriva al renderizar.
- Los productores de cambios de Route/Vehicle publican la autoridad existente (`route:updated`, `vehicle:updated`) y reconstruyen `operational-unit:updated` cuando cambia runtime.
- GPS deja de duplicar el payload en `location:updated`; mantiene captura, cadencia de 5 s, timestamps, packetId, idempotencia e historia sin cambios.

Estado de gate físico: `PHYSICAL_GATE=ACCEPTED_PENDING`. Este corte no declara `PHYSICAL_PASS`.
