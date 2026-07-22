# RC-ARCH-01 — Stores: Estado Global (Ventas + Admin Portal)

> **Propósito:** Documentar los stores de estado global del proyecto Ventas, su estructura y dependencias.
> **Estado:** Solo auditoría. Sin modificaciones.

---

## Evidencia de la auditoría

| Dato | Valor |
|------|-------|
| Rama | `main` |
| Commit | `30a2052` |
| Método | Revisión manual de `src/store/` y `features/portal/store/` |
| Archivos excluidos | `node_modules/`, `dist/`, `build/`, logs, `*.md`, `.*`, tests |

---

## 1. `src/store/use-app-store.ts` (656 líneas) — Store principal de Ventas

### 1.1 Biblioteca

- **Zustand** v5.x con middleware `persist` (localStorage)

### 1.2 Slice de Sesión / Auth

| Estado | Tipo | Persiste |
|--------|------|----------|
| `session` | `Session \| null` | Sí (localStorage) |
| `user` | `User \| null` | Sí |
| `isAuthenticated` | `boolean` | Derivado (`session !== null`) |
| `agencies` | `Agency[]` | No |
| `selectedAgency` | `Agency \| null` | No |

| Acción | Efecto |
|--------|--------|
| `setSession(session, user)` | Guarda sesión y usuario |
| `initialize()` | Carga desde localStorage |

### 1.3 Slice Comercial (Planes y Catálogo)

| Estado | Tipo | Carga |
|--------|------|-------|
| `categories` | `PlanCategory[]` | Lazy (getPlans, getPlanCategories) |
| `groupedByLocation` | `GroupedPlan[]` | Derivado de categories |
| `planFeatureList` | `PlanFeature[]` | Lazy |
| `selectedPlan` | `Plan \| null` | Manual (selectPlan) |
| `isLoading` | `boolean` | Durante carga |
| `error` | `string \| null` | En fallo |

| Acción | Efecto |
|--------|--------|
| `loadPlans()` | Fetch de planes + plan categories + special plans |
| `selectPlan(plan)` | Setea selectedPlan |
| `clearPlans()` | Resetea estado comercial |

### 1.4 Slice de Portal (conexión con `use-portal-store`)

| Estado | Tipo |
|--------|------|
| `portal` | `PortalState` — estado delegado a `usePortalStore` |

**Nota:** `useAppStore` importa `usePortalStore` y expone su estado como sub-propiedad `portal`. Esto crea una dependencia unidireccional: Core → Portal. No hay dependencia inversa (Portal no importa Core).

### 1.5 Slice de Sistema

| Estado | Tipo |
|--------|------|
| `checkoutState` | `CheckoutState` |
| `sidebarState` | `boolean` (portal sidebar abierto/cerrado) |
| `osTemplate` | `string` (template de onboarding) |

---

## 2. `features/portal/store/use-portal-store.ts` (449 líneas) — Store del Portal Admin

### 2.1 Biblioteca

- **Zustand** v5.x sin middleware `persist` (no persiste en localStorage)

### 2.2 Slice de Dashboard

| Estado | Tipo |
|--------|------|
| `stats` | `DashboardStats \| null` |
| `alerts` | `Alert[]` |
| `drivers` | `Driver[]` |
| `vehicles` | `Vehicle[]` |
| `routes` | `Route[]` |
| `loading` | `boolean` |
| `error` | `string \| null` |

### 2.3 Slice de Incidents

| Estado | Tipo |
|--------|------|
| `incidents` | `Incident[]` |

### 2.4 Slice de Documentos

| Estado | Tipo |
|--------|------|
| `documents` | `Document[]` |

### 2.5 Slice de Unidades (Flota)

| Estado | Tipo |
|--------|------|
| `units` | `OperationalUnitSnapshot[]` (desde shared contract) |

### 2.6 Slice de Usuarios

| Estado | Tipo |
|--------|------|
| `users` | `User[]` |

### 2.7 Acciones principales

| Acción | Efecto |
|--------|--------|
| `refreshDashboard()` | Fetch stats + alerts + drivers + vehicles + routes |
| `refreshIncidents()` | Fetch incidents |
| `refreshDocuments()` | Fetch documents |
| `refreshUnits()` | Fetch units |
| `refreshUsers()` | Fetch users |
| `setLoading(v)` | Toggle loading |
| `setError(e)` | Setea error |

---

## 3. Dependencia entre stores

```
src/store/use-app-store.ts
  └── features/portal/store/use-portal-store.ts (importa y expone como `portal`)
       └── No importa use-app-store (dependencia unidireccional)
```

No hay dependencia circular entre stores. La dirección es: Core → Portal.

---

## 4. Stores de Mobile (solo referencia)

| Store | Archivo | Líneas | Middleware |
|-------|---------|--------|-----------|
| `root-store` | `mobile/store/root-store.ts` | 2,496 | persist (MMKV) |

Mobile tiene un store monolítico de 2,496 líneas que no tiene relación de código con los stores de Ventas.

---

## 5. Resumen

| Store | Módulo | Líneas | Persistencia | Estado |
|-------|--------|--------|-------------|--------|
| `use-app-store` | Core (src/) | 656 | localStorage (session, user) | En uso |
| `use-portal-store` | Portal Admin | 449 | Ninguna | En uso |
| **Total Ventas** | - | **1,105** | - | - |
