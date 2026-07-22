# RC-ARCH-01 — Overview: Arquitectura General

> **Propósito:** Comprender la organización, estructura y dependencias del proyecto ManeComb, con foco en Ventas y Admin.
> **Estado:** Solo auditoría. Sin modificaciones.

---

## Evidencia de la auditoría

| Dato | Valor |
|------|-------|
| Rama | `main` |
| Commit | `30a2052` |
| Fecha | 2026-07-21 |
| Modificaciones | Ninguna (solo documentos nuevos) |
| Estado Git pre-auditoría | Sin cambios sin committear |
| Comandos utilizados | `Get-ChildItem -Recurse`, `Select-String`, `Measure-Object`, `grep -rn` |
| Archivos excluidos | `node_modules/`, `dist/`, `.git/`, `build/`, logs, `package-lock.json` |

---

## 1. Estructura General del Proyecto

```
C:\proyectos\combis-app\
├── ventas/          → Web app Ventas + Portal Admin (Vite + React Native Web)
├── mobile/          → App React Native (integración mediante deep links)
├── backend/         → API Laravel (no auditado)
├── shared/          → Contrato compartido entre proyectos
│   └── operational-contract/
├── communication-service/ → Servicio de comunicación (no auditado)
├── desktop/         → Proyecto no analizado
├── infra/           → Infraestructura
├── docs/            → Documentación
└── scripts/         → Automatización
```

---

## 2. Proyecto `ventas/` — Alcance completo de la auditoría

### 2.1 Stack tecnológico

| Componente | Tecnología | Versión |
|-----------|-----------|---------|
| Runtime | Vite | 7.x |
| UI | React + React Native Web | 19.1.0 / 0.21 |
| Estado | Zustand | 5.x |
| HTTP | Axios | 1.x |
| Mapas | Mapbox GL JS | 2.15 |
| Tiempo real | Socket.IO Client | 4.x |
| Iconos | react-native-vector-icons | 10.x |

### 2.2 Estructura completa de carpetas

```
ventas/
├── screens/                    ← 4 pantallas principales (5,305 líneas)
│   ├── sales-screen.tsx           3179 líneas — Catálogo de planes
│   ├── plan-checkout-screen.tsx   1278 líneas — Checkout de pago
│   ├── sales-auth-screen.tsx      752 líneas  — Login/registro ventas
│   └── password-reset-screen.tsx  96 líneas   — Reset de contraseña
│
├── features/
│   ├── commercial/             ← Motor comercial (1,475 líneas en 12 archivos)
│   │   ├── hooks/
│   │   │   ├── use-commercial-experience.ts   184 líneas
│   │   │   └── use-checkout-experience.ts     168 líneas
│   │   ├── services/
│   │   │   ├── commercial-engine.ts           272 líneas
│   │   │   ├── checkout-validation.ts          37 líneas
│   │   │   ├── plans-cache.ts                  31 líneas
│   │   │   └── billing-download.ts              6 líneas
│   │   ├── adapters/
│   │   │   ├── api-checkout-service-adapter.ts 139 líneas
│   │   │   └── in-memory-commercial-adapters.ts 40 líneas
│   │   ├── rules/
│   │   │   └── subscription-validator.ts       165 líneas
│   │   ├── components/
│   │   │   └── commercial-activity-list.tsx    137 líneas
│   │   ├── types.ts                            206 líneas
│   │   ├── contracts.ts                         49 líneas
│   │   ├── subscription-state.ts               106 líneas
│   │   ├── create-commercial-service.ts         22 líneas
│   │   └── index.ts                              5 líneas
│   │
│   └── portal/                 ← Portal Admin (8,237 líneas en 24 archivos)
│       ├── screens/
│       │   ├── portal-dashboard-screen.tsx   2260 líneas — Dashboard en vivo
│       │   ├── portal-routes-screen.tsx      1120 líneas — Gestión de rutas
│       │   ├── portal-plan-screen.tsx        1044 líneas — Plan actual
│       │   ├── portal-app-movil-screen.tsx    951 líneas — App management
│       │   ├── portal-onboarding-screen.tsx   926 líneas — Onboarding
│       │   ├── portal-units-screen.tsx        565 líneas — Unidades/flota
│       │   ├── portal-users-screen.tsx        437 líneas — Usuarios
│       │   ├── portal-incidents-screen.tsx    402 líneas — Incidentes
│       │   ├── portal-profile-screen.tsx      356 líneas — Perfil
│       │   ├── portal-documents-screen.tsx    329 líneas — Documentos
│       │   ├── portal-payments-screen.tsx     133 líneas — Pagos
│       │   └── portal-billing-screen.tsx       87 líneas — Facturación
│       ├── components/
│       │   ├── operations-map.tsx             794 líneas — Mapa operativo
│       │   ├── portal-app-admin.tsx           699 líneas — Admin app
│       │   ├── portal-layout.tsx              633 líneas — Layout del portal
│       │   ├── portal-cards.tsx               322 líneas — Tarjetas KPI
│       │   ├── portal-button.tsx              135 líneas — Botón portal
│       │   ├── portal-data-list.tsx            94 líneas — Lista genérica
│       │   └── route-geometry-thumbnail.tsx    45 líneas — Thumbnail ruta
│       ├── store/
│       │   └── use-portal-store.ts            449 líneas
│       ├── api.ts                              29 líneas
│       ├── types.ts                            19 líneas
│       ├── portal-theme.ts                     64 líneas
│       └── utils/
│           ├── access.ts                       21 líneas
│           └── tracking.ts                      6 líneas
│
├── src/                        ← Capa base compartida (3,335 líneas en 29 archivos)
│   ├── api/
│   │   └── client.ts                            1 línea — Re-export de lib/api
│   ├── lib/
│   │   └── api.ts                             386 líneas — Cliente Axios central
│   ├── store/
│   │   └── use-app-store.ts                   656 líneas — Store principal
│   ├── navigation/
│   │   └── router.tsx                         129 líneas — Router personalizado
│   ├── types/
│   │   └── app.ts                             574 líneas — Tipos centrales
│   ├── components/
│   │   ├── ui/ (5 archivos)                  ~347 líneas — confirm-modal, toast, empty-state, skeleton, status-badge
│   │   ├── error-boundary.tsx                 100 líneas
│   │   ├── screen-error-boundary.tsx           92 líneas
│   │   ├── brand-logo.tsx                      71 líneas
│   │   ├── app-card.tsx                        56 líneas
│   │   └── keyboard-safe-layout.tsx            24 líneas
│   ├── native/ (5 archivos)                  ~168 líneas — Polyfills RN Web (vector-icons, safe-area, svg, etc.)
│   ├── utils/
│   │   ├── format.ts                           59 líneas
│   │   ├── checkout-context.ts                 53 líneas
│   │   └── account-routing.ts                   7 líneas
│   └── App.tsx                                190 líneas — Entry point
│
└── constants/
    └── theme.ts                                164 líneas — Design system
```

