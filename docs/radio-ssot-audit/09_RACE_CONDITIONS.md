# Radio Race Conditions

## Cerradas por construccion

| Carrera anterior | Control vigente |
|---|---|
| READY antes de autorizacion | ACK de join + `joinGeneration` |
| canal Store/local divergente | un solo `activeConversationId` |
| polls solapados | polling recursivo despues de resolver + generacion |
| dos tarjetas iniciando | cola serial + `activeRadioPlayerId` + release nativo |
| frame antes de AudioTrack | `enqueuePttFrame` llama `ensurePttPlayback` |
| escritura PCM parcial | `WRITE_BLOCKING` y rechazo de write incompleto |
| animacion TX persistente | efecto gobernado por `RadioSession.phase` |
| error RX cerrando TX ajena | cleanup condicionado por TRANSMITTING/RECEIVING |
| ACK start perdido o tardio | retry idempotente + generacion + liberacion del canal anterior |
| soltar antes del ACK | cancelacion y `radio:end` sin iniciar AudioRecord |
| desconexion durante start nativo | revalidacion de fase/id despues del await |
| end durante prepare RX | revalidacion antes/despues de AudioTrack |
| salir/logout con socket global vivo | `radio:end` antes de retirar listeners |
| cliente conectado sin `radio:end` | timeout Backend de 65 segundos |
| arbitraje local entre instancias | propietario autoritativo en Redis con adquisicion NX, verificacion y TTL renovado por frame |

## Riesgos abiertos

- El foreground service no demuestra por si solo que React Native y Socket.IO entreguen frames con JS suspendido.
- Web graba y sube al final; no ofrece el mismo streaming PTT nativo.
- La red real puede introducir jitter; no existe una cola adaptativa de jitter medida fisicamente.

El riesgo de background JS se detalla en `11_BACKGROUND_JS_AUDIT.md`.
