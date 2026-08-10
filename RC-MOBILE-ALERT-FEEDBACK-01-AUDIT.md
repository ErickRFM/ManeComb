# RC-MOBILE-ALERT-FEEDBACK-01 — FASE 6A: auditoría previa

**Base:** `origin/main` @ `784e8b8caa849e178833b4d994163ebfe63f0525`
**Rama:** `claude/operational-alert-feedback-20260810`
**Estado:** auditoría cerrada. **Sin código todavía**, según el gate de la fase.
**RTC:** congelado. Nada de lo aquí propuesto toca `CHANNEL_CALLS`, el ringtone
ni el flujo de llamadas.

---

## 1. Cómo viajan realmente los campos

Confirmado leyendo `incidents/routes.js` → `notification-delivery.js` →
`fcm-notifier.js`.

| Campo | Socket `notification:created` | FCM `data` | Origen |
|---|---|---|---|
| `incidentId` | sí (`data.incidentId`) | **sí** | `incidents/routes.js:82` |
| `severity` | sí | **sí** | `incident.severity` crudo |
| `type` | sí | **sí, pero sobrecargado** | ver §2 |
| `category` | sí (`sos` \| `incident`) | **sí** | `deliverOperationalNotification` lo fuerza en `safeData` |
| `deepLink` | sí | **sí** | `/incidencias?incidentId=<id>[&focus=sos]` |
| `level` | sí (campo de la notificación) | **NO** | ver §3 |
| `organizationId` | no viaja en `data` | **NO** | sólo se usa server-side para enrutar |
| `vehicleId`, `routeId` | sí | sí | — |

Catálogo real que produce el backend hoy (`incidents/routes.js:69-76`):

```
severity === 'critical'  o  título que empieza por "sos"
    -> category = 'sos'       level = 'critical'
severity === 'high'
    -> category = 'incident'  level = 'warning'
resto
    -> category = 'incident'  level = 'info'
```

`incident.type` es texto libre del cliente: **no existe un catálogo cerrado en
backend**. Por eso la política debe apoyarse en `category` + `severity` (+`level`
una vez se reenvíe), y `type` sólo como dato de presentación. No se inventan
tipos.

---

## 2. `data.type` está sobrecargado

`fcm-notifier.js:93-96`:

```js
const type = String(payload.data?.type || (category === "call" ? "incoming_call"
             : category === "chat" ? "chat_message" : "notification")).trim();
```

Para chat/llamadas, `type` es un **discriminador de mensaje**. Para incidencias,
`payload.data.type` existe y es el **tipo de negocio de la incidencia**, así que
gana y `type` acaba valiendo p.ej. `"mecanica"`.

Consecuencia directa en Android (`ManeCombPushNotificationRenderer.kt:41`):

```kotlin
when (data["type"]?.trim()?.lowercase()) {
  "call_dismiss", ... -> renderCallDismiss(...)
  "incoming_call"     -> renderIncomingCall(...)
  else                -> if (!isAppInForeground(context)) showMessage(context, data)
}
```

Toda incidencia cae en `else`.

---

## 3. CAUSE — tres causas independientes

### C-1. Toda alerta operativa se renderiza como chat

`showMessage` está cableado a chat de principio a fin: `CHANNEL_CHAT`,
`MessagingStyle` con un `Person`, `CATEGORY_MESSAGE`, `setGroup(GROUP_CHAT)`,
fallback de deep link `/chat`, e id `stableId("chat:${conversationId.ifBlank { title }}")`.

Dos efectos:

- un SOS suena exactamente igual que un mensaje de chat;
- sin `conversationId`, el id se deriva del **título**. Dos incidencias distintas
  con el mismo título se **reemplazan** entre sí (relevante para las pruebas 11 y 12).

### C-2. El premisa de partida era parcialmente incorrecta: los canales ya existen

`ManeCombNotificationModule.kt` ya define `operacion-general`, `operacion-radio`,
`operacion-incidentes`, `operacion-emergencias`, `operacion-sos`, con un mapeador
`channelIdForCategory`. **Pero esa ruta sólo corre cuando JS está vivo**; el
renderer de FCM no la usa.

Además esos canales están sin diferenciar: `IMPORTANCE_HIGH` y poco más. **No
tienen** `setSound`, ni `AudioAttributes`, ni `vibrationPattern`, ni
`lockscreenVisibility`. `enableVibration(true)` sólo en emergencias y SOS.

> **Restricción Android que condiciona el diseño:** los ajustes de un canal son
> inmutables tras crearse. En un teléfono que ya instaló ManeComb, volver a
> llamar `createNotificationChannel` con sonido nuevo **no cambia nada**. Para
> entregar sonido y vibración diferenciados hay que **versionar los ids**. Es
> justamente la prueba 19 del listado.

### C-3. En foreground no hay ninguna reacción, y no hay consumidor de las alertas

`render()` sólo llama `showMessage` cuando la app **no** está en foreground.
Y en el lado JS:

- **no existe ningún handler de `notification:created`**;
- **no existe ningún handler de `incident:sos`**.

Los únicos consumidores son `incident:created` / `incident:updated`, que sólo
actualizan lista y mapa, en silencio.

Es decir: hoy un supervisor con la app abierta **no recibe ninguna señal audible
ni háptica** de un SOS. No es que suene mal: no suena.

