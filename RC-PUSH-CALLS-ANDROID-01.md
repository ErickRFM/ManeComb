# RC-PUSH-CALLS-ANDROID-01

## Veredicto actual

`CODE_IMPLEMENTED_CI_AND_DEVICE_CERT_PENDING`

Este bloque convierte el push Android de ManeComb en un canal real de recuperación cuando el proceso de React Native y el socket ya no están vivos. Socket.IO sigue siendo el transporte principal mientras la app está abierta; Firebase Cloud Messaging (FCM) despierta Android y muestra una notificación nativa cuando la app está en segundo plano, retirada de recientes o recreada por el sistema.

No se considera certificado en producción hasta configurar Firebase en Android y Render, compilar un release con `MANECOMB_REQUIRE_FCM=1` y completar la matriz física de dos teléfonos.

---

# Alcance cerrado en código

## PUSH-A — Proveedor FCM HTTP v1

Backend incorpora un proveedor FCM sin SDK administrativo adicional:

- autenticación OAuth 2.0 mediante cuenta de servicio;
- JWT RS256 generado con `node:crypto`;
- cache de access token;
- endpoint HTTP v1 por proyecto Firebase;
- mensajes `data-only`;
- prioridad alta para llamadas, chat y emergencias;
- TTL de llamada de 40 segundos;
- payload FCM convertido completamente a strings;
- detección de tokens inválidos;
- compatibilidad conservada con tokens Expo heredados.

FCM no sustituye a Socket.IO. Ambos transportan IDs autoritativos creados por backend.

## PUSH-B — Registro de dispositivo

La app Android obtiene el token con `FirebaseMessaging.getInstance().token`. El flujo existente del store:

1. solicita permiso de notificaciones;
2. obtiene el token nativo;
3. compara con el token almacenado;
4. desregistra el anterior si cambió;
5. registra el actual mediante `/api/notifications/push-subscriptions`;
6. desregistra el token durante logout.

`onNewToken` conserva el token renovado de forma nativa para registrarlo en la siguiente sesión autenticada.

## PUSH-C — Mensajes con aplicación cerrada

Los mensajes de texto, voz, imagen y video ya entraban en `deliverOperationalNotification`. El proveedor ahora entrega esos eventos a tokens FCM reales.

Android renderiza:

- canal independiente de mensajes;
- prioridad alta;
- `MessagingStyle`;
- agrupación por conversación;
- deep link al chat;
- respuesta rápida con `RemoteInput` para conversaciones no cifradas.

El Headless JS ya existente recupera la sesión desde almacenamiento seguro y envía la respuesta por API sin depender de Zustand o de que la UI esté montada.

### E2EE

La respuesta directa permanece bloqueada en hilos cifrados. La notificación muestra:

```text
Chat cifrado: abre la app para responder
```

El Headless JS vuelve a comprobar el cifrado antes de enviar. Ante cualquier duda falla cerrado; nunca degrada un chat E2EE a texto plano.

## PUSH-D — Llamadas con aplicación cerrada

Al crear una llamada directa, backend envía simultáneamente:

- `rtc:incoming-call` por socket;
- `incoming_call` por FCM con el mismo `callId`.

El payload incluye únicamente datos necesarios:

- `callId`;
- `conversationId`;
- caller ID y nombre;
- modo audio/video;
- expiración;
- deep link de llamada.

Android usa `CallStyle` en Android 12+ y acciones equivalentes en versiones anteriores:

- **Responder** abre ManeComb con `action=accept`;
- **Rechazar** ejecuta un Headless JS Task sin abrir la UI;
- tocar la tarjeta abre el timbre con `action=incoming` sin aceptar automáticamente.

El full-screen intent siempre usa la acción de visualización, nunca la acción de aceptación. Micrófono y cámara no se abren hasta un toque explícito del usuario y la confirmación `rtc:accept` del backend.

## PUSH-E — Cancelación autoritativa

Backend envía un push silencioso `call_dismiss` cuando la llamada cambia a:

- aceptada;
- rechazada;
- ocupada;
- cancelada;
- timeout;
- terminada;
- desconexión definitiva.

