# RC-PORTAL-04 — Modularización de Administración de la App Móvil

**Estado:** Cerrado

**Base del cierre final:** `8b8e366`

**Extracción inicial:** `633a6e3`

**Cierre final:** `69d2029`

**Commit restaurador:** `e4f597f`

## Objetivo

Modularizar internamente la administración de la App Móvil dentro del Portal, trasladando JSX presentacional, estilos y helpers privados desde los dos contenedores originales, sin cambiar UI, datos, store, API, navegación, RBAC, versiones, APK, enlaces, estadísticas, payloads ni comportamiento.

## Historial verificado

| Commit | Clasificación | Archivos |
|---|---|---:|
| `633a6e3` | Extracción inicial | 14 creados y 2 modificados |
| `69d2029` | Cierre final | 1 creado y 2 modificados |
| `30b3976` | Incidente: revert accidental de `69d2029` | 1 eliminado y 2 modificados |
| `e4f597f` | Restauración mediante revert del revert | 1 recreado y 2 modificados |

### Archivos de `633a6e3`

- Creados: `RC-PORTAL-04.md`, los 2 archivos foundation y 11 componentes iniciales.
- Modificados: `portal-app-movil-screen.tsx` y `portal-app-admin.tsx`.

### Archivos de `69d2029`

- Creado: `app-admin-access-restricted.tsx`.
- Modificados: `RC-PORTAL-04.md` y `portal-app-admin.tsx`.

### Totales acumulados de la implementación

- 14 archivos fuente nuevos dentro de `app-mobile/`: 12 componentes y 2 foundation.
- 1 reporte nuevo: `RC-PORTAL-04.md`.
- 2 contenedores existentes modificados.
- 17 rutas distintas involucradas en la implementación y su documentación.

## Recuperación del estado final

- `30b3976` revirtió accidentalmente el commit final `69d2029`.
- Después se inició accidentalmente un revert de `633a6e3`; esa operación fue abortada con `git revert --abort`, sin resolver conflictos manualmente.
- El contenido final se restauró mediante `git revert --no-edit 30b3976`.
- El commit restaurador resultante es `e4f597f`.
- No se utilizó `reset`, `cherry-pick`, `commit --amend` ni `rebase`.
- `.claude/settings.local.json` permanece local y se excluyó únicamente mediante `.git/info/exclude`.

`30b3976` se clasifica como incidente de historial, no como parte funcional de RC-PORTAL-04.

## Arquitectura final

```text
PortalAppMovilScreen
├── AppMobileHero
├── AppMobileTabBar
├── AppMobileInfoFacts
├── AppMobileDownloadCard
├── AppMobileReleaseNotes
├── AppMobileVersionTimeline
└── PortalAppAdmin
    ├── AppAdminAccessRestricted
    ├── AppAdminGeneralForm
    ├── AppAdminReleaseNotesEditor
    ├── AppAdminVersionHistoryEditor
    ├── AppAdminDeviceStats
    ├── AppAdminSaveBar
    └── ConfirmModal existente
```

## Archivos foundation (2)

| Archivo | Clasificación comprobada |
|---|---|
| `app-mobile.styles.ts` | StyleSheet privado compartido por los contenedores y componentes del módulo |
| `app-mobile.utils.ts` | Helpers y hooks locales del módulo |

`app-mobile.utils.ts` no es una utilidad completamente pura:

- `deepEq`: helper puro y determinista basado en serialización JSON.
- `useNovidadesScroll`: custom hook local de comportamiento visual y scroll; utiliza `useRef`, `useCallback`, `Platform` y APIs de scroll web.

## Componentes presentacionales (12)

### Screen (6)

