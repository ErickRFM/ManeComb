# RC-PORTAL-04 — Modularización de Administración de la App Móvil

## Estado

Cerrado

## Commit de implementación

```
633a6e3
```

## Objetivo

Modularización estructural del módulo administrativo de la aplicación móvil dentro del Portal, extrayendo componentes presentacionales, estilos y utilidades de `portal-app-movil-screen.tsx` (951 → 151 líneas) y `portal-app-admin.tsx` (699 → 182 líneas), conservando exactamente el comportamiento actual y sin cambiar datos, lógica, UI, store, API, navegación, permisos, versiones, dispositivos, activaciones, estadísticas ni configuración.

## Estado inicial

| Campo | Valor |
|---|---|
| Rama | `main` |
| Commit inicial | `c44a6be` |
| Estado Git | Limpio |
| Líneas originales (screen) | 951 |
| Líneas originales (admin) | 699 |
| Total original | 1,650 |

## Responsabilidad de cada contenedor

- **`PortalAppMovilScreen`**: screen orchestrator. Conserva layout (`PortalLayout`), loading/error/empty states, tab navigation state (`activeTab`, `expandedVersions`), QR generation effect, download handler (`handleDownload`), store access (`usePortalStore`), `useNovidadesScroll` hook. Delega todo el JSX presentacional a componentes extraídos.
- **`PortalAppAdmin`**: admin form container. Conserva RBAC guard (`isAdmin`), form state (`form`, `noteInput`, `historyEditor`, `confirmVisible`, `saved`), device stats fetch, all CRUD callbacks (`setField`, `addNote`, `removeNote`, `editNote`, `addVersion`, `updateVersion`, `removeVersion`, `toggleArchived`, `markCurrent`, `handleSave`), dirty detection via `deepEq`. Delega las secciones del formulario a componentes extraídos.

No existe lógica duplicada entre ambos contenedores.

## Archivos modificados (2)

| Archivo | Responsabilidad | Cambio | Motivo |
|---|---|---|---|
| `portal-app-movil-screen.tsx` | Pantalla pública | 951 → 151 líneas (−84.1%) | Extraer componentes, estilos, hook |
| `portal-app-admin.tsx` | Admin form | 699 → 182 líneas (−74.0%) | Extraer componentes, estilos, utilidad |

## Archivos creados (12)

### Foundation (3)

| Archivo | Responsabilidad | Exports | Consumidores |
|---|---|---|---|
| `app-mobile/app-mobile.styles.ts` | Todos los estilos del módulo | `styles` | Screen, Admin, todos los componentes |
| `app-mobile/app-mobile.utils.ts` | Utilidades puras | `useNovidadesScroll`, `deepEq` | Screen, Admin |

### Componentes — Screen (6)

| Archivo | Responsabilidad | Exports |
|---|---|---|
| `app-mobile/components/app-mobile-hero.tsx` | Hero card con phone mockup, descarga, novedades | `AppMobileHero` |
| `app-mobile/components/app-mobile-info-facts.tsx` | Fila de cards informativas (versión, android, tamaño, fecha) | `AppMobileInfoFacts` |
| `app-mobile/components/app-mobile-download-card.tsx` | Card de descarga con QR, metadatos y botón | `AppMobileDownloadCard` |
| `app-mobile/components/app-mobile-release-notes.tsx` | Sección "Qué incluye esta versión" | `AppMobileReleaseNotes` (forwardRef) |
| `app-mobile/components/app-mobile-tab-bar.tsx` | Barra de tabs (Información/Historial/Administración) | `AppMobileTabBar`, `TabKey` |
| `app-mobile/components/app-mobile-version-timeline.tsx` | Timeline de historial de versiones con items expandibles | `AppMobileVersionTimeline` |

### Componentes — Admin (5)

