# RC-MOBILE-RELEASE-CERT-01 — FASE 0: Reconstrucción del sistema Mobile

**Estado:** CLOSED. Hallazgos, sin cambios de código.
**Resolución de cada hallazgo:** ver `RC-MOBILE-RELEASE-CERT-01-FASE1.md` §1.1.
F-04 quedó **REFUTADO** tras la revisión transversal: `/checklist` conserva
`routes.manage`.
**Base:** `af46bfa840e19f39605f437f870be15786d7d630`
**Rama:** `claude/mobile-release-cert-20260809`
**Worktree:** `C:/proyectos/manecomb-claude-mobile` (limpio, exactamente en la base)
**Frontera:** `mobile/**` (lectura de todo el repo permitida)

---

## 0.1 Confirmación de base

```
git rev-parse HEAD          -> af46bfa840e19f39605f437f870be15786d7d630
git status --short          -> (vacío)
```

Topología verificada:

- `origin/main` (`2c5d63e`) **es ancestro** de la rama de certificación.
- La rama de certificación tiene **202 commits** que `origin/main` no tiene.
- `main` local (`09be4ec`) está 46 commits detrás de `origin/main` y **no** contiene la base.

Es decir: la base acordada es la línea más avanzada del repositorio, no un punto
antiguo. Trabajar desde aquí no descarta trabajo ajeno.

> Nota de entorno: `C:/proyectos/manecomb-claude-mobile/.git` pertenece a
> `BUILTIN\Administradores`, no al usuario. Git rechaza operar ahí sin excepción.
> Esta fase usó `git -c safe.directory=...` por invocación para **no** mutar la
> configuración global del usuario.

---

## 0.2 Cadena real: Login → Screens

Reconstruida desde código, no desde documentación previa.

```
index.js
 └─ App.tsx                                  (único entrypoint React)
     └─ useAppStore.initialize()             root-store.ts:1891
         ├─ configureMobileRuntime(set,get)  api/mobile-runtime.ts
         ├─ beginSessionEpoch / getSessionEpoch   store/session-epoch.ts
         ├─ getStoredItem(TOKEN_KEY|REFRESH_TOKEN_KEY|MODE_KEY|THEME_KEY)
         ├─ loadOfflineCache()               api/offline-cache.ts
         ├─ getSessionRequest({coldStart})   -> GET /auth/me
         │    └─ 401 → interceptor Axios     api/client.ts   (única autoridad de refresh)
         ├─ getAuthContextFromPayload(s)     -> authContext
         ├─ connectSocket(set,get)           root-store.ts:1069  (única instancia io())
         └─ shouldRefreshOperationalData()   -> refreshAll()
                                                root-store.ts:801 → canRefreshMobileOperations
```

Autoridad de sesión: **una sola**. `root-store.ts` es dueño de `token`,
`refreshToken`, `user`, `authContext`, `socket`. No hay segunda máquina de sesión.

Autoridad de enrutamiento post-login: **una sola**.
`utils/account-routing.ts::resolveMobilePostLoginRoute` — consumida por
`getAuthenticatedHome` y `getOperationalHome`, que son el mismo cálculo
(`getOperationalHome` delega literalmente en `getAuthenticatedHome`).

Autoridad de capabilities: **una sola**, `utils/mobile-authority.ts`.
`root-store` no reimplementa reglas: `shouldRefreshOperationalData` es un alias
de `canRefreshOperationalData`, que es un alias de `canRefreshMobileOperations`.

Autoridad de navegación: **una sola**, `navigation/route-registry.ts`.
`canUserAccessRoute` es consumida por `router.tsx:107`, `App.tsx:355` y
`desktop/desktop-navigation.ts:111` — el drawer y el router comparten la misma
función, no hay dos tablas.

Autoridad de Socket.IO: **una sola**. `root-store.ts:151` (`let socket`).
`features/calls/call-store.ts` no crea socket: recibe el compartido vía
`bindSocket`. La única otra instancia `io()` está en
`native/call-action-headless-task.ts:32`, que corre con la app muerta (headless
JS task) — contexto legítimamente separado, no autoridad paralela.

### Cadena operativa

```
Empresa/organizationId → user.vehicleId → activeRouteSession → deviceLocation → mapa
   root-store           root-store        services/route-session-actions.ts
                                          screens/map/hooks/use-location-engine.ts
                                          screens/map/hooks/use-location-sync.ts
```

`App.tsx::OperationalBackgroundServices` es el único productor de ubicación:
`useLocationEngine` escribe `deviceLocation` en el store y `useLocationSync` la
emite. El mapa y el panel de detalles leen del store. **No hay dos productores de
GPS en foreground.** (Falta certificar `native/background-location.ts` como
productor de background — Fase 3.)

---

## 0.3 Hallazgos

Cada hallazgo es reproducible por lectura de código en la base indicada.

