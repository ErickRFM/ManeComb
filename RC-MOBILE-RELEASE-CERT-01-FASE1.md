# RC-MOBILE-RELEASE-CERT-01 — FASE 1: Arranque y sesión

**Estado:** auditoría CERRADA. Certificación física pendiente (Fase 11).
**Base:** `af46bfa840e19f39605f437f870be15786d7d630`
**Rama:** `claude/mobile-release-cert-20260809`

---

## 1.1 Resolución de hallazgos de Fase 0

| ID | Estado | Commit |
|---|---|---|
| F-01 splash muerto | **CORREGIDO** | `9f1abeb` |
| F-02 loader permanente tras signOut concurrente | **CORREGIDO** | `71761de` |
| F-03 divergencia router / mobile-authority | **CORREGIDO** | `f033c88` |
| F-04 `/checklist` con `routes.manage` | **REFUTADO** — ver 1.2 | — |
| F-05 socket por polling | documentado, fuera de Fase 1 | — |
| F-06 alias `getOperationalHome` | documentado, fuera de Fase 1 | — |
| F-07 escritura de storage falla en silencio | **NUEVO**, no bloqueante | — |
| F-08 `refreshAll` completo en cada foreground | **NUEVO**, no bloqueante | — |

### F-04 — REFUTADO COMO INCONGRUENCIA

`/checklist` conserva `routes.manage`. Existen dos superficies deliberadamente
distintas y compartir router de Express no las une:

```
Chofer   → Mapa → su unidad → su ruta → iniciar/pausar/finalizar SU jornada
Control  → owner/admin/dispatcher/supervisor → registros, rutas, asignaciones
```

Que `backend/src/modules/navigation/routes.js` sirva el self-service del
conductor no lo habilita en Control; backend mantiene las mutaciones
administrativas protegidas con `canManageRoutes`. No se cambia producto porque
varios endpoints vivan en el mismo router.

Queda pinchado por test: `mantiene al conductor fuera de Control aunque opere su
propia jornada`.

---

## 1.2 Corrección de F-03 — una sola autoridad

`route-registry` ya no llama a `hasEnterpriseCapability`. Declara **qué autoridad
gobierna cada ruta** y consume esa decisión:

```
/usuarios  → canLoadMobileDirectory   (mobile-authority)
/checklist → canUseMobileControl      (mobile-authority)
```

No se copiaron tablas de roles al router. La compatibilidad legada vive
exclusivamente en `mobile-authority.ts`.

- Con `capabilities` explícitas → backend es autoridad, **sin fallback**.
- Sin el contrato → aplica la compatibilidad de `mobile-authority`, la misma que
  autoriza el `GET /users` correspondiente.
- Control **no** tiene tabla legada: es superficie administrativa y sin contrato
  explícito se niega en vez de adivinar por rol. Conceder acceso administrativo
  por tabla de roles sería exactamente la segunda autorización que hay que
  evitar.

Regresión para los dos casos exigidos, en `route-registry.test.ts`:
sesión moderna (`resuelve Directorio con la misma autoridad que usa el store`) y
sesión heredada sin `capabilities` (mismo test + `niega Control cuando la sesión
no trae el contrato de capabilities`).

---

## 1.3 PR histórico #55 — clasificación

`fix/mobile-startup-stability-20260806`, abierto contra `main@1d30cb95`.
**No mergeado, no cherry-picked.** Leído con `gh pr diff 55` y contrastado línea
por línea contra la base actual.

| Causa declarada en #55 | Clasificación | Evidencia en la base actual |
|---|---|---|
| `/sync-error` mostraba loader pasivo sin solicitud activa | `YA_ABSORBIDO` | `mobile-account-gate-screen.tsx` contiene `reason === 'sync_error' && isRefreshing && !error`; pinchado en `startup-stability.test.js` |
| El GET de sesión de 75 s podía repetirse por el interceptor | `YA_ABSORBIDO` | `getSessionRequest` coldStart lleva `_skipNetworkRetry: true` |
| Refresh token rotatorio marcado como reintentable | **`TODAVIA_APLICA`** | Ver 1.4 |
| El fallback offline descartaba `cached.authContext` | `YA_ABSORBIDO` | `initialize` usa `...cachedState` y `hasCachedAuthority` |
| El arranque mezclaba autenticación con bypass de ubicación | `YA_ABSORBIDO` | No existe `continueWithoutLocation` ni `onContinue` |
| `signIn` esperaba cargas opcionales antes de navegar | `YA_ABSORBIDO` | `void get().refreshAll();`, no `await` |

El hunk de `initialize()` de #55 es **idéntico** al estado actual: ese trabajo ya
entró por otra vía.

`NUEVO_HALLAZGO_ACTUAL` — dos cosas que #55 no vio y siguen vivas en su rama:
conservaba `splashHiddenRef` (F-01) y no tocaba `clearSessionState` (F-02).
Ambas corregidas aquí.

## 1.4 `TODAVIA_APLICA` — replay del refresh token rotatorio

#55 arregló la política en `refreshSessionRequest` pero **no** en el camino
propio del interceptor, que es el que corre en cada 401 real:

`client.ts::refreshAccessToken` emitía `POST /auth/refresh` con
`_allowRetry: true`. `shouldRetryRequest` reintenta hasta `MAX_NETWORK_RETRIES = 2`
ante `408/425/429/500/502/503/504` o error de red.

Backend (`backend/src/modules/auth/routes.js:289`) **rota** el token
(`rotateRefreshToken`) y además monta `refreshLimiter`, que responde `429` — un
código explícitamente retryable.