| Componente | Consumidor | Estado o hooks propios |
|---|---|---|
| `AppMobileHero` | `PortalAppMovilScreen` | Ninguno |
| `AppMobileTabBar` | `PortalAppMovilScreen` | Ninguno |
| `AppMobileInfoFacts` | `PortalAppMovilScreen` | Ninguno |
| `AppMobileDownloadCard` | `PortalAppMovilScreen` | Ninguno |
| `AppMobileReleaseNotes` | `PortalAppMovilScreen` | Ninguno; conserva `forwardRef` |
| `AppMobileVersionTimeline` | `PortalAppMovilScreen` | Ninguno; el item interno no se exporta |

### Admin (6)

| Componente | Consumidor | Estado o hooks propios |
|---|---|---|
| `AppAdminAccessRestricted` | `PortalAppAdmin` | Ninguno |
| `AppAdminGeneralForm` | `PortalAppAdmin` | Ninguno |
| `AppAdminReleaseNotesEditor` | `PortalAppAdmin` | Ninguno |
| `AppAdminVersionHistoryEditor` | `PortalAppAdmin` | Ninguno |
| `AppAdminDeviceStats` | `PortalAppAdmin` | Ninguno |
| `AppAdminSaveBar` | `PortalAppAdmin` | Ninguno |

Todos los componentes tienen export, import y consumidor. Ninguno quedó duplicado o sin referencias. La clasificación comprobada es **presentacional sin acceso a infraestructura**: ninguno importa stores, API, router, persistencia, navegación o funciones administrativas.

## AppAdminAccessRestricted

- Representa únicamente el estado visual de acceso restringido.
- No consulta usuario, rol o permisos.
- No calcula `isAdmin`.
- No usa store, API o router.
- La decisión RBAC continúa en `PortalAppAdmin`:

```tsx
if (!isAdmin) {
  return <AppAdminAccessRestricted />;
}
```

## Responsabilidades conservadas

### PortalAppMovilScreen

Conserva `PortalLayout`, `usePortalStore`, `loadAppInfo`, loading, error, empty state, `activeTab`, `expandedVersions`, `qrSvg`, generación del QR, descarga, scroll a novedades, composición de tabs y render de `PortalAppAdmin`.

Orden real de hooks:

1. `useWindowDimensions`.
2. `usePortalStore` con `useShallow`.
3. `useState` para `qrSvg`.
4. `useState` para `expandedVersions`.
5. `useState` para `activeTab`.
6. `useNovidadesScroll`.
7. `useCallback` para `toggleVersionExpanded`.
8. `useEffect` para `loadAppInfo`.
9. `useEffect` para generar el QR.

### PortalAppAdmin

Conserva `useAppStore`, `usePortalStore`, cálculo de `isAdmin`, formulario, notas, historial, confirmación, `saved`, estadísticas, loading de estadísticas, inicialización, dirty detection, callbacks CRUD y guardado.

Orden real de hooks:

1. `useAppStore`.
2. `usePortalStore` con `useShallow`.
3. Siete `useState`: `form`, `noteInput`, `historyEditor`, `confirmVisible`, `saved`, `deviceStats`, `statsLoading`.
4. `useEffect` de estadísticas.
5. `useEffect` de inicialización.
6. `useMemo` de dirty detection.
7. Once `useCallback`: `setField`, `addNote`, `removeNote`, `editNote`, `addVersion`, `updateVersion`, `removeVersion`, `toggleArchived`, `markCurrent`, `handleSave` y `handleSaveClick`.

No se detectó duplicación de estado, permisos, formulario, historial, notas o estadísticas entre contenedores y componentes.

## Estilos

- `app-mobile.styles.ts` tiene 850 líneas físicas.
- Contiene un único `StyleSheet.create`.
- Define 130 claves únicas.
- Las 130 claves tienen consumidor.
- No existen claves duplicadas ni referencias a claves ausentes.
- Screen, Admin y los 12 componentes consumen el mismo StyleSheet.
- No contiene store, API ni constantes de negocio.
- No se detectó dependencia circular.

Redacción comprobada: los estilos inline de ambos contenedores fueron trasladados mecánicamente a un módulo compartido privado de `app-mobile`. No existe evidencia suficiente para afirmar que se eliminaron 150 estilos duplicados.

