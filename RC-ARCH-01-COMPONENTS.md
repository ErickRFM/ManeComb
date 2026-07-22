# RC-ARCH-01 — Components: Inventario y Tamaños (Ventas + Admin Portal)

> **Propósito:** Catalogar todos los componentes React del proyecto Ventas, clasificarlos por módulo y medir su tamaño.
> **Estado:** Solo auditoría. Sin modificaciones.

---

## Evidencia de la auditoría

| Dato | Valor |
|------|-------|
| Rama | `main` |
| Commit | `30a2052` |
| Fecha | 2026-07-21 |
| Modificaciones | Ninguna |
| Conteo verificado por | `Get-ChildItem -Recurse -File -Include "*.tsx","*.ts" \| Measure-Object` |
| Archivos excluidos | `node_modules/`, `dist/`, `build/`, logs, `package-lock.json`, `*.md`, `.*` |

---

## 1. Ranking de archivos más grandes — Ventas (Top 30)

| # | Archivo | Líneas | Módulo | Tipo |
|---|---------|--------|--------|------|
| 1 | `screens/sales-screen.tsx` | 3,179 | Ventas | Screen |
| 2 | `features/portal/screens/portal-dashboard-screen.tsx` | 2,260 | Portal Admin | Screen |
| 3 | `screens/plan-checkout-screen.tsx` | 1,278 | Ventas | Screen |
| 4 | `features/portal/screens/portal-routes-screen.tsx` | 1,120 | Portal Admin | Screen |
| 5 | `features/portal/screens/portal-plan-screen.tsx` | 1,044 | Portal Admin | Screen |
| 6 | `features/portal/screens/portal-app-movil-screen.tsx` | 951 | Portal Admin | Screen |
| 7 | `features/portal/screens/portal-onboarding-screen.tsx` | 926 | Portal Admin | Screen |
| 8 | `features/portal/components/operations-map.tsx` | 794 | Portal Admin | Component |
| 9 | `screens/sales-auth-screen.tsx` | 752 | Ventas | Screen |
| 10 | `features/portal/components/portal-app-admin.tsx` | 699 | Portal Admin | Component |
| 11 | `src/store/use-app-store.ts` | 656 | Core | Store |
| 12 | `features/portal/components/portal-layout.tsx` | 633 | Portal Admin | Layout |
| 13 | `src/types/app.ts` | 574 | Core | Types |
| 14 | `features/portal/screens/portal-units-screen.tsx` | 565 | Portal Admin | Screen |
| 15 | `features/portal/store/use-portal-store.ts` | 449 | Portal Admin | Store |
| 16 | `features/portal/screens/portal-users-screen.tsx` | 437 | Portal Admin | Screen |
| 17 | `features/portal/screens/portal-incidents-screen.tsx` | 402 | Portal Admin | Screen |
| 18 | `src/lib/api.ts` | 386 | Core | Service |
| 19 | `features/portal/screens/portal-profile-screen.tsx` | 356 | Portal Admin | Screen |
| 20 | `features/portal/screens/portal-documents-screen.tsx` | 329 | Portal Admin | Screen |
| 21 | `features/portal/components/portal-cards.tsx` | 322 | Portal Admin | Component |
| 22 | `features/commercial/services/commercial-engine.ts` | 272 | Commercial | Service |
| 23 | `features/commercial/types.ts` | 206 | Commercial | Types |
| 24 | `src/App.tsx` | 190 | Core | Entry point |
| 25 | `features/commercial/hooks/use-commercial-experience.ts` | 184 | Commercial | Hook |
| 26 | `features/commercial/hooks/use-checkout-experience.ts` | 168 | Commercial | Hook |
| 27 | `features/commercial/rules/subscription-validator.ts` | 165 | Commercial | Rule |
| 28 | `constants/theme.ts` | 164 | Core | Theme |
| 29 | `features/commercial/adapters/api-checkout-service-adapter.ts` | 139 | Commercial | Adapter |
| 30 | `features/portal/components/portal-button.tsx` | 135 | Portal Admin | Component |

---

## 2. Inventario completo de componentes .tsx — Ventas

### 2.1 Screens (17 pantallas)

