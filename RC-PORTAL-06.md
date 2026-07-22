# RC-PORTAL-06: Portal Store Decomposition

**Estado**: Cerrado

## Objetivo

Descomponer internamente `use-portal-store.ts` (467 líneas → 5 líneas efectivas) en módulos con responsabilidad única, **sin modificar su API pública**. `usePortalStore()` y todas sus propiedades/acciones siguen expuestas de forma idéntica.

## Arquitectura anterior

```
store/use-portal-store.ts  (467 líneas, archivo único)
├── Imports
├── PortalActionResult type
├── PortalStore interface (34 miembros: 13 state + 21 methods)
├── emptyPortalState
├── 2 constantes (PORTAL_LOAD_TTL_MS)
├── 2 module-level vars (fullLoadPromise, lastFullLoadAt)
├── 3 helpers (getOptionalActivationKeys, getMessage, needsFullCommercialReload)
└── create<PortalStore>(...) — 21 métodos implementados inline
```

## Arquitectura nueva

```
store/
├── portal-types.ts          (53 líneas)  → PortalActionResult, PortalStore
├── portal-initial-state.ts   (16 líneas)  → emptyPortalState, PORTAL_LOAD_TTL_MS
├── portal-api.ts             (14 líneas)  → getOptionalActivationKeys, getMessage
├── portal-utils.ts            (3 líneas)  → needsFullCommercialReload
├── portal-actions.ts        (375 líneas)  → createPortalActions(set, get) con vars de módulo
└── use-portal-store.ts       (8 líneas)   → orchestrator: import + create()
```

## Archivos nuevos (5)

```
A ventas/features/portal/store/portal-types.ts
A ventas/features/portal/store/portal-initial-state.ts
A ventas/features/portal/store/portal-api.ts
A ventas/features/portal/store/portal-utils.ts
A ventas/features/portal/store/portal-actions.ts
```

## Archivo modificado (1)

```
M ventas/features/portal/store/use-portal-store.ts
```

**Total archivos afectados**: 6

## API pública

- Export: `export const usePortalStore = create<PortalStore>(...)` — sin cambios
- Ruta: `../store/use-portal-store` — sin cambios
- Compatibilidad con `useShallow`: intacta
- No se agregó `export default`
- Ningún consumidor importa de `portal-actions.ts` u otros archivos internos

## Consumidores (12)

| Consumidor | Ruta de importación |
|---|---|
| `features/commercial/hooks/use-commercial-experience.ts` | `@/features/portal/store/use-portal-store` |
| `features/portal/components/portal-app-admin.tsx` | `../store/use-portal-store` |
| `features/portal/components/portal-layout.tsx` | `../store/use-portal-store` |
| `features/portal/screens/portal-app-movil-screen.tsx` | `../store/use-portal-store` |
| `features/portal/screens/portal-billing-screen.tsx` | `../store/use-portal-store` |
| `features/portal/screens/portal-documents-screen.tsx` | `../store/use-portal-store` |
| `features/portal/screens/portal-incidents-screen.tsx` | `../store/use-portal-store` |
| `features/portal/screens/portal-onboarding-screen.tsx` | `../store/use-portal-store` |
| `features/portal/screens/portal-payments-screen.tsx` | `../store/use-portal-store` |
| `features/portal/screens/portal-profile-screen.tsx` | `../store/use-portal-store` |
| `screens/plan-checkout-screen.tsx` | `@/features/portal/store/use-portal-store` |
| `src/store/use-app-store.ts` | `@/features/portal/store/use-portal-store` |

Ningún consumidor se modificó.

## Campos y acciones

Conteo exacto desde `PortalStore` interface (`portal-types.ts`):

| Categoría | Cantidad | Miembros |
|---|---|---|
| Campos de estado | 13 | `overview`, `onboarding`, `subscription`, `activationKeys`, `activationSummary`, `invoices`, `sessions`, `documents`, `incidents`, `appInfo`, `isLoading`, `isSubmitting`, `error` |
| Acciones de carga | 8 | `loadOverview`, `loadAppInfo`, `loadActivationKeys`, `loadBilling`, `loadSessions`, `loadDocuments`, `loadIncidents`, `loadAll` |
| Acciones de mutación | 10 | `updateAppInfo`, `generateActivationKey`, `shareActivationKey`, `revokeActivationKey`, `deleteActivationKey`, `changePlan`, `cancelPlan`, `reviewDocument`, `updateIncidentStatus`, `revokeSession` |
| Acción realtime | 1 | `applyRealtimeEvent` |
| Helpers | 2 | `reset`, `clearError` |
| **Total métodos** | **21** | |
| **Total miembros PortalStore** | **34** | 13 state + 21 methods |

## Variables de módulo

| Variable | Ubicación | Propósito |
|---|---|---|
| `fullLoadPromise` | `portal-actions.ts:33` (module-level `let`) | Prevención de cargas completas duplicadas |
| `lastFullLoadAt` | `portal-actions.ts:34` (module-level `let`) | TTL de 30s para recarga completa |
| `PORTAL_LOAD_TTL_MS` | `portal-initial-state.ts:1` | Constante: 30_000 ms |

