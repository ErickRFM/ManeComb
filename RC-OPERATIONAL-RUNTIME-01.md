# RC-OPERATIONAL-RUNTIME-01 — GPS, seguimiento y Radio global

## Base

- Rama: `rc-operational-runtime-01`
- Base actual: `main` en `f194d33f8c73695add33d307974a9e8d478d7b52`
- Pull request: `#8` (draft)
- Alcance: runtime operativo mobile/backend.
- Fuera de alcance: rutas múltiples F3–F7, ventas, portal, pagos y cambios internos al runtime WebRTC.

## Veredicto

`DEVICE_VALIDATION_PENDING`

GPS y Radio quedan cerrados a nivel de arquitectura y código. El gate final sigue siendo la prueba física con dos dispositivos; no se declara `OPERATIONAL_RUNTIME_READY` únicamente por compilación o pruebas automatizadas.

---

# Auditoría inicial

## GPS

1. React ya separaba ubicación viva de jornada: `sessionId` solo se enviaba cuando la jornada estaba `RUNNING`.
2. El servicio Android contradecía esa regla: trataba `sessionId` vacío como necesidad de iniciar una jornada antes de drenar la cola.
3. La cola nativa persistía un `ArrayDeque` completo en `SharedPreferences` sin límite explícito por cantidad o antigüedad.
4. `getServiceStatus()` exponía access token y refresh token a JavaScript.
5. `hasServicesEnabledAsync()` devolvía siempre `true`.
6. Fuera de horario el servicio descartaba ubicaciones, pero mantenía GPS/Network providers activos.
7. El cambio de owner foreground/background podía producir una ventana sin captura o doble captura.

## Radio

1. `RadioRealtimeService` pertenecía a `RadioScreen`.
2. `radio:join`, listeners y reproducción dependían de que esa pantalla estuviera montada.
3. `ManeCombRadioService` solo mantenía la notificación; por sí mismo no aseguraba unión al canal.
4. No existía un runtime global de Radio.
5. El canal Radio dependía de `activeConversationId`, acoplando Chat y Radio.
6. Una llamada podía competir por audio con Radio, especialmente si `RadioScreen` estaba abierta.

---

# Fase 1 — GPS background

## Semántica implementada

- `sessionId` vacío: publica ubicación viva en `/locations/update`; no inicia jornada.
- `sessionId` real: el backend asocia la posición a la jornada válida.
- `sessionId` `pending:*`: únicamente este marcador explícito permite resolver una sesión offline antes de drenar.

## Endurecimientos

- Cola acotada a 1,440 paquetes y 24 horas.
- Compactación determinista y contador de paquetes descartados.
- `lastSentAt` y `lastConfirmedAt` actualizados tras respuesta 2xx.
- Diagnóstico JS sin access token ni refresh token.
- Detección nativa real de GPS/Network provider.
- Providers suspendidos fuera de horario y revaluados cada minuto.
- Estados operativos `outside_schedule`, `permission_denied`, `services_disabled` y `auth_failed`.
- Handshake de ownership:
  - Android conserva captura hasta que el watcher React está activo.
  - Android inicia background solo después de que React libera el watcher.
- Tracking background continuo limitado a conductor autenticado con unidad y acceso móvil.
- Restauración conservada para `BOOT_COMPLETED` y `MY_PACKAGE_REPLACED`.

Commit:

`fix(gps): harden operational background tracking`

---

# Fase 2 — Radio global

## Módulo

`mobile/src/features/radio-live/`

- `radio-live-types.ts`
- `radio-live-machine.ts`
- `radio-live-store.ts`
- `radio-live-runtime.ts`
- `radio-live-overlay.tsx`
- `radio-live-store.test.ts`

## Lifecycle implementado

1. Después del bootstrap autenticado, asegura el canal General Radio con `setActive:false`.
2. Conserva `channelId` propio y no modifica `activeConversationId` de Chat.
3. Reutiliza el socket autenticado compartido.
4. Ejecuta `radio:join` mediante `RadioRealtimeService`.
5. Solo después del ACK `ready` inicia `ManeCombRadioService` y pasa a `LISTENING`.
6. Recibe `radio:start/frame/end` y reproduce PTT desde Mapa, Chat, Perfil, Checklist o Incidencias.
7. Conserva el foreground service durante reconexiones transitorias.
8. Limpia listeners, reproducción y servicio en logout o cambio de usuario.
9. Llamadas `CONNECTING`, `CONNECTED`, `RECONNECTING` o `ENDING` suspenden todos los owners Radio, detienen el foreground service y bloquean transmisión/frames.
10. Al finalizar la llamada, cada owner autorizado vuelve a ejecutar `radio:join` antes de reactivar el servicio.
11. Cuando `RadioScreen` está abierta, el runtime global entrega ownership al runtime de pantalla para evitar listeners y reproducción duplicados.

Estados:

- `IDLE`
- `JOINING`
- `LISTENING`
- `RECEIVING`
- `RECONNECTING`
- `PAUSED_BY_CALL`
- `PAUSED_BY_SCREEN`
- `UNAUTHORIZED`
- `ERROR`

## Limitación explícita

Radio global funciona mientras el proceso de la app permanece vivo, incluido el uso normal en segundo plano con foreground service. No se certifica recepción después de `force stop`, cierre forzado o proceso destruido; eso requeriría un runtime receptor completamente nativo o una estrategia push adicional.

Commit:

`feat(radio): add global operational radio listener`

---

# Validación automatizada

El workflow del repositorio valida:

- Backend tests.
- Mobile typecheck.
- Mobile lint.
- Mobile tests, incluidas las suites de Radio global y ownership Radio–llamada.
- Ventas typecheck/build.
- Android `assembleDebug` y publicación temporal del APK debug.

La rama se mantiene en draft y no debe fusionarse con un check rojo o pendiente.

---

# Pruebas físicas pendientes

## GPS

1. C-3 sin jornada en foreground.
2. C-3 sin jornada en background.
3. Confirmar que no se crea jornada ni `RouteSessionPosition`.
4. Jornada `RUNNING`: ubicación viva y posición histórica.
5. Pantalla apagada durante 10 minutos.
6. Sin Internet y recuperación de la cola.
7. Reinicio Android.
8. Salida y entrada del horario.
9. GPS apagado y encendido.
10. Admin observa C-3 en tiempo real.

## Radio

1. Abrir ManeComb y permanecer en Mapa.
2. Confirmar `LISTENING` y notificación.
3. Transmitir desde otro teléfono y escuchar sin abrir Radio.
4. Mandar la app a segundo plano y repetir con proceso vivo.
5. Abrir Radio y confirmar handoff sin audio duplicado.
6. Iniciar una llamada desde Mapa y desde Radio; Radio debe suspenderse y detener su notificación.
7. Forzar `RECONNECTING` de llamada y comprobar que Radio continúa suspendida.
8. Colgar; Radio debe hacer `radio:join`, volver a `LISTENING` y reactivar la notificación.
9. Logout; servicio, reproducción y notificación deben desaparecer.
10. Repetir login sin listeners duplicados.

# Veredictos permitidos

- `OPERATIONAL_RUNTIME_READY`
- `GPS_BACKGROUND_BLOCKED`
- `RADIO_BACKGROUND_BLOCKED`
- `DEVICE_VALIDATION_PENDING`