| # | Archivo | Líneas | Módulo |
|---|---------|--------|--------|
| 1 | `screens/sales-screen.tsx` | 3,179 | Ventas (catálogo público) |
| 2 | `screens/plan-checkout-screen.tsx` | 1,278 | Ventas (checkout) |
| 3 | `screens/sales-auth-screen.tsx` | 752 | Ventas (login/registro) |
| 4 | `screens/password-reset-screen.tsx` | 96 | Ventas |
| 5 | `features/portal/screens/portal-dashboard-screen.tsx` | 2,260 | Portal Admin |
| 6 | `features/portal/screens/portal-routes-screen.tsx` | 1,120 | Portal Admin |
| 7 | `features/portal/screens/portal-plan-screen.tsx` | 1,044 | Portal Admin |
| 8 | `features/portal/screens/portal-app-movil-screen.tsx` | 951 | Portal Admin |
| 9 | `features/portal/screens/portal-onboarding-screen.tsx` | 926 | Portal Admin |
| 10 | `features/portal/screens/portal-units-screen.tsx` | 565 | Portal Admin |
| 11 | `features/portal/screens/portal-users-screen.tsx` | 437 | Portal Admin |
| 12 | `features/portal/screens/portal-incidents-screen.tsx` | 402 | Portal Admin |
| 13 | `features/portal/screens/portal-profile-screen.tsx` | 356 | Portal Admin |
| 14 | `features/portal/screens/portal-documents-screen.tsx` | 329 | Portal Admin |
| 15 | `features/portal/screens/portal-payments-screen.tsx` | 133 | Portal Admin |
| 16 | `features/portal/screens/portal-billing-screen.tsx` | 87 | Portal Admin |

**Total screens:** 17 | **Líneas:** 14,015

### 2.2 Componentes de portal (7)

| # | Archivo | Líneas | Función |
|---|---------|--------|---------|
| 1 | `features/portal/components/operations-map.tsx` | 794 | Mapa de monitoreo en vivo con Mapbox GL |
| 2 | `features/portal/components/portal-app-admin.tsx` | 699 | Panel de administración de app móvil |
| 3 | `features/portal/components/portal-layout.tsx` | 633 | Layout del portal con header, sidebar, contenido |
| 4 | `features/portal/components/portal-cards.tsx` | 322 | Tarjetas KPI del dashboard |
| 5 | `features/portal/components/portal-button.tsx` | 135 | Botón estilizado del portal |
| 6 | `features/portal/components/portal-data-list.tsx` | 94 | Lista genérica de datos |
| 7 | `features/portal/components/route-geometry-thumbnail.tsx` | 45 | Thumbnail de geometría de ruta |

**Total componentes portal:** 7 | **Líneas:** 2,722

### 2.3 Componentes de commercial (1)

| # | Archivo | Líneas | Función |
|---|---------|--------|---------|
| 1 | `features/commercial/components/commercial-activity-list.tsx` | 137 | Lista de actividad comercial (cambios de plan) |

### 2.4 Componentes UI compartidos (10 en `src/components/`)

| # | Archivo | Líneas | Función |
|---|---------|--------|---------|
| 1 | `src/components/ui/confirm-modal.tsx` | 115 | Modal de confirmación |
| 2 | `src/components/error-boundary.tsx` | 100 | Error boundary general |
| 3 | `src/components/screen-error-boundary.tsx` | 92 | Error boundary para screens |
| 4 | `src/components/brand-logo.tsx` | 71 | Logo ManeComb |
| 5 | `src/components/ui/toast.tsx` | 56 | Notificación toast |
| 6 | `src/components/app-card.tsx` | 56 | Card contenedor |
| 7 | `src/components/ui/empty-state.tsx` | 41 | Estado vacío |
| 8 | `src/components/ui/skeleton.tsx` | 39 | Esqueleto de carga |
| 9 | `src/components/ui/status-badge.tsx` | 36 | Badge de estado |
| 10 | `src/components/keyboard-safe-layout.tsx` | 24 | Layout seguro para teclado |

**Total componentes UI:** 10 | **Líneas:** 630

### 2.5 Polyfills nativos RN Web (4)

