# Migracion Expo a React Native CLI

Rama de trabajo: `migrate/remove-expo-react-native-cli`

Estado: se creo una app nueva en `apps/mobile-rn-cli`. La app Expo existente en `mobile/` no fue eliminada ni modificada.

## Diagnostico inicial

### Expo app actual

Dependencias Expo detectadas en `mobile/package.json`:

- `expo`, `expo-router`, `expo-asset`, `expo-audio`, `expo-constants`, `expo-font`, `expo-haptics`, `expo-image`, `expo-image-picker`, `expo-linking`, `expo-location`, `expo-notifications`, `expo-secure-store`, `expo-splash-screen`, `expo-status-bar`, `expo-system-ui`, `expo-updates`, `expo-video`, `expo-web-browser`, `@expo/vector-icons`, `eslint-config-expo`.

Uso Expo rastreado antes de migrar:

- Navegacion: `expo-router` en rutas de `mobile/app`.
- Storage seguro: `expo-secure-store` en store de sesion.
- Ubicacion: `expo-location` en hook de GPS.
- Push: `expo-notifications` y `expo-constants`.
- Media: `expo-image-picker`, `expo-audio`, `expo-video`, `expo-image`.
- UI/build: `expo-font`, `expo-splash-screen`, `expo-status-bar`, `expo-linking`.

Riesgo de eliminar directamente: alto. Varias piezas se conectan por rutas, navegacion, auth, dashboard, planes y activacion. Por eso se dejo `mobile/` intacto.

### Rutas y pantallas detectadas

Se encontraron pantallas activas en Expo para login, registro, ventas, portal, dashboard, mapa/GPS, incidencias, checklist, chat, radio, perfil, usuarios, perfil comprador y pantallas legacy. No se borraron por riesgo de navegacion dinamica.

### Dependencias sospechosas

- La auditoria de `mobile/` reporto 17 vulnerabilidades moderadas ligadas al arbol Expo. `npm audit` proponia cambios mayores/forzados, por eso no se aplico `audit fix --force`.
- En la app nueva, `npm audit --audit-level=moderate` reporta 7 vulnerabilidades moderadas en `fast-xml-parser`, arrastradas por `@react-native-community/cli`. La correccion disponible requiere `npm audit fix --force` y subir fuera del rango declarado, por eso queda pendiente.

## App RN CLI nueva

Ubicacion: `apps/mobile-rn-cli`

Base creada con React Native CLI:

- React Native `0.81.5`
- React `19.1.0`
- Sin `expo`, sin `expo-router`, sin `expo-*` instalados
- `applicationId` preservado: `com.anonymous.combiscontrol`
- `namespace`: `com.manecombrn`

El lockfile puede mencionar `expo` solo como peer opcional de librerias RN; no existe `node_modules/expo` ni dependencia Expo en `package.json`.

## Reemplazos aplicados

| Expo / pieza anterior | Reemplazo RN CLI | Estado |
| --- | --- | --- |
| `expo-router` | `@react-navigation/native`, native stack y bottom tabs | Migrado a rutas base |
| `expo-secure-store` | `react-native-keychain` | Migrado |
| `expo-location` | `react-native-geolocation-service` | Migrado |
| `expo-notifications` | `@react-native-firebase/messaging` + `@notifee/react-native` | Base migrada |
| `expo-image-picker` | `react-native-image-picker` | Dependencia lista |
| `expo-constants` | `react-native-config` + `react-native-device-info` | Migrado |
| `expo-status-bar` | APIs nativas de RN | No requerido en base |
| `expo-font`, `expo-splash-screen`, `expo-updates`, `expo-video`, `expo-audio`, `expo-image` | No instalados en la app nueva | Pendiente solo si se migra UI/media completa |
| `react-native-reanimated` / `react-native-worklets` | Removidos | No habia uso real; bloqueaban release sin New Architecture |

## Configuracion de entorno

Archivos:

- `apps/mobile-rn-cli/.env.development`
- `apps/mobile-rn-cli/.env.production`

Variables:

```env
API_BASE_URL=http://10.0.2.2:5000/api
SOCKET_URL=http://10.0.2.2:5000
APP_ENV=development
```

Para backend remoto de produccion, actualizar `.env.production`:

```env
API_BASE_URL=https://api.tu-dominio.com/api
SOCKET_URL=https://api.tu-dominio.com
APP_ENV=production
```

`release` desactiva cleartext traffic cuando `APP_ENV=production`. `debug` usa `.env.development`.

## Estructura migrada

Se agregaron:

