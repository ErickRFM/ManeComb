# ManeComb Radio — Validacion y limites de evidencia

Complemento de `RADIO_PRO_ARCHITECTURE.md`. Separa lo que quedo demostrado de lo
que sigue requiriendo hardware. No se declara ninguna certificacion que no se
haya ejecutado.

---

## 1. Validacion automatizada

| Gate | Comando | Resultado |
|---|---|---|
| TypeScript mobile | `npm run typecheck` (mobile) | PASS |
| ESLint mobile | `npx eslint .` | PASS (0 errores) |
| Suites mobile | `npx jest --runInBand` | PASS — 56 suites / 308 tests |
| Kotlin | `gradlew :app:testDebugUnitTest` | PASS — 39 tests |
| Suite backend | `npm test` (backend) | PASS — exit 0 |
| Build Android | `gradlew assembleDebug` | PASS — ver seccion 2 |
| Higiene de diff | `git diff --check` | PASS |

El total de suites mobile baja respecto a la tanda anterior porque las pruebas
del transporte de JavaScript desaparecieron con el transporte: su cobertura se
movio a Kotlin, donde ahora hay 39 pruebas.

### Cobertura del nucleo nativo

`RadioSessionReducerTest` (12)

- `LISTENING` solo tras el ACK de `radio:join`; conectar no es estar unido
- el canal no se pide si lo tiene otro operador
- un `FloorGranted` sin peticion previa no abre el microfono
- `CHANNEL_BUSY` sin `transmissionId` ajeno, liberado por cualquier `radio:end`
- revocacion de la transmision propia por el backend
- perdida de transporte durante TX
- prioridad de llamada y reingreso posterior
- eco del propio `radio:start` ignorado
- frame de otra transmision descartado
- join rechazado por permisos
- desactivacion y cambio de canal

`RadioSessionControllerTest` (17)

- activar conecta y se une solo tras el ACK
- join sin permisos no entra en bucle de reconexion
- turno concedido abre el microfono y los frames salen por el socket nativo
- canal ocupado no abre el microfono
- fallo de microfono libera el canal ya concedido
- **el backend revoca la transmision con React congelado**
- **perder el socket durante TX cierra captura y programa reconexion acotada**
- socket caido sin frames entregables corta la captura
- token invalido no reintenta
- **la recepcion reproduce sin pasar por React**
- eco de la propia transmision no se reproduce
- cambio de canal durante TX libera el canal anterior
- turno concedido tarde tras cambiar de canal se devuelve
- llamada suspende Radio y despues vuelve a unirse
- logout destruye socket, canal, captura e identidad
- activar el mismo canal dos veces no duplica la sesion
- join fallido por red programa reconexion acotada

`RadioPolicyTest` (10)

- backoff exponencial acotado, con jitter dentro del limite y reset
- fallo de autenticacion y desactivacion explicita no se reintentan
- cola RX: secuencia contigua, repetidos descartados, resincronizacion tras
  hueco, frames ajenos ignorados y **profundidad acotada** (sin memoria infinita)

### Cobertura de la frontera en JavaScript

`radio-transport-ownership.test.js`

- **ningun productor ni consumidor de `radio:*` en JavaScript**
- ningun simbolo del camino PTT (`startPttCapture`, `enqueuePttFrame`,
  `ManeCombPttFrame`, …) en el bridge
- **un solo cliente Socket.IO**, en `SocketIoRadioTransport.kt`
- **una sola `AudioRecord` y una sola `AudioTrack`**, en `RadioAudioSession.kt`
- un solo algoritmo de reconexion, con el del transporte desactivado
- los archivos sustituidos ya no existen
- la pantalla no posee transporte ni audio
- el overlay ya no consume el socket compartido de JavaScript

`radio-live-store.test.ts`

- activacion unica por identidad; cambio de canal como comando, no reconexion
- reactivacion al cambiar de operador
- el store **no deriva fases**: proyecta la instantanea nativa
- comandos PTT sin inventar fase local
- preempcion por llamada
- logout desactiva la sesion nativa y deja de escuchar
- proyeccion 1:1 de la instantanea, incluido operador ausente