### F-01 — Maquinaria de splash completamente muerta (`App.tsx`)

`splashHiddenRef` se **escribe** en 5 lugares y no se **lee** en ninguno. No
existe ningún módulo de splash nativo en el proyecto (`react-native-splash-*`,
`SplashScreen`: 0 resultados en `src/`, `App.tsx`, `index.js`, `package.json` y
`android/app/src/main/java`).

Consecuencia: un `useRef`, un `useCallback`, **tres `useEffect`** (uno con
`setTimeout` de 2500 ms que se re-arma en cada render que cambie `hideSplash`) y
un handler `onLayout` en el `GestureHandlerRootView` raíz existen para no hacer
nada. Es exactamente el tipo de lifecycle fantasma que la Fase 1 debe eliminar.

- Evidencia: `mobile/App.tsx:507,523-525,554,568,578-580,641`
- Clasificación: código muerto. **Se elimina, no se evoluciona.**

### F-02 — `initialize()` puede dejar la app en loader permanente

`initialize()` hace `set({ isBootstrapping: true })` al entrar y tiene **dos
salidas tempranas** por epoch obsoleto que retornan sin restaurar el flag:

- `root-store.ts:1937` — `if (isSessionEpochStale(epoch)) return;` (dentro del `catch`)
- `root-store.ts:1998` — `if (isSessionEpochStale(epoch)) return;` (camino feliz)

En ambos casos quedan `isBootstrapping: true` e `isHydrated: false`. En `App.tsx`
eso significa `isReady === false` y `bootstrapFailed === false`, por lo que la UI
renderiza `<BrandSyncLoader />` **hasta agotar `BOOT_SYNC_TIMEOUT_MS = 80000`**.

El epoch se invalida en `beginSessionEpoch()`, que `signOut()` llama de primero
(`root-store.ts:2063`). Repro: `signOut` concurrente con un `initialize` en vuelo
(botón "Reiniciar sesión" de la pantalla de recuperación, o logout durante un
cold start lento de Render) → **80 segundos de loader que no corresponde a
ninguna operación real**.

- Clasificación: bug de lifecycle. Causa estructural, no cosmética.
- Relación: es el mismo síntoma que el usuario ya registró como
  "banner Servidor no disponible en cold start de Render", pero la causa aquí es
  distinta e independiente.

### F-03 — Divergencia de autoridad entre `route-registry` y `mobile-authority`

`mobile-authority.ts` aplica un patrón consistente: si el backend emitió
`capabilities`, manda `capabilities`; si es una sesión legada **sin** el array,
cae a una tabla de roles de compatibilidad (`hasExplicitCapabilities`).

`route-registry.ts::canUserAccessRoute` **no** aplica ese patrón: para rutas con
`requiredCapability` devuelve directamente `hasEnterpriseCapability(...)`, que
retorna `false` cuando `capabilities` es `undefined`.

Resultado, para una sesión legada `owner`/`admin`/`supervisor` sin `capabilities`:

| Camino | Decisión |
|---|---|
| `canLoadMobileDirectory(user)` → store llama `GET /users` | **permitido** (fallback legado) |
| `canUserAccessRoute('/usuarios', user)` → router | **denegado** → redirect a `/mapa` |

Es literalmente el caso "API disponible pero pantalla escondida" de la Fase 2. La
app descarga el directorio y luego esconde la pantalla que lo muestra.

- Evidencia: `route-registry.ts:63-72` vs `mobile-authority.ts:47-49,90-99`
- Consumidores afectados: `router.tsx:107`, `App.tsx:355`, `desktop-navigation.ts:111`
- Clasificación: **una de las dos autoridades está mal**. No se resuelve
  añadiendo una excepción; se resuelve decidiendo si el fallback legado sigue
  siendo legítimo y aplicándolo en un solo lugar.

### F-04 — `/checklist` exige `routes.manage` sin respaldo verificado

`route-registry.ts:43` condiciona `/checklist` a `ENTERPRISE_CAPABILITY.routesManage`.
`routes.manage` **no aparece en ningún otro punto de `mobile/src`** fuera de la
declaración de la constante y de esa línea. La pantalla `checklist-screen.tsx`
(1513 líneas) no verifica la capability; el store tampoco filtra su carga por
ella.

Antes de tocar nada hay que confirmar contra backend qué capability protege
realmente los endpoints de checklist/control. Si no es `routes.manage`, un
conductor con jornada activa puede estar viendo un redirect a `/mapa` al abrir
Control.

- Clasificación final: **REFUTADO COMO INCONGRUENCIA**. Control y el
  self-service de jornada del conductor son dos superficies deliberadamente
  distintas; compartir router de Express no las une. Backend protege las
  mutaciones administrativas con `canManageRoutes`. `/checklist` conserva
  `routes.manage`. Detalle en `RC-MOBILE-RELEASE-CERT-01-FASE1.md` §1.1.