- `src/api/client.ts`: cliente Axios con JWT, refresh token, errores y endpoints criticos.
- `src/store/session-store.ts`: sesion, login, registro, activacion, planes, checkout, logout y carga operativa.
- `src/navigation/AppNavigator.tsx`: guards por auth, plan, pago pendiente y operacion.
- `src/services/socket.ts`: Socket.IO con token.
- `src/services/location.ts`: permisos y GPS.
- `src/services/notifications.ts`: Notifee/FCM base.
- `src/services/secure-storage.ts`: Keychain.
- `src/utils/access.ts`: reglas de plan/acceso.
- `src/theme/shadows.ts`: helper unico de sombras para iOS/Android/web.
- Pantallas base: login, registro, activacion, planes, pago pendiente, dashboard, flotilla, GPS, incidencias y perfil.

## Endpoints integrados

La app nueva mantiene los nombres publicos de endpoints usados por ManeComb:

- `/auth/login`
- `/auth/register`
- `/auth/session`
- `/auth/logout`
- `/commercial/plans`
- `/commercial/checkout`
- `/dashboard/overview`
- `/vehicles`
- `/incidents`
- `/locations/update`
- `/driver/activation/register`
- `/admin/activation-keys`
- `/admin/activation-keys/generate`

No se cambiaron tablas, modelos, variables de entorno existentes del backend ni endpoints publicos.

## Android

Cambios nativos importantes:

- Permisos Android agregados para internet, red, ubicacion fina/gruesa/background, foreground service, notificaciones Android 13, wake lock y vibracion.
- `newArchEnabled=false` para esta primera migracion estable. Motivo: Reanimated 4 exigia New Architecture y generaba fallos de rutas largas en Windows; como no habia uso real de Reanimated/Worklets, se removieron esas dependencias.
- Hermes queda activo: `hermesEnabled=true`.
- `react-native-config` usa `.env.development` en debug y `.env.production` en release.
- Release usa firma debug de plantilla. Para Play Store se debe configurar keystore real.

## Comandos

Desde `apps/mobile-rn-cli`:

```powershell
npm install
npm start
npm run android:debug
npm run android:release
npm run android:bundle
npm run typecheck
npm run lint
npm test -- --runInBand
```

Artefactos esperados:

- APK debug: `apps/mobile-rn-cli/android/app/build/outputs/apk/debug/app-debug.apk`
- APK release: `apps/mobile-rn-cli/android/app/build/outputs/apk/release/app-release.apk`
- AAB release: `apps/mobile-rn-cli/android/app/build/outputs/bundle/release/app-release.aab`

## Pruebas ejecutadas

Pasaron:

- `npm run typecheck`
- `npm run lint`
- `npm test -- --runInBand`
- `npm run android:debug`
- `npm run android:release`
- `npm run android:bundle`
- `npm audit --audit-level=moderate` ejecutado y documentado
- Busqueda de Expo en `package.json`, `package-lock.json`, `src`, `android`, `ios`, `App.tsx` e `index.js`

Jest valida reglas criticas de acceso:

- Usuario sin plan bloqueado.
- Pago pendiente bloqueado.
- Cuenta activa puede operar.
- Rol admin identificado.

No se pudieron ejecutar pruebas runtime de login/registro/planes/activacion/dashboard/incidencias/logout porque `adb devices -l` no mostro emulador ni dispositivo conectado.

## Pendientes y riesgos manuales

- Conectar emulador/dispositivo y probar runtime completo: login, registro, usuario sin plan, compra/asignacion de plan, activacion con key, admin con unidades, conductor vinculado, alertas/incidencias, bitacora, logout y limpieza de sesion.
- Agregar `android/app/google-services.json` real y configurar proyecto Firebase para FCM de produccion.
- Configurar keystore release real antes de distribuir.
- Migrar pantallas no incluidas aun en la base RN CLI: chat, radio, checklist, legal, ventas/portal completo y edicion avanzada de perfil.
- Revisar la advertencia de React Native Firebase sobre Legacy Architecture cuando el ecosistema de dependencias permita activar New Architecture sin fallos de build.
- Revisar las 7 vulnerabilidades moderadas del CLI RN cuando haya version compatible sin `--force`.
- Las advertencias Gradle/Kotlin restantes vienen de dependencias nativas (`react-native-screens`, `safe-area-context`, `gesture-handler`, etc.) y no impiden build.

## Criterio de seguridad aplicado

No se elimino la app Expo ni rutas/pantallas legacy. Todo lo sospechoso con posibilidad de uso dinamico quedo intacto. La limpieza real se limito a la app RN CLI nueva: se eliminaron dependencias nativas no usadas (`react-native-reanimated`, `react-native-worklets`) porque no tenian imports ni uso y bloqueaban los builds release sin aportar funcionalidad actual.