`radio-console.test.ts` y `radio-audio-route.test.ts` siguen vigentes sin
cambios: el vocabulario de fases es el mismo en ambos lados.

---

## 2. Build Android

```text
cd mobile/android && gradlew.bat assembleDebug
BUILD SUCCESSFUL
```

APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` (~161 MB; crece
respecto al anterior por el cliente Socket.IO nativo).

Se usa `assembleDebug` porque `assembleRelease` requiere ademas el bundle de
Metro y la firma de release, que no forman parte de este cambio.

Compilar no demuestra comportamiento: ver seccion 3.

---

## 3. Certificacion fisica — PENDIENTE

No se ejecuto ninguna prueba con dispositivos reales. Los siguientes casos
**no** estan certificados y no deben darse por buenos:

- dispositivo A -> dispositivo B y viceversa
- pantalla bloqueada
- background prolongado (5+ minutos) y Doze
- proceso React deliberadamente suspendido
- Wi-Fi <-> datos moviles en ambos sentidos
- conexion/desconexion de Bluetooth y auriculares con cable
- interrupcion por llamada telefonica del sistema
- soak de 30-60 minutos

Riesgos concretos que solo el hardware puede resolver:

1. **Promocion del tipo de foreground service.** El servicio arranca como
   `mediaPlayback` y agrega `microphone` al transmitir. Falta confirmar en
   Android 14/15 reales que la promocion se acepta con la app en segundo plano y
   que la captura efectivamente produce audio, no silencio.
2. **Comportamiento de Doze sobre el socket.** El backoff de reconexion es
   correcto por construccion, pero la frecuencia real de despertares bajo Doze
   solo se mide en dispositivo.
3. **Latencia extremo a extremo** del camino nativo frente al anterior.
4. **Consumo de bateria** de la sesion nativa en jornada completa.

Estado: `CODE COMPLETE` + `AUTOMATED CERTIFIED` + `PHYSICAL CERTIFICATION PENDING`.

---

## 4. Riesgo cerrado: el transporte ya no vive en JavaScript

En la tanda anterior este documento decia que `ManeCombRadioService` era un
contenedor de notificacion y que cada frame TX/RX cruzaba el bridge de React.
**Eso ya no es cierto.**

- el socket Radio, la autenticacion, el join, el arbitraje y la reconexion viven
  en el servicio
- `AudioRecord` entrega frames al controlador nativo, que los emite por el socket
  nativo
- `radio:frame` recibido se escribe en `AudioTrack` sin pasar por React
- React recibe instantaneas de baja frecuencia y niveles de audio suavizados
- el transporte de Radio en JavaScript fue **eliminado**, no desactivado

Desmontar la pantalla de Radio, mandar la app a segundo plano o suspender el
runtime JS ya no rompe arquitectonicamente el camino critico del PTT. Queda
demostrarlo en campo (seccion 3).

---

## 5. No implementado (fuera del alcance de esta tanda)

- **Protocolo v2 (Opus / frames binarios / jitter buffer).** Ahora desbloqueado:
  el transporte y el pipeline de audio son nativos, que era el requisito previo.
- **PTT por hardware / Bluetooth / tecla fisica.** El comando unico ya existe;
  falta el enlace de eventos y hardware para probarlo.
- **VOX / manos libres.** Requiere VAD, umbral, hangover y proteccion de falso
  disparo verificados con audio real.
- **Emergencia / prioridad operativa.** Diseno de producto ademas de codigo.
- **Transcripcion / analytics.** Depende de infraestructura de jobs y
  credenciales externas.
- **PTT web en vivo.** Web permanece en notas de voz, declarado en la UI.

---

## 6. Estado

```text
CODE COMPLETE
AUTOMATED CERTIFIED
ANDROID BUILD PASS
PHYSICAL CERTIFICATION PENDING
```
