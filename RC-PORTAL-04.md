# RC-PORTAL-04 — Modularización de Administración de la App Móvil

**Estado**: Cerrado

## Objetivo

Modularización estructural del módulo administrativo de la aplicación móvil dentro del Portal, extrayendo componentes presentacionales, estilos y utilidades de `portal-app-movil-screen.tsx` y `portal-app-admin.tsx`, conservando exactamente datos, lógica, UI, store, API, navegación, permisos, versiones, dispositivos, activaciones, estadísticas y configuración.

## Estado inicial

| Campo | Valor |
|---|---|
| Rama | `main` |
| Commit | `8b8e366` (RC-PORTAL-06) |
| Estado Git | Limpio |
| Líneas originales (screen) | 951 |
| Líneas originales (admin) | 699 |
| Total original | 1,650 |

## Arquitectura anterior

```
screens/portal-app-movil-screen.tsx  (951 líneas)
  └── Todo: layout, store, estados, efectos, JSX completo, estilos inline

components/portal-app-admin.tsx  (699 líneas)
  └── Todo: store, estados, efectos, callbacks, JSX completo, estilos inline
```

## Arquitectura final

```
PortalAppMovilScreen (151 líneas)
  └── Container: layout, store, efectos, tab state, QR, download
       ├── AppMobileHero — hero card + phone mockup
       ├── AppMobileTabBar — tabs (info/history/admin)
       ├── AppMobileInfoFacts — cards: versión, android, tamaño, fecha
       ├── AppMobileDownloadCard — QR + metadatos + botón
       ├── AppMobileReleaseNotes — notas de versión
       ├── AppMobileVersionTimeline — historial de versiones
       └── PortalAppAdmin (173 líneas)
            └── Container: form state, CRUD callbacks, dirty detection
                 ├── AppAdminAccessRestricted — guard visual
                 ├── AppAdminGeneralForm — campos principales
                 ├── AppAdminReleaseNotesEditor — notas CRUD
                 ├── AppAdminVersionHistoryEditor — versiones CRUD
                 ├── AppAdminDeviceStats — estadísticas dispositivos
                 ├── AppAdminSaveBar — barra guardado
                 └── ConfirmModal — confirmación guardado
```

## Responsabilidad de cada contenedor

| Contenedor | Conserva |
|---|---|
| `PortalAppMovilScreen` | `PortalLayout`, store (`usePortalStore`), loading/error/empty states, `activeTab`, `expandedVersions`, `qrSvg`, QR effect, `handleDownload`, `useNovidadesScroll` |
| `PortalAppAdmin` | RBAC (`isAdmin`), `form`, `noteInput`, `historyEditor`, `confirmVisible`, `saved`, `deviceStats`, `statsLoading`, 10 `useCallback` CRUD handlers, `dirty` memo, device stats fetch effect, form init effect |

## Archivos creados (14)

### Foundation (2)

| Archivo | Responsabilidad | Exports | Consumidores |
|---|---|---|---|
| `app-mobile/app-mobile.styles.ts` | Todos los estilos del módulo (~150 entradas StyleSheet) | `styles` | Todos los componentes + contenedores |
| `app-mobile/app-mobile.utils.ts` | Hook `useNovidadesScroll` + `deepEq` | `useNovidadesScroll`, `deepEq` | Screen, Admin |

### Componentes — Screen (6)

| Componente | Responsabilidad | Props |
|---|---|---|
| `AppMobileHero` | Hero card: logo, título, badge, botón descarga, botón novedades, phone mockup | `compact`, `appName`, `appStatus`, `appVersion`, `onDownload`, `onNovidades` |
| `AppMobileTabBar` | Tabs: Información/Historial/Administración | `activeTab: TabKey`, `onTabChange` |
| `AppMobileInfoFacts` | 4 cards informativos en fila | `facts: { icon, label, value }[]` |
| `AppMobileDownloadCard` | Card descarga: QR, metadatos, botón grande | `compact`, `qrSvg`, `androidMin`, `size`, `version`, `onDownload` |
| `AppMobileReleaseNotes` | Sección "Qué incluye esta versión" (forwardRef) | `ref`, `version`, `notes` |
| `AppMobileVersionTimeline` | Timeline versiones con items expandibles | `versions`, `expandedVersions`, `onToggleVersion`, `onDownload`, `compact` |

### Componentes — Admin (7)

| Componente | Responsabilidad | Props |
|---|---|---|
| `AppAdminAccessRestricted` | Guard visual: icono candado + texto "Acceso restringido" | ninguna |
| `AppAdminGeneralForm` | Formulario: versión, estado, android min, tamaño, fecha, APK URL | `form`, `onFieldChange` |
| `AppAdminReleaseNotesEditor` | Editor CRUD de notas de publicación | `noteInput`, `notes`, `onNoteInputChange`, `onAddNote`, `onEditNote`, `onRemoveNote` |
| `AppAdminVersionHistoryEditor` | Editor CRUD de historial de versiones (6 acciones) | `versions`, `onAddVersion`, `onUpdateVersion`, `onRemoveVersion`, `onToggleArchived`, `onMarkCurrent` |
| `AppAdminDeviceStats` | Estadísticas de dispositivos (total, versión, publicación, versiones) | `stats: DeviceVersionStats \| null`, `loading` |
| `AppAdminSaveBar` | Barra guardado con dirty/saved/isSubmitting | `dirty`, `saved`, `isSubmitting`, `onSave` |

