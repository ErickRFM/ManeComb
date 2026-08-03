# RC-MOBILE-SOCKETAUTH-01 — Ruta de re-auth del socket de tiempo real

> **Estado:** Implementado en rama `rc-mobile-socketauth-01` (commit `b9ee08b`, base = `main` unificado `3b58016`). **Solo el socket compartido (banner/radio); el de audio va en su propio RC.** **FALTA certificación en dispositivo** (4 escenarios abajo) — el build en verde NO cierra el RC.

## Raíz (confirmada en RC-MOBILE-SERVERBANNER-02)
El banner "Servidor no disponible", el "Sesión expirada" del radio y (probable) el "sin audio" de la llamada comparten raíz: los sockets de tiempo real hacen handshake con `auth: { token }` **fijado**, y no existía ruta "auth falla → refresca token → reconecta". Ante un `connect_error` de auth, socket.io marca la denegación **no recuperable** (`socket.active=false`) y `socketStatus` quedaba latcheado en `'error'` hasta reiniciar. El socket compartido lo usan **banner y radio** (`getSharedRealtimeSocket`, root-store.ts:148).

## Implementación (5 puntos del diseño aprobado)
1. **Re-auth reutilizable** — [`refreshRealtimeAuth(): Promise<string|null>`](mobile/src/store/root-store.ts) (single-flight vía `realtimeAuthRefreshInFlight`) + helper `applyRefreshedSession(result)`. Refresca con el **mismo** `refreshSessionRequest` que REST ([client.ts:487](mobile/src/api/client.ts)), actualiza el store y reconecta. Devuelve el token fresco (para que el audio re-autentique su socket en su RC) o `null` si la sesión murió.
2. **Auth vs transporte** — `connect_error` bifurca con [`isRealtimeAuthError(msg)`](mobile/src/utils/realtime-state.ts) (mismo criterio del radio: `unauthorized`/`invalid token`/`jwt`): auth → re-auth; timeout/transporte → comportamiento actual (`'reconnecting'`/`'error'`).
3. **Anti-loop** — `socketAuthRetries`, reseteado en el `'connect'` exitoso. **Exactamente 1 refresh por ciclo de auth-fail.** Refresh 401 o token nuevo rechazado otra vez → `clearSessionState`/`onSessionExpired` (sesión muerta real). Red/timeout **no** cuenta como intento de auth.
4. **Banner correcto** — nuevo `SocketStatus 'unauthorized'` (distinto de `'error'`) → `getRealtimeSnapshot` rama nueva **"Sesión expirada — vuelve a iniciar sesión"** (acción: **re-login** vía `signOut`), vs `'error'` = "Servidor no disponible" (server caído). Alineado con el `'unauthorized'` que el radio ya tenía.
5. **Unificación** — se quitó el `socket.disconnect().connect()` de `onTokenRefresh`; REST y auth-fail convergen en `applyRefreshedSession → connectSocket`. Como la `sessionKey` incluye el token ([root-store.ts:989](mobile/src/store/root-store.ts)), el refresh fuerza un socket **nuevo limpio** (disconnectSocket + socket nuevo con auth fresco), matando el footgun. **Un solo mecanismo de reconexión.**

## Verificación 2A (previa) — consumidores del socket compartido
Único consumidor externo: [radio-screen-view.tsx:509](mobile/src/screens/radio/radio-screen-view.tsx). `RadioRealtimeService` cachea la instancia pero **re-obtiene y re-adjunta limpio** en cada cambio de `socketStatus` (detach viejo + attach nuevo). Un `connectSocket` unificado transiciona `socketStatus`, así que el radio migra a la instancia nueva. **Unificar es seguro.**

## Validación (build)
| | |
|---|---|
| `tsc --noEmit` | **exit 0** |
| ESLint (3 archivos) | **exit 0** (el único warning `no-void` en root-store.ts:1135 es **preexistente**, no de este cambio) |
| `npm test` | **26/26 suites, 134/134** — baseline intacto |
| **`gradlew assembleRelease`** | **BUILD SUCCESSFUL** (exit 0) |
| Diff | `root-store.ts` (+100/−?), `realtime-state.ts` (+22), `connection-banner.tsx` (+26/−) — 3 archivos, +116/−32 |
| Fuera de alcance | `use-chat-controller.ts` (audio), mapas, portal, backend: **sin tocar** |

## ⚠️ FALTA certificación en dispositivo (el build en verde NO cierra el RC)
[usuario] debe verificar en el APK real, tras `git merge` a main + recompilar + reinstalar:
1. **Token expirado (o forzar expiración):** el socket **se re-autentica solo** y el banner desaparece **SIN reiniciar** la app.
2. **Refresh token también expirado:** el banner dice **"Sesión expirada — vuelve a iniciar sesión"** (no "Servidor no disponible"), y el botón **re-loguea**.
3. **Server realmente caído** (modo avión un momento): el banner dice **"Servidor no disponible"** (distinto del anterior).
4. **Radio:** con token expirado, tras la re-auth, la consola PTT pasa de **"Sesión expirada" → conectado** sin reiniciar.

Si algún escenario falla → paramos a revisar antes de dar por cerrado.

## Pendiente (RC aparte)
El **socket de audio** (`use-chat-controller.ts`) consumirá `refreshRealtimeAuth()` (ya exportado, devuelve el token) para re-autenticar su propia instancia — junto con las causas ring/TURN de `RC-MOBILE-CALL-01`.

## Rollback
```
git checkout main   # el commit vive en rc-mobile-socketauth-01
```
o `git revert b9ee08b`.
