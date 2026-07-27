# RC-MOBILE-CALL-01 — Fase 1 (read-only): llamada sin audio + elemento rojo encimado

> **Estado:** Fase 1 cerrada, **solo lectura, cero cambios** (diff vacío). Dos problemas de causa distinta, **subsistemas distintos** → fixes independientes (confirmado al final).
> **Nota metodológica:** NO me apoyé en `RC-WEBRTC-CERTIFICATION-01.md` — es una auditoría **desactualizada** (sus líneas no coinciden con el árbol; afirma "falta getUserMedia" pero el código actual SÍ lo tiene en `use-chat-controller.ts:305-336`). Todo lo de abajo está verificado contra el árbol real.

Stack RTC: **`react-native-webrtc`** (`mobile/src/native/webrtc.ts:48-53`). Signaling: **socket.io** (`use-chat-controller.ts:146`).

---

## Problema A — Sin audio (GRAVE)

### El pipeline de media está COMPLETO en código (descarto "falta un paso")
| Paso | Dónde | Estado |
|---|---|---|
| Permiso de micrófono | `use-chat-controller.ts:315-319` (`requestRecordingPermissionsAsync`, verifica `.granted` antes de capturar) | ✅ |
| Captura local (`getUserMedia`) | `:326-330` (`audio:true`) | ✅ |
| `addTrack` al peer | `:229-233` (itera `localStream.getTracks()`) | ✅ |
| Offer con `offerToReceiveAudio` | `:379-382` | ✅ |
| Answer | `:449-450` | ✅ |
| `ontrack` → `remoteStream` | `:247-264` (setea `phase:'connected'`) | ✅ |

El audio remoto en react-native-webrtc se reproduce automáticamente al conectar ICE (no requiere paso de "play" para audio). **El pipeline no es el problema.** El problema es que **el peer nunca se conecta** (o nunca se construye). Ordenado por probabilidad con la evidencia:

### 🔴 Causa #1 (la más probable — explica el "1 en cabina" literal): no hay señal de llamada entrante → el otro extremo nunca entra a la sala RTC
El callee entra a la sala **únicamente** por el efecto "Join RTC room when entering a conversation" ([`use-chat-controller.ts:770-791`](mobile/src/screens/chat/hooks/use-chat-controller.ts)): emite `rtc:join` **solo si tiene esa conversación abierta** (`activeConversation.id`). **No existe** ningún `rtc:call`/`rtc:ringing`/push que meta al callee a la sala cuando está en otra pantalla. `startCall` (:793-848) solo une **al que llama**.

Consecuencia con "ambos online" pero el callee no en esa conversación:
- Solo el caller está en la sala → `callParticipants.length === 1` → la píldora `Math.max(callParticipants.length,1)` muestra **"1 en cabina"** ([chat-screen-view.tsx:468](mobile/src/screens/chat/components/chat-screen-view.tsx)).
- El handler `rtc:participants` hace `others = participants.filter(...)`; con `!others.length` **retorna sin construir peer** ([:350-362](mobile/src/screens/chat/hooks/use-chat-controller.ts)) → **no hay offer, no hay ICE, no hay media**.
- El timer corre igual porque arranca en `joinedAt` (`:827`), no en la conexión de media.

Esto reproduce **exactamente** el síntoma: panel abierto, "1 en cabina", timer corriendo, sin audio. La caption del tile remoto queda en **"Esperando respuesta"** (`chat-screen-view.tsx:396-400`) porque `phase` nunca llega a `'connected'`.

