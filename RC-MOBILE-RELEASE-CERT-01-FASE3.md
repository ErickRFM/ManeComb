# RC-MOBILE-RELEASE-CERT-01 — FASE 3: Mapa y GPS

**Estado:** auditoría de código CERRADA.
**Base:** `af46bfa840e19f39605f437f870be15786d7d630`

---

## 3.1 Cadena reconstruida

```
GPS dispositivo
 └─ use-location-engine.ts          watcher unico; reducer locationReducer
     ├─ canCaptureLocalLocation()   -> leer GPS local (cualquier sesion movil)
     ├─ canOwnVehicleTracking()     -> publicar como unidad (solo driver asignado)
     └─ background-location.ts      owner nativo, mismo predicado
 └─ store.deviceLocation            App.tsx::OperationalBackgroundServices
     └─ use-location-sync.ts        throttle shouldSyncVehicleLocation
         └─ POST /locations/update
             └─ vehicle-location-ingestion.js   AUTORIDAD REAL
                 ├─ canAccessTenantResource  -> 403 cross_tenant_vehicle
                 ├─ actor.vehicleId === vehicleId (salvo admin) -> 403 forbidden_vehicle
                 ├─ getOperationalScheduleState -> 409 outside_operational_schedule
                 ├─ decision temporal -> duplicate / out_of_order descartados
                 └─ emitLocationUpdate
                     ├─ org:{orgId}:role:{rol con canViewAnalytics}
                     ├─ user:{vehicle.driverId}
                     └─ platform:admin
 └─ GET /locations/live
     └─ filterLiveLocationsForTenant  driver ve solo las rutas de SUS unidades
 └─ store.mapData / operationalUnits
     └─ map-screen.native -> use-map-selector / use-tracking-data -> AppMap (Mapbox)
```

**Autoridad confirmada:** backend decide propiedad, tenant y visibilidad.
Mapbox sólo renderiza. La distribución por socket se hace por *capability*
(`getRolesWithPermission("canViewAnalytics")`), no por lista de roles escrita a
mano.

---

## 3.2 Hallazgo F-11 — publicación GPS sin la autoridad de propiedad

**CAUSE**
`App.tsx` rederivaba la condición de publicación como
`Boolean(user?.vehicleId && authContext?.canAccessMobile === true)`, omitiendo el
predicado de rol operativo. La autoridad canónica ya existía y ya se usaba en el
publicador de background (`use-location-engine.ts:280`):

```
canOwnVehicleTracking = vehicleId && canAccessMobile && isOperationalDriverRole(role)
```

Foreground y background discrepaban sobre quién puede publicar la posición de una
unidad.

**REPRO — CORREGIDO A LA BAJA**

> La primera versión de este expediente afirmaba que un supervisor o un admin con
> `vehicleId` asignado publicaría desde Mobile. **Eso era incorrecto.** El cierre
> extremo a extremo demostró que el modelo de datos nunca asigna `vehicleId` a un
> no-conductor: `data/store.js:997` y `data/mongo-store.js:1931` fuerzan
> `role === "driver" ? payload.vehicleId : null`, y `changeDriverVehicle` filtra
> por `role: "driver"`. Con `user.vehicleId` siempre nulo para un no-conductor, la
> condición vieja `Boolean(user?.vehicleId && canAccessMobile)` ya evaluaba a
> `false`. El impacto práctico en Mobile era **nulo**.

Lo que sí era real y queda corregido: una **divergencia de autoridad latente**.
Foreground rederivaba la condición y background usaba `canOwnVehicleTracking`, de
modo que ambos publicadores discrepaban sobre su propio criterio. Cualquier
cambio futuro en el modelo que permitiera `vehicleId` a otro rol —o un payload de
sesión restaurado de caché con esa forma— habría abierto el camino sólo en
foreground.

La comprobación de propiedad de backend citada aquí resultó ser un hallazgo
independiente y sí explotable: ver **F-13** en §3.7.

