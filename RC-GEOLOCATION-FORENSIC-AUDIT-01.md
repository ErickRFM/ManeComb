# RC-GEOLOCATION-FORENSIC-AUDIT-01

## Alcance y método

Se auditó el flujo de identidad y geolocalización antes de modificar código. El alcance incluyó aplicación móvil, servicio nativo Android, REST, Socket.IO, stores de memoria y MongoDB, jornadas, snapshot operacional, Portal y mapa. No se modificaron Chat, Radio, Comunicaciones, Documentos, Suscripciones, UX ni Mapbox.

El repositorio ya estaba sucio por trabajos anteriores. Los cambios de esta RC se limitaron a los archivos enumerados en este informe; no se revirtieron cambios ajenos.

## Revisión histórica

### Línea de tiempo relevante

| Fecha/commit | Evolución | Riesgo identificado |
|---|---|---|
| 2026-07-17 `b2904cd` | Integridad temporal de tracking, rechazo de posiciones antiguas y frescura GPS. | El reloj cliente seguía admitiéndose hasta cinco minutos hacia el futuro. |
| 2026-07-17 `5fcc8d1` | Activación, asignación de unidad y cambios de mapa. | La identidad móvil, la unidad asignada y el worker nativo podían evolucionar en momentos diferentes. |
| 2026-07-17 `6e7ed2f` | Introducción del snapshot operacional. | La arquitectura declaraba una fuente canónica, pero el Portal siguió leyendo `/vehicles`. |
| 2026-07-18 `a7ffd7d` | Endpoint `/operational-units`, eventos `operational-unit:updated` e integración móvil. | REST y Socket podían resolver fuera de orden y el REST tardío sobrescribía el evento reciente. |
| 2026-07-18 `7e68757` | Uso del mapa en seguimiento. | El envío foreground quedó implementado como hook pero no montado en la pantalla. |
| RC-DRIVER-REGISTRATION-SIMPLIFICATION-01/02 | Activación conductor-unidad y claim atómico. | Se verificó la carrera de asignación; el claim atómico existente evita dos conductores sobre una unidad. No se duplicó esa lógica. |

Documentos revisados: `RC-TRACKING-EXECUTION-01.md`, `RC-OPERATIONAL-SNAPSHOT-01.md`, `RC-OPERATIONAL-CONSISTENCY-02.md`, `RC-OPERATIONAL-CONTRACT-INTEGRATION-01.md`, `RC-DRIVER-REGISTRATION-SIMPLIFICATION-01.md` y `RC-DRIVER-REGISTRATION-SIMPLIFICATION-02.md`.

## Flujo auditado

1. Login/activación obtiene JWT, refresh token y perfil con `user.vehicleId`.
2. El store móvil limpia datos del tenant, consulta `/auth/me`, carga `/locations/live`, `/operational-units` y jornadas, y abre un socket identificado por usuario y token.
3. La jornada `RUNNING` determina el `sessionId` y la unidad del conductor determina el `vehicleId`.
4. Foreground obtiene `deviceLocation`; background entrega `vehicleId`, `sessionId` y credenciales al servicio Android.
5. Android genera paquetes con identidad inmutable dentro del body, conserva una cola durable y publica a `/locations/update`.
6. Backend autentica organización y exige que un conductor solo actualice su propia unidad. Normaliza tiempo y actualiza por `vehicleId` con protección monotónica en memoria y MongoDB.
7. Si el paquete pertenece temporalmente a una jornada, se persiste como posición de esa jornada; `packetId` evita duplicados.
8. Backend emite `location:updated` y el snapshot completo `operational-unit:updated` a las salas autorizadas.
9. Móvil y Portal reemplazan la proyección de la unidad correspondiente; mapa, marcadores, panel y GPS consumen esa proyección.

## Hallazgos forenses

### P0 — Inversión de autoridad de sesión

`map-screen.native.tsx` leía token y refresh token persistidos por el worker Android y los copiaba de vuelta al store móvil. Tras logout, expiración, cambio de Key o cambio de conductor, un worker anterior podía convertir otra vez sus credenciales antiguas en la sesión principal de la app. Esta es una causa directa plausible de identidad, unidad y ubicación cruzadas.

Corrección: la sesión autenticada es la única autoridad. El estado nativo ahora expone `vehicleId/sessionId` para diagnóstico; nunca vuelve a autenticar la app. Si el worker activo no coincide con `user.vehicleId`, se detiene.

### P0 — Worker no cerrado en todas las transiciones de identidad

El cierre explícito detenía el worker, pero la limpieza por expiración y el reemplazo de sesión no lo hacían. `START_STICKY` y SharedPreferences permitían restaurar configuración vieja.

Corrección: toda limpieza o reemplazo de sesión detiene primero el servicio. Un nuevo arranque cancela además el estado `stopAfterFlush` previo, evitando que una finalización antigua borre la configuración de una jornada nueva.

### P1 — Rastreo foreground desconectado

`use-location-sync.ts` contenía el pipeline correcto, pero ninguna pantalla lo montaba. El mensaje “el rastreo en primer plano continúa” no correspondía al comportamiento real. Sin permiso background, una jornada podía permanecer en `Sin GPS`.

Corrección: el hook existente se monta en el mapa únicamente para conductor, jornada `RUNNING`, unidad asignada, conexión online y horario permitido. No se creó un segundo pipeline.

### P1 — Respuestas REST antiguas pisaban Socket reciente

`refreshAll()` se ejecuta al montar, recuperar red y volver a foreground. Una respuesta iniciada antes de `location:updated`/`operational-unit:updated` podía resolver después y reemplazar la posición nueva.