### 🔴 Causa #2 (muerde en cuanto ambos SÍ están en la sala, sobre todo entre redes distintas): TURN no desplegado → ICE solo-STUN
`backend/src/services/rtc-config.js:38-75` agrega TURN **solo si hay env vars**; si no, devuelve `turnEnabled:false`, **solo STUN**. Y:
- `backend/.env.example:93-98`: `TURN_URLS/USERNAME/CREDENTIAL/SECRET/REALM` **vacías**.
- `docs/CALLING-ARCHITECTURE.md:58`: *"Config STUN/TURN … **Pendiente solo de desplegar coturn**"*; `:309` verificación requiere `turnEnabled:true`; `:421` *"TURN entre redes distintas … **no se puede certificar**"*.
- Default del cliente también solo-STUN: `use-chat-controller.ts:133-134` (`turnEnabled:false`).

Dos dispositivos en redes distintas (datos móviles vs wifi / CGNAT) **no establecen media sin un relay TURN**, aunque el signaling y el SDP completen. **Este es el ítem "CDR Phase 2 sin confirmar":** el medio-CDR de relay (`reportRelayUsage` → `socket.emit('rtc:stats', { usedRelay })`, `:175-210`) nunca puede reportar relay porque no hay TURN desplegado.

### 🟡 Causa #3 (agravante de #2): el fetch de ICE config es fire-and-forget con fallback silencioso a solo-STUN
`getRtcIceConfigRequest()` en `:156-160` **no se await-ea** y su `.catch()` deja el default solo-STUN (`:133`). Si la petición a `/rtc/config` falla o llega tarde respecto al inicio de la llamada, el peer se construye (`:224-226`) con solo-STUN aunque el backend tuviera TURN.

### Cómo discriminar #1 vs #2 (para el alcance de Fase 2)
La **píldora de participantes es el discriminador**: como fue reportada **"1 en cabina"**, el match es **#1** (el otro extremo no está en la sala → falta ring). Si en el repro real la píldora mostrara **"2 en cabina"** con audio ausente, entonces domina **#2** (TURN). Ambas deben cerrarse: **#1 es la compuerta para que existan dos peers; #2 es la compuerta para que el media cruce entre redes.**

---

## Problema B — Elemento rojo sin etiqueta encimado (visual)

### 7. Panel de llamada activa y sus elementos
[`chat-screen-view.tsx:383-479`](mobile/src/screens/chat/components/chat-screen-view.tsx), `callHub`:
- Header: título "Cabina en vivo" + `StatusPill` (`callStatusLabel`, tono `callTone` — **nunca danger**, el tipo es `positive|warning|neutral`, `use-chat-controller.ts:889`).
- `callStage` (:392): **2× `CallMediaTile`** (remoto `:393`, local `:404`).
- `callControlRow` (:420): **Silenciar** (`callControlButton`) · **cámara** (solo si `mode==='video'`) · **Colgar** (`callControlButtonDanger`).
- `callMetaRow` (:467): píldoras "N en cabina", timer.

### 8. El elemento rojo sin etiqueta y por qué se ve
**Hallazgo clave: `accent` ES ROJO** — `#D91E18` (claro) / `#E31E24` (oscuro) ([constants/theme.ts:117/155/189](mobile/constants/theme.ts)); es el rojo de marca, casi idéntico a `danger` (`#E24747`/`#D83B3B`). Por eso el panel tiene **varios** rojos:

| Elemento | Estilo | Color | ¿Etiqueta de texto? |
|---|---|---|---|
| Botón Silenciar | `callControlButton` (styles:740-750) | **accent = rojo** | Sí ("Silenciar") |
| Botón Colgar | `callControlButtonDanger` (styles:770-780) | danger = rojo | Sí ("Colgar") |
| **Icon-shell del tile remoto** | `callTileIconShell` (styles:705-714) | **accent = rojo** | **No — solo un icono `phone-outline`, 72×72** |

El **`callTileIconShell`** es el único rojo **sin etiqueta** ([message-media.tsx:449-457](mobile/src/screens/chat/components/message-media.tsx)): un cuadro rojo redondeado 72×72 con solo el icono de teléfono, que se pinta en el **fallback** del `CallMediaTile` cuando **no hay video en vivo** — es decir, en **toda llamada de audio** y mientras no llega media. (El icon-shell del tile local es azul `info`, `:715-717`; el rojo es el del **remoto**.)

