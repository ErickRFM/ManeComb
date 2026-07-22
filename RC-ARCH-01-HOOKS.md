# RC-ARCH-01 — Hooks: Inventario y Dependencias (Ventas + Admin Portal)

> **Propósito:** Catalogar todos los hooks React del proyecto Ventas, clasificarlos por módulo y analizar dependencias.
> **Estado:** Solo auditoría. Sin modificaciones.

---

## Evidencia de la auditoría

| Dato | Valor |
|------|-------|
| Rama | `main` |
| Commit | `30a2052` |
| Método | `Get-ChildItem -Recurse -Filter "*hook*"`, `Get-ChildItem -Recurse -Filter "*use-*"` |
| Archivos excluidos | `node_modules/`, `dist/`, `build/`, logs, `*.md`, `.*` |

---

## 1. Hooks de Ventas (excluyendo tests)

Se encontraron **4 hooks personalizados** en el proyecto Ventas:

### 1.1 `features/commercial/hooks/use-commercial-experience.ts`

| Propiedad | Valor |
|-----------|-------|
| Archivo | `features/commercial/hooks/use-commercial-experience.ts` |
| Líneas | 184 |
| Return | `{ categories, groupedByLocation, isLoading, error, commercialState, planFeatureList }` |
| Consume | `useAppStore(state => ...)` para `categories`, `groupedByLocation`, `isLoading`, `error`, `commercialState` |
| Dependencias externas | `useMemo` |
| Responsabilidad | Selector memoizado del estado comercial desde `useAppStore`. Expone datos de planes, categorías y estado de suscripción. |

### 1.2 `features/commercial/hooks/use-checkout-experience.ts`

| Propiedad | Valor |
|-----------|-------|
| Archivo | `features/commercial/hooks/use-checkout-experience.ts` |
| Líneas | 168 |
| Return | `{ selectedPlan, isLoading, checkoutState, billingInfo, handleSelectPlan, handleConfirmCheckout }` |
| Consume | `useAppStore` para acciones de checkout (`selectPlan`, `setCheckoutLoading`, `setCheckoutError`, `confirmCheckout`); `useRouter` para navegación post-checkout |
| Dependencias externas | `useCallback`, `useRouter()` |
| Responsabilidad | Orquesta el proceso de checkout: selección de plan, validación (local + API), y redirección post-pago. |

### 1.3 `features/portal/hooks/` — No existe

El directorio `features/portal/hooks/` **no existe**. Los hooks de portal no están extraídos a una carpeta separada.

### 1.4 Hooks de ruteo (no personalizados, embebidos)

| Hook | Fuente | Archivo | Uso |
|------|--------|---------|-----|
| `usePathname()` | Router custom | `src/navigation/router.tsx` | Suscripción a `window.location.pathname` vía `useSyncExternalStore` |
| `useLocalSearchParams<T>()` | Router custom | `src/navigation/router.tsx` | Parseo de query string vía `URLSearchParams` |

**Nota:** `usePathname` y `useLocalSearchParams` se implementan como hooks dentro del router, pero no están en una carpeta `hooks/` sino en `src/navigation/router.tsx`. No se cuentan como hooks extraíbles porque forman parte integral del router.

### 1.5 No hay hooks en `src/hooks/`

El directorio `src/hooks/` **no existe**. No hay hooks compartidos a nivel global.

---

## 2. Hooks de Mobile (solo referencia)

El proyecto mobile tiene hooks en `mobile/src/hooks/`. No se auditan en profundidad, solo se listan como contexto:

| Hook | Archivo |
|------|---------|
| `usePosition` | `mobile/src/hooks/use-position.ts` |
| `useSync` | `mobile/src/hooks/use-sync.ts` |
| `useWorkDays` | `mobile/src/hooks/use-work-days.ts` |
| `useRouteState` | `mobile/src/hooks/use-route-state.ts` |
| `useLocationPermission` | `mobile/src/hooks/use-location-permission.ts` |
| `useMultiPosition` | `mobile/src/hooks/use-multi-position.ts` |
| `useUnits` | `mobile/src/hooks/use-units.ts` |
| `useAppInitialization` | `mobile/src/hooks/use-app-initialization.ts` |
| `usePermissionsManager` | `mobile/src/hooks/use-permissions-manager.ts` |
| `useOperatorShift` | `mobile/src/app/use-operator-shift.ts` |
| `useOperatorSheet` | `mobile/src/app/use-operator-sheet.ts` |
| `useIncidentMapper` | `mobile/src/app/use-incident-mapper.ts` |
| `useNavigationReporting` | `mobile/src/app/use-navigation-reporting.ts` |
| `useAlertsTabVisibility` | `mobile/src/hooks/use-alerts-tab-visibility.ts` |
| `useDebounce` | `mobile/src/hooks/use-debounce.ts` |
| `useBottomGap` | `mobile/src/hooks/use-bottom-gap.ts` |
| `usePermission` | `mobile/src/hooks/use-permission.ts` |
| `useCameraPermission` | `mobile/src/hooks/use-camera-permission.ts` |
| `useTrackScreen` | `mobile/src/hooks/use-track-screen.ts` |
| `useForceUpdate` | `mobile/src/hooks/use-force-update.ts` |
| `useLastDriverStatus` | `mobile/src/hooks/use-last-driver-status.ts` |

**Nota:** No hay hooks compartidos entre mobile y ventas. Ambos proyectos son independientes.

---

## 3. Dependencias de hooks

```
use-commercial-experience.ts
  ├── useAppStore (src/store/use-app-store.ts)
  └── useMemo (React)

use-checkout-experience.ts
  ├── useAppStore (src/store/use-app-store.ts)
  ├── useCallback (React)
  └── useRouter (src/navigation/router.tsx)
```

No hay dependencias entre hooks del mismo proyecto. Tampoco hay hooks que importen de `features/portal/` o viceversa.

---

## 4. Resumen

| Módulo | Hooks personalizados | Líneas totales |
|--------|---------------------|----------------|
| Commercial | 2 | 352 |
| Portal Admin | 0 | — |
| Core (router) | 2 (embebidos en router) | parte de router.tsx |
| **Total Ventas** | **4** | **352** |
