# RC-MOBILE-SOCKETAUTH-01 — Recuperación de autenticación del socket

> **Estado actual (2026-08-05):** restaurado y revalidado en el PR `#1` sobre el `main` vigente. El commit histórico `b9ee08b` mencionado anteriormente ya no existe en el repositorio y su implementación había desaparecido, aunque el documento permanecía. La restauración actual cubre el socket compartido usado por banner, presencia y Radio. **Pendiente de certificación en APK real.**

## Problema confirmado

El access token de REST podía renovarse mientras el socket compartido conservaba el token anterior. Cuando el backend devolvía `unauthorized`, Socket.IO podía dejar de reconectar y el estado terminaba fijado como `error`, mostrando “Servidor no disponible” aunque REST y las conversaciones siguieran cargando.

## Contrato restaurado

- Clasificación separada para errores de autenticación y errores de transporte.
- Refresh de token de una sola ejecución compartida (`single-flight`).
- Un solo reintento de autenticación por ciclo, evitando bucles infinitos.
- Reconstrucción limpia del socket mediante la nueva clave de sesión; no se recicla una instancia autenticada con credenciales viejas.
- Protección por epoch de sesión para que un refresh tardío no reviva una cuenta que ya cerró sesión.
- Estado explícito `unauthorized`.
- El banner muestra “Sesión expirada. Vuelve a iniciar sesión.” cuando corresponde.
- Los fallos temporales de red, rate limit o backend permanecen como reconexión, no como falsa expiración.
- La acción del banner de sesión expirada lleva a un inicio de sesión limpio.

## Archivos principales

- `mobile/src/store/root-store.ts`
- `mobile/src/utils/realtime-state.ts`
- `mobile/src/utils/realtime-state.test.ts`
- `mobile/src/components/connection-banner.tsx`

## Validación automatizada

- TypeScript mobile: aprobado.
- ESLint enfocado: aprobado.
- Suite completa mobile: aprobada.
- Pruebas de clasificación auth/transporte y representación de sesión expirada: aprobadas.

## Certificación física pendiente

1. Access token vencido y refresh válido: el socket debe recuperarse y el banner desaparecer sin reiniciar.
2. Access token y refresh vencidos: debe mostrarse “Sesión expirada”, nunca “Servidor no disponible”.
3. Backend realmente inaccesible: debe mostrarse reconexión o servidor no disponible según el transporte.
4. Radio debe volver a estado conectado después de renovar el token compartido.

## Límite conocido

El socket WebRTC propio de llamadas conserva un ciclo de vida separado. El timbrado foreground fue restaurado en `RC-MOBILE-CALL-RING-01`; una futura fase puede unificar también la renovación de credenciales de ese socket sin mezclarla con TURN o push en segundo plano.
