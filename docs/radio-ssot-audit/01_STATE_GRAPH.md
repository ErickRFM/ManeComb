# Radio State Graph

Estado vigente del working tree. No constituye evidencia fisica.

`RadioSessionState` es la unica maquina de estado operacional visible. Contiene `phase`, `operator`, `transmissionId` y `message`; todos sus cambios pasan por `radioSessionReducer`.

```text
IDLE -> CONNECTING -> JOIN_SENT -> READY
READY -> REQUESTING -> TRANSMITTING -> UPLOADING -> READY
READY -> RECEIVING -> READY
REQUESTING -> CHANNEL_BUSY -> READY
* -> OFFLINE -> RECONNECTING -> JOIN_SENT -> READY
JOIN_SENT -> UNAUTHORIZED | ERROR
captura/reproduccion/transporte -> ERROR
```

`READY` solo procede del ACK exitoso de `radio:join` o del cierre valido de una sesion ya autorizada. `radioSessionRef` es una referencia de lectura para callbacks asincronos y se actualiza en la misma funcion que despacha el reducer; no es un productor alterno.

Las animaciones TX y su timer dependen de `phase === TRANSMITTING`; cualquier otra fase cancela y reinicia sus recursos.