**AUTHORITY**
`canOwnVehicleTracking` en `screens/map/utils/location-eligibility.ts`. Ya
existía, ya estaba probada (incluido el caso admin-con-unidad → `false`) y ya
gobernaba el background.

**MINIMAL FIX**
`App.tsx` consume `canOwnVehicleTracking(user, authContext)`. Cero tablas de
roles nuevas, cero `if` por rol, cero servicios nuevos. Commit `9c7a514`.

**REGRESSION**
`location-eligibility.test.ts` — el comportamiento de la autoridad ya estaba
cubierto; lo que faltaba era que el arranque delegue en ella. Se fija que
`useLocationSync` reciba `canOwnVehicleTracking(user, authContext)` y no vuelva a
derivar `canAccessMobile`. Commit `e2a2a27`.

**RESULT** Corregido.

---

## 3.3 Hallazgo F-12 — token de Mapbox ausente y fallo silencioso

**CAUSE**
`app-map.native.tsx:17-24` resuelve el token desde
`readRuntimeValue('MAPBOX_ACCESS_TOKEN', 'MANECOMB_MAPBOX_ACCESS_TOKEN')` o
`Config.MAPBOX_ACCESS_TOKEN`, y si no hay token **omite `setAccessToken` sin
señal alguna**. `mobile/.env.production` en esta base no define ninguna de las dos
claves.

**REPRO**
Construir el APK de release desde esta base sin inyectar la variable: el mapa se
monta, no falla, y no carga teselas. `MapDataRecovery` cubre la ausencia de
*datos* (`mapData` nulo), no la ausencia de *configuración*, así que el usuario ve
un lienzo vacío sin explicación. Es el caso 18 combinado con el 17.

**AUTHORITY**
Configuración de build (`react-native-config`), no código de producto.

**MINIMAL FIX — NO APLICADO**
La causa primaria es de configuración y el token es un secreto: no lo añado. Es
además territorio de Fase 10. Se registra como **prerequisito bloqueante de la
build de release**, no como cambio de código.

**RESULT** Documentado. **Bloquea Fase 10** hasta confirmar cómo se inyecta el
token en el APK de producción.

---

## 3.7 Hallazgo F-13 — bypass de propiedad para el rol admin en la ingesta GPS

**Frontera:** backend. Fase y commit propios, separados de la UI de Mobile.

### Decisión de producto

Hipótesis a demostrar: *admin/dispatcher/supervisor pueden VER y administrar
tracking; sólo el actor que posee operacionalmente la unidad puede PUBLICAR
telemetría GPS.*

**CONFIRMADA.** Evidencia:

1. **El modelo de datos no admite un admin dueño de unidad.** `data/store.js:997`
   y `data/mongo-store.js:1931` asignan `vehicleId` únicamente si
   `role === "driver"`; `changeDriverVehicle` filtra por `role: "driver"`. Un
   admin siempre tiene `vehicleId === null`.
2. **Por tanto la excepción no era "el admin publica su unidad".** Con
   `actor.role !== "admin" && actor.vehicleId !== vehicleId`, el admin quedaba
   exento de toda comprobación de propiedad: podía publicar la posición de
   **cualquier unidad de su organización**. No es un permiso más amplio de lo
   necesario, es un permiso que el modelo nunca previó.
3. **Ningún flujo del producto lo necesita.** No hay cliente, script, seed ni
   simulador que publique GPS como admin. Los únicos productores son Mobile por
   REST (`POST /locations/update`) y por socket (`location:update`).
4. **Ver y administrar ya están cubiertos por otras autoridades**, y ninguna
   requiere publicar: lectura por `/locations/live` con `canViewAnalytics`,
   administración de rutas y asignaciones por `canManageRoutes`.

### CAUSE

`vehicle-location-ingestion.js` eximía al rol admin de la comprobación de
propiedad antes de aceptar el paquete.

### REPRO

Admin autenticado de la organización, por cualquiera de los dos transportes:

