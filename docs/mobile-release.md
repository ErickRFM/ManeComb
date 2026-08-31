# Release Android ManeComb sin Expo

Stack activo: React Native CLI. No usar Expo para compilar, instalar o publicar.

## Variables finales

Release usa `mobile/.env.production`:

```env
MANECOMB_APP_ENV=production
MANECOMB_API_URL=https://manecomb.onrender.com/api
MANECOMB_SOCKET_URL=https://manecomb.onrender.com
MANECOMB_API_TIMEOUT_MS=15000
MANECOMB_ANDROID_CLEARTEXT=0
```

Desarrollo local puede usar `mobile/.env` o `mobile/.env.local`:

```env
MANECOMB_API_URL=http://<IP-LAN-PC>:5000/api
MANECOMB_SOCKET_URL=http://<IP-LAN-PC>:5000
MANECOMB_LAN_HOST=<IP-LAN-PC>
MANECOMB_ANDROID_CLEARTEXT=1
```

Android Emulator usa `http://10.0.2.2:5000/api` cuando detecta backend local.
Render publico nunca debe usar `:5000`; la URL correcta es `https://manecomb.onrender.com/api`.

## Permisos Android

`mobile/android/app/src/main/AndroidManifest.xml` declara:

- `INTERNET`
- `ACCESS_NETWORK_STATE`
- `ACCESS_FINE_LOCATION`
- `ACCESS_COARSE_LOCATION`
- `ACCESS_BACKGROUND_LOCATION`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_LOCATION`

El flujo runtime verifica primero `PermissionsAndroid.check` para fine/coarse. Si ya existe permiso foreground, continua sin mostrar error falso. El permiso background se consulta sin bloquear el primer acceso al mapa.

Si GPS tarda o falla, el mapa puede abrir con ubicacion pendiente y el usuario puede reintentar desde la pantalla.

## Icon fonts

El APK release copia fuentes de `react-native-vector-icons` desde Gradle:

```gradle
project.ext.vectoricons = [
    iconFontNames: [
        "MaterialCommunityIcons.ttf",
        "MaterialIcons.ttf",
        "Ionicons.ttf",
        "Feather.ttf",
        "FontAwesome.ttf",
        "FontAwesome5_Brands.ttf",
        "FontAwesome5_Regular.ttf",
        "FontAwesome5_Solid.ttf"
    ]
]
apply from: "../../node_modules/react-native-vector-icons/fonts.gradle"
```

Verificacion ejecutada sobre el APK final:

```powershell
tar -tf mobile\dist\app-release.apk | Select-String "assets/fonts"
```

Resultado confirmado:

- `assets/fonts/Feather.ttf`
- `assets/fonts/FontAwesome.ttf`
- `assets/fonts/FontAwesome5_Brands.ttf`
- `assets/fonts/FontAwesome5_Regular.ttf`
- `assets/fonts/FontAwesome5_Solid.ttf`
- `assets/fonts/Ionicons.ttf`
- `assets/fonts/MaterialCommunityIcons.ttf`
- `assets/fonts/MaterialIcons.ttf`

## Firma release

El keystore no se sube a Git. En esta maquina se espera en:

```text
mobile/android/app/manecomb-release.jks
```

Las credenciales deben vivir solo en `mobile/android/local.properties`, que esta ignorado por Git:

```properties
MANECOMB_UPLOAD_STORE_FILE=app/manecomb-release.jks
MANECOMB_UPLOAD_KEY_ALIAS=manecomb-release
MANECOMB_UPLOAD_STORE_PASSWORD=<local>
MANECOMB_UPLOAD_KEY_PASSWORD=<local>
```

GitHub Actions usa los mismos valores mediante secretos, además de los dos
archivos codificados en Base64:

- `MANECOMB_ANDROID_KEYSTORE_BASE64`
- `MANECOMB_UPLOAD_STORE_PASSWORD`
- `MANECOMB_UPLOAD_KEY_ALIAS`
- `MANECOMB_UPLOAD_KEY_PASSWORD`
- `MANECOMB_GOOGLE_SERVICES_JSON_BASE64`
- `MAPBOX_ACCESS_TOKEN`

El workflow manual `.github/workflows/android-release-candidate.yml` falla antes
del build si falta cualquiera. Ningún valor o archivo materializado se conserva
como artefacto.

## Build

Desde `mobile/`:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run typecheck
& "C:\Program Files\nodejs\npm.cmd" run lint
& "C:\Program Files\nodejs\npm.cmd" run android:release
```

