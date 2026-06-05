# Pruebas en Android fisico sin Expo

Proyecto: ManeComb / Combis Control  
Stack movil: React Native CLI  
Backend local: `http://0.0.0.0:5000`

## Estado validado

- PC Wi-Fi LAN detectada: `192.168.1.80`.
- OnePlus LE2121 detectado por ADB en estado `device`.
- OnePlus Wi-Fi: `192.168.1.74/24`, misma red que la PC.
- Backend responde desde PC:
  - `http://localhost:5000/api/health`
  - `http://192.168.1.80:5000/api/health`
- Backend responde desde el OnePlus por LAN:
  - `http://192.168.1.80:5000/api/health`
- Backend responde desde el OnePlus por USB reverse despues de aplicar:
  - `adb reverse tcp:5000 tcp:5000`
  - `http://127.0.0.1:5000/api/health`

## Requisitos del celular

1. Activar Opciones de desarrollador.
2. Activar Depuracion USB.
3. Conectar por USB y aceptar la huella RSA.
4. Mantener el celular y la PC en la misma red Wi-Fi si se usa LAN.
5. Evitar redes de invitados, VPN o aislamiento de clientes Wi-Fi.

## Verificar ADB

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

Estados:

- `device`: listo.
- `unauthorized`: desbloquea el celular y acepta la huella RSA.
- `offline`: reconecta USB o ejecuta `adb kill-server` y `adb start-server`.

Recuperacion:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" kill-server
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" start-server
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

## Detectar IP LAN real

Desde Windows:

```powershell
ipconfig
```

Elegir la IPv4 del adaptador Wi-Fi o Ethernet con puerta de enlace. Ignorar:

- VMware.
- VirtualBox.
- WSL.
- Hyper-V / vEthernet.
- Docker.
- Bluetooth.
- IPs sin gateway.

Script recomendado:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm run device:lan
```

Este script actualiza `mobile/.env.local` y `mobile/.env`:

```env
MANECOMB_API_URL=http://192.168.1.80:5000/api
MANECOMB_SOCKET_URL=http://192.168.1.80:5000
MANECOMB_LAN_HOST=192.168.1.80
MANECOMB_API_TIMEOUT_MS=15000
MANECOMB_ANDROID_CLEARTEXT=1
```

## Encender backend

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\backend
npm run dev
```

Variables esperadas:

```env
HOST=0.0.0.0
PORT=5000
CLIENT_ORIGIN=*
```

Health checks:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
Invoke-RestMethod http://192.168.1.80:5000/api/health
```

Desde el celular, abrir en navegador:

```text
http://192.168.1.80:5000/api/health
```

## Windows Firewall

Si el celular no puede abrir `/api/health`, abrir PowerShell como administrador:

```powershell
netsh advfirewall firewall add rule name="ManeComb API 5000" dir=in action=allow protocol=TCP localport=5000
```

Verificar:

```powershell
netsh advfirewall firewall show rule name="ManeComb API 5000"
```

Nota: crear la regla requiere una terminal elevada. Sin permisos de administrador, Windows responde: `La operacion solicitada requiere elevacion`.

## Encender Metro

Terminal 1:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm start
```

El script ejecuta:

```text
react-native start --port 8081
```

## Instalar y abrir en celular fisico por LAN

Terminal 2:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm run device:doctor
npm run android:device
```

El flujo:

1. Detecta el celular fisico, no el emulador.
2. Actualiza `.env.local` y `.env` con la IP LAN.
3. Aplica `adb reverse tcp:8081 tcp:8081` para Metro.
4. Compila, instala y abre la app.
5. La API y socket apuntan a `http://192.168.1.80:5000`.

## Alternativa USB reverse

Conviene cuando el Wi-Fi bloquea trafico entre dispositivos o cambia la IP de la PC.

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> reverse tcp:8081 tcp:8081
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> reverse tcp:5000 tcp:5000
```

Con USB reverse, el celular puede llegar al backend en:

```text
http://127.0.0.1:5000/api
```

Diagnostico USB:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm run device:doctor -- --usb-reverse
```

Instalar en modo USB reverse:

```powershell
npm run android:device -- --usb-reverse
```

Para volver al modo LAN despues de probar USB reverse:

```powershell
npm run device:lan
```

LAN es mejor para probar escenarios reales de red. USB reverse es mejor para depurar cuando el firewall, router o Wi-Fi no cooperan.

## Permisos Android revisados

El manifiesto Android incluye:

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `ACCESS_COARSE_LOCATION`
- `ACCESS_FINE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE_LOCATION`
- `ACCESS_WIFI_STATE` no esta declarado porque la app no consulta SSID/BSSID directamente.

Los permisos runtime de ubicacion deben aceptarse desde la app cuando se prueben mapa, rutas o tracking.

## Diagnostico de red

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm run device:doctor
```

Comprobaciones manuales:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> shell ip route
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> shell curl -sS --connect-timeout 5 http://192.168.1.80:5000/api/health
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> reverse --list
```

## QA funcional recomendado

1. Abrir app.
2. Ver login sin red screen.
3. Tocar `Probar conexion`.
4. Login.
5. Registro.
6. Usuario sin plan.
7. Plan/checkout local o mock.
8. Activacion con key de conductor.
9. Dashboard.
10. Unidades.
11. Rutas.
12. Incidencias.
13. Bitacora.
14. Chat/socket.
15. Logout.
16. Cerrar y volver a abrir.

## Logs utiles

Backend:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\backend
npm run dev
```

Metro:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm start
```

Logcat OnePlus:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> logcat -d -t 500
```

Filtrar errores de red:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> logcat -d -t 800 | Select-String "ReactNativeJS|Network|fetch|socket|FATAL|AndroidRuntime"
```

## Errores comunes

`unauthorized`:

- Desbloquea Android.
- Acepta la huella RSA.
- Cambia de cable USB si no aparece el dialogo.
- Revoca autorizaciones USB en Opciones de desarrollador y reconecta.

`offline`:

- Reconecta USB.
- Ejecuta `adb kill-server` y `adb start-server`.
- Desactiva y reactiva Depuracion USB.

Timeout al backend:

- Verifica `npm run device:lan`.
- Abre `http://<IP-LAN-PC>:5000/api/health` en el navegador del celular.
- Revisa firewall.
- Confirma que PC y celular estan en la misma Wi-Fi.
- Evita redes de invitados.

Backend no responde:

- Confirma `HOST=0.0.0.0`.
- Confirma `PORT=5000`.
- Revisa `netstat -ano | Select-String ':5000'`.
- Reinicia backend.

Metro no conecta:

- Mantener `npm start` abierto.
- Aplicar `adb reverse tcp:8081 tcp:8081`.
- Usar `npm run android:device`.

Puerto ocupado:

```powershell
netstat -ano | Select-String ':5000'
netstat -ano | Select-String ':8081'
```

IP incorrecta:

- Ejecuta `npm run device:lan`.
- No uses IPs VMware/VirtualBox/WSL/Hyper-V.
- Recompila o reinstala despues de cambiar `.env`.