### 2.3 Estadísticas de Ventas

| Métrica | Valor |
|---------|-------|
| Archivos .tsx | 39 |
| Archivos .ts (no test) | 22 |
| Archivos fuente total | ~70 |
| Líneas totales (source) | ~19,500 |
| Directorios | 29 |
| Archivo más grande | `screens/sales-screen.tsx` (3,179 líneas) |
| Store más grande | `src/store/use-app-store.ts` (656 líneas) |

---

## 3. Proyecto `mobile/` — Solo como contexto de integración

### 3.1 Puntos de integración con Ventas

| Punto | Dirección | Mecanismo | Archivo |
|-------|-----------|-----------|---------|
| Deep links a Ventas | Mobile → Ventas (navegador) | URLs `/ventas/*` en linking | `mobile/src/navigation/linking.ts` |
| Sales Portal URL | Mobile → Ventas (navegador) | `openSalesPortal(reason)` | `mobile/src/utils/sales-portal.ts` |
| API compartida | Ambos → Backend Laravel | Mismo backend en `https://manecomb.onrender.com/api` | `api/client.ts` (mobile) vs `src/lib/api.ts` (ventas) |
| Tipos compartidos | Ambos ← `shared/` | `@shared/operational-contract` | `shared/operational-contract/` |
| Acceso a portal | Mobile redirige a ventas | `mobile-account-gate-screen` → web | `mobile/src/screens/mobile-account-gate-screen.tsx` |

### 3.2 NO hay dependencia de código entre mobile y ventas

**Evidencia:** Búsqueda de imports cruzados entre proyectos resultó **0 resultados**.
- `grep -r "mobile" --include="*.ts" --include="*.tsx" ventas/src` (excluyendo node_modules) — solo referencias textuales en nombres de variables CSS
- `grep -r "ventas" --include="*.ts" --include="*.tsx" mobile/src` — solo deep links y `sales-portal.ts` como puente URL

---

## 4. Flujo de Navegación — Ventas

### 4.1 Router

| Aspecto | Descripción |
|---------|-------------|
| **Tipo** | Router custom sin dependencias externas |
| **Archivo** | `src/navigation/router.tsx` (129 líneas) |
| **Mecanismo** | `window.history.pushState` + `popstate` + `useSyncExternalStore` |
| **Provider** | `RouterProvider` en `src/App.tsx` |
| **Hooks** | `usePathname()`, `useLocalSearchParams<T>()` |
| **Componentes** | `router.push()`, `router.replace()`, `router.back()`, `Redirect`, `Link` |