---

## 4. REPRO

1. Conductor de la empresa A crea una incidencia `severity: critical`.
2. Backend: `category=sos`, `level=critical`, emite `notification:created` a los
   roles con `canManageIncidents`, `incident:sos`, y push FCM.
3. Supervisor con la app **abierta**: nada. Ningún sonido, ninguna vibración,
   ningún aviso. La incidencia sólo aparece en la lista.
4. Supervisor con la app **cerrada**: llega notificación en `CHANNEL_CHAT`, con
   el sonido de chat y estilo de mensaje.
5. Segunda incidencia distinta con el mismo título: reemplaza a la primera.

---

## 5. AUTHORITY existente que se debe extender (y no duplicar)

| Necesidad | Autoridad que ya existe |
|---|---|
| Quién recibe | `getRolesWithPermission("canManageIncidents")` + salas `org:{org}:role:{rol}`. **No se amplía.** |
| Severidad → política | `incidents/routes.js` ya calcula `category` y `level` |
| Canales operativos | `ManeCombNotificationModule.channelIdForCategory` |
| Render nativo | `ManeCombPushNotificationRenderer` |
| Bus realtime | socket ya existente en `root-store` |
| Háptica | `src/native/haptics.ts` |
| Deep link | `normalizeDeepLink` + `linking.ts` |

**El conductor que reporta no es destinatario**: `driver` no tiene
`canManageIncidents`, así que no está en `targetRoles`. El requisito de "sin eco
para el reportante" ya se cumple **sin tocar permisos**.

**Cambios de estado no notifican**: `PATCH /incidents/:id/status` sólo llama
`recordAppEvent`; no invoca `deliverOperationalNotification`. Así que
`open → in_progress` y `resolved` no pueden repetir sirena. El diseño debe
mantenerlo así: `incident:updated` **no** debe producir sonido.

---

## 6. DESIGN propuesto

### 6.1 Reenviar `level` en el payload FCM

Android no puede leer `level` hoy y tendría que re-derivarlo de `severity`, es
decir, una segunda autoridad de política. Se añade `level` a `buildDataPayload`
para que el dispositivo **consuma** la decisión del backend en vez de recalcularla.
Un solo campo, en el mismo builder que ya existe.

### 6.2 Canales versionados, con el vocabulario que ya existe

No se crean `manecomb-alert-*` en paralelo a `operacion-*`: eso sería un segundo
vocabulario. Se versionan los existentes por la inmutabilidad de canales:

| Canal | Uso | Importancia | Sonido | Vibración |
|---|---|---|---|---|
| `operacion-sos-v2` | `category=sos` / `level=critical` | HIGH | `alert_sos` | patrón largo e insistente |
| `operacion-incidentes-alta-v2` | `level=warning` | HIGH | `alert_high` | patrón doble medio |
| `operacion-incidentes-v2` | `level=info` | DEFAULT | `alert_standard` | pulso breve |

`AudioAttributes` con `USAGE_NOTIFICATION_EVENT` (no `USAGE_NOTIFICATION_RINGTONE`,
que es de llamadas). `lockscreenVisibility = VISIBILITY_PRIVATE` para no exponer
descripción de la incidencia en pantalla bloqueada; el SOS puede ser `PUBLIC` sólo
en el título genérico. Se respeta DND: nada de `setBypassDnd`, ni control de
volumen global.

### 6.3 Sonidos propios

`res/raw/` sólo contiene `keep.xml`: **no hay ningún recurso de audio**. El
ringtone de llamadas es `RingtoneManager.getDefaultUri(TYPE_RINGTONE)` del
sistema. Se generarán tres OGG cortos y sintéticos de ManeComb, libres de
copyright, distintos entre sí y distintos de chat (que sigue con el sonido por
defecto) y de RTC (que no se toca).

### 6.4 Dedup sin doble sonido

La exclusión natural ya existe y se conserva: **FCM sólo renderiza cuando la app
no está en foreground**; el camino JS sólo suena cuando sí lo está. Sobre eso, una
memoria corta con identidad estable `incidentId` (o `notificationId` cuando no
haya incidencia) para que `notification:created` + `incident:sos` + un refresco
REST del mismo incidente produzcan **una** reacción. Dos incidencias distintas del
mismo vehículo tienen `incidentId` distinto y por tanto suenan las dos.

### 6.5 Foreground

Se añaden consumidores de `notification:created` e `incident:sos` en el socket que
**ya existe** en `root-store`, aplicando la misma política. Ningún bus nuevo,
ningún `NotificationService2`.

---

## 7. Lo que NO se hará

- No se amplía la audiencia ni se tocan permisos.
- No se toca RTC, `CHANNEL_CALLS`, el ringtone ni el flujo de llamadas.
- No se reutiliza el canal de llamadas para incidencias.
- No se crea un segundo handler FCM ni un segundo bus de socket.
- No se hace sonar nada en `incident:updated` (resolución/estado).
- No se intenta saltar DND ni se controla el volumen del teléfono.

---

## 8. Riesgo declarado

El único punto que no puedo demostrar sin hardware es el timbre real de cada
patrón: que SOS sea inconfundible frente a chat en un teléfono concreto, con su
volumen y su altavoz, es una comprobación física. Por eso la fase cierra con
matriz de prueba física y no sólo con tests verdes.
