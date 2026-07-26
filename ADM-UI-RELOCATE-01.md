# ADM-UI-RELOCATE-01 — Relocate Admin Global UI to Standalone App

## Revisión

ADM-UI-RELOCATE-01-R1.0

## Objetivo

Separar el Admin Global UI del bundle de `ventas/` en una aplicación independiente `admin-global/`,
eliminando todas las rutas y código admin del bundle de Ventas.

## Commit base

| Concepto | Valor |
|---|---|
| HEAD | `d1f073f` fix(admin-ui): close platform authentication flow |
| Working tree | sucio (archivos backend sin commit de ADM-API-BASE-01) |

El árbol de trabajo tiene archivos backend sin commit de la fase ADM-API-BASE-01
(`backend/src/app.js` modificado, 5 archivos nuevos no trackeados en `backend/`,
y un nuevo archivo de prueba `platform-api-base/`).
No se modifican ni revierten; la reubicación solo toca frontend.

## Ubicación del módulo

`admin-global/features/auth/`

```
admin-global/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── .env.example
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── vite-env.d.ts
    ├── styles/
    │   ├── theme.ts
    │   └── globals.css
    ├── components/
    │   ├── router.tsx                   # Redirect, router, RouterProvider, Link, usePathname
    │   ├── keyboard-safe-scroll.tsx     # KeyboardSafeScrollView
    │   └── screen-error-boundary.tsx    # ScreenErrorBoundary
    └── features/
        └── auth/
            ├── api.ts                   # Cliente HTTP Platform (axios, baseURL /api/platform/auth)
            ├── store.ts                 # Zustand store (useAdminStore)
            ├── types.ts                 # Tipos compartidos
            ├── components/
            │   ├── auth-layout.tsx      # Shell visual para auth
            │   └── route-guard.tsx      # Guards: login, enroll, challenge, protected
            └── screens/
                ├── login-screen.tsx     # Login email/password
                ├── mfa-setup-screen.tsx # QR + TOTP + backup codes
                ├── mfa-verify-screen.tsx# TOTP verify + recovery
                └── placeholder-screen.tsx # Panel placeholder autenticado
```

## Stack

Mismo stack que Ventas:
- React 19.1, React Native Web 0.21.2, React DOM 19.1
- Vite 7.3, TypeScript ~5.8
- Zustand 5.x, Axios 1.x
- QRCode (generación cliente-side)
- Puerto de desarrollo: 5174 (Ventas usa 5173)
- Proxy `/api` → `localhost:4000`

## Rutas

| Ruta | Componente | Guard |
|---|---|---|
| `/admin/login` | AdminLoginScreen | — (redirige a login si autenticado) |
| `/admin/mfa/setup` | AdminMfaSetupScreen | — (redirige a login si no hay challenge) |
| `/admin/mfa` | AdminMfaVerifyScreen | — (redirige a login si no hay challenge) |
| `/admin` | AdminPlaceholderScreen | AdminProtectedRoute (en App.tsx) |

## Diferencias con el original en ventas/

1. **Sin dependencias de Ventas**: el código original importaba `@/src/navigation/router`, `@/constants/theme`,
   `@/src/components/keyboard-safe-layout`, `@/src/components/screen-error-boundary`,
   `react-native-safe-area-context`. Todas reemplazadas por implementaciones standalone en `admin-global/src/components/`.
2. **Router standalone**: `router.tsx` implementa `Redirect`, `RouterProvider`, `router.push`, `usePathname`, `Link`
   usando `history` y `react-native-web` en lugar de depender del router de Ventas.
3. **Theme standalone**: `theme.ts` define `Typography` y `palette` duplicando los tokens de Ventas.
4. **Puerto diferente**: 5174 para evitar conflicto con Ventas (5173).
5. **Storage keys**: `manecomb-platform-token`, `manecomb-platform-refresh-token`, `manecomb-platform-challenge`
   — idénticas a las originales, sin overlap con Ventas.
6. **Sin Portal**: el admin-global no incluye portal ni rutas de ventas.
7. **Sin prueba de API_URL vacío**: el build no exige `VITE_API_URL` (solo usa `API_PORT` para el proxy).

## Archivos eliminados de ventas/