### 4.2 Mapa de rutas

```
/ o /ventas                              → SalesScreen (catálogo de planes)
/login o /ventas/login                   → SalesAuthScreen (modo login)
/registro o /ventas/registro              → SalesAuthScreen (modo register)
/reset-password                          → PasswordResetScreen
/ventas/pago                             → PlanCheckoutScreen

/portal                                  → PortalDashboardScreen (dashboard operativo)
/portal/usuarios                         → PortalUsersScreen (gestión de usuarios)
/portal/unidades                         → PortalUnitsScreen (gestión de flota)
/portal/rutas                            → PortalRoutesScreen (gestión de rutas)
/portal/plan                             → PortalPlanScreen (plan y facturación)
/portal/facturacion                      → PortalBillingScreen
/portal/pagos                            → PortalPaymentsScreen
/portal/perfil                           → PortalProfileScreen
/portal/onboarding                       → PortalOnboardingScreen
/portal/documentos                       → PortalDocumentsScreen
/portal/incidencias                      → PortalIncidentsScreen
/portal/app-movil                        → PortalAppMovilScreen

/terminos, /privacidad                   → StaticPage (leyes)
/ mapa, /radio                           → OperationalPlaceholder (stub)
default                                  → StaticPage (404)
```

### 4.3 Guards y permisos

| Ruta | Permiso requerido | Archivo de control |
|------|-------------------|-------------------|
| `/portal/*` | `hasPortalPermission()` | `src/App.tsx:66-86` |
| `/portal/usuarios` | `portal:users` | `features/portal/utils/access.ts` |
| `/portal/unidades` | `portal:units` | `features/portal/utils/access.ts` |
| `/portal/rutas` | `portal:routes` | `features/portal/utils/access.ts` |
| `/portal/plan` | `portal:plan` | `features/portal/utils/access.ts` |
| `/portal/documentos` | `portal:documents` | `features/portal/utils/access.ts` |
| `/portal/incidencias` | `portal:incidents` | `features/portal/utils/access.ts` |
| `/portal/app-movil` | `portal:app` | `features/portal/utils/access.ts` |
| `/portal/facturacion` | `portal:billing` | `features/portal/utils/access.ts` |
| `/portal/pagos` | `portal:payments` | `features/portal/utils/access.ts` |
| `/portal/perfil` | `portal:profile` | `features/portal/utils/access.ts` |

### 4.4 Layouts

| Layout | Archivo | Uso |
|--------|---------|-----|
| `PortalLayout` | `features/portal/components/portal-layout.tsx` (633 líneas) | Envuelve todas las pantallas del portal admin |
| No hay layout para screens de ventas | — | Las screens de ventas (sales-screen, sales-auth, plan-checkout) no usan layout compartido |

### 4.5 Providers

| Provider | Archivo | Ofrece |
|----------|---------|--------|
| `RouterProvider` | `src/navigation/router.tsx:112` | Contexto de ruteo (pathname, search, key) |
| `Suspense` | `src/App.tsx:142` | Carga perezosa de todas las screens |
| No hay ThemeProvider | — | El tema se importa directamente desde `constants/theme.ts` |

---

## 5. Flujo de Datos — Ventas

```
App.tsx (inicializa → useAppStore.initialize())
  │
  ├── Rutas: decide qué screen mostrar según usePathname()
  │
  ├── Screens de Ventas:
  │   ├── sales-screen → useAppStore → src/lib/api.ts → Backend
  │   │               → useCommercialExperience (commercial engine)
  │   │               → buildCheckoutParams → localStorage (checkout-context)
  │   │
  │   ├── sales-auth-screen → useAppStore → src/lib/api.ts → Backend
  │   │                     → useRouter (redirects)
  │   │
  │   └── plan-checkout-screen → useCheckoutExperience → commercial-engine → API
  │                            → usePortalStore (estado del portal opcional)
  │
  └── Screens del Portal:
      └── PortalLayout
          ├── portal-dashboard-screen → useAppStore → api → Backend
          │                           → OperationsMap (Mapbox GL)
          │                           → OperationalUnitSnapshot (shared contract)
          │
          ├── portal-routes-screen → useAppStore → api → Backend (CRUD rutas)
          │
          └── (resto de screens) → useAppStore → api → Backend
```

### 5.1 Dependencias entre módulos de Ventas

