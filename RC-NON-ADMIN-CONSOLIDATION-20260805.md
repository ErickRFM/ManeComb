# Consolidación no-Admin — 2026-08-05

Integra sobre `main` únicamente el trabajo operativo pendiente y excluye por completo las ramas P2–P5 de Admin Global.

## Incluido

- PR #20: ownership serializado del foreground service de Radio y corrección del primer acceso.
- PR #24: leases GPS, invalidación de trabajos obsoletos, reemplazo seguro de socket y foreground service de llamadas latest-intent-wins.
- PR #23: transporte FCM HTTP v1, notificaciones Android de chat y llamadas, respuesta/rechazo controlados y rehidratación por `callId`.

## Resolución de integración

- se conservaron todas las suites actuales del Backend y se añadió `fcm-notifier.test.js`;
- se conservaron las pruebas de lifecycle GPS/llamadas y se añadieron las pruebas de push-intent/headless task;
- `CallOverlay` combina reactividad a reemplazo de socket, foreground service serializado y consumo idempotente de intents push;
- no se incluyó ningún commit de `feat/adm-global-p2-companies`, P3, P4 o P5.

## Límites externos

La integración de código no equivale a certificación física. Firebase real, `applicationId` definitivo, credenciales FCM, pruebas con proceso muerto/pantalla bloqueada y retest físico de Radio/GPS siguen siendo gates operativos antes de un release firmado.