Se eliminó `ventas/features/admin/` (12 archivos):
- `api.ts`, `store.ts`, `types.ts`
- `screens/admin-login-screen.tsx`, `screens/admin-mfa-setup-screen.tsx`,
  `screens/admin-mfa-verify-screen.tsx`, `screens/admin-placeholder-screen.tsx`
- `components/admin-auth-layout.tsx`, `components/admin-route-guard.tsx`
- `store/` (directorio vacío)

## Archivos modificados en ventas/

`ventas/src/App.tsx`:
- Eliminado import `AdminProtectedRoute` de `@/features/admin/components/admin-route-guard`
- Eliminados 4 lazy imports de admin screens
- Eliminados 4 case entries del switch de rutas (`/admin/login`, `/admin/mfa/setup`, `/admin/mfa`, `/admin`)

## Typecheck

```
# admin-global
npm run typecheck → 0 errors
npm run build → ✓ built in ~2s (9 chunks)

# ventas
npm run typecheck → 0 errors
npm run build → ✓ built in ~12s
```

## Contratos backend (no modificados)

| Endpoint | Método |
|---|---|
| `/api/platform/auth/login` | POST |
| `/api/platform/auth/refresh` | POST |
| `/api/platform/auth/session` | GET |
| `/api/platform/auth/logout` | POST |
| `/api/platform/auth/logout-all` | POST |
| `/api/platform/auth/mfa/setup` | POST |
| `/api/platform/auth/mfa/confirm` | POST |
| `/api/platform/auth/mfa/verify` | POST |
| `/api/platform/auth/mfa/recovery` | POST |

## Storage

| Clave | Ubicación | Contenido |
|---|---|---|
| `manecomb-platform-token` | localStorage | Access token JWT |
| `manecomb-platform-refresh-token` | localStorage | Refresh token JWT |
| `manecomb-platform-challenge` | sessionStorage | Challenge MFA |

Idéntico al original. Sin overlap con Ventas.

## Archivos nuevos

| Archivo | Propósito |
|---|---|
| `admin-global/package.json` | Dependencias y scripts |
| `admin-global/tsconfig.json` | TypeScript config |
| `admin-global/vite.config.ts` | Vite config con alias, proxy |
| `admin-global/index.html` | Entry HTML |
| `admin-global/.env.example` | Variables de entorno de ejemplo |
| `admin-global/src/main.tsx` | Entry point React |
| `admin-global/src/App.tsx` | Routes + App component con guards |
| `admin-global/src/vite-env.d.ts` | Vite types |
| `admin-global/src/styles/theme.ts` | Typography + palette tokens |
| `admin-global/src/styles/globals.css` | Reset CSS |
| `admin-global/src/components/router.tsx` | Redirect, RouterProvider, router, Link, usePathname |
| `admin-global/src/components/keyboard-safe-scroll.tsx` | KeyboardSafeScrollView |
| `admin-global/src/components/screen-error-boundary.tsx` | ScreenErrorBoundary |
| `admin-global/src/features/auth/api.ts` | Cliente HTTP Platform |
| `admin-global/src/features/auth/store.ts` | Zustand store |
| `admin-global/src/features/auth/types.ts` | Tipos compartidos |
| `admin-global/src/features/auth/components/auth-layout.tsx` | Auth layout shell |
| `admin-global/src/features/auth/components/route-guard.tsx` | Guards |
| `admin-global/src/features/auth/screens/login-screen.tsx` | Login screen |
| `admin-global/src/features/auth/screens/mfa-setup-screen.tsx` | MFA setup screen |
| `admin-global/src/features/auth/screens/mfa-verify-screen.tsx` | MFA verify screen |
| `admin-global/src/features/auth/screens/placeholder-screen.tsx` | Placeholder screen |

## Limitaciones

1. **No hay script de test** — el proyecto no tiene infraestructura de testing.
2. **Sin CI/CD** — no se configuró pipeline para admin-global.
3. **No se eliminaron referencias a `/admin/activation-keys` en ventas** — esas son llamadas API de Portal, no UI de admin-global.

## Veredicto

**CLOSED**

La reubicación se completó satisfactoriamente. admin-global/ compila y construye de forma independiente.
Ventas compila y construye sin el código admin. No se mantienen dos implementaciones activas.
