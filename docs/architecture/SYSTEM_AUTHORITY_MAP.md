# ManeComb — Mapa de autoridad del sistema

Una responsabilidad, una autoridad. Este documento responde "¿quién produce este
hecho?" para el estado operativo de ManeComb, y sirve de contrato para no volver
a introducir dos productores del mismo hecho.

Complementa, no sustituye:

- `architecture/decisions/ADR-001-product-boundaries-and-authorities.md` — límites de producto
- `architecture/PHASE-0-SYSTEM-INVENTORY-20260806.md` — inventario
- `architecture/PHASE-1-AUTH-ACCOUNT-CHANNEL-AUDIT-20260806.md` — auth y canal de cuenta
- `architecture/PHASE-2-TENANT-CAPABILITIES-AUDIT-20260806.md` — tenant y capacidades
- `radio-ssot-audit/RADIO_PRO_ARCHITECTURE.md` — Radio en detalle

Estado del árbol: rama `feat/radio-pro-evolution`.

---

## 1. Matriz de autoridad

| Hecho | Productor único | Persistencia | Consumidores |
|---|---|---|---|
| usuario autenticado | `root-store` (`user`), poblado por login/session | SecureStore (token) | toda la app |
| token de sesión | `root-store` (`token`) | SecureStore | API, socket JS, Radio nativo |
| organización activa | backend, derivada del token (`getOrganizationId`) | JWT + backend | todo dato multi-tenant |
| canal de cuenta / acceso | backend (`authContext`, `canAccessMobile`) | backend | navegación, gates |
| autorización | **backend** (middlewares + `canUseOperationalFeatures`) | backend | todos los endpoints y eventos |
| navegación por rol | `canRoleAccessRoute` (`navigation/router`) | — | router |
| socket realtime compartido | `root-store.connectSocket` | — | Chat, Presencia, Llamadas, GPS, entidades |
| presencia | backend (`presence:*`) → `root-store` | backend | UI |
| ubicación del vehículo | `use-location-engine` (JS) **o** `ManeCombLocationService` (nativo), nunca ambos | backend | mapa, admin |
| jornada activa | backend (`operational-unit` / `journey`) → `root-store` | backend | driver, mapa, admin |
| sesión de ruta | backend (`route-session:updated`) → `root-store` | backend | mapa, checklist |
| mensajes de chat | `root-store.messagesByConversation`, dedup por `message.id` | backend | Chat, Audios de Radio |
| llamada activa | `call-store` (máquina propia) | — | overlay, Radio (preempción) |
| sesión de Radio | `ManeCombRadioService` (nativo) → proyectada a `radio-live-store` | — | pantalla Radio, overlay |
| notificaciones | backend (`notification-delivery`) | backend | app |
| documentos | backend (`reviewStatus` + `expiresAt`) | backend | driver, admin |
| vencimiento documental | `isDocumentExpired` (deriva de `expiresAt`) | — | Perfil, Documentos |
| incidentes | backend (`incident:*`) → `root-store` | backend | control |
| ruta dibujada en el mapa | `route.id` → una fuente Mapbox por ruta | caché de render | mapa |

Ninguna fila tiene dos productores finales.

---

## 1.b Dominio operativo (jornadas, rutas, flota)

| Hecho | Autoridad | Cómo se protege |
|---|---|---|
| transición de jornada | `journey-transition-service` sobre `domain/journey-lifecycle` | tabla de transiciones + `expectedStatus` (CAS) + actor/tenant |
| jornada activa por vehículo | MongoDB | índice único parcial sobre `activeKey` (= `vehicleId`), `11000` manejado en la creación |
| cierre de jornada | mismo servicio | `activeKey → null` sólo en `FINISHED`/`CANCELLED` |
| métricas de jornada | `route-metrics-engine` | escribe `processingStatus`/`statisticsReady`, **nunca** `status` |
| asignación jornada | `journey-assignment-service` | valida campos, organización y usa CAS |
| identidad de vehículo | backend; `id ?? _id` normaliza store embebido vs Mongo | contrato dual deliberado, no compatibilidad muerta |

`status` (ciclo de vida) y `processingStatus` (cálculo de métricas) son hechos
distintos con campos distintos: no son duplicación.

### Una jornada activa por conductor — GARANTIZADO

No hay índice único por conductor: la garantía nace de encadenar tres reglas,
fijadas por `backend/test/driver-journey-exclusivity.test.js`.

1. **Un conductor, una unidad.** `changeDriverVehicle` (store embebido) y
   `syncDriverVehicleAssignment` (Mongo, `updateMany`) liberan el emparejamiento
   con cualquier otra unidad al asignar una nueva.
2. **No se puede cambiar de unidad con jornada viva.** `changeDriverVehicle`
   devuelve `active_session` si la unidad actual tiene jornada activa. Mongo
   replica esta guarda en cuatro puntos.
3. **La jornada toma el conductor de la unidad.** `POST /navigation/sessions/start`
   deriva `driverId` de `vehicle.driverId`, nunca del cuerpo de la petición, y
   sólo el conductor emparejado puede iniciarla.

Compuestas: un conductor no puede estar en dos unidades, luego no puede abrir
dos jornadas. La asignación administrativa añade `driver_vehicle_mismatch` y
`schedule_conflict` (conductor **o** unidad, con solape de intervalos) bajo
`withAssignmentLock`.

---

## 1.c Dominio de incidencias y comercial

