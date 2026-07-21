# RC-MOBILE-APP-CENTER-05 — Integración de Versiones con la App Móvil

## Resumen

Se integró el Mobile App Center con la aplicación móvil de conductores para que el sistema detecte automáticamente qué versión utiliza cada conductor, notifique actualizaciones disponibles y administre el ciclo de actualización desde el Portal.

---

## Arquitectura

```
Portal (Admin Web)
      │
      │ PATCH /api/app/info   (publica versión nueva)
      ▼
   Backend (store.appConfig)
      │
      │ POST /auth/login  (app envía appVersion, buildNumber, platform)
      │ GET  /auth/me     (opcional: ?appVersion=1.0.2)
      │ POST /auth/refresh (app envía appVersion)
      ▼
   Login Response
      │
      ├── updateAvailable: boolean
      ├── latestVersion: string
      ├── mandatory: boolean
      ├── releaseNotes: string[]
      └── downloadUrl: string
      │
      ▼
   App Móvil
      │
      ├── update-service.ts  (servicio centralizado)
      ├── update-banner.tsx  (banner discreto + diálogo obligatorio)
      └── store.updateInfo   (estado global)
```

## Flujo

1. El administrador publica una nueva versión desde el Portal (`PATCH /app/info`)
2. El conductor inicia sesión en la App Móvil
3. La App envía `{ appVersion, buildNumber, platform }` junto con credenciales
4. El backend compara la versión instalada vs. la publicada usando `compareVersions()`
5. Si hay una versión más reciente, la respuesta incluye `updateAvailable: true`, `latestVersion`, `mandatory`, `releaseNotes`, `downloadUrl`
6. La App almacena la info en `store.updateInfo` y en `update-service.ts`
7. Se muestra un banner discreto ("Nueva versión disponible v1.0.3 [Actualizar] [Más tarde]")
8. Si `mandatory: true`, se muestra un diálogo modal que bloquea el uso hasta actualizar
9. El botón "Actualizar" abre `downloadUrl` mediante `Linking.openURL()`
10. El backend registra la versión del dispositivo por usuario (`recordDeviceVersion`)
11. El Portal muestra tarjetas con estadísticas: dispositivos totales, versión más usada, última publicación

## Contratos

### POST /auth/login (request)
```json
{
  "email": "conductor@example.com",
  "password": "secret",
  "appVersion": "1.0.2",
  "buildNumber": "18",
  "platform": "android"
}
```

### POST /auth/login (response — nuevos campos)
```json
{
  "ok": true,
  "token": "...",
  "user": { ... },
  "updateAvailable": true,
  "latestVersion": "1.0.3",
  "mandatory": false,
  "releaseNotes": ["GPS optimizado", "Mejoras de estabilidad"],
  "downloadUrl": "https://1drv.ms/u/s!...",
  ...
}
```

### GET /app/device-stats (response)
```json
{
  "ok": true,
  "data": {
    "total": 5,
    "versions": { "1.0.2": 3, "1.0.1": 2 },
    "mostUsedVersion": "1.0.2",
    "lastPublication": "2026-07-20"
  }
}
```

## Cambios por archivo

### Backend

| Archivo | Cambio |
|---------|--------|
| `backend/src/data/seedData.js` | Se agregó `mandatory: false` a cada entrada de `versionHistory` |
| `backend/src/data/store.js` | Se agregaron `recordDeviceVersion(userId, info)` y `getDeviceVersionStats()` al embedded store |
| `backend/src/data/mongo-store.js` | Se agregaron `recordDeviceVersion` y `getDeviceVersionStats` al mongo store |
| `backend/src/modules/auth/routes.js` | Se agregó `compareVersions()` y `getAppUpdateInfo()`. `buildLoginResponse` ahora acepta `appVersion`, `buildNumber`, `platform` del body y agrega `updateAvailable`, `latestVersion`, `mandatory`, `releaseNotes`, `downloadUrl` a la respuesta. `sendSessionResponse` acepta `appVersion` como query param. `/auth/refresh` también incluye update info. Se registra `recordDeviceVersion` en login |
| `backend/src/modules/app/routes.js` | Se agregó `GET /app/device-stats` para consultar estadísticas de versiones instaladas |

### Frontend — Aplicación Móvil

| Archivo | Cambio |
|---------|--------|
| `mobile/src/utils/version.ts` | **Nuevo** — Constantes `APP_VERSION = '1.0.2'` y `BUILD_NUMBER = '18'` |
| `mobile/src/types/app.ts` | Se agregaron `updateAvailable`, `latestVersion`, `mandatory`, `releaseNotes`, `downloadUrl` a `LoginResult` y `SessionResult` |
| `mobile/src/api/client.ts` | `loginRequest` ahora acepta `appVersion` y `buildNumber` y los envía en el body. `getSessionRequest` acepta `appVersion` como query param. `refreshSessionRequest` acepta `appVersion`. Se agregó import de `Platform` |
| `mobile/src/store/root-store.ts` | Se agregó `updateInfo` al `AppState`. `signIn` captura `updateInfo` del login response y lo persiste en store + update-service. `initialize` captura `updateInfo` de session/refresh y lo persiste. `clearSessionState` resetea `updateInfo` |
| `mobile/src/services/update-service.ts` | **Nuevo** — Servicio centralizado con `setUpdateInfo`, `getUpdateInfo`, `hasUpdate`, `isMandatoryUpdate`, `getLatestVersion`, `getReleaseNotes`, `getDownloadUrl`, `openDownloadUrl` |
| `mobile/src/components/update-banner.tsx` | **Nuevo** — Banner discreto (no bloqueante) + diálogo de actualización obligatoria (modal bloqueante). Usa `openDownloadUrl()` del servicio centralizado |
| `mobile/App.tsx` | Se agregó `UpdateBanner` import y renderizado condicional (`{isReady && user ? <UpdateBanner /> : null}`) |

### Frontend — Portal

| Archivo | Cambio |
|---------|--------|
| `ventas/src/lib/api.ts` | Se agregaron `DeviceVersionStats` type y `getDeviceVersionStatsRequest()` |
| `ventas/features/portal/api.ts` | Se re-exportó `getDeviceVersionStatsRequest` |
| `ventas/features/portal/components/portal-app-admin.tsx` | Se agregó tarjeta "Estado de los dispositivos" con stats: dispositivos totales, versión más usada, última publicación, versiones distintas |

## Validaciones

- ✅ `npm run typecheck` en `mobile/` — sin errores
- ✅ `npm run typecheck` en `ventas/` — sin errores
- ✅ `npm run build` en `ventas/` — build exitoso
- ✅ Backward compatibility: login sin `appVersion` no incluye update info (solo devuelve `{}`)
- ✅ RC-01 a RC-04 no modificados
- ✅ Sin nuevas dependencias
- ✅ Sin módulos paralelos
- ✅ Una única fuente de verdad: `store.appConfig`

## Riesgos

- `APP_VERSION` en `mobile/src/utils/version.ts` debe actualizarse manualmente con cada build nativo. En producción se recomienda reemplazar con `react-native-device-info` o lectura nativa de `versionName`
- El banner usa `position: absolute` con `top: 50` que puede superponerse con el notch en algunos dispositivos. Ajustar según safe area insets en producción
- La comparación de versiones es semver numérica simple (`1.0.2` vs `1.0.10`). No soporta pre-release tags

## Dictamen

RC-05 implementa el ciclo completo de detección y actualización de versiones entre el Portal y la App Móvil. Todas las fases (1-8) están cubiertas. Backward compatible. TypeScript y build verificados. Aprobado para integración.