## Métricas verificadas

Los conteos se obtuvieron con el contenido del padre de `633a6e3` y los archivos actuales:

| Contenedor | Original | Actual | Reducción del contenedor |
|---|---:|---:|---:|
| `portal-app-movil-screen.tsx` | 971 | 166 | 805 líneas (82.9 %) |
| `portal-app-admin.tsx` | 737 | 198 | 539 líneas (73.1 %) |
| **Combinado** | **1,708** | **364** | **1,344 líneas (78.7 %)** |

Estas cifras describen la reducción de los dos contenedores, no una eliminación equivalente de código del módulo. El código correspondiente fue distribuido entre componentes, estilos y helpers privados.

## Integridad funcional

La comparación de commits, imports y consumidores no encontró cambios en:

- datos, versiones, APK o enlaces;
- orden de versiones o release notes;
- activaciones, estadísticas o payloads;
- store, API, servicios o endpoints;
- navegación o rutas;
- condición RBAC;
- dirty detection y confirmación de guardado;
- generación de QR y descarga;
- tabs, estado expandido, loading o empty state;
- textos visibles, breakpoints o `compact`;
- uso de `ConfirmModal`.

Los commits `633a6e3`, `69d2029` y `e4f597f` no modifican `mobile/`, `package.json` ni `package-lock.json`.

## Validaciones posteriores a la recuperación

| Validación | Resultado |
|---|---|
| `npm run typecheck` | Aprobado, 0 errores |
| `npm run build` | Aprobado, 606 módulos transformados |
| `npm run test` | No disponible: el script `test` no está definido en `ventas/package.json` |
| `git diff --check` antes de editar el reporte | Aprobado |
| Estado previo a la auditoría documental | Limpio |
| `.claude/settings.local.json` | Local, no rastreado y excluido solo mediante `.git/info/exclude` |

## Auditoría de congruencia posterior

- Commits de implementación y recuperación verificados mediante `git show`.
- 12 componentes confirmados: 6 de Screen y 6 de Admin.
- 2 archivos foundation confirmados.
- Todos los componentes tienen consumidor y carecen de acceso a infraestructura.
- `AppAdminAccessRestricted` volvió a existir, está rastreado y conserva RBAC en el contenedor.
- Hooks, efectos, callbacks y estados permanecen en sus contenedores correspondientes.
- `deepEq` y `useNovidadesScroll` quedaron clasificados correctamente.
- Las métricas anteriores del reporte fueron corregidas con conteos reales.
- La afirmación de estilos duplicados fue sustituida por una descripción demostrable del traslado mecánico.
- No se detectaron imports rotos, exports públicos perdidos, componentes huérfanos ni dependencias circulares.
- No fue necesario modificar código fuente durante la auditoría.

## Rollback futuro

No ejecutar como parte de esta auditoría. Una vez creado el commit documental, el rollback completo debe realizarse en orden inverso:

```bash
git revert <HASH_COMMIT_AUDITORIA>
git revert e4f597f
git revert 633a6e3
```

`69d2029` y `30b3976` se neutralizan entre sí dentro del historial. El hash documental debe obtenerse con `git rev-parse --short HEAD` después de crear el commit; no puede incluirse dentro del mismo commit que identifica.

## Matriz final

| Pregunta | Respuesta |
|---|---|
| ¿Cambió la lógica durante la recuperación o auditoría? | NO |
| ¿Cambió la UI? | NO |
| ¿Cambió algún dato, versión, APK o enlace? | NO |
| ¿Cambió store, API, endpoint o payload? | NO |
| ¿Cambió navegación o RBAC? | NO |
| ¿Se modificó `mobile/`? | NO |
| ¿Se modificaron dependencias? | NO |
| ¿Los 12 componentes tienen consumidor? | SÍ |
| ¿Los componentes acceden a infraestructura? | NO |
| ¿Typecheck y build aprobaron? | SÍ |
