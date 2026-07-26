# ADM-UI-AUTH-01 — Frontend Admin Authentication & MFA UI

## Summary

Isolated admin authentication module inside `ventas/features/admin/` that consumes the Platform MFA backend endpoints (`/api/platform/auth/*`). Provides login, TOTP enrollment, TOTP verification, recovery codes, session restore, and a placeholder admin panel.

## Status

- **Backend** (ADM-SEC-MFA-01-R1.1): CLOSED — commits `146c8be`, `d0872ca`, `f95cb8b`
- **Frontend** (this task): COMPLETE — build & typecheck pass

## Files Created

### Module: `ventas/features/admin/`

| File | Purpose |
|---|---|
| `types.ts` | Shared types: `AdminUser`, `AdminLoginResponse`, `AdminMfaSetupResponse`, `AdminMfaVerifyResponse`, `AdminAuthMode`, etc. |
| `api.ts` | Isolated axios instance for `/api/platform/auth/*`. Exports `platformLoginRequest`, `platformRefreshRequest`, `platformSessionRequest`, `platformLogoutRequest`, `platformLogoutAllRequest`, `platformMfaSetupRequest`, `platformMfaConfirmRequest`, `platformMfaVerifyRequest`, `platformMfaRecoveryRequest`. |
| `store.ts` | Zustand store (`useAdminStore`). Manages auth mode FSM (`idle → login → loading → mfa_enrollment | mfa_challenge | authenticated`). Persists tokens to localStorage under `admin-platform-token` / `admin-platform-refresh-token` keys. |
| `components/admin-auth-layout.tsx` | Reusable shell with dark background, glow effects, brand header, scroll container. |
| `components/admin-route-guard.tsx` | Guards: `AdminProtectedRoute`, `AdminLoginGuard`, `AdminMfaEnrollGuard`, `AdminMfaChallengeGuard`. Bootstrap triggers on first mount. |
| `screens/admin-login-screen.tsx` | Email + password login form. Handles full-auth redirect, MFA enrollment redirect, MFA challenge redirect. |
| `screens/admin-mfa-setup-screen.tsx` | QR code display (via `qrcode` package), TOTP input, confirm step, backup codes display. |
| `screens/admin-mfa-verify-screen.tsx` | 6-digit TOTP input with recovery code fallback toggle. |
| `screens/admin-placeholder-screen.tsx` | Authenticated placeholder: user info card, MFA status, logout. |

### Modified

| File | Change |
|---|---|
| `ventas/src/App.tsx` | Added lazy imports for 4 admin screens, `AdminProtectedRoute` import, switch cases for `/admin/login`, `/admin/mfa/setup`, `/admin/mfa`, `/admin`. |

## Architecture

```
User hits /admin/*
  → Route guard bootstrap() → checks localStorage
      → session found → verify via GET /session → authenticated
      → no session → login mode
         → POST /login
            → full auth → store token → /admin
            → MFA + needs setup → /admin/mfa/setup
               → GET /mfa/setup → show QR
               → POST /mfa/confirm → show backup codes → redirect /admin/login
            → MFA + verify → /admin/mfa
               → POST /mfa/verify OR /mfa/recovery → store token → /admin
```

- Admin state is **fully isolated** from the main `useAppStore` (sales/portal).
- No PortalLayout, no `manecomb-ventas-token`, no `/api/auth/*` endpoints.
- UI uses `palette` / `Typography` from `constants/theme` but has its own layout and styles.
- All screens are lazy-loaded via `React.lazy`.
- The `qrcode` package (already in dependencies) generates QR data URLs on the client side.

## Verification

```bash
cd ventas
npm run typecheck   # ✓ no errors
npm run build       # ✓ builds with admin chunks
```

## Routes

| Path | Component | Guard |
|---|---|---|
| `/admin/login` | `AdminLoginScreen` | `AdminLoginGuard` |
| `/admin/mfa/setup` | `AdminMfaSetupScreen` | `AdminMfaEnrollGuard` |
| `/admin/mfa` | `AdminMfaVerifyScreen` | `AdminMfaChallengeGuard` |
| `/admin` | `AdminPlaceholderScreen` | `AdminProtectedRoute` |

## Next Steps

- Build out the admin dashboard UI at `/admin`
- Add admin users management (list, invite, disable, role change)
- Add system settings screens
- Add admin audit log viewer