## Pureza de componentes

Ningún componente presentacional importa store, API o router. Todos reciben datos y callbacks mediante props.

| Componente | `usePortalStore` | `useAppStore` | `axios/fetch` | `router` | Permisos |
|---|---|---|---|---|---|
| `AppMobileHero` | NO | NO | NO | NO | recibe flags |
| `AppMobileTabBar` | NO | NO | NO | NO | recibe flags |
| `AppMobileInfoFacts` | NO | NO | NO | NO | recibe flags |
| `AppMobileDownloadCard` | NO | NO | NO | NO | recibe flags |
| `AppMobileReleaseNotes` | NO | NO | NO | NO | recibe flags |
| `AppMobileVersionTimeline` | NO | NO | NO | NO | recibe flags |
| `AppAdminAccessRestricted` | NO | NO | NO | NO | NO |
| `AppAdminGeneralForm` | NO | NO | NO | NO | recibe flags |
| `AppAdminReleaseNotesEditor` | NO | NO | NO | NO | recibe flags |
| `AppAdminVersionHistoryEditor` | NO | NO | NO | NO | recibe flags |
| `AppAdminDeviceStats` | NO | NO | NO | NO | recibe flags |
| `AppAdminSaveBar` | NO | NO | NO | NO | recibe flags |

## Pureza de utilidades

| Archivo | Verificación | Resultado |
|---|---|---|
| `app-mobile.utils.ts` | Sin store, API, router, timers, localStorage | ✅ Puro |

## Estado conservado

- `PortalAppMovilScreen`: `qrSvg`, `expandedVersions`, `activeTab` (3 estados)
- `PortalAppAdmin`: `form`, `noteInput`, `historyEditor`, `confirmVisible`, `saved`, `deviceStats`, `statsLoading` (7 estados)

## Hooks conservados (orden exacto)

**PortalAppMovilScreen**:
1. `useWindowDimensions` → `compact`
2. `usePortalStore` (useShallow) → `appInfo`, `error`, `isLoading`, `loadAppInfo`
3. `useState` → `qrSvg`
4. `useState` → `expandedVersions`
5. `useState` → `activeTab`
6. `useNovidadesScroll` → `ref`, `scrollToNovidades`

**PortalAppAdmin**:
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
11. `useEffect` → form/historyEditor init
12. `useMemo` → `dirty`
13-22. `useCallback` → CRUD handlers (setField, addNote, removeNote, editNote, addVersion, updateVersion, removeVersion, toggleArchived, markCurrent, handleSave, handleSaveClick)

## Efectos conservados

- `PortalAppMovilScreen`: `useEffect` para `loadAppInfo` inicial, `useEffect` para QR generation
- `PortalAppAdmin`: `useEffect` para `getDeviceVersionStatsRequest`, `useEffect` para inicializar `form`/`historyEditor`

## Duplicación eliminada

- ~150 entradas de `StyleSheet.create` duplicadas entre screen y admin → consolidadas en `app-mobile.styles.ts`
- `deepEq` inline en admin → movida a `app-mobile.utils.ts`
- `useNovidadesScroll` inline en screen → movida a `app-mobile.utils.ts`
- `!isAdmin` block inline en admin → extraído a `AppAdminAccessRestricted`

## Código sin referencias

No se detectó código preexistente sin referencias. Toda la eliminación fue consecuencia directa de la extracción.

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
| ¿Componentes presentacionales importan store/API/router? | NO |
| ¿Se duplicó estado o lógica? | NO |
| ¿Typecheck aprobó? | SÍ |
| ¿Build aprobó? | SÍ |
| ¿Árbol limpio? | SÍ |

## Validaciones técnicas

| Validación | Resultado |
|---|---|
| `npm run typecheck` | ✅ Aprobado (0 errores) |
| `npm run build` | ✅ Aprobado (606 modules) |
| `npm run test` | ❌ No disponible (script `test` no definido) |
| `git diff --check` | ✅ Sin errores |

## Métricas finales

| Métrica | Valor |
|---|---|
| Líneas originales (screen) | 951 |
| Líneas finales (screen) | 151 |
| Reducción (screen) | 800 (−84.1%) |
| Líneas originales (admin) | 699 |
| Líneas finales (admin) | 173 |
| Reducción (admin) | 526 (−75.3%) |
| Reducción absoluta total | 1,326 |
| Reducción porcentual total | 80.4% |
| Componentes presentacionales | 12 |
| Archivos foundation | 2 (styles, utils) |
| Archivos creados | 14 |
| Archivos modificados | 2 |
| Commits involucrados | 2 |

## Rollback

```bash
git revert 633a6e3
git revert <HASH_ADDITIONAL_FIX>
```

Para revertir todo RC-PORTAL-04 en orden inverso (primero el fix, luego la implementación original):

```bash
git revert <HASH_ADDITIONAL_FIX>
git revert 633a6e3
```

No ejecutar a menos que sea necesario.