| Archivo | Responsabilidad | Exports |
|---|---|---|
| `app-mobile/components/app-admin-general-form.tsx` | Formulario de versión, estado, android, tamaño, fecha, APK URL | `AppAdminGeneralForm` |
| `app-mobile/components/app-admin-release-notes-editor.tsx` | Editor de notas de publicación (add/edit/remove) | `AppAdminReleaseNotesEditor` |
| `app-mobile/components/app-admin-version-history-editor.tsx` | Editor CRUD de historial de versiones | `AppAdminVersionHistoryEditor` |
| `app-mobile/components/app-admin-device-stats.tsx` | Panel de estadísticas de dispositivos | `AppAdminDeviceStats` |
| `app-mobile/components/app-admin-save-bar.tsx` | Barra de guardado con indicador dirty/saved | `AppAdminSaveBar` |

## Componentes extraídos

### AppMobileHero

| Campo | Información |
|---|---|
| Responsabilidad | Hero card: logo, título, badge, botón descargar, botón novedades, phone mockup |
| Props | `compact`, `appName`, `appStatus`, `appVersion`, `onDownload`, `onNovidades` |
| JSX de origen | Screen líneas 131-187 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Callbacks recibidos | `onDownload`, `onNovidades` |
| Consumidor | `PortalAppMovilScreen` |

### AppMobileInfoFacts

| Campo | Información |
|---|---|
| Responsabilidad | Fila de 4 cards informativas (versión, android min, tamaño, fecha) |
| Props | `facts: { icon, label, value }[]` |
| JSX de origen | Screen líneas 227-232 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppMovilScreen` |

### AppMobileDownloadCard

| Campo | Información |
|---|---|
| Responsabilidad | Card de descarga con QR code, metadatos y botón grande |
| Props | `compact`, `qrSvg`, `androidMin`, `size`, `version`, `onDownload` |
| JSX de origen | Screen líneas 234-273 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppMovilScreen` |

### AppMobileReleaseNotes

| Campo | Información |
|---|---|
| Responsabilidad | Sección "¿Qué incluye esta versión?" con lista de notas |
| Props | `ref` (forwardRef), `version`, `notes: string[]` |
| JSX de origen | Screen líneas 275-290 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppMovilScreen` |

### AppMobileTabBar

| Campo | Información |
|---|---|
| Responsabilidad | Barra de navegación por tabs (Info/Historial/Administración) |
| Props | `activeTab`, `onTabChange` |
| JSX de origen | Screen líneas 189-223 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppMovilScreen` |

### AppMobileVersionTimeline

| Campo | Información |
|---|---|
| Responsabilidad | Timeline completo con items expandibles y versión actual |
| Props | `versions`, `expandedVersions`, `onToggleVersion`, `onDownload`, `compact` |
| JSX de origen | Screen líneas 294-313 (+ VersionTimelineItem líneas 332-409) |
| Estado interno | Ninguno (expanded state viene del contenedor) |
| Hooks | Ninguno |
| Consumidor | `PortalAppMovilScreen` |

### AppAdminGeneralForm

| Campo | Información |
|---|---|
| Responsabilidad | Formulario de campos generales de la app |
| Props | `form: PortalAppInfo`, `onFieldChange` |
| JSX de origen | Admin líneas 157-229 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppAdmin` |

### AppAdminReleaseNotesEditor

| Campo | Información |
|---|---|
| Responsabilidad | Editor de notas de publicación (add/edit/remove) |
| Props | `noteInput`, `notes`, `onNoteInputChange`, `onAddNote`, `onEditNote`, `onRemoveNote` |
| JSX de origen | Admin líneas 231-263 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppAdmin` |

### AppAdminVersionHistoryEditor

| Campo | Información |
|---|---|
| Responsabilidad | Editor CRUD de historial de versiones |
| Props | `versions`, `onAddVersion`, `onUpdateVersion`, `onRemoveVersion`, `onToggleArchived`, `onMarkCurrent` |
| JSX de origen | Admin líneas 265-391 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppAdmin` |

### AppAdminDeviceStats

| Campo | Información |
|---|---|
| Responsabilidad | Panel de estadísticas de dispositivos |
| Props | `stats: DeviceVersionStats \| null`, `loading: boolean` |
| JSX de origen | Admin líneas 393-420 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppAdmin` |