```
POST /api/locations/update  { vehicleId: "<cualquier unidad del tenant>", coordinates: {...} }
socket.emit("location:update", { vehicleId: "<cualquier unidad del tenant>", ... })
```

Aceptado, persistido en la unidad y difundido como `location:updated` a toda la
organización. La posición del teléfono del admin se convierte en la posición
oficial de una unidad que no opera.

### AUTHORITY

Un único predicado en el propio módulo de ingesta:
`canPublishVehicleTelemetry(actor, vehicleId)`.

Expresado como **identidad de asignación**, no como tabla de roles: el modelo ya
garantiza que sólo un conductor recibe `vehicleId`, así que la propiedad implica
el rol sin enumerarlo. Esto evita introducir una segunda tabla RBAC en backend.

### MINIMAL FIX

- Se elimina la excepción de admin.
- **Sin `if` nuevos en otros archivos**: un solo predicado, en el módulo que ya
  era la autoridad.
- **REST y Socket ya compartían `ingestVehicleLocation`** —
  `modules/locations/routes.js:79` y `sockets/index.js:996`, invariante que
  `rbac-integration.test.js:64` ya vigilaba—, así que ambos quedan protegidos por
  la misma comprobación sin tocar los transportes.
- **No se cambió** quién puede VER `/locations/live`, ni `routes.manage`, ni
  `analytics.view`.

### REGRESSION

`backend/test/vehicle-location-ingestion.test.js`:

| Caso | Esperado |
|---|---|
| driver + su propia unidad | acepta |
| driver + otra unidad | `403 forbidden_vehicle` |
| **admin + unidad** | `403 forbidden_vehicle` |
| supervisor + unidad (socket) | `403 forbidden_vehicle` |
| cross-tenant declarando esa unidad | `403 cross_tenant_vehicle` |
| ningún rechazo movió la posición | posición intacta |

Más el predicado probado en aislamiento. El caso admin falla contra el código
anterior, que lo aceptaba.

### RESULT

Corregido en backend, en commit propio.

---

## 3.4 Auditoría de los 20 casos

| # | Caso | Veredicto | Evidencia |
|---|---|---|---|
| 1 | Inicio sin permiso de ubicación | **OK** | `requestLocation` despacha `PERMISSION_DENIED` y libera el watcher |
| 2 | Permiso denegado y luego concedido | **OK** | `requestGenerationRef` invalida respuestas viejas; `lastAcceptedPointRef` se limpia al denegar |
| 3 | GPS apagado | **OK** | `hasLocationServicesEnabled` → `servicesEnabled: false` |
| 4 | Posición vieja/stale | **OK** | `shouldAcceptLocation` + `buildGpsFreshness` backend; cubierto por `tracking.test.ts` |
| 5 | Cambio de conductor/unidad | **OK** | `refreshAll` reconsulta la jornada si `user.vehicleId` cambió |
| 6 | Cambio de sesión/tenant con caché | **OK** | `cachedIdentityChanged` compara `id` y `organizationId` y llama `clearTenantCache` |
| 7 | Background → foreground | **OK** | `AppState 'active'` → snapshot, flush, socket, `refreshAll`; el engine reconcilia la propiedad nativa |
| 8 | Socket disconnect/reconnect | **OK** | `connectSocket` con backoff y heartbeat; sin polling paralelo |
| 9 | Doble publicación GPS | **OK** | throttle `shouldSyncVehicleLocation` + decisión temporal backend (`duplicate`/`out_of_order`) |
| 10 | Ubicación de una unidad ajena | **F-11 + F-13 — CORREGIDOS** | Mobile §3.2, backend §3.7 |
| 11 | Driver viendo ruta ajena | **OK** | `filterLiveLocationsForTenant` restringe rutas a los `routeIds` de sus propias unidades |
| 12 | Admin/dispatcher/supervisor ven lo permitido | **OK** | emisión a `org:{orgId}:role:{rol con canViewAnalytics}`, por capability |
| 13 | Dos unidades con rutas simultáneas | **OK** | `routes` y `vehicles` son colecciones independientes; sin estado global de "ruta activa" |
| 14 | Ruta revisada con unidad activa | **OK** | la geometría llega en cada `location:updated` / `locations/live`, no se cachea por sesión |
| 15 | Polyline/markers que sobreviven a la selección | **OK** | `resetSelectorRoute` y `setSelectorPlan(null)`; `use-map-selector.test.ts` cubre respuesta tardía y robo de cámara |
| 16 | ETA/distancia con datos stale | **OK** | `tracking.test.ts` cubre GPS no fresco y vencido; `unknown` no se conflaciona |
| 17 | Empty/loading/error escondiendo 4xx | **PARCIAL** | `MapDataRecovery` cubre datos; **no** cubre config ausente → F-12 |
| 18 | Mapbox token/config/fallback | **F-12 — DOCUMENTADO** | ver 3.3 |
| 19 | Dependencias duplicadas de estado | **OK** | un solo productor de ubicación (`OperationalBackgroundServices`); mapa y detalles leen del mismo store |
| 20 | Polling que duplique realtime | **OK** | no hay timer de mapa. `use-schedule-tick` es reloj de horario (60 s), `apiHealthcheckTimer` es sonda de red documentada, `socketHeartbeatTimer` es heartbeat |