**Por qué "encimado detrás de Colgar" — y el límite honesto de lo estático:**
`callHub` es una card en **flujo normal de columna** (padding, `gap:12`, sin `position:absolute` ni altura fija — styles:595-612), y `callStage` va **antes** de `callControlRow`. Con estos estilos **el icon-shell no queda estáticamente detrás de Colgar** — es decir, **no hay un `position:absolute`/`zIndex` mal puesto en el panel que lo explique**. Los mecanismos runtime que sí producen ese solapamiento en Android, en orden:
1. **`RTCView` (SurfaceViewRenderer) y su `zOrder: isSelf ? 1 : 0`** ([message-media.tsx:429-445](mobile/src/screens/chat/components/message-media.tsx)): en Android el `SurfaceView` se pinta en un plano aparte que z-pelea con las vistas RN hermanas; el self-view (`zOrder:1` = mediaOverlay) puede encimarse sobre los controles. **Solo aplica en videollamada** (el fondo del surface es `#000000`, no rojo).
2. Un desborde de altura del panel que empuje el tile (rojo) sobre los controles.

**No fuerzo un veredicto que el código estático no sostiene:** el elemento rojo sin etiqueta está identificado con alta confianza (`callTileIconShell`, rojo por `accent`), pero **el mecanismo exacto del encimado (surface z-order vs. overflow) requiere la captura / un repro audio-vs-video** para cerrarlo. Con la captura lo fijo en Fase 2. Contribuye además el **smell de diseño**: `accent` y `danger` son dos rojos casi iguales, así que el panel apila múltiples superficies rojas y el icon-shell rojo del remoto compite visualmente con el Colgar rojo.

---

## ¿A y B son independientes? — **Sí**
| | A (sin audio) | B (rojo encimado) |
|---|---|---|
| Subsistema | pipeline RTC / signaling / TURN | estilos del panel + render de tile |
| Archivos | `use-chat-controller.ts`, `backend/src/services/rtc-config.js`, `.env`, docs | `chat-screen-view.tsx`, `message-media.tsx`, `chat-screen.styles.ts`, `theme.ts` |
| Causa compartida | **No** | **No** |

**Correlación (no causa compartida):** el icon-shell rojo (B) se ve **porque** no hay `remoteStream` (síntoma de A) — al no conectar media, el tile remoto queda en fallback. Pero las **causas** son independientes: arreglar A (ring/TURN) no cambia que `accent` sea rojo ni el z-order; arreglar B (color/z-order) no restaura audio. **Fixes independientes.**

---

## Entregable / recomendación de alcance
- **A, causa raíz ordenada:** #1 **falta de ring → el otro extremo no está en la sala** (explica "1 en cabina", `use-chat-controller.ts:770-791` + `:350-362`); #2 **TURN no desplegado → solo-STUN** (`rtc-config.js` + `.env.example:93-98` + `docs:58/421`, = "Phase 2 sin confirmar"); #3 **fetch de ICE fire-and-forget con fallback solo-STUN** (`:156-160`). Discriminar por la píldora "N en cabina" en el repro.
- **B, causa raíz:** el rojo sin etiqueta es `callTileIconShell` (rojo por `accent=#D91E18`, icon-only, message-media.tsx:449-457 + styles:705-714); **no** hay `position/zIndex` mal puesto en el panel — el encimado es runtime (RTCView surface z-order en video, message-media.tsx:434, o overflow). Requiere la captura para fijar el mecanismo exacto.
- **Independientes:** sí.

**PROHIBIDO en esta fase (respetado):** cero cambios; no propuse fixes; no asumí causa compartida (la descarté con evidencia); no toqué el panel/signaling para probar; no toqué portal, snapshot, la rama UI ni App.tsx admin. Diff vacío.
