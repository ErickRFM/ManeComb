# ManeComb Mobile

App movil React Native CLI para Android/iOS. El entrypoint es `index.js`, que registra `App.tsx`.

## Desarrollo Android

### Certificación del APK debug en CI

Que `assembleDebug` termine correctamente es solo un **compile gate**: no demuestra que el APK pueda ejecutarse sin Metro ni que incluya su configuración de runtime. El job `android-debug-apk` de CI es un **artifact certification gate**: crea un `.env.ci` temporal desde el secret `MAPBOX_ACCESS_TOKEN`, genera el bundle JS production-like, compila el APK y verifica dentro del artefacto el bundle standalone y la misma configuración pública `pk.` de Mapbox en JavaScript y recursos/manifest Android. El upload ocurre únicamente después de esas verificaciones.

```powershell
npm install
npm start
```

En otra terminal:

```powershell
npm run android
```

Para celular fisico Android:

```powershell
npm run device:lan
npm run device:doctor
npm run android:device
```

Para iniciar Metro con cache limpia:

```powershell
npm run start:clear
```

## Builds

```powershell
npm run build:apk:android
npm run android:debug
npm run android:install
```

El proyecto nativo Android vive en `android/` y debe mantenerse versionado. No regeneres `android/` con herramientas de Expo.

## Configuracion

Variables aceptadas:

- `MANECOMB_API_URL`, por ejemplo `http://<IP-LAN-PC>:5000/api`.
- `MANECOMB_SOCKET_URL`, por ejemplo `http://<IP-LAN-PC>:5000`.
- `MANECOMB_LAN_HOST`, por ejemplo `<IP-LAN-PC>`.
- `MANECOMB_API_TIMEOUT_MS=15000`.
- `GOOGLE_MAPS_API_KEY` o `MANECOMB_GOOGLE_MAPS_API_KEY` para Google Maps.
- `MANECOMB_ANDROID_CLEARTEXT=1` para permitir HTTP local en desarrollo.

Android Emulator usa `10.0.2.2` automaticamente cuando detecta backend local en la misma PC.
Celular fisico usa la IPv4 LAN escrita por `npm run device:lan` en `.env.local` y `.env`.

## Validacion rapida

```powershell
npm run typecheck
npm run lint
cd android
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```