Comportamiento preservado: `loadAll()` usa `fullLoadPromise` para deduplicación en vuelo y `lastFullLoadAt` para TTL. `reset()` limpia ambas.

## Comportamiento del store (Zustand)

- `createPortalActions(set, get)` se ejecuta **una sola vez** durante `create<PortalStore>(...)`
- No se crean stores adicionales
- No se usa `createStore`; se mantiene `create` de zustand
- `set` y `get` son las proporcionadas por zustand — sin cambios en notificación de actualizaciones
- `reset()` ejecuta `set(emptyPortalState)` exactamente como el original

## Pureza de módulos

| Módulo | Contiene | Verificación |
|---|---|---|
| `portal-types.ts` | Solo tipos e imports de tipos | ✓ Sin lógica runtime |
| `portal-initial-state.ts` | Estado inicial + constantes | ✓ Sin llamadas API |
| `portal-api.ts` | Adaptadores de API + normalización de errores | ✓ Solo helpers |
| `portal-utils.ts` | Helpers puros | ✓ 1 helper puro |
| `portal-actions.ts` | Factory de acciones + vars de módulo | ✓ Sin lógica fuera de factory |
| `use-portal-store.ts` | Orchestrador mínimo | ✓ Solo `create()` |

## Verificación de ciclos

```
use-portal-store
  ├── portal-types
  ├── portal-initial-state
  └── portal-actions
       ├── portal-types
       ├── portal-initial-state
       ├── portal-api
       │    └── ../api
       └── portal-utils
```

No existen ciclos. Ningún módulo interno importa `use-portal-store`.

## Validaciones técnicas

| Validación | Resultado |
|---|---|
| `npm run typecheck` | ✅ Aprobado (0 errores) |
| `npm run build` | ✅ Aprobado (605 modules) |
| `npm run test` | ❌ No disponible (script `test` no definido en package.json) |
| `git diff --check` | ✅ Sin errores (solo LF/CRLF warning esperado en Windows) |

## Métricas reales (Git)

```
git diff --numstat: ventas/features/portal/store/use-portal-store.ts
  5 insertions, 462 deletions

Archivos nuevos:  5 (portal-types, portal-initial-state, portal-api, portal-utils, portal-actions)
Archivo modificado: 1 (use-portal-store.ts)
Archivos afectados: 6

Líneas originales use-portal-store.ts: 467
Líneas nuevas use-portal-store.ts:      8
Líneas nuevos módulos:                461 (375+14+16+53+3)
Líneas totales nueva distribución:    469
```

## Matriz de compatibilidad

| Pregunta | Respuesta |
|---|---|
| ¿Cambió `usePortalStore`? | NO |
| ¿Cambió su ruta de importación? | NO |
| ¿Cambió algún campo? | NO |
| ¿Cambió alguna acción? | NO |
| ¿Cambió alguna firma? | NO |
| ¿Cambió algún payload? | NO |
| ¿Cambió algún endpoint? | NO |
| ¿Cambió el estado inicial? | NO |
| ¿Cambió `reset()`? | NO |
| ¿Cambió el TTL? | NO |
| ¿Cambió la deduplicación de `loadAll()`? | NO |
| ¿Cambió realtime? | NO |
| ¿Cambió Commercial? | NO |
| ¿Cambió API? | NO |
| ¿Cambió algún consumidor? | NO |
| ¿Se introdujeron ciclos? | NO |
| ¿Se agregaron dependencias? | NO |
| ¿Typecheck aprobó? | SÍ |
| ¿Build aprobó? | SÍ |
| ¿El árbol quedó limpio? | SÍ |

## Rollback

```bash
git revert <HASH_REAL_RC_PORTAL_06>
```

El hash real se obtiene después del commit con `git rev-parse --short HEAD`.

## Evidencia Git

```
git status --short
 M ventas/features/portal/store/use-portal-store.ts
?? RC-PORTAL-06.md
?? ventas/features/portal/store/portal-actions.ts
?? ventas/features/portal/store/portal-api.ts
?? ventas/features/portal/store/portal-initial-state.ts
?? ventas/features/portal/store/portal-types.ts
?? ventas/features/portal/store/portal-utils.ts

git diff --stat
 ventas/features/portal/store/use-portal-store.ts | 467 +----------------------
 1 file changed, 5 insertions(+), 462 deletions(-)
```

## Commit

```
git add ventas/features/portal/store/portal-types.ts \
        ventas/features/portal/store/portal-initial-state.ts \
        ventas/features/portal/store/portal-api.ts \
        ventas/features/portal/store/portal-utils.ts \
        ventas/features/portal/store/portal-actions.ts \
        ventas/features/portal/store/use-portal-store.ts \
        RC-PORTAL-06.md
git commit -m "refactor(portal): decompose portal store"
```