Corrección: reconciliación monotónica por `locationTimestamp` y `lastEventAt`, tanto en eventos como al aplicar REST. Una respuesta antigua ya no puede retroceder una unidad.

### P1 — Portal fuera de la fuente de verdad canónica

El móvil consumía `/operational-units`; el Centro de operaciones del Portal consumía `/vehicles` y recalculaba GPS/conductor/ETA. Eso explicaba diferencias entre superficies aun con backend consistente.

Corrección: el Portal carga y escucha `OperationalUnitSnapshot`. El catálogo `/vehicles` conserva exclusivamente datos configurables y geometría; posición, timestamp, velocidad, heading, conductor, frescura y ETA se proyectan desde el snapshot canónico.

### P1 — El orden de estado vivo dependía del reloj cliente

La protección monotónica de la posición visible comparaba `locationTimestamp`, que dentro de la tolerancia proviene del teléfono. Un reloj adelantado podía impedir que un paquete recibido después actualizara el estado vivo.

Corrección: la cronología de jornada conserva el tiempo cliente normalizado, pero la decisión de cuál es la posición viva más reciente usa `locationReceivedAt`, autoridad servidor, tanto en memoria como en MongoDB. Así no se altera la reconstrucción histórica y el reloj de un teléfono no puede dominar el estado operacional.

### P2 — Dos fuentes móviles durante la migración

`mapData` y `operationalUnits` siguen coexistiendo porque rutas, incidentes y geometría todavía pertenecen al contrato live. Se verificó que las coordenadas visibles y el panel usan snapshots; se agregó orden temporal en ambos canales para impedir divergencia durante la transición.

### P3 — Observabilidad nativa incompleta

El status del worker no exponía unidad ni jornada. Se añadieron ambos identificadores sin alterar el motor GPS ni el protocolo HTTP.

## Escenarios revisados

| Escenario | Resultado técnico |
|---|---|
| Cambio de conductor/Key/login | El reemplazo de sesión detiene el worker anterior y limpia cache tenant. |
| Cambio de unidad | Un worker con `vehicleId` distinto al perfil autenticado se detiene. |
| Logout/expiración | Socket y worker se detienen; el epoch impide que requests viejos repueblen el store. |
| Pérdida/recuperación de Internet | La cola nativa conserva bodies con `vehicleId/sessionId`; la sincronización foreground usa la cola existente del store. |
| Background/foreground | Background conserva su identidad; foreground vuelve a enviar por el endpoint existente y refresca sin retroceder timestamps. |
| Reinicio Android | La restauración usa la configuración persistida; al abrir la app se confronta contra la unidad autenticada. |
| Dos unidades simultáneas | Prueba automatizada actualiza coordenadas distintas para `vehicle-101` y `vehicle-204` y confirma aislamiento. |
| Actualización fuera de orden | Memoria, MongoDB y clientes rechazan o preservan el dato más reciente. |
| Portal vs móvil | Ambos reciben el mismo `OperationalUnitSnapshot`; el Portal ya escucha `operational-unit:updated`. |

## Archivos modificados

- `backend/test/geolocation-consistency.test.js`
- `mobile/src/native/background-location.ts`
- `mobile/android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationModule.kt`
- `mobile/android/app/src/main/java/com/anonymous/combiscontrol/location/ManeCombLocationService.kt`
- `mobile/src/store/root-store.ts`
- `mobile/src/screens/map-screen.native.tsx`
- `ventas/src/lib/api.ts`
- `ventas/src/store/use-app-store.ts`
- `ventas/features/portal/screens/portal-dashboard-screen.tsx`

## Validaciones

- Mobile TypeScript: aprobado.
- Portal TypeScript: aprobado.
- ESLint de archivos móviles afectados: aprobado.
- 26 suites móviles / 130 pruebas: aprobadas.
- Backend: tracking integrity, aislamiento multiunidad, snapshot operacional, endpoint operacional, jornadas, claim concurrente de unidad y tenant isolation: aprobados.
- Android `assembleDebug`: aprobado.
- Portal build de producción: aprobado; solo advertencia preexistente de tamaño de chunks y token Mapbox vacío en el entorno de build.
- `git diff --check`: aprobado.
- ADB no reportó dispositivos conectados. Por ello no se declara ejecutada una prueba física simultánea con dos teléfonos ni una validación contra la base MongoDB de producción.

## Riesgos remanentes

1. Se requiere una corrida de aceptación física con dos dispositivos y dos Keys contra un ambiente QA/producción controlado para certificar radio real, Doze/OEM y reconexiones celulares; no había dispositivos ADB disponibles.
2. La cola Android es única por instalación. Sus paquetes llevan identidad propia y el backend los autoriza, pero conviene observar en telemetría la transición logout/login cuando existan paquetes pendientes.
3. El Portal conserva `/vehicles` para configuración y geometría. Los campos operacionales ya son canónicos, pero una futura ampliación del snapshot podría eliminar ese merge de catálogo.
4. La rama contiene modificaciones ajenas a esta RC; la revisión/commit debe seleccionar solo el alcance listado.

## Dictamen final

La causa no era única. Se cerraron cinco fallos estructurales de consistencia: autoridad invertida de credenciales, ciclo de vida incompleto del worker, ausencia de envío foreground, escrituras cliente fuera de orden y divergencia Portal/snapshot; además se eliminó el envenenamiento por reloj futuro.

El código y las pruebas automatizadas quedan aprobados. La certificación operacional final queda **condicionada únicamente** a ejecutar la matriz física multi-dispositivo indicada, porque el entorno no presentó ningún dispositivo conectado y no sería correcto declarar esa evidencia como realizada.
