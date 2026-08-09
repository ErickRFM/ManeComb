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

**REPRO**
Las coordenadas se producen bajo `canCaptureLocalLocation` (cualquier sesión móvil
autenticada, correcto: el mapa debe mostrar "estás aquí"), así que llegan al
publicador para cualquier rol.

1. Supervisor o dispatcher con `vehicleId` asignado, sesión móvil activa: publica
   en cada tick. Backend responde `403 forbidden_vehicle`
   (`vehicle-location-ingestion.js:99`). El rechazo sólo va a `mobileLog`, y cada
   intento consume `gpsLimiter`.
2. **Admin con `vehicleId` asignado: backend lo acepta.** La comprobación de
   propiedad es `actor.role !== "admin" && actor.vehicleId !== vehicleId`, es
   decir, el rol admin queda exento. La posición personal del admin se ingesta y
   se emite como posición de la unidad.

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
| 10 | Ubicación de una unidad ajena | **F-11 — CORREGIDO** | ver 3.2 |
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
- **El rol admin exento de la comprobación de propiedad en backend.** Es una
  decisión de backend fuera de la frontera de esta fase. Tras F-11, Mobile ya no
  la ejerce. No se modifica backend.
- **`communication.rtc.access` declarada y no aplicada.** Consistente en ambos
  lados; se revisa en Fase 8.

---

## 3.6 Cierre

```
MAP_GPS_CODE_CERTIFIED: PASS
```

Con una salvedad explícita: es certificación **de código**. F-12 no bloquea el
código pero **bloquea la build de release**.

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