Desde la raiz tambien existe:

```powershell
& "C:\Program Files\nodejs\npm.cmd" run build:android:release
```

El script usa una unidad temporal corta si detecta rutas largas de OneDrive.

## Artefactos finales

```text
mobile/dist/app-release.apk
mobile/dist/app-release.aab
mobile/dist/manecomb-<version>-build.<buildNumber>.apk
mobile/dist/manecomb-<version>-build.<buildNumber>.aab
```

Los nombres genéricos preservan compatibilidad local. Sólo el nombre versionado
se publica. Después del build se crea la evidencia reproducible:

```powershell
npm run release:manifest -- --artifact dist/manecomb-1.3.0-build.22.apk `
  --public-url https://github.com/ErickRFM/ManeComb/releases/download/v1.3.0-build.22/manecomb-1.3.0-build.22.apk `
  --release-date 2026-08-30 `
  --release-notes-file dist/release-notes.json `
  --mandatory false
npm run release:verify -- --artifact dist/manecomb-1.3.0-build.22.apk
```

Esto genera `release-manifest.json` y `app-release.sha256`. El manifiesto liga
versión, build, commit Git completo, nombre, bytes, SHA-256, URL pública y el
patch exacto de la autoridad Platform. El comando rechaza un árbol rastreado
sucio para impedir atribuir un binario a un commit distinto.

## Publicación y autoridad

El canal actual es GitHub Releases porque el repositorio es público y el APK
supera el límite por archivo de Cloudflare Pages. El workflow crea primero un
draft, publica los artefactos, descarga el APK desde la URL anónima y compara su
digest antes del handoff. R2 con dominio propio puede añadirse como espejo
posterior; no sustituye la autoridad ni se habilita sin bucket/dominio/secretos.

Sólo después de verificar la descarga se aplica `backendPatch` del manifiesto a
`PATCH /api/platform/system/app/info` con una sesión `platform_owner`. El
backend exige atómicamente `version`, `buildNumber`, `sourceCommit`, `sha256`,
`apkUrl`, `releaseDate`, `releaseNotes` y `mandatory`; la misma operación deriva
la entrada actual de `versionHistory` y marca la previa como no actual.
`/api/app/info` responde 503 si falta cualquiera. Para
rollback se vuelve a publicar de forma atómica el manifiesto de un release
anterior cuyo digest ya fue verificado.

Registro histórico del 2026-06-11 (no es autoridad del candidato actual):

- APK: `mobile/dist/app-release.apk`, 76009324 bytes.
- AAB: `mobile/dist/app-release.aab`, 53030573 bytes.
- Build release: OK.
- API embebida: `https://manecomb.onrender.com/api`.
- Socket embebido: `https://manecomb.onrender.com`.

## Instalar en celular fisico

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices -l
& $adb uninstall com.anonymous.combiscontrol
& $adb install -r mobile\dist\app-release.apk
& $adb logcat -c
& $adb shell am start -n com.anonymous.combiscontrol/.MainActivity
```

Si `pm clear` falla con `SecurityException`, usa `adb uninstall` como limpieza completa.

## Logcat

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb logcat -d -t 1000 AndroidRuntime:E ReactNativeJS:E '*:S'
```

Resultado validado el 2026-06-11 despues de instalar en OnePlus 9 Pro:

- APK instalado correctamente.
- No hubo `AndroidRuntime` fatal en el logcat capturado.
- No hubo `ReactNativeJS` fatal en el logcat capturado.
- La prueba de login en ese equipo quedo bloqueada por lockscreen/PIN del dispositivo, no por build ni instalacion.

## Checklist antes de publicar

- `npm run typecheck` sin errores.
- `npm run lint` sin errores.
- `npm run android:release` exitoso.
- APK contiene icon fonts.
- APK instala en celular fisico.
- Login real contra Render.
- Permiso ubicacion concedido y mapa abre sin reintento manual.
- Reabrir app mantiene sesion.
- Logout vuelve a login.
- Subir AAB a track interno antes de produccion.
