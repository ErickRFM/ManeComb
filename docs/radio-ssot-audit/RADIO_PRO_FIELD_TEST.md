# ManeComb Radio — Guia de prueba de campo

Procedimiento para la primera instalacion real. Complementa
`RADIO_PRO_ARCHITECTURE.md` (que hace el sistema) y `RADIO_PRO_VALIDATION.md`
(que quedo demostrado sin hardware).

Datos reales del proyecto:

```text
applicationId   com.anonymous.combiscontrol
servicio        com.anonymous.combiscontrol.audio.ManeCombRadioService
tag de Radio    ManeCombRadio        (RadioLog, sesion completa)
tag de audio    ManeCombRadioAudio   (AudioRecord / AudioTrack)
tag del modulo  ManeCombAudio        (grabacion e historial)
APK debug       mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 1. Comandos ADB (Windows PowerShell)

Compilar e instalar:

```powershell
cd C:\proyectos\combis-app\mobile\android
.\gradlew.bat assembleDebug
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

Metro debe estar corriendo para un APK debug:

```powershell
cd C:\proyectos\combis-app\mobile
npm start
```

Limpiar logcat y abrir la app:

```powershell
adb logcat -c
adb shell monkey -p com.anonymous.combiscontrol -c android.intent.category.LAUNCHER 1
```

Seguir solo la sesion de Radio:

```powershell
adb logcat -s ManeCombRadio:I
```

Seguir Radio + audio + errores del proceso:

```powershell
adb logcat -s ManeCombRadio:I ManeCombRadioAudio:W ManeCombAudio:W AndroidRuntime:E
```

Guardar a archivo durante la prueba:

```powershell
adb logcat -s ManeCombRadio:I ManeCombRadioAudio:W AndroidRuntime:E | Tee-Object -FilePath C:\proyectos\combis-app\radio-field-test.log
```

Estado del foreground service (tipo y notificacion):

```powershell
adb shell dumpsys activity services com.anonymous.combiscontrol.audio.ManeCombRadioService
```

Confirmar que el proceso sigue vivo:

```powershell
adb shell ps -A | Select-String combiscontrol
```

Ver el estado de energia del proceso (util para Doze):

```powershell
adb shell dumpsys activity processes | Select-String combiscontrol
```

Forzar Doze para la prueba D:

```powershell
adb shell dumpsys deviceidle force-idle
adb shell dumpsys deviceidle unforce
```

Permisos concedidos:

```powershell
adb shell dumpsys package com.anonymous.combiscontrol | Select-String -Pattern "RECORD_AUDIO|FOREGROUND_SERVICE"
```

Desinstalar limpio:

```powershell
adb uninstall com.anonymous.combiscontrol
```

---

## 2. Eventos de log esperados

Todos con tag `ManeCombRadio`. Ninguno contiene token, credenciales ni audio.

```text
service_created
credentials_available userId=...
socket_connecting
socket_connected
join_requested channelId=...
join_granted channelId=...
phase from=IDLE to=JOINING ...
phase from=JOINING to=LISTENING ...
floor_requested channelId=...
tx_started channelId=... transmissionId=...
tx_ended channelId=... transmissionId=...
rx_started transmissionId=...
rx_ended transmissionId=...
socket_disconnected reason=NETWORK
reconnect_scheduled delayMs=... attempt=...
reconnect_attempt
call_pause wasTransmitting=...
call_resume
deactivate
service_destroyed
```

Sintomas de fallo a vigilar:

```text
join_denied error=forbidden          -> ACL o token sin acceso al canal
socket_connect_error reason=UNAUTHORIZED -> token rechazado en el handshake
foreground_microphone_denied         -> Android nego el tipo microphone
foreground_promotion_failed          -> promocion de FGS rechazada
tx_revoked reason=authority_lost     -> se perdio el lock de Redis
tx_aborted code=radio_frame_transport_lost -> socket caido durante TX
capture_start_failed                 -> AudioRecord no arranco
```

---

## 3. Nivel 1 — un dispositivo

Objetivo: verificar sesion, ciclo de vida y que la arquitectura se comporta como
dice. No verifica audio extremo a extremo (hace falta un segundo telefono).

### A. Login

| Paso | Esperado | Log | PASS si |
|---|---|---|---|
| Iniciar sesion | Radio se provisiona sola, sin abrir la pantalla | `service_created`, `credentials_available`, `socket_connected`, `join_granted`, `phase to=LISTENING` | Se llega a LISTENING sin visitar Radio |
| Ver notificacion | "Escuchando el canal" | — | El texto coincide con la fase |

### B. Navegacion

| Paso | Esperado | Log | PASS si |
|---|---|---|---|
| Radio -> Mapa -> Chat -> Radio | Misma sesion | Sin `service_created` ni `join_requested` nuevos | No aparece una segunda sesion |
| `dumpsys` del servicio | Una sola instancia | — | Un unico registro del servicio |