### F-05 — El socket se descubre por polling en vez de ser estado reactivo

`store/use-app-store.ts::useSharedRealtimeSocket` sondea
`readSharedRealtimeSocket()` cada `25 ms` hasta `160` intentos (≈4 s) para
enterarse de que el store ya creó el socket.

La causa es que `socket` vive en una variable de módulo (`root-store.ts:151`) y
no en el estado de Zustand, así que ningún consumidor puede suscribirse a él.
`shared-realtime-socket.ts` existe únicamente para decidir cuándo seguir
sondeando.

Además, el mismo hook dispara `refreshAll()` como "cold start recovery"
(`use-app-store.ts:25-48`) cuando no encuentra socket — un `GET /auth/me`
completo lanzado desde un hook de UI para recuperar un socket.

- Clasificación: fallback que esconde un problema estructural (socket no
  reactivo). Es el candidato correcto para Fase 6/7/8: **no reescribir Chat ni
  Radio si el defecto está aquí.**

### F-06 — `getOperationalHome` es un alias sin diferencia

`account-routing.ts:155-160`: `getOperationalHome` llama a `getAuthenticatedHome`
con los mismos argumentos y devuelve lo mismo. Se importan por separado en
`App.tsx:44` y se usan en `InitialRoute`, `OperationalRoute`, `ApplicationRoute`
y en el listener de push, sugiriendo una distinción que no existe.

- Clasificación: deuda de nomenclatura, riesgo bajo. Colapsar en Fase 2 junto con
  F-03 para no tocar `account-routing.ts` dos veces.

---

## 0.4 Lo que NO es un hallazgo

Registrado para que fases posteriores no lo re-litiguen:

- `map-screen.native.tsx` / `map-screen.web.tsx` / `app-map.native.tsx` /
  `app-map.web.tsx` son splits de plataforma de Metro, **no** duplicación.
- `src/desktop/` no es un router paralelo: consume `canUserAccessRoute` del
  registry único.
- `features/calls/call-store.ts` no es una segunda autoridad RTC: recibe el
  socket compartido por inyección.
- `native/call-action-headless-task.ts` crea su propio socket porque corre sin
  proceso JS de la app. Es correcto.

---

## 0.5 Tablero de certificación

| Marca | Estado | Causa |
|---|---|---|
| `MOBILE_ARCHITECTURE_RECONSTRUCTED` | **OK** | Esta fase |
| `MOBILE_DUPLICATE_AUTHORITIES_REMOVED` | **BLOCKED** | F-03 sin resolver; F-01/F-05 sin eliminar |
| `MOBILE_STARTUP_CERTIFIED` | **BLOCKED** | F-02 (loader de 80 s) y F-01 (lifecycle muerto) |
| `MOBILE_AUTH_CERTIFIED` | **BLOCKED** | Fase 1 no ejecutada |
| `MOBILE_NAVIGATION_CERTIFIED` | **BLOCKED** | F-03, F-04 |
| `MOBILE_MAP_CERTIFIED` | **BLOCKED** | Fase 3 no ejecutada |
| `MOBILE_GPS_CERTIFIED` | **BLOCKED** | Falta certificar productor de background |
| `MOBILE_JOURNEY_CERTIFIED` | **BLOCKED** | Fase 4 no ejecutada |
| `MOBILE_PROFILE_CERTIFIED` | **BLOCKED** | Fase 5 no ejecutada |
| `MOBILE_DOCUMENTS_CERTIFIED` | **BLOCKED** | Fase 5 no ejecutada |
| `MOBILE_CHAT_CERTIFIED` | **BLOCKED** | Fase 6 no ejecutada; depende de F-05 |
| `MOBILE_RADIO_CERTIFIED` | **BLOCKED** | Fase 7 no ejecutada; depende de F-05 |
| `MOBILE_RTC_CERTIFIED` | **BLOCKED** | Fase 8 no ejecutada |
| `MOBILE_OFFLINE_RECOVERY_CERTIFIED` | **BLOCKED** | Fase 1/10 no ejecutadas |
| `MOBILE_ANDROID_BUILD_GREEN` | **BLOCKED** | Fase 10 no ejecutada |
| `MOBILE_PHYSICAL_TEST_MATRIX_READY` | **BLOCKED** | Fase 11 no ejecutada |

---

## 0.6 Orden de ejecución propuesto

1. **F-01** — eliminar splash muerto. Aislado, sin dependencias, riesgo nulo.
2. **F-02** — reparar salidas de `initialize()`. Causa del loader fantasma.
3. **F-04** — verificar contra backend qué capability protege checklist.
4. **F-03 + F-06** — unificar la autoridad de capabilities en un solo lugar.
5. **F-05** — hacer el socket estado reactivo y retirar el polling.

F-01 y F-02 son Fase 1 y son independientes entre sí: dos commits separados.
