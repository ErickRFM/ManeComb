# RC-MOBILE-APP-CENTER-05.1 — Auditoría y Consolidación

## Resumen

Se auditó todo el módulo Mobile App Center (RC-01 a RC-05) para garantizar que todos los datos provengan de fuentes oficiales, sin duplicaciones, sin código muerto, sin valores hardcodeados ni inconsistencias entre backend y frontend. Se revisaron 16 archivos en 10 fases.

---

## Mapa de Flujo — Fuente Oficial de Cada Dato

```
Portal (Admin Web)                              Fuente: store de Zustand usePortalStore
  │                                             Lee: GET /api/app/info
  │ PATCH /api/app/info → store.updateAppConfig()  Fuente: backend store (archivo o mongo)
  ▼
Backend                                          Fuente: store.getAppConfig()
  │                                             GET  /api/app/info → store.getAppConfig()
  │ POST /auth/login → getAppUpdateInfo(store.getAppConfig(), appVersion)
  │ POST /auth/refresh → getAppUpdateInfo(store.getAppConfig(), appVersion)
  ▼
Login Response                                  Fuente: getAppUpdateInfo()
  ├── updateAvailable: derived de compareVersions()
  ├── latestVersion: de appConfig.version
  ├── mandatory: de appConfig.mandatory
  ├── releaseNotes: de appConfig.releaseNotes
  └── downloadUrl: de appConfig.apkUrl
  │
  ▼
App Móvil                                        Fuente ÚNICA: store.updateInfo (Zustand)
  ├── update-banner.tsx  → useAppStore((s) => s.updateInfo)
  └── store.updateInfo   ← seteado en signIn / initialize de root-store.ts
```

**Confirmación de fuente única de verdad:**
- GET /api/app/info y PATCH /api/app/info usan `store.getAppConfig()` / `store.updateAppConfig()` — OK
- `buildLoginResponse` usa `getAppUpdateInfo()` que lee de `store.getAppConfig()` — OK
- Portal lee de store Zustand → GET /api/app/info — OK
- App móvil lee de store Zustand → login response — OK

---

## Elementos Reutilizados de la Arquitectura Existente

| Elemento | Ubicación | Uso en RC |
|----------|-----------|-----------|
| Zustand store | `mobile/src/store/use-app-store.ts` | `updateInfo` estado global |
| `compareVersions` | `backend/src/utils/semver.js` | Comparación backend en auth routes |
| `Linking.openURL` | React Native | Descarga de APK |
| Portal theme (`portalPalette`, `portalGlass`) | `ventas/features/portal/portal-theme.ts` | Estilos consistentes |
| Layout System | `ventas/features/portal/components/portal-layout.tsx` | Layout del portal |
| `SkeletonBlock`, `EmptyState`, `StatusBadge` | `ventas/src/components/ui/` | Estados visuales |

---

## Duplicaciones Eliminadas

| Archivo Eliminado | Justificación |
|-------------------|---------------|
| `mobile/src/services/update-service.ts` | Mantenía un singleton (`currentUpdate`) que duplicaba `store.updateInfo`. La store Zustand ya es la fuente de verdad. `openDownloadUrl` se inlineó en `UpdateBanner`. |

### Cambios realizados por la eliminación

1. **`mobile/src/services/update-service.ts`** — Eliminado (duplicaba estado de la store).
2. **`mobile/src/components/update-banner.tsx`** — `openDownloadUrl` inlineado: `Linking.openURL(updateInfo?.downloadUrl)`.
3. **`mobile/src/store/root-store.ts`** — Eliminados los `require/import` y llamadas a `setUpdateInfo()` en `initialize` (líneas 1831-1834) y `signIn` (líneas 1858-1859).

---

## Código Muerto Eliminado

- `update-service.ts`: funciones `getUpdateInfo`, `hasUpdate`, `isMandatoryUpdate`, `getLatestVersion`, `getReleaseNotes`, `getDownloadUrl` no eran usadas por ningún componente (el banner leía directo de la store).
- `setUpdateInfo` calls en `root-store.ts`: ya no son necesarias al eliminarse el servicio.

---

## Inconsistencias Corregidas

| Archivo | Inconsistencia | Corrección |
|---------|---------------|------------|
| `ventas/src/types/app.ts` | `PortalAppVersion` no tenía `mandatory?` pese a que seed data y backend lo envían | Agregado `mandatory?: boolean` |
| `backend/src/modules/app/routes.js` | Fallback hardcodeado de GET no incluía `status`, ni `archived`/`mandatory` en `versionHistory` | Agregados los campos faltantes |
| `ventas/features/portal/components/portal-app-admin.tsx` | `addVersion` no inicializaba `mandatory: false` | Agregado `mandatory: false` |

---

## Riesgos Encontrados (No Corregidos)

| Riesgo | Archivo | Explicación |
|--------|---------|-------------|
| `getAppPalette('light')` hardcodeado | `mobile/src/components/update-banner.tsx` | Los colores del banner no se adaptan al tema oscuro. Corregir requeriría usar `useAppTheme()`, lo que implica cambiar el diseño del banner (fuera del alcance de RC-05.1). |
| Backend sin validación de `mandatory` en PATCH | `backend/src/modules/app/routes.js` | PATCH acepta `mandatory` pero no lo valida (no hay schema). El seed data lo incluye, pero un request malformado podría omitirlo silenciosamente. |
| `deepEq` helper local | `ventas/features/portal/components/portal-app-admin.tsx` | Función de comparación profunda inline. Podría reemplazarse con `lodash.isequal` o similar si existiera en el proyecto. No se reemplazó porque no hay indicios de que exista ya en las dependencias. |
| Sin tests | — | No hay tests unitarios ni de integración para el módulo. Agregarlos es una mejora fuera del alcance. |

---

## Dictamen Final

**El módulo Mobile App Center es sólido, con una sola fuente de verdad clara y sin duplicaciones arquitectónicas.** La auditoría encontró y corrigió 3 inconsistencias menores (tipos faltantes, campos quemados incompletos) y eliminó 1 archivo duplicado. Los riesgos restantes son menores y no afectan la funcionalidad actual. No se encontraron fugas de datos, endpoints huérfanos, ni fuentes de datos paralelas.

**Estado: APROBADO** — RC-05.1 completada.
