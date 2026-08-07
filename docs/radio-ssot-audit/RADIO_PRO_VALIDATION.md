# ManeComb Radio — Validacion y limites de evidencia

Complemento de `RADIO_PRO_ARCHITECTURE.md`. Separa lo que quedo demostrado de lo
que sigue requiriendo hardware. No se declara ninguna certificacion que no se
haya ejecutado.

---

## 1. Validacion automatizada

| Gate | Comando | Resultado |
|---|---|---|
| TypeScript mobile | `npm run typecheck` (mobile) | PASS |
| ESLint mobile | `npx eslint src/screens/radio src/features/radio-live` | PASS (0 errores) |
| Suites mobile | `npx jest --runInBand` | PASS — 58 suites / 325 tests |
| Suite backend | `npm test` (backend) | PASS — exit 0 |
| Build Android | `gradlew.bat assembleDebug` | PASS — ver seccion 2 |
| Higiene de diff | `git diff --check` | PASS (solo avisos CRLF) |

Linea base antes del trabajo: 56 suites / 295 tests mobile.

### Cobertura de regresion agregada

`features/radio-live/radio-live-store.test.ts`

- `REQUESTING -> TRANSMITTING -> LISTENING` sobre la misma autoridad
- rechazo de transmision con el canal en manos de otro operador
- `CHANNEL_BUSY` y su liberacion exclusiva por el backend
- cierre local cuando el backend revoca la transmision (`authority_lost`)
- concesion de canal que llega tarde despues de cambiar de canal
- preempcion por llamada y reactivacion posterior
- reemplazo de runtime al cambiar el socket compartido
- callbacks de un runtime reemplazado ignorados
- limpieza en logout/reset

`features/radio-live/radio-realtime-service.test.ts`

- `LISTENING` solo tras ACK de `radio:join`, con reintento unico por timeout
- eventos de otro canal descartados
- `radio:leave` al desconectar sin cerrar el socket global compartido
- ACK tardio de `radio:start` liberado tras cambiar de canal
- `radio:end` idempotente ante `transmission_not_active`
- rechazo de frames que no son PCM16 canonico de 20 ms

`features/radio-live/radio-foreground-service.test.ts`

- arranque unico y modo `listening` inicial
- parada solo tras la ventana de gracia
- cancelacion de la parada si el runtime reinicia dentro de la gracia
- promocion a `microphone` solo mientras se transmite
- ningun cambio de modo con el servicio detenido

`features/radio-live/radio-foreground-authority.test.js`

- transporte, captura y reproduccion fuera de la pantalla
- **un unico** `new RadioRealtimeService(` en todo `src/`
- ausencia de la bandera global de suspension
- el overlay no pausa el runtime por estar en la pantalla de Radio

`screens/radio/utils/radio-console.test.ts`

- el PTT solo se habilita en `LISTENING` sobre el canal seleccionado
- canal en transicion marcado como tal, no como listo
- operador real nombrado en `RECEIVING` / `CHANNEL_BUSY`
- microfono bloqueado ofrece reintento en vez de un control muerto
- la consola web se anuncia como nota de voz, nunca como canal en vivo

`screens/radio/utils/radio-audio-route.test.ts`

- ciclo limitado a salidas realmente conectadas
- recuperacion cuando la salida elegida se desconecta

`backend/test/radio-floor-control.test.js`

- instancia unica sin Redis y multi-instancia con lock
- `refresh`/`release` incapaces de operar sobre un lock ajeno
- `authority_lost` al expirar el lock y cambiar de dueno
- Redis habilitado pero caido: fallo explicito, sin split-brain
- adaptador Redis no listo: la transmision pierde autoridad
- lock corrupto que no bloquea el canal
- cadencia, orden, tamanio y duracion maxima de frames

---

## 2. Build Android

```text
cd mobile/android && gradlew.bat assembleDebug
BUILD SUCCESSFUL in 19m 29s
656 actionable tasks: 634 executed, 22 up-to-date
```

APK: `mobile/android/app/build/outputs/apk/debug/app-debug.apk` (156 MB).

Se usa `assembleDebug` porque `assembleRelease` requiere ademas el bundle de
Metro y la firma de release, que no forman parte de este cambio.

El build cubre la totalidad de los cambios nativos (`RadioAudioRoute`,
`ManeCombRadioService`, `ManeCombAudioModule`, manifest). Los commits
posteriores al build son solo TypeScript y no alteran el artefacto nativo.

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

Estado: `CODE COMPLETE` + `AUTOMATED CERTIFIED` + `PHYSICAL CERTIFICATION PENDING`.

---

## 4. Riesgo abierto: el transporte sigue en JavaScript

Este es el limite mas importante y **no** se cerro en este trabajo.

`ManeCombRadioService` es contenedor foreground y notificacion. No posee socket,
autenticacion, join, reconexion, framing TX ni cola RX. Cada frame sigue cruzando
el bridge nativo -> JS -> Socket.IO. Con el proceso React suspendido en
background profundo o Doze, los frames dejan de fluir.

Lo que si se corrigio en esta rama, y que reduce el dano real:

- el tipo de foreground service ya declara `microphone` al transmitir; antes
  Android 14+ podia silenciar la captura en segundo plano
- la notificacion refleja el estado real en vez de afirmar "Canal preparado"
- `START_NOT_STICKY` evita que el sistema relance una notificacion sin canal
- el runtime corta la captura por si mismo ante cualquier perdida de autoridad,
  transporte o audio, sin depender de React

Lo que falta para cerrarlo, en orden:

1. Cliente Socket.IO (o transporte equivalente) dentro de `ManeCombRadioService`.
2. Puente seguro de credenciales de sesion al servicio, con destruccion en
   logout junto al resto del estado de Radio.
3. Framing TX y cola RX nativos, con buffer de jitter acotado.
4. React Native reducido a comandos y snapshots de baja frecuencia.
5. Retirada del transporte JS de Radio: durante la migracion no pueden existir
   ambos activos para el mismo usuario y canal.
6. Certificacion fisica de los casos de la seccion 3.

Es una iniciativa propia, no un parche de lifecycle. Implementarla a ciegas, sin
dos dispositivos para validarla, produciria un segundo transporte a medio
conectar: exactamente la duplicacion de autoridad que este trabajo elimino.

---

## 5. No implementado (fuera del alcance seguro de esta ejecucion)

- **Protocolo v2 (Opus / frames binarios / jitter buffer).** Condicionado a
  estabilizar antes runtime, background y backend. El protocolo v1 (PCM16
  16 kHz mono, 20 ms, 640 bytes, base64) queda intacto y medido por los limites
  del backend.
- **PTT por hardware / Bluetooth / tecla fisica.** El comando unico ya existe
  (`requestTransmission` / `endTransmission`), asi que una fuente adicional se
  conecta ahi sin crear otro flujo; falta el enlace de eventos y hardware para
  probarlo.
- **VOX / manos libres.** Requiere VAD, umbral, hangover y proteccion de falso
  disparo verificados con audio real. No se deja un VOX simulado.
- **Emergencia / prioridad operativa.** Debe consumir usuario, vehiculo,
  jornada y GPS existentes y decidir prioridad en backend; es diseno de producto
  ademas de codigo.
- **Transcripcion / analytics.** Depende de infraestructura de jobs y
  credenciales externas no disponibles aqui.
- **PTT web en vivo.** Web permanece en notas de voz, declarado como tal en la
  UI.

---

## 6. Estado

```text
CODE COMPLETE
AUTOMATED CERTIFIED
PHYSICAL CERTIFICATION PENDING
NATIVE BACKGROUND TRANSPORT NOT IMPLEMENTED
```
