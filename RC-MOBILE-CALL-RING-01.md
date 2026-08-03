# RC-MOBILE-CALL-RING-01 — Ring foreground (Fase A) para la llamada de radio

> **Estado:** Fase A implementada en rama `rc-mobile-call-ring-01` (commits `1b65a6f` backend, `9cba219` mobile; base incluye SOCKETAUTH `b9ee08b` + #4 `db81394`). **FALTA certificación en dispositivo.** Ataca la causa **#1** del "sin audio" (falta ring → "1 en cabina"). #2 (TURN) sigue siendo infra tuya; background/cerrada = Fase B (push VoIP).

## Problema (de RC-MOBILE-CALL-01)
El callee solo entraba a la sala RTC si tenía esa conversación abierta → "1 en cabina", sin peer, sin media. **La palanca:** el server puede alcanzar al callee por su sala `user:{id}` esté donde esté (dentro de la app).

## Qué se implementó (Fase A = ring completo, foreground)
### Backend ([sockets/index.js](backend/src/sockets/index.js), `1b65a6f`)
- **`rtc:call`**: valida al caller (`canUserAccessConversation`), resuelve los otros participantes (`getConversationById().participants`), y les emite **`rtc:incoming-call`** a su sala `user:{id}`. Registra la llamada pendiente + **timeout de timbre (35s)**. Sala llena (≥2) → `busy`.
- **`rtc:accept`**: emite `rtc:call-accepted` al caller. **`rtc:reject`**: `rtc:call-rejected`. **`rtc:cancel`** (caller): `rtc:call-cancelled` a los callees. Timeout → `rtc:call-timeout` + `rtc:call-cancelled`.
- La media sigue el flujo existente (`rtc:join` + offer/answer) **después** del accept.
- Seguridad: los callees salen de los participantes de la conversación del caller → misma org, sin fuga cruzada.

### Mobile (`9cba219`)
- **Caller** ([use-chat-controller.ts](mobile/src/screens/chat/hooks/use-chat-controller.ts) `startCall`): tras `rtc:join` emite `rtc:call` → "Llamando…". Listeners `rtc:call-rejected`/`timeout` cierran con aviso; `rtc:call-accepted` → "contestada, conectando".
- **Callee**: estado `incomingCall` + listener `rtc:incoming-call` (auto-reject si ya hay llamada = ocupado); `rtc:call-cancelled` quita el timbre. `acceptIncomingCall` (emite `rtc:accept` + media + `rtc:join`) / `rejectIncomingCall` (`rtc:reject`).
- **UI** ([chat-screen-view.tsx](mobile/src/screens/chat/components/chat-screen-view.tsx)): `Modal` de llamada entrante con nombre del que llama + **Aceptar/Rechazar**.

## Validación (build)
| | |
|---|---|
| Backend syntax (`node -c`) | **exit 0** |
| Backend tests (rtc-session-cdr, app-smoke, backend-architecture) | **verdes** |
| Mobile `tsc --noEmit` | **exit 0** |
| Mobile ESLint | **exit 0** (warnings: `no-inline-styles` del Modal + `no-shadow` preexistente de `reportRelayUsage`) |
| Mobile `npm test` | **26/26, 134/134** |
| **`gradlew assembleRelease`** | **BUILD SUCCESSFUL** |

## ⚠️ Limitaciones de Fase A (explícitas)
1. **Alcance del timbre:** la recepción vive en el **socket de la llamada** (chat controller), que solo está montado en la **pantalla de chat**. Hoy el callee timbra cuando está en el chat (cualquier conversación) — una gran mejora sobre "tener ESA conversación abierta", pero **no es global**. Para ring global-foreground (recibir en cualquier pantalla), mover la recepción de `rtc:incoming-call` al **socket compartido** (root-store) + estado/UI global → incremento **Fase A.2**.
2. **Background/cerrada:** NO cubierto — requiere push VoIP (**Fase B**, infra-gateada: FCM high-priority + APNs VoIP/CallKit).
3. **#2 TURN:** sin desplegar → media entre redes distintas puede fallar aunque el ring y el signaling funcionen. Infra tuya (coturn).

## Certificación en dispositivo (pendiente — el build NO cierra el RC)
Con dos teléfonos, ambos en la app (pantalla de chat), tras merge + recompilar:
1. A llama a B (B en el chat, otra conversación) → **B recibe el Modal de llamada entrante** (antes: nada, "1 en cabina").
2. B **Acepta** → la llamada conecta y **hay audio** (si ambos en misma red o hay TURN).
3. B **Rechaza** → A ve "Llamada rechazada".
4. A llama y B no contesta 35s → A ve "Sin respuesta", B deja de timbrar.
5. A cancela antes de que B conteste → B deja de timbrar.

Si el audio no fluye tras aceptar **con B aceptando y ambos en cabina ("2 en cabina")**, el bloqueo restante es **#2 TURN** (redes distintas), no el ring.

## Rollback
```
git checkout main   # los commits viven en rc-mobile-call-ring-01
```
o revertir `9cba219` (mobile) / `1b65a6f` (backend).
