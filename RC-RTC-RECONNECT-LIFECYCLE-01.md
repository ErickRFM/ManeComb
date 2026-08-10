# RC-RTC-RECONNECT-LIFECYCLE-01

## Estado

Candidato de release para cerrar el lifecycle de reconexión/desconexión repetida de llamadas RTC sin crear una segunda autoridad de signaling.

## Base certificada

- PR padre: #68 `security(tenant): remove legacy cross-organization admin bypass`
- Base SHA: `af46bfa840e19f39605f437f870be15786d7d630`
- Rama: `agent/rtc-reconnect-lifecycle-20260809`

## Causa raíz

La autoridad canónica `backend/src/services/rtc-call-service.js` guarda durante una llamada:

- `callerSocketId` para el caller;
- `calleeSockets` para el callee;
- `callsById` para la reserva de llamada;
- `userState` para evitar llamadas simultáneas;
- `pendingDisconnects` para el grace period.

Después de un primer disconnect, el binding RTC original se elimina. Si el usuario recupera presencia con un socket nuevo, `noteUserReconnected(userId)` cancela correctamente el cleanup pendiente, pero el servicio no conoce necesariamente el nuevo socket como binding RTC hasta que vuelve a participar en signaling.

La secuencia problemática era:

1. llamada activa;
2. socket original desconecta;
3. se programa grace period;
4. usuario reconecta y cancela el grace period;
5. el socket nuevo vuelve a desconectarse;
6. el handler legacy podía no asociar ese socket nuevo con el participante;
7. `callsById` / `userState` podían quedar ocupados y producir `caller_busy` / `busy` fantasma.

## Corrección

Se mantiene una sola autoridad `rtc-call-service`.

`collectDisconnectCandidates(call, socketId)`:

- reconoce bindings directos de caller/callee;
- elimina el binding que efectivamente cayó;
- durante una llamada `active`, considera como candidatos a reconciliar a participantes cuyo binding RTC ya no existe;
- nunca aplica esa reconciliación extra mientras la llamada sigue `ringing`.

`handleDisconnect()` valida cada candidato contra la presencia viva mediante `isUserConnected(userId)`:

- si sigue conectado, no agenda cleanup;
- si ya no está conectado, reutiliza el grace period y el cleanup autoritativo existentes.

No se modifica la lógica de media ni se añade `RtcServiceV2`, `CallManagerNew` o una segunda máquina de estados.

## Regresión permanente

`backend/test/rtc-call-reconnect-lifecycle.test.js` valida:

1. caller: socket A cae, reconecta, socket A2 cae y la llamada libera `callsById/userState`;
2. callee: misma secuencia con socket B/B2;
3. binding ausente + presencia viva no produce falso disconnect;
4. un callee aún no aceptado durante `ringing` no se considera desconectado por un socket ajeno.

La prueba está integrada al `npm test` normal inmediatamente después de `rtc-call-signaling.test.js`.

## Auditoría de signaling

La revisión del montaje Socket.IO confirmó que:

- `rtc:join` usa el `callId` autoritativo y `callService.canJoinCall()`;
- `canJoinCall()` exige llamada `active`, mismo `organizationId` y ser caller/callee;
- `rtc:offer`, `rtc:answer` y `rtc:ice-candidate` exigen:
  - acceso operativo;
  - socket dentro de la sala RTC autorizada;
  - membresía del usuario en el `callId`;
  - si existe `targetSocketId`, que ese socket pertenezca a la misma sala;
- `startCall()` exige acceso a la conversación y misma organización;
- `accept/reject` son exclusivos del callee;
- `cancel` es exclusivo del caller;
- `end` exige ser participante.

Por tanto, conocer un `callId` no permite inyectar signaling ni controlar una llamada ajena.

## Reconciliación histórica

El draft viejo #59 contenía un parche para la misma causa sobre una base anterior. No se mergeó ni se reutilizó su rama. Se inspeccionó como evidencia histórica y el cambio se recreó sobre la base certificada actual de #68.

## Fuera de alcance / siguiente P1

`rtc-call-service` documenta explícitamente que `callsById`, `userState` y timers de llamada viven en memoria de proceso y asumen una sola instancia de backend. La siguiente fase debe estudiar y, si corresponde, centralizar la reserva/lifecycle global de llamadas con la infraestructura Redis existente para evitar divergencia entre réplicas. Esta deuda no se mezcla con el fix de reconexión.

## Gate previo al RC

Sobre el SHA funcional anterior `0300e34119a661b2bbccc69134f8874f83b82bc2`:

- Dependency Audit: SUCCESS.
- Backend tests: SUCCESS.
- Mobile quality: SUCCESS.
- Ventas build: SUCCESS.
- Admin Global build: SUCCESS.
- Infrastructure validation: SUCCESS.
- Communication Service: SUCCESS.
- Android debug APK: todavía en construcción al momento de crear este RC.

El SHA que incluya este documento debe volver a pasar el gate completo antes de considerarse certificado.
