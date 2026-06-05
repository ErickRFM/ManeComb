# Como correr ManeComb sin Expo

Proyecto: ManeComb / Combis Control  
Sistema local: Windows + Android Studio + React Native CLI  
Carpeta mobile: `mobile`

## Resumen rapido

Abre tres terminales PowerShell desde la raiz del repo:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app
```

Terminal 1, backend:

```powershell
npm run dev:backend
```

Terminal 2, Metro React Native CLI:

```powershell
cd mobile
npm start
```

Terminal 3, Android:

```powershell
cd mobile
adb reverse tcp:8081 tcp:8081
npm run android
```

`npm run android` tambien aplica `adb reverse tcp:8081 tcp:8081` internamente y selecciona el emulador si hay mas de un dispositivo conectado.

No se usa Expo para correr Android.

## A) Backend

Ubicacion:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\backend
```

Comando:

```powershell
npm run dev
```

Variables minimas:

```env
HOST=0.0.0.0
PORT=5000
JWT_SECRET=valor-local-largo
REQUIRE_MONGO=false
```

Si `REQUIRE_MONGO=true`, tambien necesitas `MONGO_URI` y MongoDB disponible.

URLs esperadas:

```text
http://localhost:5000/health
http://localhost:5000/api/health
http://localhost:5000/api
```

Validar health:

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

## B) Mobile Metro

Ubicacion:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
```

Comando:

```powershell
npm start
```

Debe aparecer Metro de React Native CLI escuchando en el puerto `8081`. No debe aparecer Expo Go.
El script `npm start` ejecuta `react-native start --port 8081`.

Cache limpia:

```powershell
npm run start:clear
```

## C) Android emulator

Prender desde Android Studio:

1. Android Studio > Device Manager.
2. Iniciar `Pixel_6`.
3. Esperar a que termine boot.

Verificar ADB:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices
```

Estado esperado:

```text
emulator-5554 device
```

Instalar/correr app:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
adb reverse tcp:8081 tcp:8081
npm run android
```

Si hay telefono fisico y emulador al mismo tiempo, `npm run android` usa el emulador por defecto. Para forzar otro dispositivo:

```powershell
$env:ANDROID_SERIAL="adb-xxxx"
npm run android
```

Build debug sin instalar:

```powershell
npm run android:debug
```

Instalar APK debug:

```powershell
npm run android:install
```

APK debug con bundle incluido, sin depender de Metro:

```powershell
npm run android:debug-bundled
```

APK release con bundle incluido:

```powershell
npm run android:release-bundled
```

Ese comando genera:

```text
android/app/src/main/assets/index.android.bundle
```

Usa `android:debug-bundled` solo cuando quieras probar un APK con JS empacado.
Para desarrollo normal, mantener Metro encendido y usar `npm run android`.

Backend desde emulador:

```text
http://10.0.2.2:5000/api
```

La app sustituye automaticamente hosts locales por `10.0.2.2` cuando detecta Android Emulator.

## D) Celular fisico

1. Activa opciones de desarrollador.
2. Activa depuracion USB.
3. Conecta el telefono por USB.
4. Acepta la huella RSA.
5. Verifica ADB:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

Configura automaticamente la IP LAN de la PC:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm run device:lan
```

Ejemplo de `mobile/.env.local` y `mobile/.env`:

```env
MANECOMB_API_URL=http://<IP-LAN-PC>:5000/api
MANECOMB_SOCKET_URL=http://<IP-LAN-PC>:5000
MANECOMB_LAN_HOST=<IP-LAN-PC>
MANECOMB_API_TIMEOUT_MS=15000
MANECOMB_ANDROID_CLEARTEXT=1
```

Instala/corre:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm run android:device
```

Si el telefono no conecta al backend, abre en el navegador del telefono:

```text
http://<IP-LAN-PC>:5000/api/health
```

Diagnostico completo de telefono fisico:

```powershell
npm run device:doctor
```

Alternativa USB reverse para backend local:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -s <DEVICE_ID> reverse tcp:5000 tcp:5000
npm run device:doctor -- --usb-reverse
```

## E) Ventas / portal

`ventas/` es codigo compartido usado por la app mobile; no tiene `package.json` propio.

Rutas dentro de la app:

```text
/ventas
/ventas/login
/ventas/registro
/portal
/portal/plan
/portal/pagos
/portal/facturacion
```

Endpoints principales:

```text
GET  /api/commercial/plans
POST /api/commercial/checkout
GET  /api/portal/overview
```

Para probar ventas, arranca backend + Metro + Android y navega dentro de la app al flujo comercial.

## Scripts utiles

Desde la raiz:

```powershell
npm run dev:backend
npm run dev:mobile
npm run dev:android
npm run dev:ventas
npm run dev:all
npm run check
npm run build:android:debug
npm run build:android:install
```

Script de ayuda:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-windows.ps1 all
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-windows.ps1 adb
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev-windows.ps1 urls
```

## Errores comunes

### ADB offline

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" kill-server
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" start-server
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" devices -l
```

Si sigue offline, reinicia el emulador con Cold Boot Now.

### Metro no conecta

- Confirma que `npm start` sigue abierto.
- En Android emulator usa `adb reverse` antes de abrir la app:

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8081 tcp:8081
```

- Reintenta con cache limpia:

```powershell
npm --prefix mobile run start:clear
```

### Backend no responde

```powershell
Invoke-RestMethod http://localhost:5000/api/health
```

Si falla:

- revisa `backend/.env`
- confirma `PORT=5000`
- confirma que MongoDB esta disponible si `REQUIRE_MONGO=true`
- revisa firewall si pruebas con celular fisico

### Puerto ocupado

```powershell
netstat -ano | findstr :5000
netstat -ano | findstr :8081
```

### Pantalla blanca

1. Mira la terminal de Metro.
2. Revisa logcat:

   ```powershell
   & "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" logcat -d -t 300
   ```

3. Limpia cache:

   ```powershell
   npm --prefix mobile run start:clear
   ```

4. Reinstala:

   ```powershell
   npm --prefix mobile run android
   ```

5. Si quieres descartar Metro por completo, genera un debug bundled:

   ```powershell
   cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
   npm run android:debug-bundled
   cd android
   .\gradlew.bat installDebug
   ```

### JDK / Gradle

Gradle debe usar Android Studio JBR:

```properties
org.gradle.java.home=C:/Program Files/Android/Android Studio/jbr
```

Validar:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile\android
.\gradlew.bat --version
```

El daemon debe apuntar a `C:\Program Files\Android\Android Studio\jbr`.

### Emulator System UI not responding

1. Cierra el emulador.
2. Device Manager > Cold Boot Now.
3. Si persiste: Wipe Data.
4. Mantener GPU en Software / SwiftShader si la GPU del host provoca bloqueos.

## Validacion recomendada

```powershell
npm --prefix mobile run typecheck
npm --prefix mobile run lint
npm --prefix backend test
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile\android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
.\gradlew.bat installDebug
```

Para validar Metro en desarrollo:

```powershell
cd C:\Users\erik5\OneDrive\Escritorio\combis-app\mobile
npm start
adb reverse tcp:8081 tcp:8081
npm run android
adb reverse --list
```
