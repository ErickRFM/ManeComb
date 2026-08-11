# RC-CALLS-CLOSED-APP-POLISH-20260811

## Objetivo

Cerrar la brecha entre una llamada ManeComb normal y la experiencia de una app de llamadas moderna cuando Android deja la app en segundo plano, la retira de recientes o recrea el proceso. El cambio de esta rama **no reemplaza signaling, WebRTC, FCM ni la maquina de estados**: endurece la decision arquitectonica y mejora la superficie visual de llamada.

Base auditada: `main@d7d3ed1bbcc0afd958c1a8c69a6dab8905ca6466`.

## Hallazgo principal

ManeComb ya tiene el esqueleto correcto para recibir llamadas con la app fuera de foreground:

- backend envia `incoming_call` data-only por FCM con prioridad alta y el `callId` autoritativo;
- Android recibe en `ManeCombFirebaseMessagingService` sin depender del bridge de React;
- `ManeCombPushNotificationRenderer` usa un canal exclusivo de llamadas, ringtone, vibracion y `CallStyle` en Android 12+;
- responder abre un deep link de llamada y pasa por el mismo preflight de permisos del store;
- rechazar se ejecuta sin abrir UI mediante `ManeCombCallActionReceiver` + Headless JS;
- el full-screen intent solo se usa cuando Android lo permite y nunca autoacepta;
- `MainActivity` puede mostrarse sobre lockscreen solo para intents internos `/call` autenticados con token privado;
- el release policy exige FCM configurado antes de certificar el APK/AAB.

Por lo tanto, **no faltaba meter otra libreria para tener llamadas con la app cerrada**. Lo que sigue siendo obligatorio para afirmar que funciona igual de bien en dispositivo real es configurar Firebase/Render y ejecutar la matriz fisica de dos telefonos documentada en `RC-PUSH-CALLS-ANDROID-01.md`.

## Investigacion externa

### 1. Android Core-Telecom (oficial)

Fuente: https://developer.android.com/develop/connectivity/telecom/voip-app/telecom

Android recomienda `androidx.core:core-telecom` para integrar VoIP con Telecom. Aporta coordinacion con llamadas del sistema, Bluetooth, Wear OS y Android Auto, y en Android modernos usa las APIs transaccionales de Telecom. La documentacion exige notificacion de llamada y advierte que, al usar Telecom, la ruta de audio debe quedar bajo sus APIs de endpoints en lugar de mezclar `AudioManager` manual.

Muestras oficiales revisadas:

- https://github.com/android/platform-samples/tree/main/samples/connectivity/telecom
- https://github.com/androidx/androidx/tree/androidx-main/core/core-telecom/integration-tests/referenceapp

### 2. Firebase Cloud Messaging (oficial)

Fuentes:

- https://firebase.google.com/docs/cloud-messaging/android/receive-messages
- https://firebase.google.com/docs/cloud-messaging/android-message-priority

Para eventos urgentes como llamadas, FCM de prioridad alta puede despertar un dispositivo dormido y ejecutar `onMessageReceived` durante una ventana corta. El trabajo pesado no debe depender de React ya iniciado. ManeComb ya sigue este patron con un `FirebaseMessagingService` nativo y render inmediato de la notificacion.

### 3. Full-screen intent y CallStyle (oficial)

Fuentes:

- https://developer.android.com/develop/connectivity/telecom/voip-app/notifications
- https://developer.android.com/about/versions/14/behavior-changes-14

Las llamadas entrantes son uno de los casos legitimos para full-screen intent, pero Android 14+ y Google Play pueden retirar el permiso por defecto si la app no califica. Por eso el comportamiento correcto es: full-screen cuando esta autorizado y heads-up `CallStyle` cuando no. ManeComb ya degrada de esa forma.

### 4. react-native-callkeep

Fuente: https://github.com/react-native-webrtc/react-native-callkeep

Es una referencia util para patrones de ConnectionService, eventos tempranos y llamadas con React Native. Sin embargo, **no se agrega en esta rama** porque ManeComb ya tiene:

- FCM nativo;
- CallStyle nativo;
- foreground service propio;
- deep links de accept/reject;
- store global de llamada;
- WebRTC y audio route propios.

Agregar CallKeep ahora duplicaria autoridad nativa, lifecycle y manejo de audio. Eso va contra la regla del proyecto de no crear dos soluciones para el mismo flujo.

## Decision arquitectonica

### Ahora

Mantener la arquitectura actual y cerrarla con pruebas fisicas. No incorporar CallKeep ni otra capa de notificaciones.

### Siguiente evolucion, separada

Evaluar `androidx.core:core-telecom:1.0.0` en una rama dedicada despues de certificar el flujo actual. Esa migracion debe hacerse completa, no parcial: registrar ManeComb con Telecom, mapear `callId` a `CallAttributesCompat`, coordinar answer/reject/end y mover la autoridad de rutas de audio a `CallControlScope`/endpoints.

No debe mezclarse Core-Telecom con el `AudioManager` manual actual sin una fase de migracion y pruebas en hardware.

## Cambios de esta rama

- nuevo `CallAmbientBackground` programatico y animado, sin imagenes pesadas ni dependencias;
- fondo compartido entre llamada entrante y llamada activa;
- pantalla entrante pasa de tarjeta flotante a experiencia full-screen;
- botones Responder/Rechazar mas grandes y claros;
- conserva exactamente el mismo `acceptIncomingCall`/`rejectIncomingCall` del store;
- conserva permisos antes de abrir microfono/camara;
- no toca signaling, FCM, WebRTC, TURN, sockets ni backend.

## Gate de salida

Para considerar esta mejora lista para merge:

1. `npm --prefix mobile run typecheck` verde.
2. suite mobile de llamadas verde.
3. CI general verde.
4. APK debug abre llamada entrante desde foreground sin regresion.
5. La certificacion de "app cerrada" sigue pendiente de Firebase real + dos dispositivos; este PR no debe falsificar ese estado.