| # | Archivo | Líneas | Función |
|---|---------|--------|---------|
| 1 | `src/native/motion.ts` | 81 | Animaciones (shimmer, pulse, transitions) |
| 2 | `src/native/vector-icons.tsx` | 34 | Iconos MaterialCommunityIcons |
| 3 | `src/native/safe-area-context.tsx` | 26 | SafeAreaView stub |
| 4 | `src/native/svg.tsx` | 24 | SVG stub |
| 5 | `src/native/status-bar.tsx` | 3 | StatusBar stub |

**Total nativos:** 5 | **Líneas:** 168

---

## 3. Resumen de componentes por módulo

| Módulo | Screens | Componentes | Stores | Otros | Total archivos | Total líneas |
|--------|---------|-------------|--------|-------|---------------|-------------|
| **Ventas (screens/)** | 4 | 0 | 0 | 0 | 4 | 5,305 |
| **Portal Admin (features/portal/)** | 12 | 7 | 1 | 4 | 24 | 8,237 |
| **Commercial (features/commercial/)** | 0 | 1 | 0 | 7 | 12 | 1,475 |
| **Core (src/)** | 0 | 10 | 1 | 7 | 21 | 3,335 |
| **Constants** | 0 | 0 | 0 | 1 | 1 | 164 |
| **Total Ventas** | **16** | **18** | **2** | **19** | **62** | **18,516** |

---

## 4. Archivos con múltiples responsabilidades

Los siguientes archivos contienen lógica que abarca más de un área funcional dentro del mismo archivo:

| Archivo | Líneas | Responsabilidades identificadas |
|---------|--------|--------------------------------|
| `screens/sales-screen.tsx` | 3,179 | • Catálogo de planes con pricing<br>• FAQ interactivo<br>• Animaciones (pulse, shimmer)<br>• Healthcheck del backend<br>• Integración con checkout<br>• Paleta de colores neon inline |
| `features/portal/screens/portal-dashboard-screen.tsx` | 2,260 | • Mapa operativo en vivo<br>• Filtros de vehículos y conductores<br>• Replay de sesiones de ruta<br>• Métricas y eventos<br>• Checkpoints visits<br>• Posiciones históricas |
| `features/portal/components/portal-layout.tsx` | 633 | • Navegación lateral<br>• Header con breadcrumbs<br>• Menú responsivo mobile/desktop<br>• Integración con toast<br>• Animaciones de transición |
| `features/portal/components/portal-app-admin.tsx` | 699 | • Lista de versiones de app<br>• Editor de información de app<br>• Estadísticas de dispositivos<br>• Modal de confirmación |

---

## 5. Componentes que no se reutilizan fuera de su módulo

| Componente | Módulo | Se usa solo en |
|-----------|--------|----------------|
| `operations-map.tsx` | Portal Admin | `portal-dashboard-screen.tsx` |
| `portal-app-admin.tsx` | Portal Admin | `portal-app-movil-screen.tsx` |
| `portal-cards.tsx` | Portal Admin | `portal-dashboard-screen.tsx` |
| `portal-data-list.tsx` | Portal Admin | `portal-units-screen.tsx`, `portal-dashboard-screen.tsx` |
| `portal-button.tsx` | Portal Admin | Múltiples screens del portal |
| `route-geometry-thumbnail.tsx` | Portal Admin | `portal-routes-screen.tsx` |
| `commercial-activity-list.tsx` | Commercial | `portal-plan-screen.tsx` (desde portal) |

---

## 6. Componentes Mobile (solo referencia de integración)

El proyecto mobile tiene **56 archivos .tsx** con las siguientes screens principales. No se analizan en profundidad en esta RC:

| Screen mobile | Líneas | Integración con Ventas |
|--------------|--------|----------------------|
| `checklist-screen.tsx` | 2,827 | Ninguna |
| `radio-screen-view.tsx` | 1,970 | Ninguna |
| `customer-auth-screen.tsx` | 1,089 | Portal de ventas via deep link |
| `profile-edit-screen.tsx` | 868 | Ninguna |
| `AlertsScreen.tsx` | 797 | Ninguna |
| `map-screen.native.tsx` | 657 | Ninguna |
| `profile-screen.tsx` | 485 | Ninguna |
| `users-screen.tsx` | 272 | Ninguna |
| `mobile-account-gate-screen.tsx` | 266 | **Sí** — redirige a portal de ventas |
| `legal-screen.tsx` | 190 | Texto referenciando administrador |