```
screens/*  ──→  features/commercial/*   (sales-screen, plan-checkout)
screens/*  ──→  features/portal/*       (N/A — screens no importan portal)
screens/*  ──→  src/store/use-app-store
screens/*  ──→  src/navigation/router
screens/*  ──→  constants/theme
screens/*  ──→  src/components/*
screens/*  ──→  src/native/*

features/commercial/*  ──→  src/store/use-app-store  (use-commercial-experience)
features/commercial/*  ──→  src/lib/api.ts           (commercial-engine)
features/commercial/*  ──→  src/types/app.ts
features/commercial/*  ──→  constants/theme
features/commercial/*  ──→  @shared/operational-contract  (N/A — no importa)
features/commercial/*  ──→  features/portal/*             (N/A — no importa)

features/portal/*  ──→  src/store/use-app-store
features/portal/*  ──→  src/lib/api.ts        (a través de features/portal/api.ts)
features/portal/*  ──→  src/types/app.ts      (a través de features/portal/types.ts)
features/portal/*  ──→  constants/theme
features/portal/*  ──→  src/components/*
features/portal/*  ──→  src/native/*
features/portal/*  ──→  @shared/operational-contract  (portal-dashboard-screen)
features/portal/*  ──→  features/commercial/*         (portal-plan-screen importa CommercialActivityList)

src/store/use-app-store  ──→  src/lib/api.ts
src/store/use-app-store  ──→  src/types/app.ts
src/store/use-app-store  ──→  features/portal/store/use-portal-store
src/store/use-app-store  ──→  features/portal/utils/access
src/store/use-app-store  ──→  @shared/operational-contract
```

### 5.2 Dependencias circulares

**Método de verificación:** Se analizaron manualmente los imports de cada archivo de `screens/`, `features/`, y `src/`. No se encontraron ciclos. El flujo es unidireccional: `screens → features → src → (backend/shared)`. La única excepción es `src/store/use-app-store` que importa `features/portal/store/use-portal-store`, pero `use-portal-store` no re-importa `use-app-store`.

### 5.3 Integración con Shared

| Archivo en ventas | Importa de shared |
|-------------------|-------------------|
| `src/store/use-app-store.ts` | `OperationalUnitSnapshot` |
| `features/portal/screens/portal-dashboard-screen.tsx` | `OperationalUnitSnapshot` |

El contrato compartido `shared/operational-contract` exporta:
- **Tipos:** `OperationalUnitSnapshot`, `OperationalState`, `OperationalGps`, etc.
- **Selectores:** `formatEta()`, `formatFreshness()`, `stateColor()`, `sortByCriticality()`, etc.

---

## 6. Resumen de Responsabilidades

| Módulo | Responsabilidad | Archivos | Líneas |
|--------|----------------|----------|--------|
| **Screens (Ventas)** | Catálogo de planes, auth ventas, checkout | 4 | 5,305 |
| **Portal Admin** | Dashboard, rutas, unidades, usuarios, incidencias, documentos, plan, onboarding, pagos, app-movil | 24 | 8,237 |
| **Motor Comercial** | Lógica de planes, suscripciones, checkout, validación | 12 | 1,475 |
| **API Layer** | Cliente HTTP central, 30+ endpoints | 2 | 387 |
| **Store** | Estado global (auth, sesión, datos comerciales) | 2 | 1,105 |
| **Componentes UI** | Componentes compartidos (modal, card, logo, etc.) | 10 | ~600 |
| **Router** | Navegación custom basada en history API | 1 | 129 |
| **Tipos** | Definiciones de tipos centrales | 2 | 593 |
| **Utilidades** | Formateo, checkout context, account routing | 3 | 119 |
| **Native polyfills** | RN Web shims (vector-icons, safe-area, svg, motion) | 5 | 168 |
| **Design System** | Tema, colores, tipografía, espaciado | 1 | 164 |

---

## 7. Admin en Mobile (solo contexto)

El proyecto mobile NO tiene un módulo Admin separado. La funcionalidad administrativa se implementa mediante verificaciones de `role === 'admin' | 'supervisor' | 'owner'` dispersas en 11+ archivos:

| Archivo mobile | Línea | Verificación |
|---------------|-------|-------------|
| `store/root-store.ts` | ~500 | `user.role === 'admin'` para observabilidad |
| `screens/map/components/BottomTrackingPanel.tsx` | ~40 | `userRole === 'admin' \|\| userRole === 'supervisor'` |
| `screens/alerts/AlertsScreen.tsx` | ~200 | `user?.role === 'admin'` para resolver incidentes |
| `navigation/route-registry.ts` | 4,8 | `DIRECTORY_ALLOWED_ROLES`, `CONTROL_ALLOWED_ROLES` |
| `screens/users-screen.tsx` | ~50 | `role === 'admin'` → tono danger |
| `utils/format.ts` | ~30 | Rol formateado como "Administrador" |
| `screens/map-screen.native.tsx` | ~200 | Admin puede ver controles adicionales |

El portal admin completo vive en `ventas/features/portal/`.