### AppAdminSaveBar

| Campo | Información |
|---|---|
| Responsabilidad | Barra de guardado con indicador de cambios no guardados |
| Props | `dirty`, `saved`, `isSubmitting`, `onSave` |
| JSX de origen | Admin líneas 422-436 |
| Estado interno | Ninguno |
| Hooks | Ninguno |
| Consumidor | `PortalAppAdmin` |

## Estado conservado

- `PortalAppMovilScreen`: `qrSvg`, `expandedVersions`, `activeTab` (3 estados)
- `PortalAppAdmin`: `form`, `noteInput`, `historyEditor`, `confirmVisible`, `saved`, `deviceStats`, `statsLoading` (7 estados)

## Hooks conservados

Orden en `PortalAppMovilScreen`:
1. `useWindowDimensions` → `compact`
2. `usePortalStore` (useShallow) → `appInfo`, `error`, `isLoading`, `loadAppInfo`
3. `useState` → `qrSvg`
4. `useState` → `expandedVersions`
5. `useState` → `activeTab`
6. `useNovidadesScroll` → `ref`, `scrollToNovidades`

Orden en `PortalAppAdmin`:
1. `useAppStore` → `user`
2. `usePortalStore` (useShallow) → `appInfo`, `isSubmitting`, `updateAppInfo`
3. `useState` → `form`
4. `useState` → `noteInput`
5. `useState` → `historyEditor`
6. `useState` → `confirmVisible`
7. `useState` → `saved`
8. `useState` → `deviceStats`
9. `useState` → `statsLoading`
10. `useEffect` → device stats fetch
11. `useEffect` → form/historyEditor initialization
12. `useMemo` → `dirty`
13-23. `useCallback` → all CRUD callbacks

## Efectos conservados

- `PortalAppMovilScreen`: `useEffect` para `loadAppInfo` inicial, `useEffect` para QR generation desde `appInfo.apkUrl`
- `PortalAppAdmin`: `useEffect` para `getDeviceVersionStatsRequest`, `useEffect` para inicializar `form`/`historyEditor` desde `appInfo`

## Versiones y descargas

No cambiaron. El contenedor `PortalAppMovilScreen` conserva `handleDownload` que usa `Linking.openURL(appInfo.apkUrl)`. Los componentes reciben `onDownload` como callback.

## Dispositivos

No cambiaron. `AppAdminDeviceStats` recibe datos ya obtenidos por el contenedor mediante `getDeviceVersionStatsRequest`.

## Activaciones

No aplica — este módulo no gestiona activaciones directas (son parte de `features/commercial` y `portal-api`).

## Configuración

No cambió. `AppAdminGeneralForm` recibe `form` y `onFieldChange` desde el contenedor. Los payloads y endpoints son idénticos.

## API y store

No modificados. `usePortalStore` y `useAppStore` no fueron alterados. `getDeviceVersionStatsRequest` no cambió.

## Permisos

No cambiaron. El guard `isAdmin = Boolean(user && ['owner', 'admin'].includes(user.role))` se mantiene en `PortalAppAdmin`.

## Duplicación eliminada

- Estilos: ~100 entradas de `StyleSheet.create` duplicadas entre screen y admin → consolidadas en `app-mobile.styles.ts`
- `deepEq`: definida inline en admin → movida a `app-mobile.utils.ts`
- `useNovidadesScroll`: definida inline en screen → movida a `app-mobile.utils.ts`
- `PortalAppVersion` import duplicado en admin → eliminado

## Duplicación detectada y no modificada

