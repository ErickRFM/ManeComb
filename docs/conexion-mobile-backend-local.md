# Conexion movil con backend local

Esta app movil es Expo/React Native. La configuracion equivalente a `api_config.dart`
esta en `mobile/src/config/api_config.ts`.

## IP local

La IP Wi-Fi detectada en esta laptop es:

```text
192.168.21.254
```

Para cambiarla, edita:

- `mobile/src/config/api_config.ts`: `localIp`
- `mobile/.env`: `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_SOCKET_URL`, `EXPO_PUBLIC_LAN_HOST`

Tambien puedes ejecutar desde `mobile/`:

```powershell
npm run start:phone:lan
```

Ese script detecta la IP privada activa, actualiza `mobile/.env` y arranca Expo en LAN.

## Backend

El backend debe escuchar en todas las interfaces:

```env
HOST=0.0.0.0
PORT=5000
CLIENT_ORIGIN=*
```

Arranque:

```powershell
cd backend
npm run dev
```

Health checks:

```text
http://localhost:5000/health
http://localhost:5000/api/health
http://192.168.21.254:5000/health
```

Desde el navegador del celular abre:

```text
http://192.168.21.254:5000/health
```

Si eso no responde, la app tampoco podra hacer login o registro.

## Windows Firewall

Abre PowerShell como administrador y ejecuta:

```powershell
New-NetFirewallRule -DisplayName "Combis Backend 5000" -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow
```

Verifica el puerto desde Windows:

```powershell
Test-NetConnection 192.168.21.254 -Port 5000
```

## Misma red Wi-Fi

- Laptop y celular deben estar en la misma Wi-Fi.
- Evita redes de invitados: muchas bloquean trafico entre dispositivos.
- Si usas VPN, desactivala para probar o permite trafico LAN.
- Prueba ping desde otro equipo si tienes uno: `ping 192.168.21.254`.

## Android e iOS

- Android Emulator usa `http://10.0.2.2:5000/api`.
- iOS Simulator usa `http://localhost:5000/api`.
- Celular fisico usa `http://192.168.21.254:5000/api`.

La app intenta detectar el host de Metro/Expo en desarrollo. En builds instalados,
usa `localIp` y las variables `EXPO_PUBLIC_*`.

## HTTP local

El backend local no tiene SSL, por eso Android debe permitir HTTP cleartext en
desarrollo. Ya esta activado con:

```env
EXPO_ANDROID_CLEARTEXT=1
```

Y el manifiesto Android incluye:

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE"/>
```
