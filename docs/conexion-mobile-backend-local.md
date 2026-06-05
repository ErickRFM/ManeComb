# Conexion movil con backend local

La app movil es React Native CLI. La configuracion de red vive en
`mobile/src/config/api_config.ts` y se ajusta localmente con `mobile/.env`
o `mobile/.env.local`.

## IP local

Detecta y guarda la IPv4 LAN real de la PC con:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm run device:lan
```

El script ignora adaptadores VMware, VirtualBox, WSL, Hyper-V, Docker y
Bluetooth, y actualiza:

- `mobile/.env.local`
- `mobile/.env`

Ejemplo:

```env
MANECOMB_API_URL=http://192.168.1.80:5000/api
MANECOMB_SOCKET_URL=http://192.168.1.80:5000
MANECOMB_LAN_HOST=192.168.1.80
MANECOMB_API_TIMEOUT_MS=15000
MANECOMB_ANDROID_CLEARTEXT=1
```

Android Emulator usa `http://10.0.2.2:5000/api` automaticamente cuando detecta
un backend local en la misma PC.

## Backend

El backend debe escuchar en todas las interfaces:

```env
HOST=0.0.0.0
PORT=5000
CLIENT_ORIGIN=*
```

Arranque:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\backend
npm run dev
```

Health checks:

```text
http://localhost:5000/health
http://localhost:5000/api/health
http://<IP-LAN-PC>:5000/health
```

Desde el navegador del celular abre:

```text
http://<IP-LAN-PC>:5000/health
```

Si eso no responde, la app tampoco podra hacer login o registro.

## Windows Firewall

Abre PowerShell como administrador y ejecuta:

```powershell
netsh advfirewall firewall add rule name="ManeComb API 5000" dir=in action=allow protocol=TCP localport=5000
```

Verifica el puerto desde Windows:

```powershell
Test-NetConnection <IP-LAN-PC> -Port 5000
```

## Misma red Wi-Fi

- Laptop y celular deben estar en la misma Wi-Fi.
- Evita redes de invitados: muchas bloquean trafico entre dispositivos.
- Si usas VPN, desactivala para probar o permite trafico LAN.
- Prueba ping desde otro equipo si tienes uno: `ping <IP-LAN-PC>`.

## Android

- Android Emulator: `http://10.0.2.2:5000/api`.
- Celular fisico por Wi-Fi/LAN: `http://<IP-LAN-PC>:5000/api`.
- Celular fisico por USB reverse: `http://127.0.0.1:5000/api`.
- Metro React Native CLI: `npm --prefix mobile start`.
- Instalar/correr en emulador: `npm --prefix mobile run android`.
- Instalar/correr en celular fisico: `npm --prefix mobile run android:device`.

## HTTP local

El backend local no tiene SSL, por eso Android debe permitir HTTP cleartext en
desarrollo. Ya esta activado con:

```env
MANECOMB_ANDROID_CLEARTEXT=1
```

Y el manifiesto Android incluye:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
```
