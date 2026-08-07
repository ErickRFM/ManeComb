# RC-MOBILE-STARTUP-STABILITY-01

## Base congelada

- Rama: `fix/mobile-startup-stability-20260806`
- Base: `main@1d30cb95391a8557bd21684d03d6c7f561cd71f4`
- Mobile observado: `1.2.0 (20)`

## Causa raíz confirmada

1. `/sync-error` mostraba `BrandSyncLoader` cuando `error` era nulo, aunque `refreshAll` no estuviera ejecutándose.
2. `/auth/me` en arranque tenía timeout de 75 segundos, pero el interceptor podía repetirlo dos veces.
3. `/auth/refresh` rotaba credenciales y estaba marcado como reintentable.
4. El fallback offline conservaba `cached.user` pero descartaba `cached.authContext`.
5. `Continuar sin ubicación` alteraba flags de autenticación desde un problema ajeno a GPS.
6. `signIn` esperaba cargas operativas opcionales antes de devolver control a navegación.
7. Una renovación realizada por el interceptor podía ser reemplazada por el access token anterior al terminar `initialize`.

## Corrección mínima

- El loader de sincronización solo aparece mientras `isRefreshing` es verdadero.
- El GET de sesión de arranque mantiene su timeout existente y no se repite de forma oculta.
- El refresh token rotatorio no se reintenta automáticamente.
- El caché conserva usuario, `authContext` y datos operativos.
- Una sesión renovada conserva siempre los tokens nuevos.
- Sin caché y sin servidor se usa la recuperación existente sin destruir la sesión persistida.
- Se eliminó el bypass de ubicación.
- Las cargas operativas se ejecutan en segundo plano después de establecer identidad y autoridad.

## Alcance no modificado

- GPS y servicio en segundo plano.
- Llamadas y WebRTC.
- Mapas y rutas.
- Pagos y planes.
- Contratos del backend.
- Diseño general.

## Gates

- `mobile npm run typecheck`
- `mobile npm run lint`
- `mobile npm test`
- `backend npm test`
- CI completa del PR
- APK release candidato
- Prueba física pendiente antes de merge

## Estado

- `STARTUP_ROOT_CAUSE_CONFIRMED`
- `NO_PASSIVE_SYNC_LOADER`
- `NO_REFRESH_TOKEN_REPLAY`
- `RENEWED_SESSION_PRESERVED`
- `CACHED_AUTHORITY_PRESERVED`
- `OPTIONAL_DATA_NOT_BOOT_BLOCKING`
- `APK_PHYSICAL_PASS=PENDING`
- `MERGE=NO`