**Reproducción:** con el tier gratuito de Render, un `502`/`504` o una respuesta
perdida en red móvil tras haber rotado el token en servidor. El reintento manda
el token ya consumido → `rotateRefreshToken` falla → `401 "Sesion expirada o
revocada"` → `onSessionExpired` → sesión cerrada. El usuario pierde una sesión
que era válida.

Corregido en `ce547cd`: misma regla que `refreshSessionRequest`, este token no se
reintenta nunca. Pinchado en `applies the same no-replay policy to the
interceptor refresh path`.

**Frontera:** la causa es de Mobile (política de reintento del cliente). Backend
se comporta correctamente al rechazar un token consumido. No se tocó backend.

---

## 1.5 Matriz de arranque y sesión

Auditoría a nivel de código sobre la base + los commits de esta fase.

| # | Escenario | Autoridad / camino | Resultado |
|---|---|---|---|
| 1 | Bootstrap sin sesión | `initialize` `if (!t)` → estado vacío, `isHydrated: true` | **OK** → `/login` |
| 2 | Sesión persistida | `getStoredItem(TOKEN_KEY)` → `setAuthToken` → `/auth/me` | **OK** |
| 3 | Token expirado | interceptor `isAuthRefreshCandidate` → `refreshAccessToken` → replay del request original | **OK** |
| 4 | Refresh válido | `rotateRefreshToken` → `onTokenRefresh` → `applyRefreshedSession` | **OK** |
| 5 | Refresh inválido/revocado | `401` de `/auth/refresh` → `onSessionExpired` → `clearSessionState` | **OK** (endurecido por F-02 y `ce547cd`) |
| 6 | Storage corrupto | `loadOfflineCache().catch(() => null)`; `JSON.parse` en try/catch | **OK** |
| 7 | Storage restringido | `withStorageTimeout` + catch → `null` → tratado como sin sesión | **OK funcional** — ver F-07 |
| 8 | signOut concurrente con `/auth/me` en vuelo | `beginSessionEpoch` + `clearSessionState` dueño del estado de arranque | **CORREGIDO** (era loader permanente) |
| 9 | Servidor lento | `COLD_START_SESSION_TIMEOUT_MS`; aviso a los 7 s (`BOOT_SLOW_NOTICE_MS`) | **OK** |
| 10 | Servidor caído | con caché → `stateFromCache`; sin caché → pantalla de recuperación | **OK** |
| 11 | Timeout | `isTimeoutError` → mensaje propio | **OK** |
| 12 | Pérdida de Internet | `subscribeMobileNetwork` → `networkStatus: 'offline'` | **OK** |
| 13 | Recuperación de Internet | `reachable && user` → `connectSocket` + `flushPendingSync` | **OK** |
| 14 | Background → foreground | `AppState 'active'` → presencia, snapshot, flush, socket, `refreshAll` | **OK** — ver F-08 |
| 15 | Cierre y reapertura | equivalente a #2 | **OK** |
| 16 | Usuario deshabilitado/suspendido | `401` + `ACCOUNT_SUSPENDED` → `onAccountSuspended` → `/acceso-suspendido` | **OK** |
| 17 | Organización ausente | `mobileBlockReason: 'missing_tenant'` → `/plan-blocked`; `cachedIdentityChanged` limpia caché por `organizationId` | **OK** |

### F-07 — la escritura de storage falla en silencio

`setStoredItem` (`root-store.ts:445`) traga cualquier error. Si SecureStore está
restringido, la sesión **nunca** se persiste y el usuario vuelve a `/login` en
cada arranque sin ninguna señal de por qué. Funcionalmente seguro, diagnóstico
imposible. No bloquea Fase 1.

### F-08 — `refreshAll` completo en cada foreground

`root-store.ts:1696` dispara `refreshAll()` en cada transición a `active`: un
`/auth/me` más ~11 peticiones en paralelo. En el tier gratuito de Render, alternar
de app cada pocos segundos genera una carga desproporcionada. No bloquea Fase 1;
candidato natural junto a F-05.

---

## 1.6 Gates ejecutados

En `C:/proyectos/manecomb-claude-mobile/mobile`, sobre `872ee62`:

```
npm install          exit 0
npx tsc --noEmit     exit 0
npx eslint .         0 errores, 32 warnings (no-void, preexistentes)
npm test             60 suites, 354 tests, todos PASS
```

`npm test` ejecuta `run-point-to-point-test.mjs` seguido de `jest --runInBand`,
según `package.json`. No se inventaron comandos.

**Sin ejecutar todavía:** APK, instalación física, prueba en Android real.

---

## 1.7 Estado

```
Fase 0: CLOSED
Fase 1: CLOSED (auditoría) — certificación física pendiente

MOBILE_ARCHITECTURE_RECONSTRUCTED: PASS
MOBILE_STARTUP_CERTIFIED: BLOCKED hasta completar matriz física (Fase 11)
```

La matriz 1.5 está cerrada a nivel de código y con regresión automatizada donde
era posible. **No se declara `MOBILE_STARTUP_CERTIFIED`** porque ningún escenario
se ha ejecutado sobre un APK instalado en un Android real, que es el criterio que
esta certificación exige.

Limitación de evidencia declarada: `root-store.ts` no se puede importar bajo Jest
sin construir una capa de mocks nativos que el repositorio no tiene (falla en
`@react-native-async-storage/async-storage`). Por eso los invariantes de arranque
se fijan con contract tests sobre el fuente, siguiendo la convención ya existente
en `startup-stability.test.js`. Es evidencia más débil que una prueba de
comportamiento y se declara como tal.