### C. PTT

| Paso | Esperado | Log | PASS si |
|---|---|---|---|
| Mantener PTT | REQUESTING -> TRANSMITTING | `floor_requested`, `tx_started`, `phase to=TRANSMITTING` | Menos de ~1 s hasta TRANSMITTING |
| Durante TX | FGS con microphone | `dumpsys` muestra el tipo | El tipo incluye `microphone` |
| Soltar | Vuelve a LISTENING | `tx_ended`, `phase to=LISTENING` | El microfono se libera |
| Segundo PTT seguido | Funciona igual | `tx_started` con otro transmissionId | No queda el canal ocupado |
| Historial | Aparece el audio propio | — | El WAV llega a la pagina Audios |

### D. Background

| Paso | Esperado | Log | PASS si |
|---|---|---|---|
| Home | Sesion viva | Sin `service_destroyed` | Notificacion persiste |
| Pantalla apagada 5 min | Sesion viva | Sin `socket_disconnected`, o con reconexion exitosa | Vuelve a LISTENING |
| Doze forzado | Puede desconectar | `reconnect_scheduled` / `reconnect_attempt` | Recupera al salir de Doze |
| Volver a la app | Sin sesion nueva | Sin `service_created` | Continuidad |
| **PTT con la app en background** | Riesgo conocido | `foreground_microphone_denied` si Android lo niega | Si aparece, documentar el modelo y version |

### E. Red

| Paso | Esperado | Log | PASS si |
|---|---|---|---|
| Wi-Fi OFF | Desconexion detectada | `socket_disconnected`, `reconnect_scheduled` | Pasa a RECONNECTING |
| Solo datos moviles | Reconecta | `reconnect_attempt`, `socket_connected`, `join_granted` | Vuelve a LISTENING |
| Wi-Fi ON | Reconecta de nuevo | Igual | Vuelve a LISTENING |
| Cortar red durante TX | Corta la captura | `tx_aborted` o `tx_revoked` | **Nunca** vuelve a TRANSMITTING solo |

### F. Logout

| Paso | Esperado | Log | PASS si |
|---|---|---|---|
| Cerrar sesion | Todo se destruye | `deactivate`, `service_destroyed` | Notificacion desaparece |
| `ps` del proceso | Sin servicio | — | `dumpsys` no lista el servicio |
| Volver a entrar | Sesion limpia | `service_created` de nuevo | LISTENING otra vez |

---

## 4. Nivel 2 — dos dispositivos

A y B en el mismo canal y la misma organizacion.

| # | Accion | Esperado | Logs | PASS si |
|---|---|---|---|---|
| 1 | A transmite, B escucha | B reproduce | A: `tx_started` · B: `rx_started`, `rx_ended` | Audio inteligible, latencia < 1 s |
| 2 | B transmite, A escucha | Simetrico | Inverso | Igual que 1 |
| 3 | A y B pulsan a la vez | Uno gana | Perdedor: `floor_denied error=channel_busy` | Solo uno transmite; el otro ve "Canal ocupado" |
| 4 | A cambia de canal mientras B transmite | A deja de oir | A: `select_channel`, `join_granted` | A no recibe audio del canal anterior |
| 5 | B con pantalla bloqueada, A transmite | B reproduce igual | B: `rx_started` con pantalla apagada | **Prueba clave del background** |
| 6 | A con pantalla bloqueada transmite | B recibe | A: `tx_started` sin la app visible | **Prueba clave del background** |
| 7 | A cambia Wi-Fi -> datos durante RX | Reconecta y sigue | `reconnect_attempt`, `join_granted` | Vuelve a recibir sin reiniciar la app |
| 8 | Llamada ManeComb entrante a A durante TX | Radio cede el micro | A: `call_pause wasTransmitting=true` | La llamada tiene audio; Radio en pausa |
| 9 | Termina la llamada | Radio vuelve | A: `call_resume`, `join_granted` | LISTENING; **no** reanuda la transmision |
| 10 | Llamada telefonica del sistema | Igual que 8 | `audio_failure code=ptt_audio_focus_lost` | Radio no compite por el micro |
| 11 | Soak 30-60 min | Estable | Sin fugas de `reconnect_scheduled` en bucle | Sigue en LISTENING; bateria razonable |

Criterio FAIL general: dos transmisores simultaneos, audio que no llega,
restauracion automatica de TX tras reconectar, o el servicio muriendo solo.

---

## 5. Que medir en el soak

- consumo de bateria del proceso (`adb shell dumpsys batterystats --charged com.anonymous.combiscontrol`)
- numero de `reconnect_attempt` en 30 minutos (deberia ser 0 en red estable)
- memoria del proceso (`adb shell dumpsys meminfo com.anonymous.combiscontrol`)
- ausencia de `tx_aborted` / `foreground_promotion_failed` inesperados