---

## 3.5 Sospechas refutadas — no se tocan

- **`canCaptureLocalLocation` permite GPS a no-conductores.** Es correcto: leer la
  posición propia alimenta el "estás aquí" del mapa. No concede publicación, y
  tras F-11 la publicación exige propiedad.
- **`canCaptureLocalLocation` acepta `!authContext && accountType === 'operations'`.**
  Ventana deliberada para una sesión restaurada de caché mientras `/auth/me`
  reconcilia. No concede publicación ni datos empresariales.
- ~~**El rol admin exento de la comprobación de propiedad en backend.**~~
  Reclasificado: **no** era una decisión de producto sino un agujero de
  autoridad. Ver **F-13** en §3.7.
- **`communication.rtc.access` declarada y no aplicada.** Consistente en ambos
  lados; se revisa en Fase 8.

---

## 3.6 Cierre

```
MAP_GPS_CODE_CERTIFIED: PASS
```

Dos salvedades explícitas:

1. Es certificación **de código**. F-12 no bloquea el código pero **bloquea la
   build de release**.
2. El cierre extremo a extremo de F-11 obligó a **corregir a la baja el repro
   original** (§3.2) y produjo **F-13**, un cambio en backend con commit propio
   (§3.7). La declaración anterior de `PASS` fue prematura: se emitía mientras
   Mobile y backend aplicaban políticas distintas sobre quién publica telemetría.
   Ahora aplican la misma.

**Gates exactos**, sobre `e2a2a27`, en `mobile/`:

```
npx tsc --noEmit     exit 0
npx eslint .         0 errores, 32 warnings (no-void, preexistentes)
npm test             61 suites, 358 tests, todos PASS
```

Suites relevantes de esta fase: `location-eligibility.test.ts` (5),
`use-location-engine.test.ts`, `use-map-selector.test.ts` (4),
`tracking.test.ts`, `location-service.test.ts`, `map-style-urls.test.ts`,
`bottom-tracking-panel.test.ts`, `background-location-authority.test.js`,
`background-location-security.test.js`.

**Deuda restante** (sin abrir, según instrucción): F-05, F-06, F-07, F-08.
Nueva: **F-12**, prerequisito de Fase 10.

**Requiere Android físico:**

- permiso "Permitir siempre" y continuidad del servicio en background real;
- comportamiento con GPS apagado a nivel de sistema y reactivado;
- deriva de precisión real frente a `MAX_ACCEPTED_ACCURACY_METERS`;
- continuidad de publicación con pantalla apagada y app en background;
- reconexión de socket al recuperar red móvil real;
- render de teselas Mapbox con el token de producción inyectado (F-12);
- consumo de batería del watcher en jornada larga.