La notificación se cancela con un ID estable derivado del `callId`, incluyendo otros dispositivos registrados para el mismo usuario.

## PUSH-F — Pantalla bloqueada

`MainActivity` activa `showWhenLocked` y `turnScreenOn` únicamente cuando recibe una URL `/call`. Una apertura normal restaura la privacidad habitual.

En Android 14+, si el sistema o Google Play no permiten full-screen intent, ManeComb degrada a una notificación heads-up de alta prioridad con Responder/Rechazar.

---

# Configuración privada requerida

## 1. Firebase Console

Crear o reutilizar un proyecto Firebase y registrar una aplicación Android cuyo package name coincida exactamente con el `applicationId` definitivo.

> El proyecto todavía usa `com.anonymous.combiscontrol`. Antes de registrar Firebase o publicar en Play debe confirmarse si ese será el identificador definitivo.

Descargar `google-services.json` y colocarlo localmente en:

```text
mobile/android/app/google-services.json
```

El archivo real está ignorado por Git en este repositorio.

Como alternativa, `mobile/.env.production` admite los identificadores públicos:

```env
MANECOMB_FIREBASE_PROJECT_ID=
MANECOMB_FIREBASE_APP_ID=
MANECOMB_FIREBASE_API_KEY=
MANECOMB_FIREBASE_SENDER_ID=
MANECOMB_REQUIRE_FCM=1
```

No poner ahí la llave privada de la cuenta de servicio.

## 2. Render backend

Crear una cuenta de servicio con permiso para Firebase Cloud Messaging y configurar una de estas rutas.

### Opción A — archivo privado montado

```env
GOOGLE_APPLICATION_CREDENTIALS=/ruta/privada/service-account.json
```

### Opción B — variables privadas

```env
FCM_PROJECT_ID=
FCM_CLIENT_EMAIL=
FCM_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

Aliases admitidos:

```text
FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

No subir el JSON de servicio, `FCM_PRIVATE_KEY`, contraseñas ni tokens al repositorio.

## 3. Release obligatorio

Para evitar distribuir una APK sin push cerrado:

```env
MANECOMB_REQUIRE_FCM=1
```

Entonces `npm --prefix mobile run android:release` aborta si no existe `google-services.json` ni las cuatro variables públicas `MANECOMB_FIREBASE_*`.

---

# Matriz de certificación física

Debe probarse con dos teléfonos y dos cuentas del mismo tenant:

## Mensajes

1. App abierta.
2. App en segundo plano.
3. App retirada de recientes.
4. Proceso terminado por Android.
5. Pantalla bloqueada.
6. Wi-Fi y datos móviles.
7. Texto, audio, imagen y video.
8. Tocar notificación abre la conversación correcta.
9. Responder desde notificación en chat no cifrado.
10. Chat cifrado no ofrece respuesta en claro.
11. Logout deja de recibir notificaciones de la cuenta anterior.
12. Varios dispositivos del mismo usuario.

## Llamadas

1. Audio y video con app abierta.
2. App en segundo plano.
3. App retirada de recientes.
4. Pantalla bloqueada.
5. Responder desde `CallStyle`.
6. Abrir tarjeta sin autoaceptar.
7. Rechazar sin abrir UI.
8. Caller cancela y la notificación desaparece.
9. Timeout y notificación caducada.
10. Llamada ocupada.
11. Wi-Fi contra datos móviles.
12. Confirmar audio/video solo después del toque de usuario.
13. Background durante llamada activa.
14. TURN real cuando el NAT lo requiera.

## Límite de plataforma

Una app retirada de recientes o terminada por Android puede recibir FCM. Una **detención forzada** desde Ajustes coloca el paquete en estado detenido; Android no permite prometer que FCM lo reactive hasta que el usuario abra la app de nuevo.

---

# Criterio de cierre

Después de CI, configuración real y certificación física, el veredicto puede cambiar a:

```text
PUSH_CALLS_ANDROID_RELEASE_CERTIFIED
```

Hasta entonces:

```text
CODE_IMPLEMENTED_CI_AND_DEVICE_CERT_PENDING
```