| Hecho | Autoridad | Cómo se protege |
|---|---|---|
| estado de incidencia | `updateIncidentStatus`, único writer | ruta valida `open\|in_progress\|resolved`, `requirePermission("canManageIncidents")` y pre-chequeo de tenant vía `listIncidents(req.user)` |
| ubicación de incidencia | `resolveIncidentLocation(vehicle, location)` | snapshot en la creación, derivado de la autoridad GPS; no es ubicación viva |
| onboarding | `order.onboardingStatus` | único productor (`commercial-activation`); admin-global, portal y mobile sólo lo leen |
| suscripción | backend (`authContext.subscription`) | el cliente sólo proyecta `status` y `unitsLimit` |
| límite de flota | store, no la UI | `createActivationKeyWithinCapacity` / `reactivateDriverWithinCapacity` rechazan por `maxDrivers` en ambos stores |
| frontera Admin Global | `PLATFORM_ROLES` + `requirePlatformRole` | espacio de roles disjunto del tenant; las rutas platform no usan `requirePermission` de tenant |

**Radio Emergency — READY TO EXTEND.** El modelo de incidencia ya transporta
creador, vehículo, ruta, snapshot de ubicación, severidad `critical`, `media` y
estado, y el backend ya emite `incident:sos` con categoría de notificación `sos`
y deep link. Una emergencia de Radio puede representarse aquí sin crear un
segundo modelo operacional; sólo faltaría referenciar el audio en `media`.

---

## 2. Mapa realtime

| Transporte | Propietario | Alcance | Justificación |
|---|---|---|---|
| socket JS compartido | `root-store.connectSocket` | Chat, Presencia, Llamadas (signaling), GPS, entidades | una conexión por sesión; `connectSocket` es idempotente por `socketSessionKey` |
| socket nativo de Radio | `SocketIoRadioTransport` (Kotlin) | solo `radio:*` | el camino crítico del audio no puede depender de que el runtime JS esté vivo |
| socket one-shot de acciones de llamada | `call-action-headless-task` | solo `rtc:reject` | corre en contexto headless, sin app viva; `forceNew`, sin reconexión, `disconnect()` en `finally` |
| socket de ventas | `ventas/src/store/use-app-store` | aplicación web separada | otro producto, otro proceso |

**Regla**: ningún módulo emite ni escucha `radio:*` desde JavaScript. Verificado
por `radio-transport-ownership.test.js`.

### Ciclo de vida de listeners

- `root-store`: registra sus ~20 listeners una sola vez por socket; al cambiar de
  sesión destruye el socket completo antes de crear otro. No hay acumulación.
- `call-runtime`: registra 7 listeners y los retira uno a uno con
  `socket.off(evento, handler)` mediante `createIdempotentCleanup`. Nunca usa
  `removeAllListeners` sobre un socket compartido vivo.
- `call-store.bindSocket`: idempotente por instancia; desengancha antes de
  reenganchar cuando el socket es reemplazado.

---

## 3. Matriz de recursos de audio y captura

El micrófono es exclusivo del proceso. `RadioAudioSession` es el árbitro, porque
ya es la autoridad de quién posee el audio.

| Recurso | Llamadas | Radio | Notas de voz (Chat) | Historial de Radio |
|---|---|---|---|---|
| micrófono | WebRTC `getUserMedia` | `AudioRecord` | `MediaRecorder` | — |
| árbitro | `setRadioCallActive` → Radio cede | `RadioAudioSession` | `beginExternalCapture()` | — |
| altavoz | WebRTC | `AudioTrack` (`RadioAudioRoute`) | — | `MediaPlayer` |
| AudioFocus | WebRTC | `RadioAudioSession` | — | `ManeCombAudioModule` |
| cámara | WebRTC | — | — | — |
| foreground service | `ManeCombCallService` (`microphone\|camera`) | `ManeCombRadioService` (`mediaPlayback\|microphone`) | — | — |

Exclusiones garantizadas:

- Llamada activa → Radio pasa a `PAUSED_BY_CALL` y libera micrófono y canal.
- Radio transmitiendo/recibiendo → historial y notas de voz rechazados con
  `radio_channel_active`.
- Nota de voz grabando → `RadioAudioSession.startCapture()` rechaza con
  `microphone_busy`.

Verificado por `audio-resource-matrix.test.js`.

---

## 4. Servicios en segundo plano

| Servicio | Propietario | Arranque | Parada | Credenciales |
|---|---|---|---|---|
| `ManeCombLocationService` | `use-location-engine` (owner `operational-runtime`) | jornada operativa con vehículo | pierde condiciones o logout | `ManeCombSecureStore`, alias GPS |
| `ManeCombRadioService` | `radio-live-overlay` → módulo nativo | sesión elegible + canal | logout / `deactivate()` | solo en memoria |
| `ManeCombCallService` | `call-overlay` | llamada conectando/conectada | fin de llamada | — |

Ninguna pantalla inicia o detiene un servicio nativo por montarse. Verificado por
`background-location-authority.test.js` y `radio-transport-ownership.test.js`.

---

## 5. Cadena de ciclo de vida de sesión

```text
login
 → root-store.user + token           (autoridad de identidad)
 → connectSocket                     (socket compartido)
 → authContext                       (canal de acceso)
 → use-location-engine               (GPS según jornada real)
 → radio-live-overlay                (sesión nativa de Radio)
 → call-overlay                      (signaling de llamadas)

logout
 → hardResetBackgroundLocationServiceAsync   (antes del logout remoto)
 → radio deactivate                          (socket, canal, audio, identidad)
 → call reset + foreground service off
 → disconnectSocket
 → limpieza de token
```

El orden importa: GPS se detiene **antes** de esperar al logout remoto, para que
una red lenta no deje el servicio publicando posiciones de una sesión cerrada.
Verificado por `background-location-authority.test.js`.