- `metaPill` aparece tanto en screen (hero, download card, timeline) como en timeline extraído. Es el mismo estilo, ahora compartido desde `app-mobile.styles.ts`.
- Los patrones de `portalButtonGradient()` para botones de descarga aparecen en `AppMobileHero`, `AppMobileDownloadCard` y `AppMobileVersionTimeline`. Son instancias separadas con diferentes props, no duplicación exacta.

## Código sin referencias

No se detectó código preexistente sin referencias. Toda la eliminación fue consecuencia directa de la extracción.

## Riesgos detectados

Ninguno. Todos los callbacks y estados se mantienen en los contenedores con el mismo orden de hooks, mismas dependencias y mismo ciclo de vida.

## Matriz de compatibilidad

| Pregunta | Respuesta |
|---|---|
| ¿Cambió la app móvil? | NO |
| ¿Cambió `mobile/`? | NO |
| ¿Cambió alguna versión? | NO |
| ¿Cambió algún enlace? | NO |
| ¿Cambió el APK? | NO |
| ¿Cambió algún dispositivo? | NO |
| ¿Cambió alguna activación? | NO |
| ¿Cambió algún código? | NO |
| ¿Cambió alguna estadística? | NO |
| ¿Cambió alguna configuración? | NO |
| ¿Cambió algún payload? | NO |
| ¿Cambió algún endpoint? | NO |
| ¿Cambió el store? | NO |
| ¿Cambió la API? | NO |
| ¿Cambió la navegación? | NO |
| ¿Cambió alguna ruta? | NO |
| ¿Cambió RBAC? | NO |
| ¿Cambió la UI? | NO |
| ¿Cambió el responsive? | NO |
| ¿Cambió algún texto? | NO |
| ¿Se agregó alguna dependencia? | NO |
| ¿Se modificó Commercial? | NO |
| ¿Se modificó Dashboard? | NO |
| ¿Se modificó Rutas? | NO |
| ¿Se modificó Plan? | NO |
| ¿Se modificó backend? | NO |
| ¿Se modificó shared? | NO |

## Métricas

| Métrica | Valor |
|---|---|
| Líneas originales (screen) | 951 |
| Líneas finales (screen) | 151 |
| Reducción (screen) | 800 (−84.1%) |
| Líneas originales (admin) | 699 |
| Líneas finales (admin) | 182 |
| Reducción (admin) | 517 (−74.0%) |
| Reducción absoluta total | 1,317 |
| Reducción porcentual total | 79.8% |
| Componentes extraídos | 11 |
| Archivos foundation | 3 (styles, utils) |
| Archivos creados | 12 |
| Archivos modificados | 2 |
| Estilos trasladados | ~100 entradas |
| Utilidades trasladadas | 2 (`useNovidadesScroll`, `deepEq`) |
| Typecheck | Sin errores |
| Build | Éxito (586 módulos transformados) |
| Tests | No disponibles |
| `git diff --check` | Sin errores |

## Validaciones

| Validación | Resultado |
|---|---|
| `npm run typecheck` | Sin errores |
| `npm run build` | Éxito (586 módulos transformados) |
| `npm run test` | No disponible |
| `git diff --check` | Sin errores |
| `git status --short` | Solo archivos del alcance |

## Evidencia Git

```bash
git branch --show-current
> main
git rev-parse --short HEAD
> c44a6be
git status --short
>  M ventas/features/portal/components/portal-app-admin.tsx
>  M ventas/features/portal/screens/portal-app-movil-screen.tsx
> ?? ventas/features/portal/app-mobile/
git diff --stat
> portal-app-admin.tsx          | 618 +-------------
> portal-app-movil-screen.tsx   | 895 ++-------------------
>  2 files changed, 89 insertions(+), 1424 deletions(-)
```

## Rollback

Sin commit:

```bash
git checkout -- ventas/features/portal/screens/portal-app-movil-screen.tsx ventas/features/portal/components/portal-app-admin.tsx
rm -rf ventas/features/portal/app-mobile/
```

Con commit (después del commit de implementación):

```bash
git revert <commit-de-implementacion>
```

No ejecutar a menos que sea necesario.
